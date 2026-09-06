import type { Graph } from "./types";
import { nid } from "./format";
import {
  EMPTY_INGEST,
  PHASE_VN,
  allSheets,
  cleanDump,
  fold,
  linkDump,
  parseWeekdays,
  type CleanRecord,
  type IngestPhase,
  type IngestSnapshot,
  type LinkedDump,
  type LinkReview,
} from "./ingest";
import { applyReviewToLinked } from "./ingest-review";

export { EMPTY_INGEST, PHASE_VN };
export type { IngestSnapshot, IngestPhase };

export const DRAFTS_INDEX_LS = "eduflow-drafts-v1";
export const INGEST_LS = "eduflow-ingest-v1";
export const draftKey = (id: string) => `eduflow-draft-${id}`;

export type DraftMeta = {
  id: string;
  name: string;
  phase: IngestPhase;
  createdAt: number;
  updatedAt: number;
  counts: { students: number; classes: number; files: number; lessons: number };
};

export type DraftRecord = DraftMeta & {
  ingest: IngestSnapshot;
  graph: Graph;
};

export type ActivePersist = {
  ingest: IngestSnapshot;
  activeDraftId: string | null;
  workspace: "live" | "draft";
};

export function draftNameOf(ingest: IngestSnapshot, fallback = "Lô nháp") {
  const first = ingest.files[0]?.name?.replace(/\.(xlsx|xls|csv)$/i, "");
  if (first) return first.replace(/_/g, " ");
  return fallback;
}

export function countsOf(graph: Graph | null, ingest: IngestSnapshot) {
  return {
    students: graph?.students.length || ingest.records.filter((r) => r.kind === "STUDENT_ROSTER" && !r.skipped).length,
    classes: graph?.classes.length || ingest.records.filter((r) => r.kind === "CLASS_LIST" && !r.skipped).length,
    files: ingest.files.length,
    lessons: graph?.lessons.length || ingest.records.filter((r) => r.kind === "LESSON_LOG" && !r.skipped).length,
  };
}

export function readDraftIndex(): DraftMeta[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(DRAFTS_INDEX_LS);
    const list = raw ? JSON.parse(raw) as DraftMeta[] : [];
    return Array.isArray(list) ? list.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch {
    return [];
  }
}

function writeDraftIndex(list: DraftMeta[]) {
  localStorage.setItem(DRAFTS_INDEX_LS, JSON.stringify(list));
}

export function loadDraft(id: string): DraftRecord | null {
  try {
    const raw = localStorage.getItem(draftKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as DraftRecord;
  } catch {
    return null;
  }
}

export function saveDraftRecord(rec: DraftRecord) {
  const meta: DraftMeta = {
    id: rec.id,
    name: rec.name,
    phase: rec.phase,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    counts: rec.counts,
  };
  localStorage.setItem(draftKey(rec.id), JSON.stringify(rec));
  const list = readDraftIndex().filter((x) => x.id !== rec.id);
  list.unshift(meta);
  writeDraftIndex(list);
}

export function deleteDraftRecord(id: string) {
  localStorage.removeItem(draftKey(id));
  writeDraftIndex(readDraftIndex().filter((x) => x.id !== id));
}

export function persistActive(p: ActivePersist) {
  localStorage.setItem(INGEST_LS, JSON.stringify(p));
}

export function loadActive(): ActivePersist {
  try {
    const raw = localStorage.getItem(INGEST_LS);
    if (raw) {
      const p = JSON.parse(raw) as ActivePersist;
      return {
        ingest: p.ingest || EMPTY_INGEST,
        activeDraftId: p.activeDraftId || null,
        workspace: p.workspace === "draft" ? "draft" : "live",
      };
    }
  } catch { /* empty */ }
  return { ingest: { ...EMPTY_INGEST }, activeDraftId: null, workspace: "live" };
}

export function clearActive() {
  localStorage.removeItem(INGEST_LS);
}

export function newDraftId() {
  return nid("dft");
}

export function blankGraph(live: Graph): Graph {
  return {
    meta: {
      ...live.meta,
      note: "Sổ nháp — chưa ghi IMPACT",
      workspace: "draft",
    },
    settings: { ...live.settings },
    tenant: structuredClone(live.tenant),
    branches: structuredClone(live.branches),
    rooms: structuredClone(live.rooms),
    teachers: structuredClone(live.teachers),
    staff_profiles: structuredClone(live.staff_profiles),
    profile_roles: structuredClone(live.profile_roles),
    students: [],
    guardians: [],
    student_guardians: [],
    classes: [],
    courses: [],
    enrollments: [],
    payments: [],
    lessons: [],
    attendance: [],
    makeups: [],
    homework: [],
    notes: [],
    zalo_oa: structuredClone(live.zalo_oa),
    zalo_events: [],
    exceptions: [],
    timeline_events: [],
    remind_batches: [],
    remind_items: [],
    absent_ignores: [],
  };
}

function teacherIdOf(g: Graph, name: string) {
  const f = fold(name);
  return g.teachers.find((t) => fold(t.name) === f || fold(t.name).includes(f))?.id || g.teachers[0]?.id || "tch_huy";
}

function roomIdOf(g: Graph, name: string) {
  const f = fold(name);
  return g.rooms.find((r) => fold(r.name) === f)?.id || g.rooms[0]?.id || "rm_201";
}

function hhmm(s: string) {
  const m = String(s || "18:00").match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "18:00";
}

function addMin(t: string, min: number) {
  const [h, m] = t.split(":").map(Number);
  const n = h * 60 + m + min;
  return `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}

export function materializeDraft(live: Graph, ingest: IngestSnapshot): Graph {
  const g = blankGraph(live);
  let linked = ingest.linked;
  if (!linked) {
    const records = ingest.records.length ? ingest.records : (ingest.files.length ? cleanDump(ingest.files, ingest.maps) : []);
    if (records.length) linked = linkDump(records);
  }
  if (linked) fillFromLinked(g, linked);
  return g;
}

function fillFromLinked(g: Graph, linked: LinkedDump) {
  const branch = g.branches[0]?.id || "br_cg";
  for (const c of linked.courses) {
    const fee = Number(c.extra?.fee) || 0;
    const sessions = Number(c.extra?.sessions) || 0;
    g.courses.push({
      id: c.id,
      name: c.name,
      content_key: c.id.replace(/^crs_/, ""),
      subject: String(c.extra?.subject || ""),
      level: String(c.extra?.level || ""),
      duration_min: Number(c.extra?.duration_min) || 90,
      plan: {
        model: sessions ? "course" : "monthly",
        fee,
        course_sessions: sessions || undefined,
        proration: !sessions,
      },
      promotions: [],
      active: true,
    });
  }
  for (const r of linked.rooms) {
    if (g.rooms.some((x) => fold(x.name) === fold(r.name))) continue;
    g.rooms.push({
      id: r.id,
      branch_id: branch,
      name: r.name,
      capacity: Number(r.extra?.capacity) || 12,
      type: String(r.extra?.type || "classroom"),
      active: true,
      notes: "",
    });
  }
  for (const s of linked.students) {
    g.students.push({
      id: s.id,
      full_name: s.name,
      dob: String(s.extra?.dob || "2012-01-01"),
      branch_id: branch,
      phone: String(s.extra?.phone || "") || null,
      active: true,
      notes: String(s.extra?.notes || ""),
    });
    const gname = String(s.extra?.guardian_name || "");
    if (gname) {
      const gid = "grd_" + s.id.replace(/^stu_/, "");
      g.guardians.push({
        id: gid,
        full_name: gname,
        phone: String(s.extra?.guardian_phone || ""),
        relationship: String(s.extra?.relationship || "Mẹ"),
        preferred_channel: "zalo",
        zalo_status: "pending",
        zalo_user_id: null,
        consent: false,
      });
      g.student_guardians.push({ student_id: s.id, guardian_id: gid, is_primary: true, billing_contact: true });
    }
  }
  for (const c of linked.classes) {
    const time = hhmm(String(c.extra?.start_time || "18:00"));
    const days = parseWeekdays(String(c.extra?.weekdays || ""));
    const duration = 90;
    const courseId = String(c.extra?.course_id || "");
    const course = g.courses.find((x) => x.id === courseId);
    g.classes.push({
      id: c.id,
      branch_id: branch,
      name: c.name,
      content_key: course?.content_key,
      course_id: course?.id,
      default_teacher_id: teacherIdOf(g, String(c.extra?.teacher || "")),
      default_room_id: roomIdOf(g, String(c.extra?.room || "")),
      capacity: Number(c.extra?.capacity) || 12,
      recurrence: {
        duration_min: duration,
        days: days.map((weekday) => ({ weekday, start_time: time })),
        weekdays: days,
        start_time: time,
        end_time: addMin(time, duration),
      },
      start_date: String(c.extra?.start_date || "2026-06-01").slice(0, 10),
      end_date: null,
      billing_mode: course?.plan.model === "course" ? "course" : "monthly",
      fee: course?.plan.fee || 0,
      course_total_sessions: course?.plan.course_sessions,
      active: true,
      absent_deduct: "always",
    });
  }
  for (const e of linked.enrollments) {
    const sid = String(e.extra?.student_id || "");
    const cid = String(e.extra?.class_id || "");
    const remaining = Number(e.extra?.remaining) || 0;
    g.enrollments.push({
      id: e.id,
      class_id: cid,
      student_id: sid,
      status: String(e.extra?.status || "active"),
      enrolled_at: g.meta.clock,
      billing_mode: g.classes.find((c) => c.id === cid)?.billing_mode || "monthly",
      paid_through: String(e.extra?.paid_through || "") || null,
      remaining_sessions: remaining || null,
      course_done: 0,
      course_total: remaining || null,
      billing_contact_id: g.student_guardians.find((x) => x.student_id === sid)?.guardian_id || null,
    });
  }
  for (const l of linked.lessons) {
    const cls = g.classes.find((c) => c.id === String(l.extra?.class_id || ""));
    const date = String(l.extra?.date || g.meta.today);
    const rec = cls?.recurrence;
    const time = rec?.start_time || "18:00";
    const end = rec?.end_time || addMin(time, rec?.duration_min || 90);
    const start = `${date}T${time}:00+07:00`;
    const en = `${date}T${end}:00+07:00`;
    g.lessons.push({
      id: l.id,
      class_id: cls?.id || String(l.extra?.class_id || ""),
      branch_id: branch,
      teacher_id: teacherIdOf(g, String(l.extra?.teacher || cls && (g.teachers.find((t) => t.id === cls.default_teacher_id)?.name) || "")),
      room_id: cls?.default_room_id || g.rooms[0]?.id || "rm_201",
      start,
      end: en,
      status: date < g.meta.today ? "completed" : "scheduled",
      is_makeup: false,
      original_lesson_id: null,
      substitute: false,
    });
  }
  for (const a of linked.attendance) {
    const enr = g.enrollments.find((e) => e.student_id === a.student_id && g.lessons.find((l) => l.id === a.lesson_id)?.class_id === e.class_id);
    g.attendance.push({
      id: "att_" + a.lesson_id + "_" + a.student_id,
      lesson_id: a.lesson_id,
      student_id: a.student_id,
      enrollment_id: enr?.id || "",
      status: a.status,
      reason: a.status === "absent" ? "nhập sổ" : null,
      unpaid_flag: false,
    });
  }
}

function fillFromRecords(g: Graph, records: CleanRecord[]) {
  fillFromLinked(g, linkDump(records));
}

export function applyCommit(live: Graph, linked: LinkedDump, review?: LinkReview | null): Graph {
  const g = structuredClone(live);
  if (g.meta.workspace) delete (g.meta as { workspace?: string }).workspace;
  const adjusted = applyReviewToLinked(linked, review);
  const existStu = new Set(g.students.map((s) => fold(s.full_name)));
  const existCrs = new Set(g.courses.map((c) => fold(c.name)));
  const existCls = new Set(g.classes.map((c) => fold(c.name)));
  const idMap: Record<string, string> = {};
  const dupByIncoming = new Map((review?.duplicates || []).map((d) => [d.incomingId, d]));

  const draft: Graph = blankGraph(g);
  fillFromLinked(draft, adjusted);

  function patchGuardian(studentId: string, src: Graph["students"][number], mode: "overwrite" | "merge") {
    const srcLink = draft.student_guardians.find((x) => x.student_id === src.id);
    const srcGrd = srcLink ? draft.guardians.find((x) => x.id === srcLink.guardian_id) : undefined;
    if (!srcGrd) return;
    const link = g.student_guardians.find((x) => x.student_id === studentId);
    const grd = link ? g.guardians.find((x) => x.id === link.guardian_id) : undefined;
    if (!grd) return;
    if (mode === "overwrite") {
      if (srcGrd.full_name) grd.full_name = srcGrd.full_name;
      if (srcGrd.phone) grd.phone = srcGrd.phone;
      if (srcGrd.relationship) grd.relationship = srcGrd.relationship;
    } else {
      if (!grd.phone && srcGrd.phone) grd.phone = srcGrd.phone;
      if (!grd.full_name && srcGrd.full_name) grd.full_name = srcGrd.full_name;
    }
  }

  for (const s of draft.students) {
    const dup = dupByIncoming.get(s.id);
    const hit = dup
      ? g.students.find((x) => x.id === dup.existingId)
      : existStu.has(fold(s.full_name))
        ? g.students.find((x) => fold(x.full_name) === fold(s.full_name))
        : undefined;
    const action = dup?.action || (hit ? "keep" : "create");
    if (hit && action !== "create") {
      idMap[s.id] = hit.id;
      if (action === "overwrite") {
        hit.dob = s.dob || hit.dob;
        hit.phone = s.phone || hit.phone;
        hit.notes = s.notes;
        patchGuardian(hit.id, s, "overwrite");
      } else if (action === "merge") {
        if (!hit.phone && s.phone) hit.phone = s.phone;
        if (!hit.dob && s.dob) hit.dob = s.dob;
        if (s.notes && s.notes !== hit.notes) hit.notes = hit.notes ? `${hit.notes} · ${s.notes}` : s.notes;
        patchGuardian(hit.id, s, "merge");
      }
      continue;
    }
    const next = action === "create" && hit ? { ...s, id: s.id + "_new" } : s;
    if (next.id !== s.id) idMap[s.id] = next.id;
    else idMap[s.id] = next.id;
    g.students.push(next);
    for (const gd of draft.guardians.filter((x) => x.id === "grd_" + s.id.replace(/^stu_/, ""))) {
      const gid = next.id === s.id ? gd.id : "grd_" + next.id.replace(/^stu_/, "");
      if (!g.guardians.some((x) => x.id === gid)) g.guardians.push({ ...gd, id: gid });
    }
    for (const lk of draft.student_guardians.filter((x) => x.student_id === s.id)) {
      const sid = idMap[s.id] || s.id;
      const gid = next.id === s.id ? lk.guardian_id : "grd_" + next.id.replace(/^stu_/, "");
      const mapped = { ...lk, student_id: sid, guardian_id: gid };
      if (!g.student_guardians.some((x) => x.student_id === mapped.student_id && x.guardian_id === mapped.guardian_id)) {
        g.student_guardians.push(mapped);
      }
    }
  }
  for (const c of draft.courses) {
    if (existCrs.has(fold(c.name))) {
      const hit = g.courses.find((x) => fold(x.name) === fold(c.name));
      if (hit) idMap[c.id] = hit.id;
      continue;
    }
    g.courses.push(c);
    idMap[c.id] = c.id;
  }
  for (const r of draft.rooms) {
    if (g.rooms.some((x) => fold(x.name) === fold(r.name))) continue;
    g.rooms.push(r);
  }
  for (const c of draft.classes) {
    const dup = dupByIncoming.get(c.id);
    const hit = dup
      ? g.classes.find((x) => x.id === dup.existingId)
      : existCls.has(fold(c.name))
        ? g.classes.find((x) => fold(x.name) === fold(c.name))
        : undefined;
    const action = dup?.action || (hit ? "keep" : "create");
    if (hit && action !== "create") {
      idMap[c.id] = hit.id;
      if (action === "overwrite") {
        hit.default_teacher_id = c.default_teacher_id || hit.default_teacher_id;
        hit.default_room_id = c.default_room_id || hit.default_room_id;
        hit.capacity = c.capacity || hit.capacity;
        hit.recurrence = c.recurrence || hit.recurrence;
        hit.course_id = c.course_id ? (idMap[c.course_id] || c.course_id) : hit.course_id;
      }
      continue;
    }
    const nextId = action === "create" && hit ? c.id + "_new" : c.id;
    idMap[c.id] = nextId;
    g.classes.push({
      ...c,
      id: nextId,
      course_id: c.course_id ? (idMap[c.course_id] || c.course_id) : c.course_id,
    });
  }
  for (const e of draft.enrollments) {
    const sid = idMap[e.student_id] || e.student_id;
    const cid = idMap[e.class_id] || e.class_id;
    if (g.enrollments.some((x) => x.student_id === sid && x.class_id === cid)) continue;
    g.enrollments.push({
      ...e,
      student_id: sid,
      class_id: cid,
      billing_contact_id: g.student_guardians.find((x) => x.student_id === sid)?.guardian_id || e.billing_contact_id,
    });
  }
  for (const l of draft.lessons) {
    const cid = idMap[l.class_id] || l.class_id;
    if (g.lessons.some((x) => x.class_id === cid && x.start === l.start)) {
      const found = g.lessons.find((x) => x.class_id === cid && x.start === l.start);
      if (found) idMap[l.id] = found.id;
      continue;
    }
    g.lessons.push({ ...l, class_id: cid });
    idMap[l.id] = l.id;
  }
  for (const a of draft.attendance) {
    const lid = idMap[a.lesson_id] || a.lesson_id;
    const sid = idMap[a.student_id] || a.student_id;
    if (g.attendance.some((x) => x.lesson_id === lid && x.student_id === sid)) continue;
    const enr = g.enrollments.find((e) => e.student_id === sid && g.lessons.find((l) => l.id === lid)?.class_id === e.class_id);
    g.attendance.push({ ...a, lesson_id: lid, student_id: sid, enrollment_id: enr?.id || a.enrollment_id });
  }
  return g;
}

export function sheetsSummary(ingest: IngestSnapshot) {
  return allSheets(ingest.files).map((s) => ({ file: s.file, name: s.name, kind: s.kind, rows: s.rows.length }));
}
