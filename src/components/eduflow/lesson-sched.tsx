import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_SLOTS, addMinutesHhmm, fmtRange, normalizeRecurrence, one, weekdayOf } from "@/lib/eduflow/format";
import { classPhase, isLessonFrozen } from "@/lib/eduflow/schedule";
import { useEdu } from "@/lib/eduflow/store";
import type { RecurrenceDay } from "@/lib/eduflow/types";
import { OverlayShell } from "./phone-chrome";
import { ClashBlockDialog, ClashCoverDialog } from "./clash-dialog";
import type { ScheduleResult } from "@/lib/eduflow/schedule";

export function LessonSchedDialog() {
  const g = useEdu((s) => s.graph)!;
  const modal = useEdu((s) => s.modal);
  const editId = useEdu((s) => s.editId);
  const setModal = useEdu((s) => s.setModal);
  const updateLessonOccurrence = useEdu((s) => s.updateLessonOccurrence);
  const applyThisAndFuture = useEdu((s) => s.applyThisAndFuture);
  const les = editId ? one(g.lessons, editId) : undefined;
  const cls = les ? one(g.classes, les.class_id) : undefined;
  const rec = cls ? normalizeRecurrence(cls.recurrence) : { duration_min: 90, days: [] as RecurrenceDay[] };
  const [date, setDate] = useState("");
  const [hhmm, setHhmm] = useState("09:00");
  const [tch, setTch] = useState("");
  const [rm, setRm] = useState("");
  const [pending, setPending] = useState<ScheduleResult | null>(null);
  const [cover, setCover] = useState(false);
  const [block, setBlock] = useState(false);

  useEffect(() => {
    if (!les) return;
    setDate(les.start.slice(0, 10));
    setHhmm(les.start.slice(11, 16));
    setTch(les.teacher_id);
    setRm(les.room_id);
    setPending(null);
    setCover(false);
    setBlock(false);
  }, [les?.id, modal]);

  const open = modal === "lesson-sched" && !!les && !!cls;
  const locked = !les || !cls || isLessonFrozen(g, les) || classPhase(g, cls) === "finished" || classPhase(g, cls) === "cancelled";
  const end = addMinutesHhmm(hhmm, rec.duration_min);
  const startIso = date && hhmm ? `${date}T${hhmm}:00+07:00` : "";
  const endIso = date && end ? `${date}T${end}:00+07:00` : "";

  function handle(r: ScheduleResult | null) {
    if (!r) return;
    if (r.status === "block") { setPending(r); setBlock(true); return; }
    if (r.status === "cover") { setPending(r); setCover(true); return; }
    setModal(null);
  }

  function onlyThis() {
    if (!les || !endIso) return;
    handle(updateLessonOccurrence({ lesson_id: les.id, start: startIso, end: endIso, teacher_id: tch, room_id: rm }));
  }

  function thisAndFuture() {
    if (!les || !cls || !endIso) return;
    const wd = weekdayOf(date);
    const days = rec.days.map((d) => d.weekday === wd ? { weekday: d.weekday, start_time: hhmm } : d);
    if (!days.some((d) => d.weekday === wd)) days.push({ weekday: wd, start_time: hhmm });
    handle(applyThisAndFuture(cls.id, les.id, {
      days,
      duration_min: rec.duration_min,
      start_date: cls.start_date,
      end_date: cls.end_date,
      teacher_id: tch,
      room_id: rm,
      capacity: cls.capacity,
      name: cls.name,
    }));
  }

  return (
    <>
      <OverlayShell
        open={open && !cover && !block}
        title="Đổi lịch buổi"
        desc={les ? fmtRange(les.start, les.end) : ""}
        onClose={() => setModal(null)}
        saveLabel="Chỉ buổi này"
        onSave={locked ? undefined : onlyThis}
      >
        {locked ? (
          <p className="text-sm text-muted-foreground">Buổi đã diễn ra hoặc lớp đã kết thúc — không đổi lịch.</p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Ngày</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Giờ bắt đầu</Label>
              <Select value={hhmm} onValueChange={setHhmm}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIME_SLOTS.filter((t) => !!addMinutesHhmm(t, rec.duration_min)).map((t) => (
                    <SelectItem key={t} value={t}>{t} → {addMinutesHhmm(t, rec.duration_min)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Giáo viên</Label>
              <Select value={tch} onValueChange={setTch}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{g.teachers.filter((t) => t.active || t.id === tch).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phòng</Label>
              <Select value={rm} onValueChange={setRm}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{g.rooms.filter((r) => r.active || r.id === rm).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button type="button" variant="secondary" className="w-full min-h-11" data-slot="this-and-future" onClick={thisAndFuture}>
              Từ buổi này
            </Button>
          </div>
        )}
      </OverlayShell>
      <ClashBlockDialog open={block} result={pending} onClose={() => { setBlock(false); }} />
      {cls ? (
        <ClashCoverDialog
          open={cover}
          result={pending}
          classId={cls.id}
          teacherId={tch}
          roomId={rm}
          duration={rec.duration_min}
          onDone={() => { setCover(false); setModal(null); }}
        />
      ) : null}
    </>
  );
}
