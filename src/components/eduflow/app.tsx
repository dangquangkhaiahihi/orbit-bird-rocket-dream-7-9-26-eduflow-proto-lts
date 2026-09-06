import { useEffect, useLayoutEffect, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEdu } from "@/lib/eduflow/store";
import { DRAFT_HOME, isDraftBlocked } from "@/lib/eduflow/roles";
import {
  HomNay, Buoi, Lesson, Lop, LopDetail, HS, HSDetail, ZaloPage, ZaloDetail,
  Branch, Phong, PhongDetail, GV, GVDetail, Staff, StaffDetail, OA, ZaloCard, Rail, MobNav, Modals, MasterMenu, ProfileSheet, KhoaHoc,
} from "./pages";
import { ThuPhi, SoThu } from "./thu-phi";
import { NhacNap } from "./remind-batch";
import { ClassCreatePage } from "./class-form";
import { LessonSchedDialog } from "./lesson-sched";
import { VangPage, MakeupCreatePage } from "./makeup-form";
import { CourseCreateDialog } from "./course-form";
import { ErpDialogs } from "./erp-forms";
import { PayDialog } from "./pay-form";
import { PeekHost } from "./inspector";
import { PhoneFrameContext, PhoneMenuProvider } from "./phone-chrome";
import { ThemeProvider } from "next-themes";
import { Onboarding } from "./onboarding";
import { IngestPage, DraftBanner } from "./ingest";

function Player() {
  const g = useEdu((s) => s.graph)!;
  const device = useEdu((s) => s.device);
  const role = useEdu((s) => s.role);
  const tenant = useEdu((s) => s.tenant);
  const setDevice = useEdu((s) => s.setDevice);
  const setRole = useEdu((s) => s.setRole);
  const reset = useEdu((s) => s.reset);
  const replay = useEdu((s) => s.replayOnboarding);
  const go = useEdu((s) => s.go);
  const workspace = useEdu((s) => s.workspace);
  const solo = tenant?.identity_type === "SOLO";
  const brand = tenant?.business_name || "IMPACT";
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-2.5 bg-foreground px-4 py-2.5 text-background">
      <b className="font-display text-sm tracking-tight">{brand}</b>
      <span className="text-xs tabular-nums text-zinc-400">{g.meta.today_label} · 07:42</span>
      {workspace === "draft" ? (
        <span className="rounded-full bg-warn px-2 py-0.5 text-xs text-background" data-slot="draft-chip">Sổ nháp</span>
      ) : null}
      {tenant ? (
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300" data-slot="identity-chip">
          {solo ? "Gia sư" : "Trung tâm"}
        </span>
      ) : null}
      <ToggleGroup type="single" value={device} onValueChange={(v) => { if (v) setDevice(v as typeof device); }} className="rounded-full bg-zinc-800 p-0.5">
        <ToggleGroupItem value="web" data-slot="dev-web" className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Web</ToggleGroupItem>
        <ToggleGroupItem value="phone" data-slot="dev-phone" className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Điện thoại</ToggleGroupItem>
        <ToggleGroupItem value="zalo" data-slot="dev-zalo" disabled={workspace === "draft"} className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Thẻ Zalo</ToggleGroupItem>
      </ToggleGroup>
      {solo ? null : (
        <ToggleGroup type="single" value={role} onValueChange={(v) => { if (v) setRole(v as typeof role); }} className="rounded-full bg-zinc-800 p-0.5">
          <ToggleGroupItem value="ops" data-slot="role-ops" className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Giáo vụ</ToggleGroupItem>
          <ToggleGroupItem value="teacher" data-slot="role-teacher" className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Huy</ToggleGroupItem>
          <ToggleGroupItem value="assistant" data-slot="role-assistant" className="h-7 rounded-full px-3 text-xs data-[state=on]:bg-background data-[state=on]:text-foreground">Trợ lý</ToggleGroupItem>
        </ToggleGroup>
      )}
      <span className="flex-1" />
      {role === "ops" && workspace !== "draft" ? (
        <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-background" data-slot="go-nhap-so" onClick={() => go("nhap-so")}>Nhập sổ</Button>
      ) : null}
      <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-background" data-slot="replay-onboarding" onClick={() => replay()}>Làm lại onboarding</Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs text-zinc-400 hover:text-background" onClick={() => reset()}>Reset sổ</Button>
    </header>
  );
}

function Pane() {
  const n = useEdu((s) => s.route.n);
  const workspace = useEdu((s) => s.workspace);
  const view = workspace === "draft" && isDraftBlocked(n) ? DRAFT_HOME : n;
  switch (view) {
    case "hom-nay": return <HomNay />;
    case "buoi": return <Buoi />;
    case "buoi-detail": return <Lesson />;
    case "lop": return <Lop />;
    case "lop-detail": return <LopDetail />;
    case "lop-moi": return <ClassCreatePage />;
    case "vang": return <VangPage />;
    case "buoi-bu": return <MakeupCreatePage />;
    case "hoc-sinh": return <HS />;
    case "hs-detail": return <HSDetail />;
    case "zalo": return <ZaloPage />;
    case "zalo-detail": return <ZaloDetail />;
    case "khoa-hoc":
    case "khoa-hoc-detail": return <KhoaHoc />;
    case "thu-phi": return <ThuPhi />;
    case "so-thu": return <SoThu />;
    case "nhac-nap":
    case "nhac-nap-detail": return <NhacNap />;
    case "chi-nhanh": return <Branch />;
    case "phong": return <Phong />;
    case "phong-detail": return <PhongDetail />;
    case "giao-vien": return <GV />;
    case "gv-detail": return <GVDetail />;
    case "nhan-su": return <Staff />;
    case "staff-detail": return <StaffDetail />;
    case "zalo-oa": return <OA />;
    case "the": return <ZaloCard />;
    case "nhap-so": return <IngestPage />;
    default: return workspace === "draft" ? <Lop /> : <HomNay />;
  }
}

export function EduFlowApp() {
  const ready = useEdu((s) => s.ready);
  const graph = useEdu((s) => s.graph);
  const tenant = useEdu((s) => s.tenant);
  const device = useEdu((s) => s.device);
  const route = useEdu((s) => s.route);
  const workspace = useEdu((s) => s.workspace);
  const load = useEdu((s) => s.load);
  const syncHash = useEdu((s) => s.syncHash);
  const [frame, setFrame] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onHash = () => syncHash();
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [syncHash]);

  if (!ready || !graph) {
    return (
      <div className="flex h-svh flex-col bg-background">
        <header className="flex shrink-0 items-center gap-2.5 bg-foreground px-4 py-2.5 text-background">
          <b className="font-display text-sm tracking-tight">EduFlow</b>
          <span className="text-xs text-zinc-400">Đang mở sổ…</span>
        </header>
        <div className="flex flex-1 flex-col gap-3 p-8">
          <p className="text-sm text-muted-foreground">Hôm nay</p>
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (!tenant) {
    return (
      <TooltipProvider>
        <div className="flex h-svh flex-col overflow-hidden bg-background">
          <header className="flex shrink-0 flex-wrap items-center gap-2.5 bg-foreground px-4 py-2.5 text-background">
            <b className="font-display text-sm tracking-tight">EduFlow</b>
            <span className="text-xs text-zinc-400">Thiết lập sổ</span>
          </header>
          <Onboarding />
          <Toaster position="bottom-right" />
        </div>
      </TooltipProvider>
    );
  }

  const phone = device === "phone";
  const zalo = device === "zalo" || route.n === "the";

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
    <TooltipProvider>
      <div className="flex h-svh flex-col overflow-hidden bg-background">
        <Player />
        <PhoneFrameContext.Provider value={frame}>
          <PhoneMenuProvider>
          <div
            ref={setFrame}
            className={cn("relative isolate flex min-h-0 flex-1 flex-col overflow-hidden", phone && "mx-auto w-full max-w-[390px] border-x")}
          >
            {zalo ? (
              <ZaloCard />
            ) : (
              <>
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                  {!phone ? <Rail /> : null}
                  <main className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      {workspace === "draft" && route.n !== "nhap-so" ? (
                        <div className="px-5 pt-4"><DraftBanner /></div>
                      ) : null}
                      <Pane />
                    </div>
                    {!phone ? <PeekHost /> : null}
                  </main>
                </div>
                {phone ? <MobNav /> : null}
                {phone ? <PeekHost /> : null}
                {phone ? <MasterMenu /> : null}
                {phone ? <ProfileSheet /> : null}
              </>
            )}
            <Modals />
            <LessonSchedDialog />
            <CourseCreateDialog />
            <ErpDialogs />
            <PayDialog />
          </div>
          </PhoneMenuProvider>
        </PhoneFrameContext.Provider>
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
    </ThemeProvider>
  );
}
