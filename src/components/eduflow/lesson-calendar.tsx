import { useEffect, useMemo, useState } from "react";
import { vi } from "date-fns/locale";
import { EventCalendar, useEventCalendarNavigation, useEventCalendarView } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { EventCalendarNav } from "@/components/reui/event-calendar/event-calendar-nav";
import type {
  CalendarEvent,
  CalendarView,
  EventCalendarOccurrence,
  EventCalendarResource,
} from "@/components/reui/event-calendar/event-calendar-types";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { clsName, fmtTime, one, pad, rmName, tchName, WD, addDays } from "@/lib/eduflow/format";
import { confirmedGuests, projectedOccupancy, useEdu } from "@/lib/eduflow/store";
import type { Graph } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Info } from "lucide-react";

const TZ = "Asia/Ho_Chi_Minh";

const PALETTE = [
  "var(--color-blue-500)",
  "var(--color-emerald-500)",
  "var(--color-violet-500)",
  "var(--color-rose-500)",
  "var(--color-amber-500)",
  "var(--color-cyan-500)",
  "var(--color-orange-500)",
  "var(--color-indigo-500)",
];

function colorOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function shortClass(g: Graph, classId: string) {
  return clsName(g, classId).split("—")[0].trim();
}

function vnKey(d: Date) {
  const shifted = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function atNoonVn(ymd: string) {
  return new Date(`${ymd}T12:00:00+07:00`);
}

function vnDow(ymd: string) {
  return new Date(atNoonVn(ymd).getTime() + 7 * 60 * 60 * 1000).getUTCDay();
}

function shiftYmd(ymd: string, days: number) {
  return vnKey(new Date(atNoonVn(ymd).getTime() + days * 86400000));
}

function vnWeekDays(ymd: string) {
  const offset = (vnDow(ymd) + 6) % 7;
  const monday = shiftYmd(ymd, -offset);
  return Array.from({ length: 7 }, (_, i) => shiftYmd(monday, i));
}

export type LessonEventData = {
  lessonId: string;
  classId?: string;
  draft?: boolean;
  projected?: boolean;
  makeup?: boolean;
  clashKind?: "teacher" | "room" | "both";
  clashNote?: string;
  status?: string;
};

type DayMarks = {
  lesson: boolean;
  makeup: boolean;
  sub: boolean;
  cancelled: boolean;
  flag: boolean;
  n: number;
};

function buildMarks(g: Graph) {
  const map = new Map<string, DayMarks>();
  const ensure = (k: string) => {
    let m = map.get(k);
    if (!m) {
      m = { lesson: false, makeup: false, sub: false, cancelled: false, flag: false, n: 0 };
      map.set(k, m);
    }
    return m;
  };
  for (const l of g.lessons) {
    const m = ensure(l.start.slice(0, 10));
    if (l.status === "cancelled") m.cancelled = true;
    else {
      m.n += 1;
      if (l.is_makeup) m.makeup = true;
      else m.lesson = true;
      if (l.substitute) m.sub = true;
    }
  }
  for (const mk of g.makeups) {
    const tgt = mk.target_lesson_id ? one(g.lessons, mk.target_lesson_id) : null;
    if (tgt) ensure(tgt.start.slice(0, 10)).makeup = true;
  }
  for (const ex of g.exceptions) {
    const les = one(g.lessons, ex.lesson_id);
    if (les) ensure(les.start.slice(0, 10)).flag = true;
  }
  return map;
}

const I18N = {
  labels: {
    today: "Hôm nay",
    previous: "Trước",
    next: "Sau",
    addEvent: "Buổi rời",
    allDay: "Cả ngày",
    more: (n: number) => `+${n} buổi`,
    noEvents: "Không có buổi",
    loading: "Đang tải",
    event: "buổi",
    events: (n: number) => `${n} buổi`,
    selectView: "Chế độ xem",
    week: (n: number) => `Tuần ${n}`,
    resources: "Phòng",
    goToDate: "Chọn ngày",
    dropNotAllowed: "Không đặt được",
    continues: "kéo dài",
    timeFrom: (t: string) => `Từ ${t}`,
    timeUntil: (t: string) => `Đến ${t}`,
    viewShortcuts: {
      month: "T",
      week: "W",
      day: "N",
      days: "5",
      agenda: "A",
      resource: "P",
    } as Record<CalendarView, string>,
    toggleDayEvents: (n: number) => `${n} buổi`,
    eventDetails: (title: string) => title,
    moreCompact: (n: number) => `+${n}`,
    timeRange: (from: string, to: string) => `${from}–${to}`,
  },
  viewNames: {
    month: "Tháng",
    week: "Tuần",
    day: "Ngày",
    days: (n: number) => `${n} ngày`,
    agenda: "Danh sách",
    resource: "Phòng",
  },
  formats: {
    monthTitle: "MMMM yyyy",
    dayTitle: "EEEE, d MMMM yyyy",
    timeGridDayHeader: "EEE d",
    timeGutter: "HH:mm",
    timeGutterMinute: "HH:mm",
    eventTime: "HH:mm",
    monthDayHeader: "EEE",
    agendaDayHeader: "EEEE d/M",
    agendaWeekday: "EEE",
  },
};

type Props = {
  g: Graph;
  activeId?: string | null;
  onLessonClick: (lessonId: string, e: React.MouseEvent) => void;
  onEmptySlot?: (start: Date, end: Date) => void;
  className?: string;
  extraEvents?: CalendarEvent<LessonEventData>[];
  clashIds?: Set<string>;
  compact?: boolean;
  lessonFilter?: (row: { teacher_id: string; room_id: string; class_id: string }) => boolean;
  defaultView?: CalendarView;
  view?: CalendarView;
  onViewChange?: (v: CalendarView) => void;
  anchorDate?: string;
  date?: string;
  onDateChange?: (ymd: string) => void;
  includeProjected?: boolean;
  resourceMode?: "room" | "teacher";
  scrollHour?: number;
};

export function LessonCalendar({
  g, activeId, onLessonClick, onEmptySlot, className,
  extraEvents, clashIds, compact, lessonFilter, defaultView, view, onViewChange,
  anchorDate, date, onDateChange, includeProjected, resourceMode, scrollHour,
}: Props) {
  const phone = useEdu((s) => s.device) === "phone";
  const openPeek = useEdu((s) => s.openPeek);
  const mode = resourceMode || "room";
  const events = useMemo<CalendarEvent<LessonEventData>[]>(() => {
    const match = (row: { teacher_id: string; room_id: string; class_id: string }) =>
      lessonFilter ? lessonFilter(row) : true;
    const draftClashDays = new Set<string>();
    for (const e of extraEvents || []) {
      if (e.data?.clashKind) draftClashDays.add(vnKey(e.start));
    }
    const taken = (lessonId: string, classId: string, start: Date) => {
      if (!clashIds?.size) return false;
      if (clashIds.has(lessonId)) return true;
      return Boolean(classId && clashIds.has(classId) && draftClashDays.has(vnKey(start)));
    };
    const existing = g.lessons
      .filter((l) => match(l))
      .map((l) => {
        const title = shortClass(g, l.class_id);
        const prefix = l.is_makeup ? "Bù · " : l.substitute ? "Hộ · " : "";
        const hit = taken(l.id, l.class_id, new Date(l.start));
        const cancelled = l.status === "cancelled";
        const done = l.status === "completed";
        return {
          id: l.id,
          title: prefix + title,
          start: new Date(l.start),
          end: new Date(l.end),
          color: cancelled
            ? "var(--color-muted-foreground)"
            : hit
              ? "var(--color-bad)"
              : l.is_makeup
                ? "var(--color-amber-500)"
                : colorOf(l.class_id),
          className: cancelled
            ? "line-through text-muted-foreground"
            : done
              ? "line-through"
              : undefined,
          resourceId: mode === "teacher" ? l.teacher_id : l.room_id,
          readOnly: true,
          draggable: false,
          resizable: false,
          data: { lessonId: l.id, classId: l.class_id, status: l.status },
        };
      });
    const projected = includeProjected
      ? projectedOccupancy(g, (date || anchorDate || g.meta.today), addDays(date || anchorDate || g.meta.today, compact ? 42 : 21))
          .filter((h) => match(h))
          .map((h) => {
            const hit = taken(h.lesson_id || "", h.class_id, new Date(h.start));
            return {
              id: `occ:${h.class_id}:${h.start.slice(0, 10)}`,
              title: shortClass(g, h.class_id),
              start: new Date(h.start),
              end: new Date(h.end),
              color: hit ? "var(--color-bad)" : colorOf(h.class_id),
              resourceId: mode === "teacher" ? h.teacher_id : h.room_id,
              readOnly: true,
              draggable: false,
              resizable: false,
              data: {
                lessonId: h.lesson_id || `occ:${h.class_id}`,
                classId: h.class_id,
                projected: true,
              },
            };
          })
      : [];
    return extraEvents?.length ? [...existing, ...projected, ...extraEvents] : [...existing, ...projected];
  }, [g, extraEvents, clashIds, lessonFilter, includeProjected, date, anchorDate, mode, compact]);

  const clashDayKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const e of extraEvents || []) {
      if (e.data?.clashKind) keys.add(vnKey(e.start));
    }
    return keys;
  }, [extraEvents]);

  const resources = useMemo<EventCalendarResource[]>(() => {
    if (mode === "teacher") {
      return g.teachers.filter((t) => t.active).map((t) => ({
        id: t.id,
        title: t.name.split(" ").slice(-1)[0] || t.name,
        color: colorOf(t.id),
      }));
    }
    return g.rooms.filter((r) => r.active).map((r) => ({
      id: r.id,
      title: r.name,
      color: colorOf(r.id),
    }));
  }, [g, mode]);

  const dateYmd = date || anchorDate || g.meta.today;
  const anchor = useMemo(() => atNoonVn(dateYmd), [dateYmd]);
  const initialView = view ?? defaultView ?? (phone ? "day" : "week");

  return (
    <EventCalendar<LessonEventData>
      key={`${phone ? "phone" : "web"}-${initialView}-${mode}`}
      className={cn("min-h-0 min-w-0 flex-1 overflow-hidden", className)}
      events={events}
      resources={resources}
      defaultView={initialView}
      view={view}
      onViewChange={onViewChange}
      defaultDate={anchor}
      date={date ? anchor : undefined}
      onDateChange={onDateChange ? (d) => onDateChange(vnKey(d)) : undefined}
      timeZone={TZ}
      locale={vi}
      weekStartsOn={1}
      dayStartHour={7}
      dayEndHour={21}
      slotDuration={30}
      snapDuration={30}
      views={phone ? (compact ? ["day", "resource", "month", "agenda"] : ["agenda", "day"]) : compact ? ["week", "day", "resource", "month"] : ["week", "day", "days", "month", "agenda", "resource"]}
      defaultDayCount={5}
      agendaDayCount={phone ? 14 : 30}
      interactions={{ drag: false, resize: false, selectSlot: !phone }}
      i18n={{
        ...I18N,
        labels: { ...I18N.labels, resources: mode === "teacher" ? "GV" : "Phòng" },
        viewNames: { ...I18N.viewNames, resource: mode === "teacher" ? "GV" : "Phòng" },
      }}
      scrollToHour={scrollHour ?? 8}
      nowIndicator
      stickyNav={!phone}
      scrollMode="contained"
      navButtonVariant="outline"
      eventTooltip={{ delay: 400 }}
      offDays={compact ? false : undefined}
      defaultViewSettings={{ weekends: true }}
      classNames={{
        content: "min-w-0 overflow-hidden",
        timeGrid: "min-w-0",
        monthView: "min-w-0",
        agendaDayHeader: phone ? "px-3 py-1.5 text-sm" : undefined,
      }}
      renderEvent={({ occurrence, view: v }) => (
        <Chip occurrence={occurrence} view={v} g={g} active={occurrence.event.id === activeId} clashIds={clashIds} clashDays={clashDayKeys} />
      )}
      dayClassName={compact ? (day) => clashDayKeys.has(vnKey(day)) ? "bg-bad-soft ring-1 ring-inset ring-bad/40" : undefined : undefined}
      renderMonthCell={compact ? ({ day, defaultContent }) => {
        const key = vnKey(day);
        const clash = clashDayKeys.has(key);
        return (
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            data-slot={clash ? "class-clash-day" : "class-month-day"}
            data-clash={clash ? "1" : undefined}
            data-day={key}
          >
            {defaultContent}
          </div>
        );
      } : undefined}
      onEventClick={(occ, e) => {
        e.stopPropagation();
        if (occ.event.data?.draft) return;
        if (occ.event.data?.projected && occ.event.data.classId) {
          openPeek("class", occ.event.data.classId);
          return;
        }
        if (e.shiftKey) {
          useEdu.getState().setModal("lesson-sched", occ.event.id);
          return;
        }
        onLessonClick(occ.event.id, e);
      }}
      onSelectSlot={(slot) => onEmptySlot?.(slot.start, slot.end)}
    >
      <div className="flex min-h-0 min-w-0 flex-1">
        {compact ? null : <DateRail g={g} activeId={activeId} onLessonClick={onLessonClick} />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {phone ? <PhoneCalNav g={g} /> : <EventCalendarNav />}
          <EventCalendarContent />
        </div>
      </div>
    </EventCalendar>
  );
}

function PhoneCalNav({ g }: { g: Graph }) {
  const { goTo } = useEventCalendarNavigation();
  const { view, setView } = useEventCalendarView();
  const marks = useMemo(() => buildMarks(g), [g]);
  const proto = g.meta.today;
  const [picked, setPicked] = useState(proto);
  const days = useMemo(() => vnWeekDays(picked), [picked]);

  function pick(ymd: string) {
    setPicked(ymd);
    goTo(atNoonVn(ymd));
  }

  return (
    <div className="shrink-0 border-b pb-1">
      <div className="flex items-center gap-1 px-1 pt-1">
        <Button
          variant={picked === proto ? "secondary" : "outline"}
          size="sm"
          className="h-10"
          onClick={() => pick(proto)}
        >
          Hôm nay
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10"
          aria-label="Tuần trước"
          onClick={() => pick(shiftYmd(days[0], -7))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-10"
          aria-label="Tuần sau"
          onClick={() => pick(shiftYmd(days[0], 7))}
        >
          <ChevronRight className="size-4" />
        </Button>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as CalendarView); }}
          className="ml-auto"
        >
          <ToggleGroupItem value="day" className="h-10 px-2.5 text-xs">Ngày</ToggleGroupItem>
          <ToggleGroupItem value="agenda" className="h-10 px-2.5 text-xs">Danh sách</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {view === "month" ? null : (
      <div data-slot="phone-date-strip" className="flex px-1 pt-1">
        {days.map((ymd) => {
          const m = marks.get(ymd);
          const on = ymd === picked;
          const isToday = ymd === proto;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => pick(ymd)}
              className={cn(
                "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center rounded-lg py-1",
                on && "bg-foreground text-background",
                !on && isToday && "ring-1 ring-foreground/30",
              )}
            >
              <span className={cn("text-xs", on ? "opacity-80" : "text-muted-foreground")}>{WD[vnDow(ymd)]}</span>
              <span className="text-sm font-semibold tabular-nums leading-none">{Number(ymd.slice(8, 10))}</span>
              <DayDots m={m} />
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}

function DateRail({
  g,
  activeId,
  onLessonClick,
}: {
  g: Graph;
  activeId?: string | null;
  onLessonClick: (lessonId: string, e: React.MouseEvent) => void;
}) {
  const device = useEdu((s) => s.device);
  const { date, goTo, activeRange } = useEventCalendarNavigation();
  const marks = useMemo(() => buildMarks(g), [g]);
  const protoToday = useMemo(() => atNoonVn(g.meta.today), [g.meta.today]);
  const selectedKey = vnKey(date);
  const [month, setMonth] = useState(date);

  useEffect(() => {
    setMonth(date);
  }, [date]);

  const inView = useMemo(() => {
    const keys = new Set<string>();
    for (let t = activeRange.start.getTime(); t < activeRange.end.getTime(); t += 24 * 60 * 60 * 1000) {
      keys.add(vnKey(new Date(t)));
    }
    return keys;
  }, [activeRange]);

  const dayLessons = useMemo(
    () => g.lessons.filter((l) => l.start.slice(0, 10) === selectedKey).sort((a, b) => a.start.localeCompare(b.start)),
    [g.lessons, selectedKey],
  );

  if (device === "phone") return null;

  return (
    <aside data-slot="date-rail" className="flex w-72 min-w-72 shrink-0 flex-col overflow-hidden border-r pr-3">
      <div className="mb-2 flex items-center gap-0.5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lịch tháng</p>
        <Tooltip delayDuration={0} disableHoverableContent>
          <TooltipTrigger asChild>
            <button
              type="button"
              data-slot="cal-legend-info"
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Chú thích lịch"
            >
              <Info className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="flex-col items-start gap-1.5 p-3">
            <p className="font-medium">Chú thích</p>
            <ul data-slot="cal-legend" className="space-y-1.5">
              <LegendDot className="bg-background" label="Buổi" />
              <LegendDot className="bg-amber-400" label="Học bù" />
              <LegendDot className="bg-violet-400" label="Dạy hộ" />
              <LegendDot className="bg-red-400" label="Cờ (học phí / chờ PH)" />
              <LegendDot className="bg-background" label="Đã đóng" labelClassName="line-through" />
              <LegendDot className="bg-background/40 ring-1 ring-background/50" label="Đã hủy" labelClassName="line-through opacity-80" />
              <li className="flex items-center gap-2">
                <span className="w-1.5 text-center text-xs font-semibold">+</span>
                Còn loại khác
              </li>
            </ul>
          </TooltipContent>
        </Tooltip>
      </div>
      <Calendar
        mode="single"
        locale={vi}
        weekStartsOn={1}
        today={protoToday}
        selected={atNoonVn(selectedKey)}
        month={month}
        onMonthChange={setMonth}
        onSelect={(d) => {
          if (!d) return;
          goTo(atNoonVn(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`));
        }}
        fixedWeeks
        showOutsideDays={false}
        formatters={{
          formatWeekdayName: (d) => WD[d.getDay()],
        }}
        className="w-full min-w-0 p-0 [--cell-size:--spacing(8)]"
        classNames={{
          root: "w-full min-w-0",
          month: "w-full",
          month_grid: "w-full table-fixed",
          weekdays: "flex w-full",
          weekday: "min-w-0 flex-1 p-0 text-center text-xs",
          week: "mt-1 flex w-full",
          day: "min-w-0 flex-1 p-0",
        }}
        modifiers={{
          inView: (d) => inView.has(vnKey(d)),
          hasData: (d) => (marks.get(vnKey(d))?.n ?? 0) > 0,
        }}
        modifiersClassNames={{
          inView: "bg-muted/70",
        }}
        components={{
          DayButton: (props) => {
            const key = vnKey(props.day.date);
            const m = marks.get(key);
            const tip = markTip(m);
            const btn = (
              <CalendarDayButton
                {...props}
                className={cn(
                  "min-w-0 gap-0.5 font-medium data-[selected-single=true]:bg-foreground data-[selected-single=true]:text-background [&>span]:opacity-100",
                  m?.n ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {props.children}
                <DayDots m={m} />
              </CalendarDayButton>
            );
            if (!tip) return btn;
            return (
              <Tooltip>
                <TooltipTrigger asChild>{btn}</TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {tip}
                </TooltipContent>
              </Tooltip>
            );
          },
        }}
      />
      <div className="mt-4 min-h-0 flex-1 overflow-auto border-t pt-3">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {selectedKey.slice(8, 10)}/{selectedKey.slice(5, 7)} · {dayLessons.length} buổi
        </p>
        {dayLessons.length === 0 ? (
          <p className="text-xs text-muted-foreground">Không có buổi.</p>
        ) : (
          <ul className="space-y-1">
            {dayLessons.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  data-slot={l.status === "cancelled" ? "rail-cancelled" : l.status === "completed" ? "rail-done" : "rail-lesson"}
                  data-status={l.status}
                  onClick={(e) => onLessonClick(l.id, e)}
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left hover:bg-muted",
                    l.id === activeId && "bg-muted",
                    (l.status === "cancelled" || l.status === "completed") && "line-through",
                    l.status === "cancelled" && "text-muted-foreground",
                  )}
                >
                  <span className="block truncate text-xs font-medium">
                    {l.is_makeup ? "Bù · " : l.substitute ? "Hộ · " : ""}
                    {shortClass(g, l.class_id)}
                    {confirmedGuests(g, l.id).length ? ` · Bù ${confirmedGuests(g, l.id).length}` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {fmtTime(l.start)} · {rmName(g, l.room_id)}
                    {l.status === "cancelled" ? " · hủy" : l.status === "completed" ? " · xong" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

function markKinds(m: DayMarks) {
  const kinds: Array<{ cls: string; label: string }> = [];
  if (m.flag) kinds.push({ cls: "bg-red-400", label: "Cờ" });
  if (m.makeup) kinds.push({ cls: "bg-amber-400", label: "Học bù" });
  if (m.sub) kinds.push({ cls: "bg-violet-400", label: "Dạy hộ" });
  if (m.lesson) kinds.push({ cls: "bg-current", label: "Buổi" });
  if (m.cancelled && !m.lesson && !m.makeup) kinds.push({ cls: "bg-muted-foreground/50", label: "Đã hủy" });
  return kinds;
}

function markTip(m?: DayMarks) {
  if (!m) return "";
  const parts: string[] = [];
  if (m.n) parts.push(`${m.n} buổi`);
  for (const k of markKinds(m)) {
    if (k.label !== "Buổi") parts.push(k.label);
  }
  if (m.cancelled && m.lesson) parts.push("có hủy");
  return parts.join(" · ");
}

function DayDots({ m }: { m?: DayMarks }) {
  if (!m) return <span className="flex h-3 justify-center" />;
  const kinds = markKinds(m);
  if (!kinds.length) return <span className="flex h-3 justify-center" />;
  const shown = kinds.slice(0, 2);
  const extra = kinds.length - shown.length;
  return (
    <span className="flex h-3 items-center justify-center gap-0.5">
      {shown.map((k) => (
        <i key={k.label} className={cn("size-1.5 shrink-0 rounded-full", k.cls)} />
      ))}
      {extra > 0 ? (
        <span className="text-xs leading-none font-semibold opacity-80">+{extra}</span>
      ) : shown.length === 1 && m.n > 1 ? (
        <span className="text-xs leading-none tabular-nums opacity-70">{m.n}</span>
      ) : null}
    </span>
  );
}

function LegendDot({ className, label, labelClassName }: { className: string; label: string; labelClassName?: string }) {
  return (
    <li className="flex items-center gap-2">
      <i className={cn("size-1.5 rounded-full", className)} />
      <span className={labelClassName}>{label}</span>
    </li>
  );
}

function Chip({
  occurrence,
  view,
  g,
  active,
  clashIds,
  clashDays,
}: {
  occurrence: EventCalendarOccurrence<LessonEventData>;
  view: CalendarView;
  g: Graph;
  active: boolean;
  clashIds?: Set<string>;
  clashDays?: Set<string>;
}) {
  const draft = occurrence.event.data?.draft;
  const makeupDraft = occurrence.event.data?.makeup;
  const kind = occurrence.event.data?.clashKind;
  const classId = occurrence.event.data?.classId;
  const status = occurrence.event.data?.status;
  const les = draft || occurrence.event.data?.projected ? undefined : g.lessons.find((l) => l.id === occurrence.event.id);
  const cancelled = status === "cancelled" || les?.status === "cancelled";
  const done = status === "completed" || les?.status === "completed";
  const room = les ? rmName(g, les.room_id) : occurrence.event.data?.projected && classId
    ? rmName(g, one(g.classes, classId)?.default_room_id || "")
    : "";
  const teacher = les ? tchName(g, les.teacher_id) : occurrence.event.data?.projected && classId
    ? tchName(g, one(g.classes, classId)?.default_teacher_id || "")
    : "";
  const compact = view === "month" || view === "agenda";
  const nBù = les ? confirmedGuests(g, les.id).length : 0;
  const onClashDay = clashDays?.has(vnKey(occurrence.event.start));
  const taken = !draft && !cancelled && Boolean(
    clashIds && (clashIds.has(occurrence.event.id) || (classId && clashIds.has(classId) && onClashDay)),
  );
  const clashLabel = kind === "teacher" ? "Trùng GV" : kind === "room" ? "Trùng phòng" : kind === "both" ? "Trùng GV+phòng" : makeupDraft ? "Học bù" : "Nháp";
  return (
    <span
      className={cn("flex min-w-0 flex-1 flex-col leading-tight", active && "font-semibold")}
      data-status={cancelled ? "cancelled" : done ? "completed" : status || les?.status}
      data-slot={cancelled ? "lesson-cancelled" : done ? "lesson-done" : undefined}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span className="min-w-0 truncate">{occurrence.event.title}</span>
        {draft ? (
          <span
            data-slot={makeupDraft ? "makeup-draft" : "class-draft"}
            data-clash={kind || undefined}
            className={cn(
              "shrink-0 rounded-sm px-1 py-px text-xs font-semibold leading-none",
              kind ? "bg-bad-soft text-bad" : makeupDraft ? "bg-warn-soft text-warn" : "bg-background text-foreground",
            )}
          >
            {clashLabel}
          </span>
        ) : taken ? (
          <span data-slot="class-taken" className="shrink-0 rounded-sm bg-bad-soft px-1 py-px text-xs font-semibold leading-none text-bad">
            trùng
          </span>
        ) : nBù > 0 ? (
          <span
            data-slot="makeup-badge"
            className="shrink-0 rounded-sm bg-background px-1 py-px text-xs font-semibold leading-none text-foreground"
          >
            Bù {nBù}
          </span>
        ) : null}
      </span>
      {compact ? null : draft ? (
        <span className="truncate text-xs opacity-80">{occurrence.event.data?.clashNote || "Lớp đang mở"}</span>
      ) : (
        <span className="truncate text-xs opacity-80">
          {room}
          {teacher ? ` · ${teacher}` : ""}
        </span>
      )}
    </span>
  );
}
