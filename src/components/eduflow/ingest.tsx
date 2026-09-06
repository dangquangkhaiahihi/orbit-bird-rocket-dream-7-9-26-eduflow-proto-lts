import { useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  KIND_ORDER, KIND_VN, LAYER_VN, FIELD_VN, FIELDS_FOR, PHASE_VN, STAGING_TABLES, GATES,
  allSheets, canGotoPhase, exceptionCount, layerOf, parseFiles, sampleDump, sheetKey, stage3Payload,
  type FieldKey, type IngestPhase, type SheetKind,
} from "@/lib/eduflow/ingest";
import { PHASE_VN as PHASE_LABEL, type DraftMeta } from "@/lib/eduflow/draft";
import { useEdu } from "@/lib/eduflow/store";
import { cn } from "@/lib/utils";
import { PageHead } from "./atoms";
import {
  ArrowLeft, ArrowRight, Check, FileSpreadsheet, FolderOpen, Save, Trash2, Upload, X,
} from "lucide-react";
import { toast } from "sonner";
import { LinkReviewPanel } from "./ingest-review";
import { reviewPending } from "@/lib/eduflow/ingest-review";

function kindTone(kind: SheetKind) {
  if (kind === "UNKNOWN") return "border-bad/30 bg-bad-soft text-bad";
  if (layerOf(kind) === "foundation") return "border-ok/30 bg-ok-soft text-ok";
  return "border-wait/30 bg-wait-soft text-wait";
}

export function IngestBanner() {
  const ingest = useEdu((s) => s.ingest);
  const workspace = useEdu((s) => s.workspace);
  const go = useEdu((s) => s.go);
  const openDraftDesk = useEdu((s) => s.openDraftDesk);
  const saveDraft = useEdu((s) => s.saveDraft);
  if (workspace === "draft") return null;
  if (ingest.phase === "drop" || ingest.phase === "done") return null;
  const n = ingest.files.length;
  return (
    <Alert className="mb-4" data-slot="ingest-banner">
      <AlertTitle>Lô đang nhập · {n} file · {PHASE_VN[ingest.phase]}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>Chưa ghi sổ chính. Có thể cất nháp rồi mở lô khác.</span>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" data-slot="banner-continue" onClick={() => go("nhap-so")}>Tiếp tục nhập</Button>
          <Button size="sm" variant="outline" data-slot="banner-open-draft" onClick={() => openDraftDesk()}>Xem sổ nháp</Button>
          <Button size="sm" variant="outline" data-slot="save-draft" onClick={() => saveDraft()}>Lưu nháp</Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

export function DraftBanner() {
  const workspace = useEdu((s) => s.workspace);
  const ingest = useEdu((s) => s.ingest);
  const go = useEdu((s) => s.go);
  const saveDraft = useEdu((s) => s.saveDraft);
  const exitDraft = useEdu((s) => s.exitDraft);
  if (workspace !== "draft") return null;
  return (
    <Alert className="mb-4 border-warn/30 bg-warn-soft" data-slot="draft-banner">
      <AlertTitle>Sổ nháp · {PHASE_VN[ingest.phase]} · rà dữ liệu lô này</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>Xem, sửa, thêm bản ghi và kiểm tra lịch trong lô nhập. Hôm nay, thu phí, Zalo, OA tắt.</span>
        <span className="flex flex-wrap gap-2">
          <Button size="sm" data-slot="draft-continue" onClick={() => { exitDraft(); go("nhap-so"); }}>Tiếp tục nhập</Button>
          <Button size="sm" variant="outline" data-slot="save-draft" onClick={() => saveDraft()}>Lưu nháp</Button>
          <Button size="sm" variant="ghost" data-slot="draft-back" onClick={() => { exitDraft(); go("hom-nay"); }}>Về IMPACT</Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

export function IngestPage() {
  const ingest = useEdu((s) => s.ingest);
  const drafts = useEdu((s) => s.drafts);
  const saveDraft = useEdu((s) => s.saveDraft);
  const openDraftDesk = useEdu((s) => s.openDraftDesk);
  const abortIngest = useEdu((s) => s.abortIngest);
  const phase = ingest.phase;
  const wizard = phase !== "drop" && phase !== "done";
  const inflight = ingest.files.length > 0 && phase !== "done";
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="ingest-page">
      <PageHead
        trail={[{ label: "IMPACT", go: "hom-nay" }, { label: "Nhập sổ" }]}
        actions={inflight ? (
          <>
            {wizard ? (
              <Button variant="outline" size="sm" data-slot="open-draft-desk" onClick={() => openDraftDesk()}>Xem sổ nháp</Button>
            ) : null}
            {wizard ? (
              <Button variant="outline" size="sm" data-slot="save-draft" onClick={() => saveDraft()}>
                <Save className="size-4" /> Lưu nháp
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" data-slot="abort-ingest" onClick={() => abortIngest()}>
              <X className="size-4" /> Bỏ lô
            </Button>
          </>
        ) : undefined}
      />
      <div className="min-h-0 flex-1 overflow-auto p-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Zero-template · 5 cổng HITL</p>
        <h1 className="font-display mt-1 text-2xl tracking-tight">Nhập sổ</h1>
        <p className="mt-1 mb-5 text-sm text-muted-foreground">
          Dump nhiều file, mỗi sheet một mô hình. Nền trước — quan hệ sau. Cổng 4 đối chiếu sổ chính: trùng HS/lớp và lệch lịch phải chọn cách xử lý trước khi ghi.
        </p>
        {wizard ? <GateNav phase={phase} /> : null}
        {phase === "drop" || phase === "done" ? <DropZone drafts={drafts} /> : null}
        {phase === "classify" ? <GateClassify /> : null}
        {phase === "map" ? <GateMap /> : null}
        {phase === "clean" ? <GateClean /> : null}
        {phase === "link" ? <GateLink /> : null}
        {phase === "commit" ? <GateCommit /> : null}
      </div>
    </div>
  );
}

function GateNav({ phase }: { phase: IngestPhase }) {
  const ingest = useEdu((s) => s.ingest);
  const gotoIngestPhase = useEdu((s) => s.gotoIngestPhase);
  return (
    <ol className="mb-5 flex flex-wrap gap-1.5" data-slot="ingest-gates">
      {GATES.map((p) => {
        const on = p === phase;
        const reachable = canGotoPhase(ingest, p);
        const wait = !on && !reachable;
        return (
          <li key={p} data-slot="ingest-gate" data-phase={p} data-state={on ? "on" : reachable ? "done" : "wait"}>
            <button
              type="button"
              data-slot="ingest-gate-btn"
              disabled={!reachable}
              aria-current={on ? "step" : undefined}
              onClick={() => { if (!on) gotoIngestPhase(p); }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors",
                on && "border-foreground bg-foreground text-background",
                reachable && !on && "border-ok/30 bg-ok-soft text-ok hover:border-foreground",
                wait && "cursor-not-allowed text-muted-foreground",
              )}
            >
              {reachable && !on ? <Check className="size-3" /> : <span className="tabular-nums">{GATES.indexOf(p) + 1}</span>}
              {PHASE_LABEL[p]}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function GateActions({ nextLabel, onNext, disabled }: { nextLabel: string; onNext: () => void; disabled?: boolean }) {
  const retreatIngest = useEdu((s) => s.retreatIngest);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" data-slot="gate-back" onClick={() => retreatIngest()}>
        <ArrowLeft className="size-4" /> Quay lại
      </Button>
      <Button data-slot="gate-next" onClick={onNext} disabled={disabled}>
        {nextLabel} <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

function DropZone({ drafts }: { drafts: DraftMeta[] }) {
  const ingest = useEdu((s) => s.ingest);
  const beginIngest = useEdu((s) => s.beginIngest);
  const resumeDraft = useEdu((s) => s.resumeDraft);
  const deleteDraft = useEdu((s) => s.deleteDraft);
  const gotoIngestPhase = useEdu((s) => s.gotoIngestPhase);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);

  async function take(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => /\.(xlsx|xls|csv)$/i.test(f.name));
    if (!list.length) { toast("Chọn file .xlsx hoặc .csv"); return; }
    setBusy(true);
    try {
      const parsed = await parseFiles(list);
      beginIngest(parsed);
    } catch (e) {
      toast("Không đọc được file");
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-slot="ingest-drop">
      <Card
        className={cn("border-dashed", over && "ring-2 ring-foreground/20")}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }}
      >
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Upload className="size-4" /> Thả file Excel</CardTitle>
          <CardDescription>Nhiều file, nhiều sheet. Mỗi sheet một mô hình (HS, khóa, lớp, ghi danh, sổ buổi…).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <input ref={input} type="file" accept=".xlsx,.xls,.csv" multiple className="hidden" onChange={(e) => { if (e.target.files) take(e.target.files); e.target.value = ""; }} />
          <Button onClick={() => input.current?.click()} disabled={busy} data-slot="pick-files">
            <FileSpreadsheet className="size-4" /> {ingest.files.length ? "Thêm / thay file" : "Chọn file"}
          </Button>
          <Button variant="outline" disabled={busy} data-slot="load-sample" onClick={() => beginIngest(sampleDump())}>
            Dùng lô mẫu IMPACT
          </Button>
        </CardContent>
      </Card>

      {ingest.files.length ? (
        <Card data-slot="ingest-kept-files">
          <CardHeader>
            <CardTitle>Lô đang mở</CardTitle>
            <CardDescription>Quay lại từ cổng sau. Sửa file sẽ thay lô; hoặc tiếp tục phân loại.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-lg border bg-muted/40">
              {ingest.files.map((f) => (
                <li key={f.name} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="truncate font-medium">{f.name}</span>
                  <span className="tabular-nums text-muted-foreground">{f.sheets.length} sheet</span>
                </li>
              ))}
            </ul>
            <Button data-slot="resume-classify" onClick={() => gotoIngestPhase("classify")}>
              Tiếp tục phân loại <ArrowRight className="size-4" />
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div data-slot="draft-list">
        <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sổ nháp đã lưu</p>
        {!drafts.length ? (
          <p className="text-sm text-muted-foreground" data-slot="draft-empty">Chưa có lô nào. Lưu nháp giữa chừng để mở lại sau.</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-slot="draft-item" data-draft-id={d.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PHASE_LABEL[d.phase]} · {d.counts.students} HS · {d.counts.classes} lớp · {d.counts.files} file
                    {" · "}
                    {new Date(d.updatedAt).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
                  </p>
                </div>
                <Button size="sm" data-slot="resume-draft" onClick={() => resumeDraft(d.id, { openDesk: false })}>Tiếp tục nhập</Button>
                <Button size="sm" variant="outline" data-slot="open-saved-draft" onClick={() => resumeDraft(d.id, { openDesk: true })}>
                  <FolderOpen className="size-4" /> Mở sổ
                </Button>
                <Button size="sm" variant="ghost" data-slot="delete-draft" onClick={() => deleteDraft(d.id)}>
                  <Trash2 className="size-4" /> Xóa
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function GateClassify() {
  const ingest = useEdu((s) => s.ingest);
  const setSheetKind = useEdu((s) => s.setSheetKind);
  const advanceIngest = useEdu((s) => s.advanceIngest);
  const sheets = allSheets(ingest.files);
  const layers = [...new Set(sheets.map((s) => layerOf(s.kind)))];
  return (
    <div className="space-y-4" data-slot="gate-classify">
      <div className="flex flex-wrap gap-2" data-slot="ingest-layers">
        {layers.map((l) => (
          <Badge key={l} variant="outline" data-slot="ingest-layer" data-layer={l}>{LAYER_VN[l]}</Badge>
        ))}
        {STAGING_TABLES.map((t) => (
          <span key={t.kind} data-slot="staging-kind" data-kind={t.kind} className="sr-only">{t.label}</span>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cổng 1 · Phân loại sheet</CardTitle>
          <CardDescription>Mỗi sheet một mô hình. Nền trước, quan hệ sau. Sửa loại nếu đoán sai.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Sheet</TableHead>
                <TableHead>Hàng</TableHead>
                <TableHead>Lớp</TableHead>
                <TableHead>Loại</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sheets.map((s) => (
                <TableRow key={sheetKey(s)} data-slot="sheet-row">
                  <TableCell className="text-muted-foreground">{s.file}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="tabular-nums">{s.rows.length}</TableCell>
                  <TableCell>
                    <Badge variant="outline" data-slot="ingest-layer" data-layer={layerOf(s.kind)}>{LAYER_VN[layerOf(s.kind)]}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="sr-only" data-slot="sheet-kind" data-kind={s.kind}>{s.kind}</span>
                    <Select value={s.kind} onValueChange={(v) => setSheetKind(sheetKey(s), v as SheetKind)}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {KIND_ORDER.map((k) => (
                          <SelectItem key={k} value={k}>{KIND_VN[k]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <GateActions nextLabel="Xác nhận phân loại" onNext={() => advanceIngest()} />
    </div>
  );
}

function GateMap() {
  const ingest = useEdu((s) => s.ingest);
  const setMapField = useEdu((s) => s.setMapField);
  const setMapSheet = useEdu((s) => s.setMapSheet);
  const advanceIngest = useEdu((s) => s.advanceIngest);
  const sheets = allSheets(ingest.files);
  const i = Math.min(ingest.mapSheet, Math.max(0, sheets.length - 1));
  const s = sheets[i];
  if (!s) return null;
  const map = ingest.maps[sheetKey(s)] || {};
  const fields = FIELDS_FOR[s.kind];
  return (
    <div className="space-y-4" data-slot="gate-map">
      <div className="flex flex-wrap gap-1">
        {sheets.map((x, idx) => (
          <Button key={sheetKey(x)} size="sm" variant={idx === i ? "default" : "outline"} onClick={() => setMapSheet(idx)}>
            {x.name}
          </Button>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cổng 2 · Ánh xạ cột · {s.name}</CardTitle>
          <CardDescription>
            <Badge variant="outline" className={kindTone(s.kind)}>{KIND_VN[s.kind]}</Badge>
            {" "}Gán cột file vào trường sổ.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cột file</TableHead>
                <TableHead>Trường sổ</TableHead>
                <TableHead>Mẫu</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.headers.map((h) => (
                <TableRow key={h}>
                  <TableCell className="font-medium">{h}</TableCell>
                  <TableCell>
                    <Select value={map[h] || "ignore"} onValueChange={(v) => setMapField(sheetKey(s), h, v as FieldKey)}>
                      <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Bỏ qua</SelectItem>
                        {fields.map((f) => (
                          <SelectItem key={f} value={f}>{FIELD_VN[f]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">{s.rows[0]?.[s.headers.indexOf(h)] || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <GateActions nextLabel="Xác nhận ánh xạ" onNext={() => advanceIngest()} />
    </div>
  );
}

function GateClean() {
  const ingest = useEdu((s) => s.ingest);
  const advanceIngest = useEdu((s) => s.advanceIngest);
  const issues = ingest.records.filter((r) => r.issues.length);
  const schema = stage3Payload(ingest.records);
  const phones = ingest.records.filter((r) => r.values.phone?.startsWith("+84")).slice(0, 3);
  return (
    <div className="space-y-4" data-slot="gate-clean">
      <Card>
        <CardHeader>
          <CardTitle>Cổng 3 · Làm sạch</CardTitle>
          <CardDescription>{issues.length} ngoại lệ cần duyệt · SĐT chuẩn E.164.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="overflow-auto rounded-lg border bg-muted p-3 text-xs" data-slot="ingest-schema">
            {JSON.stringify(schema, null, 2)}
          </pre>
          <div data-slot="e164-samples" className="text-sm">
            {phones.map((r) => (
              <p key={r.id} className="tabular-nums">{r.values.student_name}: {r.values.phone}</p>
            ))}
          </div>
          {issues.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sheet</TableHead>
                  <TableHead>Hàng</TableHead>
                  <TableHead>Lỗi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((r) => (
                  <TableRow key={r.id} data-slot="ingest-exception">
                    <TableCell>{r.sheet}</TableCell>
                    <TableCell className="tabular-nums">{r.row}</TableCell>
                    <TableCell>{r.issues.map((i) => i.message).join(" · ")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Không có ngoại lệ.</p>
          )}
        </CardContent>
      </Card>
      <GateActions nextLabel="Giữ ngoại lệ · tiếp" onNext={() => advanceIngest()} />
    </div>
  );
}

function GateLink() {
  const ingest = useEdu((s) => s.ingest);
  const advanceIngest = useEdu((s) => s.advanceIngest);
  const pending = reviewPending(ingest.review);
  return (
    <div className="space-y-4" data-slot="gate-link">
      <LinkReviewPanel />
      <GateActions
        nextLabel={pending ? `Còn ${pending} mục` : "Xác nhận nối"}
        disabled={pending > 0}
        onNext={() => {
          if (pending) { toast(`Còn ${pending} mục chưa xử lý`); return; }
          advanceIngest();
        }}
      />
    </div>
  );
}

function GateCommit() {
  const ingest = useEdu((s) => s.ingest);
  const commitIngest = useEdu((s) => s.commitIngest);
  const openDraftDesk = useEdu((s) => s.openDraftDesk);
  const retreatIngest = useEdu((s) => s.retreatIngest);
  const r = ingest.result;
  const nEx = exceptionCount(ingest.records, ingest.linked);
  return (
    <div className="space-y-4" data-slot="gate-commit">
      <Card>
        <CardHeader>
          <CardTitle>Cổng 5 · Ghi vào sổ IMPACT</CardTitle>
          <CardDescription>
            Chỉ bước này ghi sổ chính. Số liệu đã trừ bản ghi chọn Giữ / Gộp / Ghi đè. Lệch lịch đã dời giờ hoặc đổi phòng sẽ áp vào lớp mới.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Stat k="Học sinh mới" n={r?.students || 0} />
          <Stat k="Khóa học" n={r?.courses || 0} />
          <Stat k="Lớp" n={r?.classes || 0} />
          <Stat k="Ghi danh" n={r?.enrollments || 0} />
          <Stat k="Buổi lịch sử" n={r?.lessons || 0} />
          <Stat k="Ngoại lệ bỏ qua" n={nEx} />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" data-slot="gate-back" onClick={() => retreatIngest()}>
          <ArrowLeft className="size-4" /> Quay lại
        </Button>
        <Button variant="outline" onClick={() => openDraftDesk()}>Xem sổ nháp</Button>
        <Button data-slot="commit-ingest" onClick={() => commitIngest()}>Ghi vào sổ IMPACT</Button>
      </div>
    </div>
  );
}

function Stat({ k, n }: { k: string; n: number }) {
  return (
    <div className="rounded-lg border bg-muted/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="font-display text-xl tabular-nums">{n}</p>
    </div>
  );
}

export function IngestDoneNote() {
  const ingest = useEdu((s) => s.ingest);
  const r = ingest.result;
  if (ingest.phase !== "done" || !r) return null;
  return (
    <Alert className="mb-4" data-slot="ingest-done">
      <AlertTitle>Đã ghi sổ</AlertTitle>
      <AlertDescription>{r.students} HS · {r.classes} lớp · {r.enrollments} ghi danh.</AlertDescription>
    </Alert>
  );
}
