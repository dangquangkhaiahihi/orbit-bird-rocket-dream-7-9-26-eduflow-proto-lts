import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { usePhonePortal } from "./phone-chrome";

export type RowMenuPos = { x: number; y: number };

export function useRowActions<T>() {
  const [menu, setMenu] = useState<{ pos: RowMenuPos; row: T } | null>(null);
  const [pending, setPending] = useState<T | null>(null);
  function onRowContextMenu(row: T, e: React.MouseEvent) {
    setMenu({ pos: { x: e.clientX, y: e.clientY }, row });
  }
  return { menu, setMenu, pending, setPending, onRowContextMenu };
}

export function RowContextMenu({
  pos,
  onClose,
  onDetail,
  onEdit,
  onDelete,
}: {
  pos: RowMenuPos;
  onClose: () => void;
  onDetail: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const portal = usePhonePortal();
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<{ left: number; top: number }>({ left: pos.x, top: pos.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const host = portal?.getBoundingClientRect();
    const pad = 8;
    const minX = host ? host.left + pad : pad;
    const minY = host ? host.top + pad : pad;
    const maxX = (host ? host.right : window.innerWidth) - r.width - pad;
    const maxY = (host ? host.bottom : window.innerHeight) - r.height - pad;
    setStyle({
      left: Math.min(Math.max(pos.x, minX), Math.max(minX, maxX)),
      top: Math.min(Math.max(pos.y, minY), Math.max(minY, maxY)),
    });
  }, [pos.x, pos.y, portal]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const node = (
    <>
      <button
        type="button"
        aria-label="Đóng menu"
        className="fixed inset-0 z-50 cursor-default bg-transparent"
        data-slot="row-context-backdrop"
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        ref={ref}
        role="menu"
        data-slot="row-context-menu"
        className="fixed z-50 min-w-44 origin-top-left rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        style={{ left: style.left, top: style.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <MenuBtn slot="row-action-detail" icon={FileText} onClick={() => { onDetail(); onClose(); }}>
          Chi tiết
        </MenuBtn>
        {onEdit ? (
          <MenuBtn slot="row-action-edit" icon={Pencil} onClick={() => { onEdit(); onClose(); }}>
            Sửa
          </MenuBtn>
        ) : null}
        {onDelete ? (
          <MenuBtn slot="row-action-delete" className="text-destructive" icon={Trash2} onClick={() => { onDelete(); onClose(); }}>
            Xóa
          </MenuBtn>
        ) : null}
      </div>
    </>
  );

  return portal ? createPortal(node, portal) : node;
}

function MenuBtn({
  slot,
  className,
  icon: Icon,
  onClick,
  children,
}: {
  slot: string;
  className?: string;
  icon: typeof FileText;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-slot={slot}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium hover:bg-muted",
        className,
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {children}
    </button>
  );
}

export function ConfirmDeleteDialog({
  open,
  name,
  title = "Xóa?",
  onClose,
  onConfirm,
}: {
  open: boolean;
  name: string;
  title?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <DialogContent data-slot="confirm-delete">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Xóa {name || "dòng này"} khỏi sổ. Hành động không hoàn tác trong prototype.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button variant="destructive" data-slot="confirm-delete-ok" onClick={onConfirm}>Xóa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PageMore({
  onEdit,
  onDelete,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  if (!onEdit && !onDelete) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-9" data-slot="page-more" aria-label="More">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-slot="page-more-menu">
        {onEdit ? (
          <DropdownMenuItem data-slot="page-more-edit" onSelect={onEdit}>
            <Pencil className="size-4" /> Sửa
          </DropdownMenuItem>
        ) : null}
        {onDelete ? (
          <DropdownMenuItem data-slot="page-more-delete" variant="destructive" onSelect={onDelete}>
            <Trash2 className="size-4" /> Xóa
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
