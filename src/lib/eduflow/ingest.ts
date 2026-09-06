import * as XLSX from "xlsx";

export type SheetKind =
  | "STUDENT_ROSTER"
  | "COURSE"
  | "CLASS_LIST"
  | "ROOM_LIST"
  | "ENROLLMENT"
  | "BALANCE"
  | "LESSON_LOG"
  | "SCHEDULE"
  | "UNKNOWN";

export type Layer = "foundation" | "relational";
export type IngestPhase = "drop" | "classify" | "map" | "clean" | "link" | "commit" | "done";

export const KIND_ORDER: SheetKind[] = [
  "STUDENT_ROSTER", "COURSE", "CLASS_LIST", "ROOM_LIST",
  "ENROLLMENT", "BALANCE", "LESSON_LOG", "SCHEDULE",
];

export const FOUNDATION: SheetKind[] = ["STUDENT_ROSTER", "COURSE", "CLASS_LIST", "ROOM_LIST"];

export const KIND_VN: Record<SheetKind, string> = {
  STUDENT_ROSTER: "Học sinh",
  COURSE: "Khóa học",
  CLASS_LIST: "Lớp",
  ROOM_LIST: "Phòng",
  ENROLLMENT: "Ghi danh",
  BALANCE: "Số buổi còn",
  LESSON_LOG: "Sổ buổi",
  SCHEDULE: "Thời khóa biểu",
  UNKNOWN: "Chưa rõ",
};

export const PHASE_VN: Record<IngestPhase, string> = {
  drop: "Chọn file",
  classify: "Phân loại",
  map: "Ánh xạ cột",
  clean: "Làm sạch",
  link: "Nối & rà soát",
  commit: "Ghi sổ",
  done: "Xong",
};

export const INGEST_FLOW: IngestPhase[] = ["drop", "classify", "map", "clean", "link", "commit", "done"];
export const GATES: IngestPhase[] = ["classify", "map", "clean", "link", "commit"];

export function phaseIndex(p: IngestPhase) {
  const i = INGEST_FLOW.indexOf(p);
  return i < 0 ? 0 : i;
}

export function reachedOf(s: { phase: IngestPhase; reached?: IngestPhase }) {
  return s.reached || s.phase;
}

export function prevIngestPhase(phase: IngestPhase): IngestPhase | null {
  const i = phaseIndex(phase);
  return i > 0 ? INGEST_FLOW[i - 1] : null;
}

export function canGotoPhase(s: { phase: IngestPhase; reached?: IngestPhase }, to: IngestPhase) {
  if (s.phase === "done" || to === "done") return false;
  return phaseIndex(to) <= phaseIndex(reachedOf(s));
}

export function maxReached(a: IngestPhase, b: IngestPhase): IngestPhase {
  return phaseIndex(a) >= phaseIndex(b) ? a : b;
}

export const LAYER_VN: Record<Layer, string> = {
  foundation: "Nền",
  relational: "Quan hệ",
};

export function layerOf(kind: SheetKind): Layer {
  return FOUNDATION.includes(kind) ? "foundation" : "relational";
}

export type FieldKey =
  | "student_name" | "dob" | "phone" | "guardian_name" | "guardian_phone" | "relationship" | "notes"
  | "course_name" | "subject" | "level" | "fee" | "sessions" | "duration_min"
  | "class_name" | "teacher" | "room" | "weekdays" | "start_time" | "start_date" | "capacity"
  | "room_name" | "room_type"
  | "status" | "remaining" | "paid_through"
  | "date" | "att_status"
  | "ignore";

export const FIELD_VN: Record<FieldKey, string> = {
  student_name: "Tên học sinh",
  dob: "Ngày sinh",
  phone: "SĐT HS",
  guardian_name: "Tên PH",
  guardian_phone: "SĐT PH",
  relationship: "Quan hệ",
  notes: "Ghi chú",
  course_name: "Khóa học",
  subject: "Môn",
  level: "Khối",
  fee: "Học phí",
  sessions: "Số buổi",
  duration_min: "Phút/buổi",
  class_name: "Tên lớp",
  teacher: "Giáo viên",
  room: "Phòng",
  weekdays: "Thứ",
  start_time: "Giờ",
  start_date: "Ngày bắt đầu",
  capacity: "Sĩ số",
  room_name: "Tên phòng",
  room_type: "Loại phòng",
  status: "Trạng thái",
  remaining: "Buổi còn",
  paid_through: "Đóng đến",
  date: "Ngày buổi",
  att_status: "Điểm danh",
  ignore: "Bỏ qua",
};

export const FIELDS_FOR: Record<SheetKind, FieldKey[]> = {
  STUDENT_ROSTER: ["student_name", "dob", "phone", "guardian_name", "guardian_phone", "relationship", "notes"],
  COURSE: ["course_name", "subject", "level", "fee", "sessions", "duration_min"],
  CLASS_LIST: ["class_name", "course_name", "teacher", "room", "weekdays", "start_time", "start_date", "capacity"],
  ROOM_LIST: ["room_name", "capacity", "room_type"],
  ENROLLMENT: ["student_name", "class_name", "status", "remaining"],
  BALANCE: ["student_name", "class_name", "remaining", "paid_through"],
  LESSON_LOG: ["date", "class_name", "student_name", "att_status", "teacher"],
  SCHEDULE: ["class_name", "weekdays", "start_time", "teacher", "room"],
  UNKNOWN: [],
};

export type ParsedSheet = {
  file: string;
  name: string;
  headers: string[];
  rows: string[][];
  kind: SheetKind;
  confidence: number;
};

export type ParsedFile = { name: string; sheets: ParsedSheet[] };

export type SheetMap = Record<string, FieldKey>;

export type CleanIssue = { field: FieldKey | ""; code: string; message: string };

export type CleanRecord = {
  id: string;
  kind: SheetKind;
  file: string;
  sheet: string;
  row: number;
  values: Partial<Record<FieldKey, string>>;
  issues: CleanIssue[];
  skipped: boolean;
};

export type LinkedEntity = {
  key: string;
  id: string;
  name: string;
  kind: "student" | "course" | "class" | "room" | "teacher" | "enrollment" | "lesson";
  extra?: Record<string, string | number | null>;
};

export type LinkedDump = {
  students: LinkedEntity[];
  courses: LinkedEntity[];
  classes: LinkedEntity[];
  rooms: LinkedEntity[];
  enrollments: LinkedEntity[];
  lessons: LinkedEntity[];
  attendance: Array<{ lesson_id: string; student_id: string; status: string }>;
  issues: CleanIssue[];
};

export type DupAction = "keep" | "overwrite" | "merge" | "create";
export type ConflictAction = "shift" | "room" | "ignore";
export type ConflictDim = "teacher" | "room" | "student";

export type FieldDiff = {
  field: string;
  label: string;
  existing: string;
  incoming: string;
  changed: boolean;
};

export type DuplicateHit = {
  id: string;
  kind: "student" | "class";
  row: number;
  incomingId: string;
  existingId: string;
  title: string;
  matchKey: string;
  diffs: FieldDiff[];
  action: DupAction | null;
};

export type TimeSuggestion = {
  weekday: number;
  weekdayLabel: string;
  start: string;
  label: string;
};

export type RoomSuggestion = { id: string; name: string };

export type ScheduleConflict = {
  id: string;
  incomingClassId: string;
  incomingClassName: string;
  existingClassId: string;
  existingClassName: string;
  dims: ConflictDim[];
  students: string[];
  teacher: string;
  room: string;
  weekday: number;
  weekdayLabel: string;
  incomingStart: string;
  incomingEnd: string;
  existingStart: string;
  existingEnd: string;
  suggestShift: TimeSuggestion | null;
  suggestRoom: RoomSuggestion | null;
  freeRooms: RoomSuggestion[];
  action: ConflictAction | null;
  roomId?: string;
};

export type LinkReview = {
  duplicates: DuplicateHit[];
  conflicts: ScheduleConflict[];
};

export type CommitPreview = {
  students: number;
  courses: number;
  classes: number;
  enrollments: number;
  lessons: number;
  exceptions: number;
};

export type IngestSnapshot = {
  phase: IngestPhase;
  reached?: IngestPhase;
  files: ParsedFile[];
  maps: Record<string, SheetMap>;
  mapSheet: number;
  records: CleanRecord[];
  linked: LinkedDump | null;
  review: LinkReview | null;
  result: CommitPreview | null;
};

export const EMPTY_INGEST: IngestSnapshot = {
  phase: "drop",
  files: [],
  maps: {},
  mapSheet: 0,
  records: [],
  linked: null,
  review: null,
  result: null,
};

export function fold(s: string) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

export function slug(s: string) {
  return fold(s).replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 28) || "x";
}

export function sheetKey(s: ParsedSheet) {
  return `${s.file}::${s.name}`;
}

export function allSheets(files: ParsedFile[]): ParsedSheet[] {
  return files.flatMap((f) => f.sheets);
}

const NAME_KIND: Array<{ re: RegExp; kind: SheetKind }> = [
  { re: /\b(tkb|thoi khoa bieu|lich hoc|schedule|timetable)\b/, kind: "SCHEDULE" },
  { re: /\b(so buoi|diem danh|lesson.?log|attendance)\b/, kind: "LESSON_LOG" },
  { re: /\b(so du|buoi con|con lai|balance|remaining)\b/, kind: "BALANCE" },
  { re: /\b(ghi danh|enrollment|dang ky lop)\b/, kind: "ENROLLMENT" },
  { re: /\b(phong hoc|danh sach phong|room list)\b/, kind: "ROOM_LIST" },
  { re: /\b(danh sach lop|lop hoc|class list)\b/, kind: "CLASS_LIST" },
  { re: /\b(khoa hoc|course)\b/, kind: "COURSE" },
  { re: /\b(hoc sinh|danh sach hs|student roster)\b/, kind: "STUDENT_ROSTER" },
];

const HEADER_HINTS: Array<{ re: RegExp; kind: SheetKind; w: number }> = [
  { re: /ho ten|ten hs|ten hoc sinh|student name/, kind: "STUDENT_ROSTER", w: 3 },
  { re: /ngay sinh|dob|date of birth/, kind: "STUDENT_ROSTER", w: 2 },
  { re: /phu huynh|ten ph|guardian/, kind: "STUDENT_ROSTER", w: 2 },
  { re: /ten khoa|mon hoc|content/, kind: "COURSE", w: 3 },
  { re: /hoc phi|fee|tuition/, kind: "COURSE", w: 1 },
  { re: /ten lop|class name/, kind: "CLASS_LIST", w: 3 },
  { re: /si so|capacity/, kind: "CLASS_LIST", w: 1 },
  { re: /ten phong|room name/, kind: "ROOM_LIST", w: 3 },
  { re: /ghi danh|enroll/, kind: "ENROLLMENT", w: 3 },
  { re: /buoi con|so du|remaining/, kind: "BALANCE", w: 3 },
  { re: /dong den|paid through/, kind: "BALANCE", w: 2 },
  { re: /diem danh|att status|co mat/, kind: "LESSON_LOG", w: 3 },
  { re: /ngay buoi|lesson date/, kind: "LESSON_LOG", w: 2 },
  { re: /\b(thu|weekday|t2|t3|t4|t5|t6|t7|cn)\b/, kind: "SCHEDULE", w: 3 },
  { re: /gio hoc|start time/, kind: "SCHEDULE", w: 1 },
];

const FIELD_HINTS: Array<{ re: RegExp; field: FieldKey }> = [
  { re: /ngay sinh|dob/, field: "dob" },
  { re: /sdt ph|dien thoai ph|guardian phone|phone ph/, field: "guardian_phone" },
  { re: /ten ph|phu huynh|guardian name|ho ten ph/, field: "guardian_name" },
  { re: /quan he|relationship/, field: "relationship" },
  { re: /sdt|dien thoai|phone|tel/, field: "phone" },
  { re: /ghi chu|notes/, field: "notes" },
  { re: /ho ten|ten hs|ten hoc sinh|student/, field: "student_name" },
  { re: /ten khoa|khoa hoc|course/, field: "course_name" },
  { re: /mon( hoc)?|subject/, field: "subject" },
  { re: /khoi|level|lop [0-9]/, field: "level" },
  { re: /hoc phi|fee/, field: "fee" },
  { re: /so buoi khoa|tong buoi|sessions/, field: "sessions" },
  { re: /phut|duration/, field: "duration_min" },
  { re: /ten lop|lop hoc|class/, field: "class_name" },
  { re: /giao vien|gv|teacher/, field: "teacher" },
  { re: /phong|room/, field: "room" },
  { re: /thu|weekday|lich/, field: "weekdays" },
  { re: /gio|start time|time/, field: "start_time" },
  { re: /ngay bat dau|start date/, field: "start_date" },
  { re: /si so|capacity/, field: "capacity" },
  { re: /ten phong/, field: "room_name" },
  { re: /loai phong|room type/, field: "room_type" },
  { re: /trang thai|status/, field: "status" },
  { re: /buoi con|con lai|remaining|so du/, field: "remaining" },
  { re: /dong den|paid through/, field: "paid_through" },
  { re: /ngay buoi|ngay hoc|date/, field: "date" },
  { re: /diem danh|att/, field: "att_status" },
];

export function classifySheet(fileName: string, sheetName: string, headers: string[], sampleRows: string[][]): { kind: SheetKind; confidence: number } {
  const blob = fold(`${fileName} ${sheetName}`);
  for (const h of NAME_KIND) {
    if (h.re.test(blob)) return { kind: h.kind, confidence: 0.95 };
  }
  const headerBlob = fold(headers.join(" "));
  const scores = new Map<SheetKind, number>();
  for (const h of HEADER_HINTS) {
    if (h.re.test(headerBlob)) scores.set(h.kind, (scores.get(h.kind) || 0) + h.w);
  }
  const sample = fold(sampleRows.slice(0, 3).flat().join(" "));
  if (/\b(t2|t3|t4|t5|t6|t7|cn|thu [2-7])\b/.test(headerBlob + " " + sample)) {
    scores.set("SCHEDULE", (scores.get("SCHEDULE") || 0) + 4);
  }
  let best: SheetKind = "UNKNOWN";
  let bestN = 0;
  for (const [k, n] of scores) {
    if (n > bestN) { best = k; bestN = n; }
  }
  if (bestN < 2) return { kind: "UNKNOWN", confidence: 0.2 };
  return { kind: best, confidence: Math.min(0.92, 0.4 + bestN * 0.1) };
}

export function guessMap(headers: string[], kind: SheetKind): SheetMap {
  const allowed = new Set(FIELDS_FOR[kind]);
  const used = new Set<FieldKey>();
  const map: SheetMap = {};
  for (const h of headers) {
    const f = fold(h);
    let hit: FieldKey = "ignore";
    for (const hint of FIELD_HINTS) {
      if (hint.re.test(f) && allowed.has(hint.field) && !used.has(hint.field)) {
        hit = hint.field;
        break;
      }
    }
    if (hit !== "ignore") used.add(hit);
    map[h] = hit;
  }
  return map;
}

export function toE164(raw: string): { ok: boolean; value: string } {
  const s = String(raw || "").trim();
  if (!s) return { ok: true, value: "" };
  const d = s.replace(/\D/g, "");
  if (s.startsWith("+84") && d.length === 11) return { ok: true, value: "+" + d };
  if (d.length === 11 && d.startsWith("84")) return { ok: true, value: "+" + d };
  if (d.length === 10 && d.startsWith("0")) return { ok: true, value: "+84" + d.slice(1) };
  if (d.length === 9) return { ok: true, value: "+84" + d };
  return { ok: false, value: s };
}

function cell(row: string[], headers: string[], map: SheetMap, field: FieldKey) {
  const i = headers.findIndex((h) => map[h] === field);
  return i >= 0 ? String(row[i] ?? "").trim() : "";
}

export function cleanSheet(sheet: ParsedSheet, map: SheetMap): CleanRecord[] {
  const seen = new Set<string>();
  return sheet.rows.map((row, idx) => {
    const values: Partial<Record<FieldKey, string>> = {};
    for (const f of FIELDS_FOR[sheet.kind]) {
      const v = cell(row, sheet.headers, map, f);
      if (v) values[f] = v;
    }
    const issues: CleanIssue[] = [];
    if (values.phone != null) {
      const p = toE164(values.phone);
      if (!p.ok) issues.push({ field: "phone", code: "e164", message: `SĐT không hợp lệ: ${values.phone}` });
      else values.phone = p.value;
    }
    if (values.guardian_phone != null) {
      const p = toE164(values.guardian_phone);
      if (!p.ok) issues.push({ field: "guardian_phone", code: "e164", message: `SĐT PH không hợp lệ: ${values.guardian_phone}` });
      else values.guardian_phone = p.value;
    }
    const nameKey = values.student_name || values.class_name || values.course_name || values.room_name;
    if (sheet.kind === "STUDENT_ROSTER") {
      if (!values.student_name) issues.push({ field: "student_name", code: "required", message: "Thiếu tên học sinh" });
      else {
        const k = fold(values.student_name);
        if (seen.has(k)) issues.push({ field: "student_name", code: "duplicate", message: `Trùng tên: ${values.student_name}` });
        seen.add(k);
      }
    }
    if (sheet.kind === "CLASS_LIST" && !values.class_name) issues.push({ field: "class_name", code: "required", message: "Thiếu tên lớp" });
    if (sheet.kind === "COURSE" && !values.course_name) issues.push({ field: "course_name", code: "required", message: "Thiếu khóa học" });
    const skipped = issues.some((i) => i.code === "required" || i.code === "duplicate" || i.code === "e164");
    return {
      id: `${sheet.kind}_${idx}_${slug(nameKey || "row")}`,
      kind: sheet.kind,
      file: sheet.file,
      sheet: sheet.name,
      row: idx + 2,
      values,
      issues,
      skipped,
    };
  });
}

export function cleanDump(files: ParsedFile[], maps: Record<string, SheetMap>): CleanRecord[] {
  return allSheets(files).flatMap((s) => cleanSheet(s, maps[sheetKey(s)] || guessMap(s.headers, s.kind)));
}

function recs(records: CleanRecord[], kind: SheetKind) {
  return records.filter((r) => r.kind === kind && !r.skipped);
}

export function linkDump(records: CleanRecord[]): LinkedDump {
  const issues: CleanIssue[] = [];
  const students: LinkedEntity[] = recs(records, "STUDENT_ROSTER").map((r) => ({
    key: fold(r.values.student_name || ""),
    id: "stu_" + slug(r.values.student_name || r.id),
    name: r.values.student_name || "",
    kind: "student" as const,
    extra: {
      dob: r.values.dob || "",
      phone: r.values.phone || "",
      guardian_name: r.values.guardian_name || "",
      guardian_phone: r.values.guardian_phone || "",
      relationship: r.values.relationship || "Mẹ",
      notes: r.values.notes || "",
    },
  }));
  const stuBy = new Map(students.map((s) => [s.key, s]));

  const courses: LinkedEntity[] = recs(records, "COURSE").map((r) => ({
    key: fold(r.values.course_name || ""),
    id: "crs_" + slug(r.values.course_name || r.id),
    name: r.values.course_name || "",
    kind: "course" as const,
    extra: {
      subject: r.values.subject || "",
      level: r.values.level || "",
      fee: Number(String(r.values.fee || "0").replace(/\D/g, "")) || 0,
      sessions: Number(r.values.sessions) || 0,
      duration_min: Number(r.values.duration_min) || 90,
    },
  }));
  const crsBy = new Map(courses.map((c) => [c.key, c]));

  const rooms: LinkedEntity[] = recs(records, "ROOM_LIST").map((r) => ({
    key: fold(r.values.room_name || r.values.room || ""),
    id: "rm_" + slug(r.values.room_name || r.values.room || r.id),
    name: r.values.room_name || r.values.room || "",
    kind: "room" as const,
    extra: { capacity: Number(r.values.capacity) || 12, type: r.values.room_type || "classroom" },
  }));

  const classes: LinkedEntity[] = recs(records, "CLASS_LIST").map((r) => {
    const course = crsBy.get(fold(r.values.course_name || "")) || courses.find((c) => fold(c.name).includes(fold(r.values.course_name || "").split(" ")[0] || "___"));
    return {
      key: fold(r.values.class_name || ""),
      id: "cls_" + slug(r.values.class_name || r.id),
      name: r.values.class_name || "",
      kind: "class" as const,
      extra: {
        course_id: course?.id || "",
        course_name: course?.name || r.values.course_name || "",
        teacher: r.values.teacher || "",
        room: r.values.room || "",
        weekdays: r.values.weekdays || "",
        start_time: r.values.start_time || "18:00",
        start_date: r.values.start_date || "2026-06-01",
        capacity: Number(r.values.capacity) || 12,
      },
    };
  });
  const clsBy = new Map(classes.map((c) => [c.key, c]));

  for (const r of recs(records, "SCHEDULE")) {
    const c = clsBy.get(fold(r.values.class_name || ""));
    if (!c) {
      issues.push({ field: "class_name", code: "unlinked", message: `TKB không khớp lớp: ${r.values.class_name}` });
      continue;
    }
    if (r.values.weekdays) c.extra = { ...c.extra, weekdays: r.values.weekdays };
    if (r.values.start_time) c.extra = { ...c.extra, start_time: r.values.start_time };
    if (r.values.teacher) c.extra = { ...c.extra, teacher: r.values.teacher };
    if (r.values.room) c.extra = { ...c.extra, room: r.values.room };
  }

  const enrollments: LinkedEntity[] = [];
  for (const r of recs(records, "ENROLLMENT")) {
    const stu = stuBy.get(fold(r.values.student_name || ""));
    const cls = clsBy.get(fold(r.values.class_name || ""));
    if (!stu) { issues.push({ field: "student_name", code: "unlinked", message: `Ghi danh: không thấy HS ${r.values.student_name}` }); continue; }
    if (!cls) { issues.push({ field: "class_name", code: "unlinked", message: `Ghi danh: không thấy lớp ${r.values.class_name}` }); continue; }
    enrollments.push({
      key: `${stu.id}:${cls.id}`,
      id: "enr_" + slug(`${stu.id}_${cls.id}`),
      name: `${stu.name} · ${cls.name}`,
      kind: "enrollment",
      extra: { student_id: stu.id, class_id: cls.id, status: r.values.status || "active", remaining: Number(r.values.remaining) || 0 },
    });
  }
  const enrBy = new Map(enrollments.map((e) => [e.key, e]));

  for (const r of recs(records, "BALANCE")) {
    const stu = stuBy.get(fold(r.values.student_name || ""));
    const cls = clsBy.get(fold(r.values.class_name || ""));
    if (!stu || !cls) {
      issues.push({ field: "student_name", code: "unlinked", message: `Số dư không khớp: ${r.values.student_name} / ${r.values.class_name}` });
      continue;
    }
    const e = enrBy.get(`${stu.id}:${cls.id}`);
    if (e) e.extra = { ...e.extra, remaining: Number(r.values.remaining) || 0, paid_through: r.values.paid_through || "" };
  }

  const lessons: LinkedEntity[] = [];
  const attendance: LinkedDump["attendance"] = [];
  const lesBy = new Map<string, LinkedEntity>();
  for (const r of recs(records, "LESSON_LOG")) {
    const cls = clsBy.get(fold(r.values.class_name || ""));
    const stu = stuBy.get(fold(r.values.student_name || ""));
    if (!cls) { issues.push({ field: "class_name", code: "unlinked", message: `Sổ buổi: không thấy lớp ${r.values.class_name}` }); continue; }
    if (!stu) { issues.push({ field: "student_name", code: "unlinked", message: `Sổ buổi: không thấy HS ${r.values.student_name}` }); continue; }
    const date = normalizeDate(r.values.date || "");
    const lk = `${cls.id}:${date}`;
    let les = lesBy.get(lk);
    if (!les) {
      les = {
        key: lk,
        id: "les_" + slug(`${cls.id}_${date}`),
        name: `${cls.name} ${date}`,
        kind: "lesson",
        extra: { class_id: cls.id, date, teacher: r.values.teacher || String(cls.extra?.teacher || "") },
      };
      lesBy.set(lk, les);
      lessons.push(les);
    }
    const att = fold(r.values.att_status || "present");
    const status = /vang|absent/.test(att) ? "absent" : /tre|late/.test(att) ? "late" : "present";
    attendance.push({ lesson_id: les.id, student_id: stu.id, status });
  }

  for (const r of records.filter((x) => x.skipped && x.issues.length)) {
    issues.push(...r.issues);
  }

  return { students, courses, classes, rooms, enrollments, lessons, attendance, issues };
}

export function buildCommit(linked: LinkedDump, review?: LinkReview | null): CommitPreview {
  const skipStu = new Set(
    (review?.duplicates || []).filter((d) => d.kind === "student" && d.action && d.action !== "create").map((d) => d.incomingId),
  );
  const skipCls = new Set(
    (review?.duplicates || []).filter((d) => d.kind === "class" && d.action && d.action !== "create").map((d) => d.incomingId),
  );
  return {
    students: linked.students.filter((s) => !skipStu.has(s.id)).length,
    courses: linked.courses.length,
    classes: linked.classes.filter((c) => !skipCls.has(c.id)).length,
    enrollments: linked.enrollments.length,
    lessons: linked.lessons.length,
    exceptions: linked.issues.length,
  };
}

export function exceptionCount(records: CleanRecord[], linked: LinkedDump | null) {
  const cleanN = records.filter((r) => r.issues.length).length;
  const linkN = linked?.issues.length || 0;
  return Math.max(cleanN, records.filter((r) => r.skipped).length + (linked ? linked.issues.filter((i) => i.code === "unlinked").length : 0)) || (cleanN + (linked ? linked.issues.filter((i) => i.code === "unlinked").length : 0));
}

export function stage3Payload(records: CleanRecord[]) {
  const hs = recs(records, "STUDENT_ROSTER")[0];
  const phone = hs?.values.phone || "";
  return {
    schema: "eduflow.student.v1",
    full_name: hs?.values.student_name || "",
    phone,
    e164: phone.startsWith("+84"),
  };
}

export const STAGING_TABLES: Array<{ kind: SheetKind; layer: Layer; label: string }> = KIND_ORDER.map((kind) => ({
  kind,
  layer: layerOf(kind),
  label: KIND_VN[kind],
}));

function normalizeDate(s: string) {
  const t = String(s || "").trim();
  const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vn = t.match(/(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})/);
  if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;
  return t.slice(0, 10);
}

export function parseWeekdays(s: string): number[] {
  const f = fold(s);
  const out: number[] = [];
  if (/cn|chu nhat|\b0\b/.test(f)) out.push(0);
  if (/\bt2\b|thu 2|thu hai/.test(f)) out.push(1);
  if (/\bt3\b|thu 3|thu ba/.test(f)) out.push(2);
  if (/\bt4\b|thu 4|thu tu/.test(f)) out.push(3);
  if (/\bt5\b|thu 5|thu nam/.test(f)) out.push(4);
  if (/\bt6\b|thu 6|thu sau/.test(f)) out.push(5);
  if (/\bt7\b|thu 7|thu bay/.test(f)) out.push(6);
  return out.length ? out : [6, 0];
}

function asSheet(file: string, name: string, headers: string[], rows: string[][]): ParsedSheet {
  const { kind, confidence } = classifySheet(file, name, headers, rows);
  return { file, name, headers, rows, kind, confidence };
}

export function sampleDump(): ParsedFile[] {
  const hsHeaders = ["Họ tên", "Ngày sinh", "SĐT", "Tên PH", "SĐT PH", "Quan hệ", "Ghi chú"];
  const students: string[][] = [
    ["Nguyễn Minh An", "2011-03-14", "0918 552 417", "Nguyễn Thị Hoa", "0918 552 417", "Mẹ", "Quận 3 — chuyển IELTS"],
    ["Lê Hoàng Nam", "2011-11-19", "0987 654 321", "Lê Thị Mai", "0987 654 321", "Bố", "Cầu Giấy"],
    ["Phạm Khánh Chi", "2012-04-12", "0912 345 001", "Trần Thị Lan", "0912 111 001", "Mẹ", ""],
    ["Nguyễn Khoa", "2012-09-03", "0912345002", "Nguyễn Văn Bình", "0912111002", "Bố", ""],
    ["Lê Minh Châu", "2011-11-21", "+84 912 345 003", "Lê Thị Hoa", "0912111003", "Mẹ", ""],
    ["Trần Nhật Hà", "2012-01-18", "0912 345 004", "Trần Văn Nam", "0912111004", "Bố", ""],
    ["Đỗ Gia Bảo", "2011-07-09", "0912 345 005", "Đỗ Thị Mai", "0912111005", "Mẹ", ""],
    ["Hoàng Mai Anh", "2012-03-27", "0912 345 006", "Hoàng Thị Yến", "0912111006", "Mẹ", ""],
    ["Vũ Đức Anh", "2011-12-02", "0912 345 007", "Vũ Thanh Hà", "0912111007", "Mẹ", ""],
    ["Bùi Thanh Trúc", "2012-06-15", "0912 345 008", "Bùi Văn Sơn", "0912111008", "Bố", ""],
    ["Ngô Hải Nam", "2011-05-30", "0912 345 009", "Ngô Thị Hương", "0912111009", "Mẹ", ""],
    ["Mai Khánh Linh", "2012-08-08", "0912 345 010", "Mai Văn Phúc", "0912111010", "Bố", ""],
    ["Đặng Ngọc Bích", "2011-10-19", "0912 345 011", "Đặng Thị Tâm", "0912111011", "Mẹ", ""],
    ["Trịnh Minh Khang", "2012-02-14", "0912 345 012", "Trịnh Văn Long", "0912111012", "Bố", ""],
    ["Lưu Phương Thảo", "2011-09-25", "0912 345 013", "Lưu Thị Nga", "0912111013", "Mẹ", ""],
    ["Cao Đức Long", "2012-05-06", "0912 345 014", "Cao Văn Hùng", "0912111014", "Bố", ""],
    ["Nguyễn Hà My", "2011-04-11", "0912 345 015", "Nguyễn Thị Vân", "0912111015", "Mẹ", ""],
    ["Phan Tuấn Kiệt", "2012-07-22", "0912 345 016", "Phan Thị Dung", "0912111016", "Mẹ", ""],
    ["Phạm Khánh Chi", "2012-04-12", "0912 345 001", "Trần Thị Lan", "0912 111 001", "Mẹ", ""],
    ["Hoàng Văn A", "2010-01-01", "abc", "Hoàng Thị B", "123", "Mẹ", ""],
  ];
  const courseHeaders = ["Tên khóa", "Môn", "Khối", "Học phí", "Số buổi", "Phút"];
  const courses: string[][] = [
    ["Toán 9 — Luyện thi vào 10", "Toán", "Lớp 9", "1200000", "16", "90"],
    ["Lý 10 — Cơ bản", "Lý", "Lớp 10", "1400000", "16", "90"],
    ["Anh 9 — Writing", "Anh", "Lớp 9", "3600000", "12", "90"],
    ["Hóa 10 — Đại cương", "Hóa", "Lớp 10", "1300000", "16", "90"],
    ["IELTS 7.0", "Anh", "Lớp 9", "3600000", "12", "90"],
  ];
  const classHeaders = ["Tên lớp", "Khóa học", "Giáo viên", "Phòng", "Thứ", "Giờ", "Ngày bắt đầu", "Sĩ số"];
  const classes: string[][] = [
    ["Toán 9 · T7–CN", "Toán 9 — Luyện thi vào 10", "Phạm Quốc Huy", "P203", "T7 CN", "08:00", "2026-06-07", "14"],
    ["Lý 10 · T3–T6", "Lý 10 — Cơ bản", "Phạm Quốc Huy", "P201", "T3 T6", "18:00", "2026-06-02", "10"],
    ["Anh 9 · T7–CN", "Anh 9 — Writing", "Nguyễn Thị Lan", "P203", "T7 CN", "10:00", "2026-06-07", "10"],
    ["Hóa 10 · T2–T5", "Hóa 10 — Đại cương", "Phạm Quốc Huy", "P102", "T2 T5", "19:30", "2026-06-08", "10"],
    ["IELTS 7.0 · T7", "IELTS 7.0", "Phạm Quốc Huy", "P201", "T7", "08:00", "2026-09-06", "10"],
  ];
  const enrHeaders = ["Họ tên", "Tên lớp", "Trạng thái", "Buổi còn"];
  const enrolls: string[][] = [
    ["Nguyễn Minh An", "IELTS 7.0 · T7", "active", "8"],
    ["Lê Hoàng Nam", "Toán 9 · T7–CN", "active", "10"],
    ["Phạm Khánh Chi", "Toán 9 · T7–CN", "active", "12"],
    ["Nguyễn Khoa", "Toán 9 · T7–CN", "active", "10"],
    ["Lê Minh Châu", "Lý 10 · T3–T6", "active", "8"],
    ["Trần Nhật Hà", "Anh 9 · T7–CN", "active", "9"],
    ["Đỗ Gia Bảo", "Toán 9 · T7–CN", "active", "11"],
    ["Hoàng Mai Anh", "Anh 9 · T7–CN", "active", "12"],
    ["Vũ Đức Anh", "Lý 10 · T3–T6", "active", "7"],
    ["Bùi Thanh Trúc", "Toán 9 · T7–CN", "active", "12"],
    ["Ngô Hải Nam", "Hóa 10 · T2–T5", "active", "14"],
    ["Mai Khánh Linh", "Anh 9 · T7–CN", "active", "10"],
    ["Đặng Ngọc Bích", "Lý 10 · T3–T6", "active", "9"],
    ["Trịnh Minh Khang", "Toán 9 · T7–CN", "active", "8"],
    ["Lưu Phương Thảo", "Anh 9 · T7–CN", "active", "11"],
    ["Cao Đức Long", "Hóa 10 · T2–T5", "active", "13"],
    ["Nguyễn Hà My", "Lý 10 · T3–T6", "active", "6"],
    ["Phan Tuấn Kiệt", "Hóa 12", "active", "4"],
  ];
  const balHeaders = ["Họ tên", "Tên lớp", "Buổi còn", "Đóng đến"];
  const bals: string[][] = [
    ["Phạm Khánh Chi", "Toán 9 · T7–CN", "12", "2026-09-30"],
    ["Nguyễn Khoa", "Toán 9 · T7–CN", "10", "2026-09-15"],
    ["Lê Minh Châu", "Lý 10 · T3–T6", "8", "2026-09-01"],
  ];
  const tkbHeaders = ["Tên lớp", "Thứ", "Giờ", "Giáo viên", "Phòng"];
  const tkb: string[][] = [
    ["Toán 9 · T7–CN", "T7 CN", "08:00", "Phạm Quốc Huy", "P203"],
    ["Lý 10 · T3–T6", "T3 T6", "18:00", "Phạm Quốc Huy", "P201"],
    ["Anh 9 · T7–CN", "T7 CN", "10:00", "Nguyễn Thị Lan", "P203"],
    ["Hóa 10 · T2–T5", "T2 T5", "19:30", "Phạm Quốc Huy", "P102"],
    ["IELTS 7.0 · T7", "T7", "08:00", "Phạm Quốc Huy", "P201"],
  ];
  const logHeaders = ["Ngày buổi", "Tên lớp", "Họ tên", "Điểm danh", "Giáo viên"];
  const logs: string[][] = [
    ["2026-08-23", "Toán 9 · T7–CN", "Phạm Khánh Chi", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-23", "Toán 9 · T7–CN", "Nguyễn Khoa", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-23", "Toán 9 · T7–CN", "Đỗ Gia Bảo", "vắng", "Phạm Quốc Huy"],
    ["2026-08-23", "Toán 9 · T7–CN", "Bùi Thanh Trúc", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-23", "Toán 9 · T7–CN", "Trịnh Minh Khang", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-22", "Lý 10 · T3–T6", "Lê Minh Châu", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-22", "Lý 10 · T3–T6", "Vũ Đức Anh", "trễ", "Phạm Quốc Huy"],
    ["2026-08-23", "Anh 9 · T7–CN", "Trần Nhật Hà", "có mặt", "Nguyễn Thị Lan"],
    ["2026-08-23", "Anh 9 · T7–CN", "Hoàng Mai Anh", "có mặt", "Nguyễn Thị Lan"],
    ["2026-08-16", "Toán 9 · T7–CN", "Phạm Khánh Chi", "có mặt", "Phạm Quốc Huy"],
    ["2026-08-23", "Toán 9 · T7–CN", "Trần Văn X", "có mặt", "Phạm Quốc Huy"],
  ];
  return [
    { name: "IMPACT_HocSinh.xlsx", sheets: [asSheet("IMPACT_HocSinh.xlsx", "Học sinh", hsHeaders, students)] },
    {
      name: "IMPACT_KhoaHoc.xlsx",
      sheets: [
        asSheet("IMPACT_KhoaHoc.xlsx", "Khóa học", courseHeaders, courses),
        asSheet("IMPACT_KhoaHoc.xlsx", "Danh sách lớp", classHeaders, classes),
      ],
    },
    {
      name: "IMPACT_GhiDanh.xlsx",
      sheets: [
        asSheet("IMPACT_GhiDanh.xlsx", "Ghi danh", enrHeaders, enrolls),
        asSheet("IMPACT_GhiDanh.xlsx", "Buổi còn", balHeaders, bals),
      ],
    },
    {
      name: "IMPACT_Lich.xlsx",
      sheets: [
        asSheet("IMPACT_Lich.xlsx", "TKB", tkbHeaders, tkb),
        asSheet("IMPACT_Lich.xlsx", "Sổ buổi", logHeaders, logs),
      ],
    },
  ];
}

function sheetOfWb(wb: XLSX.WorkBook, file: string, name: string): ParsedSheet {
  const ws = wb.Sheets[name];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown as string[][];
  const headers = (aoa[0] || []).map((h) => String(h || "").trim()).filter((h, i, a) => h || a.slice(i + 1).some(Boolean));
  const rows = aoa.slice(1).filter((r) => r.some((c) => String(c || "").trim())).map((r) => headers.map((_, i) => String(r[i] ?? "").trim()));
  return asSheet(file, name, headers.length ? headers : ["Cột 1"], rows);
}

export async function parseFiles(list: File[]): Promise<ParsedFile[]> {
  const out: ParsedFile[] = [];
  for (const file of list) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    out.push({ name: file.name, sheets: wb.SheetNames.map((n) => sheetOfWb(wb, file.name, n)) });
  }
  return out;
}

export function mapsFor(files: ParsedFile[]): Record<string, SheetMap> {
  const maps: Record<string, SheetMap> = {};
  for (const s of allSheets(files)) maps[sheetKey(s)] = guessMap(s.headers, s.kind);
  return maps;
}
