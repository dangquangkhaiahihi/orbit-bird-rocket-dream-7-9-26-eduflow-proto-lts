import { useEffect, useState } from "react";
import { Bell, BookOpen, Building2, CalendarDays, ChevronDown, Contact, DoorOpen, FileSpreadsheet, GraduationCap, Library, MessageCircle, QrCode, Receipt, Sun, UserX, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modulesFor, navOn, phoneTabsFor, routeModule } from "@/lib/eduflow/roles";
import type { RouteName } from "@/lib/eduflow/types";
import { useEdu } from "@/lib/eduflow/store";
import { cn } from "@/lib/utils";
import { SideDrawer, usePhoneMenu } from "./phone-chrome";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ICONS: Record<string, typeof Sun> = {
  "hom-nay": Sun, buoi: CalendarDays, vang: UserX, lop: Users, "hoc-sinh": BookOpen, zalo: MessageCircle,
  "chi-nhanh": Building2, phong: DoorOpen, "giao-vien": GraduationCap, "nhan-su": Contact, "zalo-oa": QrCode,
  "khoa-hoc": Library, "thu-phi": Wallet, "so-thu": Receipt, "nhac-nap": Bell, "nhap-so": FileSpreadsheet,
};

function NavBtn({
  n, label, on, onClick, dense, disabled,
}: {
  n: RouteName; label: string; on: boolean; onClick: () => void; dense?: boolean; disabled?: boolean;
}) {
  const Icon = ICONS[n];
  const btn = (
    <Button
      type="button"
      variant={on && !disabled ? "secondary" : "ghost"}
      disabled={disabled}
      className={cn("w-full justify-start", dense ? "mb-0.5 h-11" : "mb-0.5")}
      data-slot={`nav-${n}`}
      data-state={disabled ? "blocked" : on ? "on" : "off"}
      onClick={onClick}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null} {label}
    </Button>
  );
  if (!disabled) return btn;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block w-full">{btn}</span>
      </TooltipTrigger>
      <TooltipContent side="right">Không dùng khi xem sổ nháp</TooltipContent>
    </Tooltip>
  );
}

function ModuleAccordions({
  dense, onNav,
}: {
  dense?: boolean;
  onNav?: (n: RouteName) => void;
}) {
  const route = useEdu((s) => s.route);
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  const flags = useEdu((s) => s.tenant?.modules_enabled ?? null);
  const identity = useEdu((s) => s.tenant?.identity_type ?? null);
  const workspace = useEdu((s) => s.workspace);
  const modules = modulesFor(role, flags, identity, workspace);
  const currentMod = routeModule(route.n);
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setClosed((s) => (s[currentMod] ? { ...s, [currentMod]: false } : s));
  }, [currentMod]);

  function nav(n: RouteName) {
    if (onNav) onNav(n);
    else go(n);
  }

  if (modules.length === 1) {
    const only = modules[0];
    return (
      <nav className={dense ? "px-1" : "flex-1 p-2"}>
        {only.items.map((j) => (
          <NavBtn key={j.n} n={j.n} label={j.label} on={navOn(route.n, j.n)} onClick={() => nav(j.n)} dense={dense} disabled={j.disabled} />
        ))}
      </nav>
    );
  }

  return (
    <nav className={dense ? "px-1" : "flex-1 overflow-auto p-2"}>
      {modules.map((m) => {
        const expanded = !closed[m.id];
        return (
          <div key={m.id} className="mb-1" data-slot={`nav-mod-${m.id}`} data-state={expanded ? "open" : "closed"}>
            <button
              type="button"
              data-slot="nav-mod-toggle"
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 font-semibold tracking-wide text-muted-foreground uppercase hover:bg-muted/60",
                dense ? "h-11 text-xs" : "h-8 text-xs",
              )}
              onClick={() => setClosed((s) => ({ ...s, [m.id]: expanded }))}
              aria-expanded={expanded}
            >
              {m.label}
              <ChevronDown className={cn("size-3.5 transition-transform", expanded ? "" : "-rotate-90")} />
            </button>
            {expanded ? m.items.map((j) => (
              <NavBtn key={j.n} n={j.n} label={j.label} on={navOn(route.n, j.n)} onClick={() => nav(j.n)} dense={dense} disabled={j.disabled} />
            )) : null}
          </div>
        );
      })}
    </nav>
  );
}

export function Rail() {
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  const tenant = useEdu((s) => s.tenant);
  const workspace = useEdu((s) => s.workspace);
  const identity = tenant?.identity_type;
  const brand = tenant?.business_name || "IMPACT";
  const roleLabel = identity === "SOLO"
    ? (tenant?.subject ? `Gia sư ${tenant.subject}` : "Gia sư")
    : role === "teacher" ? "Huy" : role === "assistant" ? "Trợ lý" : "Giáo vụ";
  const place = tenant?.campus?.branch_name || (identity === "SOLO" ? "1 lớp" : "Cầu Giấy");
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
      <button type="button" className="flex items-center gap-2.5 border-b px-4 py-4 text-left" onClick={() => go(workspace === "draft" ? "lop" : "hom-nay")}>
        <span className="flex size-8 items-center justify-center rounded-md bg-foreground text-xs font-semibold text-background">{brand.slice(0, 2).toUpperCase()}</span>
        <span>
          <b className="block font-display text-sm">{brand}</b>
          <span className="text-xs text-muted-foreground">{place} · {roleLabel}</span>
        </span>
      </button>
      <ModuleAccordions />
    </aside>
  );
}

export function MobNav() {
  const route = useEdu((s) => s.route);
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  const identity = useEdu((s) => s.tenant?.identity_type ?? null);
  const workspace = useEdu((s) => s.workspace);
  return (
    <nav className="flex border-t bg-card">
      {phoneTabsFor(role, identity, workspace).map((j) => {
        const Icon = ICONS[j.id];
        const on = navOn(route.n, j.id);
        return (
          <button key={j.id} type="button" onClick={() => go(j.id)} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-xs", on ? "text-foreground" : "text-muted-foreground")}>
            {Icon ? <Icon className="size-4" aria-hidden /> : null} {j.label}
          </button>
        );
      })}
    </nav>
  );
}

export function MasterMenu() {
  const { menuOpen, setMenuOpen } = usePhoneMenu();
  const go = useEdu((s) => s.go);
  function nav(n: RouteName) {
    setMenuOpen(false);
    go(n);
  }
  return (
    <SideDrawer
      open={menuOpen}
      onClose={() => setMenuOpen(false)}
      title="Menu"
      desc="Cầu Giấy"
      slot="master-menu"
    >
      <ModuleAccordions dense onNav={nav} />
    </SideDrawer>
  );
}
