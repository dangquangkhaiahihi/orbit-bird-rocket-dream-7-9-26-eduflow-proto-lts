import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { clsName, courseOf, fmtShort, formatRecurrence, grantLabel, money, one, planLabel, statusVn, stuName, tchName } from "@/lib/eduflow/format";
import { billingLabel, enrollPayKind, roster, unpaidLearned, useEdu } from "@/lib/eduflow/store";
import { canMoney, canWrite } from "@/lib/eduflow/roles";
import { cn } from "@/lib/utils";
import type { Graph } from "@/lib/eduflow/types";
import { Empty, PageHead, Person, StuStatus } from "./atoms";
import { DataTable } from "./data-table";
import { TableStage } from "./inspector";
import { PayHistory, PayPanel } from "./pay-form";
import { ConfirmDeleteDialog, RowContextMenu, useRowActions } from "./row-menu";

function needPay(g: Graph, e: Graph["enrollments"][number]) {
  if (e.status !== "active") return false;
  const k = enrollPayKind(g, e);
  return k === "pay_debt" || k === "pay_empty" || k === "pay_low" || k === "pay_deposit";
}

export function ThuPhi() {
  const g = useEdu((s) => s.graph)!;
  const routeId = useEdu((s) => s.route.id);
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  const phone = useEdu((s) => s.device) === "phone";
  const createEnroll = useEdu((s) => s.createEnroll);
  const moneyOk = canMoney(role);
  const writeEnroll = canWrite(role, "enrollment");

  const [q, setQ] = useState("");
  const [stuId, setStuId] = useState<string | null>(null);
  const [enrId, setEnrId] = useState<string | null>(null);
  const [clsPick, setClsPick] = useState("");

  useEffect(() => {
    if (!routeId) return;
    const enr = one(g.enrollments, routeId);
    if (enr) {
      setStuId(enr.student_id);
      setEnrId(enr.id);
      return;
    }
    if (one(g.students, routeId)) {
      setStuId(routeId);
      const mine = g.enrollments.filter((e) => e.student_id === routeId && e.status === "active");
      const hit = mine.find((e) => needPay(g, e)) || mine[0];
      setEnrId(hit?.id || null);
    }
  }, [routeId, g]);

  const queue = useMemo(() => {
    return g.enrollments
      .filter((e) => needPay(g, e))
      .sort((a, b) => stuName(g, a.student_id).localeCompare(stuName(g, b.student_id), "vi"));
  }, [g]);

  const qn = q.trim().toLowerCase();
  const stuHits = useMemo(() => {
    if (!qn) return [];
    return g.students.filter((s) => s.active && s.full_name.toLowerCase().includes(qn)).slice(0, 8);
  }, [g, qn]);

  const stu = stuId ? one(g.students, stuId) : undefined;
  const ens = stu ? g.enrollments.filter((e) => e.student_id === stu.id) : [];
  const enrolled = new Set(ens.map((e) => e.class_id));
  const openClasses = g.classes.filter((c) => c.active && !enrolled.has(c.id));
  const pickedCls = clsPick ? one(g.classes, clsPick) : undefined;
  const capN = pickedCls ? roster(g, pickedCls.id).length : 0;
  const overCap = pickedCls ? capN >= (pickedCls.capacity || 0) : false;
  const pays = enrId ? (g.payments || []).filter((p) => p.enrollment_id === enrId) : [];

  function pickEnr(id: string, studentId: string) {
    setStuId(studentId);
    setEnrId(id);
    setClsPick("");
    go("thu-phi", id);
  }

  function pickStu(id: string) {
    setStuId(id);
    setQ("");
    const mine = g.enrollments.filter((e) => e.student_id === id && e.status === "active");
    const hit = mine.find((e) => needPay(g, e)) || mine[0];
    setEnrId(hit?.id || null);
    go("thu-phi", hit?.id || id);
  }

  function enrollAndPay() {
    if (!stu || !clsPick) return;
    const id = createEnroll({
      class_id: clsPick,
      student_id: stu.id,
      status: "active",
      billing_contact_id: null,
    });
    if (!id) return;
    setEnrId(id);
    setClsPick("");
    go("thu-phi", id);
  }

  const pad = phone ? "p-3" : "p-5";

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="thu-phi">
      <PageHead
        trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Thu phí" }]}
        actions={
          <Button variant="outline" onClick={() => go("so-thu")}>Sổ thu chi nhánh</Button>
        }
      />
      <div className={cn("min-h-0 flex-1 overflow-auto", phone ? "flex flex-col" : "grid grid-cols-[minmax(280px,22rem)_1fr]")}>
        <aside className={cn("min-h-0 overflow-auto border-b", phone ? pad : cn(pad, "border-r border-b-0"))}>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm học sinh để ghi danh / nạp"
              className="h-11 pl-8"
              data-slot="thu-search"
            />
          </div>
          {stuHits.length ? (
            <ul className="mt-2 divide-y rounded-xl border bg-card" data-slot="thu-search-hits">
              {stuHits.map((s) => (
                <li key={s.id}>
                  <button type="button" className="flex w-full px-3 py-2.5 text-left hover:bg-muted/60" onClick={() => pickStu(s.id)}>
                    <Person name={s.full_name} sub={ensOf(g, s.id)} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cần thu · {queue.length}</p>
          {queue.length ? (
            <ul className="divide-y rounded-xl border bg-card" data-slot="can-thu">
              {queue.map((e) => {
                const on = e.id === enrId;
                const debt = unpaidLearned(g, e.id).length;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      data-slot="can-thu-row"
                      data-enr={e.id}
                      onClick={() => pickEnr(e.id, e.student_id)}
                      className={cn("flex w-full px-3 py-2.5 text-left", on ? "bg-muted" : "hover:bg-muted/60")}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <Person
                          name={stuName(g, e.student_id)}
                          sub={`${clsName(g, e.class_id)} · ${billingLabel(g, e)}${debt ? ` · nợ ${debt}` : ""}`}
                        />
                        <span className="mt-1 inline-flex"><StuStatus pay={enrollPayKind(g, e)} /></span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Không có sổ hết buổi học / nợ.</p>
          )}

          {stu ? (
            <div className="mt-5" data-slot="thu-student">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lớp của {stu.full_name}</p>
              {ens.length ? (
                <ul className="divide-y rounded-xl border bg-card">
                  {ens.map((e) => {
                    const on = e.id === enrId;
                    return (
                      <li key={e.id} className={cn("flex items-center justify-between gap-2 px-3 py-2", on && "bg-muted")}>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => pickEnr(e.id, stu.id)}>
                          <Person name={clsName(g, e.class_id)} sub={billingLabel(g, e)} />
                        </button>
                        {moneyOk ? (
                          <Button size="sm" variant={on ? "default" : "outline"} onClick={() => pickEnr(e.id, stu.id)}>
                            Nạp buổi học
                          </Button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa ghi danh lớp nào.</p>
              )}

              {writeEnroll && openClasses.length ? (
                <div className="mt-3 space-y-2 rounded-xl border bg-card p-3" data-slot="thu-enroll">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Ghi danh lớp mới</p>
                  <Select value={clsPick} onValueChange={setClsPick}>
                    <SelectTrigger className="w-full min-h-11" data-slot="thu-enroll-class"><SelectValue placeholder="Chọn lớp" /></SelectTrigger>
                    <SelectContent>
                      {openClasses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pickedCls ? (
                    <p className="text-xs text-muted-foreground">
                      {planLabel(courseOf(g, pickedCls.id)?.plan)} · {formatRecurrence(pickedCls.recurrence)} · {tchName(g, pickedCls.default_teacher_id)} · {capN}/{pickedCls.capacity}
                    </p>
                  ) : null}
                  {overCap ? (
                    <Alert>
                      <AlertTitle>Sĩ số đầy — vẫn ghi</AlertTitle>
                      <AlertDescription>Cảnh báo mềm. Ghi danh không bị chặn.</AlertDescription>
                    </Alert>
                  ) : null}
                  <Button className="min-h-11 w-full" disabled={!clsPick} onClick={enrollAndPay}>
                    Ghi danh & thu
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">Chọn học sinh hết buổi học, hoặc tìm tên để ghi danh rồi thu.</p>
          )}
        </aside>

        <section className={cn("min-h-0 overflow-auto", pad)} data-slot="thu-pay">
          {enrId && moneyOk ? (
            <>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Thu / nạp buổi học</p>
              <PayPanel key={enrId} enrollmentId={enrId} embedded />
              <p className="mt-6 mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Phiếu thu lớp này</p>
              <PayHistory g={g} items={pays} />
            </>
          ) : enrId && !moneyOk ? (
            <>
              <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sổ</p>
              <p className="text-sm text-muted-foreground">{billingLabel(g, one(g.enrollments, enrId))}</p>
              <div className="mt-4">
                <PayHistory g={g} items={pays} />
              </div>
            </>
          ) : (
            <Empty t="Chọn học sinh bên trái" />
          )}
        </section>
      </div>
    </div>
  );
}

function ensOf(g: Graph, studentId: string) {
  const names = g.enrollments.filter((e) => e.student_id === studentId && e.status === "active").map((e) => clsName(g, e.class_id).split("—")[0].trim());
  return names.length ? names.join(" · ") : "chưa ghi danh";
}

type PayRow = {
  id: string;
  date: string;
  student: string;
  className: string;
  amount: number;
  amountLabel: string;
  method: string;
  grant: string;
  note: string;
  actor: string;
  studentId: string;
  month: string;
};

export function SoThu() {
  const g = useEdu((s) => s.graph)!;
  const openPeek = useEdu((s) => s.openPeek);
  const peekStack = useEdu((s) => s.peekStack);
  const go = useEdu((s) => s.go);
  const role = useEdu((s) => s.role);
  const workspace = useEdu((s) => s.workspace);
  const deletePayment = useEdu((s) => s.deletePayment);
  const moneyOk = canMoney(role);
  const { menu, setMenu, pending, setPending, onRowContextMenu } = useRowActions<PayRow>();
  const rows: PayRow[] = useMemo(() => {
    return [...(g.payments || [])]
      .sort((a, b) => (b.paid_at || "").localeCompare(a.paid_at || "") || b.id.localeCompare(a.id))
      .map((p) => ({
        id: p.id,
        date: p.paid_at,
        student: stuName(g, p.student_id),
        className: clsName(g, p.class_id),
        amount: p.amount,
        amountLabel: money(p.amount),
        method: p.method,
        grant: grantLabel(p),
        note: p.note || "—",
        actor: p.actor,
        studentId: p.student_id,
        month: (p.paid_at || "").slice(0, 7),
      }));
  }, [g]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const months = [...new Set(rows.map((r) => r.month))].sort().reverse();
  const cols: ColumnDef<PayRow>[] = [
    { accessorKey: "date", header: "Ngày", cell: ({ getValue }) => fmtShort(String(getValue())) },
    { accessorKey: "student", header: "Học sinh", cell: ({ row }) => <span className="font-medium">{row.original.student}</span> },
    { accessorKey: "className", header: "Lớp" },
    { accessorKey: "amountLabel", header: "Số thu", cell: ({ getValue }) => <span className="tabular-nums">{String(getValue())}</span> },
    { accessorKey: "method", header: "Hình thức", cell: ({ getValue }) => statusVn(String(getValue())) },
    { accessorKey: "grant", header: "Cộng sổ" },
    { accessorKey: "note", header: "Ghi chú" },
    { accessorKey: "actor", header: "Người thu" },
    { accessorKey: "month", header: "Tháng", cell: ({ getValue }) => {
      const m = String(getValue());
      const [y, mo] = m.split("-");
      return y && mo ? `Tháng ${Number(mo)}/${y}` : m;
    } },
  ];
  const openId = peekStack[0]?.kind === "student" ? peekStack[0].id : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="so-thu">
      <PageHead
        trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Sổ thu" }]}
        actions={
          <div className="flex items-center gap-2">
            <p className="text-sm tabular-nums text-muted-foreground">{rows.length} phiếu · {money(total)}</p>
            {workspace !== "draft" ? <Button variant="outline" onClick={() => go("thu-phi")}>Thu phí</Button> : null}
          </div>
        }
      />
      <TableStage>
        <DataTable
          columns={cols}
          data={rows}
          getRowId={(r) => r.id}
          activeId={openId}
          searchPlaceholder="Tìm tên HS, lớp, số tiền, ghi chú"
          empty="Chưa có phiếu thu"
          facets={[
            { id: "method", label: "Hình thức", options: [{ value: "cash", label: "tiền mặt" }, { value: "transfer", label: "chuyển khoản" }, { value: "momo", label: "MoMo" }] },
            { id: "month", label: "Tháng", options: months.map((m) => ({ value: m, label: `Tháng ${Number(m.slice(5))}/${m.slice(0, 4)}` })) },
            { id: "className", label: "Lớp", options: [...new Set(rows.map((r) => r.className))].map((v) => ({ value: v, label: v })) },
          ]}
          onRowClick={(row) => openPeek("student", row.studentId)}
          onRowContextMenu={onRowContextMenu}
        />
      </TableStage>
      {menu ? (
        <RowContextMenu
          pos={menu.pos}
          onClose={() => setMenu(null)}
          onDetail={() => go("hs-detail", menu.row.studentId)}
          onDelete={moneyOk ? () => setPending(menu.row) : undefined}
        />
      ) : null}
      <ConfirmDeleteDialog
        open={!!pending}
        title="Xóa phiếu thu?"
        name={pending ? `${pending.student} · ${pending.amountLabel}` : ""}
        onClose={() => setPending(null)}
        onConfirm={() => { if (pending) deletePayment(pending.id); setPending(null); }}
      />
    </div>
  );
}
