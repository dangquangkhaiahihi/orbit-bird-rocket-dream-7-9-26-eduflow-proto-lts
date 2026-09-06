import type { ChargeModel, ClassLife, Graph, PromoKind, Promotion, Recurrence, RecurrenceDay, TuitionPlan } from "./types.ts";

export const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const LS = "eduflow-impact-v5";
export const DURATION_MINS = [30, 60, 90, 120, 150, 180];

export const LANES = [
  { id: "needs_decision", label: "Cần quyết", tone: "need" as const },
  { id: "waiting_parent", label: "Chờ phụ huynh", tone: "wait" as const },
  { id: "money", label: "Theo học phí", tone: "money" as const },
  { id: "delivery_failed", label: "Gửi lỗi", tone: "fail" as const },
  { id: "attendance_pending", label: "Chưa điểm danh", tone: "att" as const },
  { id: "homework_pending", label: "Cần chấm bài", tone: "need" as const },
  { id: "crm", label: "Học thử", tone: "wait" as const },
] as const;

export const JOBS = [
  { id: "hom-nay", label: "Hôm nay" },
  { id: "buoi", label: "Buổi" },
  { id: "vang", label: "Vắng" },
  { id: "lop", label: "Lớp" },
  { id: "hoc-sinh", label: "Học sinh" },
  { id: "zalo", label: "Zalo" },
] as const;

export function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function vn(iso: string) {
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) {
    const x = new Date(iso);
    return { y: x.getFullYear(), mo: x.getMonth() + 1, day: x.getDate(), h: x.getHours(), mi: x.getMinutes(), wd: x.getDay() };
  }
  const y = +m[1], mo = +m[2], day = +m[3], h = +m[4], mi = +m[5];
  const wd = new Date(Date.UTC(y, mo - 1, day)).getUTCDay();
  return { y, mo, day, h, mi, wd };
}

export function toVnIso(localValue: string, addMin = 0) {
  const m = String(localValue || "").match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return localValue;
  let y = +m[1], mo = +m[2], day = +m[3], h = +m[4], mi = +m[5] + addMin;
  while (mi >= 60) { mi -= 60; h += 1; }
  while (h >= 24) { h -= 24; day += 1; }
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  while (day > dim) { day -= dim; mo += 1; }
  return `${y}-${pad(mo)}-${pad(day)}T${pad(h)}:${pad(mi)}:00+07:00`;
}

export function fmtDay(iso: string) {
  const x = vn(iso);
  return `${WD[x.wd]} ${pad(x.day)}/${pad(x.mo)}`;
}
export function fmtTime(iso: string) {
  const x = vn(iso);
  return `${pad(x.h)}:${pad(x.mi)}`;
}
export function fmtRange(a: string, b: string) {
  return `${fmtDay(a)} ${fmtTime(a)}–${fmtTime(b)}`;
}
export function fmtShort(dateStr?: string | null) {
  if (!dateStr) return "—";
  const p = dateStr.split("-");
  return `${p[2]}/${p[1]}`;
}
export function money(n?: number | null) {
  return n == null ? "—" : Number(n).toLocaleString("vi-VN") + "₫";
}
export function actorOf(role: string) {
  if (role === "teacher") return { name: "Phạm Quốc Huy", title: "Giáo viên" };
  if (role === "assistant") return { name: "Lê Thu Mai", title: "Trợ lý" };
  return { name: "Nguyễn Thu Trang", title: "Giáo vụ" };
}
export function initials(name?: string) {
  return (name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((w) => w[0])
    .join("")
    .slice(0, 2);
}

export function one<T extends { id: string }>(col: T[] | undefined, id: string | null | undefined) {
  return (col || []).find((x) => x.id === id);
}

export function clsName(g: Graph, id: string) {
  return one(g.classes, id)?.name || "—";
}
export function contentKeyOf(c: { content_key?: string; name: string }) {
  return (c.content_key || c.name.split("—")[0] || "").trim();
}
export function contentLabel(g: Graph, classId: string) {
  const c = one(g.classes, classId);
  return c ? contentKeyOf(c) : "—";
}
export function tchName(g: Graph, id: string) {
  return one(g.teachers, id)?.name || "—";
}
export function rmName(g: Graph, id: string) {
  return one(g.rooms, id)?.name || "—";
}
export function stuName(g: Graph, id: string) {
  return one(g.students, id)?.full_name || "—";
}
export function brName(g: Graph, id: string) {
  return one(g.branches, id)?.name || "—";
}
export function grdName(g: Graph, id: string) {
  return one(g.guardians, id)?.full_name || "—";
}
export function phoneOk(p: string) {
  const d = String(p || "").replace(/\D/g, "");
  return d.length >= 9 && d.length <= 11;
}
export function nid(p: string) {
  return p + "_" + Math.random().toString(36).slice(2, 8);
}

export const STATUS_VN: Record<string, string> = {
  waiting_parent: "chờ PH",
  confirmed: "đã nhận",
  declined: "không nhận",
  draft: "nháp",
  completed: "đã đóng",
  scheduled: "chờ",
  cancelled: "đã hủy",
  delivered: "đã gửi",
  failed: "lỗi",
  pending: "chờ",
  linked: "xong",
  present: "có mặt",
  absent: "vắng",
  late: "trễ",
  excused: "phép",
  monthly: "tháng",
  prepaid_session: "prepaid",
  per_lesson: "theo buổi",
  prepaid: "prepaid",
  bundle: "combo",
  deposit: "đặt cọc",
  course: "khóa",
  active: "đang học",
  paused: "tạm nghỉ",
  dropped: "nghỉ",
  trial: "học thử",
  open: "đang mở",
  closed: "đóng",
  running: "đang hoạt động",
  finished: "đã hoàn thành",
  pay_ok: "đủ buổi học",
  pay_low: "sắp hết buổi học",
  pay_empty: "hết buổi học",
  pay_debt: "còn nợ",
  pay_deposit: "đã cọc",
  queued: "chờ gửi",
  sent: "đã gửi",
  skipped: "bỏ",
  runout: "sắp hết buổi học",
  debt: "nợ buổi học",
  both: "nợ và sắp hết",
  cash: "tiền mặt",
  transfer: "chuyển khoản",
  momo: "MoMo",
  need_makeup: "cần xếp",
  ignored: "bỏ qua",
  always: "vắng vẫn trừ",
  on_makeup: "trừ khi học bù",
};

export function statusVn(s?: string | null) {
  if (!s) return "—";
  return STATUS_VN[s] || s;
}

export function statusTone(s?: string | null): "ok" | "warn" | "bad" | "line" {
  if (s === "confirmed" || s === "delivered" || s === "linked" || s === "present" || s === "completed" || s === "ok" || s === "running" || s === "pay_ok" || s === "finished" || s === "active" || s === "sent") return "ok";
  if (s === "waiting_parent" || s === "pending" || s === "late" || s === "scheduled" || s === "draft" || s === "pay_low" || s === "pay_deposit" || s === "paused" || s === "queued" || s === "runout" || s === "on_makeup" || s === "trial") return "warn";
  if (s === "declined" || s === "failed" || s === "absent" || s === "cancelled" || s === "pay_debt" || s === "pay_empty" || s === "dropped" || s === "both" || s === "debt" || s === "need_makeup") return "bad";
  return "line";
}

export function addDays(isoDate: string, n: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function weekdayOf(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function nextOnWeekday(from: string, weekday: number) {
  let d = from;
  for (let i = 0; i < 7; i += 1) {
    if (weekdayOf(d) === weekday) return d;
    d = addDays(d, 1);
  }
  return from;
}

/** Regular buổi already run vs planned. Open-ended → `5/-`. Counted course → `5/20`. */
export function classLessonProgress(g: Graph, classId: string) {
  const cls = one(g.classes, classId);
  if (!cls) return { done: 0, total: null as number | null, label: "—" };
  const rec = normalizeRecurrence(cls.recurrence);
  const plan = courseOf(g, classId)?.plan;
  const counted = plan?.course_sessions || cls.course_total_sessions || 0;
  const today = g.meta.today;
  const cancelled = new Set(
    g.lessons
      .filter((l) => l.class_id === classId && l.status === "cancelled" && !l.is_makeup)
      .map((l) => l.start.slice(0, 10)),
  );
  const byWd = new Set(rec.days.map((d) => d.weekday));
  const end = cls.end_date;
  let done = 0;
  let planned = 0;
  const last = end && end > today ? end : today;
  let d = cls.start_date;
  for (let i = 0; i < 800 && d <= last; i += 1) {
    if (end && d > end) break;
    if (byWd.has(weekdayOf(d)) && !cancelled.has(d)) {
      planned += 1;
      if (d < today) done += 1;
      else if (d === today) {
        const les = g.lessons.find((l) => l.class_id === classId && l.start.slice(0, 10) === today && !l.is_makeup);
        if (les?.status === "completed") done += 1;
      }
    }
    d = addDays(d, 1);
  }
  if (counted > 0) {
    const n = Math.min(done, counted);
    return { done: n, total: counted, label: `${n}/${counted}` };
  }
  if (end) return { done, total: planned, label: `${done}/${planned}` };
  return { done, total: null, label: `${done}/-` };
}

export function classIsOpenEnded(g: Graph, classId: string) {
  const cls = one(g.classes, classId);
  if (!cls || cls.end_date) return false;
  const plan = courseOf(g, classId)?.plan;
  if (plan?.course_sessions) return false;
  return true;
}

export function daysBetween(a: string, b: string) {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / 86400000);
}

export function classLife(g: Graph, c: Graph["classes"][number]): ClassLife {
  if (c.life) return c.life;
  if (!c.active) return "cancelled";
  if (c.end_date && c.end_date < g.meta.today) return "finished";
  return "running";
}

export function minutesBetween(start: string, end: string) {
  const [ah, am] = start.split(":").map(Number);
  const [bh, bm] = end.split(":").map(Number);
  return bh * 60 + bm - (ah * 60 + am);
}

export function addMinutesHhmm(hhmm: string, min: number) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  const tot = h * 60 + m + min;
  if (tot < 0 || tot >= 24 * 60) return "";
  return `${pad(Math.floor(tot / 60))}:${pad(tot % 60)}`;
}

export function timeSlots(from = "06:00", to = "21:30") {
  const out: string[] = [];
  let t = from;
  while (t && t <= to) {
    out.push(t);
    t = addMinutesHhmm(t, 30);
  }
  return out;
}

export const TIME_SLOTS = timeSlots();

export function dateToVn(d: Date) {
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const mo = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  const h = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  const wd = new Date(Date.UTC(y, shifted.getUTCMonth(), shifted.getUTCDate())).getUTCDay();
  return { ymd: `${y}-${mo}-${day}`, wd, hhmm: `${h}:${mi}` };
}

export function schoolOrder(w: number) {
  return w === 0 ? 7 : w;
}

export function normalizeRecurrence(r: Recurrence | { weekdays?: number[]; start_time?: string; end_time?: string; duration_min?: number; days?: RecurrenceDay[] }): { duration_min: number; days: RecurrenceDay[] } {
  if (r.days?.length) {
    const st0 = r.days[0].start_time;
    const dur = r.duration_min || (r.start_time && r.end_time ? minutesBetween(r.start_time, r.end_time) : minutesBetween(st0, addMinutesHhmm(st0, 90) || "00:00") || 90);
    return { duration_min: dur, days: r.days };
  }
  const st = r.start_time || "08:00";
  const dur = r.duration_min || (r.end_time ? minutesBetween(st, r.end_time) : 90);
  return { duration_min: dur || 90, days: (r.weekdays || []).map((w) => ({ weekday: w, start_time: st })) };
}

export function formatRecurrence(r: Recurrence | { weekdays?: number[]; start_time?: string; end_time?: string; duration_min?: number; days?: RecurrenceDay[] } | undefined | null) {
  if (!r) return "—";
  const { duration_min, days } = normalizeRecurrence(r);
  if (!days.length) return "Chưa có lịch";
  const sorted = [...days].sort((a, b) => schoolOrder(a.weekday) - schoolOrder(b.weekday));
  const starts = new Set(sorted.map((d) => d.start_time));
  if (starts.size === 1) {
    const st = sorted[0].start_time;
    const et = addMinutesHhmm(st, duration_min) || "?";
    return `${sorted.map((d) => WD[d.weekday]).join(" · ")} ${st}–${et}`;
  }
  return sorted.map((d) => `${WD[d.weekday]} ${d.start_time}–${addMinutesHhmm(d.start_time, duration_min) || "?"}`).join(" · ");
}

export function weekdayTag(days: RecurrenceDay[] | undefined | null) {
  if (!days?.length) return "";
  return [...days].sort((a, b) => schoolOrder(a.weekday) - schoolOrder(b.weekday)).map((d) => WD[d.weekday]).join("–");
}

export function classInstanceName(courseName: string, rec: Recurrence | { days?: RecurrenceDay[] } | undefined | null) {
  const short = (courseName || "").split("—")[0].trim() || "Lớp";
  const days = rec && "days" in rec ? rec.days : undefined;
  const tag = weekdayTag(days);
  return tag ? `${short} · ${tag}` : short;
}

export const CHARGE_MODELS: Array<{ id: ChargeModel; title: string; hint: string; unit: string }> = [
  { id: "course", title: "Khóa", hint: "Một phí cho cả khóa. Có thể trả góp.", unit: "/khóa" },
  { id: "monthly", title: "Theo tháng", hint: "Phí tháng. Số buổi học = buổi/tuần × 4.", unit: "/tháng" },
  { id: "per_lesson", title: "Theo buổi", hint: "Tính theo buổi học. Có mặt mới trừ.", unit: "/buổi học" },
  { id: "prepaid", title: "Gói prepaid", hint: "Mua N buổi học trước. Có hạn dùng.", unit: "/buổi học" },
  { id: "bundle", title: "Combo", hint: "Nhiều khóa, một giá.", unit: "/combo" },
  { id: "deposit", title: "Đặt cọc", hint: "Cọc giữ chỗ, phần còn lại đóng sau.", unit: "" },
];

export const PROMO_KINDS: Array<{ id: PromoKind; title: string }> = [
  { id: "percent", title: "% giảm" },
  { id: "fixed", title: "Giảm số tiền" },
  { id: "sibling", title: "Anh chị em" },
  { id: "early_bird", title: "Early-bird" },
  { id: "first_pay", title: "Đóng lần đầu" },
  { id: "prepay", title: "Trả trước" },
  { id: "waiver", title: "Miễn / học bổng" },
  { id: "bonus_sessions", title: "Tặng buổi học" },
];

export function ledgerModeOf(model: ChargeModel): "monthly" | "prepaid_session" | "course" {
  if (model === "monthly") return "monthly";
  if (model === "prepaid" || model === "per_lesson") return "prepaid_session";
  return "course";
}

export function feeUnit(mode: string) {
  if (mode === "monthly") return "/tháng";
  if (mode === "prepaid_session" || mode === "prepaid" || mode === "per_lesson") return "/buổi học";
  if (mode === "course" || mode === "bundle") return "/khóa";
  if (mode === "deposit") return " cọc";
  return "";
}

export function planLabel(plan: TuitionPlan | undefined) {
  if (!plan) return "—";
  const m = CHARGE_MODELS.find((x) => x.id === plan.model);
  const unit = m?.unit || "";
  if (plan.model === "deposit") {
    return `${m?.title || plan.model} · cọc ${money(plan.deposit_amount)} · đủ ${money(plan.fee)}`;
  }
  if (plan.model === "prepaid") {
    return `${m?.title || plan.model} · ${money(plan.fee)}${unit}${plan.pack_sessions ? ` · gói ${plan.pack_sessions}` : ""}`;
  }
  if (plan.model === "course" || plan.model === "bundle") {
    return `${m?.title || plan.model} · ${money(plan.fee)}${unit}${plan.course_sessions ? ` · ${plan.course_sessions} buổi` : ""}`;
  }
  if (plan.model === "per_lesson") return `${m?.title || plan.model} · ${money(plan.fee)}${unit}`;
  return `${m?.title || plan.model} · ${money(plan.fee)}${unit}`;
}

export function courseOf(g: Graph, classId: string) {
  const c = one(g.classes, classId);
  if (!c) return undefined;
  if (c.course_id) {
    const hit = one(g.courses || [], c.course_id);
    if (hit) return hit;
  }
  const key = c.content_key || contentKeyOf(c);
  return (g.courses || []).find((x) => x.content_key === key);
}

export function applyPromo(amount: number, promo: Promotion | undefined | null) {
  if (!promo || !promo.active) return amount;
  if (promo.kind === "bonus_sessions") return amount;
  const asPercent = promo.kind === "percent" || promo.kind === "sibling" || promo.kind === "prepay"
    || ((promo.kind === "early_bird" || promo.kind === "first_pay") && promo.value > 0 && promo.value <= 100);
  if (asPercent) return Math.max(0, Math.round(amount * (1 - promo.value / 100)));
  return Math.max(0, amount - promo.value);
}

export function promoHint(promo: Promotion) {
  if (promo.kind === "bonus_sessions") return `+${promo.value} buổi học`;
  const asPercent = promo.kind === "percent" || promo.kind === "sibling" || promo.kind === "prepay"
    || ((promo.kind === "early_bird" || promo.kind === "first_pay") && promo.value > 0 && promo.value <= 100);
  if (asPercent) return `−${promo.value}%`;
  return `−${money(promo.value)}`;
}

export function monthEnd(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(last)}`;
}

export function addMonthsEnd(ymd: string, n: number) {
  const [y, m] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + n + 1, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function nextPaidThrough(paidThrough: string | null | undefined, today: string) {
  const cur = monthEnd(today);
  if (!paidThrough || paidThrough < cur) return cur;
  return addMonthsEnd(paidThrough, 1);
}

export function throughAfterMonths(paidThrough: string | null | undefined, today: string, months: number) {
  const n = Math.max(1, months);
  const cur = monthEnd(today);
  if (!paidThrough || paidThrough < cur) return n === 1 ? cur : addMonthsEnd(cur, n - 1);
  return addMonthsEnd(paidThrough, n);
}

export function sessionsPerMonth(rec: Recurrence | undefined) {
  if (!rec) return 8;
  const n = normalizeRecurrence(rec).days.length || 1;
  return n * 4;
}

export function lessonFeeOf(cls: {
  billing_mode: string;
  fee: number;
  course_total_sessions?: number;
  recurrence: Recurrence;
}) {
  if (cls.billing_mode === "prepaid_session") return cls.fee;
  if (cls.billing_mode === "course") {
    const t = cls.course_total_sessions || 12;
    return t ? Math.round(cls.fee / t) : cls.fee;
  }
  return Math.round(cls.fee / sessionsPerMonth(cls.recurrence));
}

export function grantLabel(p: { sessions?: number | null; paid_through?: string | null }) {
  if (p.sessions) return `+${p.sessions} buổi học`;
  if (p.paid_through) return `đến ${fmtShort(p.paid_through)}`;
  return "gói khóa";
}

export type BurnSlot = { date: string; start: string; extra: boolean };

function burnedDatesOf(g: Graph, enrollmentId: string) {
  const out = new Set<string>();
  for (const a of g.attendance) {
    if (a.enrollment_id !== enrollmentId) continue;
    if (a.status !== "present" && a.status !== "late") continue;
    const les = one(g.lessons, a.lesson_id);
    if (les) out.add(les.start.slice(0, 10));
  }
  return out;
}

export function daysPerWeek(rec: Recurrence | undefined) {
  if (!rec) return 1;
  return normalizeRecurrence(rec).days.length || 1;
}

export function upcomingBurns(
  g: Graph,
  e: Graph["enrollments"][number],
  opts?: { until?: string; remaining?: number; extras?: boolean },
): BurnSlot[] {
  const cls = one(g.classes, e.class_id);
  if (!cls) return [];
  const rec = normalizeRecurrence(cls.recurrence);
  const perWeek = rec.days.length || 1;
  const n = opts?.remaining ?? e.remaining_sessions ?? 8;
  const until = opts?.until;
  let horizon = Math.max(90, Math.ceil(Math.max(n, 8) / perWeek) * 7 + 42);
  if (until && until >= g.meta.today) {
    const [yy, mm, dd] = g.meta.today.split("-").map(Number);
    const [y2, m2, d2] = until.split("-").map(Number);
    const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(yy, mm - 1, dd)) / 86400000) + 3;
    horizon = Math.max(horizon, days);
  }
  const slots = enumerateRecurrence({
    days: rec.days,
    duration_min: rec.duration_min,
    start_date: cls.start_date,
    end_date: until && cls.end_date ? (cls.end_date < until ? cls.end_date : until) : (until || cls.end_date),
    today: g.meta.today,
    horizonDays: horizon,
  });
  const cancelled = new Set(
    g.lessons.filter((l) => l.class_id === e.class_id && l.status === "cancelled").map((l) => l.start.slice(0, 10)),
  );
  const burned = burnedDatesOf(g, e.id);
  const byDate = new Map<string, BurnSlot>();
  for (const s of slots) {
    if (cancelled.has(s.date) || burned.has(s.date)) continue;
    if (until && s.date > until) continue;
    byDate.set(s.date, { date: s.date, start: s.start, extra: false });
  }
  if (opts?.extras !== false) {
    for (const m of g.makeups) {
      if (m.enrollment_id !== e.id || m.status !== "confirmed" || !m.target_lesson_id) continue;
      const les = one(g.lessons, m.target_lesson_id);
      if (!les || les.status === "cancelled") continue;
      const date = les.start.slice(0, 10);
      if (date < g.meta.today) continue;
      if (until && date > until) continue;
      if (burned.has(date)) continue;
      const extra = les.class_id !== e.class_id || les.is_makeup;
      if (!extra) continue;
      byDate.set(date, { date, start: les.start, extra: true });
    }
  }
  return [...byDate.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export function remainingFromPaidThrough(g: Graph, e: Graph["enrollments"][number]) {
  if (!e.paid_through || e.paid_through < g.meta.today) return 0;
  return upcomingBurns(g, e, { until: e.paid_through, extras: false, remaining: 64 }).length;
}

export function expectedRunout(g: Graph, e: Graph["enrollments"][number], remainingOverride?: number) {
  const n = remainingOverride ?? e.remaining_sessions ?? 0;
  if (n <= 0) return null;
  const q = upcomingBurns(g, e, { remaining: n, extras: true });
  if (!q.length) return null;
  return q[Math.min(n, q.length) - 1].date;
}

export function extraBurnsAhead(g: Graph, e: Graph["enrollments"][number], remainingOverride?: number) {
  const n = remainingOverride ?? e.remaining_sessions ?? 0;
  if (n <= 0) return 0;
  return upcomingBurns(g, e, { remaining: n, extras: true }).slice(0, n).filter((s) => s.extra).length;
}

export function enumerateRecurrence(opts: {
  days: RecurrenceDay[];
  duration_min: number;
  start_date: string;
  end_date: string | null;
  today: string;
  horizonDays?: number;
  fromDate?: string;
}) {
  const byWd = new Map(opts.days.map((d) => [d.weekday, d.start_time.slice(0, 5)]));
  const horizon = opts.horizonDays ?? 42;
  const floor = opts.fromDate || (opts.start_date < opts.today ? opts.today : opts.start_date);
  const from = floor < opts.start_date ? opts.start_date : floor;
  const cap = addDays(from, horizon);
  const to = opts.end_date && opts.end_date < cap ? opts.end_date : cap;
  const slots: Array<{ date: string; start: string; end: string }> = [];
  if (!byWd.size || from > to) return slots;
  let d = from;
  while (d <= to) {
    const st = byWd.get(weekdayOf(d));
    if (st) {
      const et = addMinutesHhmm(st, opts.duration_min);
      if (et) slots.push({ date: d, start: `${d}T${st}:00+07:00`, end: `${d}T${et}:00+07:00` });
    }
    d = addDays(d, 1);
  }
  return slots;
}
