import { addMinutesHhmm, clsName, daysBetween, enumerateRecurrence, normalizeRecurrence, one, rmName, tchName, weekdayOf } from "./format.ts";
import type { Graph } from "./types.ts";

export function overlaps(a0: string, a1: string, b0: string, b1: string) {
  return new Date(a0) < new Date(b1) && new Date(b0) < new Date(a1);
}

export type ClashExcept = {
  exceptClassId?: string;
  exceptLessonIds?: string[];
};

export function teacherClash(g: Graph, teacherId: string, start: string, end: string, exceptId?: string, except?: ClashExcept) {
  const skip = new Set(except?.exceptLessonIds || []);
  if (exceptId) skip.add(exceptId);
  return g.lessons.filter((l) => {
    if (l.teacher_id !== teacherId || l.status === "cancelled") return false;
    if (skip.has(l.id)) return false;
    if (except?.exceptClassId && l.class_id === except.exceptClassId) return false;
    return overlaps(l.start, l.end, start, end);
  });
}

export function roomClash(g: Graph, roomId: string, start: string, end: string, exceptId?: string, except?: ClashExcept) {
  const room = one(g.rooms, roomId);
  if (!room || room.type === "online") return [];
  const skip = new Set(except?.exceptLessonIds || []);
  if (exceptId) skip.add(exceptId);
  return g.lessons.filter((l) => {
    if (l.room_id !== roomId || l.status === "cancelled") return false;
    if (skip.has(l.id)) return false;
    if (except?.exceptClassId && l.class_id === except.exceptClassId) return false;
    return overlaps(l.start, l.end, start, end);
  });
}

export type ClashParty = {
  class_id: string;
  teacher_id: string;
  room_id: string;
  lesson_id: string | null;
};
export type SlotClash = {
  teacher: ClashParty[];
  room: ClashParty[];
  kind: "teacher" | "room" | "both" | null;
};

function asParty(l: Graph["lessons"][number]): ClashParty {
  return { class_id: l.class_id, teacher_id: l.teacher_id, room_id: l.room_id, lesson_id: l.id };
}

function datesOf(g: Graph) {
  const set = new Set<string>();
  for (const l of g.lessons) set.add(`${l.class_id}:${l.start.slice(0, 10)}`);
  return set;
}

export function slotClash(g: Graph, teacherId: string, roomId: string, start: string, end: string, except?: ClashExcept): SlotClash {
  const teacher = teacherClash(g, teacherId, start, end, undefined, except).map(asParty);
  const room = roomClash(g, roomId, start, end, undefined, except).map(asParty);
  const date = start.slice(0, 10);
  const seenT = new Set(teacher.map((p) => p.class_id));
  const seenR = new Set(room.map((p) => p.class_id));
  const occupied = datesOf(g);
  for (const c of g.classes) {
    if (!c.active || c.start_date > date) continue;
    if (except?.exceptClassId && c.id === except.exceptClassId) continue;
    if (c.end_date && c.end_date < date) continue;
    if (occupied.has(`${c.id}:${date}`)) continue;
    const rec = normalizeRecurrence(c.recurrence);
    const day = rec.days.find((d) => d.weekday === weekdayOf(date));
    if (!day) continue;
    const hhmm = day.start_time.slice(0, 5);
    const eh = addMinutesHhmm(hhmm, rec.duration_min);
    if (!eh) continue;
    const st = `${date}T${hhmm}:00+07:00`;
    const en = `${date}T${eh}:00+07:00`;
    if (!overlaps(st, en, start, end)) continue;
    const party: ClashParty = { class_id: c.id, teacher_id: c.default_teacher_id, room_id: c.default_room_id, lesson_id: null };
    if (c.default_teacher_id === teacherId && !seenT.has(c.id)) {
      teacher.push(party);
      seenT.add(c.id);
    }
    const rm = one(g.rooms, c.default_room_id);
    if (rm && rm.type !== "online" && c.default_room_id === roomId && !seenR.has(c.id)) {
      room.push(party);
      seenR.add(c.id);
    }
  }
  const kind = teacher.length && room.length ? "both" : teacher.length ? "teacher" : room.length ? "room" : null;
  return { teacher, room, kind };
}

export function clashNote(g: Graph, hit: SlotClash) {
  const bits: string[] = [];
  const t = hit.teacher[0];
  const r = hit.room[0];
  if (t) bits.push(`GV ${tchName(g, t.teacher_id)} đang ${clsName(g, t.class_id)}`);
  if (r) bits.push(`phòng ${rmName(g, r.room_id)} đang ${clsName(g, r.class_id)}`);
  return bits.join(" · ");
}

export type OccupancyHold = {
  class_id: string;
  teacher_id: string;
  room_id: string;
  start: string;
  end: string;
  lesson_id: string | null;
};

export function occupancyOnDate(g: Graph, date: string): OccupancyHold[] {
  const holds: OccupancyHold[] = [];
  const seen = new Set<string>();
  for (const l of g.lessons) {
    if (l.start.slice(0, 10) !== date) continue;
    seen.add(l.class_id);
    if (l.status === "cancelled") continue;
    holds.push({
      class_id: l.class_id,
      teacher_id: l.teacher_id,
      room_id: l.room_id,
      start: l.start,
      end: l.end,
      lesson_id: l.id,
    });
  }
  for (const c of g.classes) {
    if (!c.active || seen.has(c.id)) continue;
    if (c.start_date > date) continue;
    if (c.end_date && c.end_date < date) continue;
    const rec = normalizeRecurrence(c.recurrence);
    const day = rec.days.find((d) => d.weekday === weekdayOf(date));
    if (!day) continue;
    const hhmm = day.start_time.slice(0, 5);
    const eh = addMinutesHhmm(hhmm, rec.duration_min);
    if (!eh) continue;
    holds.push({
      class_id: c.id,
      teacher_id: c.default_teacher_id,
      room_id: c.default_room_id,
      start: `${date}T${hhmm}:00+07:00`,
      end: `${date}T${eh}:00+07:00`,
      lesson_id: null,
    });
  }
  return holds.sort((a, b) => a.start.localeCompare(b.start));
}

export function projectedOccupancy(g: Graph, from: string, to: string): OccupancyHold[] {
  const hasLesson = new Set(
    g.lessons.map((l) => `${l.class_id}:${l.start.slice(0, 10)}`),
  );
  const out: OccupancyHold[] = [];
  for (const c of g.classes) {
    if (!c.active) continue;
    const rec = normalizeRecurrence(c.recurrence);
    if (!rec.days.length) continue;
    const slots = enumerateRecurrence({
      days: rec.days,
      duration_min: rec.duration_min,
      start_date: c.start_date,
      end_date: c.end_date && c.end_date < to ? c.end_date : to,
      today: from,
      horizonDays: Math.max(21, daysBetween(from, to) + 1),
    });
    for (const s of slots) {
      if (s.date < from || s.date > to) continue;
      if (hasLesson.has(`${c.id}:${s.date}`)) continue;
      out.push({
        class_id: c.id,
        teacher_id: c.default_teacher_id,
        room_id: c.default_room_id,
        start: s.start,
        end: s.end,
        lesson_id: null,
      });
    }
  }
  return out;
}
