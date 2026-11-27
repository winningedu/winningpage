// 수행평가 라우트 테스트용 가짜 service_role. 요청 형식 검증은 DB 를 읽기 전에 끝나므로 인증만 되는 가짜면 된다.
// 이용권 거절이나 도메인 규칙을 보는 테스트는 createFakeDb 로 따로 만든다.

/** 인증만 통과시키는 가짜. from, rpc 를 부르면 테스트가 잘못된 것이라 던진다. */
export function authOnlyDb(userId = "me") {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: () => {
      throw new Error("DB 를 읽으면 안 되는 테스트입니다.");
    },
    rpc: () => {
      throw new Error("DB 를 읽으면 안 되는 테스트입니다.");
    },
  };
}

/** 테스트 본문에서 쓰는 uuid 형식 값. */
export const SESSION_ID = "3f2b8c1e-9d4a-4b6e-8a1c-0e5d7f9a2b3c";

/** 이용권이 있는 사용자의 가짜. 첫 DB 읽기(세션 조회 등)부터는 테스트가 tables 로 정한다. */
export function paidDb(userId = "me") {
  return {
    ...authOnlyDb(userId),
    rpc: async (name: string) => ({
      data:
        name === "fn_program_access_state"
          ? [
              {
                allowed: true,
                program_key: "suhaeng",
                reason: null,
                expires_at: null,
              },
            ]
          : null,
      error: null,
    }),
  };
}

/** 400 VALIDATION_FAILED 이고 errors 가 field 를 가리키는지 본다. */
export function validationFailedFor(
  res: { status: number; body: unknown },
  field: string,
): boolean {
  const body = res.body as { code?: string; errors?: unknown };
  return (
    res.status === 400 &&
    body.code === "VALIDATION_FAILED" &&
    Array.isArray(body.errors) &&
    JSON.stringify(body.errors).includes(field)
  );
}

/**
 * 이용권이 있는 사용자의 가짜에 테이블별 고정 행을 얹는다. 필터는 적용하지 않고 행을 그대로 돌려준다.
 * 응답 모양(스키마 통과)을 보는 테스트용이다.
 */
export function rowsDb(tables: Record<string, Record<string, unknown>[]>) {
  const from = (table: string) => {
    const rows = tables[table] ?? [];
    const q: Record<string, unknown> = {};
    for (const method of [
      "select",
      "eq",
      "in",
      "or",
      "order",
      "limit",
      "lt",
      "neq",
      "is",
      "not",
      "update",
      "insert",
    ]) {
      q[method] = () => q;
    }
    q.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
    q.single = async () => ({ data: rows[0] ?? null, error: null });
    // biome-ignore lint/suspicious/noThenProperty: 쿼리 빌더 thenable 모킹
    q.then = (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows, error: null }).then(ok, bad);
    return q;
  };
  return { ...paidDb(), from };
}
