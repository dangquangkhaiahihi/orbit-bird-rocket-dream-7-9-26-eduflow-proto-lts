import { createContext, useContext, useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { actorOf, initials } from "@/lib/eduflow/format";
import { useEdu } from "@/lib/eduflow/store";
import { cn } from "@/lib/utils";
import { X, Menu } from "lucide-react";

export const PhoneFrameContext = createContext<HTMLElement | null>(null);

export function usePhoneFrame() {
  return useContext(PhoneFrameContext);
}

export function usePhone() {
  return useEdu((s) => s.device) === "phone";
}

/** Portal target for menus on phone so they stay inside the 390px frame. */
export function usePhonePortal(): HTMLElement | undefined {
  const frame = usePhoneFrame();
  const phone = usePhone();
  return phone && frame ? frame : undefined;
}

const PhoneMenuContext = createContext<{
  menuOpen: boolean;
  setMenuOpen: (v: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (v: boolean) => void;
}>({
  menuOpen: false,
  setMenuOpen: () => {},
  profileOpen: false,
  setProfileOpen: () => {},
});

export function usePhoneMenu() {
  return useContext(PhoneMenuContext);
}

export function PhoneMenuProvider({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  return (
    <PhoneMenuContext.Provider value={{ menuOpen, setMenuOpen, profileOpen, setProfileOpen }}>
      {children}
    </PhoneMenuContext.Provider>
  );
}

export function PhoneBurgerButton() {
  const { setMenuOpen } = usePhoneMenu();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-11 shrink-0"
      aria-label="Mở menu"
      onClick={() => setMenuOpen(true)}
    >
      <Menu className="size-5" />
    </Button>
  );
}

export function PhoneAvatarButton() {
  const { setProfileOpen } = usePhoneMenu();
  const role = useEdu((s) => s.role);
  const actor = actorOf(role);
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-11 shrink-0"
      aria-label="Tài khoản"
      onClick={() => setProfileOpen(true)}
    >
      <Avatar className="size-8">
        <AvatarFallback className="bg-foreground text-xs font-semibold text-background">{initials(actor.name)}</AvatarFallback>
      </Avatar>
    </Button>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  desc,
  headerExtra,
  footer,
  children,
  slot = "sheet",
  z = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  desc?: ReactNode;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  slot?: string;
  z?: string;
}) {
  const container = usePhoneFrame();
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      shouldScaleBackground={false}
      noBodyStyles
      disablePreventScroll
      handleOnly
      container={container}
    >
      <Drawer.Portal>
        <Drawer.Overlay className={cn("absolute inset-0 bg-black/40", z)} />
        <Drawer.Content
          data-slot={slot}
          className={cn(
            "absolute inset-x-0 bottom-0 flex h-fit max-h-[90%] flex-col rounded-t-2xl bg-card outline-none",
            z,
          )}
        >
          <Drawer.Handle className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" />
          {title ? (
            <div className="flex items-start gap-2 border-b px-4 py-3">
              {headerExtra}
              <div className="min-w-0 flex-1">
                <Drawer.Title className="font-display text-base leading-tight">{title}</Drawer.Title>
                {desc ? (
                  <Drawer.Description className="mt-0.5 text-sm text-muted-foreground">{desc}</Drawer.Description>
                ) : (
                  <Drawer.Description className="sr-only">{typeof title === "string" ? title : "Chi tiết"}</Drawer.Description>
                )}
              </div>
              <Button variant="ghost" size="icon-sm" className="size-11" onClick={onClose} aria-label="Đóng">
                <X className="size-4" />
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
          {footer ? <div className="flex shrink-0 gap-2 border-t px-4 py-3">{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function SideDrawer({
  open,
  onClose,
  title,
  desc,
  children,
  slot = "side-drawer",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  desc?: ReactNode;
  children: ReactNode;
  slot?: string;
}) {
  const container = usePhoneFrame();
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
      direction="right"
      shouldScaleBackground={false}
      noBodyStyles
      disablePreventScroll
      container={container}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="absolute inset-0 z-[70] bg-black/40" />
        <Drawer.Content
          data-slot={slot}
          className="absolute inset-y-0 right-0 z-[70] flex h-full w-[min(18.5rem,86%)] flex-col rounded-l-2xl bg-card outline-none"
        >
          <div className="flex items-start gap-2 border-b px-4 py-3">
            <div className="min-w-0 flex-1">
              {title ? <Drawer.Title className="font-display text-base leading-tight">{title}</Drawer.Title> : <Drawer.Title className="sr-only">Menu</Drawer.Title>}
              {desc ? <Drawer.Description className="mt-0.5 text-sm text-muted-foreground">{desc}</Drawer.Description> : <Drawer.Description className="sr-only">Menu</Drawer.Description>}
            </div>
            <Button variant="ghost" size="icon-sm" className="size-11" onClick={onClose} aria-label="Đóng">
              <X className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{children}</div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function OverlayShell({
  open,
  onClose,
  title,
  desc,
  onSave,
  saveLabel = "Lưu",
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  desc: string;
  onSave?: () => void;
  saveLabel?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const phone = usePhone();
  const footer = (
    <>
      <Button variant="outline" className="min-h-11 flex-1" onClick={onClose}>Đóng</Button>
      {onSave ? <Button className="min-h-11 flex-1" onClick={onSave}>{saveLabel}</Button> : null}
    </>
  );
  if (phone) {
    return (
      <BottomSheet open={open} onClose={onClose} title={title} desc={desc} footer={footer} slot="form-sheet" z="z-[60]">
        <div className="space-y-5 pb-2">{children}</div>
      </BottomSheet>
    );
  }
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className={`flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{desc}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-2">{children}</div>
        <DialogFooter className="border-t px-6 py-4">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}