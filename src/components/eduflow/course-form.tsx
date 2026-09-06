import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  CHARGE_MODELS, DURATION_MINS, PROMO_KINDS, contentKeyOf, money, nid, one, planLabel, promoHint,
} from "@/lib/eduflow/format";
import { useEdu } from "@/lib/eduflow/store";
import type { ChargeModel, PromoKind, Promotion, TuitionPlan } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { OverlayShell, usePhone } from "./phone-chrome";

function emptyPlan(model: ChargeModel): TuitionPlan {
  if (model === "monthly") return { model, fee: 1200000, proration: true };
  if (model === "prepaid") return { model, fee: 250000, pack_sessions: 8, expiry_days: 90, proration: false };
  if (model === "per_lesson") return { model, fee: 400000, proration: false };
  if (model === "course") return { model, fee: 3600000, course_sessions: 12, installment_n: 1, proration: false };
  if (model === "bundle") return { model, fee: 4200000, course_sessions: 20, bundle_labels: [], proration: false };
  return { model: "deposit", fee: 3500000, deposit_amount: 500000, course_sessions: 10, proration: false };
}

export function CourseCreateDialog() {
  const g = useEdu((s) => s.graph);
  const modal = useEdu((s) => s.modal);
  const editId = useEdu((s) => s.editId);
  const setModal = useEdu((s) => s.setModal);
  const createCourse = useEdu((s) => s.createCourse);
  const updateCourse = useEdu((s) => s.updateCourse);
  const phone = usePhone();
  const open = modal === "course";

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("Toán");
  const [level, setLevel] = useState("Lớp 9");
  const [duration, setDuration] = useState(90);
  const [plan, setPlan] = useState<TuitionPlan>(emptyPlan("monthly"));
  const [promos, setPromos] = useState<Promotion[]>([]);

  function reset() {
    setName(""); setSubject("Toán"); setLevel("Lớp 9"); setDuration(90);
    setPlan(emptyPlan("monthly")); setPromos([]);
  }

  useEffect(() => {
    if (!open || !g) return;
    if (editId) {
      const c = one(g.courses, editId);
      if (c) {
        setName(c.name);
        setSubject(c.subject);
        setLevel(c.level);
        setDuration(c.duration_min);
        setPlan({ ...c.plan });
        setPromos(c.promotions.map((p) => ({ ...p })));
      }
    } else {
      reset();
    }
  }, [open, editId, g]);

  function setModel(model: ChargeModel) {
    setPlan(emptyPlan(model));
  }

  function addPromo() {
    setPromos((p) => [...p, { id: nid("prm"), kind: "percent", label: "Giảm 10%", value: 10, active: true }]);
  }

  function patchPromo(id: string, patch: Partial<Promotion>) {
    setPromos((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
  }

  if (!g) return null;
  const feeStr = String(plan.fee || "");
  const key = contentKeyOf({ name: name.trim() || "khoá" });
  const draft = { name, content_key: key, subject, level, duration_min: duration, plan, promotions: promos };

  return (
    <OverlayShell
      open={open}
      title={editId ? "Sửa khóa học" : "Khóa học mới"}
      desc="Khóa là sản phẩm. Lớp là một ca mở từ khóa. Mô hình tính phí bắt buộc khi tạo khóa."
      wide
      saveLabel={editId ? "Lưu khóa" : "Tạo khóa"}
      onClose={() => { setModal(null); reset(); }}
      onSave={() => editId ? updateCourse(editId, draft) : createCourse(draft)}
    >
      <section className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khóa</p>
        <div className="space-y-1.5">
          <Label htmlFor="crs-name">Tên khóa</Label>
          <Input id="crs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Toán 9 — Luyện thi vào 10" />
        </div>
        <div className={cn("grid gap-3", phone ? "grid-cols-1" : "grid-cols-3")}>
          <div className="space-y-1.5">
            <Label htmlFor="crs-sub">Môn</Label>
            <Input id="crs-sub" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="crs-lv">Khối</Label>
            <Input id="crs-lv" value={level} onChange={(e) => setLevel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Thời lượng buổi mặc định</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="w-full min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_MINS.map((m) => <SelectItem key={m} value={String(m)}>{m} phút</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>
      <Separator />
      <section className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Mô hình tính phí</p>
        <div className={cn("grid gap-2", phone ? "grid-cols-1" : "grid-cols-2")} data-slot="charge-models">
          {CHARGE_MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              data-slot="charge-model"
              data-model={m.id}
              onClick={() => setModel(m.id)}
              className={cn("min-h-11 rounded-lg border p-3 text-left transition-colors", plan.model === m.id ? "border-foreground bg-muted" : "hover:bg-muted/60")}
            >
              <div className="font-semibold">{m.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{m.hint}</p>
            </button>
          ))}
        </div>
        <div className={cn("grid gap-3", phone ? "grid-cols-1" : "grid-cols-2")}>
          <div className="space-y-1.5">
            <Label htmlFor="crs-fee">{plan.model === "deposit" ? "Học phí đủ khóa" : `Mức phí ${CHARGE_MODELS.find((x) => x.id === plan.model)?.unit || ""}`}</Label>
            <Input id="crs-fee" inputMode="numeric" value={feeStr} onChange={(e) => setPlan({ ...plan, fee: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} />
            <p className="text-xs text-muted-foreground">{plan.fee ? money(plan.fee) : "Nhập số"}</p>
          </div>
          {plan.model === "prepaid" ? (
            <div className="space-y-1.5">
              <Label htmlFor="crs-pack">Buổi học / gói</Label>
              <Input id="crs-pack" type="number" min={1} value={plan.pack_sessions || 8} onChange={(e) => setPlan({ ...plan, pack_sessions: Number(e.target.value) || 8 })} />
            </div>
          ) : null}
          {plan.model === "course" || plan.model === "bundle" || plan.model === "deposit" ? (
            <div className="space-y-1.5">
              <Label htmlFor="crs-sess">Số buổi khóa</Label>
              <Input id="crs-sess" type="number" min={1} value={plan.course_sessions || 12} onChange={(e) => setPlan({ ...plan, course_sessions: Number(e.target.value) || 12 })} />
            </div>
          ) : null}
        </div>
        {plan.model === "prepaid" ? (
          <div className="space-y-1.5">
            <Label htmlFor="crs-exp">Hạn dùng (ngày)</Label>
            <Input id="crs-exp" type="number" min={0} value={plan.expiry_days || 0} onChange={(e) => setPlan({ ...plan, expiry_days: Number(e.target.value) || 0 })} />
          </div>
        ) : null}
        {plan.model === "course" ? (
          <div className="space-y-1.5">
            <Label htmlFor="crs-inst">Số đợt trả góp</Label>
            <Input id="crs-inst" type="number" min={1} value={plan.installment_n || 1} onChange={(e) => setPlan({ ...plan, installment_n: Number(e.target.value) || 1 })} />
          </div>
        ) : null}
        {plan.model === "deposit" ? (
          <div className="space-y-1.5">
            <Label htmlFor="crs-dep">Tiền cọc giữ chỗ</Label>
            <Input id="crs-dep" inputMode="numeric" value={String(plan.deposit_amount || "")} onChange={(e) => setPlan({ ...plan, deposit_amount: Number(e.target.value.replace(/[^\d]/g, "")) || 0 })} />
            <p className="text-xs text-muted-foreground">Còn lại {money(Math.max(0, plan.fee - (plan.deposit_amount || 0)))} khi tất toán</p>
          </div>
        ) : null}
        {plan.model === "bundle" ? (
          <div className="space-y-1.5">
            <Label htmlFor="crs-bun">Khóa trong combo (cách nhau bằng dấu phẩy)</Label>
            <Input id="crs-bun" value={(plan.bundle_labels || []).join(", ")} onChange={(e) => setPlan({ ...plan, bundle_labels: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="Toán 9, Anh 9" />
          </div>
        ) : null}
        <div className="flex items-center justify-between rounded-lg border px-3 py-2">
          <div>
            <p className="text-sm font-medium">Tính prorate</p>
            <p className="text-xs text-muted-foreground">Tháng/khóa dở — điều chỉnh thủ công trên phiếu thu</p>
          </div>
          <Switch checked={plan.proration} onCheckedChange={(v) => setPlan({ ...plan, proration: v })} />
        </div>
      </section>
      <Separator />
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khuyến mại (tách khỏi mô hình phí)</p>
          <Button type="button" variant="outline" size="sm" onClick={addPromo}>Thêm KM</Button>
        </div>
        {promos.length ? promos.map((p) => (
          <div key={p.id} className="grid gap-2 rounded-lg border p-3" data-slot="promo-row">
            <div className={cn("grid gap-2", phone ? "grid-cols-1" : "grid-cols-[1fr_7rem_auto]")}>
              <Input value={p.label} onChange={(e) => patchPromo(p.id, { label: e.target.value })} placeholder="Nhãn KM" />
              <Input type="number" value={p.value} onChange={(e) => patchPromo(p.id, { value: Number(e.target.value) || 0 })} />
              <Button type="button" variant="ghost" size="sm" onClick={() => setPromos((x) => x.filter((i) => i.id !== p.id))}>Xóa</Button>
            </div>
            <Select value={p.kind} onValueChange={(v) => patchPromo(p.id, { kind: v as PromoKind })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROMO_KINDS.map((k) => <SelectItem key={k.id} value={k.id}>{k.title}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{promoHint(p)}</p>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">Không bắt buộc. KM gắn khóa, áp khi thu.</p>
        )}
      </section>
      <Alert>
        <AlertTitle>{planLabel(plan)}</AlertTitle>
        <AlertDescription>
          Lớp mở từ khóa này kế thừa mô hình phí. Không đặt học phí trên từng lớp.
        </AlertDescription>
      </Alert>
    </OverlayShell>
  );
}
