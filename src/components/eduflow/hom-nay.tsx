import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { clsName, fmtDay, fmtTime, statusVn, stuName } from "@/lib/eduflow/format";
import { attOf, billingLabel, confirmedGuests, roster, useEdu } from "@/lib/eduflow/store";
import { TEACHER_ID } from "@/lib/eduflow/roles";
import { deskForRole, directorStats, dueCollections, soloHomeworkInflow } from "@/lib/eduflow/desk";
import type { Graph, LessonTab, PeekKind, RouteName } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { Empty, PageHead, StatusChip } from "./atoms";
import { IngestBanner } from "./ingest";
import { toast } from "sonner";
import { LANES } from "@/lib/eduflow/format";

function deskTarget(e: Graph["exceptions"][number]): { kind: PeekKind; id: string; tab?: LessonTab } {
  if (e.tab || !e.student_id) return { kind: "lesson", id: e.lesson_id, tab: (e.tab as LessonTab) || undefined };
  return { kind: "student", id: e.student_id };
}

function openDesk(
  e: Graph["exceptions"][number],
  ev: React.MouseEvent | undefined,
  go: (n: RouteName, id?: string | null, extra?: { tab?: LessonTab }) => void,
  openPeek: (kind: PeekKind, id: string, extra?: { tab?: LessonTab }) => void,
) {
  const t = deskTarget(e);
  if (ev?.metaKey || ev?.ctrlKey) {
    if (t.kind === "student") go("hs-detail", t.id);
    else go("buoi-detail", t.id, t.tab ? { tab: t.tab } : undefined);
    return;
  }
  openPeek(t.kind, t.id, t.tab ? { tab: t.tab } : undefined);
}

export function HomNay() {
  const tenant = useEdu((s) => s.tenant);
  const role = useEdu((s) => s.role);
  if (tenant?.identity_type === "SOLO") return <SoloHomNay />;
  if (tenant?.identity_type === "ENTERPRISE" && role === "ops") return <DirectorHomNay />;
  return <DeskHomNay />;
}

function brandTrail() {
  const name = useEdu.getState().tenant?.business_name || "IMPACT";
  return name;
}

function DeskHomNay() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const peekId = useEdu((s) => s.peekStack[0]?.id);
  const phone = useEdu((s) => s.device) === "phone";
  const { lanes, items: desk } = deskForRole(g, role);
  const today = g.lessons
    .filter((l) => l.start.slice(0, 10) === g.meta.today && l.status !== "cancelled" && (role !== "teacher" || l.teacher_id === TEACHER_ID))
    .sort((a, b) => a.start.localeCompare(b.start));
  const upcoming = role === "teacher"
    ? g.lessons.filter((l) => l.teacher_id === TEACHER_ID && l.status !== "cancelled" && l.start.slice(0, 10) > g.meta.today).sort((a, b) => a.start.localeCompare(b.start))
    : [];
  const title = role === "teacher" ? "Buổi của tôi" : "Hôm nay";
  const brand = brandTrail();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: brand, go: "hom-nay" }, { label: title }]} />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <IngestBanner />
        {phone ? null : (
          <>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {role === "teacher" ? "Không xếp học bù · không đụng học phí" : "Việc đang mở · Cầu Giấy"}
            </p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">{title}</h1>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">
              {role === "teacher" ? "Cùng hàng đợi với giáo vụ — điểm danh và chấm bài tính từ sổ." : "Hàng đợi tính từ sổ. Bấm thẻ → ngăn phải. ⌘-bấm mở trang."}
            </p>
          </>
        )}
        <DeskBoard lanes={lanes} desk={desk} peekId={peekId} phone={phone} go={go} openPeek={openPeek} />
        <TodayBlock today={today} upcoming={upcoming} g={g} role={role} peekId={peekId} go={go} openPeek={openPeek} />
      </div>
    </div>
  );
}

function DirectorHomNay() {
  const g = useEdu((s) => s.graph)!;
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const peekId = useEdu((s) => s.peekStack[0]?.id);
  const phone = useEdu((s) => s.device) === "phone";
  const tenant = useEdu((s) => s.tenant);
  const { lanes, items: desk } = deskForRole(g, "ops");
  const stats = directorStats(g);
  const today = g.lessons
    .filter((l) => l.start.slice(0, 10) === g.meta.today && l.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  const brand = tenant?.business_name || "IMPACT";
  const newLeads = stats.leads.filter((l) => l.status === "new");
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="hom-nay-director">
      <PageHead trail={[{ label: brand, go: "hom-nay" }, { label: "Hôm nay" }]} />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <IngestBanner />
        {phone ? null : (
          <>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ban giám đốc · {tenant?.campus?.branch_name || "Cầu Giấy"}</p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Hôm nay</h1>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">Doanh thu, chuyên cần, công nợ — Face ID trên máy này. Hàng đợi giáo vụ ở dưới.</p>
          </>
        )}
        <section data-slot="director-bi">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Tình hình sổ</p>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard label="Doanh thu tháng 8" value={stats.salesMonthLabel} hint={`Hôm nay ${stats.salesTodayLabel}`} />
            <StatCard label="Chuyên cần hôm nay" value={stats.attRate == null ? "—" : `${stats.attRate}%`} hint={stats.attHint} />
            <StatCard label="Chưa đóng" value={String(stats.pendingN)} hint={stats.pendingDebt ? `${stats.pendingDebt} buổi nợ` : "Hết buổi / sắp hết"} />
            <StatCard label="Lead Facebook" value={String(stats.leadN)} hint="Chưa gán tư vấn" />
          </div>
        </section>
        <section className="mt-6" data-slot="director-crm">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">CRM</p>
          <div className="divide-y rounded-xl border bg-card">
            <div className="px-4 py-3">
              <b className="block text-sm">{stats.leadN} lead Facebook cần gán tư vấn</b>
              <span className="text-xs text-muted-foreground">Nguồn Ads + form OA. Bấm để mở học thử trên sổ.</span>
            </div>
            {newLeads.slice(0, 4).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5" data-slot="crm-lead">
                <span className="min-w-0">
                  <b className="block truncate text-sm">{l.name}</b>
                  <span className="text-xs text-muted-foreground">{l.phone} · {l.source}</span>
                </span>
                <Button size="sm" variant="outline" className="min-h-10" onClick={() => toast(`Đã gán ${l.name} cho Mai (mock)`)}>Gán</Button>
              </div>
            ))}
          </div>
        </section>
        {tenant?.modules_enabled.misa_einvoice_sync ? (
          <section className="mt-6" data-slot="director-recon">
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Đối soát</p>
            <div className="divide-y rounded-xl border bg-card">
              {stats.recon.map((r) => (
                <div key={r.id} className="px-4 py-3" data-slot={r.kind === "misa_error" ? "misa-error" : "vietqr-ok"}>
                  <b className="block text-sm">{r.title}</b>
                  <span className="text-xs text-muted-foreground">{r.detail}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <p className="mt-7 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Hàng đợi giáo vụ</p>
        <DeskBoard lanes={lanes} desk={desk} peekId={peekId} phone={phone} go={go} openPeek={openPeek} />
        <TodayBlock today={today} upcoming={[]} g={g} role="ops" peekId={peekId} go={go} openPeek={openPeek} />
      </div>
    </div>
  );
}

function SoloHomNay() {
  const g = useEdu((s) => s.graph)!;
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const phone = useEdu((s) => s.device) === "phone";
  const tenant = useEdu((s) => s.tenant);
  const today = g.lessons
    .filter((l) => l.start.slice(0, 10) === g.meta.today && l.status !== "cancelled" && l.teacher_id === TEACHER_ID)
    .sort((a, b) => a.start.localeCompare(b.start));
  const next = today.find((l) => l.status !== "completed") || today[0];
  const hw = soloHomeworkInflow(g);
  const due = dueCollections(g);
  const brand = tenant?.business_name || "Gia sư";
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="hom-nay-solo">
      <PageHead trail={[{ label: brand, go: "hom-nay" }, { label: "Hôm nay" }]} />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <IngestBanner />
        {phone ? null : (
          <>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {today.length ? `${today.length} buổi hôm nay` : "Không có buổi hôm nay"}
              {next ? ` · tiếp theo ${clsName(g, next.class_id).split("—")[0].trim()} (${fmtTime(next.start)})` : ""}
            </p>
            <h1 className="font-display mt-1 text-2xl tracking-tight">Hôm nay</h1>
            <p className="mt-1 mb-5 text-sm text-muted-foreground">Lịch dạy, bài nộp, VietQR — không CRM, không lương, không chi nhánh.</p>
          </>
        )}
        <section data-slot="solo-schedule">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lịch hôm nay</p>
            <Button variant="outline" size="sm" className="min-h-10" onClick={() => go("buoi")}>Mở lịch buổi</Button>
          </div>
          <LessonList lessons={today} g={g} />
        </section>
        <section className="mt-7" data-slot="solo-homework">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Bài nộp về</p>
          {hw.length ? (
            <div className="divide-y rounded-xl border bg-card">
              {hw.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openPeek("lesson", row.lesson_id, { tab: "homework" })}
                  >
                    <b className="block truncate text-sm">{row.title}</b>
                    <span className="text-xs text-muted-foreground">{row.detail}</span>
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-10 shrink-0"
                    onClick={() => toast(`Đã gửi nhận xét thoại cho ${stuName(g, row.student_id)} (mock)`)}
                  >
                    Nhận xét
                  </Button>
                </div>
              ))}
            </div>
          ) : <Empty t="Chưa có bài nộp" />}
        </section>
        <section className="mt-7" data-slot="solo-collect">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Thu học phí</p>
          {due.length ? (
            <div className="divide-y rounded-xl border bg-card">
              {due.map((row) => {
                const enr = g.enrollments.find((e) => e.id === row.id);
                return (
                  <div key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openPeek("student", row.student_id)}>
                      <b className="block truncate text-sm">{stuName(g, row.student_id)} · {statusVn(row.kind)}</b>
                      <span className="text-xs text-muted-foreground">{clsName(g, row.class_id).split("—")[0].trim()} · {enr ? billingLabel(g, enr) : ""}</span>
                    </button>
                    <Button
                      size="sm"
                      className="min-h-10 shrink-0"
                      data-slot="vietqr-send"
                      onClick={() => {
                        toast(`Đã gửi VietQR ${tenant?.bank_name || ""} · ${stuName(g, row.student_id)} qua Zalo (mock)`);
                        go("thu-phi", row.student_id);
                      }}
                    >
                      VietQR
                    </Button>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-sm text-muted-foreground">Không còn khoản đến hạn.</p>}
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-xl tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DeskBoard({
  lanes, desk, peekId, phone, go, openPeek,
}: {
  lanes: ReturnType<typeof deskForRole>["lanes"];
  desk: Graph["exceptions"];
  peekId?: string;
  phone: boolean;
  go: (n: RouteName, id?: string | null, extra?: { tab?: LessonTab }) => void;
  openPeek: (kind: PeekKind, id: string, extra?: { tab?: LessonTab }) => void;
}) {
  if (phone) {
    return (
      <PhoneLanes
        lanes={[...lanes]}
        exceptions={desk}
        openId={peekId}
        onOpen={(e, ev) => openDesk(e, ev, go, openPeek)}
      />
    );
  }
  return (
    <div className={cn("grid grid-cols-1 items-start gap-2.5", lanes.length <= 2 ? "md:grid-cols-2" : "md:grid-cols-2 xl:grid-cols-4")}>
      {lanes.map((l) => {
        const rows = desk.filter((e) => e.lane === l.id);
        return (
          <section key={l.id} data-lane={l.id} className={cn("flex max-h-96 min-h-40 flex-col overflow-auto rounded-xl border bg-card p-2.5", l.tone === "wait" && "border-t-wait border-t-2", l.tone === "money" && "border-t-warn border-t-2", l.tone === "fail" && "border-t-bad border-t-2", l.tone === "need" && "border-t-foreground border-t-2")}>
            <h4 className="mb-2 flex justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase">{l.label} <em className="not-italic tabular-nums text-foreground">{rows.length}</em></h4>
            {rows.length ? rows.map((e) => {
              const t = deskTarget(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  data-slot="desk-card"
                  data-kind={t.kind}
                  data-id={t.id}
                  className={cn(
                    "mb-1.5 w-full rounded-lg border bg-background p-2.5 text-left hover:border-foreground",
                    peekId === t.id && "border-foreground bg-muted/50",
                  )}
                  onClick={(ev) => openDesk(e, ev, go, openPeek)}
                >
                  <b className="block text-sm leading-snug">{e.title}</b>
                  <span className="mt-1 block text-xs text-muted-foreground">{e.detail}</span>
                </button>
              );
            }) : <p className="px-1 py-5 text-center text-xs text-muted-foreground">Trống</p>}
          </section>
        );
      })}
    </div>
  );
}

function TodayBlock({
  today, upcoming, g, role, peekId, go, openPeek,
}: {
  today: Graph["lessons"];
  upcoming: Graph["lessons"];
  g: Graph;
  role: string;
  peekId?: string;
  go: (n: RouteName, id?: string | null, extra?: { tab?: LessonTab }) => void;
  openPeek: (kind: PeekKind, id: string, extra?: { tab?: LessonTab }) => void;
}) {
  return (
    <>
      <div className="mt-7 mb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Buổi hôm nay</p>
        <Button variant="outline" size="sm" className="min-h-10" onClick={() => go("buoi")}>Mở lịch buổi</Button>
      </div>
      <LessonList lessons={today} g={g} />
      {role === "teacher" ? (
        <>
          <p className="mt-7 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sắp tới</p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {upcoming.length ? upcoming.map((l) => (
              <button
                key={l.id}
                type="button"
                data-slot="today-lesson"
                data-id={l.id}
                className={cn("min-w-48 shrink-0 rounded-xl border bg-card px-3 py-2.5 text-left hover:border-foreground", peekId === l.id && "border-foreground bg-muted/50")}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey) go("buoi-detail", l.id);
                  else openPeek("lesson", l.id);
                }}
              >
                <b className="block text-sm">{clsName(g, l.class_id).split("—")[0].trim()}</b>
                <span className="text-xs text-muted-foreground">{fmtDay(l.start)} {fmtTime(l.start)}</span>
              </button>
            )) : <p className="text-sm text-muted-foreground">Không có buổi sau.</p>}
          </div>
        </>
      ) : null}
    </>
  );
}

function PhoneLanes({
  lanes,
  exceptions,
  onOpen,
  openId,
}: {
  lanes: Array<(typeof LANES)[number]>;
  exceptions: Graph["exceptions"];
  onOpen: (e: Graph["exceptions"][number], ev: React.MouseEvent) => void;
  openId?: string | null;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(() => {
    const first = lanes.find((l) => exceptions.some((e) => e.lane === l.id));
    return first?.id || lanes[0]?.id;
  });
  function goLane(id: (typeof LANES)[number]["id"]) {
    setActive(id);
    const el = scroller.current?.querySelector(`[data-lane="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  }
  return (
    <div data-slot="phone-lanes">
      <div className="flex gap-1 overflow-x-auto pb-3">
        {lanes.map((l) => {
          const n = exceptions.filter((e) => e.lane === l.id).length;
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => goLane(l.id)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-colors",
                active === l.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground",
              )}
            >
              {l.label}
              <Badge
                variant="secondary"
                className={cn(
                  "h-5 min-w-5 px-1.5 font-semibold tabular-nums",
                  active === l.id ? "border-transparent bg-background text-foreground" : "bg-background text-foreground",
                )}
              >
                {n}
              </Badge>
            </button>
          );
        })}
      </div>
      <div
        ref={scroller}
        onScroll={(e) => {
          const root = e.currentTarget;
          const i = Math.round(root.scrollLeft / Math.max(root.clientWidth, 1));
          const lane = lanes[i];
          if (lane && lane.id !== active) setActive(lane.id);
        }}
        className="-mx-3 flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain"
      >
        {lanes.map((l) => {
          const rows = exceptions.filter((e) => e.lane === l.id);
          return (
            <section key={l.id} data-lane={l.id} className="w-full min-w-full shrink-0 snap-start px-3">
              <div className={cn("min-h-48 rounded-xl border bg-card p-3", l.tone === "wait" && "border-t-wait border-t-2", l.tone === "money" && "border-t-warn border-t-2", l.tone === "fail" && "border-t-bad border-t-2", l.tone === "need" && "border-t-foreground border-t-2")}>
                {rows.length ? rows.map((e) => {
                  const t = deskTarget(e);
                  return (
                  <button
                    key={e.id}
                    type="button"
                    data-slot="desk-card"
                    data-kind={t.kind}
                    data-id={t.id}
                    className={cn("mb-2 min-h-14 w-full rounded-lg border bg-background px-3 py-3 text-left", openId === t.id && "border-foreground bg-muted/50")}
                    onClick={(ev) => onOpen(e, ev)}
                  >
                    <b className="block text-sm leading-snug">{e.title}</b>
                    <span className="mt-1 block text-xs text-muted-foreground">{e.detail}</span>
                  </button>
                  );
                }) : <p className="px-1 py-8 text-center text-sm text-muted-foreground">Trống</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function LessonList({ lessons, g }: { lessons: Graph["lessons"]; g: Graph }) {
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const peekId = useEdu((s) => s.peekStack[0]?.id);
  const phone = useEdu((s) => s.device) === "phone";
  if (!lessons.length) return <Empty t="Không có buổi" />;
  return (
    <div className="divide-y rounded-xl border bg-card">
      {lessons.map((l) => {
        const n = roster(g, l.class_id).length;
        const guests = confirmedGuests(g, l.id);
        const marked = roster(g, l.class_id).every((e) => attOf(g, l.id, e.student_id))
          && guests.every((m) => attOf(g, l.id, m.student_id));
        const chip = <StatusChip s={l.status === "completed" ? "completed" : marked ? "present" : "scheduled"} />;
        const meta = `${g.teachers.find((t) => t.id === l.teacher_id)?.name || ""}${l.substitute ? " · dạy hộ" : ""} · ${g.rooms.find((r) => r.id === l.room_id)?.name || ""} · ${n} HS${guests.length ? ` + ${guests.length} bù` : ""}`;
        const bù = guests.length ? <Badge variant="secondary" data-slot="makeup-badge">Học bù {guests.length}</Badge> : null;
        return (
          <button
            key={l.id}
            type="button"
            data-slot="today-lesson"
            data-id={l.id}
            className={cn(
              "flex w-full text-left hover:bg-muted/50",
              phone ? "flex-col items-start gap-1 px-3 py-3" : "items-center gap-4 px-4 py-3",
              peekId === l.id && "bg-muted/70",
            )}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) go("buoi-detail", l.id);
              else openPeek("lesson", l.id);
            }}
          >
            {phone ? (
              <>
                <span className="flex w-full items-center justify-between gap-2">
                  <b className="min-w-0 truncate text-sm">{clsName(g, l.class_id).split("—")[0].trim()}</b>
                  <span className="flex shrink-0 items-center gap-1">{bù}{chip}</span>
                </span>
                <span className="text-xs text-muted-foreground">{fmtTime(l.start)}–{fmtTime(l.end)} · {meta}</span>
              </>
            ) : (
              <>
                <span className="w-24 shrink-0 tabular-nums text-sm text-muted-foreground">{fmtTime(l.start)}–{fmtTime(l.end)}</span>
                <span className="min-w-0 flex-1">
                  <b className="block text-sm">{clsName(g, l.class_id)}</b>
                  <span className="text-xs text-muted-foreground">{meta}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">{bù}{chip}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
