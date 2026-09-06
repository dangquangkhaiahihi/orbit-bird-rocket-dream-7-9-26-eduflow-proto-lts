import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Plus, QrCode } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { LANES, CHARGE_MODELS, actorOf, brName, classLessonProgress, classLife, clsName, courseOf, dateToVn, fmtDay, fmtRange, fmtShort, fmtTime, formatRecurrence, initials, money, one, planLabel, promoHint, rmName, statusTone, statusVn, stuName, tchName } from "@/lib/eduflow/format";
import { attOf, billingLabel, confirmedGuests, enrollPayKind, isMakeupGuest, roster, studentLife, studentPayKind, unpaidLearned, useEdu, PEEK_PAGE } from "@/lib/eduflow/store";
import { TEACHER_ID, canMoney, canSend, canSubOrCancel, canWrite } from "@/lib/eduflow/roles";
import { deskForRole } from "@/lib/eduflow/desk";
import type { ClassTab, Graph, ModalKind, PeekKind } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { Empty, PageHead, Person, StatusChip, StuStatus } from "./atoms";
import { DataTable } from "./data-table";
import { ConfirmDeleteDialog, PageMore, RowContextMenu, useRowActions } from "./row-menu";
import { RoomPeek, StaffPeek, TableStage, TeacherPeek, ZaloPeek, BranchPeek } from "./inspector";
import { LessonCalendar } from "./lesson-calendar";
import { OverlayShell, BottomSheet, usePhoneMenu } from "./phone-chrome";
import { PayHistory } from "./pay-form";
import { AbsentDeductField } from "./makeup-form";
import { MoneyStripe, StudentTimeline } from "./student-story";
import { toast } from "sonner";

export { Rail, MobNav, MasterMenu } from "./nav";
export { Lesson } from "./lesson-card";

const TEACHER_RATE = 300000;
const PAY_HISTORY = [
  { ym: "2026-07", label: "Tháng 7/2026", n: 18 },
  { ym: "2026-06", label: "Tháng 6/2026", n: 16 },
];

function staffOf(g: Graph, role: string) {
  const id = role === "teacher" ? "stf_huy" : role === "assistant" ? "stf_mai" : "stf_trang";
  return one(g.staff_profiles, id);
}

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

const CLASS_TABS: Array<{ id: ClassTab; label: string }> = [
  { id: "roster", label: "Ghi danh" },
  { id: "history", label: "Lịch sử" },
  { id: "fees", label: "Học phí" },
  { id: "pays", label: "Sổ thu" },
];
const PAY_SORT: Record<string, number> = { pay_debt: 0, pay_empty: 1, pay_deposit: 2, pay_low: 3, pay_ok: 4 };

export { HomNay } from "./hom-nay";

export function ProfileSheet() {
  const { profileOpen, setProfileOpen } = usePhoneMenu();
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const actor = actorOf(role);
  const staff = staffOf(g, role);
  const ym = monthKey(g.meta.today);
  const mine = role === "teacher"
    ? g.lessons.filter((l) => l.teacher_id === TEACHER_ID && monthKey(l.start) === ym && l.status !== "cancelled")
    : [];
  const done = mine.filter((l) => l.status === "completed");
  const open = mine.filter((l) => l.status !== "completed");
  const zaloN = role !== "teacher" ? g.zalo_events.filter((e) => e.sent_at.slice(0, 7) === ym).length : 0;
  function logout() {
    setProfileOpen(false);
    toast("Proto không có đăng nhập — vẫn ở vai " + actor.title);
  }
  return (
    <BottomSheet
      open={profileOpen}
      onClose={() => setProfileOpen(false)}
      title="Tài khoản"
      desc={`${actor.title} · Cầu Giấy`}
      slot="profile-sheet"
      z="z-[70]"
      footer={<Button variant="outline" className="min-h-11 w-full" onClick={logout}>Đăng xuất</Button>}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full bg-foreground text-sm font-semibold text-background">{initials(actor.name)}</span>
        <div className="min-w-0">
          <p className="font-medium">{actor.name}</p>
          <p className="text-sm text-muted-foreground">{staff?.email || "—"}</p>
        </div>
      </div>
      <dl className="mt-4 divide-y rounded-xl border bg-card px-3">
        <div className="flex justify-between gap-3 py-2.5 text-sm"><dt className="text-muted-foreground">Chức danh</dt><dd className="font-medium">{staff?.title || actor.title}</dd></div>
        <div className="flex justify-between gap-3 py-2.5 text-sm"><dt className="text-muted-foreground">Điện thoại</dt><dd className="font-medium">{staff?.phone || "—"}</dd></div>
        <div className="flex justify-between gap-3 py-2.5 text-sm"><dt className="text-muted-foreground">Chi nhánh</dt><dd className="font-medium">Cầu Giấy</dd></div>
      </dl>
      {role === "teacher" ? (
        <>
          <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{monthLabel(ym)}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Buổi dạy</p>
              <p className="font-display text-xl tabular-nums">{mine.length}</p>
              <p className="text-xs text-muted-foreground">{done.length} xong · {open.length} còn</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Tạm tính</p>
              <p className="font-display text-xl tabular-nums">{money(done.length * TEACHER_RATE)}</p>
              <p className="text-xs text-muted-foreground">chờ {money(open.length * TEACHER_RATE)}</p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{money(TEACHER_RATE)} / buổi đã đóng.</p>
          {mine.length ? (
            <ul className="mt-3 space-y-1.5">
              {mine.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                  <span className="min-w-0 truncate">{clsName(g, l.class_id).split("—")[0].trim()}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{fmtDay(l.start)} · {l.status === "completed" ? "xong" : "chờ"}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phiếu lương</p>
          <ul className="divide-y rounded-xl border bg-card">
            {PAY_HISTORY.map((p) => (
              <li key={p.ym} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span>{p.label}<span className="ml-2 text-xs text-muted-foreground">{p.n} buổi</span></span>
                <span className="tabular-nums font-medium">{money(p.n * TEACHER_RATE)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{monthLabel(ym)}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Tin Zalo</p>
              <p className="font-display text-xl tabular-nums">{zaloN}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-xs text-muted-foreground">Việc mở</p>
              <p className="font-display text-xl tabular-nums">{deskForRole(g, role).items.length}</p>
            </div>
          </div>
        </>
      )}
    </BottomSheet>
  );
}

export function Buoi() {
  const gAll = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const startMakeup = useEdu((s) => s.startMakeup);
  const openPeek = useEdu((s) => s.openPeek);
  const peekStack = useEdu((s) => s.peekStack);
  const phone = useEdu((s) => s.device) === "phone";
  const g = role === "teacher" ? { ...gAll, lessons: gAll.lessons.filter((l) => l.teacher_id === TEACHER_ID) } : gAll;
  const openId = peekStack[0]?.kind === "lesson" ? peekStack[0].id : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Buổi" }]} actions={canSubOrCancel(role) ? <Button onClick={() => startMakeup([])}><Plus className="size-4" /> Buổi học bù</Button> : undefined} />
      <TableStage>
        <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", phone ? "p-3" : "p-4")}>
          {phone ? null : (
            <>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cầu Giấy · {g.meta.today_label}{role === "teacher" ? " · của Huy" : ""}</p>
              <h1 className="font-display mt-1 mb-3 text-2xl tracking-tight">Buổi</h1>
            </>
          )}
          <LessonCalendar
            g={g}
            activeId={openId}
            onLessonClick={(id, e) => {
              if (e.metaKey || e.ctrlKey) {
                window.open(`#/buoi/${id}/attendance`, "_blank");
                return;
              }
              openPeek("lesson", id);
            }}
            onEmptySlot={canSubOrCancel(role) ? (start) => {
              const v = dateToVn(start);
              startMakeup([], { date: v.ymd, hhmm: v.hhmm });
            } : undefined}
          />
        </div>
      </TableStage>
    </div>
  );
}

type CourseRow = { id: string; name: string; subject: string; level: string; model: string; feeLabel: string; classes: string; promo: string };

export function KhoaHoc() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const openPeek = useEdu((s) => s.openPeek);
  const go = useEdu((s) => s.go);
  const deleteCourse = useEdu((s) => s.deleteCourse);
  const id = useEdu((s) => s.route.id);
  const peekStack = useEdu((s) => s.peekStack);
  const phone = useEdu((s) => s.device) === "phone";
  const { menu, setMenu, pending, setPending, onRowContextMenu } = useRowActions<CourseRow>();
  const [confirm, setConfirm] = useState(false);
  const write = canWrite(role, "course");
  if (id) {
    const c = one(g.courses, id);
    if (!c) return <Empty t="Không có khóa" />;
    const cls = g.classes.filter((x) => x.course_id === c.id);
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead
          trail={[{ label: "Khóa học", go: "khoa-hoc" }, { label: c.name }]}
          actions={
            <div className="flex items-center gap-1">
              {canWrite(role, "class") ? <Button onClick={() => go("lop-moi", c.id)}>Mở lớp</Button> : null}
              {write ? <PageMore onEdit={() => setModal("course", id)} onDelete={() => setConfirm(true)} /> : null}
            </div>
          }
        />
        <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
          <p className="text-sm text-muted-foreground">{c.subject} · {c.level} · {c.duration_min} phút</p>
          {phone ? null : <h1 className="font-display mt-1 mb-4 text-2xl">{c.name}</h1>}
          <p className="mt-4 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Mô hình phí</p>
          <div className="rounded-xl border bg-card px-4 py-3 text-sm" data-slot="course-plan">
            <p className="font-medium">{planLabel(c.plan)}</p>
            {c.plan.proration ? <p className="mt-1 text-xs text-muted-foreground">Cho phép prorate</p> : null}
            {c.plan.installment_n && c.plan.installment_n > 1 ? <p className="text-xs text-muted-foreground">Trả góp {c.plan.installment_n} đợt</p> : null}
            {c.plan.expiry_days ? <p className="text-xs text-muted-foreground">Hạn gói {c.plan.expiry_days} ngày</p> : null}
            {c.plan.bundle_labels?.length ? <p className="text-xs text-muted-foreground">Gồm: {c.plan.bundle_labels.join(" · ")}</p> : null}
          </div>
          <p className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khuyến mại</p>
          {c.promotions.length ? (
            <ul className="divide-y rounded-xl border bg-card">
              {c.promotions.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{p.label}</span>
                  <span className="text-muted-foreground">{promoHint(p)}{p.active ? "" : " · tắt"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">Không có KM</p>}
          <p className="mt-6 mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ca mở từ khóa</p>
          <p className="mb-2 text-xs text-muted-foreground">Học sinh ghi danh theo ca, không theo khóa. Một HS có thể học nhiều ca cùng khóa.</p>
          {cls.length ? (
            <div className="space-y-3" data-slot="course-classes">
              {cls.map((x) => {
                const ens = g.enrollments.filter((e) => e.class_id === x.id && e.status === "active");
                return (
                  <div key={x.id} className="rounded-xl border bg-card" data-slot="course-class">
                    <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left" onClick={() => go("lop-detail", x.id)}>
                      <Person name={x.name} sub={`${formatRecurrence(x.recurrence)} · ${tchName(g, x.default_teacher_id)} · ${rmName(g, x.default_room_id)}`} />
                      <span className="shrink-0 text-xs text-muted-foreground">{ens.length}/{x.capacity}</span>
                    </button>
                    {ens.length ? (
                      <div className="flex flex-wrap gap-1 border-t px-4 py-2.5" data-slot="course-class-roster">
                        {ens.map((e) => (
                          <button
                            key={e.id}
                            type="button"
                            className="rounded-md border bg-background px-2 py-1 text-sm hover:bg-muted/60"
                            onClick={() => openPeek("student", e.student_id)}
                          >
                            {stuName(g, e.student_id)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="border-t px-4 py-2 text-xs text-muted-foreground">Chưa ghi danh</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Empty t="Chưa mở lớp" cta={canWrite(role, "class") ? "Mở lớp" : undefined} onCta={canWrite(role, "class") ? () => go("lop-moi", c.id) : undefined} />
          )}
        </div>
        <ConfirmDeleteDialog open={confirm} title="Xóa khóa học?" name={c.name} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteCourse(id); }} />
      </div>
    );
  }
  const rows: CourseRow[] = (g.courses || []).map((c) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    level: c.level,
    model: c.plan.model,
    feeLabel: planLabel(c.plan),
    classes: String(g.classes.filter((x) => x.course_id === c.id).length),
    promo: c.promotions.filter((p) => p.active).length ? `${c.promotions.filter((p) => p.active).length} KM` : "—",
  }));
  const cols: ColumnDef<CourseRow>[] = [
    { accessorKey: "name", header: "Khóa", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "subject", header: "Môn" },
    { accessorKey: "level", header: "Khối" },
    { accessorKey: "model", header: "Mô hình", cell: ({ getValue }) => CHARGE_MODELS.find((m) => m.id === getValue())?.title || statusVn(String(getValue())) },
    { accessorKey: "feeLabel", header: "Giá" },
    { accessorKey: "classes", header: "Lớp" },
    { accessorKey: "promo", header: "KM" },
  ];
  const openId = peekStack[0]?.id ?? null;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Khóa học" }]} actions={write ? <Button onClick={() => setModal("course")}><Plus className="size-4" /> Tạo khóa</Button> : undefined} />
      <TableStage>
        <DataTable
          columns={cols} data={rows} getRowId={(r) => r.id} activeId={openId} searchPlaceholder="Tìm khóa"
          facets={[
            { id: "subject", label: "Môn", options: [...new Set(rows.map((r) => r.subject))].map((v) => ({ value: v, label: v })) },
            { id: "model", label: "Mô hình", options: [...new Set(rows.map((r) => r.model))].map((v) => ({ value: v, label: statusVn(v) })) },
          ]}
          onRowClick={(row, e) => { if (e.metaKey || e.ctrlKey) window.open(`#/khoa-hoc/${row.id}`, "_blank"); else openPeek("course", row.id); }}
          onRowContextMenu={onRowContextMenu}
        />
      </TableStage>
      {menu ? (
        <RowContextMenu
          pos={menu.pos}
          onClose={() => setMenu(null)}
          onDetail={() => go("khoa-hoc-detail", menu.row.id)}
          onEdit={write ? () => setModal("course", menu.row.id) : undefined}
          onDelete={write ? () => setPending(menu.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!pending}
        title="Xóa khóa học?"
        name={pending?.name || ""}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) deleteCourse(pending.id); setPending(null); }}
      />
    </div>
  );
}

const ATT_MARK: Record<string, string> = { present: "Có", late: "Trễ", absent: "Vắng", excused: "Phép" };

function attMarkClass(status?: string | null) {
  const t = status ? statusTone(status) : "line";
  return cn(
    "text-xs font-medium",
    t === "ok" && "text-ok",
    t === "warn" && "text-warn",
    t === "bad" && "text-bad",
    t === "line" && "text-muted-foreground",
  );
}

function ClassHistory({ g, classId, phone }: { g: Graph; classId: string; phone: boolean }) {
  const pushPeek = useEdu((s) => s.pushPeek);
  const go = useEdu((s) => s.go);
  const lessons = g.lessons
    .filter((l) => l.class_id === classId && l.status !== "cancelled")
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const rosterIds = g.enrollments.filter((e) => e.class_id === classId).map((e) => e.student_id);
  const guestIds = [...new Set(lessons.flatMap((l) => confirmedGuests(g, l.id).map((m) => m.student_id)))]
    .filter((id) => !rosterIds.includes(id));
  const studentIds = [...rosterIds, ...guestIds];
  if (!lessons.length) return <Empty t="Chưa có buổi" />;

  if (phone) {
    const newest = [...lessons].reverse();
    return (
      <div data-slot="class-history" className="space-y-2">
        {newest.map((les) => {
          const atts = g.attendance.filter((a) => a.lesson_id === les.id);
          const groups: Record<string, string[]> = { present: [], late: [], absent: [], excused: [] };
          for (const a of atts) {
            if (groups[a.status]) groups[a.status].push(stuName(g, a.student_id));
          }
          const guests = confirmedGuests(g, les.id);
          const unmarked = studentIds.filter((id) => !atts.some((a) => a.student_id === id)).length;
          return (
            <button
              key={les.id}
              type="button"
              data-slot="history-lesson"
              className="w-full rounded-xl border bg-card px-3 py-3 text-left"
              onClick={() => go("buoi-detail", les.id, { tab: "attendance" })}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{fmtDay(les.start)} {fmtTime(les.start)}</p>
                <StatusChip s={les.status} />
              </div>
              {les.is_makeup ? <p className="mt-0.5 text-xs text-muted-foreground">Buổi học bù</p> : null}
              {atts.length ? (
                <dl className="mt-2 space-y-0.5 text-sm">
                  {groups.present.length ? <div className="flex gap-2"><dt className="shrink-0 text-ok">Có</dt><dd>{groups.present.join(", ")}</dd></div> : null}
                  {groups.late.length ? <div className="flex gap-2"><dt className="shrink-0 text-warn">Trễ</dt><dd>{groups.late.join(", ")}</dd></div> : null}
                  {groups.absent.length ? <div className="flex gap-2"><dt className="shrink-0 text-bad">Vắng</dt><dd>{groups.absent.join(", ")}</dd></div> : null}
                  {groups.excused.length ? <div className="flex gap-2"><dt className="shrink-0 text-muted-foreground">Phép</dt><dd>{groups.excused.join(", ")}</dd></div> : null}
                </dl>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Chưa điểm danh</p>
              )}
              {guests.length ? <p className="mt-1 text-xs text-muted-foreground">Học bù: {guests.map((m) => stuName(g, m.student_id)).join(", ")}</p> : null}
              {unmarked && atts.length ? <p className="mt-1 text-xs text-muted-foreground">{unmarked} chưa ghi</p> : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div data-slot="class-history">
      <p className="mb-3 text-sm text-muted-foreground">Có · Trễ · Vắng · Phép · — chưa ghi. Cột học bù ghi Bù.</p>
      <div className="overflow-x-auto rounded-xl border bg-card" data-slot="table-container">
        <table className="w-max min-w-full text-sm" data-slot="history-matrix">
          <thead>
            <tr className="border-b">
              <th className="sticky left-0 z-[1] bg-card px-3 py-2 text-left font-medium">Học sinh</th>
              {lessons.map((les) => (
                <th key={les.id} className="px-2 py-2 text-center font-medium whitespace-nowrap">
                  <button type="button" className="hover:underline" onClick={() => pushPeek("lesson", les.id)}>
                    {fmtDay(les.start)}
                    {les.is_makeup ? " · bù" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {studentIds.map((sid) => {
              const guestOnly = guestIds.includes(sid);
              return (
                <tr key={sid} className="border-b last:border-0">
                  <td className="sticky left-0 z-[1] bg-card px-3 py-2 whitespace-nowrap">
                    <button type="button" className="text-left hover:underline" onClick={() => pushPeek("student", sid)}>
                      {stuName(g, sid)}{guestOnly ? " · bù" : ""}
                    </button>
                  </td>
                  {lessons.map((les) => {
                    const a = attOf(g, les.id, sid);
                    const guest = isMakeupGuest(g, les.id, sid);
                    const label = a ? ATT_MARK[a.status] || statusVn(a.status) : (guest ? "Bù" : "—");
                    return (
                      <td key={les.id} className="px-2 py-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          data-slot="history-cell"
                          data-status={a?.status || (guest ? "guest" : "")}
                          className={attMarkClass(a?.status || (guest ? "scheduled" : null))}
                          onClick={() => go("buoi-detail", les.id, { tab: "attendance" })}
                        >
                          {label}{a && guest ? " · bù" : ""}
                          {a?.unpaid_flag ? " · nợ" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type ClassRow = { id: string; name: string; teacher: string; room: string; schedule: string; feeLabel: string; progress: string; billing: string; life: string; course: string };

export function Lop() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const setModal = useEdu((s) => s.setModal);
  const deleteClass = useEdu((s) => s.deleteClass);
  const peekStack = useEdu((s) => s.peekStack);
  const write = canWrite(role, "class");
  const { menu, setMenu, pending, setPending, onRowContextMenu } = useRowActions<ClassRow>();
  const rows: ClassRow[] = useMemo(() => g.classes.map((c) => {
    return {
      id: c.id, name: c.name, teacher: tchName(g, c.default_teacher_id), room: rmName(g, c.default_room_id),
      schedule: formatRecurrence(c.recurrence),
      feeLabel: planLabel(courseOf(g, c.id)?.plan) || (c.billing_mode === "monthly" ? money(c.fee) + "/th" : c.billing_mode === "prepaid_session" ? money(c.fee) + "/buổi học" : money(c.fee) + " khóa"),
      progress: classLessonProgress(g, c.id).label,
      billing: c.billing_mode, life: classLife(g, c),
      course: courseOf(g, c.id)?.name || "—",
    };
  }), [g]);
  const cols: ColumnDef<ClassRow>[] = [
    { accessorKey: "name", header: "Lớp", cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { accessorKey: "course", header: "Khóa" },
    { accessorKey: "teacher", header: "GV" },
    { accessorKey: "room", header: "Phòng" },
    { accessorKey: "schedule", header: "Lịch" },
    { accessorKey: "progress", header: "Buổi", cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span> },
    { accessorKey: "feeLabel", header: "Học phí" },
    { accessorKey: "billing", header: "Hình thức", cell: ({ getValue }) => statusVn(String(getValue())) },
    { accessorKey: "life", header: "Trạng thái", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
  ];
  const openId = peekStack[0]?.id ?? null;
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Lớp" }]} />
        <Empty t="Chưa có lớp" cta={canWrite(role, "class") ? "Mở lớp" : undefined} onCta={canWrite(role, "class") ? () => go("lop-moi") : undefined} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Lớp" }]} actions={canWrite(role, "class") ? <Button onClick={() => go("lop-moi")}><Plus className="size-4" /> Mở lớp</Button> : undefined} />
      <TableStage>
        <DataTable
          columns={cols} data={rows} getRowId={(r) => r.id} activeId={openId} searchPlaceholder="Tìm lớp"
          facets={[
            { id: "teacher", label: "GV", options: [...new Set(rows.map((r) => r.teacher))].map((v) => ({ value: v, label: v })) },
            { id: "billing", label: "Học phí", options: [
              { value: "monthly", label: "tháng" },
              { value: "prepaid_session", label: "prepaid / buổi" },
              { value: "course", label: "khóa / combo" },
            ] },
            { id: "life", label: "Trạng thái", options: [
              { value: "running", label: "đang hoạt động" },
              { value: "finished", label: "đã hoàn thành" },
              { value: "cancelled", label: "đã hủy" },
            ] },
          ]}
          onRowClick={(row, e) => { if (e.metaKey || e.ctrlKey) window.open(`#/lop/${row.id}`, "_blank"); else openPeek("class", row.id); }}
          onRowContextMenu={onRowContextMenu}
        />
      </TableStage>
      {menu ? (
        <RowContextMenu
          pos={menu.pos}
          onClose={() => setMenu(null)}
          onDetail={() => go("lop-detail", menu.row.id)}
          onEdit={write ? () => go("lop-moi", menu.row.id) : undefined}
          onDelete={write ? () => setPending(menu.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!pending}
        title="Xóa lớp?"
        name={pending?.name || ""}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) deleteClass(pending.id); setPending(null); }}
      />
    </div>
  );
}

export function LopDetail() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id);
  const role = useEdu((s) => s.role);
  const workspace = useEdu((s) => s.workspace);
  const setModal = useEdu((s) => s.setModal);
  const go = useEdu((s) => s.go);
  const deleteClass = useEdu((s) => s.deleteClass);
  const setAbsentDeduct = useEdu((s) => s.setAbsentDeduct);
  const pushPeek = useEdu((s) => s.pushPeek);
  const remind = useEdu((s) => s.remind);
  const phone = useEdu((s) => s.device) === "phone";
  const [classTab, setClassTab] = useState<ClassTab>("roster");
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { setClassTab("roster"); }, [id]);
  const c = one(g.classes, id);
  if (!c) return <Empty t="Không có lớp" />;
  const ens = g.enrollments.filter((e) => e.class_id === c.id);
  const pays = (g.payments || []).filter((p) => p.class_id === c.id);
  const life = classLife(g, c);
  const progress = classLessonProgress(g, c.id);
  const feeSorted = ens.slice().sort((a, b) => (PAY_SORT[enrollPayKind(g, a)] ?? 9) - (PAY_SORT[enrollPayKind(g, b)] ?? 9));
  const payN = {
    debt: ens.filter((e) => enrollPayKind(g, e) === "pay_debt").length,
    empty: ens.filter((e) => enrollPayKind(g, e) === "pay_empty").length,
    low: ens.filter((e) => enrollPayKind(g, e) === "pay_low").length,
    ok: ens.filter((e) => enrollPayKind(g, e) === "pay_ok").length,
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        trail={[{ label: "Lớp", go: "lop" }, { label: c.name }]}
        actions={
          <div className="flex items-center gap-1">
            {canWrite(role, "enrollment") ? <Button onClick={() => setModal("enroll")}><Plus className="size-4" /> Ghi danh</Button> : null}
            {canWrite(role, "class") ? <PageMore onEdit={() => go("lop-moi", c.id)} onDelete={() => setConfirm(true)} /> : null}
          </div>
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <p className="text-sm text-muted-foreground">{tchName(g, c.default_teacher_id)} · {rmName(g, c.default_room_id)} · {courseOf(g, c.id)?.name || c.name} · {planLabel(courseOf(g, c.id)?.plan) || statusVn(c.billing_mode)} · {formatRecurrence(c.recurrence)}</p>
        {phone ? null : <h1 className="font-display mt-1 text-2xl">{c.name}</h1>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusChip s={life} />
          <span className="text-sm tabular-nums text-muted-foreground">Buổi {progress.label}</span>
          <StatusChip s={c.absent_deduct || "always"} />
        </div>
        {canWrite(role, "class") ? (
          <div className="mt-3 max-w-md">
            <AbsentDeductField value={c.absent_deduct === "on_makeup" ? "on_makeup" : "always"} onChange={(v) => setAbsentDeduct(c.id, v)} />
          </div>
        ) : null}
        <Tabs value={classTab} onValueChange={(v) => setClassTab(v as ClassTab)} className="mt-3">
          {phone ? (
            <div role="tablist" data-slot="class-tabs" className="sticky top-0 z-10 grid grid-cols-2 gap-1 overflow-hidden bg-background py-1">
              {CLASS_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={classTab === t.id}
                  className={cn("h-10 truncate rounded-lg px-1 text-sm font-medium", classTab === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}
                  onClick={() => setClassTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          ) : (
            <TabsList className="h-auto w-full justify-start" data-slot="class-tabs">
              {CLASS_TABS.map((t) => (
                <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          )}
          <TabsContent value="roster" className="mt-4">
            {ens.length ? (
              <div className="divide-y rounded-xl border bg-card">
                {ens.map((e) => (
                  <div key={e.id} data-slot="enroll-row" className="flex w-full items-center justify-between gap-3 px-4 py-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => pushPeek("enrollment", e.id)}>
                      <Person name={stuName(g, e.student_id)} />
                    </button>
                    <StuStatus life={e.status} pay={enrollPayKind(g, e)} />
                  </div>
                ))}
              </div>
            ) : (
              <Empty t="Chưa có ghi danh" cta={canWrite(role, "enrollment") ? "Ghi danh" : undefined} onCta={canWrite(role, "enrollment") ? () => setModal("enroll") : undefined} />
            )}
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <ClassHistory g={g} classId={c.id} phone={phone} />
          </TabsContent>
          <TabsContent value="fees" className="mt-4" data-slot="class-fees">
            {ens.length ? (
              <>
                <p className="mb-3 text-sm text-muted-foreground">
                  {payN.ok} đủ buổi học · {payN.low} sắp hết buổi học · {payN.empty} hết buổi học · {payN.debt} nợ
                </p>
                <div className="divide-y rounded-xl border bg-card">
                  {feeSorted.map((e) => {
                    const kind = enrollPayKind(g, e);
                    const debt = unpaidLearned(g, e.id).length;
                    return (
                      <div key={e.id} data-slot="fee-row" className="flex w-full items-start justify-between gap-3 px-4 py-3">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pushPeek("enrollment", e.id)}>
                          <Person
                            name={stuName(g, e.student_id)}
                            sub={`${billingLabel(g, e)}${debt ? ` · nợ ${debt}` : ""}${(e.deposit_held || 0) > 0 ? ` · cọc ${money(e.deposit_held)}` : ""}`}
                          />
                          <span className="mt-1.5 inline-flex"><StuStatus life={e.status} pay={kind} /></span>
                        </button>
                        {canMoney(role) && workspace !== "draft" ? (
                          <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                            <Button variant="outline" size="sm" onClick={() => setModal("pay", e.id)}>Thu</Button>
                            <Button variant="ghost" size="sm" onClick={() => remind(e.id)}>Nhắc</Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <Empty t="Chưa có ghi danh" />
            )}
          </TabsContent>
          <TabsContent value="pays" className="mt-4">
            <PayHistory g={g} items={pays} showStudent />
          </TabsContent>
        </Tabs>
      </div>
      <ConfirmDeleteDialog open={confirm} title="Xóa lớp?" name={c.name} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteClass(c.id); }} />
    </div>
  );
}

type HSRow = { id: string; name: string; dob: string; guardian: string; zalo: string; classes: string; life: string; pay: string };

export function HS() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const openPeek = useEdu((s) => s.openPeek);
  const go = useEdu((s) => s.go);
  const deleteStudent = useEdu((s) => s.deleteStudent);
  const peekStack = useEdu((s) => s.peekStack);
  const write = canWrite(role, "student");
  const { menu, setMenu, pending, setPending, onRowContextMenu } = useRowActions<HSRow>();
  const rows: HSRow[] = useMemo(() => g.students.map((s) => {
    const link = g.student_guardians.find((x) => x.student_id === s.id && x.billing_contact);
    const grd = link ? one(g.guardians, link.guardian_id) : null;
    const cls = g.enrollments.filter((e) => e.student_id === s.id).map((e) => clsName(g, e.class_id).split("—")[0].trim()).join(" · ");
    return {
      id: s.id, name: s.full_name, dob: s.dob, guardian: grd?.full_name || "—", zalo: grd?.zalo_status || "—", classes: cls,
      life: studentLife(g, s.id) || "",
      pay: studentPayKind(g, s.id) || "",
    };
  }).sort((a, b) => (PAY_SORT[a.pay] ?? 9) - (PAY_SORT[b.pay] ?? 9)), [g]);
  const cols: ColumnDef<HSRow>[] = [
    { accessorKey: "name", header: "Học sinh", cell: ({ row }) => <Person name={row.original.name} sub={fmtShort(row.original.dob)} /> },
    { accessorKey: "life", header: "Trạng thái", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "pay", header: "Buổi học", cell: ({ getValue }) => getValue() ? <StatusChip s={String(getValue())} /> : "—" },
    { accessorKey: "zalo", header: "Zalo", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "classes", header: "Lớp" },
    { accessorKey: "guardian", header: "PH" },
    { accessorKey: "dob", header: "Ngày sinh", cell: ({ getValue }) => fmtShort(String(getValue())) },
  ];
  const openId = peekStack[0]?.id ?? null;
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Học sinh" }]} />
        <Empty t="Chưa có học sinh" cta={canWrite(role, "student") ? "Thêm HS" : undefined} onCta={canWrite(role, "student") ? () => setModal("student") : undefined} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Học sinh" }]} actions={canWrite(role, "student") ? <Button onClick={() => setModal("student")}><Plus className="size-4" /> Học sinh</Button> : undefined} />
      <TableStage>
        <DataTable columns={cols} data={rows} getRowId={(r) => r.id} activeId={openId} searchPlaceholder="Tìm học sinh"
          facets={[
            { id: "life", label: "Trạng thái", options: [{ value: "active", label: "đang học" }, { value: "paused", label: "tạm nghỉ" }, { value: "dropped", label: "nghỉ" }] },
            { id: "pay", label: "Buổi học", options: [
              { value: "pay_debt", label: "còn nợ" },
              { value: "pay_empty", label: "hết buổi học" },
              { value: "pay_low", label: "sắp hết buổi học" },
              { value: "pay_ok", label: "đủ buổi học" },
              { value: "pay_deposit", label: "đã cọc" },
            ] },
            { id: "zalo", label: "Zalo", options: [{ value: "linked", label: "Xong" }, { value: "pending", label: "chờ" }] },
          ]}
          onRowClick={(row, e) => { if (e.metaKey || e.ctrlKey) window.open(`#/hoc-sinh/${row.id}`, "_blank"); else openPeek("student", row.id); }}
          onRowContextMenu={onRowContextMenu}
        />
      </TableStage>
      {menu ? (
        <RowContextMenu
          pos={menu.pos}
          onClose={() => setMenu(null)}
          onDetail={() => go("hs-detail", menu.row.id)}
          onEdit={write ? () => setModal("student", menu.row.id) : undefined}
          onDelete={write ? () => setPending(menu.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!pending}
        title="Xóa học sinh?"
        name={pending?.name || ""}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) deleteStudent(pending.id); setPending(null); }}
      />
    </div>
  );
}

export function HSDetail() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id);
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const setModal = useEdu((s) => s.setModal);
  const workspace = useEdu((s) => s.workspace);
  const deleteStudent = useEdu((s) => s.deleteStudent);
  const pushPeek = useEdu((s) => s.pushPeek);
  const phone = useEdu((s) => s.device) === "phone";
  const [confirm, setConfirm] = useState(false);
  const s = one(g.students, id);
  if (!s) return <Empty t="Không có học sinh" />;
  const ens = g.enrollments.filter((e) => e.student_id === s.id);
  const links = g.student_guardians.filter((x) => x.student_id === s.id);
  const write = canWrite(role, "student");
  const sid = s.id;
  function enroll() {
    if (workspace === "draft") setModal("enroll");
    else go("thu-phi", sid);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="hs-detail">
      <PageHead
        trail={[{ label: "Học sinh", go: "hoc-sinh" }, { label: s.full_name }]}
        actions={
          <div className="flex items-center gap-1">
            {canWrite(role, "enrollment") ? <Button variant="outline" onClick={enroll}>Ghi danh lớp</Button> : null}
            {write ? <PageMore onEdit={() => setModal("student", s.id)} onDelete={() => setConfirm(true)} /> : null}
          </div>
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <p className="text-sm text-muted-foreground">{fmtShort(s.dob)} · {brName(g, s.branch_id)}{s.phone ? ` · ${s.phone}` : ""}</p>
        {phone ? null : <h1 className="font-display mt-1 mb-3 text-2xl">{s.full_name}</h1>}
        {s.notes ? <p className="mb-3 text-sm text-muted-foreground">{s.notes}</p> : null}

        <MoneyStripe g={g} studentId={s.id} onPay={workspace === "draft" ? undefined : (eid) => go("thu-phi", eid)} />

        <p className="mt-6 mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chuyện trên sổ</p>
        <StudentTimeline
          g={g}
          studentId={s.id}
          onLesson={(lid) => pushPeek("lesson", lid)}
          onPay={(eid) => pushPeek("enrollment", eid)}
        />

        {!ens.length ? (
          <Empty t="Chưa ghi danh" cta={canWrite(role, "enrollment") ? "Ghi danh lớp" : undefined} onCta={canWrite(role, "enrollment") ? enroll : undefined} />
        ) : null}

        <p className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phụ huynh</p>
        <ul className="divide-y rounded-xl border bg-card">
          {links.map((link) => {
            const grd = one(g.guardians, link.guardian_id);
            if (!grd) return null;
            return (
              <li key={link.guardian_id}>
                <button type="button" className="flex w-full px-4 py-3 text-left" onClick={() => pushPeek("guardian", grd.id)}>
                  <Person name={grd.full_name} sub={`${grd.phone} · ${grd.relationship}${link.billing_contact ? " · thu phí" : ""}`} />
                </button>
              </li>
            );
          })}
        </ul>
        {canWrite(role, "student") ? (
          <Button className="mt-4" variant="outline" onClick={() => setModal("student", s.id)}>Sửa hồ sơ</Button>
        ) : null}
      </div>
      <ConfirmDeleteDialog open={confirm} title="Xóa học sinh?" name={s.full_name} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteStudent(s.id); }} />
    </div>
  );
}

type ZRow = { id: string; template: string; student: string; guardian: string; status: string; at: string };

export function ZaloPage() {
  const g = useEdu((s) => s.graph)!;
  const resend = useEdu((s) => s.resend);
  const role = useEdu((s) => s.role);
  const openPeek = useEdu((s) => s.openPeek);
  const peekStack = useEdu((s) => s.peekStack);
  const rows: ZRow[] = useMemo(() => g.zalo_events.map((e) => ({
    id: e.id, template: e.template, student: stuName(g, e.student_id),
    guardian: one(g.guardians, e.guardian_id)?.full_name || "—", status: e.status, at: e.sent_at.slice(0, 16),
  })), [g]);
  const cols: ColumnDef<ZRow>[] = [
    { accessorKey: "template", header: "Mẫu" },
    { accessorKey: "student", header: "Học sinh" },
    { accessorKey: "guardian", header: "PH" },
    { accessorKey: "status", header: "Trạng thái", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "at", header: "Gửi" },
    { id: "act", header: "", cell: ({ row }) => row.original.status === "failed" && canSend(role) ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); resend(row.original.id); }}>Gửi lại</Button> : null },
  ];
  const openId = peekStack[0]?.id ?? null;
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Zalo" }]} />
        <Empty t="Chưa có tin Zalo" />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Zalo" }]} />
      <TableStage>
        <DataTable columns={cols} data={rows} getRowId={(r) => r.id} activeId={openId} searchPlaceholder="Tìm tin Zalo"
          facets={[{ id: "status", label: "Trạng thái", options: [{ value: "delivered", label: "đã gửi" }, { value: "failed", label: "lỗi" }, { value: "pending", label: "chờ" }] }]}
          onRowClick={(row, e) => { if (e.metaKey || e.ctrlKey) window.open(`#/zalo/${row.id}`, "_blank"); else openPeek("zalo", row.id); }}
        />
      </TableStage>
    </div>
  );
}

export function ZaloDetail() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "Zalo", go: "zalo" }, { label: "Tin" }]} />
      <div className="p-5">{id ? <ZaloPeek g={g} id={id} /> : null}</div>
    </div>
  );
}

function EntityList<T extends { id: string }>({
  title, empty, cta, onCreate, rows, cols, kind, href, facets, write,
  onDetail, onEdit, onDelete, rowName,
}: {
  title: string; empty: string; cta: string; onCreate?: () => void;
  rows: T[]; cols: ColumnDef<T>[]; kind: "room" | "teacher" | "staff" | "branch" | "course" | "student" | "class";
  href: (id: string) => string; facets?: Array<{ id: string; label: string; options: Array<{ value: string; label: string }> }>;
  write: boolean;
  onDetail?: (id: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  rowName?: (row: T) => string;
}) {
  const openPeek = useEdu((s) => s.openPeek);
  const peekStack = useEdu((s) => s.peekStack);
  const go = useEdu((s) => s.go);
  const setModal = useEdu((s) => s.setModal);
  const deleteRoom = useEdu((s) => s.deleteRoom);
  const deleteTeacher = useEdu((s) => s.deleteTeacher);
  const deleteStaff = useEdu((s) => s.deleteStaff);
  const deleteBranch = useEdu((s) => s.deleteBranch);
  const deleteCourse = useEdu((s) => s.deleteCourse);
  const deleteStudent = useEdu((s) => s.deleteStudent);
  const deleteClass = useEdu((s) => s.deleteClass);
  const openId = peekStack[0]?.id ?? null;
  const { menu, setMenu, pending, setPending, onRowContextMenu } = useRowActions<T>();
  const doDetail = onDetail || ((id: string) => {
    const page = PEEK_PAGE[kind as PeekKind];
    if (page) go(page, id);
  });
  const doEdit = onEdit || ((id: string) => setModal(kind as ModalKind, id));
  const doDelete = onDelete || ((id: string) => {
    if (kind === "room") deleteRoom(id);
    else if (kind === "teacher") deleteTeacher(id);
    else if (kind === "staff") deleteStaff(id);
    else if (kind === "branch") deleteBranch(id);
    else if (kind === "course") deleteCourse(id);
    else if (kind === "student") deleteStudent(id);
    else if (kind === "class") deleteClass(id);
  });
  const labelOf = rowName || ((row: T) => String((row as { name?: string }).name || row.id));
  if (!rows.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: title }]} />
        <Empty t={empty} cta={write ? cta : undefined} onCta={write ? onCreate : undefined} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: title }]} actions={write && onCreate ? <Button onClick={onCreate}><Plus className="size-4" /> {cta}</Button> : undefined} />
      <TableStage>
        <DataTable columns={cols} data={rows} getRowId={(r) => r.id} activeId={openId} searchPlaceholder={`Tìm ${title.toLowerCase()}`} facets={facets}
          onRowClick={(r, e) => { if (e.metaKey || e.ctrlKey) window.open(href(r.id), "_blank"); else openPeek(kind, r.id); }}
          onRowContextMenu={onRowContextMenu}
        />
      </TableStage>
      {menu ? (
        <RowContextMenu
          pos={menu.pos}
          onClose={() => setMenu(null)}
          onDetail={() => doDetail(menu.row.id)}
          onEdit={write ? () => doEdit(menu.row.id) : undefined}
          onDelete={write ? () => setPending(menu.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!pending}
        title={`Xóa ${title.toLowerCase()}?`}
        name={pending ? labelOf(pending) : ""}
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) doDelete(pending.id);
          setPending(null);
        }}
      />
    </div>
  );
}

export function Phong() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const rows = g.rooms.map((r) => ({ ...r, branch: brName(g, r.branch_id) }));
  return (
    <EntityList title="Phòng" empty="Chưa có phòng" cta="Thêm phòng" write={canWrite(role, "room")}
      onCreate={() => setModal("room")} rows={rows} kind="room" href={(id) => `#/phong/${id}`}
      facets={[
        { id: "type", label: "Loại", options: [{ value: "classroom", label: "phòng học" }, { value: "online", label: "online" }, { value: "other", label: "khác" }] },
        { id: "branch", label: "Chi nhánh", options: g.branches.map((b) => ({ value: b.name, label: b.name })) },
      ]}
      cols={[
        { accessorKey: "name", header: "Phòng" },
        { accessorKey: "branch", header: "Chi nhánh" },
        { accessorKey: "type", header: "Loại" },
        { accessorKey: "capacity", header: "Sức chứa" },
        { accessorKey: "active", header: "TT", cell: ({ getValue }) => getValue() ? "đang dùng" : "đóng" },
      ]}
    />
  );
}
export function PhongDetail() {
  const g = useEdu((s) => s.graph)!; const id = useEdu((s) => s.route.id)!;
  const r = one(g.rooms, id);
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const deleteRoom = useEdu((s) => s.deleteRoom);
  const write = canWrite(role, "room");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        trail={[{ label: "Phòng", go: "phong" }, { label: r?.name || "" }]}
        actions={write ? <PageMore onEdit={() => setModal("room", id)} onDelete={() => setConfirm(true)} /> : undefined}
      />
      <div className="p-5"><RoomPeek g={g} id={id} /></div>
      <ConfirmDeleteDialog open={confirm} title="Xóa phòng?" name={r?.name || ""} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteRoom(id); }} />
    </div>
  );
}
export function GV() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const rows = g.teachers.map((t) => ({ ...t, branch: brName(g, t.default_branch_id) }));
  return (
    <EntityList title="Giáo viên" empty="Chưa có giáo viên" cta="Thêm GV" write={canWrite(role, "teacher")}
      onCreate={() => setModal("teacher")} rows={rows} kind="teacher" href={(id) => `#/giao-vien/${id}`}
      facets={[{ id: "branch", label: "Chi nhánh", options: g.branches.map((b) => ({ value: b.name, label: b.name })) }]}
      cols={[
        { accessorKey: "name", header: "GV" },
        { accessorKey: "phone", header: "SĐT" },
        { accessorKey: "branch", header: "Chi nhánh" },
        { accessorKey: "subjects", header: "Môn", cell: ({ getValue }) => (getValue() as string[]).join(" · ") },
        { accessorKey: "active", header: "TT", cell: ({ getValue }) => getValue() ? "đang xếp" : "nghỉ" },
      ]}
    />
  );
}
export function GVDetail() {
  const g = useEdu((s) => s.graph)!; const id = useEdu((s) => s.route.id)!;
  const t = one(g.teachers, id);
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const deleteTeacher = useEdu((s) => s.deleteTeacher);
  const write = canWrite(role, "teacher");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        trail={[{ label: "Giáo viên", go: "giao-vien" }, { label: t?.name || "" }]}
        actions={write ? <PageMore onEdit={() => setModal("teacher", id)} onDelete={() => setConfirm(true)} /> : undefined}
      />
      <div className="p-5"><TeacherPeek g={g} id={id} /></div>
      <ConfirmDeleteDialog open={confirm} title="Xóa giáo viên?" name={t?.name || ""} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteTeacher(id); }} />
    </div>
  );
}
export function Staff() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const go = useEdu((s) => s.go);
  const deleteStaff = useEdu((s) => s.deleteStaff);
  const rows = g.staff_profiles.map((s) => ({
    ...s, name: s.full_name,
    roles: g.profile_roles.filter((r) => r.profile_id === s.id).map((r) => r.role).join(" · "),
  }));
  return (
    <EntityList title="Nhân sự" empty="Chưa có nhân sự" cta="Mời" write={canWrite(role, "staff")}
      onCreate={() => setModal("staff")} rows={rows} kind="staff" href={(id) => `#/nhan-su/${id}`}
      onDetail={(id) => go("staff-detail", id)}
      onEdit={(id) => setModal("staff", id)}
      onDelete={(id) => deleteStaff(id)}
      rowName={(r) => r.full_name}
      facets={[{ id: "title", label: "Chức danh", options: [...new Set(rows.map((r) => r.title))].map((v) => ({ value: v, label: v })) }]}
      cols={[
        { accessorKey: "full_name", header: "Tên" },
        { accessorKey: "title", header: "Chức danh" },
        { accessorKey: "roles", header: "Vai" },
        { accessorKey: "phone", header: "SĐT" },
      ]}
    />
  );
}
export function StaffDetail() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id)!;
  const s = one(g.staff_profiles, id);
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const deleteStaff = useEdu((s) => s.deleteStaff);
  const write = canWrite(role, "staff");
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        trail={[{ label: "Nhân sự", go: "nhan-su" }, { label: s?.full_name || "" }]}
        actions={write ? <PageMore onEdit={() => setModal("staff", id)} onDelete={() => setConfirm(true)} /> : undefined}
      />
      <div className="p-5"><StaffPeek g={g} id={id} /></div>
      <ConfirmDeleteDialog
        open={confirm}
        title="Xóa nhân sự?"
        name={s?.full_name || ""}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); deleteStaff(id); }}
      />
    </div>
  );
}

type BrRow = { id: string; name: string; code: string; address: string; phone: string; active: string };

export function Branch() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const deleteBranch = useEdu((s) => s.deleteBranch);
  const id = useEdu((s) => s.route.id);
  const [confirm, setConfirm] = useState(false);
  if (id) {
    const b = one(g.branches, id);
    const write = canWrite(role, "branch");
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead
          trail={[{ label: "Chi nhánh", go: "chi-nhanh" }, { label: b?.name || "" }]}
          actions={write ? <PageMore onEdit={() => setModal("branch", id)} onDelete={() => setConfirm(true)} /> : undefined}
        />
        <div className="min-h-0 flex-1 overflow-auto p-5"><BranchPeek g={g} id={id} /></div>
        <ConfirmDeleteDialog open={confirm} title="Xóa chi nhánh?" name={b?.name || ""} onClose={() => setConfirm(false)} onConfirm={() => { setConfirm(false); deleteBranch(id); }} />
      </div>
    );
  }
  const rows: BrRow[] = g.branches.map((b) => ({
    id: b.id, name: b.name, code: b.code, address: b.address, phone: b.phone, active: b.active ? "open" : "closed",
  }));
  return (
    <EntityList title="Chi nhánh" empty="Chưa có chi nhánh" cta="Tạo chi nhánh" write={canWrite(role, "branch")}
      onCreate={() => setModal("branch")} rows={rows} kind="branch" href={(bid) => `#/chi-nhanh/${bid}`}
      facets={[{ id: "active", label: "Trạng thái", options: [{ value: "open", label: "đang mở" }, { value: "closed", label: "đóng" }] }]}
      cols={[
        { accessorKey: "name", header: "Chi nhánh" },
        { accessorKey: "code", header: "Mã" },
        { accessorKey: "address", header: "Địa chỉ" },
        { accessorKey: "phone", header: "SĐT" },
        { accessorKey: "active", header: "TT", cell: ({ getValue }) => getValue() === "open" ? "đang mở" : "đóng" },
      ]}
    />
  );
}

export function OA() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const connectOA = useEdu((s) => s.connectOA);
  const setWebhook = useEdu((s) => s.setWebhook);
  const toggleTemplate = useEdu((s) => s.toggleTemplate);
  const oa = g.zalo_oa;
  const write = canWrite(role, "oa");
  const link = oa.parent_link || "https://zalo.me/oa/impact/link";
  if (!oa.connected && write) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "OA Zalo" }]} />
        <Empty t="Chưa kết nối OA" cta="Kết nối" onCta={() => connectOA(true)} />
      </div>
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "OA Zalo" }]} />
      <div className="min-h-0 flex-1 overflow-auto p-5 space-y-3">
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>{oa.oa_name}</CardTitle>
              <CardDescription>{oa.connected ? "Đã kết nối" : "Chưa kết nối"} · quota {oa.quota_used}/{oa.quota_limit}</CardDescription>
            </div>
            {write ? (
              <div className="flex items-center gap-2">
                <Label className="text-xs">Kết nối</Label>
                <Switch checked={oa.connected} onCheckedChange={connectOA} />
              </div>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
              <span>Webhook {oa.webhook_ok ? "OK" : "lỗi"}</span>
              {write ? <Switch checked={oa.webhook_ok} onCheckedChange={setWebhook} /> : <StatusChip s={oa.webhook_ok ? "ok" : "failed"} />}
            </div>
            <p className="rounded-lg border px-3 py-2 font-mono text-xs break-all">{oa.webhook_url || "—"}</p>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Mẫu ZBS</p>
            {oa.templates.map((t) => (
              <div key={t.key} className="flex items-center justify-between text-sm">
                <span>{t.name} <span className="text-muted-foreground">· {t.zalo_template_id}</span></span>
                {write ? (
                  <Button size="sm" variant="outline" onClick={() => toggleTemplate(t.key)}>{t.eligible ? "eligible" : "tắt"}</Button>
                ) : <StatusChip s={t.eligible ? "ok" : "pending"} />}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">QR liên kết phụ huynh</CardTitle>
            <CardDescription>Một OA / tenant. PH quét để follow (Z0).</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <div className="flex size-24 items-center justify-center rounded-lg border bg-muted">
              <QrCode className="size-14 text-muted-foreground" />
            </div>
            <div>
              <p className="font-mono text-xs break-all">{link}</p>
              <p className="mt-1 text-xs text-muted-foreground">WoZ: bấm follow trên hồ sơ Ngọc.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function ZaloCard() {
  const g = useEdu((s) => s.graph)!;
  const z = useEdu((s) => s.route.z);
  const go = useEdu((s) => s.go);
  const parentReply = useEdu((s) => s.parentReply);
  const mk = one(g.makeups, "mkp_an_toan9");
  const tgt = mk?.target_lesson_id ? one(g.lessons, mk.target_lesson_id) : one(g.lessons, "les_toan9_2908");
  const done = mk?.status === "confirmed" || mk?.status === "declined";
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center bg-zinc-100 p-4">
      <div className="w-full max-w-[390px]">
        <Tabs value={z} onValueChange={(v) => go("the", null, { z: v as "z0" | "z1" | "z2" })}>
          <TabsList className="mb-3 w-full"><TabsTrigger value="z0" className="flex-1">Z0</TabsTrigger><TabsTrigger value="z1" className="flex-1">Z1</TabsTrigger><TabsTrigger value="z2" className="flex-1">Z2</TabsTrigger></TabsList>
          <TabsContent value="z0"><Card><CardHeader><CardDescription>Follow OA</CardDescription><CardTitle>IMPACT Cầu Giấy</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">Oanh chưa follow. Giáo vụ bấm follow trên hồ sơ Ngọc.</p></CardContent></Card></TabsContent>
          <TabsContent value="z1"><Card><CardHeader><CardDescription>Báo vắng</CardDescription><CardTitle>An vắng Toán 9</CardTitle><CardDescription>T7 22/08 08:00</CardDescription></CardHeader><CardContent><p className="text-sm">Đã gửi cho Hoa. Giáo vụ xếp buổi học bù.</p></CardContent></Card></TabsContent>
          <TabsContent value="z2">
            <Card>
              <CardHeader>
                <CardDescription>Mẫu ZBS · Mời học bù</CardDescription>
                <CardTitle>An vắng Toán 9</CardTitle>
                <CardDescription>T7 22/08 08:00 · vắng</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Separator />
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Một buổi học bù đề xuất</p>
                <div className="text-lg font-semibold">{tgt ? fmtRange(tgt.start, tgt.end) : "T7 29/08 08:00–09:30"}</div>
                <p className="text-sm text-muted-foreground">Toán 9 — Luyện thi vào 10 · P201 · cùng giáo viên</p>
                {done ? (
                  <Alert className={mk?.status === "confirmed" ? "border-ok bg-ok-soft" : "border-destructive bg-bad-soft"}>
                    <AlertTitle>{mk?.status === "confirmed" ? "Đã nhận buổi học bù" : "Không nhận"}</AlertTitle>
                    <AlertDescription>{mk?.status === "confirmed" ? "Đã ghi vào buổi T7 29/08." : "Giáo vụ sẽ xếp buổi học bù khác."}</AlertDescription>
                  </Alert>
                ) : (
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => parentReply(mk?.id || "mkp_an_toan9", true)}>Nhận buổi học bù T7 08:00</Button>
                    <Button className="flex-1" variant="outline" onClick={() => parentReply(mk?.id || "mkp_an_toan9", false)}>Không nhận</Button>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Không mở lịch tự chọn. Từ chối thì giáo vụ xếp buổi học bù khác.</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function Modals() {
  const g = useEdu((s) => s.graph)!;
  const modal = useEdu((s) => s.modal);
  const setModal = useEdu((s) => s.setModal);
  const route = useEdu((s) => s.route);
  const doSub = useEdu((s) => s.doSub);
  const [tch, setTch] = useState(g.teachers[0]?.id || "");
  const open = modal === "sub";
  return (
    <OverlayShell
      open={open}
      title="Dạy hộ"
      desc="Trùng GV cùng chi nhánh = chặn. Reset sổ để về bản gốc."
      onClose={() => setModal(null)}
      onSave={() => {
        if (modal === "sub" && route.id) doSub(route.id, tch);
      }}
    >
      <div className="space-y-1.5"><Label>Giáo viên</Label><Select value={tch} onValueChange={setTch}><SelectTrigger className="min-h-11 w-full"><SelectValue /></SelectTrigger><SelectContent>{g.teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select></div>
    </OverlayShell>
  );
}
