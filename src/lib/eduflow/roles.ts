import type { FeatureFlags, IdentityType, LessonTab, Role, RouteName } from "./types";

export type LaneId = "needs_decision" | "waiting_parent" | "money" | "delivery_failed" | "attendance_pending" | "homework_pending" | "crm";
export type AdminEntity = "branch" | "room" | "teacher" | "student" | "class" | "enrollment" | "staff" | "oa" | "course";
export type Access = "r" | "rw" | "none";

export type AssistantAllow = {
  lanes: LaneId[];
  lessonTabs: LessonTab[];
  adminRW: Record<AdminEntity, Access>;
  canSend: boolean;
  canMoney: boolean;
};

/** Frozen 2026-08-25-role-surface-matrix-assistant-allowlist.md */
export const ASSISTANT_ALLOW: AssistantAllow = {
  lanes: ["needs_decision", "waiting_parent", "money", "delivery_failed", "attendance_pending", "homework_pending", "crm"],
  lessonTabs: ["attendance", "homework", "notes", "timeline"],
  adminRW: {
    branch: "r",
    room: "r",
    teacher: "r",
    student: "r",
    class: "r",
    enrollment: "r",
    staff: "none",
    oa: "none",
    course: "r",
  },
  canSend: false,
  canMoney: false,
};

export const ALL_LESSON_TABS: LessonTab[] = ["attendance", "makeup", "ledger", "homework", "notes", "timeline"];

export const ADMIN_ROUTES: RouteName[] = [
  "chi-nhanh", "phong", "phong-detail", "giao-vien", "gv-detail",
  "nhan-su", "staff-detail", "zalo-oa", "khoa-hoc", "khoa-hoc-detail",
  "so-thu", "nhac-nap", "nhac-nap-detail",
];

const ENTITY_ROUTES: Record<AdminEntity, RouteName[]> = {
  branch: ["chi-nhanh"],
  room: ["phong", "phong-detail"],
  teacher: ["giao-vien", "gv-detail"],
  student: ["hoc-sinh", "hs-detail"],
  class: ["lop", "lop-detail", "lop-moi", "vang", "buoi-bu"],
  course: ["khoa-hoc", "khoa-hoc-detail"],
  enrollment: ["lop-detail", "thu-phi", "so-thu", "nhac-nap", "nhac-nap-detail"],
  staff: ["nhan-su", "staff-detail"],
  oa: ["zalo-oa"],
};

export type NavItem = { n: RouteName; label: string; entity?: AdminEntity; disabled?: boolean };
export type NavModule = { id: string; label: string; items: NavItem[] };

/** Operating surfaces — off while reviewing an import draft. */
export const DRAFT_BLOCKED: RouteName[] = [
  "hom-nay", "nhap-so", "thu-phi", "nhac-nap", "nhac-nap-detail",
  "zalo", "zalo-detail", "zalo-oa", "the",
];
export const DRAFT_HOME: RouteName = "lop";

export function isDraftBlocked(n: RouteName) {
  return DRAFT_BLOCKED.includes(n);
}

/** Live ops (desk, billing, Zalo) — off while reviewing an import draft. */
export function opsEnabled(workspace?: "live" | "draft") {
  return workspace !== "draft";
}

const NAV_MODULES: NavModule[] = [
  {
    id: "ops",
    label: "Vận hành",
    items: [
      { n: "hom-nay", label: "Hôm nay" },
      { n: "buoi", label: "Buổi" },
      { n: "nhap-so", label: "Nhập sổ" },
      { n: "vang", label: "Vắng", entity: "class" },
    ],
  },
  {
    id: "academic",
    label: "Học vụ",
    items: [
      { n: "lop", label: "Lớp", entity: "class" },
      { n: "hoc-sinh", label: "Học sinh", entity: "student" },
      { n: "khoa-hoc", label: "Khóa học", entity: "course" },
    ],
  },
  {
    id: "money",
    label: "Thu phí",
    items: [
      { n: "thu-phi", label: "Bàn thu", entity: "enrollment" },
      { n: "so-thu", label: "Sổ thu", entity: "enrollment" },
      { n: "nhac-nap", label: "Nhắc nạp", entity: "enrollment" },
    ],
  },
  {
    id: "comms",
    label: "Liên lạc",
    items: [{ n: "zalo", label: "Zalo" }],
  },
  {
    id: "school",
    label: "Cơ sở",
    items: [
      { n: "chi-nhanh", label: "Chi nhánh", entity: "branch" },
      { n: "phong", label: "Phòng", entity: "room" },
      { n: "giao-vien", label: "Giáo viên", entity: "teacher" },
      { n: "nhan-su", label: "Nhân sự", entity: "staff" },
      { n: "zalo-oa", label: "OA Zalo", entity: "oa" },
    ],
  },
];

export function adminAccess(role: Role, entity: AdminEntity): Access {
  if (role === "ops") return "rw";
  if (role === "teacher") return "none";
  return ASSISTANT_ALLOW.adminRW[entity];
}

export function canWrite(role: Role, entity: AdminEntity) {
  return adminAccess(role, entity) === "rw";
}

export function canSeeAdmin(role: Role, entity: AdminEntity) {
  return adminAccess(role, entity) !== "none";
}

export function visibleLanes(role: Role): LaneId[] | "all" {
  if (role === "teacher") return ["attendance_pending", "homework_pending"];
  if (role === "assistant") return ASSISTANT_ALLOW.lanes;
  return "all";
}

export function visibleLessonTabs(role: Role): LessonTab[] {
  if (role === "teacher") return ["attendance", "homework", "notes", "timeline"];
  if (role === "assistant") return ASSISTANT_ALLOW.lessonTabs;
  return ALL_LESSON_TABS;
}

export function canMoney(role: Role) {
  return role === "ops";
}

export function canSend(role: Role) {
  return role === "ops";
}

export function canSubOrCancel(role: Role) {
  return role === "ops";
}

function itemVisible(role: Role, item: NavItem) {
  if (role === "teacher") return item.n === "hom-nay" || item.n === "buoi";
  if (item.n === "nhap-so") return role === "ops";
  if (!item.entity) return true;
  return canSeeAdmin(role, item.entity);
}

function flagVisible(item: NavItem, flags?: FeatureFlags | null, identity?: IdentityType | null) {
  if (!flags && !identity) return true;
  if (identity === "SOLO") {
    if (item.n === "chi-nhanh" || item.n === "nhan-su" || item.n === "so-thu" || item.n === "vang") return false;
  }
  if (flags) {
    if (item.n === "chi-nhanh" && !flags.multi_branch_scheduling) return false;
    if (item.n === "nhan-su" && !flags.split_payroll_calculator) return false;
    if ((item.n === "zalo" || item.n === "zalo-oa") && !flags.zalo_zns_notifications) return false;
    if ((item.n === "thu-phi" || item.n === "nhac-nap") && !flags.direct_vietqr_billing) return false;
  }
  return true;
}

export function modulesFor(role: Role, flags?: FeatureFlags | null, identity?: IdentityType | null, workspace?: "live" | "draft"): NavModule[] {
  const effectiveRole = identity === "SOLO" ? "ops" : role;
  const draft = workspace === "draft";
  return NAV_MODULES
    .map((m) => ({
      ...m,
      items: m.items
        .filter((i) => itemVisible(effectiveRole, i) && flagVisible(i, flags, identity))
        .map((i) => (draft && isDraftBlocked(i.n) ? { ...i, disabled: true } : i)),
    }))
    .filter((m) => m.items.length);
}

export function jobsFor(role: Role, flags?: FeatureFlags | null, identity?: IdentityType | null, workspace?: "live" | "draft"): Array<{ id: RouteName; label: string }> {
  return modulesFor(role, flags, identity, workspace).flatMap((m) => m.items.map((i) => ({ id: i.n, label: i.label })));
}

export function booksFor(role: Role, flags?: FeatureFlags | null, identity?: IdentityType | null): Array<{ n: RouteName; label: string; entity: AdminEntity }> {
  return modulesFor(role, flags, identity)
    .filter((m) => m.id === "school" || m.id === "money" || m.id === "academic")
    .flatMap((m) => m.items)
    .filter((i) => i.entity && (i.n === "khoa-hoc" || i.n === "so-thu" || i.n === "nhac-nap" || i.n === "chi-nhanh" || i.n === "phong" || i.n === "giao-vien" || i.n === "nhan-su" || i.n === "zalo-oa"))
    .map((i) => ({ n: i.n, label: i.label, entity: i.entity! }));
}

export function phoneTabsFor(role: Role, identity?: IdentityType | null, workspace?: "live" | "draft"): Array<{ id: RouteName; label: string }> {
  if (workspace === "draft") {
    return [
      { id: "buoi", label: "Buổi" },
      { id: "lop", label: "Lớp" },
      { id: "hoc-sinh", label: "Học sinh" },
      { id: "khoa-hoc", label: "Khóa học" },
    ];
  }
  if (identity === "SOLO") {
    return [
      { id: "hom-nay", label: "Hôm nay" },
      { id: "buoi", label: "Buổi" },
      { id: "lop", label: "Lớp" },
      { id: "hoc-sinh", label: "Học sinh" },
    ];
  }
  if (role === "teacher") return [{ id: "hom-nay", label: "Hôm nay" }, { id: "buoi", label: "Buổi" }];
  return [
    { id: "hom-nay", label: "Hôm nay" },
    { id: "buoi", label: "Buổi" },
    { id: "lop", label: "Lớp" },
    { id: "hoc-sinh", label: "Học sinh" },
  ];
}

export function routeModule(n: RouteName): string {
  if (n === "hom-nay" || n === "buoi" || n === "buoi-detail" || n === "vang" || n === "buoi-bu" || n === "nhap-so") return "ops";
  if (n === "lop" || n === "lop-detail" || n === "lop-moi" || n === "hoc-sinh" || n === "hs-detail" || n === "khoa-hoc" || n === "khoa-hoc-detail") return "academic";
  if (n === "thu-phi" || n === "so-thu" || n === "nhac-nap" || n === "nhac-nap-detail") return "money";
  if (n === "zalo" || n === "zalo-detail") return "comms";
  return "school";
}

export function navOn(current: RouteName, id: RouteName) {
  if (current === id) return true;
  if (id === "buoi" && current === "buoi-detail") return true;
  if (id === "vang" && (current === "vang" || current === "buoi-bu")) return true;
  if (id === "lop" && (current === "lop-detail" || current === "lop-moi")) return true;
  if (id === "hoc-sinh" && current === "hs-detail") return true;
  if (id === "zalo" && current === "zalo-detail") return true;
  if (id === "thu-phi" && current === "thu-phi") return true;
  if (id === "khoa-hoc" && current === "khoa-hoc-detail") return true;
  if (id === "nhac-nap" && current === "nhac-nap-detail") return true;
  if (id === "phong" && current === "phong-detail") return true;
  if (id === "giao-vien" && current === "gv-detail") return true;
  if (id === "nhan-su" && current === "staff-detail") return true;
  return false;
}

export function canSeeRoute(role: Role, n: RouteName, identity?: IdentityType | null, workspace?: "live" | "draft") {
  if (workspace === "draft" && isDraftBlocked(n)) return false;
  if (identity === "SOLO") {
    if (n === "chi-nhanh" || n === "nhan-su" || n === "so-thu" || n === "vang" || n === "buoi-bu") return false;
    return true;
  }
  if (role === "ops") return true;
  if (n === "the") return true;
  if (n === "nhap-so") return false;
  if (role === "teacher") {
    return n === "hom-nay" || n === "buoi" || n === "buoi-detail";
  }
  if (n === "thu-phi" || n === "so-thu" || n === "nhac-nap" || n === "nhac-nap-detail") return canSeeAdmin(role, "enrollment");
  if (n === "hom-nay" || n === "buoi" || n === "buoi-detail" || n === "zalo" || n === "zalo-detail") return true;
  if (n === "lop" || n === "lop-detail" || n === "lop-moi" || n === "vang" || n === "buoi-bu") return canSeeAdmin(role, "class");
  if (n === "hoc-sinh" || n === "hs-detail") return canSeeAdmin(role, "student");
  for (const [entity, routes] of Object.entries(ENTITY_ROUTES) as Array<[AdminEntity, RouteName[]]>) {
    if (routes.includes(n) && canSeeAdmin(role, entity)) return true;
  }
  return false;
}

export const TEACHER_ID = "tch_huy";
