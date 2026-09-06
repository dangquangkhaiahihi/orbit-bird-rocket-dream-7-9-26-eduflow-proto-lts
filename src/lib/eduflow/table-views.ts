import { nid } from "./format";

export const TABLE_VIEWS_LS = "eduflow-table-views-v1";

export type Join = "and" | "or";
export type FieldKind = "text" | "select" | "number" | "date";
export type FilterOp =
  | "contains"
  | "not_contains"
  | "eq"
  | "neq"
  | "starts"
  | "empty"
  | "not_empty"
  | "in"
  | "not_in"
  | "gt"
  | "lt"
  | "gte"
  | "lte";

export type FilterRule = { id: string; field: string; op: FilterOp; value: string | string[] };
export type FilterChild = { type: "rule"; rule: FilterRule } | { type: "group"; group: FilterGroup };
export type FilterGroup = { id: string; join: Join; children: FilterChild[] };
export type SortRule = { id: string; field: string; dir: "asc" | "desc" };

export type TableField = {
  id: string;
  label: string;
  kind: FieldKind;
  options?: Array<{ value: string; label: string }>;
};

export type TableViewState = {
  filter: FilterGroup;
  sorts: SortRule[];
  groupBy: string | null;
  columnVisibility: Record<string, boolean>;
  columnOrder: string[];
};

export type SavedView = TableViewState & {
  id: string;
  name: string;
  screen: string;
  account: string;
};

type ViewBag = {
  views: SavedView[];
  active: Record<string, string>;
};

export const OPS: Record<FieldKind, Array<{ id: FilterOp; label: string }>> = {
  text: [
    { id: "contains", label: "chứa" },
    { id: "not_contains", label: "không chứa" },
    { id: "eq", label: "là" },
    { id: "neq", label: "không là" },
    { id: "starts", label: "bắt đầu bằng" },
    { id: "empty", label: "trống" },
    { id: "not_empty", label: "không trống" },
  ],
  select: [
    { id: "eq", label: "là" },
    { id: "neq", label: "không là" },
    { id: "in", label: "một trong" },
    { id: "not_in", label: "không trong" },
    { id: "empty", label: "trống" },
    { id: "not_empty", label: "không trống" },
  ],
  number: [
    { id: "eq", label: "=" },
    { id: "neq", label: "≠" },
    { id: "gt", label: ">" },
    { id: "gte", label: "≥" },
    { id: "lt", label: "<" },
    { id: "lte", label: "≤" },
    { id: "empty", label: "trống" },
    { id: "not_empty", label: "không trống" },
  ],
  date: [
    { id: "eq", label: "là ngày" },
    { id: "gte", label: "từ ngày" },
    { id: "lte", label: "đến ngày" },
    { id: "gt", label: "sau" },
    { id: "lt", label: "trước" },
    { id: "empty", label: "trống" },
    { id: "not_empty", label: "không trống" },
  ],
};

export function defaultOp(kind: FieldKind): FilterOp {
  if (kind === "select") return "eq";
  if (kind === "number") return "eq";
  if (kind === "date") return "eq";
  return "contains";
}

export function emptyGroup(): FilterGroup {
  return { id: nid("fg"), join: "and", children: [] };
}

export function emptyRule(field = "", op: FilterOp = "contains"): FilterRule {
  return { id: nid("fr"), field, op, value: "" };
}

export function emptyState(): TableViewState {
  return { filter: emptyGroup(), sorts: [], groupBy: null, columnVisibility: {}, columnOrder: [] };
}

export function viewKey(account: string, screen: string) {
  return `${account}:${screen}`;
}

export function countRules(g: FilterGroup): number {
  return g.children.reduce((n, ch) => n + (ch.type === "rule" ? 1 : countRules(ch.group)), 0);
}

export function stateSig(s: TableViewState) {
  return JSON.stringify({
    filter: stripIds(s.filter),
    sorts: s.sorts.map((x) => ({ field: x.field, dir: x.dir })),
    groupBy: s.groupBy || "",
    columnVisibility: s.columnVisibility,
    columnOrder: s.columnOrder,
  });
}

function stripIds(g: FilterGroup): unknown {
  return {
    join: g.join,
    children: g.children.map((ch) =>
      ch.type === "rule"
        ? { type: "rule", field: ch.rule.field, op: ch.rule.op, value: ch.rule.value }
        : { type: "group", group: stripIds(ch.group) },
    ),
  };
}

export function addRuleTo(g: FilterGroup, targetId: string, rule: FilterRule): FilterGroup {
  if (g.id === targetId) return { ...g, children: [...g.children, { type: "rule", rule }] };
  return {
    ...g,
    children: g.children.map((ch) => (ch.type === "group" ? { type: "group", group: addRuleTo(ch.group, targetId, rule) } : ch)),
  };
}

export function addGroupTo(g: FilterGroup, targetId: string, child: FilterGroup): FilterGroup {
  if (g.id === targetId) return { ...g, children: [...g.children, { type: "group", group: child }] };
  return {
    ...g,
    children: g.children.map((ch) => (ch.type === "group" ? { type: "group", group: addGroupTo(ch.group, targetId, child) } : ch)),
  };
}

export function removeFrom(g: FilterGroup, childId: string): FilterGroup {
  return {
    ...g,
    children: g.children
      .filter((ch) => (ch.type === "rule" ? ch.rule.id !== childId : ch.group.id !== childId))
      .map((ch) => (ch.type === "group" ? { type: "group", group: removeFrom(ch.group, childId) } : ch)),
  };
}

export function patchRule(g: FilterGroup, ruleId: string, patch: Partial<FilterRule>): FilterGroup {
  return {
    ...g,
    children: g.children.map((ch) => {
      if (ch.type === "rule" && ch.rule.id === ruleId) return { type: "rule" as const, rule: { ...ch.rule, ...patch } };
      if (ch.type === "group") return { type: "group" as const, group: patchRule(ch.group, ruleId, patch) };
      return ch;
    }),
  };
}

export function patchJoin(g: FilterGroup, groupId: string, join: Join): FilterGroup {
  if (g.id === groupId) return { ...g, join };
  return {
    ...g,
    children: g.children.map((ch) => (ch.type === "group" ? { type: "group", group: patchJoin(ch.group, groupId, join) } : ch)),
  };
}

function loadBag(): ViewBag {
  try {
    const raw = localStorage.getItem(TABLE_VIEWS_LS);
    if (!raw) return { views: [], active: {} };
    const p = JSON.parse(raw) as ViewBag;
    return { views: Array.isArray(p.views) ? p.views : [], active: p.active && typeof p.active === "object" ? p.active : {} };
  } catch {
    return { views: [], active: {} };
  }
}

function saveBag(bag: ViewBag) {
  localStorage.setItem(TABLE_VIEWS_LS, JSON.stringify(bag));
}

export function viewsFor(account: string, screen: string) {
  return loadBag().views.filter((v) => v.account === account && v.screen === screen);
}

export function activeViewId(account: string, screen: string) {
  return loadBag().active[viewKey(account, screen)] || "";
}

export function setActiveViewId(account: string, screen: string, id: string) {
  const bag = loadBag();
  bag.active[viewKey(account, screen)] = id;
  saveBag(bag);
}

export function upsertView(view: SavedView) {
  const bag = loadBag();
  const i = bag.views.findIndex((v) => v.id === view.id);
  if (i >= 0) bag.views[i] = view;
  else bag.views.push(view);
  bag.active[viewKey(view.account, view.screen)] = view.id;
  saveBag(bag);
}

export function deleteView(id: string) {
  const bag = loadBag();
  const hit = bag.views.find((v) => v.id === id);
  bag.views = bag.views.filter((v) => v.id !== id);
  if (hit) {
    const k = viewKey(hit.account, hit.screen);
    if (bag.active[k] === id) delete bag.active[k];
  }
  saveBag(bag);
}

export function renameView(id: string, name: string) {
  const bag = loadBag();
  const hit = bag.views.find((v) => v.id === id);
  if (hit) hit.name = name.trim() || hit.name;
  saveBag(bag);
}

export function textOf(v: unknown) {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map(String).join(" ");
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

export function cellOf<T>(row: T, field: string) {
  return (row as Record<string, unknown>)[field];
}

function emptyVal(v: unknown) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const t = String(v).trim();
  return t === "" || t === "—";
}

function numOf(v: unknown) {
  if (typeof v === "number") return v;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function listOf(value: string | string[]) {
  return (Array.isArray(value) ? value : String(value).split(",").map((s) => s.trim()).filter(Boolean)).map(String);
}

export function matchRule<T>(row: T, rule: FilterRule) {
  if (!rule.field) return true;
  const raw = cellOf(row, rule.field);
  const text = textOf(raw).toLowerCase();
  const needle = Array.isArray(rule.value) ? "" : String(rule.value ?? "").toLowerCase();
  if (rule.op === "empty") return emptyVal(raw);
  if (rule.op === "not_empty") return !emptyVal(raw);
  if (rule.op === "contains") return !needle || text.includes(needle);
  if (rule.op === "not_contains") return !needle || !text.includes(needle);
  if (rule.op === "starts") return !needle || text.startsWith(needle);
  if (rule.op === "eq") return text === needle || textOf(raw) === String(rule.value ?? "");
  if (rule.op === "neq") return text !== needle && textOf(raw) !== String(rule.value ?? "");
  if (rule.op === "in") {
    const set = listOf(rule.value);
    if (!set.length) return true;
    return set.includes(textOf(raw)) || set.includes(text);
  }
  if (rule.op === "not_in") {
    const set = listOf(rule.value);
    if (!set.length) return true;
    return !set.includes(textOf(raw)) && !set.includes(text);
  }
  const left = numOf(raw);
  const right = numOf(rule.value);
  if (left == null || right == null) {
    const a = textOf(raw);
    const b = String(rule.value ?? "");
    if (rule.op === "gt") return a > b;
    if (rule.op === "gte") return a >= b;
    if (rule.op === "lt") return a < b;
    if (rule.op === "lte") return a <= b;
    return true;
  }
  if (rule.op === "gt") return left > right;
  if (rule.op === "gte") return left >= right;
  if (rule.op === "lt") return left < right;
  if (rule.op === "lte") return left <= right;
  return true;
}

export function matchGroup<T>(row: T, g: FilterGroup): boolean {
  if (!g.children.length) return true;
  const hits = g.children.map((ch) => (ch.type === "rule" ? matchRule(row, ch.rule) : matchGroup(row, ch.group)));
  return g.join === "and" ? hits.every(Boolean) : hits.some(Boolean);
}

export function matchSearch<T>(row: T, q: string, fields: TableField[]) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => textOf(cellOf(row, f.id)).toLowerCase().includes(s));
}

export type Facet = { id: string; label: string; options: Array<{ value: string; label: string }> };

export function inferFields<T>(
  columns: Array<{ id?: string; accessorKey?: unknown; header?: unknown }>,
  data: T[],
  facets: Facet[] = [],
): TableField[] {
  const out: TableField[] = [];
  for (const col of columns) {
    const id = String(col.accessorKey || col.id || "");
    if (!id || id === "act") continue;
    const label = typeof col.header === "string" && col.header ? col.header : id;
    const facet = facets.find((f) => f.id === id);
    const values = data.map((row) => cellOf(row, id));
    const unique = [...new Set(values.map((v) => textOf(v)).filter((v) => v && v !== "—"))];
    let kind: FieldKind = "text";
    if (facet) kind = "select";
    else if (values.length && values.every((v) => v == null || v === "" || typeof v === "number" || /^-?\d+(\.\d+)?$/.test(String(v)))) kind = "number";
    else if (unique.length && unique.every((v) => /^\d{4}-\d{2}-\d{2}/.test(v))) kind = "date";
    else if (unique.length > 1 && unique.length <= 12 && unique.length < Math.max(4, data.length * 0.7)) kind = "select";
    const options = facet?.options || (kind === "select" ? unique.slice(0, 24).map((v) => ({ value: v, label: v })) : undefined);
    out.push({ id, label, kind, options });
  }
  for (const f of facets) {
    if (!out.some((x) => x.id === f.id)) out.push({ id: f.id, label: f.label, kind: "select", options: f.options });
  }
  return out;
}
