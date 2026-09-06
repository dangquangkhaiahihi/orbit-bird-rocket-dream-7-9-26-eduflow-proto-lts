import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { brName, classLessonProgress, classLife, clsName, courseOf, daysPerWeek, expectedRunout, extraBurnsAhead, fmtRange, fmtShort, formatRecurrence, money, one, planLabel, promoHint, rmName, statusVn, stuName, tchName } from "@/lib/eduflow/format";
import { billingLabel, confirmedGuests, enrollPayKind, siblingClasses, useEdu, PEEK_PAGE } from "@/lib/eduflow/store";
import { canMoney, canSend, canWrite } from "@/lib/eduflow/roles";
import { lessonTasks } from "@/lib/eduflow/desk";
import type { Graph, LessonTab, PeekFrame, PeekKind } from "@/lib/eduflow/types";
import { ChevronLeft, ExternalLink, FileText, X } from "lucide-react";
import { Kv, Person, StatusChip, StuStatus } from "./atoms";
import { BottomSheet } from "./phone-chrome";
import { PayHistory } from "./pay-form";
import { MoneyStripe, StudentTimeline } from "./student-story";

export function TableStage({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>;
}

function hrefOf(g: Graph, frame: PeekFrame) {
  switch (frame.kind) {
    case "course": return `#/khoa-hoc/${frame.id}`;
    case "class": return `#/lop/${frame.id}`;
    case "student": return `#/hoc-sinh/${frame.id}`;
    case "room": return `#/phong/${frame.id}`;
    case "teacher": return `#/giao-vien/${frame.id}`;
    case "staff": return `#/nhan-su/${frame.id}`;
    case "lesson": return `#/buoi/${frame.id}/${frame.tab || "attendance"}`;
    case "zalo": return `#/zalo/${frame.id}`;
    case "branch": return `#/chi-nhanh/${frame.id}`;
    case "enrollment": {
      const e = one(g.enrollments, frame.id);
      return e ? `#/lop/${e.class_id}` : "#/lop";
    }
    case "guardian": {
      const link = g.student_guardians.find((x) => x.guardian_id === frame.id);
      return link ? `#/hoc-sinh/${link.student_id}` : "#/hoc-sinh";
    }
    default: return "#";
  }
}

function titleOf(g: Graph, frame: PeekFrame) {
  switch (frame.kind) {
    case "course": return one(g.courses, frame.id)?.name || "Khóa";
    case "class": return one(g.classes, frame.id)?.name || "Lớp";
    case "student": return stuName(g, frame.id);
    case "room": return rmName(g, frame.id);
    case "teacher": return tchName(g, frame.id);
    case "staff": return one(g.staff_profiles, frame.id)?.full_name || "Nhân sự";
    case "lesson": {
      const l = one(g.lessons, frame.id);
      return l ? clsName(g, l.class_id).split("—")[0].trim() : "Buổi";
    }
    case "zalo": return one(g.zalo_events, frame.id)?.template || "Zalo";
    case "branch": return one(g.branches, frame.id)?.name || "Chi nhánh";
    case "enrollment": return "Ghi danh";
    case "guardian": return one(g.guardians, frame.id)?.full_name || "PH";
    default: return "";
  }
}

function subOf(g: Graph, frame: PeekFrame) {
  switch (frame.kind) {
    case "course": {
      const c = one(g.courses, frame.id);
      return c ? planLabel(c.plan) : undefined;
    }
    case "class": {
      const c = one(g.classes, frame.id);
      return c ? `${tchName(g, c.default_teacher_id)} · ${brName(g, c.branch_id)}` : undefined;
    }
    case "lesson": {
      const l = one(g.lessons, frame.id);
      return l ? `${fmtRange(l.start, l.end)} · ${rmName(g, l.room_id)}` : undefined;
    }
    case "student": return brName(g, one(g.students, frame.id)?.branch_id || "");
    case "zalo": {
      const ev = one(g.zalo_events, frame.id);
      return ev ? stuName(g, ev.student_id) : undefined;
    }
    default: return undefined;
  }
}

export function InspectorSheet({
  open, title, sub, href, onDetail, onBack, onClose, children,
}: {
  open: boolean; title: string; sub?: string; href: string;
  onDetail?: () => void;
  onBack?: () => void; onClose: () => void; children: React.ReactNode;
}) {
  const device = useEdu((s) => s.device);
  if (!open) return null;
  if (device === "phone") {
    return (
      <BottomSheet
        open
        onClose={onClose}
        title={title}
        desc={sub}
        slot="inspector"
        headerExtra={onBack ? (
          <Button variant="ghost" size="icon-sm" className="size-11 shrink-0" onClick={onBack} aria-label="Quay lại">
            <ChevronLeft className="size-5" />
          </Button>
        ) : undefined}
      >
        <div className="mb-3 flex flex-wrap gap-2">
          {onDetail ? (
            <Button size="sm" variant="outline" data-slot="inspector-detail" onClick={onDetail}>
              <FileText className="size-3.5" /> Chi tiết
            </Button>
          ) : (
            <a href={href} className="flex min-h-10 items-center text-sm font-medium underline-offset-4 hover:underline" onClick={onClose}>Mở trang</a>
          )}
        </div>
        {children}
      </BottomSheet>
    );
  }
  return (
    <aside data-slot="inspector" className="relative z-10 flex w-[min(420px,42vw)] min-w-[280px] shrink-0 flex-col border-l bg-card">
      <div className="flex flex-wrap items-start gap-2 border-b px-4 py-3">
        {onBack ? (
          <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Quay lại">
            <ChevronLeft className="size-4" />
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base leading-tight">{title}</h2>
          {sub ? <p className="mt-0.5 text-sm text-muted-foreground">{sub}</p> : null}
        </div>
        {onDetail ? (
          <Button variant="ghost" size="sm" data-slot="inspector-detail" onClick={onDetail}>
            <FileText className="size-3.5" /> Chi tiết
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" asChild>
          <a href={href} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /> Mở tab mới</a>
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3">{children}</div>
    </aside>
  );
}

function Trail({ stack }: { stack: PeekFrame[] }) {
  const g = useEdu((s) => s.graph)!;
  const peekTo = useEdu((s) => s.peekTo);
  if (stack.length < 2) return null;
  return (
    <p className="mb-3 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
      {stack.map((f, i) => (
        <span key={`${f.kind}-${f.id}-${i}`} className="flex items-center gap-1">
          {i > 0 ? <span>›</span> : null}
          {i < stack.length - 1 ? (
            <button type="button" className="hover:text-foreground" onClick={() => peekTo(i)}>{titleOf(g, f)}</button>
          ) : (
            <span className="text-foreground">{titleOf(g, f)}</span>
          )}
        </span>
      ))}
    </p>
  );
}

export function PeekHost() {
  const g = useEdu((s) => s.graph);
  const stack = useEdu((s) => s.peekStack);
  const popPeek = useEdu((s) => s.popPeek);
  const closePeek = useEdu((s) => s.closePeek);
  const go = useEdu((s) => s.go);
  const top = stack[stack.length - 1];
  useEffect(() => {
    if (!top) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (stack.length > 1) popPeek();
      else closePeek();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [top, stack.length, popPeek, closePeek]);
  if (!g || !top) return null;
  function openDetail() {
    if (!g || !top) return;
    const page = PEEK_PAGE[top.kind];
    if (!page) {
      closePeek();
      if (typeof location !== "undefined") location.hash = hrefOf(g, top);
      return;
    }
    if (top.kind === "enrollment") {
      const e = one(g.enrollments, top.id);
      go(page, e?.class_id || top.id);
      return;
    }
    if (top.kind === "guardian") {
      const link = g.student_guardians.find((x) => x.guardian_id === top.id);
      go(page, link?.student_id || top.id);
      return;
    }
    go(page, top.id, top.tab ? { tab: top.tab } : undefined);
  }
  return (
    <InspectorSheet
      open
      title={titleOf(g, top)}
      sub={subOf(g, top)}
      href={hrefOf(g, top)}
      onDetail={openDetail}
      onBack={stack.length > 1 ? popPeek : undefined}
      onClose={closePeek}
    >
      <Trail stack={stack} />
      <PeekBody g={g} frame={top} />
    </InspectorSheet>
  );
}

function PeekBody({ g, frame }: { g: Graph; frame: PeekFrame }) {
  switch (frame.kind) {
    case "course": return <CoursePeek g={g} id={frame.id} />;
    case "class": return <ClassPeek g={g} id={frame.id} />;
    case "student": return <StudentPeek g={g} id={frame.id} />;
    case "room": return <RoomPeek g={g} id={frame.id} />;
    case "teacher": return <TeacherPeek g={g} id={frame.id} />;
    case "staff": return <StaffPeek g={g} id={frame.id} />;
    case "lesson": return <LessonPeek g={g} id={frame.id} tab={frame.tab} />;
    case "zalo": return <ZaloPeek g={g} id={frame.id} />;
    case "branch": return <BranchPeek g={g} id={frame.id} />;
    case "enrollment": return <EnrollmentPeek g={g} id={frame.id} />;
    case "guardian": return <GuardianPeek g={g} id={frame.id} />;
    default: return null;
  }
}

function Rel({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" data-slot="peek-rel" className="w-full rounded-md px-1 py-1.5 text-left hover:bg-muted/60" onClick={onClick}>
      {children}
    </button>
  );
}

export function CoursePeek({ g, id }: { g: Graph; id: string }) {
  const c = one(g.courses, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const go = useEdu((s) => s.go);
  const closePeek = useEdu((s) => s.closePeek);
  const role = useEdu((s) => s.role);
  if (!c) return null;
  const cls = g.classes.filter((x) => x.course_id === c.id);
  return (
    <div>
      <dl>
        <Kv k="Môn" v={`${c.subject} · ${c.level}`} />
        <Kv k="Thời lượng" v={`${c.duration_min} phút`} />
        <Kv k="Mô hình" v={planLabel(c.plan)} />
        <Kv k="Prorate" v={c.plan.proration ? "có" : "không"} />
      </dl>
      {c.promotions.length ? (
        <>
          <Separator className="my-3" />
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khuyến mại</p>
          <ul className="space-y-1 text-sm">
            {c.promotions.map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.label}</span>
                <span className="text-muted-foreground">{promoHint(p)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Separator className="my-3" />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ca</p>
        {canWrite(role, "class") ? (
          <Button size="sm" variant="outline" onClick={() => { closePeek(); go("lop-moi", c.id); }}>Mở lớp</Button>
        ) : null}
      </div>
      {cls.length ? (
        <ul className="space-y-1" data-slot="course-classes">
          {cls.map((x) => {
            const n = g.enrollments.filter((e) => e.class_id === x.id && e.status === "active").length;
            return (
              <li key={x.id}>
                <Rel onClick={() => pushPeek("class", x.id)}>
                  <Person name={x.name} sub={`${formatRecurrence(x.recurrence)} · ${n} HS`} />
                </Rel>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">Chưa mở lớp</p>}
    </div>
  );
}

export function ClassPeek({ g, id }: { g: Graph; id: string }) {
  const c = one(g.classes, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  if (!c) return null;
  const rec = c.recurrence;
  const sibs = siblingClasses(g, id);
  const life = classLife(g, c);
  const progress = classLessonProgress(g, c.id);
  return (
    <div>
      <dl>
        <Kv k="Khóa" v={c.course_id ? <button type="button" className="hover:underline" onClick={() => pushPeek("course", c.course_id!)}>{courseOf(g, c.id)?.name || "—"}</button> : "—"} />
        <Kv k="Giáo viên" v={<button type="button" className="hover:underline" onClick={() => pushPeek("teacher", c.default_teacher_id)}>{tchName(g, c.default_teacher_id)}</button>} />
        <Kv k="Phòng" v={<button type="button" className="hover:underline" onClick={() => pushPeek("room", c.default_room_id)}>{rmName(g, c.default_room_id)}</button>} />
        <Kv k="Lịch" v={formatRecurrence(rec)} />
        <Kv k="Học phí" v={planLabel(courseOf(g, c.id)?.plan) || money(c.fee)} />
        <Kv k="Hình thức" v={statusVn(courseOf(g, c.id)?.plan.model || c.billing_mode)} />
        <Kv k="Buổi" v={progress.label} />
        <Kv k="Vắng mặt" v={<StatusChip s={c.absent_deduct || "always"} />} />
        <Kv k="Bắt đầu" v={fmtShort(c.start_date)} />
        <Kv k="Trạng thái" v={<StatusChip s={life} />} />
      </dl>
      {sibs.length ? (
        <>
          <Separator className="my-3" />
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ca cùng khóa</p>
          <ul className="space-y-1">
            {sibs.map((s) => (
              <li key={s.id}>
                <Rel onClick={() => pushPeek("class", s.id)}>
                  <Person name={s.name} sub={formatRecurrence(s.recurrence)} />
                </Rel>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <Separator className="my-3" />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ghi danh</p>
        {canWrite(role, "enrollment") ? (
          <Button size="sm" variant="outline" onClick={() => setModal("enroll")}>Ghi danh</Button>
        ) : null}
      </div>
      <ul className="space-y-1">
        {g.enrollments.filter((e) => e.class_id === id).map((e) => (
          <li key={e.id}>
            <Rel onClick={() => pushPeek("student", e.student_id)}>
              <Person name={stuName(g, e.student_id)} sub={billingLabel(g, e)} />
              <span className="mt-1 inline-flex"><StuStatus life={e.status} pay={enrollPayKind(g, e)} /></span>
            </Rel>
          </li>
        ))}
      </ul>
      {canWrite(role, "class") ? (
        <Button className="mt-4 w-full" variant="outline" data-slot="peek-edit-class" onClick={() => go("lop-moi", id)}>Sửa lịch</Button>
      ) : null}
    </div>
  );
}

export function StudentPeek({ g, id }: { g: Graph; id: string }) {
  const s = one(g.students, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const go = useEdu((s) => s.go);
  const linkOanh = useEdu((s) => s.linkOanh);
  const role = useEdu((s) => s.role);
  const workspace = useEdu((s) => s.workspace);
  if (!s) return null;
  const links = g.student_guardians.filter((x) => x.student_id === id);
  const ens = g.enrollments.filter((e) => e.student_id === id);
  const ops = workspace !== "draft";
  return (
    <div>
      <dl>
        <Kv k="Ngày sinh" v={fmtShort(s.dob)} />
        <Kv k="Cơ sở" v={brName(g, s.branch_id)} />
        <Kv k="SĐT" v={s.phone || "—"} />
        <Kv k="Ghi chú" v={s.notes || "—"} />
      </dl>
      {ops && s.id === "stu_ngoc" && links.some((l) => one(g.guardians, l.guardian_id)?.zalo_status !== "linked") ? (
        <Button className="mt-3 w-full" onClick={linkOanh}>Oanh đã follow OA</Button>
      ) : null}
      <Separator className="my-3" />
      <MoneyStripe g={g} studentId={id} onPay={ops ? (eid) => go("thu-phi", eid) : undefined} />
      {ens.length ? (
        <ul className="mt-2 space-y-1">
          {ens.map((e) => (
            <li key={e.id}>
              <Rel onClick={() => pushPeek("enrollment", e.id)}>
                <Person name={clsName(g, e.class_id)} sub={billingLabel(g, e)} />
              </Rel>
            </li>
          ))}
        </ul>
      ) : null}
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chuyện trên sổ</p>
      <StudentTimeline
        g={g}
        studentId={id}
        onLesson={(lid) => pushPeek("lesson", lid)}
        onPay={(eid) => pushPeek("enrollment", eid)}
      />
      <Separator className="my-3" />
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phụ huynh</p>
        {canWrite(role, "student") ? (
          <Button size="sm" variant="outline" onClick={() => setModal("guardian")}>Thêm PH</Button>
        ) : null}
      </div>
      <ul className="space-y-1">
        {links.map((link) => {
          const grd = one(g.guardians, link.guardian_id);
          if (!grd) return null;
          return (
            <li key={link.guardian_id}>
              <Rel onClick={() => pushPeek("guardian", grd.id)}>
                <Person name={grd.full_name} sub={`${grd.phone} · ${grd.relationship}${link.billing_contact ? " · thu phí" : ""}`} />
              </Rel>
            </li>
          );
        })}
      </ul>
      {canWrite(role, "student") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("student", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export function ZaloPeek({ g, id }: { g: Graph; id: string }) {
  const ev = one(g.zalo_events, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  if (!ev) return null;
  return (
    <dl>
      <Kv k="Mẫu" v={ev.template} />
      <Kv k="Học sinh" v={<button type="button" className="hover:underline" onClick={() => pushPeek("student", ev.student_id)}>{stuName(g, ev.student_id)}</button>} />
      <Kv k="PH" v={one(g.guardians, ev.guardian_id)?.full_name || "—"} />
      <Kv k="Trạng thái" v={<StatusChip s={ev.status} />} />
      <Kv k="Gửi lúc" v={ev.sent_at.slice(11, 16)} />
      {ev.fail_reason ? <Kv k="Lỗi" v={ev.fail_reason} /> : null}
    </dl>
  );
}

export function RoomPeek({ g, id }: { g: Graph; id: string }) {
  const r = one(g.rooms, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const role = useEdu((s) => s.role);
  if (!r) return null;
  const classes = g.classes.filter((c) => c.default_room_id === id);
  return (
    <div>
      <dl>
        <Kv k="Chi nhánh" v={<button type="button" className="hover:underline" onClick={() => pushPeek("branch", r.branch_id)}>{brName(g, r.branch_id)}</button>} />
        <Kv k="Loại" v={r.type} />
        <Kv k="Sức chứa" v={r.capacity} />
        <Kv k="Hoạt động" v={r.active ? "có" : "không"} />
        <Kv k="Ghi chú" v={r.notes || "—"} />
      </dl>
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lớp dùng phòng</p>
      <ul className="space-y-1">
        {classes.map((c) => (
          <li key={c.id}>
            <Rel onClick={() => pushPeek("class", c.id)}><Person name={c.name} /></Rel>
          </li>
        ))}
      </ul>
      {canWrite(role, "room") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("room", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export function TeacherPeek({ g, id }: { g: Graph; id: string }) {
  const t = one(g.teachers, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const role = useEdu((s) => s.role);
  if (!t) return null;
  const classes = g.classes.filter((c) => c.default_teacher_id === id);
  return (
    <div>
      <dl>
        <Kv k="SĐT" v={t.phone} />
        <Kv k="Email" v={t.email || "—"} />
        <Kv k="Chi nhánh" v={brName(g, t.default_branch_id)} />
        <Kv k="Môn" v={t.subjects.join(" · ") || "—"} />
        <Kv k="Hoạt động" v={t.active ? "có" : "không"} />
      </dl>
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lớp</p>
      <ul className="space-y-1">
        {classes.map((c) => (
          <li key={c.id}><Rel onClick={() => pushPeek("class", c.id)}><Person name={c.name} /></Rel></li>
        ))}
      </ul>
      {canWrite(role, "teacher") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("teacher", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export function StaffPeek({ g, id }: { g: Graph; id: string }) {
  const s = one(g.staff_profiles, id);
  const setModal = useEdu((s) => s.setModal);
  const role = useEdu((s) => s.role);
  if (!s) return null;
  const roles = g.profile_roles.filter((r) => r.profile_id === id).map((r) => r.role).join(" · ");
  return (
    <div>
      <dl>
        <Kv k="SĐT" v={s.phone || "—"} />
        <Kv k="Email" v={s.email || "—"} />
        <Kv k="Chức danh" v={s.title} />
        <Kv k="Vai" v={roles || "—"} />
      </dl>
      {canWrite(role, "staff") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("staff", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export function LessonPeek({ g, id, tab }: { g: Graph; id: string; tab?: LessonTab }) {
  const go = useEdu((s) => s.go);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const role = useEdu((s) => s.role);
  const les = one(g.lessons, id);
  if (!les) return null;
  const n = g.enrollments.filter((e) => e.class_id === les.class_id && e.status === "active").length;
  const guests = confirmedGuests(g, id);
  const workTab = tab || "attendance";
  const cta =
    workTab === "makeup" ? "Học bù"
    : workTab === "ledger" ? "Sổ buổi học"
    : workTab === "homework" ? "Bài tập"
    : workTab === "notes" ? "Ghi chú"
    : workTab === "timeline" ? "Nhật ký"
    : "Điểm danh";
  return (
    <div>
      <dl>
        <Kv k="Lớp" v={<button type="button" className="hover:underline" onClick={() => pushPeek("class", les.class_id)}>{clsName(g, les.class_id)}</button>} />
        <Kv k="Giờ" v={fmtRange(les.start, les.end)} />
        <Kv k="Phòng" v={rmName(g, les.room_id)} />
        <Kv k="Giáo viên" v={`${tchName(g, les.teacher_id)}${les.substitute ? " · dạy hộ" : ""}`} />
        <Kv k="Trạng thái" v={<StatusChip s={les.status} />} />
        <Kv k="Sĩ số" v={`${n}${guests.length ? ` + ${guests.length} học bù` : ""}`} />
        {les.is_makeup ? <Kv k="Loại" v="Học bù" /> : null}
      </dl>
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học sinh</p>
      <ul className="space-y-1">
        {g.enrollments.filter((e) => e.class_id === les.class_id && e.status === "active").map((e) => (
          <li key={e.id}>
            <Rel onClick={() => pushPeek("student", e.student_id)}>
              <Person name={stuName(g, e.student_id)} sub={billingLabel(g, e)} />
            </Rel>
          </li>
        ))}
      </ul>
      {guests.length ? (
        <>
          <p className="mt-3 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học bù</p>
          <ul className="space-y-1">
            {guests.map((m) => (
              <li key={m.id}>
                <Rel onClick={() => pushPeek("student", m.student_id)}>
                  <Person name={stuName(g, m.student_id)} sub={`từ ${clsName(g, one(g.lessons, m.source_lesson_id)?.class_id || "")}`} />
                </Rel>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {(() => {
        const t = lessonTasks(g, id);
        const bits = [
          t.unmarked ? `${t.unmarked} bài chưa chấm` : null,
          t.absents.length ? `${t.absents.length} vắng` : null,
          t.debts.length ? `${t.debts.length} cờ nợ` : null,
        ].filter(Boolean);
        return bits.length ? <p className="mt-3 text-xs text-muted-foreground">{bits.join(" · ")}</p> : null;
      })()}
      <Button className="mt-4 w-full" data-slot="peek-work" onClick={() => go("buoi-detail", id, { tab: workTab })}>{cta}</Button>
      {canWrite(role, "class") ? (
        <Button className="mt-2 w-full" variant="outline" data-slot="peek-lesson-sched" onClick={() => setModal("lesson-sched", id)}>Đổi lịch buổi</Button>
      ) : null}
    </div>
  );
}

export function BranchPeek({ g, id }: { g: Graph; id: string }) {
  const b = one(g.branches, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const role = useEdu((s) => s.role);
  if (!b) return null;
  const rooms = g.rooms.filter((r) => r.branch_id === id);
  const teachers = g.teachers.filter((t) => t.branch_ids.includes(id));
  const classes = g.classes.filter((c) => c.branch_id === id);
  return (
    <div>
      <dl>
        <Kv k="Mã" v={b.code} />
        <Kv k="Địa chỉ" v={b.address || "—"} />
        <Kv k="SĐT" v={b.phone || "—"} />
        <Kv k="Hoạt động" v={b.active ? "có" : "không"} />
        <Kv k="Ghi chú" v={b.notes || "—"} />
      </dl>
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phòng</p>
      {rooms.map((r) => (
        <Rel key={r.id} onClick={() => pushPeek("room", r.id)}><Person name={r.name} sub={r.type} /></Rel>
      ))}
      <p className="mt-3 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Giáo viên</p>
      {teachers.map((t) => (
        <Rel key={t.id} onClick={() => pushPeek("teacher", t.id)}><Person name={t.name} /></Rel>
      ))}
      <p className="mt-3 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lớp</p>
      {classes.map((c) => (
        <Rel key={c.id} onClick={() => pushPeek("class", c.id)}><Person name={c.name} /></Rel>
      ))}
      {canWrite(role, "branch") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("branch", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export function GuardianPeek({ g, id }: { g: Graph; id: string }) {
  const grd = one(g.guardians, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  if (!grd) return null;
  const links = g.student_guardians.filter((x) => x.guardian_id === id);
  return (
    <div>
      <dl>
        <Kv k="SĐT" v={grd.phone} />
        <Kv k="Quan hệ" v={grd.relationship} />
        <Kv k="Zalo" v={<StatusChip s={grd.zalo_status} />} />
        <Kv k="Kênh" v={grd.preferred_channel} />
      </dl>
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học sinh</p>
      {links.map((l) => (
        <Rel key={l.student_id} onClick={() => pushPeek("student", l.student_id)}>
          <Person name={stuName(g, l.student_id)} sub={l.billing_contact ? "thu phí" : l.is_primary ? "chính" : ""} />
        </Rel>
      ))}
    </div>
  );
}

export function EnrollmentPeek({ g, id }: { g: Graph; id: string }) {
  const e = one(g.enrollments, id);
  const pushPeek = useEdu((s) => s.pushPeek);
  const setModal = useEdu((s) => s.setModal);
  const go = useEdu((s) => s.go);
  const remind = useEdu((s) => s.remind);
  const role = useEdu((s) => s.role);
  const workspace = useEdu((s) => s.workspace);
  if (!e) return null;
  const pays = (g.payments || []).filter((p) => p.enrollment_id === e.id);
  const cls = one(g.classes, e.class_id);
  const until = expectedRunout(g, e);
  const extra = extraBurnsAhead(g, e);
  const perWeek = cls ? daysPerWeek(cls.recurrence) : 0;
  const ops = workspace !== "draft";
  return (
    <div>
      <dl>
        <Kv k="Lớp" v={<button type="button" className="hover:underline" onClick={() => pushPeek("class", e.class_id)}>{clsName(g, e.class_id)}</button>} />
        <Kv k="Học sinh" v={<button type="button" className="hover:underline" onClick={() => pushPeek("student", e.student_id)}>{stuName(g, e.student_id)}</button>} />
        <Kv k="Trạng thái" v={<StuStatus life={e.status} pay={enrollPayKind(g, e)} />} />
        <Kv k="Còn buổi học" v={<span data-slot="ledger-left">{e.remaining_sessions ?? 0} buổi học</span>} />
        <Kv k="Hết dự kiến" v={<span data-slot="ledger-runout">{until ? `~${fmtShort(until)}` : "hết buổi học"}{extra ? ` · ${extra} học bù xếp trước` : ""}</span>} />
        <Kv k="Nhịp lớp" v={`${perWeek} buổi/tuần`} />
        <Kv k="Người thu" v={e.billing_contact_id ? (one(g.guardians, e.billing_contact_id)?.full_name || "—") : "—"} />
      </dl>
      {ops && (canMoney(role) || canSend(role)) ? (
        <div className="mt-3 flex gap-2">
          {canMoney(role) ? <Button variant="outline" size="sm" onClick={() => setModal("pay", e.id)}>Thu học phí</Button> : null}
          {canMoney(role) ? <Button size="sm" onClick={() => go("thu-phi", e.id)}>Bàn thu</Button> : null}
          {canSend(role) ? <Button variant="ghost" size="sm" onClick={() => remind(e.id)}>Nhắc</Button> : null}
        </div>
      ) : null}
      <Separator className="my-3" />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phiếu thu</p>
      <PayHistory g={g} items={pays} />
      {canWrite(role, "enrollment") ? (
        <Button className="mt-4 w-full" variant="outline" onClick={() => setModal("enroll", id)}>Sửa</Button>
      ) : null}
    </div>
  );
}

export type { PeekKind };
