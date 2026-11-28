// STEP5 평가 요청 계약 + 제출폼 슬라이스 배선 seam 회귀 검증 —
// scripts/verify-performance-evaluation-report.mjs [8] 절 이식.
//   docs/수행평가-상세-명세.md §8.6(엔드포인트 계약) / §9.3(무차감) / §12.4(텍스트 파서 폐기).
//
// 무엇을 막는가
// -------------
// ⑦ 평가·확정 요청이 §8.6 계약을 벗어나는 것(제출 원고를 클라이언트가 다시 보내는 회귀).
// ⑥ 제출폼 슬라이스와의 배선 계약(`handleSubmissionEvaluate` / 모달·분기 3버튼 배선 /
//    §5.15 로딩 문구 원문)이 병합 과정에서 사라지는 것.
//
// 이식 메모(node:test → Vitest, task 10.8)
// -----------------------------------------
// 원본은 소스 파일을 문자열로 읽어 정규식으로 대조하는 정적 스캔이었다(렌더가 필요
// 없다) — 그 성질을 그대로 옮긴다. Biome 전환(task 1) 이후 저장소 전체가 작은따옴표 →
// 큰따옴표로 통일돼(`"/api/performance/evaluate"` 등) 리터럴 매칭 정규식만 그에 맞게
// 갱신했다 — 검사 대상 계약 자체는 바뀌지 않았다.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/**
 * 「없어야 한다」 검사는 **주석을 걷어낸 코드**에서만 돈다. 폐기 사실을 설명하는 주석
 * (「외부 앱은 `confirm_submit` 플래그를 보냈고 …」)까지 위반으로 잡으면, 근거를 남기지
 * 못하게 만드는 검사가 된다. 줄 전체가 주석인 경우만 걷어 문자열 속 `//`은 건드리지 않는다.
 */
const stripLineComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("§8.6 API 요청 형태 (src/lib/performance/evaluation.ts)", () => {
  const libSource = fs.readFileSync(
    path.join(REPO_ROOT, "src/lib/performance/evaluation.ts"),
    "utf8",
  );
  const libCode = stripLineComments(libSource);

  test("evaluate/finalize 두 엔드포인트를 부른다", () => {
    expect(libSource.includes('"performance/evaluate"')).toBe(true);
    expect(libSource.includes('"performance/finalize"')).toBe(true);
  });

  test("evaluate 요청 바디가 `{ sessionId, submissionId }`다(제출 원고를 다시 보내지 않는다)", () => {
    expect(/\{\s*sessionId,\s*submissionId\s*\}/.test(libSource)).toBe(true);
  });

  test("evaluate 요청에 폐기된 필드(submission_text/confirm_submit/fields)가 없다(§12.4)", () => {
    // `fields`는 주석에서 서버 컬럼을 언급할 때도 나오므로 **요청 바디의 키 형태**만 본다.
    expect(/submission_text|confirm_submit|fields\s*:/.test(libCode)).toBe(
      false,
    );
  });

  test("finalize의 두 action(confirm/new_assessment)이 모두 있다(§12.2 — 두 버튼 다 확정 저장이다)", () => {
    expect(libSource.includes('"confirm"')).toBe(true);
    expect(libSource.includes('"new_assessment"')).toBe(true);
  });
});

describe("제출폼 슬라이스 배선 seam (src/pages/performance/PerformanceChatPage.tsx)", () => {
  const pageSource = fs.readFileSync(
    path.join(REPO_ROOT, "src/pages/performance/PerformanceChatPage.tsx"),
    "utf8",
  );

  test("제출폼 슬라이스의 진입점 `handleSubmissionEvaluate`가 있다", () => {
    expect(pageSource.includes("function handleSubmissionEvaluate")).toBe(true);
  });

  test("평가 리포트 모달·분기 3버튼이 페이지에 배선돼 있다", () => {
    expect(pageSource.includes("<EvaluationReportModal")).toBe(true);
    expect(pageSource.includes("<EvaluationBranchActions")).toBe(true);
  });

  test("§5.15 평가 로딩 문구가 `loadingCopy.js` 쌍에서 온다", () => {
    expect(
      pageSource.includes("PERFORMANCE_LOADING_COPY.evaluationReport"),
    ).toBe(true);
  });

  test("§5.15 정본 타임라인 3항의 제출 말풍선 원문이 있다", () => {
    expect(pageSource.includes("수행평가 제출물을 제출합니다.")).toBe(true);
  });

  test("이 슬라이스에는 차감 흔적이 없다(§9.3/Q84 — 차감 지점은 recommend-topics 1곳뿐)", () => {
    expect(
      /consume_performance_credit|charged:\s*true/.test(
        stripLineComments(pageSource),
      ),
    ).toBe(false);
  });
});
