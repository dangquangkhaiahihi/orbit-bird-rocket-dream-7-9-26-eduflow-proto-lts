import { clsName, fmtDay, fmtRange, fmtShort, fmtTime, money, one, stuName } from "./format";
import {
  absentCaseStatus,
  attOf,
  billingLabel,
  confirmedGuests,
  creditAlerts,
  enrollPayKind,
  guardianOf,
  roster,
  unpaidLearned,
} from "./store";
import { TEACHER_ID } from "./roles";
import { CRM_LEADS, RECON_LOGS } from "./tenant";
import type { Graph, Role } from "./types";
import { LANES } from "./format";

export type DeskLaneId = (typeof LANES)[number]["id"];
export type DeskItem = Graph["exceptions"][number];
export type StoryKind = "buoi" | "baitap" | "nhanxet" | "hocphi";
export type StoryEvent = {
  id: string;
  at: string;
  kind: StoryKind;
  title: string;
  detail: string;
  lessonId?: string | null;
  enrollmentId?: string | null;
};

function shortClass(g: Graph, classId: string) {
  return clsName(g, classId).split("—")[0].trim();
}

function seedHit(g: Graph, lane: string, lessonId: string, studentId: string | null) {
  return g.exceptions.find((e) => (
    e.lane === lane
    && e.lesson_id === lessonId
    && (studentId == null || e.student_id === studentId || e.student_id == null)
  ));
}

function marked(g: Graph, hwId: string, studentId: string) {
  return g.homework.some((x) => x.homework_id === hwId && x.student_id === studentId && x.mark);
}

function lessonOpen(l: Graph["lessons"][number], today: string) {
  return l.status !== "cancelled" && l.status !== "completed" && l.start.slice(0, 10) <= today;
}

function givenName(g: Graph, studentId: string) {
  return stuName(g, studentId).split(" ").pop() || "";
}

/** Live ops board — derived from the graph, not the frozen exception list. */
export function computeDesk(g: Graph, opts?: { teacherId?: string }): DeskItem[] {
  const teacherId = opts?.teacherId;
  const lessons = g.lessons.filter((l) => l.status !== "cancelled" && (!teacherId || l.teacher_id === teacherId));
  const out: DeskItem[] = [];
  const seen = new Set<string>();

  function push(item: DeskItem) {
    const key = `${item.lane}|${item.lesson_id}|${item.student_id || ""}|${item.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  for (const l of lessons) {
    if (!lessonOpen(l, g.meta.today)) continue;
    const missingRoster = roster(g, l.class_id).filter((e) => !attOf(g, l.id, e.student_id));
    const guests = confirmedGuests(g, l.id);
    const missingGuests = guests.filter((m) => !attOf(g, l.id, m.student_id));
    if (!missingRoster.length && !missingGuests.length) continue;
    const seed = seedHit(g, "attendance_pending", l.id, null);
    const n = roster(g, l.class_id).length;
    push(seed || {
      id: `ex_att_${l.id}`,
      lane: "attendance_pending",
      lesson_id: l.id,
      student_id: missingRoster[0]?.student_id || missingGuests[0]?.student_id || null,
      title: `${shortClass(g, l.class_id)} ${fmtDay(l.start)} chưa điểm danh${guests.length ? " — có học bù" : ""}`,
      detail: `${fmtTime(l.start)}–${fmtTime(l.end)} · ${n} học sinh${guests.length ? ` + ${guests.length} học bù` : ""}`,
      cta: "Điểm danh",
      tab: "attendance",
    });
  }

  for (const hw of g.homework.filter((h) => h.lesson_id && !h.homework_id)) {
    const les = one(g.lessons, hw.lesson_id);
    if (!les || les.status === "cancelled") continue;
    if (teacherId && les.teacher_id !== teacherId) continue;
    const unmarked = roster(g, les.class_id).filter((e) => !marked(g, hw.id, e.student_id));
    if (!unmarked.length) continue;
    push({
      id: `ex_hw_${hw.id}`,
      lane: "homework_pending",
      lesson_id: les.id,
      student_id: unmarked[0].student_id,
      title: `Chấm bài ${shortClass(g, les.class_id)}`,
      detail: `${unmarked.length} em chưa chấm · ${hw.title || "Bài buổi này"} · ${fmtDay(les.start)}`,
      cta: "Chấm bài",
      tab: "homework",
    });
  }

  if (!teacherId) {
    for (const mk of g.makeups.filter((m) => m.status === "waiting_parent")) {
      const grd = guardianOf(g, mk.student_id);
      const seed = seedHit(g, "waiting_parent", mk.source_lesson_id, mk.student_id);
      push(seed || {
        id: `ex_wait_${mk.id}`,
        lane: "waiting_parent",
        lesson_id: mk.source_lesson_id,
        student_id: mk.student_id,
        title: `${grd?.full_name || "PH"} chưa xác nhận buổi học bù của ${stuName(g, mk.student_id)}`,
        detail: mk.target_lesson_id
          ? (() => {
            const tgt = one(g.lessons, mk.target_lesson_id);
            return tgt ? `Đề xuất ${fmtRange(tgt.start, tgt.end)} · ${shortClass(g, tgt.class_id)}` : "Chờ phụ huynh";
          })()
          : "Chờ phụ huynh",
        cta: "Xem học bù",
        tab: "makeup",
      });
    }

    for (const a of g.attendance.filter((x) => x.status === "absent")) {
      const les = one(g.lessons, a.lesson_id);
      if (!les || les.is_makeup) continue;
      const st = absentCaseStatus(g, a);
      if (st !== "need_makeup" && st !== "declined") continue;
      const seed = seedHit(g, "needs_decision", a.lesson_id, a.student_id);
      push(seed || {
        id: `ex_abs_${a.id}`,
        lane: "needs_decision",
        lesson_id: a.lesson_id,
        student_id: a.student_id,
        title: `${stuName(g, a.student_id)} vắng — ${st === "declined" ? "PH từ chối học bù" : "cần xếp học bù"}`,
        detail: `${shortClass(g, les.class_id)} · ${fmtDay(les.start)}${a.reason ? ` · ${a.reason}` : ""}`,
        cta: "Xếp học bù",
        tab: "makeup",
      });
    }

    for (const s of g.students.filter((x) => x.active)) {
      if (!g.enrollments.some((e) => e.student_id === s.id && e.status === "active")) continue;
      const links = g.student_guardians.filter((x) => x.student_id === s.id);
      const pending = links
        .map((l) => one(g.guardians, l.guardian_id))
        .filter((grd) => grd && grd.zalo_status !== "linked");
      if (!pending.length) continue;
      const les = g.lessons.filter((l) => (
        roster(g, l.class_id).some((e) => e.student_id === s.id) && l.start.slice(0, 10) >= g.meta.today
      )).sort((a, b) => a.start.localeCompare(b.start))[0];
      const seed = seedHit(g, "needs_decision", les?.id || "", s.id);
      push(seed || {
        id: `ex_zalo_${s.id}`,
        lane: "needs_decision",
        lesson_id: les?.id || "",
        student_id: s.id,
        title: `${stuName(g, s.id)} chưa liên kết Zalo — không gửi được báo buổi`,
        detail: `${pending[0]?.full_name || "PH"} ${pending[0]?.zalo_status || "pending"}`,
        cta: "Mở học sinh",
        tab: null,
      });
    }

    for (const a of g.attendance.filter((x) => x.unpaid_flag && (x.status === "present" || x.status === "late"))) {
      const seed = seedHit(g, "money", a.lesson_id, a.student_id);
      const enr = one(g.enrollments, a.enrollment_id);
      push(seed || {
        id: `ex_unpaid_${a.id}`,
        lane: "money",
        lesson_id: a.lesson_id,
        student_id: a.student_id,
        title: `${stuName(g, a.student_id)} đi học — học phí còn mở`,
        detail: `${enr ? billingLabel(g, enr) : "cờ nợ"} · không đuổi ra`,
        cta: "Thu học phí",
        tab: "ledger",
      });
    }

    for (const e of creditAlerts(g)) push(e);

    for (const ev of g.zalo_events.filter((x) => x.status === "failed")) {
      const seed = seedHit(g, "delivery_failed", ev.lesson_id || "", ev.student_id);
      push(seed || {
        id: `ex_fail_${ev.id}`,
        lane: "delivery_failed",
        lesson_id: ev.lesson_id || "",
        student_id: ev.student_id,
        title: `${ev.template} · ${stuName(g, ev.student_id)} — gửi Zalo thất bại`,
        detail: ev.fail_reason || one(g.guardians, ev.guardian_id)?.full_name || "Lỗi gửi",
        cta: "Gửi lại",
        tab: "timeline",
      });
    }

    for (const s of g.students.filter((x) => x.active)) {
      const ens = g.enrollments.filter((e) => e.student_id === s.id);
      const trial = ens.some((e) => e.status === "trial") || /học thử/i.test(s.notes || "");
      const none = !ens.length;
      if (!trial && !none) continue;
      push({
        id: `ex_crm_${s.id}`,
        lane: "crm",
        lesson_id: "",
        student_id: s.id,
        title: `${s.full_name} · ${trial ? "học thử" : "chưa ghi danh"}`,
        detail: s.notes || (trial ? "Học thử — chưa vào lớp" : "Chưa ghi danh"),
        cta: "Mở học sinh",
        tab: null,
      });
    }

    for (const e of g.exceptions) {
      const dup = out.some((x) => (
        x.lane === e.lane
        && x.lesson_id === e.lesson_id
        && (x.student_id || "") === (e.student_id || "")
      ));
      if (dup) continue;
      push(e);
    }
  }

  return out;
}

export function deskForRole(g: Graph, role: Role) {
  const teacherId = role === "teacher" ? TEACHER_ID : undefined;
  let items = computeDesk(g, { teacherId });
  if (role === "teacher") {
    items = items.filter((e) => e.lane === "attendance_pending" || e.lane === "homework_pending");
  }
  const lanes = LANES.filter((l) => {
    if (role === "teacher") return l.id === "attendance_pending" || l.id === "homework_pending";
    if (l.id === "crm") return items.some((e) => e.lane === "crm");
    return true;
  });
  return { lanes, items };
}

export function directorStats(g: Graph) {
  const ym = g.meta.today.slice(0, 7);
  const monthPays = g.payments.filter((p) => (p.paid_at || "").slice(0, 7) === ym);
  const salesMonth = monthPays.reduce((s, p) => s + (p.amount || 0), 0);
  const todayPays = g.payments.filter((p) => (p.paid_at || "").slice(0, 10) === g.meta.today);
  const salesToday = todayPays.reduce((s, p) => s + (p.amount || 0), 0);
  const todayLessons = g.lessons.filter((l) => l.start.slice(0, 10) === g.meta.today && l.status !== "cancelled");
  const todayIds = new Set(todayLessons.map((l) => l.id));
  const att = g.attendance.filter((a) => todayIds.has(a.lesson_id));
  const present = att.filter((a) => a.status === "present" || a.status === "late").length;
  const marked = att.filter((a) => a.status && a.status !== "scheduled").length;
  let attRate = marked ? Math.round((present / marked) * 100) : null;
  let attHint = marked ? "Có mặt / đã ghi" : "Chưa điểm danh";
  if (attRate == null) {
    const all = g.attendance.filter((a) => a.status === "present" || a.status === "late" || a.status === "absent");
    const p = all.filter((a) => a.status === "present" || a.status === "late").length;
    if (all.length) {
      attRate = Math.round((p / all.length) * 100);
      attHint = "Tính từ sổ đã ghi";
    }
  }
  const pending = g.enrollments.filter((e) => {
    if (e.status !== "active") return false;
    const k = enrollPayKind(g, e);
    return k === "pay_debt" || k === "pay_empty" || k === "pay_low";
  });
  const newLeads = CRM_LEADS.filter((l) => l.status === "new");
  const misaErr = RECON_LOGS.filter((r) => r.kind === "misa_error");
  return {
    salesToday,
    salesMonth,
    salesMonthLabel: money(salesMonth),
    salesTodayLabel: money(salesToday),
    attRate,
    attHint,
    pendingN: pending.length,
    pendingDebt: pending.reduce((s, e) => s + unpaidLearned(g, e.id).length, 0),
    leadN: newLeads.length,
    vietqrOk: 24,
    misaErrN: misaErr.length,
    leads: CRM_LEADS,
    recon: RECON_LOGS,
  };
}

export function soloHomeworkInflow(g: Graph) {
  const assigned = g.homework.filter((h) => h.lesson_id && !h.homework_id);
  const rows: Array<{ id: string; student_id: string; title: string; detail: string; lesson_id: string; mark: string }> = [];
  for (const hw of assigned) {
    const marks = g.homework.filter((x) => x.homework_id === hw.id && x.student_id);
    for (const m of marks) {
      if (m.mark !== "done" && m.mark !== "late") continue;
      const les = one(g.lessons, hw.lesson_id);
      rows.push({
        id: m.id,
        student_id: m.student_id || "",
        title: `${stuName(g, m.student_id || "")} nộp ${m.mark === "late" ? "trễ" : "bài"}`,
        detail: `${hw.title || "Bài buổi này"}${les ? ` · ${fmtTime(les.start)}` : ""}`,
        lesson_id: hw.lesson_id || "",
        mark: m.mark || "",
      });
    }
  }
  return rows;
}

export function dueCollections(g: Graph) {
  return g.enrollments
    .filter((e) => e.status === "active")
    .map((e) => ({ e, kind: enrollPayKind(g, e) }))
    .filter((x) => x.kind === "pay_debt" || x.kind === "pay_empty" || x.kind === "pay_low")
    .map((x) => ({
      id: x.e.id,
      student_id: x.e.student_id,
      class_id: x.e.class_id,
      kind: x.kind,
      remaining: x.e.remaining_sessions ?? 0,
      debt: unpaidLearned(g, x.e.id).length,
    }));
}

export function lessonTasks(g: Graph, lessonId: string) {
  const les = one(g.lessons, lessonId);
  if (!les) return { hw: [] as Graph["homework"], unmarked: 0, absents: [] as Graph["attendance"], debts: [] as Graph["attendance"] };
  const rows = roster(g, les.class_id);
  const guests = confirmedGuests(g, les.id);
  const hw = g.homework.filter((h) => h.lesson_id === les.id && !h.homework_id);
  const unmarked = hw.reduce((n, h) => n + rows.filter((e) => !marked(g, h.id, e.student_id)).length, 0);
  const absents = g.attendance.filter((a) => a.lesson_id === les.id && (a.status === "absent" || a.status === "excused") && !guests.some((m) => m.student_id === a.student_id));
  const debts = g.attendance.filter((a) => a.lesson_id === les.id && a.unpaid_flag);
  return { hw, unmarked, absents, debts };
}

export function studentStory(g: Graph, studentId: string): StoryEvent[] {
  const events: StoryEvent[] = [];
  for (const a of g.attendance.filter((x) => x.student_id === studentId)) {
    const les = one(g.lessons, a.lesson_id);
    if (!les) continue;
    events.push({
      id: `att-${a.id}`,
      at: les.start,
      kind: "buoi",
      title: `${shortClass(g, les.class_id)} · ${a.status === "present" ? "có mặt" : a.status === "late" ? "trễ" : a.status === "excused" ? "phép" : "vắng"}`,
      detail: `${fmtRange(les.start, les.end)}${a.reason ? ` · ${a.reason}` : ""}${a.unpaid_flag ? " · cờ nợ" : ""}`,
      lessonId: les.id,
      enrollmentId: a.enrollment_id,
    });
  }
  for (const m of g.homework.filter((x) => x.student_id === studentId && x.homework_id && x.mark)) {
    const hw = g.homework.find((h) => h.id === m.homework_id);
    const les = hw?.lesson_id ? one(g.lessons, hw.lesson_id) : undefined;
    events.push({
      id: `hw-${m.id}`,
      at: hw?.assigned_at || les?.start || g.meta.clock,
      kind: "baitap",
      title: `Nộp bài · ${hw?.title || "Bài buổi"}`,
      detail: m.mark === "done" ? "xong" : m.mark === "late" ? "nộp trễ" : "thiếu",
      lessonId: les?.id,
    });
  }
  for (const n of g.notes) {
    const les = one(g.lessons, n.lesson_id);
    if (!les) continue;
    const onRoster = roster(g, les.class_id).some((e) => e.student_id === studentId)
      || g.attendance.some((a) => a.lesson_id === les.id && a.student_id === studentId);
    if (!onRoster) continue;
    const mine = givenName(g, studentId);
    const others = roster(g, les.class_id)
      .map((e) => givenName(g, e.student_id))
      .filter((x) => x && x !== mine);
    const hitsMine = Boolean(mine && n.body.includes(mine));
    const hitsOther = others.some((x) => n.body.includes(x));
    if (hitsOther && !hitsMine) continue;
    events.push({
      id: `nt-${n.id}-${studentId}`,
      at: n.at,
      kind: "nhanxet",
      title: `Nhận xét · ${shortClass(g, les.class_id)}`,
      detail: n.body,
      lessonId: les.id,
    });
  }
  for (const p of (g.payments || []).filter((x) => x.student_id === studentId)) {
    events.push({
      id: `pay-${p.id}`,
      at: p.paid_at.length === 10 ? `${p.paid_at}T12:00:00+07:00` : p.paid_at,
      kind: "hocphi",
      title: `Đóng học phí · ${money(p.amount)}`,
      detail: `${shortClass(g, p.class_id)}${p.sessions ? ` · +${p.sessions} buổi` : ""}${p.paid_through ? ` · đến ${fmtShort(p.paid_through)}` : ""}${p.note ? ` · ${p.note}` : ""}`,
      enrollmentId: p.enrollment_id,
    });
  }
  events.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  return events;
}

export function moneyStripe(g: Graph, studentId: string) {
  return g.enrollments
    .filter((e) => e.student_id === studentId)
    .map((e) => ({
      id: e.id,
      classId: e.class_id,
      className: shortClass(g, e.class_id),
      life: e.status,
      pay: enrollPayKind(g, e),
      label: billingLabel(g, e),
    }));
}
