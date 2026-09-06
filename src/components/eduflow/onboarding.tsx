import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronLeft, Fingerprint, ScanFace, Smartphone, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BANKS, SUBJECTS, buildTenant, digitsOf, inviteCode, otpMatches } from "@/lib/eduflow/tenant";
import { useEdu } from "@/lib/eduflow/store";
import type { IdentityType, TeachMode } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Step = 1 | 2 | 3 | 4;

function DigitRow({
  value,
  onChange,
  length = 6,
  slot,
}: {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  slot: string;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = value.padEnd(length, " ").slice(0, length).split("");
  function setAt(i: number, ch: string) {
    const next = value.split("");
    next[i] = ch;
    const joined = next.join("").replace(/\D/g, "").slice(0, length);
    onChange(joined);
    if (ch && i < length - 1) refs.current[i + 1]?.focus();
  }
  return (
    <div className="flex justify-between gap-2" data-slot={slot}>
      {chars.map((c, i) => (
        <Input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          inputMode="numeric"
          maxLength={1}
          value={c.trim()}
          aria-label={`Số ${i + 1}`}
          className="h-12 w-11 min-h-11 px-0 text-center font-display text-lg tabular-nums"
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, "");
            if (d.length > 1) {
              const joined = (value.slice(0, i) + d).replace(/\D/g, "").slice(0, length);
              onChange(joined);
              refs.current[Math.min(joined.length, length - 1)]?.focus();
              return;
            }
            setAt(i, d);
          }}
          onKeyDown={(e) => {
            if (e.key === "Backspace" && !value[i] && i > 0) {
              refs.current[i - 1]?.focus();
              onChange(value.slice(0, i - 1));
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
            onChange(d);
            refs.current[Math.min(d.length, length - 1)]?.focus();
          }}
        />
      ))}
    </div>
  );
}

export function Onboarding() {
  const complete = useEdu((s) => s.completeOnboarding);
  const [step, setStep] = useState<Step>(1);
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [identity, setIdentity] = useState<IdentityType | null>(null);
  const [subject, setSubject] = useState<string>("Toán");
  const [bank, setBank] = useState<string>("Vietcombank");
  const [account, setAccount] = useState("");
  const [mode, setMode] = useState<TeachMode>("offline");
  const [centerName, setCenterName] = useState("IMPACT");
  const [taxId, setTaxId] = useState("");
  const [branchName, setBranchName] = useState("Cầu Giấy");
  const [roomName, setRoomName] = useState("P201");
  const [invite, setInvite] = useState(() => inviteCode());
  const [bioOn, setBioOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");

  const phoneDigits = digitsOf(phone);
  const phoneOk = phoneDigits.length >= 9 && phoneDigits.length <= 11;

  useEffect(() => { setErr(""); }, [step, otpSent]);

  function sendOtp() {
    if (!phoneOk) { setErr("Nhập số điện thoại hợp lệ"); return; }
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      setOtpSent(true);
      toast("Đã gửi OTP qua Zalo (mock)");
    }, 450);
  }

  function verifyOtp() {
    if (!otpMatches(phone, otp)) {
      setErr("OTP không đúng — thử 123456 hoặc 6 số cuối SĐT");
      return;
    }
    setStep(2);
  }

  function goSetup() {
    if (!identity) { setErr("Chọn cách bạn đang vận hành"); return; }
    setStep(3);
  }

  function goSecure() {
    if (identity === "SOLO") {
      if (!subject) { setErr("Chọn môn chính"); return; }
      if (!account.trim() || account.replace(/\D/g, "").length < 6) { setErr("Nhập số tài khoản VietQR"); return; }
    } else {
      if (!centerName.trim()) { setErr("Nhập tên trung tâm"); return; }
      if (!branchName.trim() || !roomName.trim()) { setErr("Nhập cơ sở và phòng đầu tiên"); return; }
    }
    setStep(4);
  }

  function scanFace() {
    setScanning(true);
    window.setTimeout(() => {
      setScanning(false);
      setBioOn(true);
      toast("Đã bật Face ID trên máy này (mock)");
    }, 700);
  }

  function finish() {
    if (pin.length !== 6) { setErr("PIN phải đủ 6 số"); return; }
    if (pin !== pin2) { setErr("PIN nhập lại chưa khớp"); return; }
    const profile = buildTenant({
      identity_type: identity || "SOLO",
      phone: phoneDigits,
      business_name: identity === "SOLO" ? `Gia sư ${subject}` : centerName.trim(),
      biometric_enabled: bioOn,
      pin,
      subject: identity === "SOLO" ? subject : null,
      bank_name: identity === "SOLO" ? bank : null,
      bank_account: identity === "SOLO" ? account.replace(/\s/g, "") : null,
      teach_mode: identity === "SOLO" ? mode : null,
      tax_id: identity === "ENTERPRISE" ? (taxId.trim() || null) : null,
      campus: identity === "ENTERPRISE" ? { branch_name: branchName.trim(), room_name: roomName.trim() } : null,
      staff_invite_code: identity === "ENTERPRISE" ? invite : null,
    });
    complete(profile);
    toast(identity === "SOLO" ? "Sổ gia sư đã mở" : "Sổ trung tâm đã mở");
  }

  const inviteUrl = useMemo(() => `https://eduflow.app/join/${invite}`, [invite]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background" data-slot="onboarding" data-step={step}>
      <div className="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-5 py-6">
        <div className="mb-6 flex items-center gap-2">
          {step > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Quay lại"
              data-slot="onboard-back"
              onClick={() => setStep((s) => (s === 3 ? 2 : s === 4 ? 3 : 1) as Step)}
            >
              <ChevronLeft className="size-5" />
            </Button>
          ) : <span className="size-11" />}
          <div className="flex flex-1 justify-center gap-1.5" data-slot="onboard-steps">
            {([1, 2, 3, 4] as Step[]).map((s) => (
              <i
                key={s}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  s === step ? "w-8 bg-foreground" : s < step ? "w-4 bg-foreground/50" : "w-4 bg-muted",
                )}
              />
            ))}
          </div>
          <span className="w-11 text-right text-xs tabular-nums text-muted-foreground">{step}/4</span>
        </div>

        {step === 1 ? (
          <div className="flex flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bước 1</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Vào sổ bằng số điện thoại</h1>
            <p className="mt-2 text-sm text-muted-foreground">OTP gửi qua Zalo. Không cần email — vào được là nhắn được phụ huynh.</p>
            <Label htmlFor="ob-phone" className="mt-8">Số điện thoại</Label>
            <Input
              id="ob-phone"
              data-slot="onboard-phone"
              inputMode="tel"
              autoComplete="tel"
              placeholder="090 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1.5 h-12 min-h-11 text-base"
            />
            {otpSent ? (
              <>
                <Label htmlFor="ob-otp" className="mt-5">Mã OTP</Label>
                <div className="mt-1.5">
                  <DigitRow value={otp} onChange={setOtp} slot="onboard-otp" />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Proto: 123456 hoặc 6 số cuối SĐT.</p>
              </>
            ) : null}
            {err ? <p className="mt-3 text-sm text-destructive" data-slot="onboard-err">{err}</p> : null}
            <div className="mt-auto pt-8">
              {!otpSent ? (
                <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-send-otp" disabled={sending} onClick={sendOtp}>
                  {sending ? "Đang gửi Zalo…" : "Gửi OTP qua Zalo"}
                </Button>
              ) : (
                <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-verify" onClick={verifyOtp}>
                  Xác nhận
                </Button>
              )}
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bước 2</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Bạn đang vận hành thế nào?</h1>
            <p className="mt-2 text-sm text-muted-foreground">Một lựa chọn. Sổ sẽ ẩn phần không dùng — cấu hình nặng để sau.</p>
            <div className="mt-6 grid gap-3">
              <button
                type="button"
                data-slot="onboard-solo"
                onClick={() => setIdentity("SOLO")}
                className={cn(
                  "rounded-2xl border p-4 text-left ring-1 ring-transparent transition-colors",
                  identity === "SOLO" ? "border-foreground bg-muted/60 ring-foreground" : "hover:border-foreground/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
                  <User className="size-5" />
                </span>
                <b className="mt-3 block font-display text-base">Tôi dạy một mình</b>
                <span className="mt-1 block text-sm text-muted-foreground">Lịch dạy, bài tập, theo dõi học sinh. VietQR thu phí cá nhân.</span>
              </button>
              <button
                type="button"
                data-slot="onboard-enterprise"
                onClick={() => setIdentity("ENTERPRISE")}
                className={cn(
                  "rounded-2xl border p-4 text-left ring-1 ring-transparent transition-colors",
                  identity === "ENTERPRISE" ? "border-foreground bg-muted/60 ring-foreground" : "hover:border-foreground/40",
                )}
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-foreground text-background">
                  <Building2 className="size-5" />
                </span>
                <b className="mt-3 block font-display text-base">Tôi quản lý trung tâm</b>
                <span className="mt-1 block text-sm text-muted-foreground">Nhiều giáo viên, chi nhánh, CRM, lương, hóa đơn MISA.</span>
              </button>
            </div>
            {err ? <p className="mt-3 text-sm text-destructive" data-slot="onboard-err">{err}</p> : null}
            <div className="mt-auto pt-8">
              <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-fork-next" onClick={goSetup}>
                Tiếp
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 && identity === "SOLO" ? (
          <div className="flex flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bước 3 · Gia sư</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Ba câu, vào lớp ngay</h1>
            <p className="mt-2 text-sm text-muted-foreground">Bỏ qua thuế, nhân sự, chi nhánh. Bật khi cần.</p>
            <div className="mt-6 space-y-4">
              <div>
                <Label>Môn chính</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger className="mt-1.5 h-12 min-h-11" data-slot="onboard-subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Ngân hàng thu học phí</Label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger className="mt-1.5 h-12 min-h-11" data-slot="onboard-bank">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BANKS.map((b) => <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  data-slot="onboard-account"
                  inputMode="numeric"
                  placeholder="Số tài khoản VietQR"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="mt-2 h-12 min-h-11"
                />
              </div>
              <div>
                <Label>Hình thức dạy</Label>
                <div className="mt-1.5 grid grid-cols-3 gap-2" data-slot="onboard-mode">
                  {([
                    ["offline", "Tại chỗ"],
                    ["online", "Online"],
                    ["both", "Cả hai"],
                  ] as Array<[TeachMode, string]>).map(([id, label]) => (
                    <Button
                      key={id}
                      type="button"
                      variant={mode === id ? "default" : "outline"}
                      className="h-11 min-h-11"
                      onClick={() => setMode(id)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            {err ? <p className="mt-3 text-sm text-destructive" data-slot="onboard-err">{err}</p> : null}
            <div className="mt-auto pt-8">
              <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-setup-next" onClick={goSecure}>
                Tiếp
              </Button>
            </div>
          </div>
        ) : null}

        {step === 3 && identity === "ENTERPRISE" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bước 3 · Trung tâm</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Mở cơ sở đầu tiên</h1>
            <p className="mt-2 text-sm text-muted-foreground">Đủ để xếp lịch. MST và nhân sự có thể bổ sung sau.</p>
            <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-auto pr-1">
              <section>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Trung tâm</p>
                <Label htmlFor="ob-center">Tên</Label>
                <Input id="ob-center" data-slot="onboard-center" value={centerName} onChange={(e) => setCenterName(e.target.value)} className="mt-1.5 h-12 min-h-11" />
                <Label htmlFor="ob-tax" className="mt-3">Mã số thuế (MISA, không bắt buộc)</Label>
                <Input id="ob-tax" data-slot="onboard-tax" value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="0101234567" className="mt-1.5 h-12 min-h-11" />
              </section>
              <section>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cơ sở</p>
                <Label htmlFor="ob-branch">Chi nhánh</Label>
                <Input id="ob-branch" data-slot="onboard-branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} className="mt-1.5 h-12 min-h-11" />
                <Label htmlFor="ob-room" className="mt-3">Phòng đầu tiên</Label>
                <Input id="ob-room" data-slot="onboard-room" value={roomName} onChange={(e) => setRoomName(e.target.value)} className="mt-1.5 h-12 min-h-11" />
              </section>
              <section>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Mời nhân sự</p>
                <p className="mb-2 text-sm text-muted-foreground">Link mời giáo vụ, kế toán, giáo viên. Proto — không gửi thật.</p>
                <div className="flex gap-2">
                  <Input readOnly value={inviteUrl} data-slot="onboard-invite" className="h-12 min-h-11 text-xs" />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 min-h-11 shrink-0"
                    onClick={() => {
                      void navigator.clipboard?.writeText(inviteUrl).then(
                        () => toast("Đã copy link mời"),
                        () => {
                          setInvite(inviteCode());
                          toast("Đã tạo link mới");
                        },
                      );
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </section>
            </div>
            {err ? <p className="mt-3 text-sm text-destructive" data-slot="onboard-err">{err}</p> : null}
            <div className="pt-6">
              <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-setup-next" onClick={goSecure}>
                Tiếp
              </Button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="flex flex-1 flex-col">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bước 4</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Mở sổ nhanh, khóa chặt</h1>
            <p className="mt-2 text-sm text-muted-foreground">Face ID chỉ nằm trên máy này — không gửi lên server. PIN 6 số là lối vào khi sinh trắc lỗi.</p>
            <Card className="mt-6 rounded-2xl">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanFace className="size-4" /> Face ID / vân tay
                </CardTitle>
                <CardDescription>Vào hồ sơ học sinh không gõ mật khẩu mỗi lần.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  type="button"
                  variant={bioOn ? "secondary" : "outline"}
                  className="h-12 min-h-11 w-full"
                  data-slot="onboard-bio"
                  disabled={scanning}
                  onClick={scanFace}
                >
                  <Fingerprint className="size-4" />
                  {scanning ? "Đang quét…" : bioOn ? "Đã bật trên máy này" : "Bật Face ID (mock)"}
                </Button>
              </CardContent>
            </Card>
            <Label className="mt-6">PIN 6 số</Label>
            <div className="mt-1.5"><DigitRow value={pin} onChange={setPin} slot="onboard-pin" /></div>
            <Label className="mt-4">Nhập lại PIN</Label>
            <div className="mt-1.5"><DigitRow value={pin2} onChange={setPin2} slot="onboard-pin2" /></div>
            {err ? <p className="mt-3 text-sm text-destructive" data-slot="onboard-err">{err}</p> : null}
            <div className="mt-auto pt-8">
              <Button type="button" className="h-12 min-h-11 w-full" data-slot="onboard-finish" onClick={finish}>
                Mở sổ
              </Button>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Smartphone className="size-3.5" /> PIN lưu trên máy · không phải tài khoản mạng
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
