import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DUP_VN, WD_LONG, minutesOf, needsDecision, reviewPending } from "@/lib/eduflow/ingest-review";
import type { ConflictAction, ConflictDim, DupAction, DuplicateHit, ScheduleConflict, TimeSuggestion } from "@/lib/eduflow/ingest";
import { useEdu } from "@/lib/eduflow/store";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, CalendarClock, Check, DoorOpen, GitMerge, Shield, Users } from "lucide-react";

const DUP_OPTS: DupAction[] = ["keep", "overwrite", "merge", "create"];

function DimBadge({ dim }: { dim: ConflictDim }) {
  const map: Record<ConflictDim, { label: string; className: string }> = {
    teacher: { label: "Giáo viên", className: "border-warn/30 bg-warn-soft text-warn" },
    room: { label: "Phòng", className: "border-bad/30 bg-bad-soft text-bad" },
    student: { label: "Học sinh", className: "border-wait/30 bg-wait-soft text-wait" },
  };
  const m = map[dim];
  return <Badge variant="outline" className={m.className}>{m.label}</Badge>;
}

function ActionPick({
  value,
  onChange,
  options,
}: {
  value: DupAction | null;
  onChange: (v: DupAction) => void;
  options: DupAction[];
}) {
  return (
    <div role="radiogroup" className="grid gap-1.5" data-slot="dup-actions">
      {options.map((id) => {
        const on = value === id;
        const meta = DUP_VN[id];
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            data-slot="dup-action"
            data-action={id}
            onClick={() => onChange(id)}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
              on ? "border-foreground bg-muted" : "hover:bg-muted/50",
            )}
          >
            <span className={cn("mt-1 size-3.5 shrink-0 rounded-full border", on ? "border-foreground bg-foreground" : "border-muted-foreground")} />
            <span>
              <span className="font-medium">{meta.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{meta.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DiffGrid({ hit }: { hit: DuplicateHit }) {
  return (
    <div className="overflow-hidden rounded-lg border" data-slot="dup-diff">
      <div className="grid grid-cols-2 border-b bg-muted/50 text-[0.7rem] font-medium tracking-wide text-muted-foreground uppercase">
        <div className="px-3 py-1.5">Sổ chính</div>
        <div className="border-l px-3 py-1.5">Hàng nhập</div>
      </div>
      {hit.diffs.map((d) => (
        <div key={d.field} className={cn("grid grid-cols-2 text-sm", d.changed && "bg-warn-soft/40")}>
          <div className="px-3 py-1.5">
            <p className="text-[0.7rem] text-muted-foreground">{d.label}</p>
            <p className="truncate">{d.existing}</p>
          </div>
          <div className="border-l px-3 py-1.5">
            <p className="text-[0.7rem] text-muted-foreground">{d.label}</p>
            <p className={cn("truncate", d.changed && "font-medium")}>
              {d.incoming}
              {d.changed ? <Badge variant="outline" className="ml-1.5 border-warn/30 bg-warn-soft text-warn">mới</Badge> : null}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function DupCard({ hit }: { hit: DuplicateHit }) {
  const resolveDuplicate = useEdu((s) => s.resolveDuplicate);
  return (
    <Card className="max-w-3xl" data-slot="dup-card" data-kind={hit.kind} data-id={hit.id} data-resolved={hit.action ? "1" : "0"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warn" />
          Trùng {hit.kind === "student" ? "học sinh" : "lớp"}
          {hit.row ? <span className="font-sans text-xs font-normal text-muted-foreground">Hàng {hit.row}</span> : null}
        </CardTitle>
        <CardDescription className="font-medium text-foreground">{hit.title}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <DiffGrid hit={hit} />
        <ActionPick value={hit.action} onChange={(v) => resolveDuplicate(hit.id, v)} options={DUP_OPTS} />
      </CardContent>
    </Card>
  );
}

function laneWindow(c: ScheduleConflict) {
  const times = [c.incomingStart, c.incomingEnd, c.existingStart, c.existingEnd].map(minutesOf);
  const min = Math.min(...times);
  const max = Math.max(...times);
  const pad = 30;
  const start = Math.max(7 * 60, min - pad);
  const end = Math.max(start + 90, max + pad);
  return { start, span: end - start };
}

function Block({
  label,
  start,
  end,
  win,
  tone,
}: {
  label: string;
  start: string;
  end: string;
  win: { start: number; span: number };
  tone: "existing" | "incoming";
}) {
  const a = minutesOf(start);
  const b = minutesOf(end);
  const left = ((a - win.start) / win.span) * 100;
  const width = Math.max(((b - a) / win.span) * 100, 8);
  return (
    <div className="relative h-9">
      <div
        className={cn(
          "absolute top-0 flex h-9 items-center overflow-hidden rounded-md border px-2 text-xs font-medium",
          tone === "existing" ? "border-border bg-muted text-muted-foreground" : "border-bad/40 bg-bad-soft text-bad",
        )}
        style={{ left: `${left}%`, width: `${width}%` }}
      >
        <span className="truncate">{label}</span>
      </div>
    </div>
  );
}

function ConflictCard({ hit }: { hit: ScheduleConflict }) {
  const resolveConflict = useEdu((s) => s.resolveConflict);
  const win = useMemo(() => laneWindow(hit), [hit]);
  const [roomPick, setRoomPick] = useState(hit.roomId || hit.suggestRoom?.id || "");

  function pick(action: ConflictAction, roomId?: string) {
    resolveConflict(hit.id, action, roomId);
  }

  return (
    <Card className="max-w-3xl" data-slot="conflict-card" data-id={hit.id} data-resolved={hit.action ? "1" : "0"}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <CalendarClock className="size-4 text-bad" />
          Lệch lịch
        </CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground">{hit.incomingClassName}</span>
          {" chồng "}
          <span className="font-medium text-foreground">{hit.existingClassName}</span>
        </CardDescription>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {hit.dims.map((d) => <DimBadge key={d} dim={d} />)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {hit.room ? `Phòng ${hit.room}` : null}
          {hit.teacher ? ` · GV ${hit.teacher}` : null}
          {hit.students.length ? ` · HS ${hit.students.join(", ")}` : null}
        </p>
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-slot="conflict-sandbox">
          <p className="text-xs font-medium tabular-nums">{WD_LONG[hit.weekday]} {hit.existingStart}</p>
          <Block label={`${hit.existingClassName} (sổ)`} start={hit.existingStart} end={hit.existingEnd} win={win} tone="existing" />
          <Block label={`${hit.incomingClassName} (nhập)`} start={hit.incomingStart} end={hit.incomingEnd} win={win} tone="incoming" />
          <p className="text-xs tabular-nums text-muted-foreground">{WD_LONG[hit.weekday]} {hit.incomingEnd}</p>
        </div>
        <div className="grid gap-2" data-slot="conflict-actions">
          <ConflictActionBtn
            on={hit.action === "shift"}
            disabled={!hit.suggestShift}
            icon={<CalendarClock className="size-4" />}
            label="Dời giờ"
            hint={shiftHint(hit.suggestShift)}
            onClick={() => pick("shift")}
            action="shift"
          />
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="min-w-0 flex-1">
              <ConflictActionBtn
                on={hit.action === "room"}
                disabled={!hit.freeRooms.length}
                icon={<DoorOpen className="size-4" />}
                label="Đổi phòng"
                hint={hit.suggestRoom ? `Gán ${hit.suggestRoom.name} (trống)` : "Không còn phòng trống"}
                onClick={() => pick("room", roomPick || hit.suggestRoom?.id)}
                action="room"
              />
            </div>
            {hit.freeRooms.length > 1 ? (
              <Select value={roomPick} onValueChange={(v) => { setRoomPick(v); if (hit.action === "room") pick("room", v); }}>
                <SelectTrigger className="w-32 self-center" data-slot="conflict-room-select">
                  <SelectValue placeholder="Phòng" />
                </SelectTrigger>
                <SelectContent>
                  {hit.freeRooms.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
          <ConflictActionBtn
            on={hit.action === "ignore"}
            icon={<Shield className="size-4" />}
            label="Bỏ qua trùng"
            hint="Cho phép xếp chồng — webinar / lớp online"
            onClick={() => pick("ignore")}
            action="ignore"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function shiftHint(s: TimeSuggestion | null) {
  if (!s) return "Không còn khung trống";
  return `Gợi ý: ${s.label}`;
}

function ConflictActionBtn({
  on, disabled, icon, label, hint, onClick, action,
}: {
  on: boolean;
  disabled?: boolean;
  icon: ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  action: ConflictAction;
}) {
  return (
    <button
      type="button"
      data-slot="conflict-action"
      data-action={action}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:opacity-50",
        on ? "border-foreground bg-muted" : "hover:bg-muted/50",
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="mt-1 size-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

function BulkBar({ kind, count }: { kind: "student" | "class"; count: number }) {
  const resolveAllDuplicates = useEdu((s) => s.resolveAllDuplicates);
  const [action, setAction] = useState<DupAction>("merge");
  if (!count) return null;
  return (
    <div className="flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2" data-slot="resolve-all">
      <GitMerge className="size-4 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-sm">
        Áp dụng một cách cho {count} {kind === "student" ? "học sinh" : "lớp"} trùng
      </p>
      <Select value={action} onValueChange={(v) => setAction(v as DupAction)}>
        <SelectTrigger className="w-36" data-slot="resolve-all-action">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DUP_OPTS.map((a) => (
            <SelectItem key={a} value={a}>{DUP_VN[a].label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" data-slot="resolve-all-btn" onClick={() => resolveAllDuplicates(kind, action)}>
        Áp dụng tất cả
      </Button>
    </div>
  );
}

export function LinkReviewPanel() {
  const ingest = useEdu((s) => s.ingest);
  const ensureReview = useEdu((s) => s.ensureReview);
  useEffect(() => {
    if (ingest.linked && !ingest.review) ensureReview();
  }, [ingest.linked, ingest.review, ensureReview]);
  const review = ingest.review;
  const L = ingest.linked;
  const unlinked = L?.issues.filter((i) => i.code === "unlinked") || [];
  const pending = reviewPending(review);
  const studentDups = (review?.duplicates || []).filter((d) => d.kind === "student" && needsDecision(d));
  const classDups = (review?.duplicates || []).filter((d) => d.kind === "class" && needsDecision(d));
  const autoKept = (review?.duplicates || []).filter((d) => d.action === "keep" && !d.diffs.some((x) => x.changed));
  const conflicts = review?.conflicts || [];
  const defaultTab = studentDups.length ? "student" : classDups.length ? "class" : "conflict";

  return (
    <div className="space-y-4" data-slot="link-review">
      <Card>
        <CardHeader>
          <CardTitle>Cổng 4 · Nối quan hệ & rà soát</CardTitle>
          <CardDescription>
            Khớp HS → lớp → buổi, rồi đối chiếu sổ chính. Trùng và lệch lịch phải chọn cách xử lý trước khi ghi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3" data-slot="link-counts">
          <Stat k="Học sinh" n={L?.students.length || 0} />
          <Stat k="Khóa học" n={L?.courses.length || 0} />
          <Stat k="Lớp" n={L?.classes.length || 0} />
          <Stat k="Ghi danh" n={L?.enrollments.length || 0} />
          <Stat k="Buổi" n={L?.lessons.length || 0} />
          <Stat k="Chưa khớp" n={unlinked.length} />
        </CardContent>
      </Card>

      {pending ? (
        <Alert className="border-warn/30 bg-warn-soft" data-slot="review-pending">
          <AlertTriangle />
          <AlertTitle>Còn {pending} mục cần quyết</AlertTitle>
          <AlertDescription>Không ghi sổ cho đến khi mỗi thẻ trùng/lệch lịch có một lựa chọn.</AlertDescription>
        </Alert>
      ) : (studentDups.length || classDups.length || conflicts.length) ? (
        <Alert className="border-ok/30 bg-ok-soft text-ok" data-slot="review-ready">
          <Check />
          <AlertTitle>Đã chọn xong</AlertTitle>
          <AlertDescription>Có thể xác nhận nối và sang cổng ghi sổ.</AlertDescription>
        </Alert>
      ) : null}

      {autoKept.length ? (
        <p className="text-xs text-muted-foreground" data-slot="auto-kept">
          {autoKept.length} bản ghi khớp y nguyên — giữ sổ, không hiện thẻ.
        </p>
      ) : null}

      {studentDups.length || classDups.length || conflicts.length ? (
        <Tabs defaultValue={defaultTab} data-slot="review-tabs">
          <TabsList className="flex h-auto flex-wrap">
            <TabsTrigger value="student" data-slot="tab-student">
              <Users className="size-3.5" /> HS trùng ({studentDups.length})
            </TabsTrigger>
            <TabsTrigger value="class" data-slot="tab-class">
              Lớp trùng ({classDups.length})
            </TabsTrigger>
            <TabsTrigger value="conflict" data-slot="tab-conflict">
              Lệch lịch ({conflicts.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="student" className="space-y-3">
            <BulkBar kind="student" count={studentDups.length} />
            {studentDups.map((d) => <DupCard key={d.id} hit={d} />)}
            {!studentDups.length ? <p className="text-sm text-muted-foreground">Không có học sinh trùng cần quyết.</p> : null}
          </TabsContent>
          <TabsContent value="class" className="space-y-3">
            <BulkBar kind="class" count={classDups.length} />
            {classDups.map((d) => <DupCard key={d.id} hit={d} />)}
            {!classDups.length ? <p className="text-sm text-muted-foreground">Không có lớp trùng cần quyết.</p> : null}
          </TabsContent>
          <TabsContent value="conflict" className="space-y-3">
            {conflicts.map((c) => <ConflictCard key={c.id} hit={c} />)}
            {!conflicts.length ? <p className="text-sm text-muted-foreground">Không phát hiện lệch giáo viên / phòng / học sinh.</p> : null}
          </TabsContent>
        </Tabs>
      ) : (
        <p className="text-sm text-muted-foreground">Không trùng sổ chính, không lệch lịch.</p>
      )}

      {unlinked.length ? (
        <ul className="divide-y rounded-xl border bg-card">
          {unlinked.map((i, idx) => (
            <li key={idx} className="px-4 py-2 text-sm" data-slot="ingest-exception">{i.message}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Stat({ k, n }: { k: string; n: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="font-display text-xl tabular-nums">{n}</p>
    </div>
  );
}
