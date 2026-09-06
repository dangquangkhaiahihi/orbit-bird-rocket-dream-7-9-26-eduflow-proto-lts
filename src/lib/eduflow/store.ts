import { create } from "zustand";
import { toast } from "sonner";
import type {
  AbsentCaseStatus, AbsentDeduct, BranchDraft, ClassDraft, CourseDraft, Device, EnrollDraft, Graph, GuardianDraft, LessonTab, MakeupGuestPick, MakeupSlot, ModalKind,
  PayDraft, PeekFrame, PeekKind, RecurrenceDay, RemindItem, Role, RoomDraft, RouteName, RouteState, StaffDraft, StudentDraft, TeacherDraft, TenantProfile, ZTab,
} from "./types";
import {
  LS, actorOf, addMinutesHhmm, classInstanceName, classIsOpenEnded, classLife, clsName, contentKeyOf, daysBetween, enumerateRecurrence, expectedRunout, extraBurnsAhead, fmtDay, fmtShort, ledgerModeOf, nid, normalizeRecurrence, one, phoneOk, remainingFromPaidThrough, rmName, schoolOrder, statusVn, stuName, tchName, toVnIso, weekdayOf,
} from "./format";
import { canSeeRoute, DRAFT_HOME, isDraftBlocked } from "./roles";
import { clearTenant, loadTenant, saveTenant } from "./tenant";
import seed from "./graph.json";
import {
  EMPTY_INGEST, applyCommit, clearActive, countsOf, deleteDraftRecord, draftNameOf,
  loadActive, loadDraft, materializeDraft, newDraftId, persistActive, readDraftIndex, saveDraftRecord,
  type DraftMeta, type IngestSnapshot,
} from "./draft";
import { buildCommit, canGotoPhase, cleanDump, guessMap, linkDump, mapsFor, maxReached, phaseIndex, prevIngestPhase, reachedOf, sheetKey, type ConflictAction, type DupAction, type FieldKey, type IngestPhase, type ParsedFile, type SheetKind } from "./ingest";
import { buildReview, detectConflicts, reviewPending } from "./ingest-review";
import {
  clashNote, occupancyOnDate, projectedOccupancy, roomClash, slotClash, teacherClash,
  type ClashParty, type OccupancyHold, type SlotClash,
} from "./clash";
import { applyClassSchedule, applyOccurrence, materializeNewClass, type OccurrencePatch, type RecurrencePatch, type ScheduleResult } from "./schedule";
export { clashNote, occupancyOnDate, projectedOccupancy, roomClash, slotClash, teacherClash };
export type { ClashParty, OccupancyHold, SlotClash, ScheduleResult, RecurrencePatch, OccurrencePatch };

function enrollOf(g: Graph, studentId: string, classId: string) {
  return g.enrollments.find((e) => e.student_id === studentId && e.class_id === classId);
}
function roster(g: Graph, classId: string) {
  return g.enrollments.filter((e) => e.class_id === classId && e.status === "active");
}
export function guardianOf(g: Graph, studentId: string) {
  const link = g.student_guardians.find((x) => x.student_id === studentId && x.billing_contact);
  return link ? one(g.guardians, link.guardian_id) : null;
}
function attOf(g: Graph, lessonId: string, studentId: string) {
  return g.attendance.find((a) => a.lesson_id === lessonId && a.student_id === studentId);
}
export function confirmedGuests(g: Graph, lessonId: string) {
  return g.makeups.filter((m) => m.target_lesson_id === lessonId && m.status === "confirmed");
}
export function isMakeupGuest(g: Graph, lessonId: string, studentId: string) {
  return g.makeups.some((m) => m.target_lesson_id === lessonId && m.student_id === studentId && m.status === "confirmed");
}
export function absentDeductOf(g: Graph, classId: string): AbsentDeduct {
  return one(g.classes, classId)?.absent_deduct === "on_makeup" ? "on_makeup" : "always";
}
export function attBurns(
  g: Graph,
  lesson: Graph["lessons"][number],
  studentId: string,
  status: string,
  guest?: Graph["makeups"][number],
) {
  if (status !== "present" && status !== "late" && status !== "absent") return false;
  const srcClassId = guest
    ? one(g.lessons, guest.source_lesson_id)?.class_id || ""
    : lesson.class_id;
  const policy = absentDeductOf(g, srcClassId);
  if (guest) {
    if (status !== "present" && status !== "late") return false;
    return policy === "on_makeup";
  }
  if (status === "present" || status === "late") return true;
  return policy === "always";
}
export type AbsentCase = {
  id: string;
  student_id: string;
  enrollment_id: string;
  class_id: string;
  lesson_id: string;
  start: string;
  reason: string | null;
  status: AbsentCaseStatus;
};
export function absentCaseStatus(g: Graph, a: Graph["attendance"][number]): AbsentCaseStatus {
  if ((g.absent_ignores || []).some((x) => x.student_id === a.student_id && x.source_lesson_id === a.lesson_id)) return "ignored";
  const mk = g.makeups.find((m) => m.source_lesson_id === a.lesson_id && m.student_id === a.student_id);
  if (!mk) return "need_makeup";
  if (mk.status === "confirmed" || mk.status === "waiting_parent" || mk.status === "draft" || mk.status === "declined") return mk.status as AbsentCaseStatus;
  return "need_makeup";
}
export function openAbsents(g: Graph): AbsentCase[] {
  return g.attendance
    .filter((a) => a.status === "absent")
    .flatMap((a) => {
      const les = one(g.lessons, a.lesson_id);
      if (!les || les.is_makeup) return [];
      return [{
        id: a.id,
        student_id: a.student_id,
        enrollment_id: a.enrollment_id,
        class_id: les.class_id,
        lesson_id: a.lesson_id,
        start: les.start,
        reason: a.reason,
        status: absentCaseStatus(g, a),
      }];
    })
    .sort((a, b) => b.start.localeCompare(a.start) || a.student_id.localeCompare(b.student_id));
}
export function siblingClasses(g: Graph, classId: string) {
  const c = one(g.classes, classId);
  if (!c) return [];
  if (c.course_id) return g.classes.filter((x) => x.id !== classId && x.active && x.course_id === c.course_id);
  const key = contentKeyOf(c);
  return g.classes.filter((x) => x.id !== classId && x.active && contentKeyOf(x) === key);
}
export function nextSiblingLessons(g: Graph, sourceLessonId: string) {
  const les = one(g.lessons, sourceLessonId);
  if (!les) return [];
  const ids = new Set(siblingClasses(g, les.class_id).map((c) => c.id));
  if (!ids.size) return [];
  return g.lessons
    .filter((l) => ids.has(l.class_id) && l.start > les.start && l.status !== "cancelled" && !l.is_makeup)
    .sort((a, b) => a.start.localeCompare(b.start));
}
export function unpaid(enr: Graph["enrollments"][number] | undefined) {
  if (!enr) return false;
  return (enr.remaining_sessions || 0) <= 0;
}
export function unpaidLearned(g: Graph, enrollmentId: string) {
  return g.attendance.filter((a) => (
    a.enrollment_id === enrollmentId
    && a.unpaid_flag
    && (a.status === "present" || a.status === "late")
  ));
}
export function billingLabel(g: Graph | null | undefined, enr: Graph["enrollments"][number] | undefined) {
  if (!enr) return "—";
  const n = enr.remaining_sessions ?? 0;
  const debt = g ? unpaidLearned(g, enr.id).length : 0;
  if (n <= 0) return debt ? `hết buổi học · nợ ${debt}` : "hết buổi học";
  if (!g) return `còn ${n} buổi học`;
  const until = expectedRunout(g, enr);
  const extra = extraBurnsAhead(g, enr);
  const run = until ? `hết ~${fmtShort(until)}` : "hết theo lịch";
  return extra ? `còn ${n} buổi học · ${run} · ${extra} bù` : `còn ${n} buổi học · ${run}`;
}

export type EnrollPayKind = "pay_ok" | "pay_low" | "pay_empty" | "pay_debt" | "pay_deposit";
const PAY_RANK: Record<EnrollPayKind, number> = { pay_debt: 0, pay_empty: 1, pay_deposit: 2, pay_low: 3, pay_ok: 4 };

export function enrollPayKind(g: Graph, e: Graph["enrollments"][number]): EnrollPayKind {
  const debt = unpaidLearned(g, e.id).length;
  const n = e.remaining_sessions ?? 0;
  if (debt > 0) return "pay_debt";
  if ((e.deposit_held || 0) > 0 && n <= 0) return "pay_deposit";
  if (n <= 0) return "pay_empty";
  if (n <= 2) return "pay_low";
  return "pay_ok";
}

export function studentPayKind(g: Graph, studentId: string): EnrollPayKind | null {
  const ens = g.enrollments.filter((e) => e.student_id === studentId);
  if (!ens.length) return null;
  return ens.slice().sort((a, b) => PAY_RANK[enrollPayKind(g, a)] - PAY_RANK[enrollPayKind(g, b)]).map((e) => enrollPayKind(g, e))[0];
}

export function studentLife(g: Graph, studentId: string): "active" | "paused" | "dropped" | "trial" | null {
  const ens = g.enrollments.filter((e) => e.student_id === studentId);
  if (!ens.length) return null;
  if (ens.some((e) => e.status === "active")) return "active";
  if (ens.some((e) => e.status === "trial")) return "trial";
  if (ens.some((e) => e.status === "paused")) return "paused";
  return "dropped";
}

export function creditAlerts(g: Graph): Graph["exceptions"] {
  const seen = new Set(g.exceptions.filter((x) => x.lane === "money" && x.student_id).map((x) => x.student_id));
  const out: Graph["exceptions"] = [];
  for (const e of g.enrollments) {
    if (e.status !== "active") continue;
    const k = enrollPayKind(g, e);
    if (k !== "pay_low" && k !== "pay_empty" && k !== "pay_debt") continue;
    if (seen.has(e.student_id)) continue;
    seen.add(e.student_id);
    const les = g.lessons.filter((l) => l.class_id === e.class_id && l.status !== "cancelled").sort((a, b) => a.start.localeCompare(b.start));
    const lessonId = les.find((l) => l.start.slice(0, 10) >= g.meta.today)?.id || les.at(-1)?.id || "";
    out.push({
      id: `ex_credit_${e.id}`,
      lane: "money",
      lesson_id: lessonId,
      student_id: e.student_id,
      title: `${stuName(g, e.student_id)} · ${statusVn(k)}`,
      detail: `${clsName(g, e.class_id)} · ${billingLabel(g, e)}`,
      cta: "Thu học phí",
      tab: null,
    });
  }
  return out;
}

export type RemindHit = RemindItem & { student: string; className: string; guardian: string; zalo: string };

export function remindDaysOf(g: Graph) {
  return g.settings?.remind_days_before ?? 14;
}

export function remindBodyOf(g: Graph, e: Graph["enrollments"][number], reason: RemindItem["reason"]) {
  const stu = stuName(g, e.student_id);
  const cls = clsName(g, e.class_id);
  const grd = e.billing_contact_id ? one(g.guardians, e.billing_contact_id) : guardianOf(g, e.student_id);
  const ph = grd?.full_name || "PH";
  const n = e.remaining_sessions ?? 0;
  const until = expectedRunout(g, e);
  const debt = unpaidLearned(g, e.id).length;
  const bits: string[] = [`${ph} ơi,`];
  if (reason === "runout" || reason === "both") {
    if (n <= 0) bits.push(`${stu} lớp ${cls} đã hết buổi học.`);
    else bits.push(`${stu} lớp ${cls} còn ${n} buổi học, dự kiến hết ~${until ? fmtShort(until) : "—"}.`);
    bits.push("Nhờ nạp thêm để em không bị gián đoạn.");
  }
  if (reason === "debt" || reason === "both") {
    bits.push(`${stu} đã học ${debt} buổi chưa đóng. Nhờ hoàn tất học phí.`);
  }
  return bits.join(" ");
}

export function remindCandidates(g: Graph, daysBefore?: number): RemindHit[] {
  const days = daysBefore ?? remindDaysOf(g);
  const out: RemindHit[] = [];
  for (const e of g.enrollments) {
    if (e.status !== "active" && e.status !== "paused") continue;
    const cls = one(g.classes, e.class_id);
    if (!cls) continue;
    const life = classLife(g, cls);
    if (life === "cancelled") continue;
    const open = e.status === "active" && life === "running" && classIsOpenEnded(g, e.class_id);
    const debt = unpaidLearned(g, e.id).length;
    const n = e.remaining_sessions ?? 0;
    const until = expectedRunout(g, e);
    let daysLeft: number | null = null;
    if (until) daysLeft = daysBetween(g.meta.today, until);
    else if (open && n <= 0) daysLeft = 0;
    const runout = open && daysLeft != null && daysLeft <= days;
    if (!runout && debt <= 0) continue;
    const reason = runout && debt > 0 ? "both" : debt > 0 ? "debt" : "runout";
    const grd = e.billing_contact_id ? one(g.guardians, e.billing_contact_id) : guardianOf(g, e.student_id);
    out.push({
      id: e.id,
      batch_id: "",
      enrollment_id: e.id,
      student_id: e.student_id,
      class_id: e.class_id,
      guardian_id: grd?.id || null,
      reason,
      remaining: n,
      runout_date: until,
      days_left: daysLeft,
      debt,
      body: remindBodyOf(g, e, reason),
      status: "queued",
      fail_reason: null,
      zalo_event_id: null,
      student: stuName(g, e.student_id),
      className: clsName(g, e.class_id),
      guardian: grd?.full_name || "—",
      zalo: grd?.zalo_status || "—",
    });
  }
  out.sort((a, b) => (a.days_left ?? 99) - (b.days_left ?? 99) || b.debt - a.debt);
  return out;
}

function hydrateGraph(raw: Graph): Graph {
  const g = raw;
  const isDraft = g.meta?.workspace === "draft";
  if (!Array.isArray(g.payments)) g.payments = [];
  if (!Array.isArray(g.remind_batches)) g.remind_batches = [];
  if (!Array.isArray(g.remind_items)) g.remind_items = [];
  if (!Array.isArray(g.absent_ignores)) g.absent_ignores = [];
  if (!g.settings) g.settings = { remind_days_before: 14 };
  if (g.settings.remind_days_before == null || g.settings.remind_days_before < 1) g.settings.remind_days_before = 14;
  if (!isDraft && (!Array.isArray(g.courses) || !g.courses.length)) {
    g.courses = structuredClone((seed as Graph).courses || []);
  }
  if (!Array.isArray(g.courses)) g.courses = [];
  for (const c of g.classes) {
    const n = normalizeRecurrence(c.recurrence);
    const first = n.days[0];
    c.recurrence = {
      duration_min: n.duration_min,
      days: n.days,
      weekdays: n.days.map((d) => d.weekday),
      start_time: first?.start_time,
      end_time: first ? addMinutesHhmm(first.start_time, n.duration_min) || first.start_time : undefined,
    };
    if (!isDraft) {
      if (!c.course_id) {
        const named = g.courses.find((x) => x.name === c.name);
        const key = c.content_key || contentKeyOf(c);
        const hit = named || g.courses.find((x) => x.content_key === key);
        if (hit) {
          c.course_id = hit.id;
          if (!c.content_key) c.content_key = hit.content_key;
        }
      } else {
        const crs = one(g.courses, c.course_id);
        const named = g.courses.find((x) => x.name === c.name);
        if (named && named.id !== c.course_id) {
          c.course_id = named.id;
          c.content_key = named.content_key;
        } else if (c.content_key && crs && crs.content_key !== c.content_key) {
          const hit = g.courses.find((x) => x.content_key === c.content_key);
          if (hit) c.course_id = hit.id;
        }
      }
      const crs = c.course_id ? one(g.courses, c.course_id) : undefined;
      if (crs && (!c.name?.trim() || c.name.trim() === crs.name)) {
        c.name = classInstanceName(crs.name, c.recurrence);
      }
    }
    if (c.absent_deduct !== "on_makeup") c.absent_deduct = "always";
  }
  for (const e of g.enrollments) {
    if (e.remaining_sessions == null) e.remaining_sessions = remainingFromPaidThrough(g, e);
  }
  return g;
}

function hashOf(r: RouteState) {
  if (r.n === "buoi-detail") return `#/buoi/${r.id}/${r.tab || "attendance"}`;
  if (r.n === "lop-detail") return `#/lop/${r.id}`;
  if (r.n === "hs-detail") return `#/hoc-sinh/${r.id}`;
  if (r.n === "zalo-detail") return `#/zalo/${r.id}`;
  if (r.n === "phong-detail") return `#/phong/${r.id}`;
  if (r.n === "gv-detail") return `#/giao-vien/${r.id}`;
  if (r.n === "staff-detail") return `#/nhan-su/${r.id}`;
  if (r.n === "chi-nhanh" && r.id) return `#/chi-nhanh/${r.id}`;
  if (r.n === "khoa-hoc-detail") return `#/khoa-hoc/${r.id}`;
  if (r.n === "thu-phi" && r.id) return `#/thu-phi/${r.id}`;
  if (r.n === "nhac-nap-detail") return `#/nhac-nap/${r.id}`;
  if (r.n === "nhac-nap") return `#/nhac-nap`;
  if (r.n === "lop-moi") return r.id ? `#/lop-moi/${r.id}` : `#/lop-moi`;
  if (r.n === "vang") return `#/vang`;
  if (r.n === "buoi-bu") return r.id ? `#/buoi-bu/${r.id}` : `#/buoi-bu`;
  if (r.n === "the") return `#/the/${r.z || "z2"}`;
  return `#/${r.n}`;
}

function parseHash(): RouteState {
  const h = (location.hash || "#/hom-nay").replace(/^#\/?/, "");
  const p = h.split("/").filter(Boolean);
  const tab = (p[2] as LessonTab) || "attendance";
  if (p[0] === "buoi" && p[1]) return { n: "buoi-detail", id: p[1], tab, z: "z2" };
  if (p[0] === "lop-moi") return { n: "lop-moi", id: p[1] || null, tab: "attendance", z: "z2" };
  if (p[0] === "vang") return { n: "vang", id: null, tab: "attendance", z: "z2" };
  if (p[0] === "buoi-bu") return { n: "buoi-bu", id: p[1] || null, tab: "attendance", z: "z2" };
  if (p[0] === "lop" && p[1]) return { n: "lop-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "hoc-sinh" && p[1]) return { n: "hs-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "zalo" && p[1]) return { n: "zalo-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "phong" && p[1]) return { n: "phong-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "giao-vien" && p[1]) return { n: "gv-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "nhan-su" && p[1]) return { n: "staff-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "chi-nhanh" && p[1]) return { n: "chi-nhanh", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "khoa-hoc" && p[1]) return { n: "khoa-hoc-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "khoa-hoc") return { n: "khoa-hoc", id: null, tab: "attendance", z: "z2" };
  if (p[0] === "thu-phi") return { n: "thu-phi", id: p[1] || null, tab: "attendance", z: "z2" };
  if (p[0] === "so-thu") return { n: "so-thu", id: null, tab: "attendance", z: "z2" };
  if (p[0] === "nhac-nap" && p[1]) return { n: "nhac-nap-detail", id: p[1], tab: "attendance", z: "z2" };
  if (p[0] === "nhac-nap") return { n: "nhac-nap", id: null, tab: "attendance", z: "z2" };
  if (p[0] === "the") return { n: "the", id: null, tab: "attendance", z: (p[1] as ZTab) || "z2" };
  return { n: (p[0] as RouteName) || "hom-nay", id: null, tab: "attendance", z: "z2" };
}

type EduState = {
  graph: Graph | null;
  ready: boolean;
  rev: number;
  device: Device;
  role: Role;
  route: RouteState;
  modal: ModalKind;
  editId: string | null;
  peekStack: PeekFrame[];
  makeupPick: MakeupGuestPick[];
  makeupSlot: MakeupSlot | null;
  tenant: TenantProfile | null;
  load: () => Promise<void>;
  reset: () => Promise<void>;
  completeOnboarding: (profile: TenantProfile) => void;
  replayOnboarding: () => void;
  setDevice: (d: Device) => void;
  setRole: (r: Role) => void;
  go: (n: RouteName, id?: string | null, extra?: { tab?: LessonTab; z?: ZTab }) => void;
  setTab: (tab: LessonTab) => void;
  setModal: (m: ModalKind, editId?: string | null) => void;
  openPeek: (kind: PeekKind, id: string, extra?: { tab?: LessonTab }) => void;
  pushPeek: (kind: PeekKind, id: string) => void;
  popPeek: () => void;
  peekTo: (index: number) => void;
  closePeek: () => void;
  syncHash: () => void;
  markAtt: (lessonId: string, studentId: string, status: string, reason?: string | null, silent?: boolean) => void;
  bulkPresent: (lessonId: string) => void;
  completeLesson: (lessonId: string) => void;
  cancelLesson: (lessonId: string) => void;
  offerMakeup: (sourceLessonId: string, studentId: string, option: number, targetLessonId: string | null) => void;
  approveSend: (mkId: string) => void;
  parentReply: (mkId: string, accept: boolean) => void;
  resend: (evId: string) => void;
  receivePayment: (d: PayDraft) => void;
  remind: (enrId: string) => void;
  setRemindDays: (n: number) => void;
  createRemindBatch: (daysBefore?: number) => string | null;
  sendRemindBatch: (id: string) => void;
  assignHw: (lessonId: string) => void;
  markHw: (hwId: string, studentId: string, mark: string) => void;
  addNote: (lessonId: string, body: string) => void;
  linkOanh: () => void;
  createAdhoc: (p: { class_id: string; teacher_id: string; room_id: string; start: string; duration_min?: number; stay?: boolean }) => boolean;
  createMakeupLesson: (p: {
    class_id: string;
    teacher_id: string;
    room_id: string;
    start: string;
    duration_min: number;
    guests: MakeupGuestPick[];
  }) => boolean;
  startMakeup: (guests: MakeupGuestPick[], slot?: MakeupSlot | null) => void;
  ignoreAbsent: (studentId: string, sourceLessonId: string) => void;
  unignoreAbsent: (studentId: string, sourceLessonId: string) => void;
  setAbsentDeduct: (classId: string, value: AbsentDeduct) => void;
  doSub: (lessonId: string, teacherId: string) => boolean;
  createStudent: (d: StudentDraft) => void;
  updateStudent: (id: string, d: StudentDraft) => void;
  createGuardian: (d: GuardianDraft) => void;
  createRoom: (d: RoomDraft) => void;
  updateRoom: (id: string, d: RoomDraft) => void;
  createTeacher: (d: TeacherDraft) => void;
  updateTeacher: (id: string, d: TeacherDraft) => void;
  createClass: (draft: ClassDraft) => ScheduleResult | null;
  createCourse: (d: CourseDraft) => void;
  createEnroll: (d: EnrollDraft) => string | null;
  updateEnroll: (id: string, d: EnrollDraft) => void;
  createStaff: (d: StaffDraft) => void;
  updateStaff: (id: string, d: StaffDraft) => void;
  deleteStaff: (id: string) => void;
  createBranch: (d: BranchDraft) => void;
  updateBranch: (id: string, d: BranchDraft) => void;
  deleteBranch: (id: string) => void;
  deleteRoom: (id: string) => void;
  deleteTeacher: (id: string) => void;
  deleteStudent: (id: string) => void;
  deleteClass: (id: string) => void;
  updateClass: (id: string, d: {
    name: string; teacher_id: string; room_id: string; capacity: number;
    duration_min?: number; days?: RecurrenceDay[]; start_date?: string; end_date?: string | null; absent_deduct?: AbsentDeduct;
  }) => ScheduleResult | null;
  updateLessonOccurrence: (p: OccurrencePatch) => ScheduleResult | null;
  applyThisAndFuture: (classId: string, fromLessonId: string, patch: RecurrencePatch) => ScheduleResult | null;
  updateCourse: (id: string, d: CourseDraft) => void;
  deleteCourse: (id: string) => void;
  deletePayment: (id: string) => void;
  deleteRemindBatch: (id: string) => void;
  connectOA: (connected: boolean) => void;
  setWebhook: (ok: boolean) => void;
  toggleTemplate: (key: string) => void;
  workspace: "live" | "draft";
  liveGraph: Graph | null;
  activeDraftId: string | null;
  drafts: DraftMeta[];
  ingest: IngestSnapshot;
  patchIngest: (p: Partial<IngestSnapshot>) => void;
  beginIngest: (files: ParsedFile[]) => void;
  setSheetKind: (key: string, kind: SheetKind) => void;
  setMapField: (sheet: string, header: string, field: FieldKey) => void;
  setMapSheet: (i: number) => void;
  advanceIngest: () => void;
  retreatIngest: () => void;
  gotoIngestPhase: (phase: IngestPhase) => void;
  abortIngest: () => void;
  autosaveDraft: () => void;
  saveDraft: () => void;
  openDraftDesk: () => void;
  resumeDraft: (id: string, opts?: { openDesk?: boolean }) => void;
  exitDraft: () => void;
  deleteDraft: (id: string) => void;
  commitIngest: () => void;
  resolveDuplicate: (id: string, action: DupAction) => void;
  resolveAllDuplicates: (kind: "student" | "class" | "all", action: DupAction) => void;
  resolveConflict: (id: string, action: ConflictAction, roomId?: string) => void;
  ensureReview: () => void;
};

export const PEEK_PAGE: Partial<Record<PeekKind, RouteName>> = {
  course: "khoa-hoc-detail",
  class: "lop-detail",
  student: "hs-detail",
  room: "phong-detail",
  teacher: "gv-detail",
  staff: "staff-detail",
  lesson: "buoi-detail",
  zalo: "zalo-detail",
  branch: "chi-nhanh",
  enrollment: "lop-detail",
  guardian: "hs-detail",
};

function liveOf(get: () => EduState): Graph {
  if (get().workspace === "draft" && get().liveGraph) return get().liveGraph!;
  const g = get().graph;
  if (g && g.meta?.workspace !== "draft") return g;
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(LS);
    if (raw) {
      try { return hydrateGraph(JSON.parse(raw)); } catch { /* keep */ }
    }
  }
  return hydrateGraph(structuredClone(seed) as Graph);
}

function persistNow(get: () => EduState) {
  persistActive({ ingest: get().ingest, activeDraftId: get().activeDraftId, workspace: get().workspace });
}

const DRAFT_OPS_MSG = "Sổ nháp chỉ để rà dữ liệu — tắt chức năng vận hành";
function blockDraftOps(get: () => EduState) {
  if (get().workspace !== "draft") return false;
  toast(DRAFT_OPS_MSG);
  return true;
}

function leaveIf(get: () => EduState, kind: PeekKind, id: string, list: RouteName) {
  if (get().peekStack.some((p) => p.kind === kind && p.id === id)) get().closePeek();
  if (get().route.id === id) get().go(list);
}

function bump(set: (p: Partial<EduState>) => void, get: () => EduState) {
  const g = get().graph;
  if (!g) return;
  if (get().workspace === "draft") {
    const id = get().activeDraftId;
    if (id) {
      const ingest = get().ingest;
      const rec = loadDraft(id);
      saveDraftRecord({
        id,
        name: rec?.name || draftNameOf(ingest),
        phase: ingest.phase,
        createdAt: rec?.createdAt || Date.now(),
        updatedAt: Date.now(),
        counts: countsOf(g, ingest),
        ingest,
        graph: g,
      });
      set({ drafts: readDraftIndex() });
    }
  } else if (g.meta?.workspace !== "draft") {
    localStorage.setItem(LS, JSON.stringify(g));
  }
  set({ graph: { ...g }, rev: get().rev + 1 });
}

function addTimeline(g: Graph, role: Role, lessonId: string, kind: string, text: string) {
  g.timeline_events.unshift({
    id: nid("tl"),
    at: g.meta.clock,
    lesson_id: lessonId,
    actor: role === "teacher" ? "stf_huy" : "stf_trang",
    kind,
    text,
  });
}

export const useEdu = create<EduState>((set, get) => ({
  graph: hydrateGraph(structuredClone(seed) as Graph),
  ready: true,
  rev: 0,
  device: "web",
  role: "ops",
  route: { n: "hom-nay", id: null, tab: "attendance", z: "z2" },
  modal: null,
  editId: null,
  peekStack: [],
  makeupPick: [],
  makeupSlot: null,
  tenant: null,
  workspace: "live",
  liveGraph: null,
  activeDraftId: null,
  drafts: [],
  ingest: { ...EMPTY_INGEST },

  load: async () => {
    if (typeof window === "undefined") return;
    let g: Graph = get().graph || hydrateGraph(structuredClone(seed) as Graph);
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LS);
      if (raw) {
        try { g = hydrateGraph(JSON.parse(raw)); } catch { /* keep seed */ }
      }
    }
    const tenant = loadTenant();
    if (tenant) {
      g.tenant.name = tenant.business_name;
      g.meta.tenant_name = tenant.business_name;
      if (tenant.campus?.branch_name) {
        const br = g.branches[0];
        if (br) br.name = tenant.campus.branch_name;
      }
    }
    const route = typeof location !== "undefined" ? parseHash() : get().route;
    const device: Device = route.n === "the" ? "zalo" : get().device;
    const role: Role = tenant?.identity_type === "SOLO" ? "ops" : get().role;
    const active = typeof localStorage !== "undefined" ? loadActive() : { ingest: { ...EMPTY_INGEST }, activeDraftId: null, workspace: "live" as const };
    const drafts = typeof localStorage !== "undefined" ? readDraftIndex() : [];
    let workspace: "live" | "draft" = "live";
    let liveGraph: Graph | null = null;
    let graph = g;
    if (active.workspace === "draft" && active.activeDraftId) {
      const rec = loadDraft(active.activeDraftId);
      if (rec?.graph) {
        workspace = "draft";
        liveGraph = g;
        graph = hydrateGraph(rec.graph);
      }
    }
    let nextRoute = route;
    if (workspace === "draft" && isDraftBlocked(route.n)) {
      nextRoute = { n: DRAFT_HOME, id: null, tab: "attendance", z: "z2" };
      if (typeof location !== "undefined") location.hash = hashOf(nextRoute);
    }
    set({
      graph, ready: true, route: nextRoute, device, tenant, role, drafts,
      ingest: active.ingest || { ...EMPTY_INGEST },
      activeDraftId: active.activeDraftId,
      workspace,
      liveGraph,
    });
  },
  reset: async () => {
    localStorage.removeItem(LS);
    const g = hydrateGraph(structuredClone(seed) as Graph);
    const tenant = get().tenant;
    if (tenant) {
      g.tenant.name = tenant.business_name;
      g.meta.tenant_name = tenant.business_name;
    }
    set({ graph: g, rev: get().rev + 1, modal: null });
    toast("Đã reset sổ");
  },
  completeOnboarding: (profile) => {
    saveTenant(profile);
    const g = get().graph || hydrateGraph(structuredClone(seed) as Graph);
    g.tenant.id = profile.tenant_id;
    g.tenant.name = profile.business_name;
    g.meta.tenant_name = profile.business_name;
    g.tenant.phone = profile.phone;
    if (profile.campus?.branch_name && g.branches[0]) g.branches[0].name = profile.campus.branch_name;
    if (profile.campus?.room_name && g.rooms[0]) g.rooms[0].name = profile.campus.room_name;
    localStorage.setItem(LS, JSON.stringify(g));
    set({
      tenant: profile,
      graph: { ...g },
      role: "ops",
      route: { n: "hom-nay", id: null, tab: "attendance", z: "z2" },
      peekStack: [],
      modal: null,
      rev: get().rev + 1,
    });
    if (typeof location !== "undefined") location.hash = "#/hom-nay";
  },
  replayOnboarding: () => {
    clearTenant();
    set({ tenant: null, peekStack: [], modal: null });
  },
  setDevice: (d) => {
    if (d === "zalo" && get().workspace === "draft") {
      toast("Sổ nháp không mở thẻ Zalo");
      return;
    }
    if (d === "zalo") get().go("the", null, { z: "z2" });
    else if (get().route.n === "the") get().go(get().workspace === "draft" ? DRAFT_HOME : "hom-nay");
    else set({ device: d });
  },
  setRole: (r) => {
    const identity = get().tenant?.identity_type;
    if (identity === "SOLO") return;
    set({ role: r, peekStack: [] });
    if (!canSeeRoute(r, get().route.n, identity, get().workspace)) {
      get().go(get().workspace === "draft" ? DRAFT_HOME : "hom-nay");
    }
  },
  go: (n, id, extra) => {
    if (get().workspace === "draft" && isDraftBlocked(n)) {
      toast(DRAFT_OPS_MSG);
      if (isDraftBlocked(get().route.n)) {
        n = DRAFT_HOME;
        id = null;
      } else {
        return;
      }
    }
    const route: RouteState = {
      n,
      id: id ?? null,
      tab: extra?.tab || get().route.tab || "attendance",
      z: extra?.z || get().route.z,
    };
    const device: Device = n === "the" ? "zalo" : get().device === "zalo" ? "web" : get().device;
    set({ route, modal: null, editId: null, device, peekStack: [] });
    if (typeof location !== "undefined") location.hash = hashOf(route);
  },
  setTab: (tab) => {
    const route = { ...get().route, tab };
    set({ route });
    if (typeof location !== "undefined") location.hash = hashOf(route);
  },
  setModal: (m, editId) => {
    if (m === "pay" && blockDraftOps(get)) return;
    set({ modal: m, editId: m ? editId ?? null : null });
  },
  openPeek: (kind, id, extra) => set({ peekStack: [{ kind, id, tab: extra?.tab }] }),
  pushPeek: (kind, id) => {
    const stack = get().peekStack;
    const last = stack[stack.length - 1];
    if (last && last.kind === kind && last.id === id) return;
    if (stack.length >= 3) {
      const page = PEEK_PAGE[kind];
      if (page) {
        const targetId = kind === "enrollment" ? (one(get().graph?.enrollments || [], id)?.class_id || id) : id;
        get().go(page, targetId);
      }
      return;
    }
    set({ peekStack: [...stack, { kind, id }] });
  },
  popPeek: () => set({ peekStack: get().peekStack.slice(0, -1) }),
  peekTo: (index: number) => set({ peekStack: get().peekStack.slice(0, index + 1) }),
  closePeek: () => set({ peekStack: [] }),
  syncHash: () => {
    const route = parseHash();
    if (get().workspace === "draft" && isDraftBlocked(route.n)) {
      get().go(DRAFT_HOME);
      return;
    }
    set({ route, peekStack: [] });
  },

  markAtt: (lessonId, studentId, status, reason, silent) => {
    const g = get().graph;
    if (!g) return;
    const les = one(g.lessons, lessonId);
    if (!les) return;
    const guest = g.makeups.find((m) => m.target_lesson_id === lessonId && m.student_id === studentId && m.status === "confirmed");
    const enr = guest
      ? one(g.enrollments, guest.enrollment_id) || enrollOf(g, studentId, one(g.lessons, guest.source_lesson_id)?.class_id || "")
      : enrollOf(g, studentId, les.class_id);
    let a = attOf(g, lessonId, studentId);
    const prev = a?.status || "";
    if (!a) {
      a = { id: nid("att"), lesson_id: lessonId, student_id: studentId, enrollment_id: enr?.id || "", status, reason: reason || null, unpaid_flag: false };
      g.attendance.push(a);
    } else {
      a.status = status;
      a.reason = reason || null;
    }
    const burn = attBurns(g, les, studentId, status, guest);
    const wasBurn = attBurns(g, les, studentId, prev, guest);
    if (enr && burn !== wasBurn) {
      if (burn) {
        if ((enr.remaining_sessions || 0) > 0) {
          enr.remaining_sessions = (enr.remaining_sessions || 0) - 1;
          a.unpaid_flag = false;
        } else {
          a.unpaid_flag = true;
        }
      } else if (a.unpaid_flag) {
        a.unpaid_flag = false;
      } else {
        enr.remaining_sessions = (enr.remaining_sessions || 0) + 1;
      }
      enr.paid_through = expectedRunout(g, enr);
    }
    if (burn && a.unpaid_flag && !g.exceptions.some((e) => e.lane === "money" && e.student_id === studentId && e.lesson_id === lessonId)) {
      g.exceptions.push({
        id: nid("ex"), lane: "money", lesson_id: lessonId, student_id: studentId,
        title: `${stuName(g, studentId)} đi học — học phí còn mở`,
        detail: billingLabel(g, enr) + " · không đuổi ra", cta: "Thu học phí", tab: "ledger",
      });
    }
    bump(set, get);
    if (!silent) {
      const policy = absentDeductOf(g, guest ? one(g.lessons, guest.source_lesson_id)?.class_id || les.class_id : les.class_id);
      const tag = guest
        ? (burn ? " · học bù, trừ buổi học lớp gốc" : " · học bù, không trừ thêm")
        : status === "absent"
          ? (policy === "always" ? " · trừ buổi học" : " · chưa trừ — trừ khi học bù")
          : "";
      toast(`Đã ghi ${status === "present" ? "có mặt" : status === "absent" ? "vắng" : status === "late" ? "trễ" : "có phép"} · ${stuName(g, studentId)}${tag}`);
    }
  },
  bulkPresent: (lessonId) => {
    const g = get().graph;
    if (!g) return;
    const les = one(g.lessons, lessonId);
    if (!les) return;
    roster(g, les.class_id).forEach((e) => {
      if (!attOf(g, lessonId, e.student_id)) get().markAtt(lessonId, e.student_id, "present", null, true);
    });
    toast("Cả lớp có mặt — trừ buổi học. Học bù điểm danh riêng.");
  },
  completeLesson: (lessonId) => {
    const g = get().graph;
    if (!g) return;
    const les = one(g.lessons, lessonId);
    if (!les) return;
    const guests = confirmedGuests(g, lessonId);
    const missing = roster(g, les.class_id).filter((e) => !attOf(g, lessonId, e.student_id));
    const missingGuests = guests.filter((m) => !attOf(g, lessonId, m.student_id));
    if (missing.length || missingGuests.length) {
      toast(missingGuests.length ? "Chưa điểm danh hết — kể cả học bù. Không đóng buổi." : "Chưa điểm danh hết. Không đóng buổi.");
      return;
    }
    les.status = "completed";
    g.exceptions = g.exceptions.filter((e) => !(e.lane === "attendance_pending" && e.lesson_id === lessonId));
    addTimeline(g, get().role, lessonId, "attendance", "Đóng buổi. Điểm danh đủ.");
    bump(set, get);
    toast("Đã đóng buổi");
  },
  cancelLesson: (lessonId) => {
    const g = get().graph;
    if (!g) return;
    const les = one(g.lessons, lessonId);
    if (!les) return;
    les.status = "cancelled";
    bump(set, get);
    toast("Đã hủy buổi");
  },
  offerMakeup: (sourceLessonId, studentId, option, targetLessonId) => {
    const g = get().graph;
    if (!g) return;
    const les = one(g.lessons, sourceLessonId);
    const existing = g.makeups.find((m) => m.source_lesson_id === sourceLessonId && m.student_id === studentId);
    if (existing) {
      existing.option = option;
      existing.target_lesson_id = targetLessonId;
      existing.status = "draft";
      existing.offered_at = g.meta.clock;
    } else {
      g.makeups.push({
        id: nid("mkp"), student_id: studentId,
        enrollment_id: les ? enrollOf(g, studentId, les.class_id)?.id || "" : "",
        source_lesson_id: sourceLessonId, option, target_lesson_id: targetLessonId,
        adhoc: null, status: "draft", offered_at: g.meta.clock, zalo_event_id: null,
      });
    }
    bump(set, get);
    if (option === 2) set({ modal: "adhoc" });
    toast(option === 3 ? "Đã xếp học bù vào lớp cùng giáo trình" : "Đã chọn option " + option);
  },
  approveSend: (mkId) => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const mk = one(g.makeups, mkId);
    if (!mk) return;
    const grd = guardianOf(g, mk.student_id);
    if (!grd || grd.zalo_status !== "linked") { toast("Không gửi được — Zalo chưa liên kết"); return; }
    const ev = {
      id: nid("zev"), template: "makeup_offer", guardian_id: grd.id, student_id: mk.student_id,
      lesson_id: mk.source_lesson_id, makeup_id: mk.id, status: "delivered", sent_at: g.meta.clock, fail_reason: null,
    };
    g.zalo_events.push(ev);
    mk.status = "waiting_parent";
    mk.zalo_event_id = ev.id;
    mk.offered_at = g.meta.clock;
    if (!g.exceptions.some((e) => e.lane === "waiting_parent" && e.student_id === mk.student_id)) {
      g.exceptions.push({
        id: nid("ex"), lane: "waiting_parent", lesson_id: mk.source_lesson_id, student_id: mk.student_id,
        title: `${grd.full_name} chưa xác nhận buổi học bù của ${stuName(g, mk.student_id)}`,
        detail: "Đã gửi thẻ Zalo · chờ nhận / không nhận", cta: "Xem học bù", tab: "makeup",
      });
    }
    addTimeline(g, get().role, mk.source_lesson_id, "zalo", `Approve & Send buổi học bù cho ${grd.full_name}.`);
    bump(set, get);
    toast("Đã gửi thẻ Zalo — chờ phụ huynh");
  },
  parentReply: (mkId, accept) => {
    const g = get().graph;
    if (!g) return;
    const mk = one(g.makeups, mkId);
    if (!mk) return;
    mk.status = accept ? "confirmed" : "declined";
    g.exceptions = g.exceptions.filter((e) => !(e.lane === "waiting_parent" && e.student_id === mk.student_id));
    if (!accept) {
      g.exceptions.push({
        id: nid("ex"), lane: "needs_decision", lesson_id: mk.source_lesson_id, student_id: mk.student_id,
        title: `${stuName(g, mk.student_id)} từ chối buổi học bù — xếp lại`,
        detail: "Phụ huynh bấm Không nhận", cta: "Xếp buổi học bù khác", tab: "makeup",
      });
    }
    addTimeline(g, get().role, mk.source_lesson_id, "zalo", accept ? "Phụ huynh nhận buổi học bù." : "Phụ huynh không nhận buổi học bù.");
    if (accept && mk.target_lesson_id) {
      const tgt = one(g.lessons, mk.target_lesson_id);
      addTimeline(g, get().role, mk.target_lesson_id, "makeup", `${stuName(g, mk.student_id)} nhận buổi học bù — vào buổi ${tgt ? fmtDay(tgt.start) : ""}.`);
    }
    bump(set, get);
    toast(accept ? "Đã nhận buổi học bù · ghi vào buổi T7 29/08" : "Không nhận · trả về Cần quyết");
  },
  resend: (evId) => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const ev = one(g.zalo_events, evId);
    if (!ev) return;
    ev.status = "delivered";
    ev.fail_reason = null;
    ev.sent_at = g.meta.clock;
    g.exceptions = g.exceptions.filter((e) => !(e.lane === "delivery_failed" && e.student_id === ev.student_id));
    bump(set, get);
    toast("Đã gửi lại");
  },
  receivePayment: (d) => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const e = one(g.enrollments, d.enrollment_id);
    if (!e) { toast("Không có ghi danh"); return; }
    if (!d.amount || d.amount <= 0) { toast("Nhập số tiền thu"); return; }
    const isDeposit = !!(d.deposit && d.deposit > 0) && !(d.sessions && d.sessions > 0);
    if (!isDeposit && !(d.sessions && d.sessions > 0)) {
      toast("Chọn số buổi học cộng từ phiếu thu");
      return;
    }
    g.payments.unshift({
      id: nid("pay"),
      enrollment_id: e.id,
      student_id: e.student_id,
      class_id: e.class_id,
      amount: d.amount,
      method: d.method,
      paid_at: d.paid_at,
      sessions: d.sessions,
      paid_through: d.paid_through,
      note: (d.note || "").trim(),
      actor: actorOf(get().role).name,
    });
    if (d.deposit && d.deposit > 0) e.deposit_held = (e.deposit_held || 0) + d.deposit;
    const debt = unpaidLearned(g, e.id)
      .slice()
      .sort((a, b) => {
        const da = one(g.lessons, a.lesson_id)?.start || "";
        const db = one(g.lessons, b.lesson_id)?.start || "";
        return da.localeCompare(db);
      });
    const bought = d.sessions || 0;
    if (bought > 0) {
      const settle = Math.min(debt.length, bought);
      for (const a of debt.slice(0, settle)) a.unpaid_flag = false;
      e.remaining_sessions = (e.remaining_sessions || 0) + (bought - settle) + (d.bonus_sessions || 0);
      e.paid_through = expectedRunout(g, e);
    }
    g.exceptions = g.exceptions.filter((x) => {
      if (x.lane !== "money" || x.student_id !== e.student_id) return true;
      const a = g.attendance.find((att) => att.lesson_id === x.lesson_id && att.student_id === e.student_id);
      return Boolean(a?.unpaid_flag);
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast(`Đã thu ${stuName(g, e.student_id)} · ${billingLabel(g, e)}`);
  },
  remind: (enrId) => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const e = one(g.enrollments, enrId);
    if (!e) return;
    const grd = one(g.guardians, e.billing_contact_id);
    if (!grd || grd.zalo_status !== "linked") { toast("Zalo chưa linked"); return; }
    g.zalo_events.push({
      id: nid("zev"), template: "reminder", guardian_id: grd.id, student_id: e.student_id,
      lesson_id: get().route.id, makeup_id: null, status: "delivered", sent_at: g.meta.clock, fail_reason: null,
    });
    bump(set, get);
    toast("Đã nhắc Zalo");
  },
  setRemindDays: (n) => {
    const g = get().graph;
    if (!g) return;
    const days = Math.max(1, Math.min(90, Math.round(n) || 14));
    g.settings = { ...(g.settings || { remind_days_before: 14 }), remind_days_before: days };
    bump(set, get);
    toast(`Nhắc trước ${days} ngày`);
  },
  createRemindBatch: (daysBefore) => {
    if (blockDraftOps(get)) return null;
    const g = get().graph;
    if (!g) return null;
    const days = Math.max(1, Math.min(90, Math.round(daysBefore ?? remindDaysOf(g)) || 14));
    g.settings = { ...(g.settings || { remind_days_before: 14 }), remind_days_before: days };
    const hits = remindCandidates(g, days);
    if (!hits.length) { toast("Không có HS trong cửa sổ nhắc"); return null; }
    const id = nid("rmb");
    const items: RemindItem[] = hits.map((h) => ({
      id: nid("rmi"),
      batch_id: id,
      enrollment_id: h.enrollment_id,
      student_id: h.student_id,
      class_id: h.class_id,
      guardian_id: h.guardian_id,
      reason: h.reason,
      remaining: h.remaining,
      runout_date: h.runout_date,
      days_left: h.days_left,
      debt: h.debt,
      body: h.body,
      status: "queued",
      fail_reason: null,
      zalo_event_id: null,
    }));
    g.remind_batches.unshift({
      id,
      ran_at: g.meta.clock,
      actor: get().role === "teacher" ? "stf_huy" : "stf_trang",
      days_before: days,
      status: "queued",
      counts: {
        runout: items.filter((x) => x.reason !== "debt").length,
        debt: items.filter((x) => x.reason !== "runout").length,
        sent: 0,
        failed: 0,
        skipped: 0,
      },
    });
    g.remind_items.push(...items);
    bump(set, get);
    toast(`Lô ${items.length} HS · chờ gửi`);
    return id;
  },
  sendRemindBatch: (batchId) => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const batch = one(g.remind_batches, batchId);
    if (!batch) return;
    const items = g.remind_items.filter((x) => x.batch_id === batchId && (x.status === "queued" || x.status === "failed"));
    if (!items.length) { toast("Không còn dòng chờ gửi"); return; }
    for (const it of items) {
      const grd = it.guardian_id ? one(g.guardians, it.guardian_id) : null;
      if (!grd || grd.zalo_status !== "linked") {
        it.status = "failed";
        it.fail_reason = grd ? "Zalo chưa linked" : "Không có PH thu phí";
        continue;
      }
      const evId = nid("zev");
      g.zalo_events.push({
        id: evId,
        template: it.reason === "debt" ? "reminder" : "low_credit",
        guardian_id: grd.id,
        student_id: it.student_id,
        lesson_id: null,
        makeup_id: null,
        status: "delivered",
        sent_at: g.meta.clock,
        fail_reason: null,
      });
      it.status = "sent";
      it.fail_reason = null;
      it.zalo_event_id = evId;
    }
    const all = g.remind_items.filter((x) => x.batch_id === batchId);
    batch.status = "sent";
    batch.counts = {
      runout: all.filter((x) => x.reason !== "debt").length,
      debt: all.filter((x) => x.reason !== "runout").length,
      sent: all.filter((x) => x.status === "sent").length,
      failed: all.filter((x) => x.status === "failed").length,
      skipped: all.filter((x) => x.status === "skipped").length,
    };
    bump(set, get);
    toast(`Đã gửi ${batch.counts.sent} · lỗi ${batch.counts.failed}`);
  },
  assignHw: (lessonId) => {
    const g = get().graph;
    if (!g) return;
    g.homework.push({ id: nid("hw"), lesson_id: lessonId, title: "Bài buổi này", assigned_at: g.meta.clock });
    bump(set, get);
    toast("Đã giao");
  },
  markHw: (hwId, studentId, mark) => {
    const g = get().graph;
    if (!g) return;
    let m = g.homework.find((x) => x.homework_id === hwId && x.student_id === studentId);
    if (!m) { m = { id: nid("hwm"), homework_id: hwId, student_id: studentId, mark }; g.homework.push(m); }
    else m.mark = mark;
    bump(set, get);
  },
  addNote: (lessonId, body) => {
    const g = get().graph;
    if (!g || !body.trim()) return;
    g.notes.push({
      id: nid("nt"), lesson_id: lessonId,
      author_id: get().role === "teacher" ? "stf_huy" : "stf_trang",
      body, at: g.meta.clock,
    });
    bump(set, get);
    toast("Đã lưu ghi chú");
  },
  linkOanh: () => {
    if (blockDraftOps(get)) return;
    const g = get().graph;
    if (!g) return;
    const grd = one(g.guardians, "grd_oanh");
    if (grd) { grd.zalo_status = "linked"; grd.consent = true; grd.zalo_user_id = "zalo_oanh"; }
    const ev = one(g.zalo_events, "zev_z0_oanh");
    if (ev) ev.status = "delivered";
    g.exceptions = g.exceptions.filter((e) => e.id !== "ex_need_ngoc");
    bump(set, get);
    toast("Oanh đã follow OA");
  },
  createAdhoc: (p) => {
    const g = get().graph;
    if (!g) return false;
    const dur = p.duration_min && p.duration_min > 0 ? p.duration_min : 90;
    const start = toVnIso(p.start, 0);
    const endHh = addMinutesHhmm(start.slice(11, 16), dur);
    if (!endHh) { toast("Giờ kết thúc vượt quá ngày"); return false; }
    const end = `${start.slice(0, 10)}T${endHh}:00+07:00`;
    const hit = slotClash(g, p.teacher_id, p.room_id, start, end);
    if (hit.kind) {
      toast("Chặn — trùng GV/phòng");
      return false;
    }
    const les = {
      id: nid("les"), class_id: p.class_id, branch_id: "br_cg", teacher_id: p.teacher_id, room_id: p.room_id,
      start, end, status: "scheduled", is_makeup: true, original_lesson_id: null, substitute: false,
    };
    g.lessons.push(les);
    addTimeline(g, get().role, les.id, "create", "Tạo buổi học bù rời.");
    bump(set, get);
    set({ modal: null });
    toast("Đã tạo buổi rời");
    if (!p.stay) get().go("buoi-detail", les.id);
    return true;
  },
  createMakeupLesson: (p) => {
    const g = get().graph;
    if (!g) return false;
    if (!p.class_id) { toast("Chọn lớp chủ"); return false; }
    if (!p.guests.length) { toast("Chọn ít nhất một học sinh vắng"); return false; }
    const start = toVnIso(p.start, 0);
    const endHhmm = addMinutesHhmm(p.start.slice(11, 16), p.duration_min);
    if (!endHhmm) { toast("Giờ kết thúc vượt quá ngày"); return false; }
    const end = toVnIso(`${p.start.slice(0, 10)}T${endHhmm}`, 0);
    const hit = slotClash(g, p.teacher_id, p.room_id, start, end);
    if (hit.kind) {
      toast(`Chặn — trùng ${hit.kind === "both" ? "GV và phòng" : hit.kind === "teacher" ? "GV" : "phòng"}`);
      return false;
    }
    const host = one(g.classes, p.class_id);
    const room = one(g.rooms, p.room_id);
    const cap = room?.capacity || host?.capacity || 12;
    if (p.guests.length > cap) {
      toast(`Cảnh báo mềm: ${p.guests.length}/${cap} — vẫn mở buổi học bù`);
    }
    const les = {
      id: nid("les"), class_id: p.class_id, branch_id: host?.branch_id || "br_cg",
      teacher_id: p.teacher_id, room_id: p.room_id,
      start, end, status: "scheduled", is_makeup: true,
      original_lesson_id: p.guests[0]?.source_lesson_id || null, substitute: false,
    };
    g.lessons.push(les);
    for (const guest of p.guests) {
      const src = one(g.lessons, guest.source_lesson_id);
      const enr = src ? enrollOf(g, guest.student_id, src.class_id) : undefined;
      const existing = g.makeups.find((m) => m.source_lesson_id === guest.source_lesson_id && m.student_id === guest.student_id);
      if (existing) {
        existing.option = 2;
        existing.target_lesson_id = les.id;
        existing.status = "confirmed";
        existing.offered_at = g.meta.clock;
        existing.adhoc = { lesson_id: les.id };
      } else {
        g.makeups.push({
          id: nid("mkp"), student_id: guest.student_id,
          enrollment_id: enr?.id || "",
          source_lesson_id: guest.source_lesson_id, option: 2, target_lesson_id: les.id,
          adhoc: { lesson_id: les.id }, status: "confirmed", offered_at: g.meta.clock, zalo_event_id: null,
        });
      }
    }
    addTimeline(g, get().role, les.id, "create", `Tạo buổi học bù rời · ${p.guests.length} học sinh.`);
    bump(set, get);
    set({ modal: null, makeupPick: [], makeupSlot: null });
    toast(`Đã mở buổi học bù · ${p.guests.length} học sinh`);
    get().go("buoi-detail", les.id, { tab: "attendance" });
    return true;
  },
  startMakeup: (guests, slot) => {
    set({ makeupPick: guests, makeupSlot: slot || null });
    get().go("buoi-bu", guests[0]?.source_lesson_id || null);
  },
  ignoreAbsent: (studentId, sourceLessonId) => {
    const g = get().graph;
    if (!g) return;
    if ((g.absent_ignores || []).some((x) => x.student_id === studentId && x.source_lesson_id === sourceLessonId)) return;
    g.absent_ignores.push({
      id: nid("ign"), student_id: studentId, source_lesson_id: sourceLessonId,
      ignored_at: g.meta.clock, actor: actorOf(get().role).name,
    });
    bump(set, get);
    toast(`Đã bỏ qua · ${stuName(g, studentId)}`);
  },
  unignoreAbsent: (studentId, sourceLessonId) => {
    const g = get().graph;
    if (!g) return;
    g.absent_ignores = (g.absent_ignores || []).filter((x) => !(x.student_id === studentId && x.source_lesson_id === sourceLessonId));
    bump(set, get);
    toast(`Đã mở lại · ${stuName(g, studentId)}`);
  },
  setAbsentDeduct: (classId, value) => {
    const g = get().graph;
    if (!g) return;
    const c = one(g.classes, classId);
    if (!c) return;
    c.absent_deduct = value;
    bump(set, get);
    toast(value === "always" ? "Vắng vẫn trừ buổi học" : "Trừ buổi khi học sinh học bù");
  },
  doSub: (lessonId, teacherId) => {
    const g = get().graph;
    if (!g) return false;
    const les = one(g.lessons, lessonId);
    if (!les) return false;
    if (teacherClash(g, teacherId, les.start, les.end, les.id).length) { toast("Chặn dạy hộ — trùng giờ"); return false; }
    les.teacher_id = teacherId;
    les.substitute = teacherId !== one(g.classes, les.class_id)?.default_teacher_id;
    addTimeline(g, get().role, lessonId, "substitute", `Dạy hộ: ${tchName(g, teacherId)}.`);
    bump(set, get);
    set({ modal: null });
    toast("Đã gán dạy hộ");
    return true;
  },
  createStudent: (d) => {
    const g = get().graph;
    if (!g) return;
    if (!d.full_name.trim()) { toast("Thiếu tên học sinh"); return; }
    if (!d.dob || d.dob >= g.meta.today) { toast("Ngày sinh phải ở quá khứ"); return; }
    if (!d.branch_id) { toast("Chọn chi nhánh"); return; }
    if (d.phone.trim() && !phoneOk(d.phone)) { toast("SĐT không hợp lệ"); return; }
    if (d.guardian_phone.trim() && !phoneOk(d.guardian_phone)) { toast("SĐT phụ huynh không hợp lệ"); return; }
    const sid = nid("stu");
    g.students.push({
      id: sid, full_name: d.full_name.trim(), dob: d.dob, branch_id: d.branch_id,
      phone: d.phone.trim() || null, active: d.active, notes: d.notes.trim(),
    });
    if (d.guardian_name.trim() && d.guardian_phone.trim()) {
      const gid = nid("grd");
      g.guardians.push({
        id: gid, full_name: d.guardian_name.trim(), phone: d.guardian_phone.trim(),
        relationship: d.relationship || "PH", preferred_channel: "zalo",
        zalo_status: "pending", zalo_user_id: null, consent: false,
      });
      g.student_guardians.push({ student_id: sid, guardian_id: gid, is_primary: true, billing_contact: true });
    }
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã thêm học sinh");
    if (get().route.n === "thu-phi") get().go("thu-phi", sid);
    else get().go("hoc-sinh");
  },
  updateStudent: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const s = one(g.students, id);
    if (!s) return;
    if (!d.full_name.trim()) { toast("Thiếu tên học sinh"); return; }
    if (d.phone.trim() && !phoneOk(d.phone)) { toast("SĐT không hợp lệ"); return; }
    s.full_name = d.full_name.trim();
    s.dob = d.dob;
    s.branch_id = d.branch_id;
    s.phone = d.phone.trim() || null;
    s.active = d.active;
    s.notes = d.notes.trim();
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu học sinh");
  },
  createGuardian: (d) => {
    const g = get().graph;
    if (!g) return;
    if (!d.full_name.trim() || !d.phone.trim()) { toast("Thiếu tên và SĐT phụ huynh"); return; }
    if (!phoneOk(d.phone)) { toast("SĐT không hợp lệ"); return; }
    const gid = nid("grd");
    g.guardians.push({
      id: gid, full_name: d.full_name.trim(), phone: d.phone.trim(),
      relationship: d.relationship || "PH", preferred_channel: "zalo",
      zalo_status: "pending", zalo_user_id: null, consent: false,
    });
    const hasPrimary = g.student_guardians.some((x) => x.student_id === d.student_id && x.is_primary);
    g.student_guardians.push({
      student_id: d.student_id, guardian_id: gid,
      is_primary: !hasPrimary, billing_contact: !hasPrimary,
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã thêm phụ huynh");
  },
  createRoom: (d) => {
    const g = get().graph;
    if (!g) return;
    if (!d.name.trim()) { toast("Thiếu tên phòng"); return; }
    if (!d.branch_id) { toast("Chọn chi nhánh"); return; }
    if (!(d.capacity >= 1)) { toast("Sức chứa ≥ 1"); return; }
    if (!["classroom", "online", "other"].includes(d.type)) { toast("Loại phòng không hợp lệ"); return; }
    g.rooms.push({
      id: nid("rm"), branch_id: d.branch_id, name: d.name.trim(),
      capacity: d.capacity, type: d.type, active: d.active, notes: d.notes.trim(),
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã thêm phòng");
    get().go("phong");
  },
  updateRoom: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const r = one(g.rooms, id);
    if (!r) return;
    if (!d.name.trim() || !(d.capacity >= 1)) { toast("Tên và sức chứa ≥ 1"); return; }
    Object.assign(r, { branch_id: d.branch_id, name: d.name.trim(), capacity: d.capacity, type: d.type, active: d.active, notes: d.notes.trim() });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu phòng");
  },
  createTeacher: (d) => {
    const g = get().graph;
    if (!g) return;
    if (!d.name.trim()) { toast("Thiếu tên"); return; }
    if (!d.phone.trim()) { toast("Thiếu SĐT"); return; }
    if (!phoneOk(d.phone)) { toast("SĐT không hợp lệ"); return; }
    if (!d.default_branch_id || !d.branch_ids.length) { toast("Chọn ít nhất một chi nhánh"); return; }
    g.teachers.push({
      id: nid("tch"), name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(),
      user_id: null, default_branch_id: d.default_branch_id, branch_ids: d.branch_ids,
      subjects: [], active: d.active,
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã thêm GV");
    get().go("giao-vien");
  },
  updateTeacher: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const t = one(g.teachers, id);
    if (!t) return;
    if (!d.name.trim() || !d.phone.trim() || !d.branch_ids.length) { toast("Tên, SĐT, chi nhánh bắt buộc"); return; }
    if (!phoneOk(d.phone)) { toast("SĐT không hợp lệ"); return; }
    Object.assign(t, {
      name: d.name.trim(), phone: d.phone.trim(), email: d.email.trim(),
      default_branch_id: d.default_branch_id, branch_ids: d.branch_ids, active: d.active,
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu GV");
  },
  createCourse: (d) => {
    const g = get().graph;
    if (!g) return;
    if (!d.name.trim()) { toast("Thiếu tên khóa"); return; }
    if (!d.plan?.model) { toast("Chọn mô hình tính phí"); return; }
    if (!d.plan.fee || d.plan.fee <= 0) { toast("Nhập học phí"); return; }
    if (d.plan.model === "prepaid" && !(d.plan.pack_sessions && d.plan.pack_sessions > 0)) {
      toast("Gói prepaid cần số buổi học");
      return;
    }
    if ((d.plan.model === "course" || d.plan.model === "bundle") && !(d.plan.course_sessions && d.plan.course_sessions > 0)) {
      toast("Khóa / combo cần số buổi");
      return;
    }
    if (d.plan.model === "deposit" && !(d.plan.deposit_amount && d.plan.deposit_amount > 0 && d.plan.deposit_amount < d.plan.fee)) {
      toast("Đặt cọc phải nhỏ hơn học phí khóa");
      return;
    }
    const id = nid("crs");
    g.courses.unshift({
      id,
      name: d.name.trim(),
      content_key: (d.content_key || contentKeyOf({ name: d.name.trim() })).trim(),
      subject: d.subject.trim() || "Khác",
      level: d.level.trim() || "—",
      duration_min: d.duration_min || 90,
      plan: { ...d.plan },
      promotions: (d.promotions || []).filter((p) => p.label.trim()),
      active: true,
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã tạo khóa · mở lớp từ khóa này");
    if (get().route.n === "lop-moi") get().go("lop-moi", id);
    else get().go("khoa-hoc-detail", id);
  },
  updateCourse: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const c = one(g.courses, id);
    if (!c) return;
    if (!d.name.trim()) { toast("Thiếu tên khóa"); return; }
    if (!d.plan?.model) { toast("Chọn mô hình tính phí"); return; }
    if (!d.plan.fee || d.plan.fee <= 0) { toast("Nhập học phí"); return; }
    if (d.plan.model === "prepaid" && !(d.plan.pack_sessions && d.plan.pack_sessions > 0)) {
      toast("Gói prepaid cần số buổi học");
      return;
    }
    if ((d.plan.model === "course" || d.plan.model === "bundle") && !(d.plan.course_sessions && d.plan.course_sessions > 0)) {
      toast("Khóa / combo cần số buổi");
      return;
    }
    if (d.plan.model === "deposit" && !(d.plan.deposit_amount && d.plan.deposit_amount > 0 && d.plan.deposit_amount < d.plan.fee)) {
      toast("Đặt cọc phải nhỏ hơn học phí khóa");
      return;
    }
    Object.assign(c, {
      name: d.name.trim(),
      content_key: (d.content_key || contentKeyOf({ name: d.name.trim() })).trim(),
      subject: d.subject.trim() || c.subject,
      level: d.level.trim() || c.level,
      duration_min: d.duration_min || c.duration_min,
      plan: { ...d.plan },
      promotions: (d.promotions || []).filter((p) => p.label.trim()),
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu khóa");
  },
  createClass: (draft) => {
    const g = get().graph;
    if (!g) return null;
    const course = one(g.courses, draft.course_id);
    if (!course) { toast("Chọn khóa học — lớp là một ca của khóa"); return null; }
    if (!draft.days.length) { toast("Chọn ít nhất một thứ trong tuần"); return null; }
    if (!draft.duration_min || draft.duration_min % 30 !== 0) { toast("Thời lượng buổi bước 30 phút"); return null; }
    const days = [...draft.days]
      .map((d) => ({ weekday: d.weekday, start_time: d.start_time.slice(0, 5) }))
      .sort((a, b) => schoolOrder(a.weekday) - schoolOrder(b.weekday));
    for (const day of days) {
      if (!addMinutesHhmm(day.start_time, draft.duration_min)) {
        toast(`${day.start_time} + ${draft.duration_min} phút vượt quá ngày`);
        return null;
      }
    }
    const auto = classInstanceName(course.name, { days });
    const name = (draft.name.trim() && draft.name.trim() !== course.name) ? draft.name.trim() : auto;
    const first = days[0];
    const mode = ledgerModeOf(course.plan.model);
    const row = {
      id: nid("cls"), branch_id: "br_cg", name, content_key: course.content_key, course_id: course.id,
      default_teacher_id: draft.teacher_id,
      default_room_id: draft.room_id, capacity: draft.capacity || 12,
      recurrence: {
        duration_min: draft.duration_min,
        days,
        weekdays: days.map((d) => d.weekday),
        start_time: first.start_time,
        end_time: addMinutesHhmm(first.start_time, draft.duration_min),
      },
      start_date: draft.start_date, end_date: draft.end_date,
      billing_mode: mode,
      fee: course.plan.fee,
      course_total_sessions: course.plan.course_sessions || course.plan.pack_sessions,
      active: true,
      absent_deduct: draft.absent_deduct === "on_makeup" ? "on_makeup" : "always",
    };
    const result = materializeNewClass(g, row);
    if (!result.applied) {
      toast(result.message);
      return result;
    }
    bump(set, get);
    set({ modal: null, editId: null });
    toast(result.message);
    if (result.capacityWarn) toast(result.capacityWarn);
    if (result.status !== "cover") get().go("lop-detail", row.id);
    return result;
  },
  createEnroll: (d) => {
    const g = get().graph;
    if (!g) return null;
    if (!d.class_id || !d.student_id) { toast("Chọn lớp và học sinh"); return null; }
    if (g.enrollments.some((e) => e.class_id === d.class_id && e.student_id === d.student_id && e.status === "active")) {
      toast("Học sinh đã ghi danh lớp này");
      return null;
    }
    const c = one(g.classes, d.class_id);
    const n = roster(g, d.class_id).length;
    if (c && n >= (c.capacity || 0)) {
      toast(`Cảnh báo mềm: sĩ số ${n}/${c.capacity} — vẫn ghi danh (soft capacity)`);
    }
    const mode = c?.billing_mode || "monthly";
    const id = nid("enr");
    g.enrollments.push({
      id, class_id: d.class_id, student_id: d.student_id, status: d.status || "active",
      enrolled_at: g.meta.today, billing_mode: mode,
      paid_through: null,
      remaining_sessions: 0,
      course_done: mode === "course" ? 0 : null,
      course_total: mode === "course" ? (c?.course_total_sessions || 12) : null,
      billing_contact_id: d.billing_contact_id || guardianOf(g, d.student_id)?.id || null,
      deposit_held: 0,
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã ghi danh · chưa thu — buổi học chỉ cộng khi có phiếu thu");
    return id;
  },
  updateEnroll: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const e = one(g.enrollments, id);
    if (!e) return;
    e.status = d.status || e.status;
    e.billing_contact_id = d.billing_contact_id;
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu ghi danh");
  },
  createStaff: (d) => {
    const g = get().graph;
    if (!g || !d.full_name.trim()) { toast("Thiếu tên"); return; }
    const id = nid("stf");
    g.staff_profiles.push({
      id, full_name: d.full_name.trim(), phone: d.phone.trim(), email: "",
      title: d.title.trim() || "Nhân sự", active: true,
    });
    const roles = d.roles.length ? d.roles : ["assistant"];
    for (const role of roles) {
      g.profile_roles.push({ profile_id: id, role, branch_id: g.branches[0]?.id || "br_cg" });
    }
    bump(set, get);
    set({ modal: null, editId: null });
    toast(d.invite ? "Đã mời nhân sự (proto)" : "Đã thêm nhân sự");
    get().go("nhan-su");
  },
  updateStaff: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const s = one(g.staff_profiles, id);
    if (!s) return;
    if (!d.full_name.trim()) { toast("Thiếu tên"); return; }
    s.full_name = d.full_name.trim();
    s.phone = d.phone.trim();
    s.title = d.title.trim() || s.title;
    g.profile_roles = g.profile_roles.filter((r) => r.profile_id !== id);
    for (const role of d.roles) {
      g.profile_roles.push({ profile_id: id, role, branch_id: g.branches[0]?.id || "br_cg" });
    }
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu nhân sự");
  },
  deleteStaff: (id) => {
    const g = get().graph;
    if (!g) return;
    const s = one(g.staff_profiles, id);
    if (!s) return;
    g.staff_profiles = g.staff_profiles.filter((x) => x.id !== id);
    g.profile_roles = g.profile_roles.filter((r) => r.profile_id !== id);
    bump(set, get);
    const peeking = get().peekStack.some((p) => p.kind === "staff" && p.id === id);
    if (peeking) get().closePeek();
    if (get().route.n === "staff-detail" && get().route.id === id) get().go("nhan-su");
    toast(`Đã xóa ${s.full_name}`);
  },
  createBranch: (d) => {
    const g = get().graph;
    if (!g || !d.name.trim()) { toast("Thiếu tên chi nhánh"); return; }
    g.branches.push({
      id: nid("br"), tenant_id: g.tenant.id, name: d.name.trim(), code: d.code.trim() || d.name.slice(0, 2).toUpperCase(),
      address: d.address.trim(), phone: d.phone.trim(), active: d.active, notes: d.notes.trim(),
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã tạo chi nhánh");
    get().go("chi-nhanh");
  },
  updateBranch: (id, d) => {
    const g = get().graph;
    if (!g) return;
    const b = one(g.branches, id);
    if (!b) return;
    if (!d.name.trim()) { toast("Thiếu tên chi nhánh"); return; }
    Object.assign(b, {
      name: d.name.trim(), code: d.code.trim(), address: d.address.trim(),
      phone: d.phone.trim(), active: d.active, notes: d.notes.trim(),
    });
    bump(set, get);
    set({ modal: null, editId: null });
    toast("Đã lưu chi nhánh");
  },
  deleteBranch: (id) => {
    const g = get().graph;
    if (!g) return;
    const b = one(g.branches, id);
    if (!b) return;
    if (g.branches.length <= 1) { toast("Cần ít nhất một chi nhánh"); return; }
    if (g.rooms.some((r) => r.branch_id === id) || g.classes.some((c) => c.branch_id === id) || g.students.some((s) => s.branch_id === id)) {
      toast("Chi nhánh còn phòng, lớp hoặc học sinh");
      return;
    }
    g.branches = g.branches.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "branch", id, "chi-nhanh");
    toast(`Đã xóa ${b.name}`);
  },
  deleteRoom: (id) => {
    const g = get().graph;
    if (!g) return;
    const r = one(g.rooms, id);
    if (!r) return;
    if (g.classes.some((c) => c.default_room_id === id) || g.lessons.some((l) => l.room_id === id && l.status !== "cancelled")) {
      toast("Phòng còn gắn lớp hoặc buổi");
      return;
    }
    g.rooms = g.rooms.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "room", id, "phong");
    toast(`Đã xóa ${r.name}`);
  },
  deleteTeacher: (id) => {
    const g = get().graph;
    if (!g) return;
    const t = one(g.teachers, id);
    if (!t) return;
    if (g.classes.some((c) => c.default_teacher_id === id) || g.lessons.some((l) => l.teacher_id === id && l.status !== "cancelled")) {
      toast("Giáo viên còn gắn lớp hoặc buổi");
      return;
    }
    g.teachers = g.teachers.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "teacher", id, "giao-vien");
    toast(`Đã xóa ${t.name}`);
  },
  deleteStudent: (id) => {
    const g = get().graph;
    if (!g) return;
    const s = one(g.students, id);
    if (!s) return;
    g.enrollments = g.enrollments.filter((e) => e.student_id !== id);
    g.payments = (g.payments || []).filter((p) => p.student_id !== id);
    g.attendance = g.attendance.filter((a) => a.student_id !== id);
    g.makeups = g.makeups.filter((m) => m.student_id !== id);
    g.student_guardians = g.student_guardians.filter((x) => x.student_id !== id);
    g.remind_items = (g.remind_items || []).filter((x) => x.student_id !== id);
    g.exceptions = g.exceptions.filter((x) => x.student_id !== id);
    g.students = g.students.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "student", id, "hoc-sinh");
    toast(`Đã xóa ${s.full_name}`);
  },
  deleteClass: (id) => {
    const g = get().graph;
    if (!g) return;
    const c = one(g.classes, id);
    if (!c) return;
    const lessonIds = new Set(g.lessons.filter((l) => l.class_id === id).map((l) => l.id));
    g.attendance = g.attendance.filter((a) => !lessonIds.has(a.lesson_id));
    g.makeups = g.makeups.filter((m) => !lessonIds.has(m.source_lesson_id) && !(m.target_lesson_id && lessonIds.has(m.target_lesson_id)));
    g.lessons = g.lessons.filter((l) => l.class_id !== id);
    g.payments = (g.payments || []).filter((p) => p.class_id !== id);
    g.enrollments = g.enrollments.filter((e) => e.class_id !== id);
    g.remind_items = (g.remind_items || []).filter((x) => x.class_id !== id);
    g.exceptions = g.exceptions.filter((x) => !lessonIds.has(x.lesson_id || ""));
    g.classes = g.classes.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "class", id, "lop");
    toast(`Đã xóa ${c.name}`);
  },
  updateClass: (id, d) => {
    const g = get().graph;
    if (!g) return null;
    const c = one(g.classes, id);
    if (!c) return null;
    if (!d.name.trim()) { toast("Thiếu tên lớp"); return null; }
    if (!d.teacher_id || !d.room_id) { toast("Chọn giáo viên và phòng"); return null; }
    if (!(d.capacity >= 1)) { toast("Sĩ số ≥ 1"); return null; }
    if (d.absent_deduct) c.absent_deduct = d.absent_deduct;
    if (!d.days?.length) {
      c.name = d.name.trim();
      c.capacity = d.capacity;
      c.default_teacher_id = d.teacher_id;
      c.default_room_id = d.room_id;
      bump(set, get);
      set({ modal: null, editId: null });
      toast("Đã lưu lớp");
      return { status: "ok", message: "Đã lưu lớp", phase: "running", clashN: 0, clashes: [], frozenN: 0, mutableN: 0, created: 0, patched: 0, cancelled: 0, studentWarns: [], applied: true, classId: id };
    }
    const rec = normalizeRecurrence(c.recurrence);
    const result = applyClassSchedule(g, id, {
      days: d.days,
      duration_min: d.duration_min || rec.duration_min,
      start_date: d.start_date || c.start_date,
      end_date: d.end_date === undefined ? c.end_date : d.end_date,
      teacher_id: d.teacher_id,
      room_id: d.room_id,
      name: d.name,
      capacity: d.capacity,
    }, "series");
    if (!result.applied) {
      toast(result.message);
      return result;
    }
    bump(set, get);
    set({ modal: null, editId: null });
    toast(result.message);
    if (result.capacityWarn) toast(result.capacityWarn);
    for (const w of result.studentWarns.slice(0, 3)) toast(w);
    return result;
  },
  updateLessonOccurrence: (p) => {
    const g = get().graph;
    if (!g) return null;
    const result = applyOccurrence(g, p);
    if (!result.applied) { toast(result.message); return result; }
    bump(set, get);
    set({ modal: null, editId: null });
    toast(result.message);
    return result;
  },
  applyThisAndFuture: (classId, fromLessonId, patch) => {
    const g = get().graph;
    if (!g) return null;
    const les = one(g.lessons, fromLessonId);
    if (!les) { toast("Không có buổi"); return null; }
    const result = applyClassSchedule(g, classId, patch, "this_and_future", { fromStart: les.start });
    if (!result.applied) { toast(result.message); return result; }
    bump(set, get);
    set({ modal: null, editId: null });
    toast(result.message);
    if (result.capacityWarn) toast(result.capacityWarn);
    return result;
  },
  deleteCourse: (id) => {
    const g = get().graph;
    if (!g) return;
    const c = one(g.courses, id);
    if (!c) return;
    if (g.classes.some((x) => x.course_id === id)) {
      toast("Khóa còn lớp đang mở");
      return;
    }
    g.courses = g.courses.filter((x) => x.id !== id);
    bump(set, get);
    leaveIf(get, "course", id, "khoa-hoc");
    toast(`Đã xóa ${c.name}`);
  },
  deletePayment: (id) => {
    const g = get().graph;
    if (!g) return;
    const p = one(g.payments || [], id);
    if (!p) return;
    g.payments = (g.payments || []).filter((x) => x.id !== id);
    const e = one(g.enrollments, p.enrollment_id);
    if (e && p.sessions) e.remaining_sessions = Math.max(0, (e.remaining_sessions || 0) - p.sessions);
    bump(set, get);
    toast("Đã xóa phiếu thu");
  },
  deleteRemindBatch: (id) => {
    const g = get().graph;
    if (!g) return;
    const b = one(g.remind_batches, id);
    if (!b) return;
    g.remind_batches = g.remind_batches.filter((x) => x.id !== id);
    g.remind_items = (g.remind_items || []).filter((x) => x.batch_id !== id);
    bump(set, get);
    if (get().route.n === "nhac-nap-detail" && get().route.id === id) get().go("nhac-nap");
    toast("Đã xóa lô nhắc");
  },
  connectOA: (connected) => {
    const g = get().graph;
    if (!g) return;
    g.zalo_oa.connected = connected;
    if (connected) g.zalo_oa.webhook_ok = true;
    bump(set, get);
    toast(connected ? "Đã kết nối OA" : "Đã ngắt OA");
  },
  setWebhook: (ok) => {
    const g = get().graph;
    if (!g) return;
    g.zalo_oa.webhook_ok = ok;
    bump(set, get);
  },
  toggleTemplate: (key) => {
    const g = get().graph;
    if (!g) return;
    const t = g.zalo_oa.templates.find((x) => x.key === key);
    if (t) t.eligible = !t.eligible;
    bump(set, get);
  },

  patchIngest: (p) => {
    const ingest = { ...get().ingest, ...p };
    set({ ingest });
    persistNow(get);
  },
  beginIngest: (files) => {
    const maps = mapsFor(files);
    const ingest: IngestSnapshot = {
      ...EMPTY_INGEST,
      phase: "classify",
      reached: "classify",
      files,
      maps,
    };
    const id = get().activeDraftId || newDraftId();
    const live = get().workspace === "draft" ? liveOf(get) : get().graph;
    set({
      workspace: "live",
      graph: live || get().graph,
      liveGraph: null,
      ingest,
      activeDraftId: id,
      peekStack: [],
    });
    persistActive({ ingest, activeDraftId: id, workspace: "live" });
    toast("Đã nhận lô · xác nhận phân loại sheet");
  },
  setSheetKind: (key, kind) => {
    const ingest = get().ingest;
    const files = ingest.files.map((f) => ({
      ...f,
      sheets: f.sheets.map((s) => sheetKey(s) === key ? { ...s, kind, confidence: 1 } : s),
    }));
    const maps = { ...ingest.maps };
    const sheet = files.flatMap((f) => f.sheets).find((s) => sheetKey(s) === key);
    if (sheet) maps[key] = guessMap(sheet.headers, kind);
    const next = { ...ingest, files, maps, reached: "classify" as IngestPhase };
    set({ ingest: next });
    persistNow(get);
  },
  setMapField: (sheet, header, field) => {
    const ingest = get().ingest;
    const maps = { ...ingest.maps, [sheet]: { ...(ingest.maps[sheet] || {}), [header]: field } };
    const reached = phaseIndex(reachedOf(ingest)) > phaseIndex("map") ? "map" as IngestPhase : reachedOf(ingest);
    set({ ingest: { ...ingest, maps, reached } });
    persistNow(get);
  },
  setMapSheet: (i) => {
    set({ ingest: { ...get().ingest, mapSheet: i } });
    persistNow(get);
  },
  advanceIngest: () => {
    const ingest = get().ingest;
    let next = { ...ingest };
    if (ingest.phase === "classify") {
      next = { ...next, phase: "map", maps: Object.keys(ingest.maps).length ? ingest.maps : mapsFor(ingest.files) };
    } else if (ingest.phase === "map") {
      const records = cleanDump(ingest.files, ingest.maps);
      next = { ...next, phase: "clean", records };
    } else if (ingest.phase === "clean") {
      const linked = linkDump(ingest.records);
      const live = liveOf(get);
      const review = buildReview(live, linked, ingest.records, ingest.review);
      next = { ...next, phase: "link", linked, review };
    } else if (ingest.phase === "link") {
      const linked = ingest.linked || linkDump(ingest.records);
      if (reviewPending(ingest.review)) return;
      next = { ...next, phase: "commit", linked, result: buildCommit(linked, ingest.review) };
    }
    next = { ...next, reached: maxReached(reachedOf(ingest), next.phase) };
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  retreatIngest: () => {
    const ingest = get().ingest;
    const prev = prevIngestPhase(ingest.phase);
    if (!prev || ingest.phase === "done") return;
    const next = { ...ingest, phase: prev };
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  gotoIngestPhase: (phase) => {
    const ingest = get().ingest;
    const fromDrop = phase === "classify" && ingest.phase === "drop" && ingest.files.length > 0;
    if (!fromDrop && !canGotoPhase(ingest, phase)) return;
    if (phase === ingest.phase) return;
    const next = { ...ingest, phase };
    if (phase === "link" && ingest.linked) {
      next.review = buildReview(liveOf(get), ingest.linked, ingest.records, ingest.review);
    }
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  abortIngest: () => {
    const id = get().activeDraftId;
    if (id) deleteDraftRecord(id);
    if (get().workspace === "draft") {
      const live = liveOf(get);
      set({
        workspace: "live",
        graph: live,
        liveGraph: null,
        ingest: { ...EMPTY_INGEST },
        activeDraftId: null,
        drafts: readDraftIndex(),
        peekStack: [],
      });
    } else {
      set({ ingest: { ...EMPTY_INGEST }, activeDraftId: null, drafts: readDraftIndex() });
    }
    clearActive();
    toast("Đã bỏ lô");
  },
  autosaveDraft: () => {
    const ingest = get().ingest;
    if (ingest.phase === "drop" || ingest.phase === "done") return;
    const live = liveOf(get);
    const id = get().activeDraftId || newDraftId();
    const existing = loadDraft(id);
    const graph = get().workspace === "draft" && get().graph ? get().graph! : materializeDraft(live, ingest);
    saveDraftRecord({
      id,
      name: existing?.name || draftNameOf(ingest),
      phase: ingest.phase,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      counts: countsOf(graph, ingest),
      ingest,
      graph,
    });
    if (!get().activeDraftId) set({ activeDraftId: id });
    set({ drafts: readDraftIndex() });
    persistNow(get);
  },
  saveDraft: () => {
    const ingest = get().ingest;
    if (ingest.phase === "drop") {
      toast("Chưa có lô để cất");
      return;
    }
    const live = liveOf(get);
    const id = get().activeDraftId || newDraftId();
    const existing = loadDraft(id);
    const graph = get().workspace === "draft" && get().graph ? get().graph! : materializeDraft(live, ingest);
    saveDraftRecord({
      id,
      name: existing?.name || draftNameOf(ingest),
      phase: ingest.phase === "done" ? "commit" : ingest.phase,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      counts: countsOf(graph, ingest),
      ingest,
      graph,
    });
    set({
      workspace: "live",
      graph: live,
      liveGraph: null,
      ingest: { ...EMPTY_INGEST },
      activeDraftId: null,
      drafts: readDraftIndex(),
      peekStack: [],
      modal: null,
    });
    clearActive();
    persistActive({ ingest: { ...EMPTY_INGEST }, activeDraftId: null, workspace: "live" });
    toast("Đã cất nháp. Mở lại từ danh sách — hoặc bắt đầu lô mới.");
    get().go("nhap-so");
  },
  openDraftDesk: () => {
    const ingest = get().ingest;
    if (ingest.phase === "drop") {
      toast("Chưa có dữ liệu lô");
      return;
    }
    const live = liveOf(get);
    const id = get().activeDraftId || newDraftId();
    const graph = materializeDraft(live, ingest);
    const existing = loadDraft(id);
    saveDraftRecord({
      id,
      name: existing?.name || draftNameOf(ingest),
      phase: ingest.phase,
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now(),
      counts: countsOf(graph, ingest),
      ingest,
      graph,
    });
    set({
      workspace: "draft",
      liveGraph: live,
      graph,
      activeDraftId: id,
      drafts: readDraftIndex(),
      peekStack: [],
    });
    persistActive({ ingest, activeDraftId: id, workspace: "draft" });
    get().go(DRAFT_HOME);
  },
  resumeDraft: (id, opts) => {
    const rec = loadDraft(id);
    if (!rec) { toast("Không tìm thấy nháp"); return; }
    const live = liveOf(get);
    const ingest = rec.ingest;
    if (opts?.openDesk) {
      const graph = rec.graph ? hydrateGraph(rec.graph) : materializeDraft(live, ingest);
      set({
        workspace: "draft",
        liveGraph: live,
        graph,
        ingest,
        activeDraftId: id,
        peekStack: [],
      });
      persistActive({ ingest, activeDraftId: id, workspace: "draft" });
      get().go(DRAFT_HOME);
      toast("Đã mở sổ nháp");
      return;
    }
    if (get().workspace === "draft") {
      set({ workspace: "live", graph: live, liveGraph: null });
    }
    set({ ingest, activeDraftId: id, peekStack: [] });
    persistActive({ ingest, activeDraftId: id, workspace: "live" });
    get().go("nhap-so");
    toast("Tiếp tục lô nháp");
  },
  exitDraft: () => {
    if (get().workspace !== "draft") return;
    const live = liveOf(get);
    set({ workspace: "live", graph: live, liveGraph: null, peekStack: [] });
    persistNow(get);
  },
  deleteDraft: (id) => {
    deleteDraftRecord(id);
    if (get().activeDraftId === id) {
      set({ ingest: { ...EMPTY_INGEST }, activeDraftId: null });
      clearActive();
    }
    set({ drafts: readDraftIndex() });
    toast("Đã xóa nháp");
  },
  commitIngest: () => {
    const ingest = get().ingest;
    const linked = ingest.linked || (ingest.records.length ? linkDump(ingest.records) : null);
    if (!linked) { toast("Chưa có dữ liệu để ghi"); return; }
    if (reviewPending(ingest.review)) { toast("Còn trùng hoặc lệch lịch chưa xử lý"); return; }
    const live = liveOf(get);
    const next = applyCommit(live, linked, ingest.review);
    if (next.meta.workspace) delete next.meta.workspace;
    localStorage.setItem(LS, JSON.stringify(next));
    const id = get().activeDraftId;
    if (id) deleteDraftRecord(id);
    const result = buildCommit(linked, ingest.review);
    set({
      workspace: "live",
      graph: next,
      liveGraph: null,
      ingest: { ...ingest, phase: "done", result, linked },
      activeDraftId: null,
      drafts: readDraftIndex(),
      peekStack: [],
      rev: get().rev + 1,
    });
    persistActive({ ingest: { ...EMPTY_INGEST }, activeDraftId: null, workspace: "live" });
    toast(`Đã ghi sổ · ${result.students} HS`);
    get().go("hom-nay");
  },
  resolveDuplicate: (id, action) => {
    const ingest = get().ingest;
    const review = ingest.review;
    if (!review) return;
    const duplicates = review.duplicates.map((d) => d.id === id ? { ...d, action } : d);
    const live = liveOf(get);
    const linked = ingest.linked;
    const conflicts = linked ? detectConflicts(live, linked, duplicates, review.conflicts) : review.conflicts;
    const next = { ...ingest, review: { duplicates, conflicts } };
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  resolveAllDuplicates: (kind, action) => {
    const ingest = get().ingest;
    const review = ingest.review;
    if (!review) return;
    const duplicates = review.duplicates.map((d) => {
      if (kind !== "all" && d.kind !== kind) return d;
      if (!d.diffs.some((x) => x.changed) && d.action === "keep") return d;
      return { ...d, action };
    });
    const live = liveOf(get);
    const linked = ingest.linked;
    const conflicts = linked ? detectConflicts(live, linked, duplicates, review.conflicts) : review.conflicts;
    const next = { ...ingest, review: { duplicates, conflicts } };
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  resolveConflict: (id, action, roomId) => {
    const ingest = get().ingest;
    const review = ingest.review;
    if (!review) return;
    const conflicts = review.conflicts.map((c) => c.id === id ? { ...c, action, roomId: roomId || c.suggestRoom?.id } : c);
    const next = { ...ingest, review: { ...review, conflicts } };
    set({ ingest: next });
    persistNow(get);
    get().autosaveDraft();
  },
  ensureReview: () => {
    const ingest = get().ingest;
    if (!ingest.linked) return;
    const live = liveOf(get);
    const review = buildReview(live, ingest.linked, ingest.records, ingest.review);
    if (ingest.review === review) return;
    set({ ingest: { ...ingest, review } });
    persistNow(get);
  },
}));

export { enrollOf, roster, attOf };
