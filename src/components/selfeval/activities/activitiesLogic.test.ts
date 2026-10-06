import { describe, expect, test } from "vitest";
import type {
  CandidateRow,
  GrowthSnapshot,
  PickListResponse,
} from "@/lib/selfeval/types";
import {
  academicYearOf,
  bannerFromSnapshot,
  deriveRoles,
  filterCandidates,
  formatDotDate,
  initialSelection,
  sourceLabel,
  summarizeResult,
  toggleSelection,
} from "./activitiesLogic";

function row(
  id: string,
  score: number | null,
  over: {
    sameSubject?: boolean;
    unavailable?: string;
    used?: boolean;
    subject?: string;
    grade?: "고1" | "고2" | "고3" | null;
    semester?: 1 | 2 | null;
    source?: "performance" | "deep" | "manual";
    createdAt?: string;
  } = {},
): CandidateRow {
  return {
    activity: {
      id,
      sourceProgram: over.source ?? "performance",
      status: "confirmed",
      gradeLabel: over.grade ?? "고2",
      semester: over.semester ?? 1,
      subjectGroup: null,
      subject: over.subject ?? "수학",
      topic: `주제 ${id}`,
      concept: null,
      method: null,
      result: null,
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: over.createdAt ?? "2026-05-01T00:00:00Z",
    },
    fit:
      score === null
        ? null
        : {
            activityId: id,
            score,
            signals: [
              { key: "same_subject", hit: over.sameSubject ?? false, delta: 0 },
            ],
            reasons: [],
          },
    unavailableReason: over.unavailable ?? null,
    alreadyUsed: over.used ?? false,
    role: null,
  };
}

describe("deriveRoles", () => {
  test("작성 과목 활동이 있으면 그중 최고점이 핵심이고 나머지는 점수순 보조다", () => {
    const rows = [
      row("a", 90),
      row("b", 70, { sameSubject: true }),
      row("c", 80, { sameSubject: true }),
    ];
    expect(deriveRoles(["a", "b", "c"], rows)).toEqual({
      coreId: "c",
      supportIds: ["a", "b"],
      coreMismatch: false,
      tooMany: false,
      usedWarning: false,
    });
  });

  test("작성 과목 활동이 없으면 최고점이 핵심이고 불일치를 알린다", () => {
    const rows = [row("a", 60), row("b", 85)];
    expect(deriveRoles(["a", "b"], rows)).toMatchObject({
      coreId: "b",
      supportIds: ["a"],
      coreMismatch: true,
    });
  });

  test("선택이 없으면 핵심도 없고 불일치도 아니다", () => {
    expect(deriveRoles([], [row("a", 60)])).toEqual({
      coreId: null,
      supportIds: [],
      coreMismatch: false,
      tooMany: false,
      usedWarning: false,
    });
  });

  test("보조가 두 건을 넘으면 점수 높은 두 건만 쓰고 tooMany 를 켠다", () => {
    const rows = [
      row("a", 90, { sameSubject: true }),
      row("b", 50),
      row("c", 60),
      row("d", 70),
    ];
    const r = deriveRoles(["a", "b", "c", "d"], rows);
    expect(r.supportIds).toEqual(["d", "c"]);
    expect(r.tooMany).toBe(true);
  });

  test("이미 쓴 활동이 하나라도 있으면 경고를 켠다", () => {
    const rows = [
      row("a", 90, { sameSubject: true, used: true }),
      row("b", 50),
    ];
    expect(deriveRoles(["a", "b"], rows).usedWarning).toBe(true);
  });

  test("사용할 수 없는 활동은 역할 계산에서 뺀다", () => {
    const rows = [row("a", null, { unavailable: "계획" }), row("b", 50)];
    expect(deriveRoles(["a", "b"], rows)).toMatchObject({
      coreId: "b",
      supportIds: [],
    });
  });
});

describe("toggleSelection", () => {
  const rows = [
    row("a", 90),
    row("b", 80),
    row("c", 70),
    row("d", 60),
    row("u", null, {
      unavailable: "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
    }),
  ];

  test("선택하지 않은 활동을 누르면 더하고 다시 누르면 뺀다", () => {
    expect(toggleSelection([], "a", rows)).toEqual({
      next: ["a"],
      notice: null,
    });
    expect(toggleSelection(["a"], "a", rows)).toEqual({
      next: [],
      notice: null,
    });
  });

  test("사용할 수 없는 활동은 선택하지 않고 이유를 안내한다", () => {
    expect(toggleSelection(["a"], "u", rows)).toEqual({
      next: ["a"],
      notice: "아직 수행하지 않은 계획이라 재료로 쓸 수 없어요",
    });
  });

  test("핵심 1건과 보조 2건, 세 건을 넘기면 더하지 않고 안내한다", () => {
    const r = toggleSelection(["a", "b", "c"], "d", rows);
    expect(r.next).toEqual(["a", "b", "c"]);
    expect(r.notice).toContain("3건");
  });
});

describe("initialSelection", () => {
  const base = {
    selection: null,
    auto: null,
  } as Pick<PickListResponse, "selection" | "auto">;

  test("서버에 저장된 선택이 있으면 그것을 쓴다", () => {
    expect(
      initialSelection({
        ...base,
        selection: { coreId: "a", supportIds: ["b"] },
      }),
    ).toEqual(["a", "b"]);
  });
  test("저장된 선택이 없으면 자동 추천을 쓴다", () => {
    expect(
      initialSelection({
        ...base,
        auto: {
          coreId: "a",
          supportIds: ["b", "c"],
          coreMismatch: false,
          noneAboveThreshold: false,
        },
      }),
    ).toEqual(["a", "b", "c"]);
  });
  test("추천 기준을 넘은 활동이 없으면 비운다", () => {
    expect(
      initialSelection({
        ...base,
        auto: {
          coreId: null,
          supportIds: [],
          coreMismatch: false,
          noneAboveThreshold: true,
        },
      }),
    ).toEqual([]);
    expect(initialSelection(base)).toEqual([]);
  });
});

describe("filterCandidates", () => {
  const rows = [
    row("a", 90, {
      grade: "고1",
      semester: 1,
      subject: "수학",
      source: "performance",
    }),
    row("b", 80, {
      grade: "고2",
      semester: 2,
      subject: "물리",
      source: "deep",
    }),
    row("c", 70, {
      grade: "고2",
      semester: 1,
      subject: "수학",
      source: "manual",
    }),
  ];
  const ids = (f: Parameters<typeof filterCandidates>[1]) =>
    filterCandidates(rows, f).map((r) => r.activity.id);

  test("필터가 비어 있으면 전부 돌려준다", () => {
    expect(ids({})).toEqual(["a", "b", "c"]);
  });
  test("학년, 학기, 과목, 출처를 함께 적용한다", () => {
    expect(ids({ gradeLabel: "고2" })).toEqual(["b", "c"]);
    expect(ids({ gradeLabel: "고2", semester: 1 })).toEqual(["c"]);
    expect(ids({ subject: "수학" })).toEqual(["a", "c"]);
    expect(ids({ source: "deep" })).toEqual(["b"]);
  });
});

describe("academicYearOf", () => {
  test("3월부터 새 학년도다", () => {
    expect(academicYearOf("2026-03-01T00:00:00+09:00")).toBe(2026);
    expect(academicYearOf("2026-02-20T00:00:00+09:00")).toBe(2025);
  });
  test("해석할 수 없으면 null", () => {
    expect(academicYearOf("nope")).toBeNull();
  });
});

describe("summarizeResult", () => {
  test("결과 앞부분만 잘라 말줄임을 붙이고 비면 null", () => {
    expect(summarizeResult("가".repeat(100), 10)).toBe(`${"가".repeat(10)}...`);
    expect(summarizeResult("짧아요", 10)).toBe("짧아요");
    expect(summarizeResult("  ", 10)).toBeNull();
    expect(summarizeResult(null, 10)).toBeNull();
  });
});

describe("formatDotDate", () => {
  test("한국 시각 기준 YYYY.MM.DD 로 만들고 해석할 수 없으면 null", () => {
    expect(formatDotDate("2026-09-16T00:00:00+09:00")).toBe("2026.09.16");
    expect(formatDotDate("2026-09-15T16:00:00Z")).toBe("2026.09.16");
    expect(formatDotDate("nope")).toBeNull();
  });
});

describe("sourceLabel", () => {
  test("출처 코드를 학생이 읽는 이름으로 바꾼다", () => {
    expect(sourceLabel("performance")).toBe("위닝 수행평가");
    expect(sourceLabel("deep")).toBe("위닝 심화탐구");
    expect(sourceLabel("manual")).toBe("직접 입력");
    expect(sourceLabel("upload")).toBe("업로드");
    expect(sourceLabel("self")).toBe("위닝 자기평가서");
  });
});

describe("bannerFromSnapshot", () => {
  const snapshot = {
    reportId: "r1",
    issuedAt: "2026-09-14T00:00:00Z",
    narrativeTheme: "대주제",
    gradeSubthemes: [
      { grade: "고1", stage: "seed", text: "1학년 소주제" },
      { grade: "고2", stage: "flower", text: "2학년 소주제" },
    ],
    stage: "flower",
    weakAxes: [
      { axis: "A", name: "탐구 깊이", count: 1, required: 2, guideline: "g" },
    ],
    alignedSignals: [],
    conflictingSignals: [],
    planItems: [],
  } as GrowthSnapshot;

  test("현재 학년 소주제와 단계 이름, 부족 축 이름을 배너 값으로 만든다", () => {
    expect(bannerFromSnapshot(snapshot, "고2")).toEqual({
      theme: "대주제",
      stageLabel: "꽃",
      currentSubtheme: "2학년 소주제",
      weakAxisNames: ["탐구 깊이"],
      issuedAt: "2026-09-14T00:00:00Z",
    });
  });

  test("학년을 모르면 단계가 같은 소주제를 쓰고 단계가 없으면 단계 이름은 null 이다", () => {
    expect(bannerFromSnapshot(snapshot, null).currentSubtheme).toBe(
      "2학년 소주제",
    );
    const noStage = { ...snapshot, stage: null };
    expect(bannerFromSnapshot(noStage, null)).toMatchObject({
      stageLabel: null,
      currentSubtheme: "2학년 소주제",
    });
  });
});
