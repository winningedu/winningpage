import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeCredit, reverseCredit } from "./db.js";

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
