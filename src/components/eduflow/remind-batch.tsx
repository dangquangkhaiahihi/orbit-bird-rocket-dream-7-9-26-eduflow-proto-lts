import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Bell } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { one, stuName } from "@/lib/eduflow/format";
import { remindCandidates, remindDaysOf, useEdu, type RemindHit } from "@/lib/eduflow/store";
import { canSend, canWrite } from "@/lib/eduflow/roles";
import { cn } from "@/lib/utils";
import type { RemindItem } from "@/lib/eduflow/types";
import { Empty, PageHead, Person, StatusChip } from "./atoms";
import { DataTable } from "./data-table";
import { TableStage } from "./inspector";
import { ConfirmDeleteDialog, PageMore, RowContextMenu, useRowActions } from "./row-menu";

type BatchRow = {
  id: string;
  when: string;
  window: string;
  mix: string;
  sent: string;
  status: string;
};

type ItemRow = RemindItem & { student: string; className: string; ph: string; zalo: string };

const REASON_FACET = [
  { value: "runout", label: "sắp hết buổi học" },
  { value: "debt", label: "nợ buổi học" },
  { value: "both", label: "nợ và sắp hết" },
];

export function NhacNap() {
  const id = useEdu((s) => s.route.id);
  if (id) return <NhacNapDetail />;
  return <NhacNapList />;
}

function NhacNapList() {
  const g = useEdu((s) => s.graph)!;
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const setModal = useEdu((s) => s.setModal);
  const setRemindDays = useEdu((s) => s.setRemindDays);
  const createRemindBatch = useEdu((s) => s.createRemindBatch);
  const deleteRemindBatch = useEdu((s) => s.deleteRemindBatch);
  const phone = useEdu((s) => s.device) === "phone";
  const saved = remindDaysOf(g);
  const [draft, setDraft] = useState(String(saved));
  const [tab, setTab] = useState("cua-so");
  const days = Math.max(1, Math.min(90, Math.round(Number(draft)) || saved));
  const hits = useMemo(() => remindCandidates(g, days), [g, days]);
  const runN = hits.filter((h) => h.reason !== "debt").length;
  const debtN = hits.filter((h) => h.reason !== "runout").length;
  const rows: BatchRow[] = useMemo(() => g.remind_batches.map((b) => ({
    id: b.id,
    when: b.ran_at,
    window: `${b.days_before} ngày`,
    mix: `${b.counts.runout} sắp hết · ${b.counts.debt} nợ`,
    sent: `${b.counts.sent} gửi · ${b.counts.failed} lỗi`,
    status: b.status,
  })), [g]);
  const hitMenu = useRowActions<RemindHit>();
  const batchMenu = useRowActions<BatchRow>();
  const write = canSend(role);
  const enrollWrite = canWrite(role, "enrollment");
  const hitCols: ColumnDef<RemindHit>[] = [
    { accessorKey: "student", header: "Học sinh", cell: ({ row }) => <Person name={row.original.student} sub={row.original.className} /> },
    { accessorKey: "reason", header: "Lý do", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "remaining", header: "Còn", cell: ({ row }) => remainLabel(row.original.remaining, row.original.days_left) },
    { accessorKey: "debt", header: "Nợ" },
    { accessorKey: "guardian", header: "PH" },
  ];
  const batchCols: ColumnDef<BatchRow>[] = [
    { accessorKey: "when", header: "Chạy lúc", cell: ({ getValue }) => fmtClock(String(getValue())) },
    { accessorKey: "window", header: "Cửa sổ" },
    { accessorKey: "mix", header: "Đối tượng" },
    { accessorKey: "sent", header: "Kết quả" },
    { accessorKey: "status", header: "TT", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
  ];
  function saveDays() {
    setRemindDays(days);
  }
  function run() {
    const bid = createRemindBatch(days);
    if (bid) go("nhac-nap-detail", bid);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="nhac-nap">
      <PageHead
        trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Nhắc nạp" }]}
        actions={canSend(role) ? <Button data-slot="remind-run" onClick={run}><Bell className="size-4" /> Chạy lô</Button> : undefined}
      />
      <div className={cn("shrink-0 border-b", phone ? "space-y-3 p-3" : "grid grid-cols-[16rem_1fr] gap-6 p-5")}>
        <div className="space-y-2">
          <Label htmlFor="remind-days">Nhắc trước (ngày)</Label>
          <div className="flex gap-2">
            <Input
              id="remind-days"
              data-slot="remind-days"
              type="number"
              min={1}
              max={90}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-11"
            />
            {canSend(role) ? <Button variant="outline" className="h-11" onClick={saveDays}>Lưu</Button> : null}
          </div>
          <p className="text-xs text-muted-foreground">Mặc định 14. Lớp không ngày kết: hết dự kiến trong cửa sổ. Kèm HS nợ buổi đã học.</p>
        </div>
        <Alert data-slot="remind-preview">
          <AlertTitle>Cửa sổ {days} ngày</AlertTitle>
          <AlertDescription>
            {hits.length ? `${hits.length} HS · ${runN} sắp hết buổi học · ${debtN} nợ buổi.` : "Không có HS trong cửa sổ."}
          </AlertDescription>
          {hits.length ? (
            <ul className="mt-2 space-y-1 text-sm" data-slot="remind-preview-list">
              {hits.slice(0, 8).map((h) => (
                <li key={h.enrollment_id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{h.student} · {h.className}</span>
                  <StatusChip s={h.reason} />
                </li>
              ))}
              {hits.length > 8 ? <li className="text-xs text-muted-foreground">+{hits.length - 8} HS nữa · xem bảng Cửa sổ</li> : null}
            </ul>
          ) : null}
        </Alert>
      </div>
      <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
        {phone ? (
          <div role="tablist" data-slot="remind-tabs" className="grid grid-cols-2 gap-1 border-b px-3 py-2">
            {[
              { id: "cua-so", label: `Cửa sổ (${hits.length})` },
              { id: "lich-su", label: `Lịch sử lô (${g.remind_batches.length})` },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={cn("h-11 truncate rounded-lg px-2 text-sm font-medium", tab === t.id ? "bg-foreground text-background" : "bg-muted text-muted-foreground")}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <TabsList className="mx-5 mt-3 h-auto w-fit" data-slot="remind-tabs">
            <TabsTrigger value="cua-so">Cửa sổ ({hits.length})</TabsTrigger>
            <TabsTrigger value="lich-su">Lịch sử lô ({g.remind_batches.length})</TabsTrigger>
          </TabsList>
        )}
        <TabsContent value="cua-so" className="mt-0 flex min-h-0 flex-1 flex-col">
          {hits.length ? (
            phone ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                {hits.map((h) => (
                  <div
                    key={h.enrollment_id}
                    data-slot="remind-hit"
                    className="rounded-xl border bg-card px-3 py-3"
                    onContextMenu={(e) => { e.preventDefault(); hitMenu.onRowContextMenu(h, e); }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{h.student}</p>
                      <StatusChip s={h.reason} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{h.className} · còn {h.remaining} · nợ {h.debt} · {h.guardian}</p>
                  </div>
                ))}
              </div>
            ) : (
              <TableStage>
                <DataTable
                  columns={hitCols}
                  data={hits}
                  getRowId={(r) => r.enrollment_id}
                  searchPlaceholder="Tìm học sinh trong cửa sổ"
                  screen="nhac-nap-cua-so"
                  facets={[{ id: "reason", label: "Lý do", options: REASON_FACET }]}
                  onRowContextMenu={hitMenu.onRowContextMenu}
                />
              </TableStage>
            )
          ) : (
            <Empty t="Không có HS trong cửa sổ" />
          )}
        </TabsContent>
        <TabsContent value="lich-su" className="mt-0 flex min-h-0 flex-1 flex-col" data-slot="remind-history">
          {rows.length ? (
            phone ? (
              <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
                {g.remind_batches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    data-slot="remind-batch"
                    className="min-h-11 w-full rounded-xl border bg-card px-3 py-3 text-left"
                    onClick={() => go("nhac-nap-detail", b.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      const row = rows.find((r) => r.id === b.id);
                      if (row) batchMenu.onRowContextMenu(row, e);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{fmtClock(b.ran_at)}</p>
                      <StatusChip s={b.status} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{b.days_before} ngày · {b.counts.runout} sắp hết · {b.counts.debt} nợ · {b.counts.sent} gửi</p>
                  </button>
                ))}
              </div>
            ) : (
              <TableStage>
                <DataTable
                  columns={batchCols}
                  data={rows}
                  getRowId={(r) => r.id}
                  searchPlaceholder="Tìm lô"
                  screen="nhac-nap-lich-su"
                  facets={[{ id: "status", label: "Trạng thái", options: [{ value: "queued", label: "chờ gửi" }, { value: "sent", label: "đã gửi" }] }]}
                  onRowClick={(row) => go("nhac-nap-detail", row.id)}
                  onRowContextMenu={batchMenu.onRowContextMenu}
                />
              </TableStage>
            )
          ) : (
            <Empty t="Chưa có lô nhắc" cta={canSend(role) ? "Chạy lô" : undefined} onCta={canSend(role) ? run : undefined} />
          )}
        </TabsContent>
      </Tabs>
      {hitMenu.menu ? (
        <RowContextMenu
          pos={hitMenu.menu.pos}
          onClose={() => hitMenu.setMenu(null)}
          onDetail={() => go("hs-detail", hitMenu.menu!.row.student_id)}
          onEdit={enrollWrite ? () => setModal("enroll", hitMenu.menu!.row.enrollment_id) : undefined}
        />
      ) : null}
      {batchMenu.menu ? (
        <RowContextMenu
          pos={batchMenu.menu.pos}
          onClose={() => batchMenu.setMenu(null)}
          onDetail={() => go("nhac-nap-detail", batchMenu.menu!.row.id)}
          onDelete={write ? () => batchMenu.setPending(batchMenu.menu!.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!batchMenu.pending}
        title="Xóa lô nhắc?"
        name={batchMenu.pending ? fmtClock(batchMenu.pending.when) : ""}
        onClose={() => batchMenu.setPending(null)}
        onConfirm={() => { if (batchMenu.pending) deleteRemindBatch(batchMenu.pending.id); batchMenu.setPending(null); }}
      />
    </div>
  );
}

function NhacNapDetail() {
  const g = useEdu((s) => s.graph)!;
  const id = useEdu((s) => s.route.id);
  const role = useEdu((s) => s.role);
  const go = useEdu((s) => s.go);
  const setModal = useEdu((s) => s.setModal);
  const sendRemindBatch = useEdu((s) => s.sendRemindBatch);
  const deleteRemindBatch = useEdu((s) => s.deleteRemindBatch);
  const openPeek = useEdu((s) => s.openPeek);
  const phone = useEdu((s) => s.device) === "phone";
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const itemMenu = useRowActions<ItemRow>();
  const b = one(g.remind_batches, id);
  if (!b) return <Empty t="Không có lô" />;
  const items = g.remind_items.filter((x) => x.batch_id === b.id);
  const rows: ItemRow[] = items.map((x) => {
    const grd = x.guardian_id ? one(g.guardians, x.guardian_id) : null;
    return {
      ...x,
      student: stuName(g, x.student_id),
      className: one(g.classes, x.class_id)?.name || x.class_id,
      ph: grd?.full_name || "—",
      zalo: grd?.zalo_status || "—",
    };
  });
  const open = (openId ? items.find((x) => x.id === openId) : items[0]) || null;
  const cols: ColumnDef<ItemRow>[] = [
    { accessorKey: "student", header: "Học sinh", cell: ({ row }) => <Person name={row.original.student} sub={row.original.className} /> },
    { accessorKey: "reason", header: "Lý do", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "remaining", header: "Còn", cell: ({ row }) => remainLabel(row.original.remaining, row.original.days_left) },
    { accessorKey: "debt", header: "Nợ" },
    { accessorKey: "ph", header: "PH" },
    { accessorKey: "zalo", header: "Zalo", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
    { accessorKey: "status", header: "TT", cell: ({ getValue }) => <StatusChip s={String(getValue())} /> },
  ];
  const queued = items.some((x) => x.status === "queued" || x.status === "failed");
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="nhac-nap-detail">
      <PageHead
        trail={[{ label: "Nhắc nạp", go: "nhac-nap" }, { label: fmtClock(b.ran_at) }]}
        actions={
          <div className="flex items-center gap-1">
            {canSend(role) && queued ? <Button data-slot="remind-send" onClick={() => sendRemindBatch(b.id)}>Duyệt & gửi</Button> : null}
            {canSend(role) ? <PageMore onDelete={() => setConfirm(true)} /> : null}
          </div>
        }
      />
      <div className={cn("shrink-0 border-b", phone ? "p-3" : "p-5")}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip s={b.status} />
          <span className="text-sm text-muted-foreground">Cửa sổ {b.days_before} ngày · {items.length} HS · {b.counts.sent} gửi · {b.counts.failed} lỗi</span>
        </div>
        {open ? (
          <div className="mt-3 rounded-xl border bg-card p-3" data-slot="remind-body">
            <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nội dung nhắc · {stuName(g, open.student_id)}</p>
            <p className="text-sm leading-relaxed">{open.body}</p>
            {open.fail_reason ? <p className="mt-1 text-xs text-bad">{open.fail_reason}</p> : null}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Bấm dòng để xem nội dung nhắc.</p>
        )}
      </div>
      {phone ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              data-slot="remind-item"
              className={cn("min-h-11 w-full rounded-xl border bg-card px-3 py-3 text-left", open?.id === r.id && "ring-2 ring-foreground/20")}
              onClick={() => setOpenId(r.id)}
              onContextMenu={(e) => { e.preventDefault(); itemMenu.onRowContextMenu(r, e); }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{r.student}</p>
                <StatusChip s={r.status} />
              </div>
              <div className="mt-1 flex flex-wrap gap-1"><StatusChip s={r.reason} /></div>
              <p className="mt-1 text-xs text-muted-foreground">{r.className} · còn {r.remaining} · nợ {r.debt}</p>
            </button>
          ))}
        </div>
      ) : (
        <TableStage>
          <DataTable
            columns={cols}
            data={rows}
            getRowId={(r) => r.id}
            activeId={open?.id}
            searchPlaceholder="Tìm học sinh trong lô"
            screen="nhac-nap-detail"
            facets={[
              { id: "reason", label: "Lý do", options: REASON_FACET },
              { id: "status", label: "TT", options: [{ value: "queued", label: "chờ gửi" }, { value: "sent", label: "đã gửi" }, { value: "failed", label: "lỗi" }] },
            ]}
            onRowClick={(row, e) => {
              if (e.metaKey || e.ctrlKey) openPeek("student", row.student_id);
              else setOpenId(row.id);
            }}
            onRowContextMenu={itemMenu.onRowContextMenu}
          />
        </TableStage>
      )}
      {itemMenu.menu ? (
        <RowContextMenu
          pos={itemMenu.menu.pos}
          onClose={() => itemMenu.setMenu(null)}
          onDetail={() => go("hs-detail", itemMenu.menu!.row.student_id)}
          onEdit={canWrite(role, "enrollment") ? () => setModal("enroll", itemMenu.menu!.row.enrollment_id) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={confirm}
        title="Xóa lô nhắc?"
        name={fmtClock(b.ran_at)}
        onClose={() => setConfirm(false)}
        onConfirm={() => { setConfirm(false); deleteRemindBatch(b.id); }}
      />
    </div>
  );
}

function remainLabel(remaining: number, daysLeft: number | null) {
  if (daysLeft != null) return `${remaining} · ${daysLeft} ngày`;
  return String(remaining);
}

function fmtClock(iso: string) {
  const p = iso.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!p) return iso;
  return `${p[3]}/${p[2]} ${p[4]}:${p[5]}`;
}
