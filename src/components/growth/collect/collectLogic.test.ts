import { describe, expect, test } from "vitest";
import type {
  CollectSummary,
  SemesterKey,
  SemesterRow,
} from "@/lib/growth/api";
import {
  buildDirectGrades,
  buildGradeDisplay,
  buildOverview,
  buildSemesterItems,
  canSkipFirstYear,
  classifyCommitError,
  createBlockReason,
  currentFor,
  gradeOfKey,
  gradeSystemInfo,
  initialTrack,
  semesterOfKey,
  TRACKS,
  trackChoiceNotice,
  validateGradeInput,
} from "./collectLogic";

describe("트랙 선택과 current 계산", () => {
  test("트랙 칩은 고1, 고2, 고3, 졸업, N수 다섯 개다", () => {
    expect(TRACKS).toEqual(["고1", "고2", "고3", "졸업", "N수"]);
  });

  test("초기 트랙은 프로필 학년이고 없거나 모르는 값이면 null 이다", () => {
    expect(initialTrack("고2")).toBe("고2");
    expect(initialTrack("N수")).toBe("N수");
    expect(initialTrack(null)).toBeNull();
    expect(initialTrack("중3")).toBeNull();
  });

  test("고1~고3 은 트랙 학년과 프로필 학기가 current 가 된다", () => {
    expect(currentFor("고2", 1)).toEqual({ grade: 2, semester: 1 });
    expect(currentFor("고3", 2)).toEqual({ grade: 3, semester: 2 });
    expect(currentFor("고1", 1)).toEqual({ grade: 1, semester: 1 });
  });

  test("학기를 모르거나 졸업, N수면 current 를 보내지 않는다", () => {
    expect(currentFor("고2", null)).toBeUndefined();
    expect(currentFor("졸업", 1)).toBeUndefined();
    expect(currentFor("N수", 2)).toBeUndefined();
  });

  test("안내 문구는 받침에 맞는 조사와 서버 분석 범위 설명을 그대로 잇는다", () => {
    expect(trackChoiceNotice("고2", "범위 설명이에요.")).toBe(
      "고2를 골랐어요. 범위 설명이에요.",
    );
    expect(trackChoiceNotice("고3", "설명")).toBe("고3을 골랐어요. 설명");
    expect(trackChoiceNotice("졸업", "설명")).toBe("졸업을 골랐어요. 설명");
    expect(trackChoiceNotice("N수", "설명")).toBe("N수를 골랐어요. 설명");
    expect(trackChoiceNotice("고1", "설명")).toBe("고1을 골랐어요. 설명");
  });
});

describe("학기별 기록 행", () => {
  const row = (
    key: SemesterKey,
    count: number,
    sufficiency: SemesterRow["sufficiency"],
    notice: string | null = null,
  ): SemesterRow => ({
    key,
    count,
    sufficiency,
    label: { enough: "있음", insufficient: "부족", none: "없음" }[sufficiency],
    notice,
  });
  const summary = (rows: SemesterRow[], quota = {}) =>
    ({
      range: { semesters: rows.map((r) => r.key), description: "" },
      semesters: rows,
      uploadQuotaBySemester: quota,
    }) as unknown as CollectSummary;

  test("자료 있음은 배지만 달고 업로드를 권하지 않는다", () => {
    const item = buildSemesterItems(
      "고2",
      summary([row("고2-1", 4, "enough")]),
    ).find((i) => i.key === "고2-1");
    expect(item).toMatchObject({
      key: "고2-1",
      title: "2학년 1학기",
      count: 4,
      inRange: true,
      badge: { tone: "ok", text: "자료 있음" },
      recommendUpload: false,
    });
  });

  test("자료 부족은 경고 배지에 업로드를 권한다", () => {
    const [item] = buildSemesterItems(
      "고2",
      summary([row("고1-1", 2, "insufficient")]),
    );
    expect(item).toMatchObject({
      badge: { tone: "warn", text: "자료 부족" },
      recommendUpload: true,
    });
  });

  test("자료 없음은 서버 안내 문구를 배지로 쓰고 업로드를 권한다", () => {
    const item = buildSemesterItems(
      "고2",
      summary([row("고1-2", 0, "none", "자료 없음, 업로드 권장")]),
    ).find((i) => i.key === "고1-2");
    expect(item).toMatchObject({
      count: 0,
      badge: { tone: "none", text: "자료 없음, 업로드 권장" },
      recommendUpload: true,
    });
  });

  test("분석 범위 밖 학기는 흐리게 표시하고 배지와 업로드를 뺀다", () => {
    const items = buildSemesterItems(
      "고2",
      summary([row("고1-1", 2, "enough"), row("고1-2", 2, "enough")]),
    );
    expect(items.map((i) => i.key)).toEqual([
      "고1-1",
      "고1-2",
      "고2-1",
      "고2-2",
    ]);
    expect(items[2]).toMatchObject({
      inRange: false,
      badge: null,
      recommendUpload: false,
    });
  });

  test("학기당 남은 업로드 수는 서버 상한 정보에서 읽는다", () => {
    const [item] = buildSemesterItems(
      "고2",
      summary([row("고1-1", 0, "none", "x")], { "고1-1": 7 }),
    );
    expect(item?.uploadsLeft).toBe(7);
    const [none] = buildSemesterItems(
      "고2",
      summary([row("고1-1", 0, "none", "x")]),
    );
    expect(none?.uploadsLeft).toBeNull();
  });
});

describe("성적 입력 검증", () => {
  test("5등급제는 1~5, 9등급제는 1~9, 소수 첫째 자리까지 받는다", () => {
    expect(validateGradeInput("2.9", "five")).toEqual({
      status: "ok",
      value: 2.9,
    });
    expect(validateGradeInput("5", "five")).toEqual({ status: "ok", value: 5 });
    expect(validateGradeInput("5.0", "five")).toEqual({
      status: "ok",
      value: 5,
    });
    expect(validateGradeInput("9", "nine")).toEqual({ status: "ok", value: 9 });
    expect(validateGradeInput(" 3.8 ", "nine")).toEqual({
      status: "ok",
      value: 3.8,
    });
  });

  test("범위를 벗어나면 체계에 맞는 안내를 준다", () => {
    expect(validateGradeInput("5.1", "five")).toEqual({
      status: "error",
      message: "1부터 5까지 적어 주세요.",
    });
    expect(validateGradeInput("0.9", "nine")).toMatchObject({
      status: "error",
      message: "1부터 9까지 적어 주세요.",
    });
    expect(validateGradeInput("6", "five").status).toBe("error");
    expect(validateGradeInput("10", "nine").status).toBe("error");
  });

  test("소수 둘째 자리와 숫자가 아닌 값은 거절한다", () => {
    expect(validateGradeInput("2.95", "five")).toEqual({
      status: "error",
      message: "소수 첫째 자리까지만 적을 수 있어요.",
    });
    expect(validateGradeInput("abc", "nine")).toMatchObject({
      status: "error",
    });
    expect(validateGradeInput("2,5", "nine")).toMatchObject({
      status: "error",
    });
  });

  test("비어 있으면 자료 없음이다", () => {
    expect(validateGradeInput("", "five")).toEqual({ status: "empty" });
    expect(validateGradeInput("  ", "nine")).toEqual({ status: "empty" });
  });

  test("체계를 모르면 입력을 받지 않는다", () => {
    expect(validateGradeInput("2", null)).toEqual({
      status: "error",
      message: "입학 연도를 입력하면 등급 체계가 정해져요",
    });
  });

  test("directGrades 는 유효한 값만 담고 오류는 학기별로 모은다", () => {
    const { directGrades, errors } = buildDirectGrades(
      { "고1-1": "2.9", "고1-2": "", "고2-1": "7", "고2-2": "abc" },
      "five",
    );
    expect(directGrades).toEqual({ "고1-1": 2.9 });
    expect(Object.keys(errors)).toEqual(["고2-1", "고2-2"]);
  });

  test("체계 라벨과 근거 배지는 서버 체계와 프로필 입학 연도로 만든다", () => {
    expect(gradeSystemInfo("five", 2025)).toEqual({
      label: "5등급제",
      basis: "2025학년도 입학",
      notice: null,
    });
    expect(gradeSystemInfo("nine", 2024)).toEqual({
      label: "9등급제",
      basis: "2024학년도 입학",
      notice:
        "입학 연도가 2024학년도 이전이라 9등급제로 계산해요. 1부터 9까지 적어 주세요.",
    });
    expect(gradeSystemInfo("five", null).basis).toBeNull();
    expect(gradeSystemInfo(null, null)).toEqual({
      label: null,
      basis: null,
      notice: "입학 연도를 입력하면 등급 체계가 정해져요",
    });
  });
});

describe("리포트 만들기 가능 조건", () => {
  const ok = {
    hasOpenReport: true,
    summaryLoaded: true,
    uploadsPending: 0,
    uploadBusy: false,
    hasGradeErrors: false,
    committing: false,
  };

  test("모든 조건이 맞으면 막는 사유가 없다", () => {
    expect(createBlockReason(ok)).toBeNull();
  });

  test("처리 중인 업로드가 있으면 막는다", () => {
    expect(createBlockReason({ ...ok, uploadsPending: 1 })).toBe(
      "pending-uploads",
    );
  });

  test("열린 회차, 집계, 진행 중 업로드, 성적 오류, 커밋 중에도 막는다", () => {
    expect(createBlockReason({ ...ok, hasOpenReport: false })).toBe(
      "no-report",
    );
    expect(createBlockReason({ ...ok, summaryLoaded: false })).toBe("loading");
    expect(createBlockReason({ ...ok, uploadBusy: true })).toBe("uploading");
    expect(createBlockReason({ ...ok, hasGradeErrors: true })).toBe(
      "invalid-grades",
    );
    expect(createBlockReason({ ...ok, committing: true })).toBe("committing");
  });
});

describe("1학년 자료 없이 진행", () => {
  const withFirstYear = (level: "enough" | "insufficient" | "none") =>
    ({ firstYear: { count: 0, level, label: "" } }) as CollectSummary;

  test("고2 이상이고 1학년 자료가 충분하지 않을 때만 보인다", () => {
    expect(canSkipFirstYear("고2", withFirstYear("none"))).toBe(true);
    expect(canSkipFirstYear("고3", withFirstYear("insufficient"))).toBe(true);
    expect(canSkipFirstYear("졸업", withFirstYear("none"))).toBe(true);
    expect(canSkipFirstYear("N수", withFirstYear("insufficient"))).toBe(true);
  });

  test("고1 이거나 자료가 충분하면 보이지 않는다", () => {
    expect(canSkipFirstYear("고1", withFirstYear("none"))).toBe(false);
    expect(canSkipFirstYear("고2", withFirstYear("enough"))).toBe(false);
  });
});

describe("저장된 활동과 분석 대상 요약", () => {
  test("위닝 저장 활동은 수행평가, 자기평가서, 심화탐구의 합이다", () => {
    expect(
      buildOverview({
        performance: 9,
        self: 2,
        deep: 2,
        manual: 1,
        upload: 3,
        total: 17,
      }),
    ).toEqual({ winning: 13, upload: 3, manual: 1, total: 17 });
  });
});

describe("커밋 오류 분류", () => {
  const err = (status: number, code: string, extra?: Record<string, unknown>) =>
    ({
      kind: "error",
      status,
      code,
      message: "서버 문구",
      ...(extra ? { extra } : {}),
    }) as const;

  test("처리 중 파일, 잠긴 회차, 회차 없음은 각자 분기한다", () => {
    expect(classifyCommitError(err(409, "UPLOADS_PENDING"))).toEqual({
      kind: "uploads-pending",
    });
    expect(classifyCommitError(err(409, "REPORT_LOCKED"))).toEqual({
      kind: "locked",
    });
    expect(classifyCommitError(err(404, "NO_OPEN_REPORT"))).toEqual({
      kind: "no-report",
    });
  });

  test("그 밖의 오류는 서버 문구를 그대로 쓰고 타임아웃은 재시도 안내를 준다", () => {
    expect(classifyCommitError(err(500, "INTERNAL"))).toEqual({
      kind: "other",
      message: "서버 문구",
    });
    expect(classifyCommitError({ kind: "timeout" })).toMatchObject({
      kind: "other",
    });
  });
});

describe("학기 키 분해", () => {
  test("학년과 학기를 키에서 뽑는다", () => {
    expect(gradeOfKey("고2-1")).toBe(2);
    expect(semesterOfKey("고3-2")).toBe(2);
  });
});

describe("성적 칸 표시값", () => {
  const server = [
    { key: "고1-1" as const, average: 2.94, source: "goal" as const },
  ];
  test("고친 칸은 입력값, 안 건드린 칸은 서버 평균, 평균 없는 칸은 빈 문자열이다", () => {
    expect(
      buildGradeDisplay(
        { "고1-2": "3.5" },
        ["고1-1", "고1-2", "고2-1"],
        server,
      ),
    ).toEqual({ "고1-1": "2.9", "고1-2": "3.5", "고2-1": "" });
  });
  test("지워서 빈 입력도 서버 평균으로 되돌리지 않는다", () => {
    expect(buildGradeDisplay({ "고1-1": "" }, ["고1-1"], server)).toEqual({
      "고1-1": "",
    });
  });
});
