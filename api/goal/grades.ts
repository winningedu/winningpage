// GET/POST /api/goal/grades
// Authorization: Bearer <access_token>
//
// 성적 관리(#35) 페이지 + 대시보드 모의고사/내신 카드의 "+ 성적 추가"가 쓰는 엔드포인트.
// goal_students.naesin_scores / mock_exam_scores(jsonb, 온보딩이 이미 쓰고 있다 —
// api/goal/intake.js 참고)에 회차를 하나씩 append 한다.
//
// ── 스코프(팀장 확정, 변경 금지) ─────────────────────────────────────────────
// 성적 추가/수정은 기록·표시만 한다. 확률을 다시 계산하지 않는다 — base 확률 재계산은
// 재온보딩 정책(미결 Q3)과 직결이라 그 결정 전까지 제외한다. goal_probability_logs에도
// 쓰지 않는다. src/lib/goal/calc/ 의 어떤 함수도 호출하지 않는다(round1 같은 사소한
// 유틸도 그 모듈 소속이라 가져오지 않고, 이 파일 안에 별도로 둔다).
//
// ── naesin_scores / mock_exam_scores 실측 구조(intake.js 기준) ──────────────
// naesin_scores = {
//   s1mid: {value, none}, s1final: {...}, s2mid: {...}, s2final: {...},
//   priorNaesinGrade?: string   // "전 회차 없음" 특례일 때만
// }
//   - value 는 이미 평균된 "등급 하나"다. 온보딩은 과목별 입력을 받지 않는다.
// mock_exam_scores = {
//   mar: {kor, math, eng, tam1, tam2, none}, jun: {...}, sep: {...}, oct: {...}
// }
//   - 과목 5개(국/수/영/탐구1/탐구2), 등급 1~9. eng 만 등급 문자열 그대로, 나머지는
//     gradeToPercentile 변환 전 원본 등급이다.
//
// 그런데 성적 관리 화면(2910:3638 등)의 실제 시안은 온보딩과 완전히 다른 스케일이다:
//   - 내신 표: 과목 4개(국/수/영/탐구 — 탐구 단일), 등급 1~9, 평균은 화면이 계산해 보여준다.
//   - 모의고사 표: 과목 4개(국/수/영/탐구 — 탐구 단일), **백분위 0~100**(등급 아니다).
// 온보딩의 4개 고정 회차 키(s1mid 등)나 모의고사의 5과목·등급 스케일과 그대로 겹칠 수
// 없다 — 재사용하면 시안이 요구하는 과목별 값(국/수/영/탐구 4개)을 담을 자리가 없다.
//
// ── 판단: 같은 컬럼에, 같은 "회차 키→값" 관례를 확장해서 쓴다 ────────────────
// 새 컬럼이나 새 테이블을 만들지 않는다(팀장 지시 "구조는 intake.js가 쓰는 형태를
// 실측해 따라라"). 대신 각 jsonb 최상위에 `records`(배열)를 추가해 온보딩이 쓰는 4개
// 고정 키(s1mid.../mar...)와 절대 충돌하지 않게 하고, 그 배열의 원소 하나하나는
// intake의 회차 엔트리와 같은 어휘를 쓴다 — `value`(회차 대표값) · `none`(항상 false,
// 사용자가 실제로 입력한 회차라서) 필드명을 그대로 재사용하고, 시안이 요구하는 과목별
// 값은 `subjects`로 얹는다. free-form jsonb 라 마이그레이션이 필요 없다(naesin_scores/
// mock_exam_scores 컬럼 코멘트가 이미 "회차·과목 구성이 흔들려 정규화하지 않는다"고
// 명시한다 — sql/55_goal_management.sql).
//
// 같은 회차(term 문자열 동일)를 다시 저장하면 새로 추가하지 않고 기존 원소를 교체한다
// (팀장 지시 "재량, 판단 기록" — 회차 표기가 자유 입력이라 사용자가 오타를 고치거나
// 같은 시험을 다시 입력하는 경우 배열이 무한정 늘어나지 않게 하는 편이 안전하다고
// 판단했다).
//
// ── 게이트 규약(house style) ─────────────────────────────────────────────
// 405 → 401 → (조회 200 {allowed:false} / 쓰기 403 PAID_MESSAGE) → 검증 → 처리 → 500.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { GRADE_PERCENTILE } from "../../src/lib/goal/calc/jeongsi.js";
import { buildGoalDirectionReport } from "../_lib/goal/directionReport.js";
import {
  fetchStudentRow,
  narrowGoalSession,
  openGoalSession,
  PAID_MESSAGE,
  saveGoalDirectionReport,
  updateStudentGrades,
} from "../_lib/goal/repo.js";
import { sendError } from "../_lib/httpResponse.js";

export const config = { runtime: "nodejs" };

// api/_lib/goal/repo.ts(.js, Stage3 대상)의 openGoalSession 반환 shape은 JSDoc으로만 선언돼
// 있다 — handleGet/handlePost가 공유하는 세션 매개변수 타입을 그 함수에서 그대로
// 추론해 재사용한다(중복 선언 없이 api/_lib/goal/repo.ts JSDoc이 바뀌면 여기도 함께 따라간다).
type GoalSession = Awaited<ReturnType<typeof openGoalSession>>;

// QA 행290・291 재설계로 온보딩 입력 구조가 바뀐 것에 맞춰 성적관리 모달의 과목 구성도
// 확장한다(팀장 지시 항목10) — 내신은 4과목 flat에서 6과목군(NAESIN_SUBJECT_GROUPS,
// onboardingOptions.ts와 같은 키)으로, 모의고사는 탐구 단일에서 탐구1・탐구2로 나눈다.
// 도메인은 그대로다(내신 1~9 등급, 모의고사 0~100 백분위 — 시안 실측대로 "백분위 저장
// 유지", 팀장 지시). 기존에 저장된 4과목 레코드(레거시)는 GET이 원본 그대로 돌려주고
// 화면이 있는 값만 표시하므로 이 파일은 읽기 경로를 따로 손대지 않는다(하위 호환).
const NAESIN_SUBJECT_KEYS = [
  "korean",
  "math",
  "english",
  "social_history",
  "science",
  "second_language",
];
const MOCK_SUBJECT_KEYS = ["korean", "math", "english", "tam1", "tam2"];

const GRADE_DOMAIN = { min: 1, max: 9 };
const PERCENTILE_DOMAIN = { min: 0, max: 100 };

const TERM_MAX_LENGTH = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 온보딩이 쓰는 고정 회차 키 — 새 회차의 term 이 이 값과 같으면 records 배열이 아니라
// 온보딩 원본 자리를 사람이 착각한 것이므로 거부한다(방어적 검증, 실제로는 select
// option/자유입력 문자열이 이 값과 우연히 같을 일이 거의 없다).
const RESERVED_KEYS = {
  naesin: [
    "s1mid",
    "s1final",
    "s2mid",
    "s2final",
    "priorNaesinGrade",
    "records",
  ],
  mock: ["mar", "jun", "sep", "oct", "records"],
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumericInput(raw: unknown) {
  return typeof raw === "number" || typeof raw === "string";
}

function isInDomain(raw: unknown, domain: { min: number; max: number }) {
  if (!isNumericInput(raw)) return false;
  const num = Number(raw);
  return Number.isFinite(num) && num >= domain.min && num <= domain.max;
}

// unwrapped {status, body}를 돌려준다 — 호출부가 항상 `return { error: fail(...) }`
// 형태의 object literal로 감싸야 TS가 형제 프로퍼티를 undefined로 자동 추론해
// validated.error / validated.record 접근이 좁혀진다(순수 타입 추론 편의,
// 런타임 JSON 응답 바이트는 이전과 동일 — { error: { status, body: { detail } } }).
function fail(status: number, detail: string) {
  return { status, body: { detail } };
}

/**
 * 공통 바디 검증 — term(회차 라벨) · 날짜 · 과목(내신 6과목군 / 모의고사 5과목).
 * naesin 은 1~9 등급, mock 은 0~100 백분위 도메인만 다르다(시안 실측, 위 헤더 주석 참고).
 */
export function validateEntry(entry: unknown, type: "naesin" | "mock") {
  if (!isPlainObject(entry))
    return { error: fail(400, "성적 입력이 올바르지 않습니다.") };

  const term = String(entry.term ?? "").trim();
  if (!term) return { error: fail(400, "회차를 입력해 주세요.") };
  if (term.length > TERM_MAX_LENGTH)
    return { error: fail(400, "회차 이름이 너무 깁니다.") };
  if (RESERVED_KEYS[type].includes(term)) {
    return { error: fail(400, "사용할 수 없는 회차 이름입니다.") };
  }

  const dateField = type === "naesin" ? entry.enteredAt : entry.examDate;
  const dateLabel = type === "naesin" ? "입력일" : "응시일";
  const dateValue = String(dateField ?? "").trim();
  if (!DATE_RE.test(dateValue))
    return { error: fail(400, `${dateLabel}을 올바르게 입력해 주세요.`) };

  if (!isPlainObject(entry.subjects))
    return { error: fail(400, "과목별 점수가 올바르지 않습니다.") };

  const domain = type === "naesin" ? GRADE_DOMAIN : PERCENTILE_DOMAIN;
  const domainLabel = type === "naesin" ? "1~9 등급" : "0~100 백분위";
  const subjectKeys =
    type === "naesin" ? NAESIN_SUBJECT_KEYS : MOCK_SUBJECT_KEYS;

  const subjects: Record<string, number> = {};
  for (const key of subjectKeys) {
    const raw = entry.subjects[key];
    if (!isInDomain(raw, domain)) {
      return {
        error: fail(400, `과목별 점수는 ${domainLabel} 사이여야 합니다.`),
      };
    }
    subjects[key] = Number(raw);
  }

  const value = round1(
    subjectKeys.reduce(
      (sum, key) =>
        // biome-ignore lint/style/noNonNullAssertion: subjects는 바로 위 루프에서 subjectKeys 전체를 채웠으므로 항상 존재한다.
        sum + subjects[key]!,
      0,
    ) / subjectKeys.length,
  );

  return {
    record: {
      term,
      [type === "naesin" ? "enteredAt" : "examDate"]: dateValue,
      subjects,
      value,
      none: false,
      recordedAt: new Date().toISOString(),
    },
  };
}

// QA 행288 정렬 키 — src/lib/goalGrades.ts examOrderKey()와 같은 규칙(examDate/enteredAt,
// 응시·입력 시점 그 자체). 이 파일이 그 모듈을 import하지 않는 이유는 파일 헤더 주석
// 그대로다(calc 파이프라인과 무관한 이 파일 전용 소소한 유틸도 별도로 둔다).
function examOrderKey(record: {
  examDate?: string;
  enteredAt?: string;
  recordedAt?: string;
}) {
  return record.examDate || record.enteredAt || record.recordedAt || "";
}

/**
 * records 배열에 회차를 추가하거나(term 동일 시) 교체한 뒤, 응시/입력 시점 순으로
 * 정렬해 돌려준다. 회차를 시간순과 다르게 입력해도(예: 지난 시험을 나중에 추가) 배열이
 * append 순서로 남지 않게 하기 위함 — src/lib/goalGrades.ts latestKpi()/recentHistory()가
 * "배열 마지막 = 최신"으로 가정하기 때문에(읽기 시에도 다시 정렬하지만, 저장 시점부터
 * 정렬해 두면 새 데이터는 애초에 어긋나지 않는다).
 */
export function upsertRecord(
  records: unknown,
  record: {
    term: string;
    examDate?: string;
    enteredAt?: string;
    recordedAt?: string;
  },
) {
  const list = Array.isArray(records) ? records : [];
  const index = findRecordIndex(list, record.term);
  const next =
    index === -1
      ? [...list, record]
      : list.map((item, i) => (i === index ? record : item));

  return next.sort((a, b) => examOrderKey(a).localeCompare(examOrderKey(b)));
}

// records 배열에서 term 이 일치하는 회차의 인덱스 — PUT/DELETE 는 별도 id 컬럼이 없는
// 이 free-form jsonb 구조에서 POST(upsertRecord)와 같은 식별자(term)를 그대로 쓴다
// (판단 지점 — api/goal/report.ts buildNaesinPeriodOptions/buildJeongsiPeriodOptions도
// `record:${term}` 을 식별자로 쓰고 있어 term-as-id 는 이미 이 저장소 전역의 관례다).
export function findRecordIndex(records: unknown, term: string) {
  const list = Array.isArray(records) ? records : [];
  return list.findIndex(
    (item) => item && typeof item === "object" && item.term === term,
  );
}

/**
 * originalTerm 이 가리키는 회차를 새 record 로 교체한다. 반환값 3갈래:
 *   - null        : originalTerm 을 가진 회차가 없음(호출부 404)
 *   - "collision" : record.term 이 originalTerm 에서 바뀌었는데, 그 새 이름이 배열의
 *                   *다른* 회차와 겹침(호출부 400) — upsertRecord 의 "같은 term=교체"
 *                   관례를 깨지 않기 위한 방어.
 *   - 배열         : 교체 + 재정렬된 새 records(POST와 동일하게 저장 시점부터 정렬해 둔다).
 */
export function replaceRecord(
  records: unknown,
  originalTerm: string,
  record: {
    term: string;
    examDate?: string;
    enteredAt?: string;
    recordedAt?: string;
  },
) {
  const list = Array.isArray(records) ? records : [];
  const index = findRecordIndex(list, originalTerm);
  if (index === -1) return null;

  const collisionIndex = list.findIndex(
    (item, i) =>
      i !== index &&
      item &&
      typeof item === "object" &&
      item.term === record.term,
  );
  if (collisionIndex !== -1) return "collision" as const;

  const next = list.map((item, i) => (i === index ? record : item));
  return next.sort((a, b) => examOrderKey(a).localeCompare(examOrderKey(b)));
}

/** term 이 가리키는 회차를 제거한다. 없으면 null(호출부 404), 있으면 제거된 새 records. */
export function removeRecord(records: unknown, term: string) {
  const list = Array.isArray(records) ? records : [];
  const index = findRecordIndex(list, term);
  if (index === -1) return null;
  return list.filter((_, i) => i !== index);
}

function readBody(req: VercelRequest) {
  const body = req.body;
  if (typeof body !== "string") return body;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

async function handleGet(
  _req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(200).json({ allowed: false });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  if (!row) {
    return res.status(200).json({ onboarded: false });
  }

  const naesinScores = row.naesin_scores || {};
  const mockScores = row.mock_exam_scores || {};

  return res.status(200).json({
    onboarded: true,
    naesinRecords: Array.isArray(naesinScores.records)
      ? naesinScores.records
      : [],
    mockRecords: Array.isArray(mockScores.records) ? mockScores.records : [],
  });
}

async function handlePost(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const type = body.type;
  if (type !== "naesin" && type !== "mock") {
    return res.status(400).json({ detail: "성적 유형이 올바르지 않습니다." });
  }

  const validated = validateEntry(body.entry, type);
  if (validated.error) {
    return res.status(validated.error.status).json(validated.error.body);
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  if (!row) {
    return res.status(404).json({
      detail: "온보딩을 먼저 완료해 주세요.",
      reason: "not_onboarded",
    });
  }

  const record = validated.record;

  // updateStudentGrades(api/_lib/goal/repo.ts)는 구조분해 파라미터라 두 키를 모두 요구하는
  // 타입으로 추론된다 — 안 바꾼 쪽은 undefined로 명시해 그 함수 내부의
  // `!== undefined` 판정(패치 생략)을 그대로 탄다(런타임 동작 동일).
  const patch: { naesin_scores: unknown; mock_exam_scores: unknown } = {
    naesin_scores: undefined,
    mock_exam_scores: undefined,
  };
  let records: unknown[];
  if (type === "naesin") {
    const naesinScores = row.naesin_scores || {};
    records = upsertRecord(naesinScores.records, record);
    patch.naesin_scores = { ...naesinScores, records };
  } else {
    const mockScores = row.mock_exam_scores || {};
    records = upsertRecord(mockScores.records, record);
    patch.mock_exam_scores = { ...mockScores, records };
  }

  await updateStudentGrades(supabaseAdmin, profileId, patch);

  // QA 행301(b) — 이 회차를 학습방향 리포트 이력에 1건 남긴다. naesinScores/
  // mockExamScores를 넘기지 않아 buildGoalDirectionReport가 레거시(4과목 flat)
  // 분기로만 해석하도록 강제한다 — 이 지점의 목적은 "방금 입력한 이 회차"의
  // 스냅샷이지, 학생의 현재 과목군 평균 집계(naesin_scores.groupAverages, 병렬
  // 유닛 소유)가 아니기 때문이다(판단 지점, api/_lib/goal/directionReport.ts
  // resolveNaesinSubjectAverage/resolveJungsiSubjectAverage 헤더 주석 참고).
  const { payload, snapshot } = buildGoalDirectionReport({
    kind: type === "naesin" ? "naesin" : "jungsi",
    sourceType: type === "naesin" ? "naesin" : "mogo",
    sourceLabel: record.term,
    grade: row.grade,
    legacyEntry: record,
    gradePercentile: GRADE_PERCENTILE,
  });
  await saveGoalDirectionReport(supabaseAdmin, profileId, {
    kind: type === "naesin" ? "naesin" : "jungsi",
    sourceType: type === "naesin" ? "naesin" : "mogo",
    sourceLabel: record.term,
    payload,
    snapshot,
  });

  return res.status(200).json({ ok: true, record, records });
}

/**
 * PUT — 회차 id(term) 기준 전체 갱신. 소유권은 별도 검증 로직이 없다 — 항상
 * narrowGoalSession(session).profileId(서버가 검증한 JWT에서 나온 값)로만
 * fetchStudentRow 를 조회하므로 다른 사용자의 행을 절대 볼 수 없다(GET/POST와 동일한
 * 경계, RLS 는 service role 로 우회하지만 이 profileId 스코프가 대신한다).
 */
async function handlePut(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const type = body.type;
  if (type !== "naesin" && type !== "mock") {
    return res.status(400).json({ detail: "성적 유형이 올바르지 않습니다." });
  }

  const originalTerm = String(body.term ?? "").trim();
  if (!originalTerm) {
    return res.status(400).json({ detail: "수정할 회차를 지정해 주세요." });
  }

  const validated = validateEntry(body.entry, type);
  if (validated.error) {
    return res.status(validated.error.status).json(validated.error.body);
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  if (!row) {
    return res.status(404).json({
      detail: "온보딩을 먼저 완료해 주세요.",
      reason: "not_onboarded",
    });
  }

  const record = validated.record;
  const scores =
    type === "naesin" ? row.naesin_scores || {} : row.mock_exam_scores || {};
  const result = replaceRecord(scores.records, originalTerm, record);

  if (result === null) {
    return res.status(404).json({
      detail: "성적 기록을 찾을 수 없습니다.",
      reason: "record_not_found",
    });
  }
  if (result === "collision") {
    return res.status(400).json({ detail: "이미 사용 중인 회차 이름입니다." });
  }

  // updateStudentGrades(api/_lib/goal/repo.ts) 구조분해 파라미터 관례, handlePost 참고.
  const patch: { naesin_scores: unknown; mock_exam_scores: unknown } = {
    naesin_scores: undefined,
    mock_exam_scores: undefined,
  };
  if (type === "naesin") {
    patch.naesin_scores = { ...scores, records: result };
  } else {
    patch.mock_exam_scores = { ...scores, records: result };
  }

  await updateStudentGrades(supabaseAdmin, profileId, patch);

  return res.status(200).json({ ok: true, record, records: result });
}

/** DELETE — 회차 id(term) 기준 삭제. 소유권 경계는 handlePut 과 동일. */
async function handleDelete(
  req: VercelRequest,
  res: VercelResponse,
  session: GoalSession,
) {
  const { allowed } = session;

  if (!allowed) {
    return res.status(403).json({ detail: PAID_MESSAGE });
  }

  const body = readBody(req);
  if (!isPlainObject(body))
    return res.status(400).json({ detail: "요청 본문이 올바르지 않습니다." });

  const type = body.type;
  if (type !== "naesin" && type !== "mock") {
    return res.status(400).json({ detail: "성적 유형이 올바르지 않습니다." });
  }

  const term = String(body.term ?? "").trim();
  if (!term) {
    return res.status(400).json({ detail: "삭제할 회차를 지정해 주세요." });
  }

  const { supabaseAdmin, profileId } = narrowGoalSession(session);
  const row = await fetchStudentRow(supabaseAdmin, profileId);
  if (!row) {
    return res.status(404).json({
      detail: "온보딩을 먼저 완료해 주세요.",
      reason: "not_onboarded",
    });
  }

  const scores =
    type === "naesin" ? row.naesin_scores || {} : row.mock_exam_scores || {};
  const records = removeRecord(scores.records, term);

  if (records === null) {
    return res.status(404).json({
      detail: "성적 기록을 찾을 수 없습니다.",
      reason: "record_not_found",
    });
  }

  const patch: { naesin_scores: unknown; mock_exam_scores: unknown } = {
    naesin_scores: undefined,
    mock_exam_scores: undefined,
  };
  if (type === "naesin") {
    patch.naesin_scores = { ...scores, records };
  } else {
    patch.mock_exam_scores = { ...scores, records };
  }

  await updateStudentGrades(supabaseAdmin, profileId, patch);

  return res.status(200).json({ ok: true, records });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (
    req.method !== "GET" &&
    req.method !== "POST" &&
    req.method !== "PUT" &&
    req.method !== "DELETE"
  ) {
    return sendError(res, "detail", 405, "Method not allowed");
  }

  try {
    const session = await openGoalSession(req);
    if (session.error) {
      return sendError(
        res,
        "detail",
        session.error.status,
        session.error.body.detail as string,
      );
    }

    if (req.method === "GET") return await handleGet(req, res, session);
    if (req.method === "POST") return await handlePost(req, res, session);
    if (req.method === "PUT") return await handlePut(req, res, session);
    return await handleDelete(req, res, session);
  } catch (error) {
    console.error("goal/grades error:", error);
    return sendError(res, "detail", 500, "처리 중 오류가 발생했습니다.");
  }
}
