import type { Graph } from "./types";
import {
  fold,
  parseWeekdays,
  toE164,
  type CleanRecord,
  type ConflictAction,
  type ConflictDim,
  type DupAction,
  type DuplicateHit,
  type FieldDiff,
  type LinkReview,
  type LinkedDump,
  type LinkedEntity,
  type RoomSuggestion,
  type ScheduleConflict,
  type TimeSuggestion,
} from "./ingest";

export const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const WD_LONG = ["Chủ nhật", "Thứ hai", "Thứ ba", "Thứ tư", "Thứ năm", "Thứ sáu", "Thứ bảy"];
export const SLOT_TIMES = ["08:00", "10:00", "14:00", "16:00", "18:00", "19:30"];

export const DUP_VN: Record<DupAction, { label: string; hint: string }> = {
  keep: { label: "Giữ sổ", hint: "Bỏ qua hàng nhập — không đụng bản ghi đang chạy" },
  overwrite: { label: "Ghi đè", hint: "Cập nhật bản ghi sổ bằng dữ liệu mới" },
  merge: { label: "Gộp", hint: "Giữ sổ, bổ sung trường trống và lớp/ghi chú mới" },
  create: { label: "Tạo mới", hint: "Coi là bản ghi khác — không gộp" },
};

export const CONFLICT_VN: Record<ConflictAction, string> = {
  shift: "Dời giờ",
  room: "Đổi phòng",
  ignore: "Bỏ qua trùng",
};

export function hhmmOf(s: string) {
  const m = String(s || "18:00").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "18:00";
}

export function minutesOf(t: string) {
  const [h, m] = hhmmOf(t).split(":").map(Number);
  return h * 60 + m;
}

export function addMin(t: string, min: number) {
  const n = ((minutesOf(t) + min) % 1440 + 1440) % 1440;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function timeOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return minutesOf(aStart) < minutesOf(bEnd) && minutesOf(bStart) < minutesOf(aEnd);
}

function phoneKey(raw: string) {
  const p = toE164(raw);
  if (p.ok && p.value) return p.value;
  const d = String(raw || "").replace(/\D/g, "");
  return d.length >= 9 ? d : "";
}

function guardianOf(g: Graph, studentId: string) {
  const link = g.student_guardians.find((x) => x.student_id === studentId && (x.billing_contact || x.is_primary));
  return link ? g.guardians.find((x) => x.id === link.guardian_id) : undefined;
}

function studentKey(name: string, phone: string, guardianPhone: string) {
  const p = phoneKey(guardianPhone || phone);
  if (p) return `${fold(name)}|${p}`;
  return fold(name);
}

function classKey(name: string) {
  return fold(name);
}

function dash(v: unknown) {
  const s = String(v ?? "").trim();
  return s || "—";
}

function diff(field: string, label: string, existing: string, incoming: string): FieldDiff {
  const a = dash(existing);
  const b = dash(incoming);
  return { field, label, existing: a, incoming: b, changed: a !== b && b !== "—" };
}

function samePhone(a: string, b: string) {
  const ka = phoneKey(a);
  const kb = phoneKey(b);
  if (ka && kb) return ka === kb;
  return dash(a) === dash(b);
}

function diffPhone(field: string, label: string, existing: string, incoming: string): FieldDiff {
  return {
    field,
    label,
    existing: dash(existing),
    incoming: dash(incoming),
    changed: dash(incoming) !== "—" && !samePhone(existing, incoming),
  };
}

type Slot = {
  weekday: number;
  start: string;
  end: string;
  teacherId: string;
  roomId: string;
  classId: string;
  className: string;
  teacherName: string;
  roomName: string;
};

function isOnlineRoom(g: Graph, roomId: string) {
  const r = g.rooms.find((x) => x.id === roomId);
  return !r || r.type === "online" || fold(r.name) === "online";
}

function classSlots(g: Graph, c: Graph["classes"][number]): Slot[] {
  const rec = c.recurrence;
  const duration = rec?.duration_min || 90;
  const days = rec?.days?.length
    ? rec.days
    : (rec?.weekdays || []).map((weekday) => ({ weekday, start_time: rec.start_time || "18:00" }));
  const teacher = g.teachers.find((t) => t.id === c.default_teacher_id);
  const room = g.rooms.find((r) => r.id === c.default_room_id);
  return days.map((d) => {
    const start = hhmmOf(d.start_time);
    return {
      weekday: d.weekday,
      start,
      end: addMin(start, duration),
      teacherId: c.default_teacher_id,
      roomId: c.default_room_id,
      classId: c.id,
      className: c.name,
      teacherName: teacher?.name || "",
      roomName: room?.name || "",
    };
  });
}

function incomingSlots(g: Graph, c: LinkedEntity): Slot[] {
  const days = parseWeekdays(String(c.extra?.weekdays || ""));
  const start = hhmmOf(String(c.extra?.start_time || "18:00"));
  const duration = Number(c.extra?.duration_min) || 90;
  const teacherName = String(c.extra?.teacher || "");
  const roomName = String(c.extra?.room || "");
  const teacher = g.teachers.find((t) => fold(t.name) === fold(teacherName) || fold(t.name).includes(fold(teacherName)));
  const room = g.rooms.find((r) => fold(r.name) === fold(roomName));
  return days.map((weekday) => ({
    weekday,
    start,
    end: addMin(start, duration),
    teacherId: teacher?.id || "",
    roomId: room?.id || "",
    classId: c.id,
    className: c.name,
    teacherName,
    roomName,
  }));
}

function rowOf(records: CleanRecord[], kind: CleanRecord["kind"], name: string) {
  const k = fold(name);
  const rec = records.find((r) => {
    if (r.kind !== kind) return false;
    const n = r.values.student_name || r.values.class_name || "";
    return fold(n) === k;
  });
  return rec?.row || 0;
}

export function detectDuplicates(live: Graph, linked: LinkedDump, records: CleanRecord[]): DuplicateHit[] {
  const byPhone = new Map<string, Graph["students"][number]>();
  const byName = new Map<string, Graph["students"][number][]>();
  for (const s of live.students) {
    const grd = guardianOf(live, s.id);
    const key = studentKey(s.full_name, s.phone || "", grd?.phone || "");
    if (!byPhone.has(key)) byPhone.set(key, s);
    const nk = fold(s.full_name);
    const list = byName.get(nk) || [];
    list.push(s);
    byName.set(nk, list);
  }
  const byClass = new Map<string, Graph["classes"][number]>();
  for (const c of live.classes) byClass.set(classKey(c.name), c);

  const out: DuplicateHit[] = [];

  for (const s of linked.students) {
    const phone = String(s.extra?.phone || "");
    const gPhone = String(s.extra?.guardian_phone || "");
    const key = studentKey(s.name, phone, gPhone);
    let hit = byPhone.get(key);
    if (!hit) {
      const named = byName.get(fold(s.name));
      if (named?.length === 1) hit = named[0];
    }
    if (!hit) continue;
    const grd = guardianOf(live, hit.id);
    const enrolled = live.enrollments
      .filter((e) => e.student_id === hit.id && e.status === "active")
      .map((e) => live.classes.find((c) => c.id === e.class_id)?.name || "")
      .filter(Boolean);
    const incomingCls = linked.enrollments
      .filter((e) => e.extra?.student_id === s.id)
      .map((e) => linked.classes.find((c) => c.id === e.extra?.class_id)?.name || "")
      .filter(Boolean);
    const diffs = [
      diff("name", "Họ tên", hit.full_name, s.name),
      diffPhone("phone", "SĐT", hit.phone || "", phone),
      diff("dob", "Ngày sinh", hit.dob, String(s.extra?.dob || "")),
      diff("guardian_name", "Phụ huynh", grd?.full_name || "", String(s.extra?.guardian_name || "")),
      diffPhone("guardian_phone", "SĐT PH", grd?.phone || "", gPhone),
      diff("relationship", "Quan hệ", grd?.relationship || "", String(s.extra?.relationship || "")),
      diff("notes", "Ghi chú", hit.notes || "", String(s.extra?.notes || "")),
      diff("class", "Lớp", enrolled.join(", ") || "—", incomingCls.join(", ") || "—"),
    ];
    const needsHuman = diffs.some((d) => d.changed);
    out.push({
      id: `dup_student_${s.id}`,
      kind: "student",
      row: rowOf(records, "STUDENT_ROSTER", s.name),
      incomingId: s.id,
      existingId: hit.id,
      title: s.name,
      matchKey: key,
      diffs,
      action: needsHuman ? null : "keep",
    });
  }

  for (const c of linked.classes) {
    const hit = byClass.get(classKey(c.name));
    if (!hit) continue;
    const tch = live.teachers.find((t) => t.id === hit.default_teacher_id);
    const rm = live.rooms.find((r) => r.id === hit.default_room_id);
    const rec = hit.recurrence;
    const days = (rec?.weekdays || rec?.days?.map((d) => d.weekday) || []).map((d) => WD[d]).join(" ");
    const diffs = [
      diff("name", "Tên lớp", hit.name, c.name),
      diff("teacher", "Giáo viên", tch?.name || "", String(c.extra?.teacher || "")),
      diff("room", "Phòng", rm?.name || "", String(c.extra?.room || "")),
      diff("weekdays", "Thứ", days, String(c.extra?.weekdays || "")),
      diff("start_time", "Giờ", rec?.start_time || "", String(c.extra?.start_time || "")),
      diff("capacity", "Sĩ số", String(hit.capacity), String(c.extra?.capacity || "")),
      diff("course", "Khóa", live.courses.find((x) => x.id === hit.course_id)?.name || "", String(c.extra?.course_name || "")),
    ];
    const needsHuman = diffs.some((d) => d.changed);
    out.push({
      id: `dup_class_${c.id}`,
      kind: "class",
      row: rowOf(records, "CLASS_LIST", c.name),
      incomingId: c.id,
      existingId: hit.id,
      title: c.name,
      matchKey: classKey(c.name),
      diffs,
      action: needsHuman ? null : "keep",
    });
  }

  return out;
}

function occupied(
  slots: Slot[],
  weekday: number,
  start: string,
  end: string,
  teacherId: string,
  roomId: string,
  exceptClassId?: string,
) {
  for (const s of slots) {
    if (exceptClassId && s.classId === exceptClassId) continue;
    if (s.weekday !== weekday || !timeOverlaps(start, end, s.start, s.end)) continue;
    if (teacherId && s.teacherId === teacherId) return s;
    if (roomId && s.roomId === roomId) return s;
  }
  return null;
}

function suggestShift(liveSlots: Slot[], weekday: number, start: string, end: string, teacherId: string, roomId: string, exceptClassId: string): TimeSuggestion | null {
  const duration = minutesOf(end) - minutesOf(start);
  const order = [weekday, ...[1, 2, 3, 4, 5, 6, 0].filter((d) => d !== weekday)];
  for (const wd of order) {
    for (const t of SLOT_TIMES) {
      if (wd === weekday && minutesOf(t) <= minutesOf(start)) continue;
      const en = addMin(t, duration);
      if (!occupied(liveSlots, wd, t, en, teacherId, roomId, exceptClassId)) {
        return { weekday: wd, weekdayLabel: WD[wd], start: t, label: `${WD_LONG[wd]} ${t}` };
      }
    }
  }
  return null;
}

function freeRoomsAt(g: Graph, liveSlots: Slot[], weekday: number, start: string, end: string): RoomSuggestion[] {
  return g.rooms
    .filter((r) => r.active && r.type !== "online")
    .filter((r) => !liveSlots.some((s) => s.roomId === r.id && s.weekday === weekday && timeOverlaps(start, end, s.start, s.end)))
    .map((r) => ({ id: r.id, name: r.name }));
}

function preserveConflictActions(next: ScheduleConflict[], prev?: ScheduleConflict[] | null) {
  if (!prev?.length) return next;
  const map = new Map(prev.map((c) => [c.id, c]));
  return next.map((c) => {
    const old = map.get(c.id);
    if (!old) return c;
    return { ...c, action: old.action, roomId: old.roomId };
  });
}

function preserveDupActions(next: DuplicateHit[], prev?: DuplicateHit[] | null) {
  if (!prev?.length) return next;
  const map = new Map(prev.map((d) => [d.id, d.action]));
  return next.map((d) => {
    const a = map.get(d.id);
    return a !== undefined ? { ...d, action: a } : d;
  });
}

export function detectConflicts(
  live: Graph,
  linked: LinkedDump,
  duplicates: DuplicateHit[],
  prev?: ScheduleConflict[] | null,
): ScheduleConflict[] {
  const liveSlots = live.classes.filter((c) => c.active).flatMap((c) => classSlots(live, c));

  const stuMap = new Map<string, string>();
  for (const d of duplicates) {
    if (d.kind !== "student") continue;
    if (d.action === "create") continue;
    stuMap.set(d.incomingId, d.existingId);
  }
  for (const s of linked.students) {
    if (stuMap.has(s.id)) continue;
    const named = live.students.filter((x) => fold(x.full_name) === fold(s.name));
    if (named.length === 1) stuMap.set(s.id, named[0].id);
  }

  const existingByStudent = new Map<string, Set<string>>();
  for (const e of live.enrollments) {
    if (e.status !== "active") continue;
    const set = existingByStudent.get(e.student_id) || new Set();
    set.add(e.class_id);
    existingByStudent.set(e.student_id, set);
  }

  const incomingByClass = new Map<string, LinkedEntity[]>();
  for (const e of linked.enrollments) {
    const cid = String(e.extra?.class_id || "");
    const list = incomingByClass.get(cid) || [];
    list.push(e);
    incomingByClass.set(cid, list);
  }

  const out: ScheduleConflict[] = [];

  for (const incoming of linked.classes) {
    const dup = duplicates.find((d) => d.kind === "class" && d.incomingId === incoming.id);
    const checkIncoming = !dup || dup.action === "create" || dup.action === "overwrite";
    if (!checkIncoming) continue;
    const twin = dup && dup.action !== "create" ? dup.existingId : "";
    for (const slot of incomingSlots(live, incoming)) {
      for (const liveSlot of liveSlots) {
        if (twin && liveSlot.classId === twin) continue;
        if (slot.weekday !== liveSlot.weekday) continue;
        if (!timeOverlaps(slot.start, slot.end, liveSlot.start, liveSlot.end)) continue;
        const dims: ConflictDim[] = [];
        if (slot.teacherId && slot.teacherId === liveSlot.teacherId) dims.push("teacher");
        if (slot.roomId && slot.roomId === liveSlot.roomId && !isOnlineRoom(live, slot.roomId)) dims.push("room");
        const students: string[] = [];
        for (const enr of incomingByClass.get(incoming.id) || []) {
          const sid = String(enr.extra?.student_id || "");
          const existingSid = stuMap.get(sid);
          if (!existingSid) continue;
          if (existingByStudent.get(existingSid)?.has(liveSlot.classId)) {
            const name = live.students.find((s) => s.id === existingSid)?.full_name || linked.students.find((s) => s.id === sid)?.name;
            if (name) students.push(name);
          }
        }
        if (students.length) dims.push("student");
        if (!dims.length) continue;
        const duration = minutesOf(slot.end) - minutesOf(slot.start);
        const rooms = freeRoomsAt(live, liveSlots, slot.weekday, slot.start, slot.end);
        out.push({
          id: `cf_${incoming.id}_${liveSlot.classId}_${slot.weekday}_${slot.start}`,
          incomingClassId: incoming.id,
          incomingClassName: incoming.name,
          existingClassId: liveSlot.classId,
          existingClassName: liveSlot.className,
          dims,
          students,
          teacher: slot.teacherName || liveSlot.teacherName,
          room: slot.roomName || liveSlot.roomName,
          weekday: slot.weekday,
          weekdayLabel: WD[slot.weekday],
          incomingStart: slot.start,
          incomingEnd: slot.end,
          existingStart: liveSlot.start,
          existingEnd: liveSlot.end,
          suggestShift: suggestShift(liveSlots, slot.weekday, slot.start, addMin(slot.start, duration), slot.teacherId, slot.roomId, twin || ""),
          suggestRoom: rooms[0] || null,
          freeRooms: rooms,
          action: null,
        });
      }
    }
  }

  return preserveConflictActions(out, prev);
}

export function buildReview(live: Graph, linked: LinkedDump, records: CleanRecord[], prev?: LinkReview | null): LinkReview {
  const duplicates = preserveDupActions(detectDuplicates(live, linked, records), prev?.duplicates);
  const conflicts = detectConflicts(live, linked, duplicates, prev?.conflicts);
  return { duplicates, conflicts };
}

export function reviewPending(review: LinkReview | null | undefined) {
  if (!review) return 0;
  return review.duplicates.filter((d) => !d.action).length + review.conflicts.filter((c) => !c.action).length;
}

export function applyReviewToLinked(linked: LinkedDump, review: LinkReview | null | undefined): LinkedDump {
  if (!review) return linked;
  const byIncoming = new Map<string, ScheduleConflict[]>();
  for (const c of review.conflicts) {
    if (!c.action) continue;
    const list = byIncoming.get(c.incomingClassId) || [];
    list.push(c);
    byIncoming.set(c.incomingClassId, list);
  }
  const classes = linked.classes.map((c) => {
    const hits = byIncoming.get(c.id);
    if (!hits?.length) return c;
    let extra = { ...(c.extra || {}) };
    for (const h of hits) {
      if (h.action === "shift" && h.suggestShift) {
        extra = { ...extra, weekdays: h.suggestShift.weekdayLabel, start_time: h.suggestShift.start };
      }
      if (h.action === "room") {
        const room = h.freeRooms.find((r) => r.id === h.roomId) || h.suggestRoom;
        if (room) extra = { ...extra, room: room.name };
      }
    }
    return { ...c, extra };
  });
  return { ...linked, classes };
}

export function needsDecision(d: DuplicateHit) {
  return d.action === null || d.diffs.some((x) => x.changed);
}
