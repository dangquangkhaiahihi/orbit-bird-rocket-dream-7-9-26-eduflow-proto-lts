import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DURATION_MINS, TIME_SLOTS, addMinutesHhmm, clsName, dateToVn, fmtDay, fmtTime, one, rmName, stuName, tchName,
} from "@/lib/eduflow/format";
import { canSend } from "@/lib/eduflow/roles";
import { clashNote, openAbsents, slotClash, useEdu } from "@/lib/eduflow/store";
import type { AbsentDeduct, MakeupGuestPick } from "@/lib/eduflow/types";
import type { CalendarEvent, CalendarView } from "@/components/reui/event-calendar/event-calendar-types";
import { cn } from "@/lib/utils";
import { PageHead, Person, StatusChip } from "./atoms";
import { DataTable } from "./data-table";
import { LessonCalendar, type LessonEventData } from "./lesson-calendar";
import { TableStage } from "./inspector";

function TimeSelect({ value, onChange, duration }: { value: string; onChange: (v: string) => void; duration: number }) {
  const slots = TIME_SLOTS.filter((t) => !!addMinutesHhmm(t, duration));
  const v = slots.includes(value) ? value : slots[0] || "18:00";
  return (
    <Select value={v} onValueChange={onChange}>
      <SelectTrigger className="w-full min-h-11" data-slot="makeup-time"><SelectValue /></SelectTrigger>
      <SelectContent>
        {slots.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function AbsentDeductField({
  value, onChange,
}: {
  value: AbsentDeduct;
  onChange: (v: AbsentDeduct) => void;
}) {
  return (
    <div className="space-y-1.5" data-slot="absent-deduct">
      <Label>Vắng mặt</Label>
      <ToggleGroup type="single" value={value} onValueChange={(v) => { if (v) onChange(v as AbsentDeduct); }} className="flex flex-wrap justify-start gap-1">
        <ToggleGroupItem value="always" variant="outline" className="h-11 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Vắng vẫn trừ</ToggleGroupItem>
        <ToggleGroupItem value="on_makeup" variant="outline" className="h-11 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">Trừ khi học bù</ToggleGroupItem>
      </ToggleGroup>
      <p className="text-xs text-muted-foreground" data-slot="absent-deduct-hint">
        {value === "always" ? "Buổi vắng vẫn trừ 1. Học bù không trừ thêm." : "Vắng chưa trừ. Trừ 1 buổi khi học sinh có mặt buổi học bù."}
      </p>
    </div>
  );
}

type CalView = Extract<CalendarView, "day" | "week" | "resource" | "month">;
type CalFilter = "all" | "teacher" | "room";

function keyOf(p: MakeupGuestPick) {
  return `${p.student_id}:${p.source_lesson_id}`;
}

export function MakeupCreatePage() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const phone = useEdu((s) => s.device) === "phone";
  const pick = useEdu((s) => s.makeupPick);
  const slot = useEdu((s) => s.makeupSlot);
  const routeId = useEdu((s) => s.route.id);
  const createMakeupLesson = useEdu((s) => s.createMakeupLesson);
  const openPeek = useEdu((s) => s.openPeek);
  const write = canSend(role);
  const today = g.meta.today;
  const open = useMemo(() => openAbsents(g).filter((c) => c.status === "need_makeup" || c.status === "draft" || c.status === "declined"), [g]);

  const boot = useMemo(() => {
    const fromPick = pick.map(keyOf);
    const fromLesson = routeId
      ? open.filter((c) => c.lesson_id === routeId).map((c) => keyOf({ student_id: c.student_id, source_lesson_id: c.lesson_id }))
      : [];
    const next = fromPick.length ? fromPick : fromLesson;
    const first = (next[0] && open.find((c) => keyOf({ student_id: c.student_id, source_lesson_id: c.lesson_id }) === next[0])) || open[0];
    const cls = first ? one(g.classes, first.class_id) : one(g.classes, g.classes[0]?.id || "");
    return {
      selected: next,
      host: cls?.id || g.classes[0]?.id || "",
      tch: cls?.default_teacher_id || g.teachers[0]?.id || "",
      rm: cls?.default_room_id || g.rooms[0]?.id || "",
      duration: cls?.recurrence.duration_min || 90,
      date: slot?.date || today,
      hhmm: slot?.hhmm || "18:00",
    };
  }, []);

  const [host, setHost] = useState(boot.host);
  const [tch, setTch] = useState(boot.tch);
  const [rm, setRm] = useState(boot.rm);
  const [date, setDate] = useState(boot.date);
  const [hhmm, setHhmm] = useState(boot.hhmm);
  const [duration, setDuration] = useState(boot.duration);
  const [selected, setSelected] = useState<string[]>(boot.selected);
  const [calView, setCalView] = useState<CalView>(phone ? "day" : "week");
  const [calFilter, setCalFilter] = useState<CalFilter>("all");
  const [resourceMode, setResourceMode] = useState<"room" | "teacher">("room");
  const [phonePane, setPhonePane] = useState<"form" | "cal">("form");

  useEffect(() => {
    const fromPick = pick.map(keyOf);
    const fromLesson = routeId
      ? open.filter((c) => c.lesson_id === routeId).map((c) => keyOf({ student_id: c.student_id, source_lesson_id: c.lesson_id }))
      : [];
    const next = fromPick.length ? fromPick : fromLesson;
    if (next.length) setSelected(next);
    if (slot?.date) setDate(slot.date);
    if (slot?.hhmm) setHhmm(slot.hhmm);
    const first = (next[0] && open.find((c) => keyOf({ student_id: c.student_id, source_lesson_id: c.lesson_id }) === next[0])) || open[0];
    if (first) {
      const cls = one(g.classes, first.class_id);
      if (cls) {
        setHost(cls.id);
        setTch(cls.default_teacher_id);
        setRm(cls.default_room_id);
        setDuration(cls.recurrence.duration_min || 90);
      }
    }
  }, [routeId, pick, slot]);

  const guests: MakeupGuestPick[] = selected.map((k) => {
    const [student_id, source_lesson_id] = k.split(":");
    return { student_id, source_lesson_id };
  }).filter((p) => p.student_id && p.source_lesson_id);

  const startIso = `${date}T${hhmm}:00+07:00`;
  const endHhmm = addMinutesHhmm(hhmm, duration);
  const endIso = endHhmm ? `${date}T${endHhmm}:00+07:00` : startIso;
  const hit = slotClash(g, tch, rm, startIso, endIso);
  const clashIds = useMemo(() => {
    const s = new Set<string>();
    if (!hit.kind) return s;
    for (const p of [...hit.teacher, ...hit.room]) {
      if (p.lesson_id) s.add(p.lesson_id);
      s.add(p.class_id);
    }
    return s;
  }, [hit]);

  const extraEvents = useMemo<CalendarEvent<LessonEventData>[]>(() => {
    if (!endHhmm) return [];
    const note = hit.kind ? clashNote(g, hit) : `${rmName(g, rm)} · ${tchName(g, tch)} · ${guests.length} HS`;
    return [{
      id: "draft:makeup",
      title: guests.length ? `Học bù · ${guests.length} HS` : "Học bù",
      start: new Date(startIso),
      end: new Date(endIso),
      color: hit.kind ? "var(--color-bad)" : "var(--color-amber-500)",
      resourceId: resourceMode === "teacher" ? tch : rm,
      readOnly: true,
      draggable: false,
      resizable: false,
      priority: 40,
      zIndex: 30,
      data: {
        lessonId: "draft:makeup",
        classId: host || "draft",
        draft: true,
        makeup: true,
        clashKind: hit.kind || undefined,
        clashNote: note,
      },
    }];
  }, [g, startIso, endIso, hit.kind, tch, rm, guests.length, resourceMode, host, endHhmm]);

  function toggleGuest(k: string, on: boolean) {
    setSelected((prev) => {
      const next = on ? (prev.includes(k) ? prev : [...prev, k]) : prev.filter((x) => x !== k);
      if (on && !host) {
        const c = open.find((x) => keyOf({ student_id: x.student_id, source_lesson_id: x.lesson_id }) === k);
        if (c) {
          const cls = one(g.classes, c.class_id);
          if (cls) {
            setHost(cls.id);
            setTch(cls.default_teacher_id);
            setRm(cls.default_room_id);
          }
        }
      }
      return next;
    });
  }

  function applySlot(start: Date) {
    const v = dateToVn(start);
    setDate(v.ymd);
    setHhmm(v.hhmm);
    if (phone) setPhonePane("form");
  }

  function save() {
    if (!write || !endHhmm || hit.kind) return;
    createMakeupLesson({
      class_id: host,
      teacher_id: tch,
      room_id: rm,
      start: `${date}T${hhmm}`,
      duration_min: duration,
      guests,
    });
  }

  const form = (
    <div className={cn("space-y-4", phone ? "p-3" : "p-5")} data-slot="makeup-form">
      <section className="space-y-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Buổi học bù rời</p>
        <div className="space-y-1.5">
          <Label>Lớp chủ</Label>
          <Select value={host} onValueChange={(id) => {
            setHost(id);
            const cls = one(g.classes, id);
            if (cls) {
              setTch(cls.default_teacher_id);
              setRm(cls.default_room_id);
              setDuration(cls.recurrence.duration_min || duration);
            }
          }}>
            <SelectTrigger className="w-full min-h-11" data-slot="makeup-host"><SelectValue /></SelectTrigger>
            <SelectContent>{g.classes.filter((c) => c.active).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label>Giáo viên</Label>
            <Select value={tch} onValueChange={setTch}><SelectTrigger className="w-full min-h-11"><SelectValue /></SelectTrigger><SelectContent>{g.teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="space-y-1.5">
            <Label>Phòng</Label>
            <Select value={rm} onValueChange={setRm}><SelectTrigger className="w-full min-h-11"><SelectValue /></SelectTrigger><SelectContent>{g.rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name} · {r.type}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="mk-date">Ngày</Label>
            <Input id="mk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11" />
          </div>
          <div className="space-y-1.5">
            <Label>Giờ bắt đầu</Label>
            <TimeSelect value={hhmm} duration={duration} onChange={setHhmm} />
          </div>
          <div className="space-y-1.5">
            <Label>Thời lượng</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger className="w-full min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>{DURATION_MINS.map((m) => <SelectItem key={m} value={String(m)}>{m} phút</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{fmtDay(startIso)} {fmtTime(startIso)} → {endHhmm || "quá ngày"}</p>
      </section>
      <Separator />
      <section className="space-y-2" data-slot="makeup-guests-pick">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học sinh vắng · {guests.length} chọn</p>
        {open.length ? open.map((c) => {
          const k = keyOf({ student_id: c.student_id, source_lesson_id: c.lesson_id });
          const on = selected.includes(k);
          return (
            <label key={c.id} data-slot="makeup-guest" className="flex min-h-11 items-start gap-2.5 rounded-lg border px-3 py-2">
              <Checkbox checked={on} onCheckedChange={(v) => toggleGuest(k, v === true)} className="mt-1" />
              <Person name={stuName(g, c.student_id)} sub={`${clsName(g, c.class_id).split("—")[0].trim()} · ${fmtDay(c.start)}${c.reason ? ` · ${c.reason}` : ""}`} />
            </label>
          );
        }) : <p className="text-sm text-muted-foreground">Không còn ca vắng cần xếp.</p>}
      </section>
      <Alert data-slot="makeup-clash" className={hit.kind ? "border-bad/30 bg-bad-soft" : undefined}>
        <AlertTitle>{hit.kind ? "Trùng lịch" : "Không trùng"}</AlertTitle>
        <AlertDescription>
          {hit.kind ? clashNote(g, hit) : "Nháp buổi học bù hiện cam trên lịch. Trùng thì không mở được."}
        </AlertDescription>
      </Alert>
    </div>
  );

  const cal = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="makeup-draft-cal">
      <div className={cn("flex flex-wrap items-center gap-2 border-b", phone ? "px-3 py-2" : "px-4 py-2")}>
        <ToggleGroup type="single" value={calView} onValueChange={(v) => { if (!v) return; setCalView(v as CalView); if (v === "resource") setResourceMode("room"); }} className="justify-start">
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
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-warn" /> Học bù</li>
          <li className="flex items-center gap-1.5"><i className="size-2 rounded-sm bg-bad" /> Trùng</li>
        </ul>
      </div>
      <LessonCalendar
        g={g}
        compact
        view={calView}
        onViewChange={(v) => { if (v === "day" || v === "week" || v === "resource" || v === "month") setCalView(v); }}
        date={date}
        onDateChange={setDate}
        includeProjected
        resourceMode={calView === "resource" ? resourceMode : "room"}
        scrollHour={Math.max(7, Number(hhmm.slice(0, 2)) - 1)}
        extraEvents={extraEvents}
        clashIds={clashIds}
        lessonFilter={
          calView === "resource" || calFilter === "all" ? undefined
            : calFilter === "teacher" ? (l) => l.teacher_id === tch
              : (l) => l.room_id === rm
        }
        onLessonClick={(id, e) => {
          if (e.metaKey || e.ctrlKey) { window.open(`#/buoi/${id}/attendance`, "_blank"); return; }
          openPeek("lesson", id);
        }}
        onEmptySlot={(start) => applySlot(start)}
      />
    </div>
  );

  const saveBtn = write ? (
    <Button data-slot="makeup-save" onClick={save} disabled={!guests.length || !endHhmm || !!hit.kind || !host}>
      {hit.kind ? "Trùng — không mở" : `Mở buổi học bù · ${guests.length} HS`}
    </Button>
  ) : undefined;

  if (phone) {
    return (
      <div className="flex min-h-0 flex-1 flex-col" data-slot="buoi-bu">
        <PageHead trail={[{ label: "Vắng", go: "vang" }, { label: "Buổi học bù" }]} actions={saveBtn} />
        <div role="tablist" className="grid grid-cols-2 gap-1 border-b px-3 py-1">
          <button type="button" role="tab" aria-selected={phonePane === "form"} className={cn("h-10 rounded-lg text-sm font-medium", phonePane === "form" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")} onClick={() => setPhonePane("form")}>Biểu mẫu</button>
          <button type="button" role="tab" aria-selected={phonePane === "cal"} className={cn("h-10 rounded-lg text-sm font-medium", phonePane === "cal" ? "bg-foreground text-background" : "bg-muted text-muted-foreground")} onClick={() => setPhonePane("cal")}>Lịch{hit.kind ? " · trùng" : ""}</button>
        </div>
        {phonePane === "form" ? <div className="min-h-0 flex-1 overflow-auto">{form}</div> : cal}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="buoi-bu">
      <PageHead trail={[{ label: "Vắng", go: "vang" }, { label: "Buổi học bù rời" }]} actions={saveBtn} />
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside className="flex w-[22rem] shrink-0 flex-col overflow-auto border-r bg-card">{form}</aside>
        {cal}
      </div>
    </div>
  );
}

type VangRow = {
  id: string;
  name: string;
  className: string;
  day: string;
  reason: string;
  status: string;
  student_id: string;
  lesson_id: string;
  class_id: string;
};

export function VangPage() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const phone = useEdu((s) => s.device) === "phone";
  const startMakeup = useEdu((s) => s.startMakeup);
  const ignoreAbsent = useEdu((s) => s.ignoreAbsent);
  const unignoreAbsent = useEdu((s) => s.unignoreAbsent);
  const write = canSend(role);
  const cases = useMemo(() => openAbsents(g), [g]);
  const rows: VangRow[] = useMemo(() => cases.map((c) => ({
    id: c.id,
    name: stuName(g, c.student_id),
    className: clsName(g, c.class_id).split("—")[0].trim(),
    day: `${fmtDay(c.start)} ${fmtTime(c.start)}`,
    reason: c.reason || "vắng",
    status: c.status,
    student_id: c.student_id,
    lesson_id: c.lesson_id,
    class_id: c.class_id,
  })), [g, cases]);
  const nNeed = rows.filter((r) => r.status === "need_makeup" || r.status === "draft" || r.status === "declined").length;
  const nWait = rows.filter((r) => r.status === "waiting_parent").length;
  const nOk = rows.filter((r) => r.status === "confirmed").length;
  const nIgn = rows.filter((r) => r.status === "ignored").length;
  const openN = nNeed;
  const cols: ColumnDef<VangRow>[] = [
    { accessorKey: "name", header: "Học sinh", cell: ({ row }) => <Person name={row.original.name} sub={row.original.reason} /> },
    { accessorKey: "className", header: "Lớp" },
    { accessorKey: "day", header: "Buổi vắng" },
    { accessorKey: "status", header: "Trạng thái", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "reason", header: "Lý do" },
    {
      id: "act",
      header: "",
      enableSorting: false,
      cell: ({ row }) => {
        const r = row.original;
        if (!write) return null;
        return (
          <div className="flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}>
            {r.status === "ignored" ? (
              <Button size="sm" variant="outline" data-slot="vang-undo" onClick={() => unignoreAbsent(r.student_id, r.lesson_id)}>Mở lại</Button>
            ) : r.status === "need_makeup" || r.status === "draft" || r.status === "declined" ? (
              <>
                <Button size="sm" data-slot="vang-make" onClick={() => startMakeup([{ student_id: r.student_id, source_lesson_id: r.lesson_id }])}>Xếp bù</Button>
                <Button size="sm" variant="ghost" data-slot="vang-ignore" onClick={() => ignoreAbsent(r.student_id, r.lesson_id)}>Bỏ qua</Button>
              </>
            ) : (
              <Button size="sm" variant="outline" onClick={() => go("buoi-detail", r.lesson_id, { tab: "makeup" })}>Xem</Button>
            )}
          </div>
        );
      },
    },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="vang">
      <PageHead
        trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Vắng" }]}
        actions={write ? <Button data-slot="vang-create" onClick={() => startMakeup(openAbsents(g).filter((c) => c.status === "need_makeup").map((c) => ({ student_id: c.student_id, source_lesson_id: c.lesson_id })))} disabled={!openN}>Xếp buổi rời</Button> : undefined}
      />
      <p className={cn("shrink-0 border-b py-2 text-sm text-muted-foreground", phone ? "px-3" : "px-5")} data-slot="vang-summary">
        {nNeed} cần xếp · {nWait} chờ PH · {nOk} đã nhận{nIgn ? ` · ${nIgn} bỏ qua` : ""}
      </p>
      <TableStage>
        <DataTable
          screen="vang"
          columns={cols}
          data={rows}
          getRowId={(r) => r.id}
          searchPlaceholder="Tìm học sinh vắng"
          facets={[
            { id: "status", label: "Trạng thái", options: [
              { value: "need_makeup", label: "cần xếp" },
              { value: "draft", label: "nháp" },
              { value: "waiting_parent", label: "chờ PH" },
              { value: "confirmed", label: "đã nhận" },
              { value: "declined", label: "từ chối" },
              { value: "ignored", label: "bỏ qua" },
            ] },
            { id: "className", label: "Lớp", options: [...new Set(rows.map((r) => r.className))].map((n) => ({ value: n, label: n })) },
          ]}
          onRowClick={(row) => go("buoi-detail", row.lesson_id, { tab: "makeup" })}
        />
      </TableStage>
    </div>
  );
}
