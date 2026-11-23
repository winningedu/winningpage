// diagnosisScoring/diagnosisReport 자체 결정 값 격리 — 2026-08-11 원본 근거 없이 정한 값들이
// 단일 정의처에만 남아 있는지, 소비 표면으로 새지 않았는지 검증한다.
// 원본: scripts/verify-diagnosis-scoring.mjs S15([F-격리]) 격리 1·2·3.

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  ADMISSION_BAND_BASE_PROBABILITY,
  ADMISSION_BAND_EDGE_ADJUST,
  ADMISSION_FETCH_ERROR,
  AREA_BAND_THRESHOLDS,
  SERVICE_H3_LATE_MONTH,
  SERVICE_H3_LATE_TIMEZONE,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_MIN_ANSWERED,
  SINCERITY_OFFMODE_MIN_DISTANCE,
  TYPE_RULES,
} from "@/data/diagnosisScoringTable.ts";
import { SELF_DECIDED } from "@/lib/diagnosisReport.ts";
import {
  classifyStudentType,
  isStraightLining,
  probabilityRangeLabel,
  serviceCandidates,
  successProbability,
} from "@/lib/diagnosisScoring.ts";
import {
  existsInSrc,
  sourceOf,
  stripComments,
} from "./diagnosisScoringTestFixtures.ts";

// process.cwd() 기준 경로 — 이유는 diagnosisScoringTestFixtures.ts 의 SRC_ROOT 주석 참고.
const SRC_ROOT = join(process.cwd(), "src") + "/";

/* ================================================================== *
 * S15. [F-격리] 자체 결정 값의 격리 · 폴백 채움분 정식 단언
 *
 * 이 섹션의 존재 이유는 하나다. 2026-08-11 에 우리가 **원본 근거 없이 정한 값**들이 있고,
 * 원저자 답이 오면 "상수만 교체하면 끝"이어야 한다. 그 약속은 문서가 아니라 여기서 지켜진다 —
 * 값이 로직에 인라인되거나 두 번째 정의처가 생기면 아래 단언이 붉어진다.
 *
 * 스캔 대상이 '문자열 포함 여부'인 이유: 값이 무엇인지 pin 하면 확정 시 두 곳을 고쳐야 해서
 * 오히려 교체를 막는다. 그래서 값 자체가 아니라 **값이 지켜야 할 불변식**(단일 정의처 · 단조성 ·
 * 배타성 · 경계)만 건다. 유일한 예외는 근거가 있는 값(시안 인용 '정체', 배점표 라벨)이다.
 * ================================================================== */

// 자체 결정 문자열의 소비 표면 — 리포트를 그리거나 저장하는 모든 진단 파일이다.
// diagnosisCopy.js 는 제외한다(문구집 원문에 '학생부종합' 같은 어휘가 정당하게 들어 있다).
// admissionParsing.js 도 제외 — 전형 유형 문자열을 쓰지만 입결 HTML 파싱이라 도메인이 다르다.
const REPORT_COMPONENT_DIR = "components/renewal/report/";

// 하위 폴더(v3/)는 재귀로 내려가고 폴더 자체는 목록에 넣지 않는다. 폴더를 파일처럼 읽으면 EISDIR 이다.
function filesUnder(dir: string): string[] {
  return readdirSync(SRC_ROOT + dir, { withFileTypes: true }).flatMap(
    (entry) =>
      entry.isDirectory()
        ? filesUnder(dir + entry.name + "/")
        : [dir + entry.name],
  );
}
const DIAGNOSIS_SURFACE = [
  "lib/diagnosisScoring.ts",
  "lib/diagnosisCopyBinding.ts",
  "lib/diagnosisInputStorage.ts",
  "lib/diagnosisAdmissionCuts.ts",
  "data/diagnosisScoringTable.ts",
  "data/diagnosisScreenCopy.ts",
  // 결정문이 자체 결정 값의 집으로 지목했던 파일. 지금은 없지만 나중에 생기면 여기 걸린다 —
  // 같은 값이 두 파일에 존재하는 순간 "상수만 교체" 약속이 깨진다.
  "data/diagnosisSelfDecided.js",
  "hooks/useAdmissionCascade.ts",
  "pages/renewal/FreeDiagnosisReport.tsx",
  "pages/renewal/SurveyStepShell.tsx",
  ...filesUnder(REPORT_COMPONENT_DIR),
].filter((path) => existsInSrc(path));

test("소비 표면 스캔 대상이 실재한다(경로 오타로 스캔이 0건이 되지 않는다)", () => {
  expect(DIAGNOSIS_SURFACE.length >= 10).toBe(true);
});

test("소비 표면은 파일만 담고, 레거시 리포트 컴포넌트와 v3 하위 폴더 파일을 모두 포함한다", () => {
  expect(DIAGNOSIS_SURFACE).toContain(
    REPORT_COMPONENT_DIR + "DiagnosisReportView.tsx",
  );
  expect(DIAGNOSIS_SURFACE).toContain(
    REPORT_COMPONENT_DIR + "v3/CoverPage.tsx",
  );
  expect(DIAGNOSIS_SURFACE.filter((path) => !/\.[a-z]+$/.test(path))).toEqual(
    [],
  );
});

/* ---- 격리 1. 표시 계층 자체 결정 문자열 — 정의처 1곳, 소비처 0곳 ---- */

const SELF_DECIDED_STRINGS = [
  SELF_DECIDED.GPA_UNKNOWN_SUFFIX,
  ...Object.values(SELF_DECIDED.GRADE_TREND_SHORT_LABEL),
  ...Object.values(SELF_DECIDED.ADMISSION_TYPE_DISPLAY),
  SELF_DECIDED.SERVICE_H3_LATE_NOTICE,
  SELF_DECIDED.ADMISSION_FINAL_AVG_OMITTED,
  SELF_DECIDED.PROB_RANGE_HEADING,
  SELF_DECIDED.PROB_REFERENCE_BADGE,
  // G-1c(2026-08-12 신설) — 5등급제 이중 표기 WARN 을 닫으며 추가된 접미어.
  SELF_DECIDED.ADMISSION_MINE_CONVERTED_SUFFIX,
];
test("SELF_DECIDED 문자열 14건(키가 조용히 사라지지 않았다, G-1c 로 13→14)", () => {
  expect(SELF_DECIDED_STRINGS.length).toEqual(14);
});
test("SELF_DECIDED 는 동결(소비자가 값을 덮어쓸 수 없다)", () => {
  expect(Object.isFrozen(SELF_DECIDED)).toBe(true);
});
test("SELF_DECIDED 문자열은 전부 비어 있지 않다", () => {
  expect(
    SELF_DECIDED_STRINGS.every(
      (value) => typeof value === "string" && value.trim() !== "",
    ),
  ).toBe(true);
});

const selfDecidedHome = sourceOf("lib/diagnosisReport.ts");
const duplicatedDefinitions = SELF_DECIDED_STRINGS.filter(
  (value) => selfDecidedHome.split(value).length - 1 !== 1,
);
test("자체 결정 문자열은 정의처에 정확히 1회만 나온다(로직 인라인 0건)", () => {
  expect(duplicatedDefinitions).toEqual([]);
});

const leakedToConsumers: string[] = [];
DIAGNOSIS_SURFACE.forEach((path) => {
  const source = sourceOf(path);
  SELF_DECIDED_STRINGS.forEach((value) => {
    if (source.includes(value)) leakedToConsumers.push(`${path} ← ${value}`);
  });
});
// 여기가 붉어지면 누군가 값을 컴포넌트·훅에 복사한 것이다. 확정 문구가 와도 그 사본은 안 바뀐다.
test("자체 결정 문자열이 소비 표면 어디에도 복제되지 않았다", () => {
  expect(leakedToConsumers).toEqual([]);
});

/* ---- 격리 2. 엔진 자체 결정 숫자 — 함수 본문에 리터럴로 새지 않았다 ---- */

// fn.toString() 으로 실제 본문을 읽는다. 소스 파일을 정규식으로 자르는 것보다 정확하다 —
// 함수가 옮겨 다녀도 따라가고, 이름만 같은 다른 코드를 잘못 집지 않는다.
const SELF_DECIDED_NUMBERS = new Set([
  ...Object.values(ADMISSION_BAND_BASE_PROBABILITY),
  ...Object.values(ADMISSION_BAND_EDGE_ADJUST).map((value) => Math.abs(value)),
  ...Object.values(TYPE_RULES).flatMap((rule) => Object.values(rule)),
  SINCERITY_MIN_ANSWERED,
  SINCERITY_MAX_OFFMODE,
  SINCERITY_OFFMODE_MIN_DISTANCE,
  SERVICE_H3_LATE_MONTH,
]);
test("자체 결정 숫자 목록이 비지 않았다", () => {
  expect(SELF_DECIDED_NUMBERS.size >= 10).toEqual(true);
});

// [함수, 본문이 반드시 참조해야 하는 상수 식별자] — 식별자 검사는 "본문이 비어 있어 통과"를 막는다.
const CONSTANT_DRIVEN_FUNCTIONS: [(...args: never[]) => unknown, string[]][] = [
  [successProbability, ["ADMISSION_BAND_BASE_PROBABILITY"]],
  [probabilityRangeLabel, ["PROB_RANGE_LABELS"]],
  [classifyStudentType, ["TYPE_RULES"]],
  [isStraightLining, ["SINCERITY_MIN_ANSWERED", "SINCERITY_MAX_OFFMODE"]],
  [serviceCandidates, ["SERVICE_H3_LATE_MONTH", "SERVICE_H3_LATE_CODES"]],
];
const inlinedNumbers: string[] = [];
CONSTANT_DRIVEN_FUNCTIONS.forEach(([fn, identifiers]) => {
  const body = stripComments(fn.toString());
  test(`${fn.name} 본문이 상수 식별자를 참조한다(${identifiers.join(" · ")})`, () => {
    expect(identifiers.every((identifier) => body.includes(identifier))).toBe(
      true,
    );
  });
  // 숫자 앞에 식별자·점이 오는 경우(예: LK1_01, obj.5)는 제외하고 순수 리터럴만 센다.
  const literals = (body.match(/(?<![\w.$])\d+(?:\.\d+)?/g) ?? []).map(Number);
  literals
    .filter((value) => SELF_DECIDED_NUMBERS.has(value))
    .forEach((value) => {
      inlinedNumbers.push(`${fn.name} ← ${value}`);
    });
});
test("자체 결정 숫자가 함수 본문에 인라인되지 않았다", () => {
  expect(inlinedNumbers).toEqual([]);
});
// 남아 있는 리터럴 45 는 자체 결정이 아니라 배점표 근거값이다 — 정의처와 어긋나면 여기서 잡힌다.
test("classifyStudentType 의 45 는 영역 취약 임계와 같은 값이다", () => {
  expect(AREA_BAND_THRESHOLDS.LOW).toEqual(45);
});

const scoringSource = sourceOf("lib/diagnosisScoring.ts");
test("타임존 문자열도 상수를 거친다", () => {
  expect(!scoringSource.includes(`'${SERVICE_H3_LATE_TIMEZONE}'`)).toBe(true);
});
test("월 추출에 getMonth() 를 쓰지 않는다(실행 환경 타임존을 타면 경계일이 하루 밀린다)", () => {
  expect(!scoringSource.includes("getMonth()")).toBe(true);
});
test("월 추출은 Intl 로 한다", () => {
  expect(scoringSource.includes("Intl.DateTimeFormat")).toBe(true);
});
test("엔진은 문구 모듈을 import 하지 않는다(§6.2 계층 계약)", () => {
  expect(
    !scoringSource.includes("from './diagnosisCopy") &&
      !scoringSource.includes("data/diagnosisCopy"),
  ).toBe(true);
});

/* ---- 격리 3. 두 번째 집이 생기지 않았다 ---- */

test("자체 결정 값의 집은 두 곳뿐이다(엔진 §11 · 조립 SELF_DECIDED) — 세 번째 파일이 생기면 여기서 잡힌다", () => {
  expect(existsInSrc("data/diagnosisSelfDecided.js")).toEqual(false);
});
test("§11 센티널은 동결(호출부가 필드를 얹어 상태를 오염시킬 수 없다)", () => {
  expect(Object.isFrozen(ADMISSION_FETCH_ERROR)).toBe(true);
});
test("센티널은 결측(null)과 구분 가능한 객체다", () => {
  expect(
    ADMISSION_FETCH_ERROR !== null && typeof ADMISSION_FETCH_ERROR === "object",
  ).toBe(true);
});
