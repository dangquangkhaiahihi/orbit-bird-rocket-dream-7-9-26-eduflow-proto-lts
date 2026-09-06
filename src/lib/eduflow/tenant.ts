import type { CrmLead, FeatureFlags, IdentityType, ReconLog, TeachMode, TenantProfile } from "./types";

export const TENANT_LS = "eduflow-tenant-v1";

export const SUBJECTS = ["Toán", "Tiếng Anh", "Lý", "Hóa", "Văn", "Khoa học", "Âm nhạc"] as const;

export const BANKS = [
  { id: "vcb", name: "Vietcombank" },
  { id: "tcb", name: "Techcombank" },
  { id: "acb", name: "ACB" },
  { id: "mb", name: "MB" },
  { id: "vpb", name: "VPBank" },
  { id: "bidv", name: "BIDV" },
] as const;

export function flagsFor(identity: IdentityType): FeatureFlags {
  const shared: FeatureFlags = {
    crm_sales_pipeline: false,
    multi_branch_scheduling: false,
    split_payroll_calculator: false,
    misa_einvoice_sync: false,
    digital_student_portfolio: true,
    lesson_card_attendance: true,
    direct_vietqr_billing: true,
    zalo_zns_notifications: true,
  };
  if (identity === "ENTERPRISE") {
    return {
      ...shared,
      crm_sales_pipeline: true,
      multi_branch_scheduling: true,
      split_payroll_calculator: true,
      misa_einvoice_sync: true,
    };
  }
  return shared;
}

export function rolesFor(identity: IdentityType): TenantProfile["default_roles"] {
  if (identity === "SOLO") {
    return [{
      role_name: "Solo_Educator",
      permissions: ["READ_ALL", "WRITE_ALL", "BILLING_MANAGE", "ACADEMIC_MANAGE"],
    }];
  }
  return [
    { role_name: "Director", permissions: ["READ_ALL", "WRITE_ALL", "BILLING_MANAGE", "STAFF_MANAGE"] },
    { role_name: "Ops", permissions: ["READ_ALL", "WRITE_OPS", "BILLING_MANAGE", "ACADEMIC_MANAGE"] },
    { role_name: "Teacher", permissions: ["READ_CLASS", "WRITE_ATTENDANCE", "WRITE_HOMEWORK"] },
  ];
}

export function newTenantId() {
  return `ten_${Math.random().toString(36).slice(2, 10)}`;
}

export function inviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export function buildTenant(p: {
  identity_type: IdentityType;
  phone: string;
  business_name: string;
  biometric_enabled: boolean;
  pin: string;
  subject?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  teach_mode?: TeachMode | null;
  tax_id?: string | null;
  campus?: TenantProfile["campus"];
  staff_invite_code?: string | null;
}): TenantProfile {
  const identity = p.identity_type;
  return {
    tenant_id: identity === "ENTERPRISE" && p.business_name === "IMPACT" ? "ten_impact" : newTenantId(),
    business_name: p.business_name,
    identity_type: identity,
    status: "ACTIVE",
    created_at: new Date().toISOString(),
    phone: p.phone,
    phone_verified: true,
    biometric_enabled: p.biometric_enabled,
    pin: p.pin,
    subject: p.subject ?? null,
    bank_name: p.bank_name ?? null,
    bank_account: p.bank_account ?? null,
    teach_mode: p.teach_mode ?? null,
    tax_id: p.tax_id ?? null,
    campus: p.campus ?? null,
    staff_invite_code: p.staff_invite_code ?? null,
    modules_enabled: flagsFor(identity),
    default_roles: rolesFor(identity),
  };
}

export const IMPACT_TENANT: TenantProfile = buildTenant({
  identity_type: "ENTERPRISE",
  phone: "02473008899",
  business_name: "IMPACT",
  biometric_enabled: true,
  pin: "258046",
  tax_id: "0101234567",
  campus: { branch_name: "Cầu Giấy", room_name: "P201" },
  staff_invite_code: "IMPACT1",
});

export function loadTenant(): TenantProfile | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(TENANT_LS);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as TenantProfile;
    if (!t || (t.identity_type !== "SOLO" && t.identity_type !== "ENTERPRISE")) return null;
    t.modules_enabled = { ...flagsFor(t.identity_type), ...(t.modules_enabled || {}) };
    return t;
  } catch {
    return null;
  }
}

export function saveTenant(t: TenantProfile) {
  localStorage.setItem(TENANT_LS, JSON.stringify(t));
}

export function clearTenant() {
  localStorage.removeItem(TENANT_LS);
}

export function digitsOf(phone: string) {
  return phone.replace(/\D/g, "");
}

export function otpMatches(phone: string, otp: string) {
  const code = otp.replace(/\D/g, "");
  if (code.length !== 6) return false;
  if (code === "123456") return true;
  const d = digitsOf(phone);
  return d.length >= 6 && code === d.slice(-6);
}

export const CRM_LEADS: CrmLead[] = [
  { id: "lead_01", source: "facebook", name: "Nguyễn Hà An", phone: "0912 118 221", status: "new", counselor: null, created_at: "2026-08-23T07:10:00+07:00" },
  { id: "lead_02", source: "facebook", name: "Trần Mỹ Linh", phone: "0903 441 882", status: "new", counselor: null, created_at: "2026-08-23T06:48:00+07:00" },
  { id: "lead_03", source: "facebook", name: "Lê Quốc Bảo", phone: "0988 230 119", status: "new", counselor: null, created_at: "2026-08-22T21:14:00+07:00" },
  { id: "lead_04", source: "zalo", name: "Phạm Khánh Quỳnh", phone: "0914 220 118", status: "trial", counselor: "Mai", created_at: "2026-08-21T11:00:00+07:00" },
  { id: "lead_05", source: "facebook", name: "Đỗ Gia Hân", phone: "0977 551 004", status: "new", counselor: null, created_at: "2026-08-22T18:02:00+07:00" },
  { id: "lead_06", source: "facebook", name: "Vũ Minh Khang", phone: "0936 770 221", status: "new", counselor: null, created_at: "2026-08-22T16:40:00+07:00" },
  { id: "lead_07", source: "walkin", name: "Bùi Phương Anh", phone: "0902 118 993", status: "assigned", counselor: "Trang", created_at: "2026-08-22T09:20:00+07:00" },
  { id: "lead_08", source: "facebook", name: "Ngô Nhật Nam", phone: "0918 334 210", status: "new", counselor: null, created_at: "2026-08-23T07:28:00+07:00" },
  { id: "lead_09", source: "facebook", name: "Mai Thanh Tú", phone: "0966 120 445", status: "new", counselor: null, created_at: "2026-08-21T19:55:00+07:00" },
  { id: "lead_10", source: "facebook", name: "Hoàng Gia Bảo", phone: "0888 219 004", status: "new", counselor: null, created_at: "2026-08-23T07:33:00+07:00" },
  { id: "lead_11", source: "facebook", name: "Lý Khánh Vy", phone: "0944 881 226", status: "new", counselor: null, created_at: "2026-08-22T14:11:00+07:00" },
  { id: "lead_12", source: "facebook", name: "Đặng Minh Châu", phone: "0932 667 118", status: "new", counselor: null, created_at: "2026-08-23T06:05:00+07:00" },
];

export const RECON_LOGS: ReconLog[] = [
  { id: "rec_ok", kind: "vietqr_ok", title: "24 giao dịch VietQR đã đối soát", detail: "Khớp sổ thu tháng 8 · Cầu Giấy", at: "2026-08-23T07:36:00+07:00" },
  { id: "rec_m1", kind: "misa_error", title: "Hóa đơn MISA · Nguyễn Minh An", detail: "MST khách trống — meInvoice từ chối", at: "2026-08-23T07:12:00+07:00" },
  { id: "rec_m2", kind: "misa_error", title: "Hóa đơn MISA · Trần Bảo Ngọc", detail: "Mẫu số hóa đơn không khớp kỳ", at: "2026-08-22T18:44:00+07:00" },
  { id: "rec_m3", kind: "misa_error", title: "Hóa đơn MISA · Lê Hoàng Nam", detail: "Timeout cổng meInvoice — cần gửi lại", at: "2026-08-22T11:08:00+07:00" },
];
