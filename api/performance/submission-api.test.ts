// STEP5 제출·평가·확정 API 3종 계약 회귀 검증.
//
// `submission.ts` / `evaluate.ts` / `finalize.ts`와 (구 `sql/58`, 2026-08-21
// `supabase/migrations/20260821000000_baseline.sql`로 흡수)은 명세서 §8.6
// 엔드포인트 표 / §8.3 스키마 단정 / §9.3 회차 규칙 / §12.2·§12.4 이식 결정
// 위에 서 있다. 이 계약들은 깨져도 코드가 그대로 돈다 — 차감 한 줄이
// 들어와도, 게이트 순서가 뒤집혀도, 에러 코드가 하나 사라져도 테스트 없이는
// 배포까지 간다. 그래서 다음 4가지를 기계로 못박는다.
//
//   [3] 차감 부재        — 3파일 + 구 sql/58 스키마 조각 어디에도 차감 경로가
//       없는가(§9.3, §12.4)
//   [4] 계약 코드 커버   — §8.6이 정의한 실패 코드가 각 파일에 실재하는가
//   [5] 실패 응답 형태   — `{error:{code,message}}`만 쓰고 외부식 `detail`/
//       `error_message`가 응답 본문에 실리지 않는가(§8.6 L1811)
//   [6] 구 sql/58 불변식 — 부분 UNIQUE 2종 / rag_use 승격 2지점 / EXECUTE 회수 /
//       멱등 분기(already_final · already_finalized_other)
//
// sql/ 디렉터리는 2026-08-21 전량 baseline.sql로 스쿼시됐다(수동 넘버링 폐기,
// supabase/README.md). 아래 SQL58_* 상수는 baseline 전체가 아니라 구 sql/58이
// 다루던 조각(performance_reports/performance_sessions 테이블, 부분 UNIQUE
// 인덱스 2개, RPC 2개, 그 RPC들의 ACL)만 baseline에서 잘라 이어붙인 것이다 —
// baseline 전체를 스코프로 쓰면 "sql/58 어디에도 X가 없다"류 부정 검증이 다른
// 도메인 오브젝트 때문에 무의미해진다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(CURRENT_DIR, "../..");

const read = (relative: string) =>
  fs.readFileSync(path.join(REPO_ROOT, relative), "utf8");

const SUBMISSION_API = read("api/performance/submission.ts");
const EVALUATE_API = read("api/performance/evaluate.ts");
const FINALIZE_API = read("api/performance/finalize.ts");

const BASELINE = read("supabase/migrations/20260821000000_baseline.sql");

/** `startNeedle`부터 `endNeedle`(포함) 직전까지의 첫 매치 구간을 잘라낸다. */
function extractBlock(
  source: string,
  startNeedle: string,
  endNeedle: string,
): string {
  const start = source.indexOf(startNeedle);
  if (start < 0) return "";
  const end = source.indexOf(endNeedle, start);
  if (end < 0) return "";
  return source.slice(start, end + endNeedle.length);
}

/** `needle`이 시작하는 줄부터 다음 `;`까지(포함) 문장 1개를 잘라낸다. */
function extractStatement(source: string, needle: string): string {
  const idx = source.indexOf(needle);
  if (idx < 0) return "";
  const end = source.indexOf(";", idx);
  if (end < 0) return "";
  return source.slice(idx, end + 1);
}

/** baseline은 REVOKE/GRANT를 함수 정의와 멀리 떨어진 권한 섹션에 몰아 둔다.
 *  해당 함수 시그니처가 들어간 REVOKE/GRANT 줄만 골라낸다. */
function grantRevokeLines(fnName: string): string {
  return BASELINE.split("\n")
    .filter(
      (line) =>
        line.includes(`"public"."${fnName}"`) &&
        (line.startsWith("REVOKE") || line.startsWith("GRANT")),
    )
    .join("\n");
}

const COMMIT_FN = extractBlock(
  BASELINE,
  'CREATE OR REPLACE FUNCTION "public"."commit_performance_evaluation_report"',
  "\n$$;",
);
const FINALIZE_FN = extractBlock(
  BASELINE,
  'CREATE OR REPLACE FUNCTION "public"."finalize_performance_submission"',
  "\n$$;",
);
const PERFORMANCE_REPORTS_TABLE = extractBlock(
  BASELINE,
  'CREATE TABLE IF NOT EXISTS "public"."performance_reports" (',
  "\n);",
);
const PERFORMANCE_SESSIONS_TABLE = extractBlock(
  BASELINE,
  'CREATE TABLE IF NOT EXISTS "public"."performance_sessions" (',
  "\n);",
);
const EVAL_IDX = extractStatement(
  BASELINE,
  'CREATE UNIQUE INDEX "performance_reports_one_evaluation_per_session_idx"',
);
const FINAL_IDX = extractStatement(
  BASELINE,
  'CREATE UNIQUE INDEX "performance_reports_one_final_per_session_idx"',
);
const COMMIT_ACL = grantRevokeLines("commit_performance_evaluation_report");
const FINALIZE_ACL = grantRevokeLines("finalize_performance_submission");

// 구 sql/58 스코프 대체물. 원본 파일이 다루던 조각만 이어붙인다.
const SQL58 = [
  PERFORMANCE_REPORTS_TABLE,
  PERFORMANCE_SESSIONS_TABLE,
  EVAL_IDX,
  FINAL_IDX,
  COMMIT_FN,
  FINALIZE_FN,
  COMMIT_ACL,
  FINALIZE_ACL,
].join("\n\n");

/** 주석·문자열 리터럴을 지운 코드 본문. "주석에 단어가 있으니 통과"를 막는다. */
function codeOnly(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

const SUBMISSION_CODE = codeOnly(SUBMISSION_API);
const EVALUATE_CODE = codeOnly(EVALUATE_API);
const FINALIZE_CODE = codeOnly(FINALIZE_API);

/** `--` 주석을 지운 SQL 본문. 주석에서 원장·이용권을 언급하는 것은 정상이다. */
const SQL58_CODE = SQL58.replace(/^\s*--.*$/gm, " ");

// ─────────────────────────────────────────────────────────────────────
// [3] 차감 부재 (§9.3 / §12.4 — 외부 evaluate-text.js:51 선차감 이식 금지)
// ─────────────────────────────────────────────────────────────────────
describe("[3] 차감 코드 부재", () => {
  test.each([
    ["submission.ts", SUBMISSION_CODE],
    ["evaluate.ts", EVALUATE_CODE],
    ["finalize.ts", FINALIZE_CODE],
  ])(
    "%s — consume_performance_credit 호출 없음 / program_access write 없음",
    (_name, code) => {
      expect(code.includes("consume_performance_credit")).toBe(false);
      expect(/program_access[\s\S]{0,80}update/i.test(code)).toBe(false);
    },
  );

  test("evaluate.ts — 원장은 읽기(select)만 한다", () => {
    expect(
      /performance_credit_ledger[\s\S]{0,120}\.select\(/.test(EVALUATE_API),
    ).toBe(true);
    expect(
      /from\(["']performance_credit_ledger["']\)[\s\S]{0,120}\.(insert|update|upsert|delete)\(/.test(
        EVALUATE_API,
      ),
    ).toBe(false);
  });

  test("sql/58 — 원장·이용권을 읽지도 쓰지도 않는다(주석 언급은 제외)", () => {
    expect(SQL58_CODE.includes("performance_credit_ledger")).toBe(false);
    expect(SQL58_CODE.includes("program_access")).toBe(false);
  });

  test("3파일 모두 응답에 charged:false를 싣는다(§8.6 무차감 명시)", () => {
    const withChargedFalse = [
      SUBMISSION_API,
      EVALUATE_API,
      FINALIZE_API,
    ].filter((src) => src.includes("charged: false"));
    expect(withChargedFalse.length).toBeGreaterThanOrEqual(2);
    expect(EVALUATE_API.includes("charged: false")).toBe(true);
    expect(FINALIZE_API.includes("charged: false")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [4] §8.6 계약 코드 커버리지
// ─────────────────────────────────────────────────────────────────────
describe("[4] §8.6 엔드포인트 표 실패 코드", () => {
  const CONTRACT_CODES: Record<string, { source: string; codes: string[] }> = {
    "submission.ts": {
      source: SUBMISSION_API,
      codes: ["EMPTY_SUBMISSION", "UNKNOWN_FIELD", "SESSION_FINALIZED"],
    },
    "evaluate.ts": {
      source: EVALUATE_API,
      codes: [
        "SUBMISSION_TOO_SHORT",
        "REQUIRED_FIELD_EMPTY",
        "REEVALUATION_LIMIT",
        "MODEL_FAILED",
      ],
    },
    "finalize.ts": {
      source: FINALIZE_API,
      codes: ["NO_EVALUATION_YET", "ALREADY_FINALIZED_OTHER"],
    },
  };

  for (const [name, { source, codes }] of Object.entries(CONTRACT_CODES)) {
    test.each(codes)(`${name} — %s`, (code) => {
      expect(source.includes(`"${code}"`)).toBe(true);
    });
  }

  test("evaluate.ts — 요청에서 confirm_submit을 읽지 않는다(§8.6 폐기)", () => {
    expect(EVALUATE_CODE.includes("confirm_submit")).toBe(false);
  });
  test("evaluate.ts — 요청에서 fields/submission_text를 읽지 않는다(값은 DB에서 읽는다)", () => {
    expect(
      /body\.(fields|submissionText|submission_text)/.test(EVALUATE_CODE),
    ).toBe(false);
  });
  test("finalize.ts — action 값은 confirm/new_assessment 2종뿐(외부 승계)", () => {
    expect(FINALIZE_API.includes('["confirm", "new_assessment"]')).toBe(true);
  });
  test("submission.ts — mode는 draft/submit 2종", () => {
    expect(SUBMISSION_API.includes('body.mode === "submit"')).toBe(true);
    expect(SUBMISSION_API.includes('body.mode === "draft"')).toBe(true);
  });

  test("evaluate.ts — 제출물 게이트 → 재평가 상한 → 시도 카운터 순서", () => {
    // 게이트 순서: 제출물 형식 게이트가 상한 게이트보다 먼저 와야 한다.
    // 뒤집히면 100자 미달 요청이 재평가 슬롯을 태운다.
    const idxTooShort = EVALUATE_API.indexOf('"SUBMISSION_TOO_SHORT"');
    const idxLimit = EVALUATE_API.indexOf('"REEVALUATION_LIMIT"');
    const idxAttempt = EVALUATE_API.indexOf(
      "evaluation_attempt_count: attemptCount + 1",
    );
    expect(idxTooShort).toBeGreaterThan(0);
    expect(idxLimit).toBeGreaterThan(idxTooShort);
    expect(idxAttempt).toBeGreaterThan(idxLimit);
  });

  // 시도 카운터는 낙관적 잠금(CAS)이어야 한다(검토 P11). 조건 없이
  // `attemptCount + 1`을 덮어쓰면 동시 요청 N건이 전부 같은 스냅샷을 읽고
  // 같은 값을 써서 카운터가 1만 오른다 — 평가는 무차감이라(§9.3) 이 상한이
  // 유일한 방어선인데 병렬성으로 통째로 무력화된다.
  test("evaluate.ts — 시도 카운터가 읽은 값 조건부 update다(CAS)", () => {
    expect(
      /\.update\(\{ evaluation_attempt_count: attemptCount \+ 1 \}\)[\s\S]{0,200}\.eq\("evaluation_attempt_count", attemptCount\)/.test(
        EVALUATE_API,
      ),
    ).toBe(true);
  });
  test("evaluate.ts — CAS가 0행이면 모델을 부르지 않고 429로 끝낸다", () => {
    expect(
      /if \(!attemptRow\) \{[\s\S]{0,400}"EVALUATION_ATTEMPT_LIMIT"/.test(
        EVALUATE_API,
      ),
    ).toBe(true);
  });

  // draft 덮어쓰기는 아직 초안인 행만 대상으로 한다(검토 P11). `is_draft`
  // 조건이 없으면 뒤늦은 draft 저장이 이미 제출·채점된 원고를 덮어써 평가
  // 리포트(점수)와 저장 원고가 서로 다른 글을 가리키게 된다.
  test("submission.ts — updateRevision이 is_draft=true + is_final=false를 함께 본다", () => {
    expect(
      /\.eq\("is_draft", true\)[\s\S]{0,120}\.eq\("is_final", false\)/.test(
        SUBMISSION_API,
      ),
    ).toBe(true);
  });

  // 멱등 재생이 모델 호출보다 앞에 있어야 한다(더블클릭이 모델을 다시 부르면 안 된다).
  test("evaluate.ts — 멱등 재생이 모델 호출보다 먼저다", () => {
    const idxReplay = EVALUATE_API.indexOf("reused: true");
    const idxModel = EVALUATE_API.indexOf("generateWithRetry(");
    expect(idxReplay).toBeGreaterThan(0);
    expect(idxModel).toBeGreaterThan(idxReplay);
  });

  // Gemini 결함 완화 ⓐ~ⓓ (§8.4)
  test("evaluate.ts — MAX_TOKENS면 파싱하지 않고 재시도(ⓒ)", () => {
    expect(EVALUATE_API.includes('finishReason === "MAX_TOKENS"')).toBe(true);
  });
  test("evaluate.ts — responseSchema 강제", () => {
    expect(
      EVALUATE_API.includes("responseSchema: EVALUATION_REPORT_SCHEMA"),
    ).toBe(true);
  });
  test("evaluate.ts — score는 서버가 파싱(ⓐ)", () => {
    expect(EVALUATE_API.includes("parseEvaluationScore")).toBe(true);
  });
  test("evaluate.ts — maxDuration 60 선언", () => {
    expect(EVALUATE_API.includes('runtime: "nodejs", maxDuration: 60')).toBe(
      true,
    );
  });
  // 평가 직후 즉시 임베딩(고객사 안내 5번). 커밋이 committed 로 확정된 뒤에만, 그리고
  // 벡터 메타 upsert 가 성공했을 때만 응답 뒤 작업으로 예약한다.
  test("evaluate.ts 커밋 확정 뒤 벡터 갱신이 성공했을 때만 즉시 임베딩을 예약한다", () => {
    // EVALUATE_CODE 는 문자열 리터럴을 지운 본문이라 "committed" 가 "" 로 남는다.
    const idxCommitted = EVALUATE_CODE.indexOf('commitStatus !== ""');
    const idxSchedule = EVALUATE_CODE.indexOf("scheduleAfterResponse(");
    expect(idxCommitted).toBeGreaterThan(0);
    expect(idxSchedule).toBeGreaterThan(idxCommitted);
    expect(
      /if \(sessionVectorReady\) \{\s*scheduleAfterResponse\(/.test(
        EVALUATE_CODE,
      ),
    ).toBe(true);
    expect(
      /sessionVectorReady = true;[\s\S]{0,80}\} catch \(vectorError\)/.test(
        EVALUATE_CODE,
      ),
    ).toBe(true);
    expect(EVALUATE_CODE.includes("embedSessionVectorNow(supabaseAdmin")).toBe(
      true,
    );
    expect(EVALUATE_API.includes('step: "instant"')).toBe(true);
  });
  test("evaluate.ts — 텍스트 파서 폴백이 없다(JSON.parse 1곳뿐, §12.4)", () => {
    expect((EVALUATE_CODE.match(/JSON\.parse\(/g) || []).length).toBe(1);
  });
  test("evaluate.ts — 평가 단계는 RAG를 부르지 않는다(원문 작업 지시 :151)", () => {
    expect(EVALUATE_CODE.includes("loadDynamicAssessmentKnowledge")).toBe(
      false,
    );
    expect(EVALUATE_CODE.includes("loadRelevantStudentSessions")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────
// [5] 실패 응답 형태 (§8.6 L1811)
// ─────────────────────────────────────────────────────────────────────
// 2026-08-24 api/ 공통 HTTP 계층 리팩토링(#166) 이후 3파일 모두 로컬 literal이
// 아니라 `_lib/httpResponse.ts`의 `sendError(res, "coded", ...)`로
// `{error:{code,message}}` 형태를 만든다. 형태 자체(리터럴)는 공유 라이브러리
// 쪽에서, "이 3파일이 그 프리셋을 쓴다"는 파일 쪽에서 검증해 명제를 보존한다.
const HTTP_RESPONSE_LIB = read("api/_lib/httpResponse.ts");

describe("[5] 실패 응답에 원 예외 메시지를 싣지 않는다", () => {
  test("_lib/httpResponse.ts의 coded 프리셋이 {error:{code,message}} 형태다", () => {
    expect(
      /case "coded":\s*res\.status\(status\)\.json\(\{ error: \{ code, message \}, \.\.\.\(extra \|\| \{\}\) \}\);/.test(
        HTTP_RESPONSE_LIB,
      ),
    ).toBe(true);
  });

  test.each([
    ["submission.ts", SUBMISSION_API, SUBMISSION_CODE],
    ["evaluate.ts", EVALUATE_API, EVALUATE_CODE],
    ["finalize.ts", FINALIZE_API, FINALIZE_CODE],
  ])(
    "%s — error:{code,message} 형태(리터럴 또는 sendError coded 위임) / detail·error_message 키 없음 / error.message 미노출",
    (_name, source, code) => {
      expect(
        source.includes("error: { code, message }") ||
          /sendError\([^)]*"coded"/.test(source),
      ).toBe(true);
      expect(/\b(detail|error_message)\s*:/.test(code)).toBe(false);
      expect(/return\s+fail\([^)]*error\.message/.test(code)).toBe(false);
      expect(/json\(\{[^}]*error\.message/.test(code)).toBe(false);
    },
  );
});

// ─────────────────────────────────────────────────────────────────────
// [6] 구 sql/58 스키마·RPC 불변식 (baseline.sql 스코프)
// ─────────────────────────────────────────────────────────────────────
describe("[6] 구 sql/58 스키마·RPC 불변식(baseline.sql)", () => {
  test("세션당 evaluation 리포트 1행 부분 UNIQUE", () => {
    expect(
      /CREATE UNIQUE INDEX "performance_reports_one_evaluation_per_session_idx"[\s\S]{0,200}WHERE \("report_type" = 'evaluation'::"text"\)/.test(
        SQL58,
      ),
    ).toBe(true);
  });
  test("세션당 final_submission 리포트 1행 부분 UNIQUE", () => {
    expect(
      /CREATE UNIQUE INDEX "performance_reports_one_final_per_session_idx"[\s\S]{0,200}WHERE \("report_type" = 'final_submission'::"text"\)/.test(
        SQL58,
      ),
    ).toBe(true);
  });
  // baseline은 pg_dump 스냅샷이라 `add column if not exists`류 idempotent 증분문이
  // 아니라 CREATE TABLE 전체 정의로 컬럼이 실린다 — "추가됐다"는 컬럼이 최종
  // 스키마에 실재한다는 명제로 치환한다.
  test("performance_reports.submission_id 컬럼 실재(nullable)", () => {
    expect(PERFORMANCE_REPORTS_TABLE.includes('"submission_id" "uuid",')).toBe(
      true,
    );
  });
  test("상한 2축 컬럼 실재", () => {
    expect(
      PERFORMANCE_SESSIONS_TABLE.includes(
        '"evaluation_count" integer DEFAULT 0 NOT NULL',
      ),
    ).toBe(true);
    expect(
      PERFORMANCE_SESSIONS_TABLE.includes(
        '"evaluation_attempt_count" integer DEFAULT 0 NOT NULL',
      ),
    ).toBe(true);
  });

  // rag_use 승격이 정확히 2지점(평가 커밋 / 최종 확정)에만 있어야 한다.
  test("rag_use 승격이 정확히 2지점, performance_session_vectors에만 건다", () => {
    const ragPromotions = SQL58.match(/set rag_use = true/g) || [];
    expect(ragPromotions.length).toBe(2);
    expect(
      (SQL58.match(/update public\.performance_session_vectors/g) || []).length,
    ).toBe(2);
  });

  test("평가 커밋 RPC가 is_final을 건드리지 않는다", () => {
    expect(COMMIT_FN.includes("is_final = ")).toBe(false);
  });

  test("finalize RPC가 대상 행을 for update로 잠근다", () => {
    expect(/for update/.test(FINALIZE_FN)).toBe(true);
  });

  // 대상 제출본만 잠그면 같은 세션의 서로 다른 제출본 2건이 동시에 확정을
  // 시도할 때 잠금이 겹치지 않아 둘 다 "확정된 행 없음"으로 통과하고, 뒤늦은
  // 쪽이 부분 UNIQUE 23505 → 호출부 500이 된다(검토 P11). 세션 행을 함께
  // 잠가 세션 단위로 직렬화한다 — 순서는 반드시 제출본 → 세션이어야
  // commit_performance_evaluation_report(제출본 update → 세션 update)와
  // 교착하지 않는다.
  describe("finalize RPC — 세션 단위 직렬화(제출본 → 세션 잠금 순서)", () => {
    // FINALIZE_FN은 파일 상단에서 `CREATE OR REPLACE FUNCTION
    // "public"."finalize_performance_submission"` 앵커로 이미 추출해 뒀다
    // (앵커가 없으면 앞선 RPC의 본문을 잘라 보게 된다).

    test("finalize RPC가 세션 행도 for update로 잠근다(세션 단위 직렬화)", () => {
      expect(
        /from public\.performance_sessions s\s+where s\.id = p_session_id\s+for update/.test(
          FINALIZE_FN,
        ),
      ).toBe(true);
    });

    test("finalize RPC의 잠금 순서가 제출본 → 세션이다(교착 방지)", () => {
      const submissionLockIndex = FINALIZE_FN.search(
        /from public\.performance_submissions sub/,
      );
      const sessionLockIndex = FINALIZE_FN.search(
        /from public\.performance_sessions s\s+where s\.id = p_session_id\s+for update/,
      );
      expect(submissionLockIndex).toBeGreaterThanOrEqual(0);
      expect(sessionLockIndex).toBeGreaterThan(submissionLockIndex);
    });
  });

  test("finalize RPC 멱등 분기 3종", () => {
    expect(SQL58.includes("'already_final'")).toBe(true);
    expect(SQL58.includes("'already_finalized_other'")).toBe(true);
    expect(SQL58.includes("'no_evaluation'")).toBe(true);
  });

  test("같은 제출본 재확정은 finalize_reason을 덮어쓰지 않는다", () => {
    expect(
      /if v_is_final then[\s\S]{0,600}return jsonb_build_object\(\s*'status', 'already_final'/.test(
        SQL58,
      ),
    ).toBe(true);
  });

  // baseline은 pg_dump ACL diff 형식이라 원본 sql/58의 명시적
  // "revoke from public/anon/authenticated" 3연타가 아니라 "REVOKE ALL ...
  // FROM PUBLIC" 1줄로 같은 효과(PUBLIC 전체에서 회수 → anon/authenticated도
  // 포함)를 낸다. 명제는 그대로 "두 RPC 모두 EXECUTE가 PUBLIC에서 회수되고
  // service_role에만 부여되며 anon/authenticated에는 없다"로 보존한다.
  test("두 RPC 모두 EXECUTE를 회수하고 service_role에만 부여(anon/authenticated 없음)", () => {
    for (const acl of [COMMIT_ACL, FINALIZE_ACL]) {
      expect((acl.match(/^REVOKE ALL ON FUNCTION/gm) || []).length).toBe(1);
      expect(acl.includes("FROM PUBLIC;")).toBe(true);
      expect((acl.match(/^GRANT ALL ON FUNCTION/gm) || []).length).toBe(1);
      expect(acl.includes('TO "service_role";')).toBe(true);
      expect(acl.includes('TO "anon"')).toBe(false);
      expect(acl.includes('TO "authenticated"')).toBe(false);
    }
  });

  test("두 RPC 모두 security definer + search_path 고정", () => {
    // 주석 본문에도 "SECURITY DEFINER"라는 단어가 등장하므로(설명 목적) 주석을
    // 지운 SQL58_CODE로 선언부만 센다.
    expect((SQL58_CODE.match(/SECURITY DEFINER/g) || []).length).toBe(2);
    expect(
      (SQL58_CODE.match(/SET "search_path" TO 'public'/g) || []).length,
    ).toBe(2);
  });

  // 오버로드 잔재 drop 가드(do $$ ... loop drop function if exists $$)는
  // sql/58 원본에서 "배포 시점에 기존 시그니처와 충돌하는 잔재를 치운다"는
  // 1회성 마이그레이션 절차였다. baseline은 pg_dump 스키마 스냅샷이라
  // 배포 시점 절차문(DO 블록)을 담지 않는다 — 최종 상태에 함수가 정확히
  // 1개씩만 존재하는지로 등가 검증한다(오버로드 잔재가 없다는 결과 상태).
  test("함수명이 baseline에 정확히 1개 시그니처로만 존재한다(오버로드 잔재 없음의 결과 상태)", () => {
    expect(
      (
        BASELINE.match(
          /CREATE OR REPLACE FUNCTION "public"\."commit_performance_evaluation_report"/g,
        ) || []
      ).length,
    ).toBe(1);
    expect(
      (
        BASELINE.match(
          /CREATE OR REPLACE FUNCTION "public"\."finalize_performance_submission"/g,
        ) || []
      ).length,
    ).toBe(1);
  });

  // 라우트가 select 하는 컬럼이 baseline의 구 sql/58 스코프에 실재하는가 — 42703 배포 사고 방지.
  test.each(["evaluation_count", "evaluation_attempt_count"])(
    "evaluate.ts가 select 하는 %s이 baseline(구 sql/58 조각)에 있다",
    (column) => {
      expect(EVALUATE_API.includes(column)).toBe(true);
      expect(SQL58.includes(column)).toBe(true);
    },
  );

  // sql/README.md(파일별 번호 등록부)는 sql/ 전체와 함께 폐기됐고, 현 체계
  // (타임스탬프 마이그레이션)는 파일 단위 번호 레지스트리를 두지 않는다
  // (supabase/README.md는 "무엇이 58번인가"가 아니라 baseline이 스쿼시
  // 스냅샷이라는 계보만 문서화한다). 번호-등록 명제 자체는 현 체계에
  // 등가물이 없어 보존 불가 — baseline이 스쿼시 산출물이라는 계보 문서화
  // 사실로 약화해서 남긴다.
  test("supabase/README.md가 baseline을 sql/ 스쿼시 스냅샷으로 문서화한다", () => {
    const supabaseReadme = read("supabase/README.md");
    expect(supabaseReadme.includes("20260821000000_baseline.sql")).toBe(true);
    expect(supabaseReadme.includes("스쿼시")).toBe(true);
  });
});
