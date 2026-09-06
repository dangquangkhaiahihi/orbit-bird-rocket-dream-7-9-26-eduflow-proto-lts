export type Device = "web" | "phone" | "zalo";
export type Role = "ops" | "teacher" | "assistant";
export type RouteName =
  | "hom-nay"
  | "buoi"
  | "buoi-detail"
  | "lop"
  | "lop-detail"
  | "hoc-sinh"
  | "hs-detail"
  | "zalo"
  | "zalo-detail"
  | "chi-nhanh"
  | "phong"
  | "phong-detail"
  | "giao-vien"
  | "gv-detail"
  | "nhan-su"
  | "staff-detail"
  | "zalo-oa"
  | "khoa-hoc"
  | "khoa-hoc-detail"
  | "thu-phi"
  | "so-thu"
  | "nhac-nap"
  | "nhac-nap-detail"
  | "lop-moi"
  | "vang"
  | "buoi-bu"
  | "the"
  | "nhap-so";

export type LessonTab = "attendance" | "makeup" | "ledger" | "homework" | "notes" | "timeline";
export type ClassTab = "roster" | "history" | "fees" | "pays";
export type ClassLife = "running" | "cancelled" | "finished";
export type ZTab = "z0" | "z1" | "z2";
export type ModalKind =
  | "adhoc" | "sub" | "class" | "student" | "room" | "teacher" | "staff"
  | "enroll" | "branch" | "guardian" | "pay" | "course" | "lesson-sched" | null;
export type AbsentDeduct = "always" | "on_makeup";
export type BillingMode = "monthly" | "prepaid_session" | "course";

export type ChargeModel = "course" | "monthly" | "per_lesson" | "prepaid" | "bundle" | "deposit";
export type PromoKind = "fixed" | "percent" | "early_bird" | "sibling" | "first_pay" | "prepay" | "waiver" | "bonus_sessions";
export type PayMethod = "cash" | "transfer" | "momo";

export type PeekKind = "class" | "student" | "room" | "teacher" | "staff" | "lesson" | "zalo" | "enrollment" | "branch" | "guardian" | "course";
export type PeekFrame = { kind: PeekKind; id: string; tab?: LessonTab };

export type RecurrenceDay = { weekday: number; start_time: string };
export type Recurrence = {
  duration_min: number;
  days: RecurrenceDay[];
  weekdays?: number[];
  start_time?: string;
  end_time?: string;
};

export type Promotion = {
  id: string;
  kind: PromoKind;
  label: string;
  value: number;
  active: boolean;
};

export type TuitionPlan = {
  model: ChargeModel;
  fee: number;
  pack_sessions?: number;
  course_sessions?: number;
  deposit_amount?: number;
  installment_n?: number;
  expiry_days?: number;
  proration: boolean;
  bundle_labels?: string[];
};

export type Course = {
  id: string;
  name: string;
  content_key: string;
  subject: string;
  level: string;
  duration_min: number;
  plan: TuitionPlan;
  promotions: Promotion[];
  active: boolean;
};

export type CourseDraft = {
  name: string;
  content_key: string;
  subject: string;
  level: string;
  duration_min: number;
  plan: TuitionPlan;
  promotions: Promotion[];
};

export type ClassDraft = {
  course_id: string;
  name: string;
  teacher_id: string;
  room_id: string;
  capacity: number;
  duration_min: number;
  days: RecurrenceDay[];
  start_date: string;
  end_date: string | null;
  absent_deduct?: AbsentDeduct;
};

export type BranchDraft = { name: string; code: string; address: string; phone: string; active: boolean; notes: string };
export type RoomDraft = { branch_id: string; name: string; capacity: number; type: string; active: boolean; notes: string };
export type TeacherDraft = { name: string; phone: string; email: string; default_branch_id: string; branch_ids: string[]; active: boolean };
export type StudentDraft = {
  full_name: string; dob: string; branch_id: string; phone: string; active: boolean; notes: string;
  guardian_name: string; guardian_phone: string; relationship: string;
};
export type GuardianDraft = { student_id: string; full_name: string; phone: string; relationship: string };
export type EnrollDraft = { class_id: string; student_id: string; status: string; billing_contact_id: string | null };
export type StaffDraft = { full_name: string; phone: string; title: string; roles: string[]; invite: boolean };
export type PayDraft = {
  enrollment_id: string;
  amount: number;
  method: PayMethod;
  paid_at: string;
  sessions: number | null;
  paid_through: string | null;
  note: string;
  bonus_sessions?: number;
  deposit?: number;
};

export type RemindReason = "runout" | "debt" | "both";
export type RemindItemStatus = "queued" | "sent" | "failed" | "skipped";
export type RemindBatchStatus = "queued" | "sent";

export type RemindBatch = {
  id: string;
  ran_at: string;
  actor: string;
  days_before: number;
  status: RemindBatchStatus;
  counts: { runout: number; debt: number; sent: number; failed: number; skipped: number };
};

export type RemindItem = {
  id: string;
  batch_id: string;
  enrollment_id: string;
  student_id: string;
  class_id: string;
  guardian_id: string | null;
  reason: RemindReason;
  remaining: number;
  runout_date: string | null;
  days_left: number | null;
  debt: number;
  body: string;
  status: RemindItemStatus;
  fail_reason: string | null;
  zalo_event_id: string | null;
};

export type MakeupGuestPick = { student_id: string; source_lesson_id: string };
export type MakeupSlot = { date: string; hhmm: string };

export type AbsentIgnore = {
  id: string;
  student_id: string;
  source_lesson_id: string;
  ignored_at: string;
  actor: string;
};

export type AbsentCaseStatus = "need_makeup" | "draft" | "waiting_parent" | "confirmed" | "declined" | "ignored";

export type Payment = {
  id: string;
  enrollment_id: string;
  student_id: string;
  class_id: string;
  amount: number;
  method: PayMethod;
  paid_at: string;
  sessions: number | null;
  paid_through: string | null;
  note: string;
  actor: string;
};

export type Graph = {
  meta: { version: string; tenant_name: string; clock: string; today: string; today_label: string; note?: string; workspace?: "live" | "draft" };
  settings: { remind_days_before: number };
  tenant: { id: string; name: string; legal_name: string; phone: string; zalo_oa_id: string };
  branches: Array<{ id: string; tenant_id: string; name: string; code: string; address: string; phone: string; active: boolean; notes: string }>;
  rooms: Array<{ id: string; branch_id: string; name: string; capacity: number; type: string; active: boolean; notes: string }>;
  teachers: Array<{ id: string; name: string; phone: string; email: string; user_id: string | null; default_branch_id: string; branch_ids: string[]; subjects: string[]; active: boolean }>;
  staff_profiles: Array<{ id: string; full_name: string; phone: string; email: string; title: string; teacher_id?: string; active: boolean }>;
  profile_roles: Array<{ profile_id: string; role: string; branch_id: string }>;
  students: Array<{ id: string; full_name: string; dob: string; branch_id: string; phone: string | null; active: boolean; notes: string }>;
  guardians: Array<{ id: string; full_name: string; phone: string; relationship: string; preferred_channel: string; zalo_status: string; zalo_user_id: string | null; consent: boolean }>;
  student_guardians: Array<{ student_id: string; guardian_id: string; is_primary: boolean; billing_contact: boolean }>;
  classes: Array<{
    id: string; branch_id: string; name: string; content_key?: string; course_id?: string;
    default_teacher_id: string; default_room_id: string; capacity: number;
    recurrence: Recurrence;
    start_date: string; end_date: string | null; billing_mode: string; fee: number; course_total_sessions?: number; active: boolean;
    life?: ClassLife;
    absent_deduct?: AbsentDeduct;
  }>;
  courses: Course[];
  enrollments: Array<{
    id: string; class_id: string; student_id: string; status: string; enrolled_at: string; billing_mode: string;
    paid_through: string | null; remaining_sessions: number | null; course_done: number | null; course_total: number | null; billing_contact_id: string | null;
    deposit_held?: number;
  }>;
  payments: Payment[];
  lessons: Array<{
    id: string; class_id: string; branch_id: string; teacher_id: string; room_id: string;
    start: string; end: string; status: string; is_makeup: boolean; original_lesson_id: string | null; substitute: boolean;
    override?: boolean;
  }>;
  attendance: Array<{ id: string; lesson_id: string; student_id: string; enrollment_id: string; status: string; reason: string | null; unpaid_flag: boolean }>;
  makeups: Array<{
    id: string; student_id: string; enrollment_id: string; source_lesson_id: string; option: number;
    target_lesson_id: string | null; adhoc: unknown; status: string; offered_at: string; zalo_event_id: string | null;
  }>;
  homework: Array<{ id: string; lesson_id?: string; title?: string; assigned_at?: string; homework_id?: string; student_id?: string; mark?: string }>;
  notes: Array<{ id: string; lesson_id: string; author_id: string; body: string; at: string }>;
  zalo_oa: {
    id: string; tenant_id: string; oa_name: string; connected: boolean; quota_used: number; quota_limit: number; webhook_ok: boolean;
    webhook_url?: string; parent_link?: string;
    templates: Array<{ key: string; name: string; zalo_template_id: string; eligible: boolean }>;
  };
  zalo_events: Array<{
    id: string; template: string; guardian_id: string; student_id: string; lesson_id: string | null;
    makeup_id: string | null; status: string; sent_at: string; fail_reason: string | null;
  }>;
  exceptions: Array<{
    id: string; lane: string; lesson_id: string; student_id: string | null; title: string; detail: string; cta: string; tab: string | null;
  }>;
  timeline_events: Array<{ id: string; at: string; lesson_id: string; actor: string; kind: string; text: string }>;
  remind_batches: RemindBatch[];
  remind_items: RemindItem[];
  absent_ignores: AbsentIgnore[];
};

export type RouteState = { n: RouteName; id: string | null; tab: LessonTab; z: ZTab };

export type IdentityType = "SOLO" | "ENTERPRISE";
export type TeachMode = "online" | "offline" | "both";

export type FeatureFlags = {
  crm_sales_pipeline: boolean;
  multi_branch_scheduling: boolean;
  split_payroll_calculator: boolean;
  misa_einvoice_sync: boolean;
  digital_student_portfolio: boolean;
  lesson_card_attendance: boolean;
  direct_vietqr_billing: boolean;
  zalo_zns_notifications: boolean;
};

export type TenantRoleDef = {
  role_name: string;
  permissions: string[];
};

export type TenantCampus = {
  branch_name: string;
  room_name: string;
};

export type TenantProfile = {
  tenant_id: string;
  business_name: string;
  identity_type: IdentityType;
  status: "ACTIVE";
  created_at: string;
  phone: string;
  phone_verified: boolean;
  biometric_enabled: boolean;
  pin: string;
  subject: string | null;
  bank_name: string | null;
  bank_account: string | null;
  teach_mode: TeachMode | null;
  tax_id: string | null;
  campus: TenantCampus | null;
  staff_invite_code: string | null;
  modules_enabled: FeatureFlags;
  default_roles: TenantRoleDef[];
};

export type CrmLead = {
  id: string;
  source: "facebook" | "zalo" | "walkin";
  name: string;
  phone: string;
  status: "new" | "assigned" | "trial";
  counselor: string | null;
  created_at: string;
};

export type ReconLog = {
  id: string;
  kind: "vietqr_ok" | "misa_error";
  title: string;
  detail: string;
  at: string;
};
