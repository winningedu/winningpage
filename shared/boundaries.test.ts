// shared/ 와 src/ 의 import 방향 가드.
// shared/ 는 브라우저와 서버가 함께 쓰는 계약 층이라 src/, api/ 를 읽지 않는다. React, DOM, Node 전용 모듈, DB 클라이언트, @/ 별칭도 쓰지 않는다.
// src/ 는 api/ 를 읽지 않는다. 지금 읽는 파일은 아래 목록에 묶어 두고 줄이기만 한다(영역을 옮길 때 공용 부분을 shared/ 로 뺀다).

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, test } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = /\.(ts|tsx|js|jsx|mjs)$/;

function sourceFiles(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(
    (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return SOURCE.test(entry.name) ? [path] : [];
    },
  );
}

const SPECIFIER = /(?:from\s*|import\s*\(\s*|import\s+)["']([^"']+)["']/g;

function specifiers(file: string): string[] {
  const text = readFileSync(join(ROOT, file), "utf8");
  return [...text.matchAll(SPECIFIER)].map((match) => match[1] as string);
}

/** 상대 지정자가 가리키는 저장소 기준 경로. 상대가 아니면 null. */
function target(file: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  return relative(ROOT, resolve(ROOT, dirname(file), specifier));
}

const isTest = (file: string) => /\.(test|testkit)\./.test(file);

// 2026-11-26 기준 src/ 에서 api/ 를 읽는 파일. 새 파일을 더하지 않는다.
const SRC_TO_API_ALLOWLIST = new Set([
  "src/components/enrollment/EnrollmentForm.tsx",
  "src/components/enrollment/JoinTenantModal.tsx",
  "src/components/goal/studyRecordOptions.test.ts",
  "src/components/growth/collect/ManualActivityCard.tsx",
  "src/components/growth/collect/manualActivity.ts",
  "src/components/growth/survey/surveyLabels.test.ts",
  "src/components/growth/survey/surveySearch.ts",
  "src/components/growth/survey/surveyState.test.ts",
  "src/components/inquiry/info/infoLogic.test.ts",
  "src/components/inquiry/info/infoLogic.ts",
  "src/components/performance/step1/BasicInfoForm.test.tsx",
  "src/components/performance/step1/BasicInfoForm.tsx",
  "src/components/performance/step2/ManualInfoForm.test.tsx",
  "src/components/performance/step2/ManualInfoForm.tsx",
  "src/components/performance/step5/EvaluationReportModal.test.tsx",
  "src/components/performance/step5/SubmissionForm.test.tsx",
  "src/lib/growth/uploadContract.test.ts",
  "src/lib/inquiry/gaps.test.ts",
  "src/lib/inquiry/labels.test.ts",
  "src/lib/inquiry/submission.test.ts",
  "src/lib/inquiry/types.test.ts",
  "src/lib/performance/submission.ts",
  "src/lib/selfeval/evidence.test.ts",
  "src/lib/time/day.test.ts",
  "src/pages/UsageGuide.tsx",
  "src/pages/admin/goal/reportResendOptions.ts",
  "src/pages/admin/knowledge/bulk/DedupeResult.tsx",
  "src/pages/admin/knowledge/bulk/flow.ts",
  "src/pages/admin/knowledge/bulk/plan.ts",
  "src/pages/admin/knowledge/bulk/run.test.ts",
  "src/pages/admin/knowledge/bulk/run.ts",
  "src/pages/admin/knowledge/bulk/xlsx.ts",
  "src/pages/admin/knowledge/search/SearchPreview.tsx",
  "src/pages/admin/knowledge/search/SearchResultTable.test.tsx",
  "src/pages/admin/knowledge/search/SearchResultTable.tsx",
  "src/pages/admin/knowledge/search/columns.ts",
  "src/pages/console/teachers/ClassRowFields.tsx",
  "src/pages/growth/SurveyPage.test.tsx",
  "src/pages/signup/school/rules.ts",
]);

describe("shared/ import 방향", () => {
  const files = sourceFiles("shared").filter((file) => !isTest(file));

  test("src/, api/ 를 읽지 않는다", () => {
    const bad = files.flatMap((file) =>
      specifiers(file)
        .map((specifier) => target(file, specifier))
        .filter(
          (path): path is string =>
            path !== null && /^(src|api)(\/|$)/.test(path),
        )
        .map((path) => `${file} -> ${path}`),
    );
    expect(bad).toEqual([]);
  });

  test("@/ 별칭, React, Node 전용 모듈, DB 클라이언트를 쓰지 않는다", () => {
    const banned = /^(@\/|react($|\/)|react-dom|node:|@supabase\/)/;
    const bad = files.flatMap((file) =>
      specifiers(file)
        .filter((specifier) => banned.test(specifier))
        .map((specifier) => `${file} -> ${specifier}`),
    );
    expect(bad).toEqual([]);
  });

  test("상대 import 는 .js 확장자를 붙인다", () => {
    const bad = files.flatMap((file) =>
      specifiers(file)
        .filter(
          (specifier) =>
            specifier.startsWith(".") && !specifier.endsWith(".js"),
        )
        .map((specifier) => `${file} -> ${specifier}`),
    );
    expect(bad).toEqual([]);
  });
});

describe("src/ 는 api/ 를 읽지 않는다", () => {
  const readsApi = (file: string) =>
    specifiers(file).some((specifier) => {
      const path = target(file, specifier);
      return path !== null && /^api(\/|$)/.test(path);
    });
  const current = sourceFiles("src").filter(readsApi).sort();

  test("목록 밖의 파일이 api/ 를 읽지 않는다", () => {
    expect(current.filter((file) => !SRC_TO_API_ALLOWLIST.has(file))).toEqual(
      [],
    );
  });

  test("목록은 줄이기만 한다: 더 이상 api/ 를 읽지 않는 파일은 목록에서 뺀다", () => {
    expect(
      [...SRC_TO_API_ALLOWLIST].filter((file) => !current.includes(file)),
    ).toEqual([]);
  });
});
