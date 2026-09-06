import { useEffect, useMemo, useState } from "react";
import {
  type ColumnDef,
  type ColumnOrderState,
  type Row,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Group,
  ListFilter,
  Plus,
  Search,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { actorOf, nid } from "@/lib/eduflow/format";
import { useEdu } from "@/lib/eduflow/store";
import {
  type Facet,
  type FilterGroup,
  type FilterOp,
  type FilterRule,
  type SavedView,
  type SortRule,
  type TableField,
  type TableViewState,
  OPS,
  activeViewId,
  addGroupTo,
  addRuleTo,
  countRules,
  defaultOp,
  deleteView,
  emptyGroup,
  emptyRule,
  emptyState,
  inferFields,
  matchGroup,
  matchSearch,
  patchJoin,
  patchRule,
  removeFrom,
  renameView,
  setActiveViewId,
  stateSig,
  textOf,
  cellOf,
  upsertView,
  viewsFor,
} from "@/lib/eduflow/table-views";
import { cn } from "@/lib/utils";
import { usePhone } from "./phone-chrome";

export type { Facet };

type Props<T> = {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  searchPlaceholder?: string;
  facets?: Facet[];
  onRowClick?: (row: T, e: React.MouseEvent) => void;
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  getRowId?: (row: T) => string;
  activeId?: string | null;
  empty?: string;
  screen?: string;
};

function keepOpen(e: Event) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("[data-slot=select-content], [data-slot=popover-content], [data-slot=dropdown-menu-content]")) e.preventDefault();
}

export function DataTable<T>({
  columns, data, searchPlaceholder = "Tìm…", facets = [], onRowClick, onRowContextMenu, getRowId, activeId, empty = "Không có dòng.", screen,
}: Props<T>) {
  const phone = usePhone();
  const role = useEdu((s) => s.role);
  const route = useEdu((s) => s.route.n);
  const account = role;
  const screenId = screen || route;
  const colSig = columns.map((c) => String((c as { accessorKey?: string; id?: string }).accessorKey || c.id || "")).join("|");
  const facetSig = facets.map((f) => `${f.id}:${f.options.map((o) => o.value).join(",")}`).join("|");
  const fields = useMemo(() => inferFields(columns, data, facets), [colSig, facetSig, data]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterGroup>(() => emptyGroup());
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: phone ? 20 : 8 });
  const [saved, setSaved] = useState<SavedView[]>(() => viewsFor(account, screenId));
  const [activeIdView, setActiveIdView] = useState(() => activeViewId(account, screenId));
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  useEffect(() => {
    const list = viewsFor(account, screenId);
    const aid = activeViewId(account, screenId);
    setSaved(list);
    setActiveIdView(aid);
    const v = list.find((x) => x.id === aid);
    applyView(v || null);
    setSearch("");
    setPagination((p) => (p.pageIndex === 0 ? p : { ...p, pageIndex: 0 }));
  }, [account, screenId]);

  function currentState(): TableViewState {
    return { filter, sorts, groupBy, columnVisibility, columnOrder };
  }

  function applyView(v: SavedView | null) {
    const s = v || emptyState();
    setFilter(s.filter?.children ? s.filter : emptyGroup());
    setSorts(s.sorts || []);
    setGroupBy(s.groupBy || null);
    setColumnVisibility(s.columnVisibility || {});
    setColumnOrder(s.columnOrder || []);
  }

  const activeView = saved.find((v) => v.id === activeIdView) || null;
  const dirty = activeView ? stateSig(currentState()) !== stateSig(activeView) : countRules(filter) + sorts.length + (groupBy ? 1 : 0) > 0;

  function refreshSaved() {
    setSaved(viewsFor(account, screenId));
    setActiveIdView(activeViewId(account, screenId));
  }

  function pickView(id: string) {
    setActiveViewId(account, screenId, id);
    setActiveIdView(id);
    applyView(id ? saved.find((v) => v.id === id) || null : null);
    setSearch("");
  }

  function persist(name: string, id?: string) {
    const view: SavedView = {
      ...currentState(),
      id: id || nid("tv"),
      name: name.trim() || "View",
      screen: screenId,
      account,
    };
    upsertView(view);
    refreshSaved();
    setActiveIdView(view.id);
    setSaveOpen(false);
    setSaveName("");
    setRenameId(null);
  }

  const filtered = useMemo(() => {
    return data.filter((row) => matchSearch(row, search, fields) && matchGroup(row, filter));
  }, [data, search, fields, filter]);

  const sorting = useMemo<SortingState>(() => sorts.map((s) => ({ id: s.field, desc: s.dir === "desc" })), [sorts]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, columnVisibility, columnOrder, pagination },
    onSortingChange: (up) => {
      const next = typeof up === "function" ? up(sorting) : up;
      setSorts(next.map((s) => ({ id: nid("srt"), field: s.id, dir: s.desc ? "desc" : "asc" })));
    },
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getRowId: getRowId ? (row) => getRowId(row) : undefined,
    enableMultiSort: true,
  });

  const pageSize = pagination.pageSize;
  const pageIndex = pagination.pageIndex;
  const total = filtered.length;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);
  const leaf = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const pageRows = table.getRowModel().rows;
  const grouped = useMemo(() => {
    if (!groupBy) return null;
    const field = fields.find((f) => f.id === groupBy);
    const map = new Map<string, typeof pageRows>();
    for (const row of pageRows) {
      const raw = cellOf(row.original, groupBy);
      const key = textOf(raw) || "(trống)";
      const list = map.get(key) || [];
      list.push(row);
      map.set(key, list);
    }
    return { field, map };
  }, [groupBy, pageRows, fields]);

  function colLabel(col: { id: string; columnDef: { header?: unknown } }) {
    const h = col.columnDef.header;
    return typeof h === "string" && h ? h : "";
  }

  const ruleN = countRules(filter);
  const actor = actorOf(account);

  const filterBody = (
    <FilterEditor
      group={filter}
      fields={fields}
      depth={0}
      onChange={setFilter}
    />
  );
  const sortBody = (
    <SortEditor fields={fields} sorts={sorts} onChange={setSorts} />
  );
  const groupBody = (
    <GroupEditor fields={fields} groupBy={groupBy} onChange={setGroupBy} />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" data-slot="data-table">
      <div className={cn("flex flex-wrap items-center gap-1.5 border-b", phone ? "px-3 py-2" : "px-5 py-2")} data-slot="table-views">
        <ViewChip label="Mặc định" on={activeIdView === ""} onClick={() => pickView("")} />
        {saved.map((v) => (
          <ViewChip
            key={v.id}
            label={v.name}
            on={v.id === activeIdView}
            onClick={() => pickView(v.id)}
            onRename={() => { setRenameId(v.id); setSaveName(v.name); setSaveOpen(true); }}
            onDelete={() => { deleteView(v.id); refreshSaved(); if (activeIdView === v.id) applyView(null); }}
          />
        ))}
        <Button variant="ghost" size="icon-sm" className={phone ? "size-10" : "size-8"} data-slot="table-view-add" onClick={() => { setRenameId(null); setSaveName(""); setSaveOpen(true); }}>
          <Plus className="size-4" />
        </Button>
        {dirty && activeIdView ? (
          <Button variant="outline" size="sm" className="h-8" data-slot="table-view-save" onClick={() => persist(activeView?.name || "View", activeIdView)}>
            Lưu
          </Button>
        ) : null}
      </div>

      <div className={cn("flex flex-wrap items-center gap-2 border-b", phone ? "px-3 py-2" : "px-5 py-3")}>
        <InputGroup className={cn("h-9", phone ? "min-w-0 flex-1" : "max-w-sm min-w-56 flex-1")}>
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            data-slot="table-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
          />
          {search ? (
            <InputGroupAddon align="inline-end">
              <Button variant="ghost" size="icon-xs" onClick={() => setSearch("")}><X className="size-3.5" /></Button>
            </InputGroupAddon>
          ) : null}
        </InputGroup>

        {phone ? (
          <>
            <ToolBtn icon={ListFilter} label="Lọc" n={ruleN} onClick={() => setFilterOpen(true)} slot="table-filter-btn" />
            <ToolBtn icon={ArrowUpDown} label="Sắp" n={sorts.length} onClick={() => setSortOpen(true)} slot="table-sort-btn" />
            <ToolBtn icon={Group} label="Nhóm" n={groupBy ? 1 : 0} onClick={() => setGroupOpen(true)} slot="table-group-btn" />
          </>
        ) : (
          <>
            <Popover open={filterOpen} onOpenChange={(o) => { setFilterOpen(o); if (o) { setSortOpen(false); setGroupOpen(false); } }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9" data-slot="table-filter-btn">
                  <ListFilter className="size-4" /> Lọc
                  {ruleN ? <Badge variant="secondary" className="ml-1">{ruleN}</Badge> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="max-h-[70vh] w-[28rem] overflow-auto p-3" onPointerDownOutside={keepOpen} onFocusOutside={keepOpen} onInteractOutside={keepOpen} data-slot="table-filter">
                {filterBody}
              </PopoverContent>
            </Popover>
            <Popover open={sortOpen} onOpenChange={(o) => { setSortOpen(o); if (o) { setFilterOpen(false); setGroupOpen(false); } }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9" data-slot="table-sort-btn">
                  <ArrowUpDown className="size-4" /> Sắp xếp
                  {sorts.length ? <Badge variant="secondary" className="ml-1">{sorts.length}</Badge> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3" onPointerDownOutside={keepOpen} onFocusOutside={keepOpen} onInteractOutside={keepOpen} data-slot="table-sort">
                {sortBody}
              </PopoverContent>
            </Popover>
            <Popover open={groupOpen} onOpenChange={(o) => { setGroupOpen(o); if (o) { setFilterOpen(false); setSortOpen(false); } }}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9" data-slot="table-group-btn">
                  <Group className="size-4" /> Nhóm
                  {groupBy ? <Badge variant="secondary" className="ml-1">1</Badge> : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3" onPointerDownOutside={keepOpen} onFocusOutside={keepOpen} onInteractOutside={keepOpen} data-slot="table-group">
                {groupBody}
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-9"><Columns3 className="size-4" /> Cột</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Hiện / ẩn · thứ tự</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {leaf.map((col, i) => (
                  <div key={col.id} className="flex items-center gap-1 pr-1">
                    <DropdownMenuCheckboxItem
                      className="flex-1"
                      checked={col.getIsVisible()}
                      onCheckedChange={(v) => col.toggleVisibility(!!v)}
                      onSelect={(e) => e.preventDefault()}
                    >
                      {typeof col.columnDef.header === "string" ? col.columnDef.header : col.id}
                    </DropdownMenuCheckboxItem>
                    <Button variant="ghost" size="icon-sm" className="size-7" disabled={i === 0} onClick={() => {
                      const ids = leaf.map((c) => c.id);
                      [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                      table.setColumnOrder(ids);
                    }}>↑</Button>
                    <Button variant="ghost" size="icon-sm" className="size-7" disabled={i === leaf.length - 1} onClick={() => {
                      const ids = leaf.map((c) => c.id);
                      [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                      table.setColumnOrder(ids);
                    }}>↓</Button>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      {ruleN || sorts.length || groupBy ? (
        <div className={cn("flex flex-wrap items-center gap-1.5 border-b py-2", phone ? "px-3" : "px-5")}>
          {ruleN ? <Badge variant="secondary">Lọc {ruleN}</Badge> : null}
          {sorts.map((s) => {
            const f = fields.find((x) => x.id === s.field);
            return <Badge key={s.id} variant="secondary">{f?.label || s.field} {s.dir === "asc" ? "↑" : "↓"}</Badge>;
          })}
          {groupBy ? <Badge variant="secondary">Nhóm {fields.find((f) => f.id === groupBy)?.label || groupBy}</Badge> : null}
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => { setFilter(emptyGroup()); setSorts([]); setGroupBy(null); }}>Xóa lọc</Button>
        </div>
      ) : null}

      <div data-slot="table-scroll" className="min-h-0 min-w-0 flex-1 overflow-auto">
        {phone ? (
          <div data-slot="phone-card-list" className="px-3 py-2">
            {pageRows.length ? (
              grouped ? [...grouped.map.entries()].map(([key, rows]) => (
                <div key={key}>
                  <p className="px-1 py-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{grouped.field?.label} · {key} · {rows.length}</p>
                  {rows.map((row) => (
                    <PhoneCard key={row.id} row={row} activeId={activeId} onRowClick={onRowClick} onRowContextMenu={onRowContextMenu} colLabel={colLabel} />
                  ))}
                </div>
              )) : pageRows.map((row) => (
                <PhoneCard key={row.id} row={row} activeId={activeId} onRowClick={onRowClick} onRowContextMenu={onRowContextMenu} colLabel={colLabel} />
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">{empty}</p>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-background">
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead key={h.id} className="whitespace-nowrap">
                      {h.isPlaceholder ? null : h.column.getCanSort() ? (
                        <button type="button" className="inline-flex items-center gap-1" onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === "asc" ? <ArrowUp className="size-3.5" /> : h.column.getIsSorted() === "desc" ? <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 text-muted-foreground" />}
                        </button>
                      ) : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {pageRows.length ? (
                grouped ? [...grouped.map.entries()].flatMap(([key, rows]) => [
                  <TableRow key={`g-${key}`} className="hover:bg-transparent">
                    <TableCell colSpan={columns.length} data-slot="table-group-row" className="bg-muted/60 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {grouped.field?.label} · {key} · {rows.length}
                    </TableCell>
                  </TableRow>,
                  ...rows.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={activeId && row.id === activeId ? "selected" : undefined}
                      className={cn((onRowClick || onRowContextMenu) && "cursor-pointer")}
                      onClick={(e) => onRowClick?.(row.original, e)}
                      onContextMenu={(e) => {
                        if (!onRowContextMenu) return;
                        e.preventDefault();
                        onRowContextMenu(row.original, e);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                      ))}
                    </TableRow>
                  )),
                ]) : pageRows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={activeId && row.id === activeId ? "selected" : undefined}
                    className={cn((onRowClick || onRowContextMenu) && "cursor-pointer")}
                    onClick={(e) => onRowClick?.(row.original, e)}
                    onContextMenu={(e) => {
                      if (!onRowContextMenu) return;
                      e.preventDefault();
                      onRowContextMenu(row.original, e);
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">{empty}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t py-2.5 text-sm text-muted-foreground", phone ? "px-3" : "px-5")}>
        <span className="tabular-nums">{from}–{to} / {total} dòng</span>
        <div className="flex items-center gap-1">
          {phone ? null : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">{pageSize} / trang</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {[5, 8, 15, 30].map((n) => (
                  <DropdownMenuItem key={n} onClick={() => table.setPageSize(n)}>{n} / trang</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {phone ? null : <Button variant="outline" size="icon-sm" disabled={!table.getCanPreviousPage()} onClick={() => table.setPageIndex(0)}><ChevronsLeft className="size-4" /></Button>}
          <Button variant="outline" size="icon-sm" className={phone ? "size-10" : undefined} disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft className="size-4" /></Button>
          <Button variant="outline" size="icon-sm" className={phone ? "size-10" : undefined} disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight className="size-4" /></Button>
          {phone ? null : <Button variant="outline" size="icon-sm" disabled={!table.getCanNextPage()} onClick={() => table.setPageIndex(table.getPageCount() - 1)}><ChevronsRight className="size-4" /></Button>}
        </div>
      </div>

      {phone ? (
        <>
          <Sheet open={filterOpen} onOpenChange={setFilterOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-auto p-4" data-slot="table-filter">
              <SheetHeader className="p-0 pb-3"><SheetTitle>Lọc</SheetTitle></SheetHeader>
              {filterBody}
            </SheetContent>
          </Sheet>
          <Sheet open={sortOpen} onOpenChange={setSortOpen}>
            <SheetContent side="bottom" className="max-h-[85vh] overflow-auto p-4" data-slot="table-sort">
              <SheetHeader className="p-0 pb-3"><SheetTitle>Sắp xếp</SheetTitle></SheetHeader>
              {sortBody}
            </SheetContent>
          </Sheet>
          <Sheet open={groupOpen} onOpenChange={setGroupOpen}>
            <SheetContent side="bottom" className="max-h-[70vh] overflow-auto p-4" data-slot="table-group">
              <SheetHeader className="p-0 pb-3"><SheetTitle>Nhóm</SheetTitle></SheetHeader>
              {groupBody}
            </SheetContent>
          </Sheet>
        </>
      ) : null}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent data-slot="table-view-dialog">
          <DialogHeader>
            <DialogTitle>{renameId ? "Đổi tên view" : "Lưu view"}</DialogTitle>
            <DialogDescription>
              Gắn với tài khoản {actor.name} trên màn này. Giáo vụ / Huy / Trợ lý mỗi người một bộ view.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">Tên view</Label>
            <Input id="view-name" data-slot="table-view-name" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="Sắp hết buổi học" className="min-h-11" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Hủy</Button>
            <Button data-slot="table-view-confirm" onClick={() => persist(saveName, renameId || undefined)} disabled={!saveName.trim()}>Lưu</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ToolBtn({ icon: Icon, label, n, onClick, slot }: { icon: typeof ListFilter; label: string; n: number; onClick: () => void; slot: string }) {
  return (
    <Button variant="outline" size="sm" className="h-10" data-slot={slot} onClick={onClick}>
      <Icon className="size-4" /> {label}
      {n ? <Badge variant="secondary" className="ml-1">{n}</Badge> : null}
    </Button>
  );
}

function ViewChip({ label, on, onClick, onRename, onDelete }: { label: string; on: boolean; onClick: () => void; onRename?: () => void; onDelete?: () => void }) {
  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        data-slot="table-view"
        data-active={on ? "1" : "0"}
        onClick={onClick}
        className={cn(
          "h-8 rounded-md px-2.5 text-sm font-medium",
          on ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
          onDelete && on ? "rounded-r-none" : "",
        )}
      >
        {label}
      </button>
      {on && onDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="default" size="icon-sm" className="h-8 w-7 rounded-l-none">···</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={onRename}>Đổi tên</DropdownMenuItem>
            <DropdownMenuItem onClick={onDelete}>Xóa view</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </span>
  );
}

function FilterEditor({
  group, fields, depth, onChange,
}: {
  group: FilterGroup;
  fields: TableField[];
  depth: number;
  onChange: (g: FilterGroup) => void;
}) {
  const first = fields[0];
  function addRule() {
    const field = first?.id || "";
    const op = first ? defaultOp(first.kind) : "contains";
    onChange(addRuleTo(group, group.id, emptyRule(field, op)));
  }
  function addGroup() {
    const child = emptyGroup();
    child.join = group.join === "and" ? "or" : "and";
    if (first) child.children = [{ type: "rule", rule: emptyRule(first.id, defaultOp(first.kind)) }];
    onChange(addGroupTo(group, group.id, child));
  }
  return (
    <div className="space-y-2" data-slot="table-filter-group" data-depth={depth}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{depth ? "Nhóm" : "Where"}</span>
          <ToggleGroup type="single" value={group.join} onValueChange={(v) => { if (v) onChange(patchJoin(group, group.id, v as "and" | "or")); }} size="sm">
            <ToggleGroupItem value="and" className="h-8 px-2.5 text-xs">Và</ToggleGroupItem>
            <ToggleGroupItem value="or" className="h-8 px-2.5 text-xs">Hoặc</ToggleGroupItem>
          </ToggleGroup>
        </div>
        {!group.children.length && !depth ? <p className="text-xs text-muted-foreground">Chưa lọc — mọi dòng.</p> : null}
      </div>
      <div className="space-y-1.5">
        {group.children.map((ch) => ch.type === "rule" ? (
          <RuleRow
            key={ch.rule.id}
            rule={ch.rule}
            fields={fields}
            onPatch={(p) => onChange(patchRule(group, ch.rule.id, p))}
            onRemove={() => onChange(removeFrom(group, ch.rule.id))}
          />
        ) : (
          <div key={ch.group.id} className="rounded-lg border bg-muted/40 p-2">
            <div className="mb-1 flex justify-end">
              <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => onChange(removeFrom(group, ch.group.id))}><X className="size-3.5" /></Button>
            </div>
            <FilterEditor
              group={ch.group}
              fields={fields}
              depth={depth + 1}
              onChange={(next) => onChange({
                ...group,
                children: group.children.map((c) => (c.type === "group" && c.group.id === ch.group.id ? { type: "group", group: next } : c)),
              })}
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Button variant="outline" size="sm" className="h-8" data-slot="table-filter-add" onClick={addRule}><Plus className="size-3.5" /> Thêm lọc</Button>
        {depth < 1 ? (
          <Button variant="ghost" size="sm" className="h-8" data-slot="table-filter-add-group" onClick={addGroup}><Plus className="size-3.5" /> Nhóm lọc</Button>
        ) : null}
      </div>
    </div>
  );
}

function RuleRow({
  rule, fields, onPatch, onRemove,
}: {
  rule: FilterRule;
  fields: TableField[];
  onPatch: (p: Partial<FilterRule>) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.id === rule.field) || fields[0];
  const ops = field ? OPS[field.kind] : OPS.text;
  const needValue = rule.op !== "empty" && rule.op !== "not_empty";
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-slot="table-filter-rule">
      <Select
        value={rule.field}
        onValueChange={(id) => {
          const f = fields.find((x) => x.id === id);
          onPatch({ field: id, op: f ? defaultOp(f.kind) : "contains", value: "" });
        }}
      >
        <SelectTrigger className="h-8 w-32 min-h-8"><SelectValue placeholder="Cột" /></SelectTrigger>
        <SelectContent>
          {fields.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={rule.op} onValueChange={(v) => onPatch({ op: v as FilterOp, value: v === "in" || v === "not_in" ? [] : "" })}>
        <SelectTrigger className="h-8 w-36 min-h-8"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ops.map((o) => <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {needValue ? (
        <ValueInput field={field} rule={rule} onPatch={onPatch} />
      ) : null}
      <Button variant="ghost" size="icon-sm" className="size-8" onClick={onRemove}><X className="size-3.5" /></Button>
    </div>
  );
}

function ValueInput({ field, rule, onPatch }: { field?: TableField; rule: FilterRule; onPatch: (p: Partial<FilterRule>) => void }) {
  if (!field) return null;
  if ((rule.op === "in" || rule.op === "not_in") && field.options?.length) {
    const selected = Array.isArray(rule.value) ? rule.value : rule.value ? [String(rule.value)] : [];
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 min-w-28 justify-between">
            {selected.length ? `${selected.length} giá trị` : "Chọn"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <div className="max-h-48 space-y-1 overflow-auto">
            {field.options.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted">
                <Checkbox
                  checked={selected.includes(o.value)}
                  onCheckedChange={() => {
                    const next = selected.includes(o.value) ? selected.filter((x) => x !== o.value) : [...selected, o.value];
                    onPatch({ value: next });
                  }}
                />
                {o.label}
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
  if (field.kind === "select" && field.options?.length) {
    return (
      <Select value={String(rule.value || "")} onValueChange={(v) => onPatch({ value: v })}>
        <SelectTrigger className="h-8 min-w-28 min-h-8"><SelectValue placeholder="Giá trị" /></SelectTrigger>
        <SelectContent>
          {field.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.kind === "date") {
    return <Input type="date" value={String(rule.value || "")} onChange={(e) => onPatch({ value: e.target.value })} className="h-8 min-h-8 w-36" />;
  }
  if (field.kind === "number") {
    return <Input type="number" value={String(rule.value || "")} onChange={(e) => onPatch({ value: e.target.value })} className="h-8 min-h-8 w-24" />;
  }
  return <Input value={String(Array.isArray(rule.value) ? rule.value.join(" ") : rule.value || "")} onChange={(e) => onPatch({ value: e.target.value })} className="h-8 min-h-8 min-w-28 flex-1" placeholder="Giá trị" />;
}

function SortEditor({ fields, sorts, onChange }: { fields: TableField[]; sorts: SortRule[]; onChange: (s: SortRule[]) => void }) {
  const used = new Set(sorts.map((s) => s.field));
  const rest = fields.filter((f) => !used.has(f.id));
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sắp xếp</p>
      {sorts.length ? sorts.map((s, i) => {
        const f = fields.find((x) => x.id === s.field);
        return (
          <div key={s.id} className="flex items-center gap-1.5" data-slot="table-sort-rule">
            <Select value={s.field} onValueChange={(v) => onChange(sorts.map((x) => x.id === s.id ? { ...x, field: v } : x))}>
              <SelectTrigger className="h-8 min-h-8 flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {fields.filter((x) => x.id === s.field || !used.has(x.id)).map((x) => <SelectItem key={x.id} value={x.id}>{x.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={s.dir} onValueChange={(v) => onChange(sorts.map((x) => x.id === s.id ? { ...x, dir: v as "asc" | "desc" } : x))}>
              <SelectTrigger className="h-8 w-28 min-h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Tăng dần</SelectItem>
                <SelectItem value="desc">Giảm dần</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon-sm" className="size-8" disabled={i === 0} onClick={() => {
              const next = [...sorts];
              [next[i - 1], next[i]] = [next[i], next[i - 1]];
              onChange(next);
            }}>↑</Button>
            <Button variant="ghost" size="icon-sm" className="size-8" onClick={() => onChange(sorts.filter((x) => x.id !== s.id))}><X className="size-3.5" /></Button>
          </div>
        );
      }) : <p className="text-sm text-muted-foreground">Chưa sắp xếp.</p>}
      {rest.length ? (
        <Button variant="outline" size="sm" className="h-8" data-slot="table-sort-add" onClick={() => onChange([...sorts, { id: nid("srt"), field: rest[0].id, dir: "asc" }])}>
          <Plus className="size-3.5" /> Thêm sắp xếp
        </Button>
      ) : null}
      {fNote(fields, sorts)}
    </div>
  );
}

function fNote(fields: TableField[], sorts: SortRule[]) {
  if (sorts.length < 2) return null;
  return <p className="text-xs text-muted-foreground">Thứ tự: {sorts.map((s) => fields.find((f) => f.id === s.field)?.label || s.field).join(" → ")}</p>;
}

function GroupEditor({ fields, groupBy, onChange }: { fields: TableField[]; groupBy: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nhóm theo</p>
      <button
        type="button"
        data-slot="table-group-none"
        className={cn("flex h-9 w-full items-center rounded-md px-2 text-left text-sm", !groupBy ? "bg-foreground text-background" : "hover:bg-muted")}
        onClick={() => onChange(null)}
      >
        Không nhóm
      </button>
      {fields.map((f) => (
        <button
          key={f.id}
          type="button"
          data-slot="table-group-option"
          data-field={f.id}
          className={cn("flex h-9 w-full items-center rounded-md px-2 text-left text-sm", groupBy === f.id ? "bg-foreground text-background" : "hover:bg-muted")}
          onClick={() => onChange(f.id)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function PhoneCard<T>({
  row, activeId, onRowClick, onRowContextMenu, colLabel,
}: {
  row: Row<T>;
  activeId?: string | null;
  onRowClick?: (row: T, e: React.MouseEvent) => void;
  onRowContextMenu?: (row: T, e: React.MouseEvent) => void;
  colLabel: (col: { id: string; columnDef: { header?: unknown } }) => string;
}) {
  const cells = row.getVisibleCells();
  const title = cells[0];
  const rest = cells.slice(1).filter((c) => c.column.id !== "act" && colLabel(c.column));
  const act = cells.find((c) => c.column.id === "act");
  const selected = Boolean(activeId && row.id === activeId);
  return (
    <div
      role="button"
      tabIndex={0}
      data-slot="table-row"
      data-state={selected ? "selected" : undefined}
      className={cn(
        "mb-2 w-full rounded-xl border bg-card px-3 py-3 text-left",
        (onRowClick || onRowContextMenu) && "cursor-pointer",
        selected && "ring-1 ring-foreground",
      )}
      onClick={(e) => onRowClick?.(row.original, e)}
      onContextMenu={(e) => {
        if (!onRowContextMenu) return;
        e.preventDefault();
        onRowContextMenu(row.original, e);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div className="min-w-0 font-medium">
        {title ? flexRender(title.column.columnDef.cell, title.getContext()) : null}
      </div>
      {rest.length ? (
        <dl className="mt-2 space-y-1">
          {rest.map((cell) => (
            <div key={cell.id} className="flex items-start justify-between gap-3 text-sm">
              <dt className="shrink-0 text-muted-foreground">{colLabel(cell.column)}</dt>
              <dd className="min-w-0 text-right">{flexRender(cell.column.columnDef.cell, cell.getContext())}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {act ? (
        <div className="mt-2" onClick={(e) => e.stopPropagation()}>
          {flexRender(act.column.columnDef.cell, act.getContext())}
        </div>
      ) : null}
    </div>
  );
}
