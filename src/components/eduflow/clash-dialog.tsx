import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_SLOTS, WD, addMinutesHhmm, fmtDay, fmtTime } from "@/lib/eduflow/format";
import type { ClashSlot, ScheduleResult } from "@/lib/eduflow/schedule";
import { useEdu } from "@/lib/eduflow/store";
import { cn } from "@/lib/utils";

function monthCells(ymd: string) {
  const [y, m] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const startWd = first.getUTCDay();
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: Array<{ d: number; ymd: string } | null> = [];
  for (let i = 0; i < startWd; i += 1) cells.push(null);
  for (let d = 1; d <= dim; d += 1) {
    const mm = String(m).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    cells.push({ d, ymd: `${y}-${mm}-${dd}` });
  }
  return { y, m, cells };
}

export function ClashBlockDialog({
  open, result, onClose,
}: { open: boolean; result: ScheduleResult | null; onClose: () => void }) {
  const clashes = result?.clashes || [];
  const months = useMemo(() => {
    const set = new Set(clashes.map((c) => c.date.slice(0, 7)));
    return [...set].sort();
  }, [clashes]);
  const clashDates = useMemo(() => new Set(clashes.map((c) => c.date)), [clashes]);
  const noteByDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clashes) if (!m.has(c.date)) m.set(c.date, c.note);
    return m;
  }, [clashes]);
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-3xl" data-slot="clash-block">
        <DialogHeader>
          <DialogTitle>Không lưu — {result?.clashN || 0} buổi trùng</DialogTitle>
          <DialogDescription>Đổi GV, phòng hoặc giờ. Lịch tháng đánh dấu ngày trùng.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {months.map((ym) => {
            const seed = `${ym}-01`;
            const { y, m, cells } = monthCells(seed);
            return (
              <div key={ym} className="rounded-lg border p-3">
                <p className="mb-2 text-sm font-medium">Tháng {m}/{y}</p>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
                  {WD.map((w) => <span key={w}>{w}</span>)}
                </div>
                <div className="mt-1 grid grid-cols-7 gap-1">
                  {cells.map((c, i) => (
                    <div
                      key={i}
                      className={cn(
                        "flex aspect-square items-center justify-center rounded text-xs",
                        c && clashDates.has(c.ymd) ? "bg-bad text-white font-medium" : c ? "bg-muted/50" : "",
                      )}
                      title={c ? noteByDate.get(c.ymd) : undefined}
                    >
                      {c?.d || ""}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <ul className="max-h-40 space-y-1 overflow-auto text-sm">
          {clashes.map((c) => (
            <li key={c.start} data-slot="clash-block-row">
              {fmtDay(c.start)} {fmtTime(c.start)} · {c.note}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button onClick={onClose}>Đóng</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ClashCoverDialog({
  open, result, classId, teacherId, roomId, duration,
  onDone,
}: {
  open: boolean;
  result: ScheduleResult | null;
  classId: string;
  teacherId: string;
  roomId: string;
  duration: number;
  onDone: () => void;
}) {
  const createAdhoc = useEdu((s) => s.createAdhoc);
  const clashes = result?.clashes || [];
  const [rows, setRows] = useState<Record<string, { date: string; hhmm: string; skip: boolean }>>({});
  const state = (c: ClashSlot) => rows[c.start] || { date: c.date, hhmm: c.start.slice(11, 16), skip: false };

  function save() {
    for (const c of clashes) {
      const s = state(c);
      if (s.skip) continue;
      const start = `${s.date}T${s.hhmm}:00+07:00`;
      createAdhoc({ class_id: classId, teacher_id: teacherId, room_id: roomId, start, duration_min: duration, stay: true });
    }
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDone(); }}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg" data-slot="clash-cover">
        <DialogHeader>
          <DialogTitle>Xếp buổi bù cho {clashes.length} buổi trùng</DialogTitle>
          <DialogDescription>Lớp đã mở các buổi trống. Mỗi buổi trùng: tạo học bù rời hoặc bỏ.</DialogDescription>
        </DialogHeader>
        <ul className="space-y-3">
          {clashes.map((c) => {
            const s = state(c);
            const end = addMinutesHhmm(s.hhmm, duration);
            return (
              <li key={c.start} className="rounded-lg border p-3" data-slot="clash-cover-row">
                <p className="text-sm font-medium">{fmtDay(c.start)} {fmtTime(c.start)} · {c.note}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={s.skip ? "default" : "outline"} onClick={() => setRows((p) => ({ ...p, [c.start]: { ...s, skip: true } }))}>Bỏ</Button>
                  <Button size="sm" variant={!s.skip ? "default" : "outline"} onClick={() => setRows((p) => ({ ...p, [c.start]: { ...s, skip: false } }))}>Tạo buổi bù</Button>
                </div>
                {s.skip ? null : (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Input type="date" value={s.date} onChange={(e) => setRows((p) => ({ ...p, [c.start]: { ...s, date: e.target.value } }))} />
                    <Select value={s.hhmm} onValueChange={(v) => setRows((p) => ({ ...p, [c.start]: { ...s, hhmm: v } }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIME_SLOTS.filter((t) => !!addMinutesHhmm(t, duration)).map((t) => (
                          <SelectItem key={t} value={t}>{t}–{addMinutesHhmm(t, duration)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!end ? <p className="col-span-2 text-xs text-destructive">Giờ vượt quá ngày</p> : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onDone}>Để sau</Button>
          <Button onClick={save}>Xong</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

