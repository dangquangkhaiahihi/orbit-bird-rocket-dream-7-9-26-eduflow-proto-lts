import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Graph, RecurrenceDay } from "./types.ts";
import { applyClassSchedule, applyOccurrence, clashPolicy, classPhase, isLessonFrozen, isLessonMutable, materializeNewClass } from "./schedule.ts";
import { slotClash } from "./clash.ts";

function g0(over: Partial<Graph> = {}): Graph {
  return {
    meta: { version: "1", tenant_name: "T", clock: "2026-08-23T07:42:00+07:00", today: "2026-08-23", today_label: "CN" },
    settings: { remind_days_before: 3 },
    tenant: { id: "t", name: "T", legal_name: "T", phone: "", zalo_oa_id: "" },
    branches: [{ id: "br_cg", tenant_id: "t", name: "CG", code: "CG", address: "", phone: "", active: true, notes: "" }],
    rooms: [
      { id: "rm1", branch_id: "br_cg", name: "P1", capacity: 12, type: "classroom", active: true, notes: "" },
      { id: "rm2", branch_id: "br_cg", name: "P2", capacity: 8, type: "classroom", active: true, notes: "" },
      { id: "rm_on", branch_id: "br_cg", name: "On", capacity: 40, type: "online", active: true, notes: "" },
    ],
    teachers: [
      { id: "tch1", name: "A", phone: "", email: "", user_id: null, default_branch_id: "br_cg", branch_ids: ["br_cg"], subjects: [], active: true },
      { id: "tch2", name: "B", phone: "", email: "", user_id: null, default_branch_id: "br_cg", branch_ids: ["br_cg"], subjects: [], active: true },
    ],
    staff_profiles: [],
    profile_roles: [],
    students: [{ id: "st1", full_name: "An", dob: "2012-01-01", branch_id: "br_cg", phone: null, active: true, notes: "" }],
    guardians: [],
    student_guardians: [],
    classes: [],
    courses: [{
      id: "crs1", name: "Toán 9", content_key: "Toán 9", subject: "Toán", level: "9", duration_min: 90,
      plan: { model: "monthly", fee: 1000000, proration: false }, promotions: [], active: true,
    }],
    enrollments: [],
    payments: [],
    lessons: [],
    attendance: [],
    makeups: [],
    homework: [],
    notes: [],
    zalo_oa: { id: "oa", tenant_id: "t", oa_name: "OA", connected: false, quota_used: 0, quota_limit: 0, webhook_ok: false, templates: [] },
    zalo_events: [],
    exceptions: [],
    timeline_events: [],
    remind_batches: [],
    remind_items: [],
    absent_ignores: [],
    ...over,
  };
}

function days(wd: number, hhmm: string): RecurrenceDay[] {
  return [{ weekday: wd, start_time: hhmm }];
}

function les(id: string, classId: string, start: string, end: string, extra: Partial<Graph["lessons"][number]> = {}): Graph["lessons"][number] {
  return {
    id, class_id: classId, branch_id: "br_cg", teacher_id: extra.teacher_id || "tch1", room_id: extra.room_id || "rm1",
    start, end, status: extra.status || "scheduled", is_makeup: extra.is_makeup || false,
    original_lesson_id: extra.original_lesson_id || null, substitute: extra.substitute || false,
    override: extra.override,
  };
}

function cls(id: string, extra: Partial<Graph["classes"][number]> = {}): Graph["classes"][number] {
  return {
    id, branch_id: "br_cg", name: extra.name || "Toán · CN", content_key: "Toán 9", course_id: "crs1",
    default_teacher_id: extra.default_teacher_id || "tch1",
    default_room_id: extra.default_room_id || "rm1",
    capacity: extra.capacity || 12,
    recurrence: extra.recurrence || { duration_min: 90, days: days(0, "09:00") },
    start_date: extra.start_date || "2026-08-30",
    end_date: extra.end_date ?? "2026-09-27",
    billing_mode: "monthly", fee: 1000000, active: extra.active ?? true,
    life: extra.life,
  };
}

let seq = 0;
function io() {
  return { nid: (p: string) => `${p}_t${++seq}` };
}

describe("clashPolicy", () => {
  it("thresholds", () => {
    assert.equal(clashPolicy(0), "apply");
    assert.equal(clashPolicy(1), "cover");
    assert.equal(clashPolicy(4), "cover");
    assert.equal(clashPolicy(5), "block");
  });
});

describe("classPhase + freeze", () => {
  it("not_started when all lessons in future", () => {
    const g = g0({
      classes: [cls("c1")],
      lessons: [les("l1", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00")],
    });
    assert.equal(classPhase(g, g.classes[0]), "not_started");
    assert.equal(isLessonFrozen(g, g.lessons[0]), false);
    assert.equal(isLessonMutable(g, g.lessons[0]), true);
  });
  it("running + in-progress frozen", () => {
    const g = g0({
      meta: { version: "1", tenant_name: "T", clock: "2026-08-23T09:15:00+07:00", today: "2026-08-23", today_label: "CN" },
      classes: [cls("c1", { start_date: "2026-08-16" })],
      lessons: [
        les("past", "c1", "2026-08-16T09:00:00+07:00", "2026-08-16T10:30:00+07:00"),
        les("now", "c1", "2026-08-23T09:00:00+07:00", "2026-08-23T10:30:00+07:00"),
        les("fut", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
      ],
    });
    assert.equal(classPhase(g, g.classes[0]), "running");
    assert.equal(isLessonFrozen(g, g.lessons[1]), true);
    assert.equal(isLessonMutable(g, g.lessons[2]), true);
  });
  it("finished locked", () => {
    const g = g0({
      classes: [cls("c1", { end_date: "2026-08-20", start_date: "2026-07-01" })],
      lessons: [les("l1", "c1", "2026-08-16T09:00:00+07:00", "2026-08-16T10:30:00+07:00", { status: "completed" })],
    });
    assert.equal(classPhase(g, g.classes[0]), "finished");
    const r = applyClassSchedule(g, "c1", {
      days: days(0, "10:00"), duration_min: 90, start_date: "2026-07-01", end_date: "2026-08-20",
      teacher_id: "tch1", room_id: "rm1",
    }, "series");
    assert.equal(r.status, "locked");
    assert.equal(r.applied, false);
  });
});

describe("applyClassSchedule series", () => {
  it("not_started rematerialize keeps no past", () => {
    const g = g0({
      classes: [cls("c1")],
      lessons: [les("l1", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00")],
    });
    const id = g.lessons[0].id;
    const r = applyClassSchedule(g, "c1", {
      days: days(0, "14:00"), duration_min: 90, start_date: "2026-08-30", end_date: "2026-09-13",
      teacher_id: "tch1", room_id: "rm1",
    }, "series", { io: io() });
    assert.equal(r.status, "ok");
    assert.equal(r.applied, true);
    const live = g.lessons.filter((l) => l.class_id === "c1" && l.status !== "cancelled");
    assert.ok(live.every((l) => l.start.includes("T14:00")));
    assert.ok(live.some((l) => l.id === id), "keep id when date stays");
  });

  it("running does not rewrite frozen or makeup", () => {
    const g = g0({
      classes: [cls("c1", { start_date: "2026-08-16" })],
      lessons: [
        les("past", "c1", "2026-08-16T09:00:00+07:00", "2026-08-16T10:30:00+07:00"),
        les("fut", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
        les("mk", "c1", "2026-08-31T09:00:00+07:00", "2026-08-31T10:30:00+07:00", { is_makeup: true }),
      ],
    });
    applyClassSchedule(g, "c1", {
      days: days(0, "15:00"), duration_min: 90, start_date: "2026-08-16", end_date: "2026-09-13",
      teacher_id: "tch1", room_id: "rm1",
    }, "series", { io: io() });
    const past = g.lessons.find((l) => l.id === "past")!;
    const mk = g.lessons.find((l) => l.id === "mk")!;
    const fut = g.lessons.find((l) => l.id === "fut")!;
    assert.equal(past.start, "2026-08-16T09:00:00+07:00");
    assert.equal(mk.start, "2026-08-31T09:00:00+07:00");
    assert.equal(fut.start, "2026-08-30T15:00:00+07:00");
  });

  it("this-and-future splits; leftover cancelled if empty", () => {
    const g = g0({
      classes: [cls("c1", { start_date: "2026-08-16", recurrence: { duration_min: 90, days: days(0, "09:00") } })],
      lessons: [
        les("past", "c1", "2026-08-16T09:00:00+07:00", "2026-08-16T10:30:00+07:00"),
        les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
        les("b", "c1", "2026-09-06T09:00:00+07:00", "2026-09-06T10:30:00+07:00"),
      ],
    });
    applyClassSchedule(g, "c1", {
      days: [{ weekday: 6, start_time: "10:00" }],
      duration_min: 90,
      start_date: "2026-08-16",
      end_date: "2026-09-20",
      teacher_id: "tch1",
      room_id: "rm1",
    }, "this_and_future", { fromStart: "2026-08-30T09:00:00+07:00", io: io() });
    assert.equal(g.lessons.find((l) => l.id === "past")!.start, "2026-08-16T09:00:00+07:00");
    assert.equal(g.lessons.find((l) => l.id === "a")!.status, "cancelled");
    assert.ok(g.lessons.some((l) => l.status === "scheduled" && l.start.includes("T10:00")));
  });

  it("cancelled future is not resurrected", () => {
    const g = g0({
      classes: [cls("c1")],
      lessons: [
        les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
        les("x", "c1", "2026-09-06T09:00:00+07:00", "2026-09-06T10:30:00+07:00", { status: "cancelled" }),
      ],
    });
    applyClassSchedule(g, "c1", {
      days: days(0, "09:00"), duration_min: 90, start_date: "2026-08-30", end_date: "2026-09-13",
      teacher_id: "tch1", room_id: "rm1",
    }, "series", { io: io() });
    const on6 = g.lessons.filter((l) => l.class_id === "c1" && l.start.startsWith("2026-09-06") && l.status !== "cancelled");
    assert.equal(on6.length, 0);
  });
});

describe("occurrence", () => {
  it("only that session, override=true", () => {
    const g = g0({
      classes: [cls("c1")],
      lessons: [
        les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
        les("b", "c1", "2026-09-06T09:00:00+07:00", "2026-09-06T10:30:00+07:00"),
      ],
    });
    const r = applyOccurrence(g, {
      lesson_id: "a",
      start: "2026-08-30T11:00:00+07:00",
      end: "2026-08-30T12:30:00+07:00",
      teacher_id: "tch1",
      room_id: "rm1",
    });
    assert.equal(r.status, "ok");
    assert.equal(g.lessons.find((l) => l.id === "a")!.override, true);
    assert.equal(g.lessons.find((l) => l.id === "a")!.start, "2026-08-30T11:00:00+07:00");
    assert.equal(g.lessons.find((l) => l.id === "b")!.start, "2026-09-06T09:00:00+07:00");
  });
});

describe("D1 clashN", () => {
  it("cover <5 applies non-clash; block >=5 no mutate", () => {
    const other = cls("c2", {
      default_teacher_id: "tch1",
      start_date: "2026-08-24",
      end_date: "2026-10-12",
      recurrence: { duration_min: 90, days: days(1, "19:00") },
    });
    const mondays = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"];
    const blockerLessons = mondays.map((d, i) =>
      les(`b${i}`, "c2", `${d}T19:00:00+07:00`, `${d}T20:30:00+07:00`),
    );
    const g = g0({
      classes: [cls("c1", { start_date: "2026-09-01", end_date: "2026-09-30" }), other],
      lessons: blockerLessons,
    });
    const before = g.lessons.length;
    const r = materializeNewClass(g, cls("c_new", {
      id: "c_new",
      start_date: "2026-08-24",
      end_date: "2026-10-12",
      default_teacher_id: "tch1",
      recurrence: { duration_min: 90, days: days(1, "19:00") },
    }), io());
    assert.equal(r.status, "block");
    assert.ok(r.clashN >= 5);
    assert.equal(r.applied, false);
    assert.equal(g.classes.some((c) => c.id === "c_new"), false);
    assert.equal(g.lessons.length, before);
  });

  it("1-4 clashes cover and persist other slots", () => {
    const g = g0({
      classes: [cls("c2", {
        default_teacher_id: "tch1",
        start_date: "2026-08-01",
        end_date: "2026-12-01",
        recurrence: { duration_min: 90, days: days(2, "09:00") },
      })],
      lessons: [les("blk", "c2", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00")],
    });
    const r = materializeNewClass(g, cls("c_new", {
      id: "c_new",
      start_date: "2026-08-30",
      end_date: "2026-09-13",
      recurrence: { duration_min: 90, days: days(0, "09:00") },
    }), io());
    assert.equal(r.status, "cover");
    assert.equal(r.applied, true);
    assert.ok(r.clashN >= 1 && r.clashN < 5);
    assert.ok(g.classes.some((c) => c.id === "c_new"));
    const live = g.lessons.filter((l) => l.class_id === "c_new" && l.status === "scheduled");
    assert.ok(live.length >= 1);
    assert.ok(!live.some((l) => l.start.startsWith("2026-08-30")));
  });
});

describe("leftover + attendance ids", () => {
  it("keep + override when leftover has attendance", () => {
    const g = g0({
      classes: [cls("c1", { start_date: "2026-08-16" })],
      lessons: [
        les("past", "c1", "2026-08-16T09:00:00+07:00", "2026-08-16T10:30:00+07:00"),
        les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00"),
        les("b", "c1", "2026-09-06T09:00:00+07:00", "2026-09-06T10:30:00+07:00"),
      ],
      attendance: [{ id: "att1", lesson_id: "a", student_id: "st1", enrollment_id: "e1", status: "present", reason: null, unpaid_flag: false }],
    });
    applyClassSchedule(g, "c1", {
      days: [{ weekday: 6, start_time: "10:00" }],
      duration_min: 90,
      start_date: "2026-08-16",
      end_date: "2026-09-20",
      teacher_id: "tch1",
      room_id: "rm1",
    }, "this_and_future", { fromStart: "2026-08-30T09:00:00+07:00", io: io() });
    const a = g.lessons.find((l) => l.id === "a")!;
    assert.equal(a.status, "scheduled");
    assert.equal(a.override, true);
    assert.equal(a.start, "2026-08-30T09:00:00+07:00");
    assert.equal(g.attendance[0].lesson_id, "a");
    assert.equal(g.lessons.find((l) => l.id === "b")!.status, "cancelled");
  });
});

describe("validate + warn-only", () => {
  it("rejects duration crossing midnight", () => {
    const g = g0({ classes: [cls("c1")] });
    const r = applyClassSchedule(g, "c1", {
      days: [{ weekday: 0, start_time: "23:00" }],
      duration_min: 90,
      start_date: "2026-08-30",
      end_date: "2026-09-13",
      teacher_id: "tch1",
      room_id: "rm1",
    }, "series");
    assert.equal(r.status, "invalid");
    assert.equal(r.applied, false);
  });

  it("rejects inactive teacher", () => {
    const g = g0({
      classes: [cls("c1")],
      teachers: [
        { id: "tch1", name: "A", phone: "", email: "", user_id: null, default_branch_id: "br_cg", branch_ids: ["br_cg"], subjects: [], active: false },
        { id: "tch2", name: "B", phone: "", email: "", user_id: null, default_branch_id: "br_cg", branch_ids: ["br_cg"], subjects: [], active: true },
      ],
    });
    const r = applyClassSchedule(g, "c1", {
      days: days(0, "09:00"), duration_min: 90, start_date: "2026-08-30", end_date: "2026-09-13",
      teacher_id: "tch1", room_id: "rm1",
    }, "series");
    assert.equal(r.status, "invalid");
    assert.match(r.message, /Giáo viên/);
  });

  it("student overlap is warn only", () => {
    const g = g0({
      classes: [
        cls("c1", { start_date: "2026-08-30", end_date: "2026-09-13" }),
        cls("c2", { default_teacher_id: "tch2", default_room_id: "rm2", start_date: "2026-08-30", end_date: "2026-09-13" }),
      ],
      lessons: [les("x", "c2", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00", { teacher_id: "tch2", room_id: "rm2" })],
      enrollments: [
        { id: "e1", class_id: "c1", student_id: "st1", status: "active", enrolled_at: "2026-08-01", billing_mode: "monthly", paid_through: null, remaining_sessions: 8, course_done: null, course_total: null, billing_contact_id: null },
        { id: "e2", class_id: "c2", student_id: "st1", status: "active", enrolled_at: "2026-08-01", billing_mode: "monthly", paid_through: null, remaining_sessions: 8, course_done: null, course_total: null, billing_contact_id: null },
      ],
    });
    const r = applyClassSchedule(g, "c1", {
      days: days(0, "09:00"), duration_min: 90, start_date: "2026-08-30", end_date: "2026-09-13",
      teacher_id: "tch1", room_id: "rm1",
    }, "series", { io: io() });
    assert.equal(r.status, "ok");
    assert.equal(r.applied, true);
    assert.ok(r.studentWarns.length >= 1);
  });
});

describe("occurrence freeze", () => {
  it("does not move a frozen lesson", () => {
    const g = g0({
      meta: { version: "1", tenant_name: "T", clock: "2026-08-30T09:10:00+07:00", today: "2026-08-30", today_label: "CN" },
      classes: [cls("c1", { start_date: "2026-08-30" })],
      lessons: [les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00")],
    });
    const r = applyOccurrence(g, {
      lesson_id: "a",
      start: "2026-08-30T11:00:00+07:00",
      end: "2026-08-30T12:30:00+07:00",
      teacher_id: "tch1",
      room_id: "rm1",
    });
    assert.equal(r.status, "locked");
    assert.equal(g.lessons[0].start, "2026-08-30T09:00:00+07:00");
  });
});

describe("slotClash except self + online", () => {
  it("online skips room; exceptClassId ignores self", () => {
    const g = g0({
      classes: [cls("c1", { default_room_id: "rm_on" })],
      lessons: [les("a", "c1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00", { room_id: "rm_on" })],
    });
    const hit = slotClash(g, "tch2", "rm_on", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00");
    assert.equal(hit.kind, null);
    const self = slotClash(g, "tch1", "rm1", "2026-08-30T09:00:00+07:00", "2026-08-30T10:30:00+07:00", { exceptClassId: "c1", exceptLessonIds: ["a"] });
    assert.equal(self.kind, null);
  });
});
