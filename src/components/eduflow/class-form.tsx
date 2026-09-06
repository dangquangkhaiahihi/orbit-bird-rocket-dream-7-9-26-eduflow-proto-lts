import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DURATION_MINS, TIME_SLOTS, WD, addMinutesHhmm, classInstanceName, clsName, enumerateRecurrence, fmtDay, fmtTime, formatRecurrence, nextOnWeekday, one, pad, planLabel, rmName, schoolOrder, tchName, weekdayOf,
} from "@/lib/eduflow/format";
import { canWrite } from "@/lib/eduflow/roles";
import { clashNote, occupancyOnDate, slotClash, useEdu, type OccupancyHold, type ScheduleResult } from "@/lib/eduflow/store";
import type { Graph, RecurrenceDay, AbsentDeduct } from "@/lib/eduflow/types";
import { classPhase } from "@/lib/eduflow/schedule";
import { ClashBlockDialog, ClashCoverDialog } from "./clash-dialog";
import type { CalendarEvent, CalendarView } from "@/components/reui/event-calendar/event-calendar-types";
import { cn } from "@/lib/utils";
import { PageHead } from "./atoms";
import { LessonCalendar, type LessonEventData } from "./lesson-calendar";
import { AbsentDeductField } from "./makeup-form";

function TimeSelect({ value, onChange, duration, id }: { value: string; onChange: (v: string) => void; duration: number; id?: string }) {
  const slots = TIME_SLOTS.filter((t) => !!addMinutesHhmm(t, duration));
  const v = slots.includes(value) ? value : slots[0] || "08:00";
  return (
    <Select value={v} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full min-h-11"><SelectValue /></SelectTrigger>
      <SelectContent>
        {slots.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function dateToVn(d: Date) {
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const y = shifted.getUTCFullYear();
  const mo = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  const h = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  const wd = new Date(Date.UTC(y, shifted.getUTCMonth(), shifted.getUTCDate())).getUTCDay();
  return { wd, hhmm: `${h}:${mi}` };
}

type CalFilter = "all" | "teacher" | "room";
type CalView = Extract<CalendarView, "day" | "week" | "resource" | "month">;

function lastName(name: string) {
  return name.trim().split(/\s+/).slice(-1)[0] || name;
}

function overlapsIso(a0: string, a1: string, b0: string, b1: string) {
  return a0 < b1 && b0 < a1;
}

export function ClassCreatePage() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const setModal = useEdu((s) => s.setModal);
  const createClass = useEdu((s) => s.createClass);
  const updateClass = useEdu((s) => s.updateClass);
  const go = useEdu((s) => s.go);
  const openPeek = useEdu((s) => s.openPeek);
  const phone = useEdu((s) => s.device) === "phone";
  const preset = useEdu((s) => s.route.id);
  const today = g.meta.today;
  const editClass = preset ? g.classes.find((c) => c.id === preset) : undefined;
  const editing = !!editClass;
  const phase = editClass ? classPhase(g, editClass) : "not_started";
  const locked = phase === "finished" || phase === "cancelled";
  const courses = g.courses.filter((c) => c.active);
  const write = canWrite(role, "class");

  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [tch, setTch] = useState("");
  const [rm, setRm] = useState("");
  const [capacity, setCapacity] = useState("12");
  const [weekdays, setWeekdays] = useState<string[]>(["6"]);
  const [starts, setStarts] = useState<Record<string, string>>({ "6": "09:30" });
  const [duration, setDuration] = useState(90);
  const [startDate, setStartDate] = useState(today);
  const [hasEnd, setHasEnd] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [absentDeduct, setAbsentDeduct] = useState<AbsentDeduct>("always");
  const [nameLocked, setNameLocked] = useState(false);
  const [calFilter, setCalFilter] = useState<CalFilter>("all");
  const [calView, setCalView] = useState<CalView>(phone ? "day" : "resource");
  const [resourceMode, setResourceMode] = useState<"room" | "teacher">("room");
  const [focusDate, setFocusDate] = useState(today);
  const [phonePane, setPhonePane] = useState<"form" | "cal">("form");
  const [pending, setPending] = useState<ScheduleResult | null>(null);
  const [coverOpen, setCoverOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const course = courseId ? one(g.courses, courseId) : undefined;

  useEffect(() => {
    if (editClass) {
      const rec = { duration_min: editClass.recurrence.duration_min, days: editClass.recurrence.days || [] };
      const normalized = rec.days.length ? rec.days : (editClass.recurrence.weekdays || []).map((w) => ({ weekday: w, start_time: editClass.recurrence.start_time || "09:30" }));
      setCourseId(editClass.course_id || "");
      setName(editClass.name);
      setNameLocked(true);
      setTch(editClass.default_teacher_id);
      setRm(editClass.default_room_id);
      setCapacity(String(editClass.capacity));
      setWeekdays(normalized.map((d) => String(d.weekday)));
      setStarts(Object.fromEntries(normalized.map((d) => [String(d.weekday), d.start_time.slice(0, 5)])));
      setDuration(editClass.recurrence.duration_min || 90);
      setStartDate(editClass.start_date);
      setHasEnd(!!editClass.end_date);
      setEndDate(editClass.end_date || "");
      setAbsentDeduct(editClass.absent_deduct === "on_makeup" ? "on_makeup" : "always");
      setFocusDate(editClass.start_date > today ? editClass.start_date : today);
      return;
    }
    const hit = preset && g.courses.some((c) => c.id === preset) ? preset : (courses[0]?.id || "");
    setCourseId(hit);
    const wd = String(weekdayOf(g.meta.today));
    const crs = one(g.courses, hit);
    setNameLocked(false);
    setName(crs ? classInstanceName(crs.name, { days: [{ weekday: Number(wd), start_time: "09:30" }] }) : "");
    setTch(g.teachers[0]?.id || "");
    setRm(g.rooms[0]?.id || "");
    setCapacity("12");
    setWeekdays([wd]);
    setStarts({ [wd]: "09:30" });
    setDuration(crs?.duration_min || 90);
    setStartDate(g.meta.today);
    setHasEnd(!!crs?.plan.course_sessions);
    setEndDate("");
    setAbsentDeduct("always");
    setFocusDate(g.meta.today);
    setCalView(phone ? "day" : "resource");
    setCalFilter("all");
  }, [preset]);

  function pickCourse(id: string) {
    setCourseId(id);
    const crs = one(g.courses, id);
    if (crs) {
      if (!nameLocked) {
        const tagDays = weekdays.map((w) => ({ weekday: Number(w), start_time: starts[w] || "16:00" }));
        setName(classInstanceName(crs.name, { days: tagDays }));
      }
      setDuration(crs.duration_min || 90);
      setHasEnd(!!crs.plan.course_sessions);
    }
  }

  const teacherId = tch || g.teachers[0]?.id || "";
  const roomId = rm || g.rooms[0]?.id || "";
  const days: RecurrenceDay[] = weekdays
    .map((w) => ({ weekday: Number(w), start_time: starts[w] || "16:00" }))
    .sort((a, b) => schoolOrder(a.weekday) - schoolOrder(b.weekday));
  const rec = { duration_min: duration, days };

  function toggleDays(v: string[]) {
    if (!v.length) return;
    setWeekdays(v);
    setStarts((prev) => {
      const next = { ...prev };
      const fallback = Object.values(prev)[0] || "16:00";
      for (const w of v) if (!next[w]) next[w] = fallback;
      for (const k of Object.keys(next)) if (!v.includes(k)) delete next[k];
      return next;
    });
    if (!nameLocked && course) {
      setName(classInstanceName(course.name, { days: v.map((w) => ({ weekday: Number(w), start_time: starts[w] || "16:00" })) }));
    }
  }

  const slots = useMemo(() => {
    return enumerateRecurrence({
      days, duration_min: duration,
      start_date: startDate || today, end_date: hasEnd && endDate ? endDate : null, today,
    });
  }, [days.map((d) => `${d.weekday}:${d.start_time}`).join(","), duration, startDate, hasEnd, endDate, today]);

  const clashRows = useMemo(() => {
    return slots.flatMap((s) => {
      const hit = slotClash(g, teacherId, roomId, s.start, s.end, editing ? { exceptClassId: editClass.id } : undefined);
      if (!hit.kind) return [];
      const parties = [...hit.teacher, ...hit.room];
      return [{
        start: s.start,
        end: s.end,
        kind: hit.kind,
        note: clashNote(g, hit),
        ids: parties.map((p) => p.lesson_id).filter((id): id is string => !!id),
        classIds: [...new Set(parties.map((p) => p.class_id))],
      }];
    });
  }, [g, slots, teacherId, roomId]);

  const clashIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of clashRows) {
      for (const id of r.ids) s.add(id);
      for (const id of r.classIds) s.add(id);
    }
    return s;
  }, [clashRows]);
  const clashN = clashRows.length;
  const okSlots = slots.length - clashN;
  const invalid = days.some((d) => !addMinutesHhmm(d.start_time, duration));
  const draftName = name.trim() || "Lớp mới";
  const draftHour = Number((days[0]?.start_time || "08:00").slice(0, 2));

  useEffect(() => {
    const wd = weekdays[0];
    if (wd == null) return;
    if (!weekdays.includes(String(weekdayOf(focusDate)))) {
      setFocusDate(nextOnWeekday(startDate || today, Number(wd)));
    }
  }, [weekdays.join(","), startDate]);

  const extraEvents = useMemo<CalendarEvent<LessonEventData>[]>(() => {
    return slots.map((s) => {
      const hit = slotClash(g, teacherId, roomId, s.start, s.end, editing ? { exceptClassId: editClass.id } : undefined);
      const note = hit.kind ? clashNote(g, hit) : `${rmName(g, roomId)} · ${tchName(g, teacherId)}`;
      return {
        id: `draft:${s.start}`,
        title: draftName,
        start: new Date(s.start),
        end: new Date(s.end),
        color: hit.kind ? "var(--color-bad)" : "var(--color-primary)",
        resourceId: resourceMode === "teacher" ? teacherId : roomId,
        readOnly: true,
        draggable: false,
        resizable: false,
        priority: 40,
        zIndex: 30,
        data: { lessonId: `draft:${s.start}`, classId: "draft", draft: true, clashKind: hit.kind || undefined, clashNote: note },
      };
    });
  }, [g, slots, teacherId, roomId, draftName, resourceMode]);

  function applySlot(start: Date) {
    const { wd, hhmm } = dateToVn(start);
    const key = String(wd);
    setWeekdays((prev) => (prev.includes(key) ? prev : [...prev, key].sort((a, b) => schoolOrder(Number(a)) - schoolOrder(Number(b)))));
    setStarts((prev) => ({ ...prev, [key]: hhmm }));
    const shifted = new Date(start.getTime() + 7 * 60 * 60 * 1000);
    setFocusDate(`${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`);
    if (phone) setPhonePane("form");
  }

  function save() {
    if (locked || !write || invalid) return;
    if (clashN >= 5) {
      setPending({
        status: "block",
        message: `${clashN} buổi trùng`,
        phase,
        clashN,
        clashes: clashRows.map((r) => ({ date: r.start.slice(0, 10), start: r.start, end: r.end, hit: slotClash(g, teacherId, roomId, r.start, r.end, editing ? { exceptClassId: editClass!.id } : undefined), note: r.note })),
        frozenN: 0,
        mutableN: okSlots,
        created: 0,
        patched: 0,
        cancelled: 0,
        studentWarns: [],
        applied: false,
      });
      setBlockOpen(true);
      return;
    }
    const draft = {
      course_id: courseId,
      name, teacher_id: teacherId, room_id: roomId, capacity: Number(capacity) || 12,
      duration_min: duration, days,
      start_date: startDate || today, end_date: hasEnd && endDate ? endDate : null,
      absent_deduct: absentDeduct,
    };
    const result = editing
      ? updateClass(editClass.id, draft)
      : (!courseId ? null : createClass(draft));
    if (!result) return;
    if (result.status === "block") { setPending(result); setBlockOpen(true); return; }
    if (result.status === "cover") { setPending(result); setCoverOpen(true); return; }
    if (editing) go("lop-detail", editClass.id);
  }

  const form = (
    <div className={cn("space-y-4", phone ? "p-3" : "p-5")} data-slot="class-form">
      {editing ? (
        <Alert data-slot="class-life-banner" className={locked ? "border-bad/30 bg-bad-soft" : undefined}>
          <AlertTitle>
            {locked ? "Lớp đã kết thúc — không đổi lịch"
              : phase === "running"
                ? `${g.lessons.filter((l) => l.class_id === editClass.id && l.start <= g.meta.clock && l.status !== "cancelled").length} buổi đã diễn ra giữ nguyên · ${okSlots} buổi tương lai sẽ đổi`
                : "Lớp chưa bắt đầu — đổi lịch toàn bộ"}
          </AlertTitle>
        </Alert>
      ) : null}
      <section className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Khóa · tài nguyên</p>
        {courses.length ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Khóa học</Label>
              {write ? <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setModal("course")}>Tạo khóa mới</button> : null}
            </div>
            <Select value={courseId} onValueChange={pickCourse} disabled={editing}>
              <SelectTrigger className="w-full min-h-11" data-slot="class-course"><SelectValue placeholder="Chọn khóa" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {course ? <p className="text-xs text-muted-foreground">{planLabel(course.plan)}{course.promotions.length ? ` · ${course.promotions.length} KM` : ""}</p> : null}
          </div>
        ) : (
          <Alert>
            <AlertTitle>Chưa có khóa</AlertTitle>
            <AlertDescription>
              Tạo khóa học (kèm mô hình phí) trước khi mở lớp.
              {write ? <button type="button" className="ml-1 underline" onClick={() => setModal("course")}>Tạo khóa</button> : null}
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="cls-name">Tên lớp (ca)</Label>
          <Input id="cls-name" value={name} disabled={locked} onChange={(e) => { setNameLocked(true); setName(e.target.value); }} placeholder="Toán 9 · T7–CN" />
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label>Giáo viên</Label>
            <Select value={teacherId} onValueChange={setTch} disabled={locked}><SelectTrigger className="w-full min-h-11" data-slot="class-teacher"><SelectValue /></SelectTrigger><SelectContent>{g.teachers.filter((t) => t.active || t.id === teacherId).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}{t.active ? "" : " · ngưng"}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phòng</Label>
            <Select value={roomId} onValueChange={setRm} disabled={locked}><SelectTrigger className="w-full min-h-11" data-slot="class-room"><SelectValue /></SelectTrigger><SelectContent>{g.rooms.filter((r) => r.active || r.id === roomId).map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {r.type}{r.active ? "" : " · ngưng"}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cls-cap">Sức chứa</Label>
            <Input id="cls-cap" type="number" min={1} value={capacity} disabled={locked} onChange={(e) => setCapacity(e.target.value)} className="min-h-11" />
          </div>
          <AbsentDeductField value={absentDeduct} onChange={setAbsentDeduct} />
        </div>
      </section>
      <Separator />
      <fieldset disabled={locked} className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lịch lặp</p>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label>Thời lượng buổi</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="w-full min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DURATION_MINS.map((m) => <SelectItem key={m} value={String(m)}>{m} phút</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cls-sd">Ngày bắt đầu</Label>
            <Input id="cls-sd" type="date" value={startDate || today} onChange={(e) => setStartDate(e.target.value)} className="min-h-11" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Thứ trong tuần</Label>
          <ToggleGroup type="multiple" value={weekdays} onValueChange={toggleDays} className="flex flex-wrap justify-start gap-1">
            {WD.map((lab, i) => (
              <ToggleGroupItem key={lab} value={String(i)} variant="outline" className="h-11 w-11 px-0 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{lab}</ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
        <div className="space-y-2 rounded-lg border bg-muted/40 p-3" data-slot="class-day-times">
          <p className="text-xs text-muted-foreground">Giờ từng thứ — kết thúc = bắt đầu + {duration} phút. Bấm ô trống trên lịch để gán.</p>
          {days.map((d) => {
            const end = addMinutesHhmm(d.start_time, duration);
            return (
              <div key={d.weekday} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-2">
                <span className="text-sm font-medium">{WD[d.weekday]}</span>
                <TimeSelect
                  value={d.start_time}
                  duration={duration}
                  onChange={(v) => setStarts((prev) => ({ ...prev, [String(d.weekday)]: v }))}
                />
                <span className={cn("text-sm tabular-nums", end ? "text-muted-foreground" : "text-destructive")}>
                  → {end || "quá ngày"}
                </span>
              </div>
            );
          })}
        </div>
        <div className="space-y-1.5">
          <div className="flex h-5 items-center justify-between">
            <Label htmlFor="cls-ed">Ngày kết thúc</Label>
            <Switch id="cls-has-end" checked={hasEnd} onCheckedChange={setHasEnd} />
          </div>
          <Input id="cls-ed" type="date" disabled={!hasEnd} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="min-h-11" />
        </div>
        <p className="text-sm text-muted-foreground">{formatRecurrence(rec)}{invalid ? " · giờ không hợp lệ" : ""}</p>
      </fieldset>
      <HoldBoard
        g={g}
        days={days}
        duration={duration}
        startDate={startDate || today}
        teacherId={teacherId}
        roomId={roomId}
        draftName={draftName}
        onJump={(ymd) => { setFocusDate(ymd); if (phone) setPhonePane("cal"); }}
      />
      <Alert data-slot="class-clash" className={clashN ? "border-bad/30 bg-bad-soft" : undefined}>
        <AlertTitle>
          {okSlots} buổi sẽ mở{clashN ? ` · ${clashN} trùng` : " · không trùng"}
        </AlertTitle>
        <AlertDescription>
          {clashN
            ? clashN >= 5
              ? "≥5 buổi trùng — không lưu. Xem lịch tháng."
              : "1–4 buổi trùng: lưu buổi trống, rồi xếp học bù hoặc bỏ."
            : course ? planLabel(course.plan) : "Chưa chọn khóa"}
        </AlertDescription>
        {clashRows.length ? (
          <ul className="mt-2 space-y-1 text-sm" data-slot="class-clash-list">
            {clashRows.slice(0, 6).map((r) => (
              <li key={r.start} data-slot="class-clash-row">
                {fmtDay(r.start)} {fmtTime(r.start)} · {r.note}
              </li>
            ))}
            {clashRows.length > 6 ? <li className="text-xs text-muted-foreground">+{clashRows.length - 6} buổi nữa</li> : null}
          </ul>
        ) : null}
      </Alert>
    </div>
  );

  const cal = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="class-draft-cal">
      <div className={cn("flex flex-col gap-2 border-b", phone ? "px-3 py-2" : "px-4 py-2")}>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            value={calView}
            onValueChange={(v) => {
              if (!v) return;
              const next = v as CalView;
              setCalView(next);
              if (next === "resource") setResourceMode("room");
            }}
            className="justify-start"
          >
            <ToggleGroupItem value="resource" className="h-9 px-2.5 text-xs">Theo phòng</ToggleGroupItem>
            <ToggleGroupItem value="day" className="h-9 px-2.5 text-xs">Ngày</ToggleGroupItem>
            {phone ? null : <ToggleGroupItem value="week" className="h-9 px-2.5 text-xs">Tuần</ToggleGroupItem>}
            <ToggleGroupItem value="month" className="h-9 px-2.5 text-xs">Tháng</ToggleGroupItem>
          </ToggleGroup>
          {calView === "resource" ? (
            <ToggleGroup type="single" value={resourceMode} onValueChange={(v) => { if (v) setResourceMode(v as "room" | "teacher"); }} className="justify-start">
              <ToggleGroupItem value="room" className="h-9 px-2.5 text-xs">Cột phòng</ToggleGroupItem>
              <ToggleGroupItem value="teacher" className="h-9 px-2.5 text-xs">Cột GV</ToggleGroupItem>
            </ToggleGroup>
          ) : (
            <ToggleGroup type="single" value={calFilter} onValueChange={(v) => { if (v) setCalFilter(v as CalFilter); }} className="justify-start">
              <ToggleGroupItem value="all" className="h-9 px-2.5 text-xs">Tất cả lớp</ToggleGroupItem>
              <ToggleGroupItem value="teacher" className="h-9 px-2.5 text-xs">GV đã chọn</ToggleGroupItem>
              <ToggleGroupItem value="room" className="h-9 px-2.5 text-xs">Phòng đã chọn</ToggleGroupItem>
            </ToggleGroup>
          )}
          <ul className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-primary" /> Nháp</li>
            <li className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-bad" /> Trùng</li>
            <li className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-muted-foreground" /> Đang mở</li>
          </ul>
        </div>
        <div className="flex flex-wrap gap-1" data-slot="class-wd-strip">
          {WD.map((lab, i) => {
            const on = weekdays.includes(String(i));
            const ymd = nextOnWeekday(startDate || today, i);
            const focused = weekdayOf(focusDate) === i;
            return (
              <button
                key={lab}
                type="button"
                data-slot="class-wd"
                data-on={on ? "1" : "0"}
                className={cn(
                  "h-9 min-w-9 rounded-md px-2 text-xs font-medium",
                  focused ? "bg-foreground text-background" : on ? "bg-primary/10 text-foreground" : "bg-muted text-muted-foreground",
                )}
                onClick={() => {
                  setFocusDate(ymd);
                  if (!on) {
                    const key = String(i);
                    setWeekdays((prev) => [...prev, key].sort((a, b) => schoolOrder(Number(a)) - schoolOrder(Number(b))));
                    setStarts((prev) => ({ ...prev, [key]: Object.values(prev)[0] || "09:30" }));
                  }
                }}
              >
                {lab}
              </button>
            );
          })}
        </div>
      </div>
      <LessonCalendar
        g={g}
        compact
        view={calView}
        onViewChange={(v) => {
          if (v === "day" || v === "week" || v === "resource" || v === "month") setCalView(v);
        }}
        date={focusDate}
        onDateChange={setFocusDate}
        includeProjected
        resourceMode={calView === "resource" ? resourceMode : "room"}
        scrollHour={Math.max(7, draftHour - 1)}
        extraEvents={extraEvents}
        clashIds={clashIds}
        lessonFilter={
          calView === "resource" || calFilter === "all" ? undefined
            : calFilter === "teacher" ? (l) => l.teacher_id === teacherId
              : (l) => l.room_id === roomId
        }
        onLessonClick={(id, e) => {
          if (e.metaKey || e.ctrlKey) {
            window.open(`#/buoi/${id}/attendance`, "_blank");
            return;
          }
          openPeek("lesson", id);
        }}
        onEmptySlot={(start) => applySlot(start)}
      />
    </div>
  );

  const saveBtn = write ? (
    <Button data-slot="class-save" onClick={save} disabled={(!editing && !courseId) || invalid || !days.length || locked}>
      {locked ? "Không đổi lịch" : clashN >= 5 ? "Xem trùng · không lưu" : editing ? (clashN ? `Lưu · ${clashN} trùng` : "Lưu lớp") : (clashN ? `Mở lớp · ${clashN} trùng` : "Mở lớp")}
    </Button>
  ) : undefined;

  const dialogs = (
    <>
      <ClashBlockDialog open={blockOpen} result={pending} onClose={() => setBlockOpen(false)} />
      <ClashCoverDialog
        open={coverOpen}
        result={pending}
        classId={pending?.classId || editClass?.id || ""}
        teacherId={teacherId}
        roomId={roomId}
        duration={duration}
        onDone={() => {
          setCoverOpen(false);
          const id = pending?.classId || editClass?.id;
          if (id) go("lop-detail", id);
        }}
      />
    </>
  );

  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-slot="lop-moi">
        <PageHead
          trail={[{ label: "Lớp", go: "lop" }, { label: editing ? "Sửa lớp" : "Mở lớp" }]}
          actions={saveBtn}
        />
        <div role="tablist" data-slot="lop-moi-tabs" className="grid grid-cols-2 gap-1 border-b px-3 py-1">
          <button
            type="button"
            role="tab"
            aria-selected={phonePane === "form"}
            className={cn("h-10 rounded-lg text-sm font-medium", phonePane === "form" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}
            onClick={() => setPhonePane("form")}
          >
            Biểu mẫu
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={phonePane === "cal"}
            className={cn("h-10 rounded-lg text-sm font-medium", phonePane === "cal" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}
            onClick={() => setPhonePane("cal")}
          >
            Lịch{clashN ? ` · ${clashN} trùng` : ""}
          </button>
        </div>
        {phonePane === "form" ? (
          <div className="min-h-0 flex-1 overflow-auto">{form}</div>
        ) : cal}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="lop-moi">
      <PageHead
        trail={[{ label: "Lớp", go: "lop" }, { label: editing ? "Sửa lớp" : "Mở lớp từ khóa" }]}
        actions={saveBtn}
      />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-auto border-r bg-card">{form}</aside>
        {cal}
      </div>
      {dialogs}
    </div>
  );
}

function HoldBoard({
  g, days, duration, startDate, teacherId, roomId, draftName, onJump,
}: {
  g: Graph;
  days: RecurrenceDay[];
  duration: number;
  startDate: string;
  teacherId: string;
  roomId: string;
  draftName: string;
  onJump: (ymd: string) => void;
}) {
  const room = one(g.rooms, roomId);
  const skipRoom = !room || room.type === "online";
  const tLabel = lastName(tchName(g, teacherId));
  const rLabel = rmName(g, roomId);
  return (
    <section className="space-y-2" data-slot="class-holds">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ai đang giữ GV / phòng</p>
      {days.map((d) => {
        const date = nextOnWeekday(startDate, d.weekday);
        const end = addMinutesHhmm(d.start_time, duration);
        const draftStart = `${date}T${d.start_time}:00+07:00`;
        const draftEnd = end ? `${date}T${end}:00+07:00` : draftStart;
        const holds = occupancyOnDate(g, date);
        const tHolds = holds.filter((h) => h.teacher_id === teacherId);
        const rHolds = skipRoom ? [] : holds.filter((h) => h.room_id === roomId);
        return (
          <button
            key={d.weekday}
            type="button"
            data-slot="class-hold-day"
            className="w-full rounded-lg border bg-muted/40 p-3 text-left"
            onClick={() => onJump(date)}
          >
            <p className="text-sm font-medium">
              {WD[d.weekday]} {date.slice(8, 10)}/{date.slice(5, 7)} · {d.start_time}–{end || "?"}
            </p>
            <HoldLane
              g={g}
              label={`GV ${tLabel}`}
              items={tHolds}
              draftStart={draftStart}
              draftEnd={draftEnd}
              draftName={draftName}
              otherOf={(h) => rmName(g, h.room_id)}
            />
            {skipRoom ? null : (
              <HoldLane
                g={g}
                label={rLabel}
                items={rHolds}
                draftStart={draftStart}
                draftEnd={draftEnd}
                draftName={draftName}
                otherOf={(h) => lastName(tchName(g, h.teacher_id))}
              />
            )}
          </button>
        );
      })}
    </section>
  );
}

function HoldLane({
  g, label, items, draftStart, draftEnd, draftName, otherOf,
}: {
  g: Graph;
  label: string;
  items: OccupancyHold[];
  draftStart: string;
  draftEnd: string;
  draftName: string;
  otherOf: (h: OccupancyHold) => string;
}) {
  const clash = items.filter((h) => overlapsIso(h.start, h.end, draftStart, draftEnd));
  const other = items.filter((h) => !overlapsIso(h.start, h.end, draftStart, draftEnd));
  return (
    <div className="mt-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <ul className="mt-1 space-y-0.5">
        {other.map((h) => (
          <li key={`${h.class_id}:${h.start}`} data-slot="class-hold-item" data-clash="" className="truncate text-xs text-muted-foreground">
            {fmtTime(h.start)} {clsName(g, h.class_id)} · {otherOf(h)}
          </li>
        ))}
        {clash.map((h) => (
          <li key={`${h.class_id}:${h.start}`} data-slot="class-hold-item" data-clash="1" className="truncate text-xs font-medium text-bad">
            {fmtTime(h.start)} {clsName(g, h.class_id)} · {otherOf(h)} · trùng
          </li>
        ))}
        <li data-slot="class-hold-draft" data-clash={clash.length ? "1" : ""} className={cn("truncate text-xs font-medium", clash.length ? "text-bad" : "text-foreground")}>
          {fmtTime(draftStart)} {draftName}{clash.length ? " · trùng" : " · trống"}
        </li>
      </ul>
    </div>
  );
}
