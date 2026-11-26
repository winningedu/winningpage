// 비밀 변수(secretVars)가 있는 템플릿의 발송과 기록. 알리고에는 실제 값이 가고,
// alimtalk_send_logs 에는 그 값이 남지 않는다. 대체 문자가 없는 템플릿은 failover 를 끈다.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const outbound = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../outbound.js", () => ({ outboundFetch: outbound.fetch }));
vi.mock("./alimtalkTemplates.js", async (orig) => {
  const real = await orig<typeof import("./alimtalkTemplates.js")>();
  return {
    ...real,
    ALIMTALK_TEMPLATES: {
      ...real.ALIMTALK_TEMPLATES,
      secretTest: {
        codeEnv: "ALIGO_TPL_SECRET_TEST",
        subject: "비밀 안내",
        secretVars: ["암호"],
        build: (vars: Record<string, string>) =>
          `${vars.이름}님\n암호: ${vars.암호}`,
      },
    },
  };
});

import { sendAndLog } from "./alimtalkSend.js";

const SECRET = "Xy7!pQ2mZk";

function fakeDb() {
  const inserts: Record<string, unknown>[] = [];
  const db = {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.insert = (row: Record<string, unknown>) => {
        inserts.push(row);
        return {
          select: () => ({
            maybeSingle: async () => ({ data: { id: 1 }, error: null }),
          }),
        };
      };
      return chain;
    },
  };
  return { db: db as never, inserts };
}

function sentParams(): Record<string, string> {
  const call = outbound.fetch.mock.calls[0] as [string, { body: string }];
  return Object.fromEntries(new URLSearchParams(call[1].body));
}

function aligoReplies(body: unknown) {
  outbound.fetch.mockResolvedValue({
    status: 200,
    text: async () => JSON.stringify(body),
  });
}

beforeEach(() => {
  outbound.fetch.mockReset();
  vi.stubEnv("ALIGO_SENDER_KEY", "sk");
  vi.stubEnv("ALIGO_TPL_SECRET_TEST", "TPL_S");
  vi.stubEnv("ALIGO_TPL_WEEKLY_REPORT", "TPL_W");
  vi.stubEnv("ALIGO_CHANNEL", "");
  vi.stubEnv("ALIGO_DRY_RUN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("비밀 변수가 있는 템플릿", () => {
  test("알리고에는 실제 값을 보내고 로그에는 (비공개)로 남긴다", async () => {
    aligoReplies({ code: 0, message: "ok", info: { mid: "m1" } });
    const { db, inserts } = fakeDb();

    const outcome = await sendAndLog({
      supabaseAdmin: db,
      templateKey: "secretTest" as never,
      phone: "010-1234-5678",
      profileId: "p1",
      variables: { 이름: "김선생", 암호: SECRET },
      dedupeKey: "k1",
    });

    expect(outcome.status).toBe("sent");
    const params = sentParams();
    expect(params.message_1).toBe(`김선생님\n암호: ${SECRET}`);
    expect(inserts).toHaveLength(1);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.message).toBe("김선생님\n암호: (비공개)");
    expect(JSON.stringify(row)).not.toContain(SECRET);
  });

  test("대체 문자가 없으면 failover 를 끄고 대체 문구를 싣지 않는다", async () => {
    aligoReplies({ code: 0, message: "ok", info: { mid: "m1" } });
    const { db } = fakeDb();

    await sendAndLog({
      supabaseAdmin: db,
      templateKey: "secretTest" as never,
      phone: "01012345678",
      profileId: null,
      variables: { 이름: "김선생", 암호: SECRET },
    });

    const params = sentParams();
    expect(params.failover).toBeUndefined();
    expect(params.fmessage_1).toBeUndefined();
    expect(params.fsubject_1).toBeUndefined();
  });

  test("알리고 응답이 값을 되풀이해도 로그의 응답 문구와 meta 에 남기지 않는다", async () => {
    aligoReplies({ code: -99, message: `bad ${SECRET}` });
    const { db, inserts } = fakeDb();

    const outcome = await sendAndLog({
      supabaseAdmin: db,
      templateKey: "secretTest" as never,
      phone: "01012345678",
      profileId: null,
      variables: { 이름: "김선생", 암호: SECRET },
      meta: { echo: SECRET },
    });

    expect(outcome.status).toBe("failed");
    expect(JSON.stringify(outcome)).not.toContain(SECRET);
    const row = inserts[0] as Record<string, unknown>;
    expect(row.status).toBe("failed");
    expect(JSON.stringify(row)).not.toContain(SECRET);
    expect(String(row.provider_message)).toContain("(비공개)");
  });

  test("SMS 채널이면 대체 문구가 없는 템플릿은 보내지 않고 실패로 남긴다", async () => {
    vi.stubEnv("ALIGO_CHANNEL", "sms");
    const { db, inserts } = fakeDb();

    const outcome = await sendAndLog({
      supabaseAdmin: db,
      templateKey: "secretTest" as never,
      phone: "01012345678",
      profileId: null,
      variables: { 이름: "김선생", 암호: SECRET },
    });

    expect(outcome.status).toBe("failed");
    expect(outbound.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(inserts)).not.toContain(SECRET);
  });
});

describe("비밀 변수가 없는 템플릿", () => {
  test("로그 본문은 보낸 본문 그대로다", async () => {
    aligoReplies({ code: 0, message: "ok", info: { mid: "m1" } });
    const { db, inserts } = fakeDb();
    const vars = {
      학생명: "김학생",
      N월: "11",
      N주차: "4",
      reportId: "2026-11-23",
    };

    await sendAndLog({
      supabaseAdmin: db,
      templateKey: "weeklyReport",
      phone: "01012345678",
      profileId: "p1",
      variables: vars,
    });

    const params = sentParams();
    expect(params.failover).toBe("Y");
    expect((inserts[0] as Record<string, unknown>).message).toBe(
      params.message_1,
    );
  });
});
