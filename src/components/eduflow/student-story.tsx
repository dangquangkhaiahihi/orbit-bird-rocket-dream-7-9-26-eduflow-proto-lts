import { BookOpen, CalendarDays, MessageSquareText, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { moneyStripe, studentStory, type StoryKind } from "@/lib/eduflow/desk";
import { fmtDay, fmtTime } from "@/lib/eduflow/format";
import { canMoney } from "@/lib/eduflow/roles";
import { useEdu } from "@/lib/eduflow/store";
import type { Graph } from "@/lib/eduflow/types";
import { cn } from "@/lib/utils";
import { StatusChip } from "./atoms";

const KIND: Record<StoryKind, { label: string; Icon: typeof CalendarDays }> = {
  buoi: { label: "Buổi", Icon: CalendarDays },
  baitap: { label: "Bài tập", Icon: BookOpen },
  nhanxet: { label: "Nhận xét", Icon: MessageSquareText },
  hocphi: { label: "Học phí", Icon: Wallet },
};

export function MoneyStripe({
  g, studentId, onPay,
}: {
  g: Graph; studentId: string; onPay?: (enrollmentId: string) => void;
}) {
  const role = useEdu((s) => s.role);
  const workspace = useEdu((s) => s.workspace);
  const rows = moneyStripe(g, studentId);
  const pay = workspace === "draft" ? undefined : onPay;
  if (!rows.length) {
    return (
      <div data-slot="money-stripe" className="rounded-full border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
        Chưa ghi danh · chưa có học phí
      </div>
    );
  }
  return (
    <div data-slot="money-stripe" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5">
      {rows.map((r) => {
        const body = (
          <>
            <span className="text-xs font-medium">{r.className}</span>
            <StatusChip s={r.pay} />
            <span className="text-[11px] text-muted-foreground">{r.label}</span>
          </>
        );
        const cls = "flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-left";
        return pay ? (
          <button key={r.id} type="button" className={cls} onClick={() => pay(r.id)}>
            {body}
          </button>
        ) : (
          <div key={r.id} className={cls}>
            {body}
          </div>
        );
      })}
      {canMoney(role) && pay && rows[0] ? (
        <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full px-2 text-xs" onClick={() => pay(rows[0].id)}>
          Nạp
        </Button>
      ) : null}
    </div>
  );
}

export function StudentTimeline({
  g, studentId, onLesson, onPay,
}: {
  g: Graph;
  studentId: string;
  onLesson?: (id: string) => void;
  onPay?: (enrollmentId: string) => void;
}) {
  const events = studentStory(g, studentId);
  if (!events.length) {
    return <p data-slot="hs-timeline" className="py-8 text-center text-sm text-muted-foreground">Chưa có chuyện trên sổ.</p>;
  }
  return (
    <ol data-slot="hs-timeline" className="relative space-y-0 border-l pl-4">
      {events.map((ev) => {
        const k = KIND[ev.kind];
        const clickable = ev.kind === "hocphi" ? ev.enrollmentId : ev.lessonId;
        return (
          <li key={ev.id} className="relative pb-4">
            <span className="absolute -left-[21px] flex size-5 items-center justify-center rounded-full border bg-card">
              <k.Icon className="size-3 text-muted-foreground" />
            </span>
            <button
              type="button"
              disabled={!clickable}
              className={cn("w-full rounded-lg px-1 py-0.5 text-left", clickable && "hover:bg-muted/50")}
              onClick={() => {
                if (ev.kind === "hocphi" && ev.enrollmentId) onPay?.(ev.enrollmentId);
                else if (ev.lessonId) onLesson?.(ev.lessonId);
              }}
            >
              <p className="text-[11px] text-muted-foreground">
                {fmtDay(ev.at)} {fmtTime(ev.at)} · {k.label}
              </p>
              <p className="text-sm font-medium">{ev.title}</p>
              <p className="text-xs text-muted-foreground">{ev.detail}</p>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
