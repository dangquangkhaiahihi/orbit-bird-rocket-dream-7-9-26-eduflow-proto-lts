import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { clsName, fmtDay, fmtRange, fmtTime, one, rmName, statusVn, stuName, tchName } from "@/lib/eduflow/format";
import { lessonTasks } from "@/lib/eduflow/desk";
import { absentDeductOf, attOf, billingLabel, confirmedGuests, enrollPayKind, guardianOf, nextSiblingLessons, roster, useEdu } from "@/lib/eduflow/store";
import { canMoney, canSend, canSubOrCancel, visibleLessonTabs } from "@/lib/eduflow/roles";
import type { LessonTab } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { Empty, PageHead, Person, StatusChip, StuStatus } from "./atoms";

const ATT = [["present", "Có"], ["late", "Trễ"], ["absent", "Vắng"], ["excused", "Phép"]] as const;

function Task({
  id, title, count, hint, open, onToggle, children,
}: {
  id: string; title: string; count: number; hint: string; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section data-slot="buoi-task" data-task={id} className="rounded-xl border bg-card">
      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={onToggle}>
        <span>
          <b className="block text-sm">{title}</b>
          <span className="text-xs text-muted-foreground">{hint}</span>
        </span>
        <Badge variant={count ? "default" : "secondary"} className="tabular-nums">{count}</Badge>
      </button>
      {open ? <div className="border-t px-4 py-3">{children}</div> : null}
    </section>
  );
}

export function Lesson() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id);
  const tab = useEdu((s) => s.route.tab);
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const setTab = useEdu((s) => s.setTab);
  const setModal = useEdu((s) => s.setModal);
  const markAtt = useEdu((s) => s.markAtt);
  const bulkPresent = useEdu((s) => s.bulkPresent);
  const completeLesson = useEdu((s) => s.completeLesson);
  const cancelLesson = useEdu((s) => s.cancelLesson);
  const offerMakeup = useEdu((s) => s.offerMakeup);
  const startMakeup = useEdu((s) => s.startMakeup);
  const approveSend = useEdu((s) => s.approveSend);
  const remind = useEdu((s) => s.remind);
  const assignHw = useEdu((s) => s.assignHw);
  const markHw = useEdu((s) => s.markHw);
  const addNote = useEdu((s) => s.addNote);
  const pushPeek = useEdu((s) => s.pushPeek);
  const phone = useEdu((s) => s.device) === "phone";
  const workspace = useEdu((s) => s.workspace);
  const ops = workspace !== "draft";
  const les = one(g.lessons, id);
  const [note, setNote] = useState("");
  const tabs = visibleLessonTabs(role);
  const canMakeup = tabs.includes("makeup");
  const canLedger = tabs.includes("ledger");
  const [openTask, setOpenTask] = useState<string | null>(tab === "attendance" ? null : tab);

  useEffect(() => {
    if (tab && tab !== "attendance") setOpenTask(tab);
  }, [tab]);

  if (!les) return <Empty t="Không có buổi" />;
  if (role === "teacher" && les.teacher_id !== "tch_huy") return <Empty t="Không phải buổi của bạn" />;

  const rows = roster(g, les.class_id);
  const guests = confirmedGuests(g, les.id);
  const next = g.lessons.find((l) => l.class_id === les.class_id && l.start > les.start && !l.is_makeup);
  const sibs = nextSiblingLessons(g, les.id).slice(0, 2);
  const incoming = g.makeups.filter((m) => m.target_lesson_id === les.id && (m.status === "waiting_parent" || m.status === "confirmed"));
  const tasks = lessonTasks(g, les.id);
  const markedN = rows.filter((e) => attOf(g, les.id, e.student_id)).length + guests.filter((m) => attOf(g, les.id, m.student_id)).length;
  const needN = rows.length + guests.length;
  const closed = les.status === "completed";

  function toggle(task: string) {
    setOpenTask((cur) => (cur === task ? null : task));
    setTab(task as LessonTab);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHead
        trail={[{ label: "Hôm nay", go: "hom-nay" }, { label: "Buổi", go: "buoi" }, { label: clsName(g, les.class_id).split("—")[0].trim() }]}
        actions={
          <>
            {canSubOrCancel(role) ? <Button variant="outline" onClick={() => setModal("lesson-sched", les.id)}>Đổi lịch</Button> : null}
            {canSubOrCancel(role) ? <Button variant="outline" onClick={() => setModal("sub")}>Dạy hộ</Button> : null}
            {canSubOrCancel(role) ? <Button variant="ghost" onClick={() => cancelLesson(les.id)}>Hủy buổi</Button> : null}
            <Button data-slot="dong-buoi" onClick={() => completeLesson(les.id)} disabled={closed}>
              {closed ? "Đã đóng" : "Đóng buổi"}
            </Button>
          </>
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "p-3" : "p-5")}>
        <p className="text-xs text-muted-foreground">{fmtRange(les.start, les.end)} · {rmName(g, les.room_id)} · {tchName(g, les.teacher_id)}{les.substitute ? " (dạy hộ)" : ""} · {statusVn(les.status)}</p>
        {phone ? null : <h1 className="font-display mt-1 text-2xl tracking-tight">{clsName(g, les.class_id)}</h1>}

        <div data-slot="buoi-card" className="mt-4 space-y-3">
          <section className="rounded-xl border bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Điểm danh · {markedN}/{needN}</p>
                <p className="text-xs text-muted-foreground">Mặt buổi. Đóng buổi khi đủ. Học bù điểm danh riêng.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => bulkPresent(les.id)}>Cả lớp có mặt</Button>
            </div>
            <div className="divide-y">
              {rows.map((e) => {
                const a = attOf(g, les.id, e.student_id);
                const grd = guardianOf(g, e.student_id);
                return (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                    <button type="button" onClick={() => pushPeek("student", e.student_id)}>
                      <Person name={stuName(g, e.student_id)} sub={`${grd?.full_name || "—"} · ${billingLabel(g, e)}${a?.unpaid_flag ? " · cờ nợ" : ""}`} />
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <StuStatus pay={enrollPayKind(g, e)} />
                      <ToggleGroup type="single" value={a?.status || ""} onValueChange={(v) => { if (v) markAtt(les.id, e.student_id, v); }}>
                        {ATT.map(([k, lab]) => (
                          <ToggleGroupItem key={k} value={k} variant="outline" className="h-8 px-3">{lab}</ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  </div>
                );
              })}
            </div>
            {guests.length ? (
              <div className="mt-4 border-t pt-3" data-slot="makeup-guests">
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học bù · không trừ buổi học</p>
                <div className="divide-y">
                  {guests.map((m) => {
                    const a = attOf(g, les.id, m.student_id);
                    const src = one(g.lessons, m.source_lesson_id);
                    const grd = guardianOf(g, m.student_id);
                    return (
                      <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                        <button type="button" onClick={() => pushPeek("student", m.student_id)}>
                          <Person
                            name={stuName(g, m.student_id)}
                            sub={`${grd?.full_name || "—"} · từ ${clsName(g, src?.class_id || "")} · ${src ? fmtDay(src.start) : ""}${a?.unpaid_flag ? " · cờ nợ" : ""}`}
                          />
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">Học bù</Badge>
                          <ToggleGroup type="single" value={a?.status || ""} onValueChange={(v) => { if (v) markAtt(les.id, m.student_id, v); }}>
                            {ATT.map(([k, lab]) => (
                              <ToggleGroupItem key={k} value={k} variant="outline" className="h-8 px-3">{lab}</ToggleGroupItem>
                            ))}
                          </ToggleGroup>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </section>

          {tabs.includes("homework") ? (
            <Task
              id="homework"
              title="Bài tập"
              count={tasks.unmarked}
              hint={tasks.hw.length ? `${tasks.unmarked} em chưa chấm` : "Chưa giao"}
              open={openTask === "homework"}
              onToggle={() => toggle("homework")}
            >
              <Button className="mb-3" onClick={() => assignHw(les.id)}>Giao bài</Button>
              {tasks.hw.map((h) => (
                <Card key={h.id}>
                  <CardHeader><CardTitle className="text-base">{h.title}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {rows.map((e) => (
                      <div key={e.id} className="flex items-center justify-between">
                        <span className="text-sm">{stuName(g, e.student_id)}</span>
                        <ToggleGroup type="single" value={g.homework.find((x) => x.homework_id === h.id && x.student_id === e.student_id)?.mark || ""} onValueChange={(v) => { if (v) markHw(h.id, e.student_id, v); }}>
                          <ToggleGroupItem value="done" variant="outline" className="h-7 px-2">Xong</ToggleGroupItem>
                          <ToggleGroupItem value="late" variant="outline" className="h-7 px-2">Trễ</ToggleGroupItem>
                          <ToggleGroupItem value="missing" variant="outline" className="h-7 px-2">Thiếu</ToggleGroupItem>
                        </ToggleGroup>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </Task>
          ) : null}

          {canMakeup ? (
            <Task
              id="makeup"
              title="Vắng"
              count={tasks.absents.length}
              hint={tasks.absents.length ? `${tasks.absents.length} em cần xếp` : incoming.length ? `Vào buổi này: ${incoming.length}` : "Không vắng"}
              open={openTask === "makeup"}
              onToggle={() => toggle("makeup")}
            >
              {(() => {
                const policy = absentDeductOf(g, les.class_id);
                return (
                  <Alert data-slot="absent-policy" className="mb-3">
                    <AlertTitle>{policy === "always" ? "Vắng vẫn trừ buổi học" : "Trừ khi học bù"}</AlertTitle>
                    <AlertDescription>{policy === "always" ? "Học bù là thuốc — không trừ thêm khi học sinh vào buổi bù." : "Vắng chưa trừ. Trừ 1 buổi khi học sinh có mặt buổi học bù."}</AlertDescription>
                  </Alert>
                );
              })()}
              {tasks.absents.map((a) => {
                const mk = g.makeups.find((m) => m.source_lesson_id === les.id && m.student_id === a.student_id);
                const grd = guardianOf(g, a.student_id);
                return (
                  <Card key={a.id} className="mb-2">
                    <CardHeader className="flex-row items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{stuName(g, a.student_id)}</CardTitle>
                        <CardDescription>{a.reason || "vắng"} · {grd?.full_name} · Zalo {grd?.zalo_status}</CardDescription>
                      </div>
                      <StatusChip s={mk?.status || "draft"} />
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {mk?.target_lesson_id ? (() => {
                        const tgt = one(g.lessons, mk.target_lesson_id);
                        return tgt ? <p className="text-xs text-muted-foreground">Buổi học bù xếp: {fmtRange(tgt.start, tgt.end)} · {clsName(g, tgt.class_id)}</p> : null;
                      })() : null}
                      {a.student_id === "stu_an" && les.id === "les_toan9_2208" ? (
                        <div className="flex flex-wrap gap-2">
                          {ops ? <Button variant="outline" size="sm" onClick={() => go("the", null, { z: "z2" })}>Mở thẻ phụ huynh</Button> : null}
                          {ops && canSend(role) && (mk?.status === "draft" || !mk) ? <Button size="sm" onClick={() => approveSend(mk?.id || "mkp_an_toan9")}>Gửi Zalo</Button> : null}
                        </div>
                      ) : mk?.status === "confirmed" || mk?.status === "waiting_parent" ? null : (
                        <div className="flex flex-wrap gap-2">
                          {canSend(role) && next ? <Button variant="outline" size="sm" onClick={() => offerMakeup(les.id, a.student_id, 1, next.id)}>Option 1 · buổi sau cùng lớp · {fmtDay(next.start)}</Button> : null}
                          {canSend(role) ? sibs.map((s) => (
                            <Button key={s.id} variant="outline" size="sm" onClick={() => offerMakeup(les.id, a.student_id, 3, s.id)}>
                              Lớp cùng giáo trình · {fmtDay(s.start)} {fmtTime(s.start)}
                            </Button>
                          )) : null}
                          {canSend(role) ? <Button variant="outline" size="sm" onClick={() => startMakeup([{ student_id: a.student_id, source_lesson_id: les.id }])}>Option 2 · buổi rời</Button> : null}
                          {ops && canSend(role) && mk && mk.status === "draft" ? <Button size="sm" onClick={() => approveSend(mk.id)}>Approve & Send</Button> : null}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {incoming.length ? (
                <p className="text-sm text-muted-foreground">
                  Vào buổi này: {incoming.map((m) => `${stuName(g, m.student_id)}${m.status === "confirmed" ? "" : " (chờ PH)"}`).join(", ")}
                </p>
              ) : null}
            </Task>
          ) : null}

          {canLedger ? (
            <Task
              id="ledger"
              title="Cờ nợ"
              count={tasks.debts.length}
              hint={tasks.debts.length ? `${tasks.debts.length} em đi học khi học phí còn mở` : "Không cờ nợ trên buổi này"}
              open={openTask === "ledger"}
              onToggle={() => toggle("ledger")}
            >
              <div className="divide-y">
                {rows.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Person name={stuName(g, e.student_id)} sub={billingLabel(g, e)} />
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <StuStatus life={e.status} pay={enrollPayKind(g, e)} />
                      {ops && canMoney(role) ? <Button variant="outline" size="sm" onClick={() => setModal("pay", e.id)}>Thu học phí</Button> : null}
                      {ops && canSend(role) ? <Button variant="ghost" size="sm" onClick={() => remind(e.id)}>Nhắc</Button> : null}
                    </div>
                  </div>
                ))}
              </div>
            </Task>
          ) : null}

          {tabs.includes("notes") ? (
            <section className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Ghi chú buổi</p>
              <div className="flex gap-2">
                <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ghi chú buổi…" />
                <Button onClick={() => { addNote(les.id, note); setNote(""); }}>Lưu</Button>
              </div>
              {g.notes.filter((n) => n.lesson_id === les.id).map((n) => (
                <p key={n.id} className="mt-2 rounded-lg border bg-background p-3 text-sm">{n.body}<span className="ml-2 text-xs text-muted-foreground">{n.at.slice(11, 16)}</span></p>
              ))}
            </section>
          ) : null}

          {tabs.includes("timeline") ? (
            <section className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-sm font-medium">Nhật ký</p>
              <ol className="space-y-2">
                {g.timeline_events.filter((t) => t.lesson_id === les.id).map((t) => (
                  <li key={t.id} className="rounded-lg border bg-background px-3 py-2 text-sm">
                    <span className="text-xs text-muted-foreground">{t.at.slice(11, 16)} · {t.kind}</span>
                    <p>{t.text}</p>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
