import { clashNote, slotClash, type SlotClash } from "./clash.ts";
import { addMinutesHhmm, classInstanceName, classLife, enumerateRecurrence, nid, normalizeRecurrence, one, schoolOrder, stuName } from "./format.ts";
import type { Graph, RecurrenceDay } from "./types.ts";

export const CLASH_COVER_MAX = 5;

export type ClassPhase = "not_started" | "running" | "finished" | "cancelled";
export type ScheduleMode = "occurrence" | "this_and_future" | "series";

export type RecurrencePatch = {
  days: RecurrenceDay[];
  duration_min: number;
  start_date: string;
  end_date: string | null;
  teacher_id: string;
  room_id: string;
  name?: string;
  capacity?: number;
};

export type OccurrencePatch = {
  lesson_id: string;
  start: string;
  end: string;
  teacher_id: string;
  room_id: string;
};

export type ClashSlot = {
  date: string;
  start: string;
  end: string;
  hit: SlotClash;
  note: string;
};

export type ScheduleResult = {
  status: "ok" | "cover" | "block" | "locked" | "invalid";
  message: string;
  phase: ClassPhase;
  clashN: number;
  clashes: ClashSlot[];
  frozenN: number;
  mutableN: number;
  created: number;
  patched: number;
  cancelled: number;
  studentWarns: string[];
  capacityWarn?: string;
  applied: boolean;
  classId?: string;
};

export type ScheduleIo = { nid?: (p: string) => string };

function idOf(io: ScheduleIo | undefined, p: string) {
  return (io?.nid || nid)(p);
}

export function classPhase(g: Graph, c: Graph["classes"][number]): ClassPhase {
  if (!c.active || c.life === "cancelled") return "cancelled";
  if (c.life === "finished" || classLife(g, c) === "finished") return "finished";
  const hasFrozen = g.lessons.some((l) => l.class_id === c.id && l.status !== "cancelled" && l.start <= g.meta.clock);
  if (!hasFrozen) return "not_started";
  return "running";
}

export function lessonHasWork(g: Graph, lessonId: string) {
  return (
    g.attendance.some((a) => a.lesson_id === lessonId) ||
    g.homework.some((h) => h.lesson_id === lessonId) ||
    g.makeups.some((m) => m.target_lesson_id === lessonId) ||
    g.notes.some((n) => n.lesson_id === lessonId)
  );
}

export function isLessonFrozen(g: Graph, l: Graph["lessons"][number]) {
  if (l.status === "cancelled") return false;
  if (l.start <= g.meta.clock) return true;
  return lessonHasWork(g, l.id);
}

export function isLessonMutable(g: Graph, l: Graph["lessons"][number]) {
  if (l.status === "cancelled") return false;
  if (l.is_makeup || l.override || l.substitute) return false;
  if (l.start <= g.meta.clock) return false;
  return !lessonHasWork(g, l.id);
}

export function clashPolicy(clashN: number): "apply" | "cover" | "block" {
  if (clashN <= 0) return "apply";
  if (clashN < CLASH_COVER_MAX) return "cover";
  return "block";
}

function recOf(p: RecurrencePatch) {
  const days = [...p.days]
    .map((d) => ({ weekday: d.weekday, start_time: d.start_time.slice(0, 5) }))
    .sort((a, b) => schoolOrder(a.weekday) - schoolOrder(b.weekday));
  const first = days[0];
  return {
    days,
    duration_min: p.duration_min,
    weekdays: days.map((d) => d.weekday),
    start_time: first?.start_time,
    end_time: first ? addMinutesHhmm(first.start_time, p.duration_min) : undefined,
  };
}

function validatePatch(g: Graph, p: RecurrencePatch): string | null {
  if (!p.days.length) return "Chọn ít nhất một thứ trong tuần";
  if (!p.duration_min || p.duration_min % 30 !== 0) return "Thời lượng buổi bước 30 phút";
  for (const d of p.days) {
    if (!addMinutesHhmm(d.start_time, p.duration_min)) return `${d.start_time} + ${p.duration_min} phút vượt quá ngày`;
  }
  const t = one(g.teachers, p.teacher_id);
  const r = one(g.rooms, p.room_id);
  if (!t || !r) return "Chọn giáo viên và phòng";
  if (!t.active) return "Giáo viên không còn xếp lịch";
  if (!r.active) return "Phòng không còn dùng";
  return null;
}

function studentWarns(g: Graph, classId: string, slots: Array<{ start: string; end: string }>) {
  const roster = g.enrollments.filter((e) => e.class_id === classId && e.status === "active");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of roster) {
    const otherIds = new Set(
      g.enrollments.filter((x) => x.student_id === e.student_id && x.class_id !== classId && x.status === "active").map((x) => x.class_id),
    );
    if (!otherIds.size) continue;
    for (const s of slots) {
      const hit = g.lessons.find((l) => otherIds.has(l.class_id) && l.status !== "cancelled" && l.start < s.end && s.start < l.end);
      if (!hit) continue;
      const key = `${e.student_id}:${s.start}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`${stuName(g, e.student_id)} trùng ${one(g.classes, hit.class_id)?.name || "lớp khác"}`);
    }
  }
  return out.slice(0, 8);
}

function capacityWarn(g: Graph, roomId: string, capacity: number | undefined) {
  const room = one(g.rooms, roomId);
  if (!room || room.type === "online" || capacity == null) return undefined;
  if (capacity > room.capacity) return `Sĩ số ${capacity} > sức chứa phòng ${room.capacity}`;
  return undefined;
}

function emptyResult(phase: ClassPhase, extra: Partial<ScheduleResult> = {}): ScheduleResult {
  return {
    status: extra.status || "invalid",
    message: extra.message || "",
    phase,
    clashN: extra.clashN || 0,
    clashes: extra.clashes || [],
    frozenN: extra.frozenN || 0,
    mutableN: extra.mutableN || 0,
    created: extra.created || 0,
    patched: extra.patched || 0,
    cancelled: extra.cancelled || 0,
    studentWarns: extra.studentWarns || [],
    capacityWarn: extra.capacityWarn,
    applied: extra.applied || false,
    classId: extra.classId,
  };
}

type Planned = {
  date: string;
  start: string;
  end: string;
  existing?: Graph["lessons"][number];
  clash?: ClashSlot;
};

function planSlots(
  g: Graph,
  classId: string,
  patch: RecurrencePatch,
  fromIso: string,
  exceptLessonIds: string[],
): { planned: Planned[]; frozenN: number; mutableN: number } {
  const clock = g.meta.clock;
  const fromDate = fromIso.slice(0, 10);
  const slots = enumerateRecurrence({
    days: patch.days,
    duration_min: patch.duration_min,
    start_date: patch.start_date,
    end_date: patch.end_date,
    today: g.meta.today,
    fromDate,
  }).filter((s) => s.start > clock && s.start >= fromIso);
  const ofClass = g.lessons.filter((l) => l.class_id === classId);
  const frozenN = ofClass.filter((l) => isLessonFrozen(g, l)).length;
  const mutable = ofClass.filter((l) => isLessonMutable(g, l) && l.start >= fromIso);
  const byDate = new Map<string, Graph["lessons"][number]>();
  for (const l of mutable) byDate.set(l.start.slice(0, 10), l);
  const cancelledDates = new Set(
    ofClass.filter((l) => l.status === "cancelled").map((l) => l.start.slice(0, 10)),
  );
  const blockedDates = new Set(
    ofClass
      .filter((l) => l.status !== "cancelled" && (l.is_makeup || l.override || l.substitute || isLessonFrozen(g, l)))
      .map((l) => l.start.slice(0, 10)),
  );
  const planned: Planned[] = [];
  for (const s of slots) {
    if (cancelledDates.has(s.date)) continue;
    if (blockedDates.has(s.date) && !byDate.has(s.date)) continue;
    const existing = byDate.get(s.date);
    const except: string[] = [...exceptLessonIds];
    if (existing) except.push(existing.id);
    const hit = slotClash(g, patch.teacher_id, patch.room_id, s.start, s.end, {
      exceptClassId: classId,
      exceptLessonIds: except,
    });
    planned.push({
      date: s.date,
      start: s.start,
      end: s.end,
      existing,
      clash: hit.kind ? { date: s.date, start: s.start, end: s.end, hit, note: clashNote(g, hit) } : undefined,
    });
  }
  return { planned, frozenN, mutableN: mutable.length };
}

function leftoverAfterSplit(
  g: Graph,
  classId: string,
  fromIso: string,
  usedIds: Set<string>,
) {
  return g.lessons.filter((l) => {
    if (l.class_id !== classId || usedIds.has(l.id)) return false;
    if (l.start < fromIso || l.status === "cancelled") return false;
    if (l.is_makeup || l.substitute) return false;
    return true;
  });
}

function commitSeries(
  g: Graph,
  cls: Graph["classes"][number],
  patch: RecurrencePatch,
  planned: Planned[],
  fromIso: string,
  io?: ScheduleIo,
) {
  const skipClash = planned.filter((p) => p.clash);
  const ok = planned.filter((p) => !p.clash);
  const used = new Set<string>();
  let created = 0;
  let patched = 0;
  let cancelled = 0;
  const rec = recOf(patch);
  cls.default_teacher_id = patch.teacher_id;
  cls.default_room_id = patch.room_id;
  cls.recurrence = rec;
  if (patch.start_date) cls.start_date = patch.start_date;
  cls.end_date = patch.end_date;
  if (patch.capacity != null) cls.capacity = patch.capacity;
  if (patch.name?.trim()) cls.name = patch.name.trim();
  else {
    const course = cls.course_id ? one(g.courses, cls.course_id) : undefined;
    if (course) cls.name = classInstanceName(course.name, rec);
  }

  for (const p of ok) {
    if (p.existing) {
      p.existing.start = p.start;
      p.existing.end = p.end;
      p.existing.teacher_id = patch.teacher_id;
      p.existing.room_id = patch.room_id;
      used.add(p.existing.id);
      patched += 1;
    } else {
      const id = idOf(io, "les");
      g.lessons.push({
        id,
        class_id: cls.id,
        branch_id: cls.branch_id,
        teacher_id: patch.teacher_id,
        room_id: patch.room_id,
        start: p.start,
        end: p.end,
        status: "scheduled",
        is_makeup: false,
        original_lesson_id: null,
        substitute: false,
      });
      used.add(id);
      created += 1;
    }
  }

  for (const p of skipClash) {
    if (p.existing && !lessonHasWork(g, p.existing.id)) {
      p.existing.status = "cancelled";
      used.add(p.existing.id);
      cancelled += 1;
    } else if (!p.existing) {
      g.lessons.push({
        id: idOf(io, "les"),
        class_id: cls.id,
        branch_id: cls.branch_id,
        teacher_id: patch.teacher_id,
        room_id: patch.room_id,
        start: p.start,
        end: p.end,
        status: "cancelled",
        is_makeup: false,
        original_lesson_id: null,
        substitute: false,
      });
      cancelled += 1;
    } else {
      p.existing.override = true;
      used.add(p.existing.id);
    }
  }

  for (const l of leftoverAfterSplit(g, cls.id, fromIso, used)) {
    if (l.override) continue;
    if (isLessonFrozen(g, l) || lessonHasWork(g, l.id)) l.override = true;
    else {
      l.status = "cancelled";
      cancelled += 1;
    }
  }

  return { created, patched, cancelled };
}

export function applyClassSchedule(
  g: Graph,
  classId: string,
  patch: RecurrencePatch,
  mode: "series" | "this_and_future",
  opts?: { fromStart?: string; io?: ScheduleIo },
): ScheduleResult {
  const cls = one(g.classes, classId);
  if (!cls) return emptyResult("cancelled", { status: "invalid", message: "Không có lớp", classId });
  const phase = classPhase(g, cls);
  if (phase === "finished" || phase === "cancelled") {
    return emptyResult(phase, { status: "locked", message: "Lớp đã kết thúc — không đổi lịch", classId });
  }
  const err = validatePatch(g, patch);
  if (err) return emptyResult(phase, { status: "invalid", message: err, classId });

  const fromStart = mode === "this_and_future" && opts?.fromStart
    ? opts.fromStart
    : phase === "not_started"
      ? `${patch.start_date}T00:00:00+07:00`
      : g.meta.clock;

  const { planned, frozenN, mutableN } = planSlots(g, classId, patch, fromStart, []);
  const clashes = planned.filter((p) => p.clash).map((p) => p.clash!);
  const policy = clashPolicy(clashes.length);
  const warns = studentWarns(g, classId, planned.filter((p) => !p.clash).map((p) => ({ start: p.start, end: p.end })));
  const cap = capacityWarn(g, patch.room_id, patch.capacity ?? cls.capacity);

  if (policy === "block") {
    return {
      status: "block",
      message: `${clashes.length} buổi trùng GV/phòng. Không lưu — đổi lịch trên lịch tháng.`,
      phase,
      clashN: clashes.length,
      clashes,
      frozenN,
      mutableN,
      created: 0,
      patched: 0,
      cancelled: 0,
      studentWarns: warns,
      capacityWarn: cap,
      applied: false,
      classId,
    };
  }

  const counts = commitSeries(g, cls, patch, planned, fromStart, opts?.io);
  const status = policy === "cover" ? "cover" : "ok";
  const bits = [`${counts.created + counts.patched} buổi mới/sửa`];
  if (counts.cancelled) bits.push(`giữ ${counts.cancelled} buổi trùng/cũ`);
  if (frozenN) bits.push(`${frozenN} buổi đã diễn ra giữ nguyên`);
  if (warns.length) bits.push("cảnh báo học sinh trùng giờ");
  return {
    status,
    message: bits.join(" · "),
    phase,
    clashN: clashes.length,
    clashes,
    frozenN,
    mutableN,
    ...counts,
    studentWarns: warns,
    capacityWarn: cap,
    applied: true,
    classId,
  };
}

export function applyOccurrence(g: Graph, patch: OccurrencePatch, io?: ScheduleIo): ScheduleResult {
  void io;
  const les = one(g.lessons, patch.lesson_id);
  if (!les) return emptyResult("cancelled", { status: "invalid", message: "Không có buổi" });
  const cls = one(g.classes, les.class_id);
  if (!cls) return emptyResult("cancelled", { status: "invalid", message: "Không có lớp" });
  const phase = classPhase(g, cls);
  if (phase === "finished" || phase === "cancelled") {
    return emptyResult(phase, { status: "locked", message: "Lớp đã kết thúc — không đổi buổi", classId: cls.id });
  }
  if (isLessonFrozen(g, les)) {
    return emptyResult(phase, { status: "locked", message: "Buổi đã diễn ra / đang học — không đổi", classId: cls.id, frozenN: 1 });
  }
  if (patch.end <= patch.start) return emptyResult(phase, { status: "invalid", message: "Giờ kết thúc phải sau giờ bắt đầu", classId: cls.id });
  const t = one(g.teachers, patch.teacher_id);
  const r = one(g.rooms, patch.room_id);
  if (!t?.active || !r?.active) return emptyResult(phase, { status: "invalid", message: "GV/phòng không còn dùng", classId: cls.id });
  const hit = slotClash(g, patch.teacher_id, patch.room_id, patch.start, patch.end, {
    exceptClassId: les.class_id,
    exceptLessonIds: [les.id],
  });
  if (hit.kind) {
    const slot = { date: patch.start.slice(0, 10), start: patch.start, end: patch.end, hit, note: clashNote(g, hit) };
    return {
      status: "block",
      message: `Chặn — trùng ${hit.kind === "both" ? "GV và phòng" : hit.kind === "teacher" ? "GV" : "phòng"}`,
      phase,
      clashN: 1,
      clashes: [slot],
      frozenN: 0,
      mutableN: 1,
      created: 0,
      patched: 0,
      cancelled: 0,
      studentWarns: studentWarns(g, les.class_id, [{ start: patch.start, end: patch.end }]),
      applied: false,
      classId: cls.id,
    };
  }
  les.start = patch.start;
  les.end = patch.end;
  les.teacher_id = patch.teacher_id;
  les.room_id = patch.room_id;
  les.override = true;
  return {
    status: "ok",
    message: "Đã đổi một buổi",
    phase,
    clashN: 0,
    clashes: [],
    frozenN: 0,
    mutableN: 1,
    created: 0,
    patched: 1,
    cancelled: 0,
    studentWarns: studentWarns(g, les.class_id, [{ start: patch.start, end: patch.end }]),
    applied: true,
    classId: cls.id,
  };
}

export function materializeNewClass(
  g: Graph,
  classRow: Graph["classes"][number],
  io?: ScheduleIo,
): ScheduleResult {
  const patch: RecurrencePatch = {
    days: normalizeRecurrence(classRow.recurrence).days,
    duration_min: normalizeRecurrence(classRow.recurrence).duration_min,
    start_date: classRow.start_date,
    end_date: classRow.end_date,
    teacher_id: classRow.default_teacher_id,
    room_id: classRow.default_room_id,
    capacity: classRow.capacity,
  };
  const err = validatePatch(g, patch);
  if (err) return emptyResult("not_started", { status: "invalid", message: err });
  const fromIso = `${classRow.start_date}T00:00:00+07:00`;
  g.classes.unshift(classRow);
  const { planned, frozenN, mutableN } = planSlots(g, classRow.id, patch, fromIso, []);
  const clashes = planned.filter((p) => p.clash).map((p) => p.clash!);
  const policy = clashPolicy(clashes.length);
  if (policy === "block") {
    g.classes = g.classes.filter((c) => c.id !== classRow.id);
    return {
      status: "block",
      message: `${clashes.length} buổi trùng GV/phòng. Không mở lớp — đổi lịch trên lịch tháng.`,
      phase: "not_started",
      clashN: clashes.length,
      clashes,
      frozenN,
      mutableN,
      created: 0,
      patched: 0,
      cancelled: 0,
      studentWarns: [],
      capacityWarn: capacityWarn(g, patch.room_id, classRow.capacity),
      applied: false,
    };
  }
  const counts = commitSeries(g, classRow, patch, planned, fromIso, io);
  const okN = planned.length - clashes.length;
  if (!okN && !clashes.length) {
    g.classes = g.classes.filter((c) => c.id !== classRow.id);
    g.lessons = g.lessons.filter((l) => l.class_id !== classRow.id);
    return emptyResult("not_started", { status: "invalid", message: "Không có buổi trong khoảng ngày" });
  }
  if (!okN) {
    g.classes = g.classes.filter((c) => c.id !== classRow.id);
    g.lessons = g.lessons.filter((l) => l.class_id !== classRow.id);
    return emptyResult("not_started", {
      status: "block",
      message: "Không mở được — mọi buổi trùng GV/phòng",
      clashN: clashes.length,
      clashes,
    });
  }
  return {
    status: policy === "cover" ? "cover" : "ok",
    message: policy === "cover"
      ? `Đã mở ${okN} buổi · ${clashes.length} trùng — xếp buổi bù hoặc bỏ`
      : `Đã mở lớp · ${okN} buổi trên lịch`,
    phase: "not_started",
    clashN: clashes.length,
    clashes,
    frozenN,
    mutableN,
    ...counts,
    studentWarns: [],
    capacityWarn: capacityWarn(g, patch.room_id, classRow.capacity),
    applied: true,
    classId: classRow.id,
  };
}
