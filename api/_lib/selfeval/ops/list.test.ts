import { describe, expect, it } from "vitest";
import {
  buildSearchFilter,
  parseSessionsQuery,
  toSessionDetail,
  toSessionListItem,
} from "./list.js";

const SID = "123e4567-e89b-42d3-a456-426614174000";

describe("parseSessionsQuery", () => {
  it("값이 없으면 page 1, pageSize 20, 필터 없음의 목록 조회다", () => {
    expect(parseSessionsQuery({})).toEqual({
      ok: true,
      query: {
        kind: "list",
        status: null,
        q: null,
        page: 1,
        pageSize: 20,
      },
    });
  });

  it("sessionId 가 있으면 상세 조회다", () => {
    expect(parseSessionsQuery({ sessionId: SID })).toEqual({
      ok: true,
      query: { kind: "detail", sessionId: SID },
    });
  });

  it("sessionId 가 uuid 가 아니면 거부한다", () => {
    expect(parseSessionsQuery({ sessionId: "x" }).ok).toBe(false);
  });

  it("status 가 허용 값이 아니면 거부한다", () => {
    expect(parseSessionsQuery({ status: "deleted" }).ok).toBe(false);
    const r = parseSessionsQuery({ status: "archived", q: " 김 " });
    expect(r.ok && r.query.kind === "list" && r.query.status).toBe("archived");
    expect(r.ok && r.query.kind === "list" && r.query.q).toBe("김");
  });
});

describe("buildSearchFilter", () => {
  it("프로필이 없으면 과목 부분 일치만 건다", () => {
    expect(buildSearchFilter("물리", [])).toBe("subject.ilike.%물리%");
  });

  it("프로필이 있으면 profile_id 목록과 과목을 or 로 묶는다", () => {
    expect(buildSearchFilter("김", ["a", "b"])).toBe(
      "profile_id.in.(a,b),subject.ilike.%김%",
    );
  });

  it("와일드카드와 필터 구문 문자는 이스케이프한다", () => {
    expect(buildSearchFilter("a%,b", [])).toBe("subject.ilike.%a\\%b%");
  });
});

const row = {
  id: "s1",
  profile_id: "p1",
  status: "archived",
  current_step: 3,
  academic_year: 2026,
  semester: 1,
  area: "subject",
  subject: "물리학",
  activity_name: null,
  regenerate_count: 2,
  ledger_id: "l1",
  ledger_reversed_at: "2026-10-02T00:00:00Z",
  step_state: {
    steps: { analyze: { status: "ok", attempts: 1 } },
    terminal: { reason: "discarded", at: "2026-10-02T00:00:00Z", step: null },
  },
  last_activity_at: "2026-10-01T00:00:00Z",
  completed_at: null,
};

describe("toSessionListItem", () => {
  it("프로필과 합쳐 응답 모양으로 바꾼다", () => {
    const item = toSessionListItem(row, { name: "김위닝", email: "a@b.c" });
    expect(item).toMatchObject({
      id: "s1",
      profileId: "p1",
      studentName: "김위닝",
      email: "a@b.c",
      status: "archived",
      currentStep: 3,
      area: "subject",
      subject: "물리학",
      academicYear: 2026,
      semester: 1,
      regenerateCount: 2,
      ledgerId: "l1",
      ledgerReversedAt: "2026-10-02T00:00:00Z",
      terminal: { reason: "discarded", at: "2026-10-02T00:00:00Z", step: null },
      lastActivityAt: "2026-10-01T00:00:00Z",
      completedAt: null,
    });
    expect(item.progress).toHaveLength(3);
    expect(item.progress[0]).toMatchObject({ step: "analyze", status: "ok" });
  });

  it("프로필과 종결 정보가 없으면 null 이다", () => {
    const item = toSessionListItem({ ...row, step_state: {} }, undefined);
    expect(item.studentName).toBeNull();
    expect(item.email).toBeNull();
    expect(item.terminal).toBeNull();
  });
});

describe("toSessionDetail", () => {
  it("세션 전 컬럼과 활동, 리포트 리비전을 합친다", () => {
    const d = toSessionDetail(
      { ...row, teacher_note: "메모" },
      { name: "김위닝", email: "a@b.c" },
      [
        {
          activity_record_id: "r1",
          role: "core",
          fit_score: 80,
          analysis_source: "model",
        },
      ],
      [
        {
          id: "x",
          report_type: "generation",
          revision: 1,
          score: null,
          created_at: "2026-10-01T00:00:00Z",
        },
      ],
    );
    expect(d.session).toMatchObject({ id: "s1", teacher_note: "메모" });
    expect(d.studentName).toBe("김위닝");
    expect(d.activities).toEqual([
      {
        activityRecordId: "r1",
        role: "core",
        fitScore: 80,
        analysisSource: "model",
      },
    ]);
    expect(d.reports).toEqual([
      {
        id: "x",
        type: "generation",
        revision: 1,
        score: null,
        createdAt: "2026-10-01T00:00:00Z",
      },
    ]);
    expect(d.progress).toHaveLength(3);
    expect(d.terminal).toMatchObject({ reason: "discarded" });
  });
});
