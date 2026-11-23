import { afterEach, describe, expect, it, vi } from "vitest";
import {
  consumeCredit,
  recordLinkFromRow,
  recordLinkToRow,
  reverseCredit,
  toActivityLike,
} from "./db.js";
import type { ActivityRecordRow } from "./rows.js";

function rpcDb(result: unknown) {
  const rpc = vi.fn(async () => ({ data: result, error: null }));
  return { db: { rpc } as never, rpc };
}

afterEach(() => vi.unstubAllEnvs());

describe("consumeCredit 사이트 분기", () => {
  it("위닝은 consume_selfeval_credit 결과를 그대로 돌려준다", async () => {
    vi.stubEnv("SITE", "winning");
    const { db, rpc } = rpcDb({ status: "charged", charged: true });
    expect(await consumeCredit(db, "u1", "s1", "selfeval:x")).toEqual({
      status: "charged",
      charged: true,
    });
    expect(rpc).toHaveBeenCalledWith("consume_selfeval_credit", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_reason: "selfeval:x",
    });
  });

  it("스쿨멘토는 fn_consume_tenant_usage 로 selfeval_session 을 센다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = rpcDb("consumed");
    expect(await consumeCredit(db, "u1", "s1", "selfeval:x")).toEqual({
      status: "charged",
      charged: true,
      tenantReason: null,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fn_consume_tenant_usage", {
      p_profile: "u1",
      p_program_key: "selfeval",
      p_source_kind: "selfeval_session",
      p_source_id: "s1",
    });
  });

  it("스쿨멘토에서 이미 센 세션은 already_charged", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = rpcDb("already_consumed");
    expect(await consumeCredit(db, "u1", "s1", "r")).toMatchObject({
      status: "already_charged",
    });
  });

  it("스쿨멘토에서 한도 거부는 quota_exhausted", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db } = rpcDb("term_cap");
    expect(await consumeCredit(db, "u1", "s1", "r")).toMatchObject({
      status: "quota_exhausted",
      charged: false,
      tenantReason: "term_cap",
    });
  });
});

describe("reverseCredit 사이트 분기", () => {
  it("위닝은 reverse_selfeval_credit 을 부른다", async () => {
    vi.stubEnv("SITE", "winning");
    const { db, rpc } = rpcDb({ reversed: true });
    expect(await reverseCredit(db, "u1", "s1", "r")).toEqual({
      reversed: true,
    });
    expect(rpc).toHaveBeenCalledWith("reverse_selfeval_credit", {
      p_session_id: "s1",
      p_profile_id: "u1",
      p_reason: "r",
    });
  });

  it("스쿨멘토는 아무것도 하지 않는다", async () => {
    vi.stubEnv("SITE", "schoolmentor");
    const { db, rpc } = rpcDb({ reversed: true });
    expect(await reverseCredit(db, "u1", "s1", "r")).toEqual({
      status: "tenant_no_reversal",
      reversed: false,
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("toActivityLike v4.2 컬럼", () => {
  const row = {
    id: "r1",
    source_program: "performance",
    status: "confirmed",
    grade_label: "고1",
    semester: 1,
    subject_group: "수학",
    subject: "공통수학1",
    topic: null,
    concept: null,
    method: null,
    result: null,
    limitation: null,
    numbers: [],
    sources: [],
    created_at: "2026-01-01T00:00:00Z",
    submitted_at: "2026-06-18T00:00:00Z",
    record_status: "in_progress",
    summary: "요약",
    reflection: "소감",
    parent_record_id: "p0",
    course_name: "공통수학1",
    entry_kind: "deep",
  } as ActivityRecordRow;

  it("제출일, 기록 상태, 요약, 소감, 상위 기록, 과목명, 유형을 옮긴다", () => {
    expect(toActivityLike(row)).toMatchObject({
      submittedAt: "2026-06-18T00:00:00Z",
      recordStatus: "in_progress",
      summary: "요약",
      reflection: "소감",
      parentRecordId: "p0",
      courseName: "공통수학1",
      entryKind: "deep",
    });
  });

  it("새 컬럼이 비어 있으면 null 로 두어 앱이 createdAt 과 status 에서 파생하게 한다", () => {
    const old = {
      ...row,
      submitted_at: null,
      record_status: null,
      summary: null,
      reflection: null,
      parent_record_id: null,
      course_name: null,
      entry_kind: null,
    } as ActivityRecordRow;
    const like = toActivityLike(old);
    expect(like.submittedAt).toBeNull();
    expect(like.recordStatus).toBeNull();
  });
});

describe("연계 행 변환", () => {
  it("DB 행과 앱 모양을 서로 옮긴다", () => {
    const link = {
      fromId: "a",
      toId: "b",
      type: "deepen" as const,
      strength: "implicit" as const,
      source: "student" as const,
      confirmed: true,
      deleted: false,
      note: "이어서 했어요",
      quoteFrom: null,
      quoteTo: null,
    };
    const dbRow = recordLinkToRow("s1", link);
    expect(dbRow).toEqual({
      session_id: "s1",
      from_record_id: "a",
      to_record_id: "b",
      link_type: "deepen",
      strength: "implicit",
      source: "student",
      confirmed: true,
      deleted: false,
      note: "이어서 했어요",
      quote_from: null,
      quote_to: null,
    });
    expect(recordLinkFromRow(dbRow as never)).toEqual(link);
  });
});
