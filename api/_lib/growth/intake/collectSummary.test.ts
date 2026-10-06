// 성장설계 자료 수집 요약 테스트(명세 No.37~51, No.121). 순수 함수만 다룬다.
import { describe, expect, test } from "vitest";
import {
  buildCollectSummary,
  buildGradeInputs,
  countByGroup,
  countBySemester,
  countBySource,
  filterMaterialActivities,
  semesterRows,
  UPLOAD_LIMIT_PER_SEMESTER,
  type UploadStatus,
  uploadQuotaLeft,
} from "./collectSummary.js";

type Row = Parameters<typeof filterMaterialActivities>[0][number];

const row = (over: Partial<Row> & { id: string }): Row => ({
  source_program: "manual",
  status: "confirmed",
  grade_label: "고1",
  semester: 1,
  subject_group: "국어",
  subject: "국어",
  ...over,
});

describe("filterMaterialActivities (No.121)", () => {
  test("planned 만 제외하고 draft, confirmed, final 은 입력 순서대로 남긴다", () => {
    const rows = [
      row({ id: "a", status: "final" }),
      row({ id: "b", status: "planned" }),
      row({ id: "c", status: "draft" }),
      row({ id: "d", status: "confirmed" }),
    ];
    expect(filterMaterialActivities(rows).map((r) => r.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
  });
});

describe("countBySource", () => {
  test("출처별 건수와 합계를 센다", () => {
    const rows = [
      row({ id: "1", source_program: "performance" }),
      row({ id: "2", source_program: "performance" }),
      row({ id: "3", source_program: "self" }),
      row({ id: "4", source_program: "deep" }),
      row({ id: "5", source_program: "manual" }),
      row({ id: "6", source_program: "upload" }),
    ];
    expect(countBySource(rows)).toEqual({
      performance: 2,
      self: 1,
      deep: 1,
      manual: 1,
      upload: 1,
      total: 6,
    });
  });
});

describe("countBySemester", () => {
  test("학년과 학기가 모두 있는 행만 학기별로 세고 나머지는 unplaced 로 센다", () => {
    const rows = [
      row({ id: "1", grade_label: "고1", semester: 1 }),
      row({ id: "2", grade_label: "고1", semester: 1 }),
      row({ id: "3", grade_label: "고2", semester: 2 }),
      row({ id: "4", grade_label: "고2", semester: null }),
      row({ id: "5", grade_label: null, semester: 1 }),
    ];
    expect(countBySemester(rows)).toEqual({
      bySemester: { "고1-1": 2, "고2-2": 1 },
      unplaced: 2,
    });
  });
});

describe("countByGroup", () => {
  test("창체와 자율, 동아리, 진로, 봉사로 시작하는 군은 창체, 나머지는 교과로 센다", () => {
    const rows = [
      row({ id: "1", subject_group: "국어" }),
      row({ id: "2", subject_group: "수학" }),
      row({ id: "3", subject_group: "창체" }),
      row({ id: "4", subject_group: "자율활동" }),
      row({ id: "5", subject_group: "동아리활동" }),
      row({ id: "6", subject_group: "진로활동" }),
      row({ id: "7", subject_group: "봉사활동" }),
      row({ id: "8", subject_group: null }),
    ];
    expect(countByGroup(rows)).toEqual({
      curricular: 2,
      extracurricular: 5,
      unclassified: 1,
    });
  });

  test("subject_group 이 null 이거나 빈 문자열이면 교과가 아니라 미분류로 센다", () => {
    const rows = [
      row({ id: "1", subject_group: "국어" }),
      row({ id: "2", subject_group: null }),
      row({ id: "3", subject_group: "" }),
      row({ id: "4", subject_group: "창체" }),
    ];
    expect(countByGroup(rows)).toEqual({
      curricular: 1,
      extracurricular: 1,
      unclassified: 2,
    });
  });
});

describe("semesterRows (No.40, No.44)", () => {
  const thresholds = { enough: 3 };

  test("고2 는 분석 범위 4개 학기만 행으로 만들고 충분도와 안내를 붙인다", () => {
    const result = semesterRows(
      "고2",
      { "고1-1": 3, "고1-2": 1, "고3-1": 9 },
      thresholds,
    );
    expect(result).toEqual([
      {
        key: "고1-1",
        count: 3,
        sufficiency: "enough",
        label: "있음",
        notice: null,
      },
      {
        key: "고1-2",
        count: 1,
        sufficiency: "insufficient",
        label: "부족",
        notice: null,
      },
      {
        key: "고2-1",
        count: 0,
        sufficiency: "none",
        label: "없음",
        notice: "자료 없음, 업로드 권장",
      },
      {
        key: "고2-2",
        count: 0,
        sufficiency: "none",
        label: "없음",
        notice: "자료 없음, 업로드 권장",
      },
    ]);
  });

  test("current 가 있으면 현재 학기까지만 행을 만든다", () => {
    const keys = semesterRows("고3", {}, thresholds, {
      grade: 3,
      semester: 1,
    }).map((r) => r.key);
    expect(keys).toEqual(["고1-1", "고1-2", "고2-1", "고2-2", "고3-1"]);
  });
});

describe("buildGradeInputs (No.73, No.46, No.82)", () => {
  const naesin = [
    {
      key: "고1 1학기 기말",
      groups: {
        g: {
          subjects: [
            { name: "국어", grade: 2 },
            { name: "수학", grade: 3 },
          ],
        },
      },
    },
    {
      key: "고1 2학기 기말",
      groups: { g: { subjects: [{ name: "영어", grade: 1 }] } },
    },
  ];

  test("직접 입력이 있으면 우선하고, 없으면 내신 접은 평균, 둘 다 없으면 null 로 둔다", () => {
    const result = buildGradeInputs({
      profile: { admission_year: 2025 },
      naesinScores: naesin,
      direct: { "고1-1": 1.5, "고2-1": 4 },
    });
    expect(result.system).toBe("five");
    expect(result.semesters).toEqual([
      { key: "고1-1", average: 1.5, source: "direct" },
      { key: "고1-2", average: 1, source: "goal" },
      { key: "고2-1", average: 4, source: "direct" },
    ]);
    expect(result.note).toBeNull();
  });

  test("직접 입력이 null 이면 내신 접은 값으로 대체한다", () => {
    const result = buildGradeInputs({
      profile: { admission_year: 2024 },
      naesinScores: naesin,
      direct: { "고1-1": null },
    });
    expect(result.system).toBe("nine");
    expect(result.semesters[0]).toEqual({
      key: "고1-1",
      average: 2.5,
      source: "goal",
    });
  });

  test("전부 비어 있으면 자료 없음 안내를 돌려준다", () => {
    const result = buildGradeInputs({
      profile: { admission_year: 2025 },
      naesinScores: null,
      direct: null,
    });
    expect(result.semesters.every((s) => s.average === null)).toBe(true);
    expect(result.note).toBe(
      "성적을 입력하지 않아 성적 진단은 자료 없음으로 둡니다",
    );
  });

  test("profile 이 있어도 admission_year 가 null 이면 같은 안내 경로를 탄다", () => {
    const result = buildGradeInputs({
      profile: { admission_year: null },
      naesinScores: null,
      direct: null,
    });
    expect(result.system).toBeNull();
    expect(result.note).toContain("입학 연도가 없어");
  });

  test("입학 연도가 없으면 등급 체계 null 과 함께 안내를 앞에 붙인다", () => {
    const result = buildGradeInputs({
      profile: null,
      naesinScores: naesin,
      direct: null,
    });
    expect(result.system).toBeNull();
    expect(result.note).toBe("입학 연도가 없어 등급 체계를 정하지 못했습니다");

    const empty = buildGradeInputs({
      profile: null,
      naesinScores: null,
      direct: null,
    });
    expect(empty.note).toBe(
      "입학 연도가 없어 등급 체계를 정하지 못했습니다. 성적을 입력하지 않아 성적 진단은 자료 없음으로 둡니다",
    );
  });
});

describe("uploadQuotaLeft (No.42)", () => {
  const up = (
    id: string,
    extraction_status: UploadStatus,
    grade_label: "고1" | "고2" | null = "고1",
    semester: 1 | 2 | null = 1,
  ) => ({ id, grade_label, semester, extraction_status });

  test("학기당 상한은 10건이다", () => {
    expect(UPLOAD_LIMIT_PER_SEMESTER).toBe(10);
  });

  test("같은 학기의 failed 를 뺀 건수만큼 상한에서 줄어든다", () => {
    const uploads = [
      up("1", "ok"),
      up("2", "pending"),
      up("3", "failed"),
      up("4", "ok", "고1", 2),
      up("5", "ok", "고2", 1),
    ];
    expect(uploadQuotaLeft(uploads, "고1", 1)).toBe(8);
  });

  test("상한을 넘으면 0 이다", () => {
    const uploads = Array.from({ length: 12 }, (_, i) => up(String(i), "ok"));
    expect(uploadQuotaLeft(uploads, "고1", 1)).toBe(0);
    expect(uploadQuotaLeft(uploads, "고1", 1, 20)).toBe(8);
  });
});

describe("buildCollectSummary", () => {
  const base = {
    current: undefined,
    thresholds: { enough: 2 },
    profile: { admission_year: 2025, grade: 2, semester: 1 },
    naesinScores: null,
    directGrades: null,
    uploads: [],
  };

  test("planned 를 뺀 활동으로 출처, 교과군, 학기, 1학년 충분도를 모은다", () => {
    const rows = [
      row({
        id: "a",
        source_program: "performance",
        grade_label: "고1",
        semester: 1,
      }),
      row({
        id: "b",
        source_program: "self",
        grade_label: "고1",
        semester: 2,
        subject_group: "창체",
      }),
      row({ id: "c", status: "planned", grade_label: "고2", semester: 1 }),
    ];
    const s = buildCollectSummary({ ...base, track: "고2", rows });
    expect(s.analysisActivityIds).toEqual(["a", "b"]);
    expect(s.bySource.total).toBe(2);
    expect(s.byGroup).toEqual({
      curricular: 1,
      extracurricular: 1,
      unclassified: 0,
    });
    expect(s.semesters.map((r) => r.key)).toEqual([
      "고1-1",
      "고1-2",
      "고2-1",
      "고2-2",
    ]);
    expect(s.firstYear).toEqual({ count: 2, level: "enough", label: "있음" });
    expect(s.range.semesters).toHaveLength(4);
    expect(s.omitted.ids).toEqual([]);
    expect(s.monthlyPlan).toBe(false);
    expect(s.gradeInputs.system).toBe("five");
  });

  test("profile 이 null 이면 등급 체계 null 과 안내 경로로 요약을 만든다", () => {
    const s = buildCollectSummary({
      ...base,
      profile: null,
      track: "고2",
      rows: [],
    });
    expect(s.gradeInputs.system).toBeNull();
    expect(s.gradeInputs.note).toContain("입학 연도가 없어");
  });

  test("1학년 활동이 0건이면 omitted 에 3-2 가 들어간다(No.51)", () => {
    const rows = [row({ id: "a", grade_label: "고2", semester: 1 })];
    const s = buildCollectSummary({ ...base, track: "고2", rows });
    expect(s.omitted.ids).toContain("3-2");
  });

  test("추출 대기와 처리 중인 업로드 건수를 센다", () => {
    const u = (
      id: string,
      extraction_status: "pending" | "processing" | "ok" | "failed",
    ) => ({
      id,
      file_name: `${id}.pdf`,
      grade_label: "고1" as const,
      semester: 1 as const,
      extraction_status,
    });
    const s = buildCollectSummary({
      ...base,
      track: "고2",
      rows: [],
      uploads: [
        u("u1", "pending"),
        u("u2", "ok"),
        u("u3", "failed"),
        u("u4", "processing"),
      ],
    });
    expect(s.uploadsPending).toBe(2);
  });

  test("파일 목록과 학기별 남은 업로드 수를 분석 범위 학기만 담는다", () => {
    const s = buildCollectSummary({
      ...base,
      track: "고2",
      rows: [],
      uploads: [
        {
          id: "u1",
          file_name: "a.pdf",
          grade_label: "고1",
          semester: 1,
          extraction_status: "ok",
        },
        {
          id: "u2",
          file_name: "b.pdf",
          grade_label: "고1",
          semester: 1,
          extraction_status: "failed",
        },
        {
          id: "u3",
          file_name: "c.pdf",
          grade_label: "고3",
          semester: 1,
          extraction_status: "ok",
        },
      ],
    });
    expect(s.uploads).toEqual([
      {
        id: "u1",
        fileName: "a.pdf",
        gradeLabel: "고1",
        semester: 1,
        status: "ok",
      },
      {
        id: "u2",
        fileName: "b.pdf",
        gradeLabel: "고1",
        semester: 1,
        status: "failed",
      },
      {
        id: "u3",
        fileName: "c.pdf",
        gradeLabel: "고3",
        semester: 1,
        status: "ok",
      },
    ]);
    expect(s.uploadQuotaBySemester).toEqual({
      "고1-1": 9,
      "고1-2": 10,
      "고2-1": 10,
      "고2-2": 10,
    });
  });

  test("부족 학기가 있으면 시안 문구로 경고한다", () => {
    const rows = [
      row({ id: "a", grade_label: "고1", semester: 1 }),
      row({ id: "b", grade_label: "고1", semester: 1 }),
      row({ id: "c", grade_label: "고1", semester: 2 }),
      row({ id: "d", grade_label: "고1", semester: 2 }),
      row({ id: "e", grade_label: "고2", semester: 1 }),
      row({ id: "f", grade_label: "고2", semester: 1 }),
      row({ id: "g", grade_label: "고2", semester: 2 }),
    ];
    const s = buildCollectSummary({ ...base, track: "고2", rows });
    expect(s.warnings).toEqual([
      "2학년 2학기 자료가 부족해요. 올리지 않아도 진행할 수 있어요.",
    ]);
  });

  test("고3 이면 수시 마감 경고를 덧붙이고 월 단위 계획이 켜진다", () => {
    const s = buildCollectSummary({ ...base, track: "고3", rows: [] });
    expect(s.warnings).toContain("3학년은 기록이 수시 시기에 일찍 마감돼요.");
    expect(s.monthlyPlan).toBe(true);
  });

  test("활동 합계가 0이면 빈 상태 경고를 낸다", () => {
    const s = buildCollectSummary({ ...base, track: "고2", rows: [] });
    expect(s.warnings).toContain(
      "저장된 활동이 없어요. 직접 입력하거나 파일을 올리거나 그대로 리포트를 만들 수 있어요.",
    );
  });
});
