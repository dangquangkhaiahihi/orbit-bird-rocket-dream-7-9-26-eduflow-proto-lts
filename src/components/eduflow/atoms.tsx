import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initials, statusTone, statusVn } from "@/lib/eduflow/format";
import { useEdu } from "@/lib/eduflow/store";
import type { RouteName } from "@/lib/eduflow/types";
import { DRAFT_HOME } from "@/lib/eduflow/roles";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PhoneAvatarButton, PhoneBurgerButton } from "./phone-chrome";

export function Person({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="flex items-center gap-2.5 text-left">
      <Avatar className="size-8">
        <AvatarFallback className="bg-muted text-xs font-semibold">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub ? <span className="block truncate text-xs text-muted-foreground">{sub}</span> : null}
      </span>
    </span>
  );
}

export function StatusChip({ s }: { s?: string | null }) {
  const t = statusTone(s);
  return (
    <Badge
      variant="outline"
      data-slot="status-chip"
      data-status={s || ""}
      className={cn(
        "font-medium",
        t === "ok" && "border-ok/30 bg-ok-soft text-ok",
        t === "warn" && "border-warn/30 bg-warn-soft text-warn",
        t === "bad" && "border-bad/30 bg-bad-soft text-bad",
      )}
    >
      {statusVn(s)}
    </Badge>
  );
}

export function StuStatus({ life, pay }: { life?: string | null; pay?: string | null }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1" data-slot="stu-status">
      {life ? <StatusChip s={life} /> : null}
      {pay ? <StatusChip s={pay} /> : null}
    </span>
  );
}

export function PageHead({
  trail,
  actions,
}: {
  trail: Array<{ label: string; go?: RouteName; id?: string }>;
  actions?: React.ReactNode;
}) {
  const go = useEdu((s) => s.go);
  const phone = useEdu((s) => s.device) === "phone";
  const workspace = useEdu((s) => s.workspace);
  function jump(n?: RouteName, id?: string) {
    if (!n) return;
    go(workspace === "draft" && n === "hom-nay" ? DRAFT_HOME : n, id);
  }
  if (phone) {
    const current = trail[trail.length - 1];
    const parent = trail.length > 1 ? trail[trail.length - 2] : null;
    const showBack = Boolean(parent?.go && parent.label !== "IMPACT");
    const crumbs = trail.slice(0, -1).filter((c) => c.label !== "IMPACT");
    return (
      <header className="shrink-0 border-b">
        <div className="flex min-h-12 items-center gap-0.5 px-1">
          {showBack ? (
            <Button
              variant="ghost"
              className="h-11 max-w-36 shrink-0 gap-0 px-1.5 text-sm text-muted-foreground"
              aria-label={`Về ${parent!.label}`}
              onClick={() => jump(parent!.go, parent!.id)}
            >
              <ChevronLeft className="size-5" />
              <span className="truncate">{parent!.label}</span>
            </Button>
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <p className="min-w-0 flex-1 truncate py-2 font-medium leading-tight">{current.label}</p>
          <PhoneBurgerButton />
          <PhoneAvatarButton />
        </div>
        {crumbs.length > 1 ? (
          <nav className="flex gap-1 overflow-x-auto px-3 pb-1.5 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={c.label + i} className="flex shrink-0 items-center gap-1">
                {i > 0 ? <span aria-hidden>›</span> : null}
                {c.go ? (
                  <button type="button" className="hover:text-foreground" onClick={() => jump(c.go, c.id)}>
                    {c.label}
                  </button>
                ) : (
                  <span>{c.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        {actions ? (
          <div className="flex gap-2 overflow-x-auto px-3 pb-2.5 [&_button]:min-h-10">{actions}</div>
        ) : null}
      </header>
    );
  }
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b px-5">
      <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
        {trail.map((c, i) => (
          <span key={c.label + i} className="flex items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 text-muted-foreground" /> : null}
            {c.go ? (
              <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => jump(c.go, c.id)}>
                {c.label}
              </button>
            ) : (
              <span className="font-medium">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Kv({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}

export function Empty({ t, cta, onCta }: { t: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center py-12">
      <p className="text-sm text-muted-foreground">{t}</p>
      {cta && onCta ? (
        <Button className="mt-3 min-h-11" onClick={onCta}>{cta}</Button>
      ) : null}
    </div>
  );
}

export function GhostLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <Button variant="ghost" size="sm" className="h-auto px-1 py-0.5 font-medium" onClick={onClick}>
      {children}
    </Button>
  );
}
