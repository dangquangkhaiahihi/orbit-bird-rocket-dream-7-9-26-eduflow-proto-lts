import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { one } from "@/lib/eduflow/format";
import { useEdu } from "@/lib/eduflow/store";
import type { ModalKind } from "@/lib/eduflow/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OverlayShell } from "./phone-chrome";

const ROOM_TYPES = [
  { id: "classroom", label: "Phòng học" },
  { id: "online", label: "Online" },
  { id: "other", label: "Khác" },
];
const STAFF_ROLES = [
  { id: "founder", label: "Founder" },
  { id: "ops", label: "Giáo vụ" },
  { id: "assistant", label: "Trợ lý" },
  { id: "teacher", label: "Giáo viên" },
];
const RELS = ["Mẹ", "Bố", "PH", "Ông", "Bà"];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Shell({
  open, title, desc, onClose, onSave, children, wide,
}: {
  open: boolean; title: string; desc: string; onClose: () => void; onSave: () => void;
  children: React.ReactNode; wide?: boolean;
}) {
  return (
    <OverlayShell open={open} title={title} desc={desc} onClose={onClose} onSave={onSave} wide={wide}>
      {children}
    </OverlayShell>
  );
}

export function ErpDialogs() {
  const g = useEdu((s) => s.graph);
  const modal = useEdu((s) => s.modal);
  const editId = useEdu((s) => s.editId);
  const setModal = useEdu((s) => s.setModal);
  const createBranch = useEdu((s) => s.createBranch);
  const updateBranch = useEdu((s) => s.updateBranch);
  const createRoom = useEdu((s) => s.createRoom);
  const updateRoom = useEdu((s) => s.updateRoom);
  const createTeacher = useEdu((s) => s.createTeacher);
  const updateTeacher = useEdu((s) => s.updateTeacher);
  const createStudent = useEdu((s) => s.createStudent);
  const updateStudent = useEdu((s) => s.updateStudent);
  const createGuardian = useEdu((s) => s.createGuardian);
  const createEnroll = useEdu((s) => s.createEnroll);
  const updateEnroll = useEdu((s) => s.updateEnroll);
  const createStaff = useEdu((s) => s.createStaff);
  const updateStaff = useEdu((s) => s.updateStaff);
  const peekStack = useEdu((s) => s.peekStack);
  const route = useEdu((s) => s.route);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [active, setActive] = useState(true);
  const [branchId, setBranchId] = useState("");
  const [cap, setCap] = useState("12");
  const [type, setType] = useState("classroom");
  const [dob, setDob] = useState("2012-01-01");
  const [gName, setGName] = useState("");
  const [gPhone, setGPhone] = useState("");
  const [rel, setRel] = useState("Mẹ");
  const [stu, setStu] = useState("");
  const [cls, setCls] = useState("");
  const [status, setStatus] = useState("active");
  const [bill, setBill] = useState("");
  const [title, setTitle] = useState("Trợ lý");
  const [roles, setRoles] = useState<string[]>(["assistant"]);
  const [invite, setInvite] = useState(true);
  const [branchIds, setBranchIds] = useState<string[]>([]);

  const erp: ModalKind[] = ["branch", "room", "teacher", "student", "guardian", "enroll", "staff"];
  const open = !!modal && erp.includes(modal);

  useEffect(() => {
    if (!g || !open) return;
    const br0 = g.branches[0]?.id || "";
    setBranchId(br0);
    setBranchIds(br0 ? [br0] : []);
    if (modal === "branch" && editId) {
      const b = one(g.branches, editId);
      if (b) { setName(b.name); setCode(b.code); setAddress(b.address); setPhone(b.phone); setActive(b.active); setNotes(b.notes); }
    } else if (modal === "branch") {
      setName(""); setCode(""); setAddress(""); setPhone(""); setActive(true); setNotes("");
    }
    if (modal === "room" && editId) {
      const r = one(g.rooms, editId);
      if (r) { setName(r.name); setBranchId(r.branch_id); setCap(String(r.capacity)); setType(r.type); setActive(r.active); setNotes(r.notes); }
    } else if (modal === "room") {
      setName(""); setCap("10"); setType("classroom"); setActive(true); setNotes("");
    }
    if (modal === "teacher" && editId) {
      const t = one(g.teachers, editId);
      if (t) { setName(t.name); setPhone(t.phone); setEmail(t.email); setBranchId(t.default_branch_id); setBranchIds(t.branch_ids); setActive(t.active); }
    } else if (modal === "teacher") {
      setName(""); setPhone(""); setEmail(""); setActive(true);
    }
    if (modal === "student" && editId) {
      const s = one(g.students, editId);
      if (s) { setName(s.full_name); setDob(s.dob); setBranchId(s.branch_id); setPhone(s.phone || ""); setActive(s.active); setNotes(s.notes); }
    } else if (modal === "student") {
      setName(""); setDob("2012-01-01"); setPhone(""); setActive(true); setNotes(""); setGName(""); setGPhone(""); setRel("Mẹ");
    }
    if (modal === "guardian") { setGName(""); setGPhone(""); setRel("Mẹ"); }
    if (modal === "enroll") {
      if (editId) {
        const e = one(g.enrollments, editId);
        if (e) {
          setCls(e.class_id);
          setStu(e.student_id);
          setStatus(e.status);
          setBill(e.billing_contact_id || "");
        }
      } else {
        const classId = route.n === "lop-detail" ? route.id : peekStack.find((p) => p.kind === "class")?.id || g.classes[0]?.id || "";
        setCls(classId || "");
        setStu(g.students[0]?.id || "");
        setStatus("active");
        setBill("");
      }
    }
    if (modal === "staff" && editId) {
      const s = one(g.staff_profiles, editId);
      if (s) {
        setName(s.full_name); setPhone(s.phone); setTitle(s.title);
        setRoles(g.profile_roles.filter((r) => r.profile_id === editId).map((r) => r.role));
        setInvite(false);
      }
    } else if (modal === "staff") {
      setName(""); setPhone(""); setTitle("Trợ lý"); setRoles(["assistant"]); setInvite(true);
    }
  }, [modal, editId, open, g, route.n, route.id, peekStack]);

  if (!g) return null;
  const close = () => setModal(null);

  const studentPeek = peekStack.find((p) => p.kind === "student")?.id || (route.n === "hs-detail" ? route.id : null);

  const titles: Record<string, [string, string]> = {
    branch: [editId ? "Sửa chi nhánh" : "Chi nhánh mới", "Cơ sở vận hành. Tên bắt buộc."],
    room: [editId ? "Sửa phòng" : "Phòng mới", "Offline dùng cho trùng lịch. Online bỏ qua phòng."],
    teacher: [editId ? "Sửa giáo viên" : "Giáo viên mới", "Tài nguyên xếp lịch. Rate để sau."],
    student: [editId ? "Sửa học sinh" : "Học sinh mới", "Thêm từng em. PH đi kèm nếu có SĐT."],
    guardian: ["Phụ huynh mới", "Gắn vào học sinh đang mở. SĐT bắt buộc."],
    enroll: [editId ? "Sửa ghi danh" : "Ghi danh", "Xếp chỗ. Buổi học / hạn đóng chỉ tăng khi thu học phí."],
    staff: [editId ? "Sửa nhân sự" : "Mời nhân sự", "Hồ sơ + nhiều vai. Giáo viên resource tách riêng."],
  };
  const [t, d] = titles[modal || "branch"] || ["", ""];

  return (
    <Shell open={open} title={t} desc={d} onClose={close} wide={modal === "student" || modal === "teacher" || modal === "staff"} onSave={() => {
      if (modal === "branch") {
        const draft = { name, code, address, phone, active, notes };
        editId ? updateBranch(editId, draft) : createBranch(draft);
      }
      if (modal === "room") {
        const draft = { branch_id: branchId, name, capacity: Number(cap) || 0, type, active, notes };
        editId ? updateRoom(editId, draft) : createRoom(draft);
      }
      if (modal === "teacher") {
        const ids = branchIds.length ? branchIds : (branchId ? [branchId] : []);
        const draft = { name, phone, email, default_branch_id: branchId || ids[0], branch_ids: ids, active };
        editId ? updateTeacher(editId, draft) : createTeacher(draft);
      }
      if (modal === "student") {
        const draft = { full_name: name, dob, branch_id: branchId, phone, active, notes, guardian_name: gName, guardian_phone: gPhone, relationship: rel };
        editId ? updateStudent(editId, draft) : createStudent(draft);
      }
      if (modal === "guardian" && studentPeek) {
        createGuardian({ student_id: studentPeek, full_name: gName, phone: gPhone, relationship: rel });
      }
      if (modal === "enroll") {
        const draft = { class_id: cls, student_id: stu, status, billing_contact_id: bill || null };
        editId ? updateEnroll(editId, draft) : createEnroll(draft);
      }
      if (modal === "staff") {
        const draft = { full_name: name, phone, title, roles, invite };
        editId ? updateStaff(editId, draft) : createStaff(draft);
      }
    }}>
      {modal === "branch" ? (
        <>
          <section className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Chi nhánh</p>
            <Field label="Tên *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Cầu Giấy" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mã"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CG" /></Field>
              <Field label="SĐT"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            </div>
            <Field label="Địa chỉ"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
            <Field label="Ghi chú"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Đang hoạt động</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </section>
        </>
      ) : null}
      {modal === "room" ? (
        <>
          <section className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phòng</p>
            <Field label="Chi nhánh *">
              <Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{g.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Tên *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="P202" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Sức chứa *"><Input type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
              <Field label="Loại *">
                <Select value={type} onValueChange={setType}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{ROOM_TYPES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Ghi chú"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Đang dùng</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </section>
        </>
      ) : null}
      {modal === "teacher" ? (
        <>
          <section className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Giáo viên</p>
            <Field label="Họ tên *"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SĐT *"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
              <Field label="Email"><Input value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            </div>
            <Field label="Chi nhánh mặc định *">
              <Select value={branchId} onValueChange={(v) => { setBranchId(v); setBranchIds((ids) => ids.includes(v) ? ids : [...ids, v]); }}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{g.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Chi nhánh dạy *">
              <ToggleGroup type="multiple" value={branchIds} onValueChange={(v) => { if (v.length) setBranchIds(v); }} className="flex flex-wrap justify-start gap-1">
                {g.branches.map((b) => (
                  <ToggleGroupItem key={b.id} value={b.id} variant="outline" className="h-9 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{b.name}</ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Field>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Đang xếp lịch</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </section>
        </>
      ) : null}
      {modal === "student" ? (
        <>
          <section className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Học sinh</p>
            <Field label="Họ tên *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn…" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ngày sinh *"><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></Field>
              <Field label="Chi nhánh *">
                <Select value={branchId} onValueChange={setBranchId}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{g.branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="SĐT"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Ghi chú"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} /></Field>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Đang học</Label>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </section>
          {!editId ? (
            <>
              <Separator />
              <section className="space-y-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phụ huynh (tuỳ chọn)</p>
                <Field label="Họ tên PH"><Input value={gName} onChange={(e) => setGName(e.target.value)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="SĐT PH"><Input value={gPhone} onChange={(e) => setGPhone(e.target.value)} /></Field>
                  <Field label="Quan hệ">
                    <Select value={rel} onValueChange={setRel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{RELS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
              </section>
            </>
          ) : null}
        </>
      ) : null}
      {modal === "guardian" ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phụ huynh</p>
          <Field label="Họ tên *"><Input value={gName} onChange={(e) => setGName(e.target.value)} /></Field>
          <Field label="SĐT *"><Input value={gPhone} onChange={(e) => setGPhone(e.target.value)} /></Field>
          <Field label="Quan hệ">
            <Select value={rel} onValueChange={setRel}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{RELS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </section>
      ) : null}
      {modal === "enroll" ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ghi danh</p>
          <Field label="Lớp *">
            <Select value={cls} onValueChange={setCls}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{g.classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Học sinh *">
            <Select value={stu} onValueChange={(v) => { setStu(v); const grd = g.student_guardians.find((x) => x.student_id === v && x.billing_contact); setBill(grd?.guardian_id || ""); }}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{g.students.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Trạng thái">
            <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">đang học</SelectItem>
                <SelectItem value="paused">tạm nghỉ</SelectItem>
                <SelectItem value="dropped">nghỉ</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Người thu phí">
            <Select value={bill || "__none"} onValueChange={(v) => setBill(v === "__none" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Mặc định PH" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Mặc định PH chính</SelectItem>
                {g.guardians.filter((x) => g.student_guardians.some((l) => l.student_id === stu && l.guardian_id === x.id)).map((x) => (
                  <SelectItem key={x.id} value={x.id}>{x.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!editId ? (
            <Alert>
              <AlertTitle>Chưa thu = chưa có buổi học</AlertTitle>
              <AlertDescription>Ghi danh chỉ xếp chỗ. Mở Thu phí để thu / nạp buổi học ngay, hoặc Thu học phí trên lớp.</AlertDescription>
            </Alert>
          ) : null}
        </section>
      ) : null}
      {modal === "staff" ? (
        <section className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Nhân sự</p>
          <Field label="Họ tên *"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SĐT"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
            <Field label="Chức danh"><Input value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          </div>
          <Field label="Vai (nhiều)">
            <ToggleGroup type="multiple" value={roles} onValueChange={(v) => { if (v.length) setRoles(v); }} className="flex flex-wrap justify-start gap-1">
              {STAFF_ROLES.map((r) => (
                <ToggleGroupItem key={r.id} value={r.id} variant="outline" className="h-9 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">{r.label}</ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Field>
          {!editId ? (
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <Label>Gửi lời mời (proto)</Label>
              <Switch checked={invite} onCheckedChange={setInvite} />
            </div>
          ) : null}
        </section>
      ) : null}
    </Shell>
  );
}
