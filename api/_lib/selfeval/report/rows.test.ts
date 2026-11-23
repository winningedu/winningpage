import { describe, expect, it } from "vitest";
import {
  type ActivityRow,
  keepRecord,
  memoInWindow,
  recordStatusOf,
  toReportLink,
  toReportRecord,
} from "./rows.js";

const row = (over: Partial<ActivityRow> = {}): ActivityRow => ({
  id: "r1",
  source_program: "performance",
  entry_kind: null,
  subject: "수학",
  course_name: "공통수학1",
  topic: "주제",
  concept: null,
  method: null,
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  summary: null,
  reflection: null,
  record_status: null,
  status: "confirmed",
  submitted_at: null,
  created_at: "2026-06-18T03:00:00.000Z",
  parent_record_id: null,
  ...over,
});

describe("recordStatusOf", () => {
  it("uses record_status and derives it from status when it is null", () => {
    expect(recordStatusOf(row({ record_status: "in_progress" }))).toBe(
      "in_progress",
    );
    expect(recordStatusOf(row({ status: "planned" }))).toBe("plan");
    expect(recordStatusOf(row({ status: "draft" }))).toBe("completed");
  });
});

describe("toReportRecord", () => {
  it("reads submitted_at first and created_at otherwise and carries the selected role", () => {
    expect(toReportRecord(row(), "core")).toMatchObject({
      submittedAt: "2026-06-18T03:00:00.000Z",
      selectedRole: "core",
      sourceProgram: "performance",
    });
    expect(
      toReportRecord(row({ submitted_at: "2026-07-01T00:00:00.000Z" }), null)
        .submittedAt,
    ).toBe("2026-07-01T00:00:00.000Z");
  });
});

describe("keepRecord", () => {
  it("keeps performance, deep and manual records inside the academic year only", () => {
    expect(keepRecord(row(), 2026)).toBe(true);
    expect(keepRecord(row({ source_program: "self" }), 2026)).toBe(false);
    expect(keepRecord(row({ source_program: "upload" }), 2026)).toBe(false);
    expect(
      keepRecord(row({ created_at: "2026-02-28T14:59:00.000Z" }), 2026),
    ).toBe(false);
    expect(
      keepRecord(row({ created_at: "2026-02-28T15:00:00.000Z" }), 2026),
    ).toBe(true);
    expect(
      keepRecord(row({ created_at: "2027-02-28T14:59:00.000Z" }), 2026),
    ).toBe(true);
    expect(
      keepRecord(row({ created_at: "2027-02-28T15:00:00.000Z" }), 2026),
    ).toBe(false);
  });
});

describe("memoInWindow", () => {
  it("accepts dates from March 1 of the year to the end of February", () => {
    expect(memoInWindow("2026-03-01", 2026)).toBe(true);
    expect(memoInWindow("2027-02-28", 2026)).toBe(true);
    expect(memoInWindow("2027-03-01", 2026)).toBe(false);
    expect(memoInWindow("2026-02-28", 2026)).toBe(false);
    expect(memoInWindow(null, 2026)).toBe(false);
  });
});

describe("toReportLink", () => {
  const link = {
    from_record_id: "a",
    to_record_id: "b",
    link_type: "deepen",
    strength: "explicit",
    confirmed: false,
    deleted: false,
  } as const;

  it("keeps explicit links and confirmed implicit links that were not deleted", () => {
    expect(toReportLink(link)).toEqual({
      fromRecordId: "a",
      toRecordId: "b",
      linkType: "deepen",
      strength: "explicit",
    });
    expect(toReportLink({ ...link, strength: "implicit" })).toBeNull();
    expect(
      toReportLink({ ...link, strength: "implicit", confirmed: true }),
    ).not.toBeNull();
    expect(toReportLink({ ...link, deleted: true })).toBeNull();
  });
});
