import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  applyPromo, clsName, courseOf, expectedRunout, extraBurnsAhead, feeUnit, fmtDay, fmtShort, grantLabel, lessonFeeOf, money, one, planLabel, promoHint, sessionsPerMonth, statusVn, stuName,
} from "@/lib/eduflow/format";
import { billingLabel, unpaid, unpaidLearned, useEdu } from "@/lib/eduflow/store";
import type { Graph, PayMethod } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { OverlayShell, usePhone } from "./phone-chrome";

const METHODS: Array<{ id: PayMethod; label: string }> = [
  { id: "cash", label: "Tiền mặt" },
  { id: "transfer", label: "Chuyển khoản" },
  { id: "momo", label: "MoMo" },
];
const SESSION_PACKS = [4, 8, 12];
const MONTH_PACKS = [1, 2, 3];

type Pack = {
  id: string;
  title: string;
  hint: string;
  months: number | null;
  sessions: number | null;
  amount: number;
  deposit?: boolean;
};

export function PayHistory({
  g, items, showStudent, showClass,
}: {
  g: Graph;
  items: Graph["payments"];
  showStudent?: boolean;
  showClass?: boolean;
}) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Chưa có phiếu thu</p>;
  return (
    <ul data-slot="pay-history" className="divide-y rounded-xl border bg-card">
      {items.map((p) => (
        <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {fmtShort(p.paid_at)} · {statusVn(p.method)}
              {showStudent ? ` · ${stuName(g, p.student_id)}` : ""}
              {showClass ? ` · ${clsName(g, p.class_id)}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {grantLabel(p)}
              {p.note ? ` · ${p.note}` : ""}
            </p>
          </div>
          <span className="shrink-0 text-sm tabular-nums">{money(p.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export type PayPanelHandle = { submit: () => void };

export const PayPanel = forwardRef<PayPanelHandle, { enrollmentId: string; embedded?: boolean }>(
  function PayPanel({ enrollmentId, embedded }, ref) {
    const g = useEdu((s) => s.graph);
    const receivePayment = useEdu((s) => s.receivePayment);
    const phone = usePhone();
    const today = g?.meta.today || "2026-08-23";

    const enr = g ? one(g.enrollments, enrollmentId) : undefined;
    const cls = enr && g ? one(g.classes, enr.class_id) : undefined;
    const mode = enr?.billing_mode || "monthly";
    const fee = cls?.fee || 0;
    const perMonth = cls ? sessionsPerMonth(cls.recurrence) : 8;
    const unit = cls ? lessonFeeOf(cls) : 0;
    const debtRows = g && enr ? unpaidLearned(g, enr.id).slice().sort((a, b) => {
      const da = one(g.lessons, a.lesson_id)?.start || "";
      const db = one(g.lessons, b.lesson_id)?.start || "";
      return da.localeCompare(db);
    }) : [];
    const debt = debtRows.length;

    const [method, setMethod] = useState<PayMethod>("cash");
    const [paidAt, setPaidAt] = useState(today);
    const [note, setNote] = useState("");
    const [packId, setPackId] = useState("m1");
    const [customN, setCustomN] = useState("");
    const [promoId, setPromoId] = useState("");
    const crs = cls && g ? courseOf(g, cls.id) : undefined;
    const plan = crs?.plan;

    const packs = useMemo<Pack[]>(() => {
      const left = enr?.remaining_sessions || 0;
      if (plan?.model === "deposit") {
        const held = enr?.deposit_held || 0;
        const dep = plan.deposit_amount || 0;
        const out: Pack[] = [];
        if (held < dep) {
          out.push({
            id: "dep",
            title: "Đặt cọc",
            hint: `Giữ chỗ · chưa cộng buổi học`,
            months: null,
            sessions: 0,
            amount: dep,
            deposit: true,
          });
        }
        const rest = Math.max(0, plan.fee - held);
        if (rest > 0) {
          const sess = plan.course_sessions || 10;
          out.push({
            id: "bal",
            title: held ? "Tất toán" : "Đủ khóa",
            hint: `+${sess} buổi học · ${money(rest)}`,
            months: null,
            sessions: sess,
            amount: rest,
          });
        }
        return out;
      }
      if (plan?.model === "course" || plan?.model === "bundle") {
        const total = plan.course_sessions || enr?.course_total || 12;
        const nInst = plan.installment_n || 1;
        const out: Pack[] = [];
        if (debt > 0) {
          out.push({
            id: `debt${debt}`,
            title: `Trả nợ ${debt} buổi học`,
            hint: `${debt} × ${money(unit)} · gạch cờ`,
            months: null,
            sessions: debt,
            amount: debt * unit,
          });
        }
        out.push({
          id: "full",
          title: plan.model === "bundle" ? "Cả combo" : "Cả khóa",
          hint: `+${total} buổi học`,
          months: null,
          sessions: total,
          amount: plan.fee,
        });
        if (nInst > 1) {
          const partFee = Math.round(plan.fee / nInst);
          const partSess = Math.max(1, Math.round(total / nInst));
          const until = g && enr ? expectedRunout(g, enr, left + partSess) : null;
          out.push({
            id: "inst",
            title: `1 đợt / ${nInst}`,
            hint: `+${partSess} buổi học · hết ~${fmtShort(until)}`,
            months: null,
            sessions: partSess,
            amount: partFee,
          });
        }
        return out;
      }
      if (plan?.model === "per_lesson") {
        const ns = [1, 4, 8, 12];
        return ns.map((n) => {
          const settle = Math.min(debt, n);
          const credit = n - settle;
          const until = g && enr ? expectedRunout(g, enr, left + credit) : null;
          return {
            id: `s${n}`,
            title: n === 1 ? "1 buổi" : `${n} buổi`,
            hint: settle ? `cấn ${settle} nợ · +${credit}` : `+${n} buổi · hết ~${fmtShort(until)}`,
            months: null,
            sessions: n,
            amount: n * fee,
          };
        });
      }
      if (mode === "monthly") {
        return MONTH_PACKS.map((m) => {
          const bought = m * perMonth;
          const settle = Math.min(debt, bought);
          const credit = bought - settle;
          const until = g && enr ? expectedRunout(g, enr, left + credit) : null;
          return {
            id: `m${m}`,
            title: `${m} tháng`,
            hint: `+${credit} buổi học · hết ~${fmtShort(until)}`,
            months: m,
            sessions: bought,
            amount: m * fee,
          };
        });
      }
      const out: Pack[] = [];
      if (debt > 0) {
        out.push({
          id: `debt${debt}`,
          title: `Trả nợ ${debt} buổi học`,
          hint: `${debt} × ${money(unit)} · gạch cờ, không cộng sổ`,
          months: null,
          sessions: debt,
          amount: debt * unit,
        });
      }
      for (const n of SESSION_PACKS) {
        if (n === debt) continue;
        const settle = Math.min(debt, n);
        const credit = n - settle;
        const until = g && enr ? expectedRunout(g, enr, left + credit) : null;
        out.push({
          id: `s${n}`,
          title: `${n} buổi học`,
          hint: settle
            ? `cấn ${settle} nợ · cộng sổ ${credit} · hết ~${fmtShort(until)}`
            : `+${n} buổi học · hết ~${fmtShort(until)}`,
          months: null,
          sessions: n,
          amount: n * unit,
        });
      }
      if (mode === "course") {
        const cleft = Math.max((enr?.course_total || 0) - (enr?.course_done || 0), 0);
        if (cleft > 0 && !SESSION_PACKS.includes(cleft) && cleft !== debt) {
          const settle = Math.min(debt, cleft);
          const credit = cleft - settle;
          const until = g && enr ? expectedRunout(g, enr, left + credit) : null;
          out.push({
            id: `s${cleft}`,
            title: `Nốt khóa ${cleft} buổi học`,
            hint: `+${credit} buổi học · hết ~${fmtShort(until)}`,
            months: null,
            sessions: cleft,
            amount: cleft * unit,
          });
        }
      }
      return out;
    }, [mode, fee, perMonth, unit, debt, g, enr, enr?.remaining_sessions, enr?.course_total, enr?.course_done, enr?.deposit_held, plan?.model, plan?.fee, plan?.deposit_amount, plan?.course_sessions]);

    useEffect(() => {
      if (!enr) return;
      setMethod("cash");
      setPaidAt(today);
      setNote("");
      setCustomN("");
      setPromoId("");
      if (plan?.model === "deposit") {
        setPackId((enr.deposit_held || 0) < (plan.deposit_amount || 0) ? "dep" : "bal");
        return;
      }
      if (plan?.model === "course" || plan?.model === "bundle") {
        setPackId("full");
        return;
      }
      if (plan?.model === "per_lesson") {
        setPackId("s1");
        return;
      }
      if (mode === "monthly") {
        setPackId("m1");
        return;
      }
      if (debt > 0) {
        const fit = SESSION_PACKS.find((n) => n >= debt);
        setPackId(fit ? `s${fit}` : `debt${debt}`);
        return;
      }
      if (mode === "course") {
        const left = Math.max((enr.course_total || 0) - (enr.course_done || 0), 0);
        setPackId(left > 0 ? `s${left}` : "s4");
        return;
      }
      setPackId("s4");
    }, [enrollmentId]);

    const customSessions = Number(customN) || 0;
    const usingCustom = mode !== "monthly" && plan?.model !== "deposit" && plan?.model !== "course" && plan?.model !== "bundle" && customSessions > 0;
    const picked = usingCustom ? undefined : packs.find((p) => p.id === packId);
    const monthsN = picked?.months || 1;
    const boughtN = usingCustom ? customSessions : (picked?.sessions ?? (mode === "monthly" ? monthsN * perMonth : 0));
    const isDeposit = !!picked?.deposit;
    const gross = isDeposit
      ? (picked?.amount || 0)
      : (plan?.model === "course" || plan?.model === "bundle")
        ? (picked?.amount || 0)
        : mode === "monthly" ? monthsN * fee : boughtN * unit;
    const promo = crs?.promotions.find((p) => p.id === promoId && p.active);
    const amountN = applyPromo(gross, isDeposit ? null : promo);
    const bonusN = !isDeposit && promo?.kind === "bonus_sessions" ? promo.value : 0;
    const settleN = Math.min(debt, boughtN);
    const creditN = Math.max(0, boughtN - settleN) + bonusN;
    const afterRemaining = (enr?.remaining_sessions || 0) + (isDeposit ? 0 : creditN);
    const afterUntil = g && enr && !isDeposit ? expectedRunout(g, enr, afterRemaining) : null;
    const extraAhead = g && enr && !isDeposit ? extraBurnsAhead(g, enr, afterRemaining) : 0;

    function submit() {
      if (!enr || amountN <= 0) return;
      receivePayment({
        enrollment_id: enr.id,
        amount: amountN,
        method,
        paid_at: paidAt || today,
        sessions: isDeposit ? null : boughtN,
        paid_through: afterUntil,
        note: note.trim() || (promo ? promo.label : "") || (settleN ? `Cấn ${settleN} buổi học đã học` : "") || (isDeposit ? "Đặt cọc giữ chỗ" : ""),
        bonus_sessions: bonusN || undefined,
        deposit: isDeposit ? amountN : undefined,
      });
    }

    useImperativeHandle(ref, () => ({ submit }), [enr, amountN, method, paidAt, boughtN, afterUntil, note, promo, settleN, isDeposit, bonusN]);

    if (!g || !enr || !cls) {
      return <p className="text-sm text-muted-foreground">Chọn ghi danh để thu / nạp buổi học.</p>;
    }

    return (
      <div className="space-y-5" data-slot="pay-panel">
        <section className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học sinh</p>
          <div className="rounded-lg border bg-muted/40 px-3 py-2">
            <p className="font-medium">{stuName(g, enr.student_id)}</p>
            <p className="text-sm text-muted-foreground">{cls.name} · {crs ? planLabel(crs.plan) : statusVn(mode)} · {billingLabel(g, enr)}</p>
            <p className="mt-1 text-xs text-muted-foreground" data-slot="pay-unit">
              Đơn giá {money(unit)}/buổi học
              {mode === "monthly" ? ` · ${money(fee)}${feeUnit(mode)} · ${perMonth} buổi học/tháng` : null}
              {mode === "course" ? ` · gói khóa ${money(fee)} / ${cls.course_total_sessions || enr.course_total || "—"} buổi` : null}
            </p>
          </div>
          {debt > 0 ? (
            <Alert data-slot="pay-debt" className="border-warn/40 bg-warn-soft text-warn">
              <AlertTitle>Nợ {debt} buổi học đã học chưa đóng</AlertTitle>
              <AlertDescription>
                {debtRows.map((a) => {
                  const les = one(g.lessons, a.lesson_id);
                  return les ? fmtDay(les.start) : a.lesson_id;
                }).join(" · ")}
                {mode === "monthly"
                  ? " — cấn trừ khỏi gói tháng, cộng buổi học còn lại."
                  : ` — cấn trừ ${settleN} buổi học khỏi gói, cộng sổ ${creditN}.`}
              </AlertDescription>
            </Alert>
          ) : unpaid(enr) ? (
            <Alert>
              <AlertTitle>Sổ còn mở</AlertTitle>
              <AlertDescription>Đi học không bị đuổi. Phiếu thu mới mới cộng buổi học / gia hạn.</AlertDescription>
            </Alert>
          ) : null}
          {crs?.promotions.filter((p) => p.active).length ? (
            <div className="space-y-1.5" data-slot="pay-promos">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khuyến mại khóa</p>
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setPromoId("")}
                  className={cn("min-h-11 rounded-lg border px-3 text-sm", !promoId ? "border-foreground bg-muted" : "hover:bg-muted/60")}
                >Không áp</button>
                {crs.promotions.filter((p) => p.active).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    data-slot="pay-promo"
                    onClick={() => setPromoId(promoId === p.id ? "" : p.id)}
                    className={cn("min-h-11 rounded-lg border px-3 text-sm", promoId === p.id ? "border-foreground bg-muted" : "hover:bg-muted/60")}
                  >{p.label} · {promoHint(p)}</button>
                ))}
              </div>
            </div>
          ) : null}
        </section>
        <Separator />
        <section className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chọn gói</p>
          <div className={cn("grid gap-2", phone ? "grid-cols-1" : packs.length <= 3 ? "grid-cols-3" : "grid-cols-2")} data-slot="pay-packs">
            {packs.map((p) => {
              const on = !usingCustom && packId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-slot="pay-option"
                  data-pack={p.id}
                  onClick={() => { setPackId(p.id); setCustomN(""); }}
                  className={cn(
                    "min-h-11 rounded-lg border p-3 text-left transition-colors",
                    on ? "border-foreground bg-muted" : "hover:bg-muted/60",
                  )}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{p.title}</span>
                    <span className="text-sm tabular-nums">{money(p.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.hint}</p>
                </button>
              );
            })}
          </div>
          {mode !== "monthly" && plan?.model !== "deposit" && plan?.model !== "course" && plan?.model !== "bundle" ? (
            <div className="space-y-1.5">
              <Label htmlFor="pay-custom">Số buổi học khác</Label>
              <Input
                id="pay-custom"
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="vd. 6"
                value={customN}
                onChange={(e) => setCustomN(e.target.value.replace(/[^\d]/g, ""))}
              />
              <p className="text-xs text-muted-foreground">
                Vẫn khóa tiền theo đơn giá: n × {money(unit)}
              </p>
            </div>
          ) : null}
        </section>
        <Separator />
        <section className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Thanh toán</p>
          <div className={cn("grid gap-3", phone ? "grid-cols-1" : "grid-cols-2")}>
            <div className="space-y-1.5">
              <Label>Số thu</Label>
              <p data-slot="pay-amount" className="flex h-9 items-center text-base font-semibold tabular-nums">{money(amountN)}</p>
              <p className="text-xs text-muted-foreground">
                {mode === "monthly"
                  ? `${monthsN} × ${money(fee)}/tháng · +${boughtN} buổi học`
                  : `${boughtN} × ${money(unit)}/buổi học`}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-at">Ngày thu</Label>
              <Input id="pay-at" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Hình thức</Label>
            <ToggleGroup type="single" value={method} onValueChange={(v) => { if (v) setMethod(v as PayMethod); }} className="flex flex-wrap justify-start gap-1">
              {METHODS.map((m) => (
                <ToggleGroupItem key={m.id} value={m.id} variant="outline" className="h-9 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{m.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-note">Ghi chú</Label>
            <Input id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Tuỳ chọn" />
          </div>
        </section>
        <div data-slot="pay-receipt" className="space-y-1.5 rounded-xl border bg-muted/40 px-3 py-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <span>
              {isDeposit ? "Đặt cọc giữ chỗ" : mode === "monthly" ? `${monthsN} tháng × ${money(fee)}` : `${boughtN} buổi học`}
            </span>
            <span className="tabular-nums">{money(gross)}</span>
          </div>
          {promo && amountN !== gross ? (
            <div className="flex items-start justify-between gap-3" data-slot="pay-promo-line">
              <span>{promo.label}</span>
              <span className="tabular-nums">−{money(gross - amountN)}</span>
            </div>
          ) : bonusN ? (
            <div className="flex items-start justify-between gap-3" data-slot="pay-promo-line">
              <span>{promo?.label}</span>
              <span className="tabular-nums">+{bonusN} buổi học</span>
            </div>
          ) : null}
          {settleN > 0 && !isDeposit ? (
            <div className="flex items-start justify-between gap-3 text-warn" data-slot="pay-minus">
              <span>Trừ {settleN} buổi học đã học chưa đóng</span>
              <span className="tabular-nums">−{settleN} buổi học</span>
            </div>
          ) : null}
          <div className="flex items-start justify-between gap-3 font-medium">
            <span>Giá trị cộng sổ</span>
            <span className="tabular-nums" data-slot="pay-credit">
              {isDeposit ? "chưa cộng buổi học" : `+${creditN} buổi học · hết ~${fmtShort(afterUntil)}${extraAhead ? ` · ${extraAhead} bù` : ""}`}
            </span>
          </div>
          <Separator className="my-2" />
          <div className="flex items-start justify-between gap-3 text-base font-semibold">
            <span>Số thu</span>
            <span className="tabular-nums">{money(amountN)}</span>
          </div>
          <p className="text-xs text-muted-foreground" data-slot="pay-after">
            {isDeposit
              ? `Sau thu: cọc ${money((enr.deposit_held || 0) + amountN)} · chưa cộng buổi học`
              : `Sau thu: còn ${afterRemaining} buổi học · hết ~${fmtShort(afterUntil)}${settleN ? ` · đã cấn ${settleN} nợ` : ""}`}
            {" · "}{statusVn(method)}
          </p>
        </div>
        {embedded ? (
          <Button className="min-h-11 w-full" onClick={submit} disabled={amountN <= 0} data-slot="pay-submit">
            Ghi nhận thanh toán
          </Button>
        ) : null}
      </div>
    );
  },
);

export function PayDialog() {
  const modal = useEdu((s) => s.modal);
  const editId = useEdu((s) => s.editId);
  const setModal = useEdu((s) => s.setModal);
  const ref = useRef<PayPanelHandle>(null);
  const open = modal === "pay";
  return (
    <OverlayShell
      open={open}
      title="Thu học phí"
      desc="Số tiền = gói đã chọn. Cộng buổi học khi ghi phiếu. Ngày hết dự kiến đổi theo buổi đã học và học bù."
      wide
      saveLabel="Ghi nhận thanh toán"
      onClose={() => setModal(null)}
      onSave={() => ref.current?.submit()}
    >
      {editId ? (
        <PayPanel key={editId} ref={ref} enrollmentId={editId} />
      ) : (
        <p className="text-sm text-muted-foreground">Chọn ghi danh trên lớp hoặc sổ buổi để thu.</p>
      )}
    </OverlayShell>
  );
}
