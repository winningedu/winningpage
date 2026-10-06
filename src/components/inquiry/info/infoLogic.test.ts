import { describe, expect, test } from "vitest";
import type {
  AssetView,
  HandoffView,
  RecordCandidate,
  SessionView,
} from "@/lib/inquiry/types";
import * as serverAssets from "../../../../api/_lib/inquiry/assets";
import {
  addAsset,
  decideSubmit,
  filterRecords,
  fromAssetViews,
  growthBannerView,
  initialForm,
  initialPlanItemId,
  interviewAsset,
  localWarnings,
  moveAsset,
  nextKey,
  onelineAsset,
  recordAsset,
  recordPeriod,
  removeAsset,
  subjectChips,
  submitErrorView,
  toAssetInputs,
  toggleRecord,
  validateInfoForm,
  validateOneline,
  warningMessages,
} from "./infoLogic";

function record(overrides: Partial<RecordCandidate> = {}): RecordCandidate {
  return {
    id: "r1",
    sourceProgram: "performance",
    status: "confirmed",
    gradeLabel: "고2",
    semester: 1,
    subjectGroup: "교과",
    subject: "생명과학",
    topic: "항상성 기전 정리",
    concept: "항상성",
    limitation: "교과서 수준",
    confirmedAt: "2026-05-01T00:00:00Z",
    createdAt: "2026-05-01T00:00:00Z",
    ...overrides,
  };
}

describe("validateInfoForm", () => {
  const valid = {
    gradeLabel: "고2" as const,
    semester: 2 as const,
    career: "수의예과",
    subject: "생명과학",
  };

  test("모두 채우면 trim 한 값을 돌려준다", () => {
    expect(
      validateInfoForm({
        ...valid,
        career: " 수의예과 ",
        subject: " 생명과학 ",
      }),
    ).toEqual({ ok: true, value: valid });
  });

  test("진로가 비면 필드 안내를 돌려준다(No.147)", () => {
    const result = validateInfoForm({ ...valid, career: "   " });
    expect(result).toEqual({
      ok: false,
      errors: { career: "희망 진로를 적어 주세요." },
    });
  });

  test("과목명이 비면 필드 안내를 돌려준다(No.148)", () => {
    const result = validateInfoForm({ ...valid, subject: "" });
    expect(result).toEqual({
      ok: false,
      errors: { subject: "과목명을 적어 주세요." },
    });
  });

  test("80자를 넘으면 안내한다", () => {
    const result = validateInfoForm({ ...valid, career: "가".repeat(81) });
    expect(result).toEqual({
      ok: false,
      errors: { career: "80자 안으로 적어 주세요." },
    });
    expect(validateInfoForm({ ...valid, career: "가".repeat(80) }).ok).toBe(
      true,
    );
  });

  test("학년, 학기가 비면 각각 안내하고 여러 오류를 한꺼번에 돌려준다", () => {
    const result = validateInfoForm({
      gradeLabel: null,
      semester: null,
      career: "",
      subject: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual([
        "career",
        "gradeLabel",
        "semester",
        "subject",
      ]);
    }
  });
});

function session(overrides: Partial<SessionView> = {}): SessionView {
  return {
    id: "s1",
    status: "draft",
    currentStep: 1,
    gradeLabel: "고2",
    semester: 2,
    career: "수의예과",
    subject: "생명과학",
    growthReportId: null,
    planItemId: null,
    replyPending: false,
    selectedTopicId: null,
    designReportId: null,
    latestEvaluationId: null,
    finalReportId: null,
    topicRoundCount: 0,
    evaluationCount: 0,
    generation: {
      modes: {
        topic_recommendation: {
          status: "pending",
          attempts: 0,
          startedAt: null,
          finishedAt: null,
          issues: [],
        },
        design_report: {
          status: "pending",
          attempts: 0,
          startedAt: null,
          finishedAt: null,
          issues: [],
        },
        evaluation_report: {
          status: "pending",
          attempts: 0,
          startedAt: null,
          finishedAt: null,
          issues: [],
        },
      },
      terminal: null,
    },
    lastActivityAt: "2026-10-06T00:00:00Z",
    completedAt: null,
    ...overrides,
  };
}

describe("initialForm", () => {
  test("세션 값이 프로필 값보다 먼저다", () => {
    expect(
      initialForm({
        session: session({ gradeLabel: "고3", career: "교사" }),
        profile: { gradeLabel: "고1", semester: 1, career: "의사" },
      }),
    ).toEqual({
      gradeLabel: "고3",
      semester: 2,
      career: "교사",
      subject: "생명과학",
    });
  });

  test("세션이 없으면 프로필 값을 쓰고 과목명은 비운다", () => {
    expect(
      initialForm({
        session: null,
        profile: { gradeLabel: "고1", semester: 1, career: "의사" },
      }),
    ).toEqual({ gradeLabel: "고1", semester: 1, career: "의사", subject: "" });
  });

  test("둘 다 없으면 전부 비어 있다", () => {
    expect(initialForm({ session: null, profile: null })).toEqual({
      gradeLabel: null,
      semester: null,
      career: "",
      subject: "",
    });
  });
});

describe("자산 목록 조작", () => {
  test("recordAsset 은 기록 id 로 입력을 만들고 신뢰도 A 와 주제 요약을 가진다", () => {
    expect(recordAsset(record())).toEqual({
      key: "record:r1",
      input: { kind: "record", activityRecordId: "r1" },
      reliability: "A",
      summary: "항상성 기전 정리",
    });
  });

  test("주제가 없는 기록은 요약이 빈 문자열이다", () => {
    expect(recordAsset(record({ topic: null })).summary).toBe("");
  });

  test("onelineAsset 은 trim 한 문장과 신뢰도 C 를 가진다", () => {
    expect(onelineAsset("  여름철 산책 판단  ", "oneline:1")).toEqual({
      key: "oneline:1",
      input: { kind: "oneline", text: "여름철 산책 판단" },
      reliability: "C",
      summary: "여름철 산책 판단",
    });
  });

  test("interviewAsset 은 1번 답을 요약으로 하고 신뢰도 B 를 가진다", () => {
    const asset = interviewAsset({ q1: "수질 조사" }, ["빈틈"], "interview:1");
    expect(asset).toEqual({
      key: "interview:1",
      input: {
        kind: "interview",
        answers: { q1: "수질 조사" },
        gaps: ["빈틈"],
      },
      reliability: "B",
      summary: "수질 조사",
    });
  });

  test("validateOneline 은 빈 값과 200자 초과를 막는다", () => {
    expect(validateOneline("   ")).toBe("주제를 한 줄 적어 주세요.");
    expect(validateOneline("가".repeat(201))).toBe("200자 안으로 적어 주세요.");
    expect(validateOneline("가".repeat(200))).toBeNull();
  });

  test("addAsset 은 끝에 붙이고 같은 기록은 두 번 넣지 않는다", () => {
    const a = recordAsset(record());
    const b = onelineAsset("한 줄", "oneline:1");
    expect(addAsset([a], b).map((x) => x.key)).toEqual([
      "record:r1",
      "oneline:1",
    ]);
    expect(addAsset([a], a)).toEqual([a]);
  });

  test("removeAsset 은 key 로 지운다", () => {
    const a = recordAsset(record());
    const b = onelineAsset("한 줄", "oneline:1");
    expect(removeAsset([a, b], "record:r1")).toEqual([b]);
  });

  test("moveAsset 은 위아래로 옮기고 끝에서는 그대로다", () => {
    const a = recordAsset(record());
    const b = onelineAsset("한 줄", "oneline:1");
    const c = onelineAsset("둘째", "oneline:2");
    expect(moveAsset([a, b, c], "oneline:2", "up").map((x) => x.key)).toEqual([
      "record:r1",
      "oneline:2",
      "oneline:1",
    ]);
    expect(moveAsset([a, b, c], "record:r1", "up")).toEqual([a, b, c]);
    expect(moveAsset([a, b, c], "oneline:2", "down")).toEqual([a, b, c]);
    expect(moveAsset([a, b, c], "record:r1", "down").map((x) => x.key)).toEqual(
      ["oneline:1", "record:r1", "oneline:2"],
    );
  });

  test("toggleRecord 는 없으면 넣고 있으면 뺀다", () => {
    const list = toggleRecord([], record());
    expect(list.map((x) => x.key)).toEqual(["record:r1"]);
    expect(toggleRecord(list, record())).toEqual([]);
  });

  test("nextKey 는 같은 접두어에서 겹치지 않는 key 를 만든다", () => {
    const list = [
      onelineAsset("a", "oneline:1"),
      onelineAsset("b", "oneline:3"),
    ];
    expect(nextKey(list, "oneline")).toBe("oneline:4");
    expect(nextKey([], "interview")).toBe("interview:1");
  });

  test("toAssetInputs 는 순서대로 입력만 뽑는다(첫 번째가 출발 활동)", () => {
    const a = recordAsset(record());
    const b = onelineAsset("한 줄", "oneline:1");
    expect(toAssetInputs([a, b])).toEqual([a.input, b.input]);
  });
});

describe("fromAssetViews(재진입 복원)", () => {
  const views: AssetView[] = [
    {
      id: "a2",
      kind: "oneline",
      reliability: "C",
      position: 1,
      activityRecordId: null,
      interviewAnswers: null,
      gaps: [],
      onelineText: "한 줄",
      summary: "한 줄",
    },
    {
      id: "a1",
      kind: "record",
      reliability: "A",
      position: 0,
      activityRecordId: "r1",
      interviewAnswers: null,
      gaps: [],
      onelineText: null,
      summary: "항상성 기전 정리",
    },
    {
      id: "a3",
      kind: "interview",
      reliability: "B",
      position: 2,
      activityRecordId: null,
      interviewAnswers: { q1: "수질 조사" },
      gaps: ["빈틈"],
      onelineText: null,
      summary: "수질 조사",
    },
  ];

  test("position 순으로 AssetInput 을 되돌린다", () => {
    expect(toAssetInputs(fromAssetViews(views))).toEqual([
      { kind: "record", activityRecordId: "r1" },
      { kind: "oneline", text: "한 줄" },
      {
        kind: "interview",
        answers: { q1: "수질 조사" },
        gaps: ["빈틈"],
      },
    ]);
  });

  test("복원한 자산의 요약과 신뢰도를 유지하고 key 가 서로 다르다", () => {
    const list = fromAssetViews(views);
    expect(list.map((x) => x.reliability)).toEqual(["A", "C", "B"]);
    expect(list[0]?.summary).toBe("항상성 기전 정리");
    expect(new Set(list.map((x) => x.key)).size).toBe(3);
  });

  test("필수 값이 빠진 행은 건너뛴다", () => {
    const broken: AssetView[] = [
      { ...(views[1] as AssetView), activityRecordId: null },
      { ...(views[0] as AssetView), onelineText: null },
      { ...(views[2] as AssetView), interviewAnswers: null },
    ];
    expect(fromAssetViews(broken)).toEqual([]);
  });
});

describe("과목 버튼과 필터", () => {
  test("subjectChips 는 전체 칩을 맨 앞에 두고 건수를 붙인다", () => {
    expect(
      subjectChips([
        { subject: "진로활동", count: 2 },
        { subject: "생명과학1", count: 1 },
      ]),
    ).toEqual([
      { value: null, label: "전체" },
      { value: "진로활동", label: "진로활동 2" },
      { value: "생명과학1", label: "생명과학1 1" },
    ]);
  });

  test("기록이 없으면 전체 칩만 있다", () => {
    expect(subjectChips([])).toEqual([{ value: null, label: "전체" }]);
  });

  const list = [
    record({ id: "r1", subject: "생명과학" }),
    record({ id: "r2", subject: "진로활동" }),
    record({ id: "r3", subject: null }),
  ];

  test("filterRecords 는 null 이면 전부, 과목이면 그 과목만 남긴다", () => {
    expect(filterRecords(list, null)).toHaveLength(3);
    expect(filterRecords(list, "진로활동").map((r) => r.id)).toEqual(["r2"]);
  });

  test("과목이 없는 기록은 미분류 칩에 속한다", () => {
    expect(filterRecords(list, "미분류").map((r) => r.id)).toEqual(["r3"]);
  });
});

describe("경고", () => {
  const records = [
    record({ id: "r1", subjectGroup: "교과" }),
    record({ id: "r2", subjectGroup: "진로", concept: null, limitation: " " }),
  ];

  test("서버 assetWarnings 와 같은 코드를 만든다", () => {
    const cases = [["r1"], ["r2"], ["r1", "r2"], []];
    for (const ids of cases) {
      const assets = ids.map((id) => {
        const found = records.find((r) => r.id === id) as RecordCandidate;
        return recordAsset(found);
      });
      expect(localWarnings(assets, records)).toEqual(
        serverAssets.assetWarnings(toAssetInputs(assets), records),
      );
    }
  });

  test("교과가 아닌 기록만 고르면 NO_SUBJECT_ASSET 과 LINK_MATERIAL_LACKING 이 함께 나온다", () => {
    expect(
      localWarnings([recordAsset(records[1] as RecordCandidate)], records),
    ).toEqual(["NO_SUBJECT_ASSET", "LINK_MATERIAL_LACKING"]);
  });

  test("warningMessages 는 코드를 문장으로 바꾸고 모르는 코드는 버린다", () => {
    const messages = warningMessages([
      "NO_SUBJECT_ASSET",
      "LINK_MATERIAL_LACKING",
      "UNKNOWN",
    ]);
    expect(messages).toEqual([
      "고른 활동에 교과 활동이 없어요. 교과 심화탐구는 교과 활동에서 출발할 때 가장 잘 이어져요. 그대로 진행할 수도 있어요.",
      "고른 활동에 개념과 한계가 비어 있어 연계 재료가 부족해요. 주제가 덜 구체적일 수 있어요.",
    ]);
  });
});

function handoff(overrides: Partial<HandoffView> = {}): HandoffView {
  return {
    reportId: "g1",
    issuedAt: "2026-09-14T03:00:00Z",
    theme: "남이 준 자료를 쓰는 사람에서 직접 검증하는 사람으로",
    subthemes: [
      { grade: "고1", stage: "seed", text: "관심을 찾는다" },
      { grade: "고2", stage: "flower", text: "과목에서 진로로" },
    ],
    stage: "flower",
    weakAxes: [],
    signals: null,
    planItems: [
      {
        id: "p1",
        title: "생명과학 탐구",
        description: null,
        category: null,
        axis: null,
      },
      {
        id: "p2",
        title: "화학 탐구",
        description: null,
        category: null,
        axis: null,
      },
    ],
    stale: false,
    stageMismatch: false,
    autoSelectedPlanItemId: "p1",
    ...overrides,
  };
}

describe("growthBannerView", () => {
  test("연동 값이 없으면 null 이다", () => {
    expect(growthBannerView(null)).toBeNull();
  });

  test("대주제, 단계 라벨, 소주제 칩, 발행일을 만든다", () => {
    expect(growthBannerView(handoff())).toEqual({
      theme: "남이 준 자료를 쓰는 사람에서 직접 검증하는 사람으로",
      stageLabel: "꽃",
      chips: ["고1 관심을 찾는다", "고2 과목에서 진로로"],
      issuedLabel: "2026.09.14",
      notices: [],
    });
  });

  test("값이 없는 줄은 만들지 않는다", () => {
    const view = growthBannerView(
      handoff({ theme: null, stage: null, subthemes: [] }),
    );
    expect(view).toMatchObject({ theme: null, stageLabel: null, chips: [] });
  });

  test("오래된 리포트와 단계 불일치는 안내를 붙인다", () => {
    const view = growthBannerView(
      handoff({ stale: true, stageMismatch: true }),
    );
    expect(view?.notices).toEqual([
      "성장설계 리포트를 발행한 지 오래됐어요. 최신 상태가 아닐 수 있어요.",
      "리포트의 학년 단계와 이번 세션의 학년이 달라요.",
    ]);
  });
});

describe("initialPlanItemId", () => {
  test("연동 값이 없으면 null 이다", () => {
    expect(
      initialPlanItemId({
        handoff: null,
        session: null,
        storedPlanItemId: "p1",
      }),
    ).toBeNull();
  });

  test("growth:handoff 의 과제가 후보에 있으면 가장 먼저 쓴다", () => {
    expect(
      initialPlanItemId({
        handoff: handoff(),
        session: session({ planItemId: "p1" }),
        storedPlanItemId: "p2",
      }),
    ).toBe("p2");
  });

  test("후보에 없는 저장값은 무시한다", () => {
    expect(
      initialPlanItemId({
        handoff: handoff(),
        session: null,
        storedPlanItemId: "zzz",
      }),
    ).toBe("p1");
  });

  test("세션이 있으면 세션에 저장된 과제를 그대로 쓴다(해제했으면 null)", () => {
    expect(
      initialPlanItemId({
        handoff: handoff(),
        session: session({ planItemId: "p2" }),
        storedPlanItemId: null,
      }),
    ).toBe("p2");
    expect(
      initialPlanItemId({
        handoff: handoff(),
        session: session({ planItemId: null }),
        storedPlanItemId: null,
      }),
    ).toBeNull();
  });

  test("세션이 없으면 자동 선택 과제를 쓴다", () => {
    expect(
      initialPlanItemId({
        handoff: handoff(),
        session: null,
        storedPlanItemId: null,
      }),
    ).toBe("p1");
    expect(
      initialPlanItemId({
        handoff: handoff({ autoSelectedPlanItemId: null }),
        session: null,
        storedPlanItemId: null,
      }),
    ).toBeNull();
  });
});

describe("decideSubmit", () => {
  const info = {
    gradeLabel: "고2" as const,
    semester: 2 as const,
    career: "수의예과",
    subject: "생명과학",
  };

  test("설계 리포트가 있는 세션은 잠겨 있다", () => {
    expect(
      decideSubmit({
        session: session({ designReportId: "d1" }),
        info,
        assetCount: 1,
        emptyConfirmed: false,
      }),
    ).toEqual({ kind: "locked" });
  });

  test("자산이 0건이고 아직 확인하지 않았으면 확인 창을 띄운다", () => {
    expect(
      decideSubmit({
        session: null,
        info,
        assetCount: 0,
        emptyConfirmed: false,
      }),
    ).toEqual({ kind: "confirm-empty" });
  });

  test("확인을 마쳤으면 자산 0건이어도 진행한다", () => {
    expect(
      decideSubmit({
        session: null,
        info,
        assetCount: 0,
        emptyConfirmed: true,
      }),
    ).toEqual({ kind: "proceed", createSession: true });
  });

  test("세션이 없으면 create 를 먼저 부른다", () => {
    expect(
      decideSubmit({
        session: null,
        info,
        assetCount: 2,
        emptyConfirmed: false,
      }),
    ).toEqual({ kind: "proceed", createSession: true });
  });

  test("세션 정보와 같으면 create 를 부르지 않는다", () => {
    expect(
      decideSubmit({
        session: session(),
        info,
        assetCount: 1,
        emptyConfirmed: false,
      }),
    ).toEqual({ kind: "proceed", createSession: false });
  });

  test("정보가 바뀌었으면 create 로 갱신한다", () => {
    for (const changed of [
      { gradeLabel: "고3" as const },
      { semester: 1 as const },
      { career: "교사" },
      { subject: "화학" },
    ]) {
      expect(
        decideSubmit({
          session: session(),
          info: { ...info, ...changed },
          assetCount: 1,
          emptyConfirmed: false,
        }),
      ).toEqual({ kind: "proceed", createSession: true });
    }
  });
});

describe("recordPeriod", () => {
  test("확정일을 우선해 연-월로 보여 준다", () => {
    expect(recordPeriod(record({ confirmedAt: "2026-07-03T00:00:00Z" }))).toBe(
      "2026-07",
    );
  });

  test("확정일이 없으면 생성일을 쓴다", () => {
    expect(
      recordPeriod(
        record({ confirmedAt: null, createdAt: "2026-04-20T00:00:00Z" }),
      ),
    ).toBe("2026-04");
  });

  test("읽을 수 없으면 null 이다", () => {
    expect(
      recordPeriod(record({ confirmedAt: null, createdAt: "?" })),
    ).toBeNull();
  });
});

describe("submitErrorView", () => {
  const error = (status: number, code: string, message = "서버 문구") =>
    ({ kind: "error", status, code, message }) as const;

  test("429 QUOTA_EXHAUSTED 는 이용 횟수 소진 카드다(No.20)", () => {
    expect(submitErrorView(error(429, "QUOTA_EXHAUSTED"))).toEqual({
      kind: "quota",
    });
  });

  test("409 SESSION_LOCKED 는 잠김 안내 문장이다", () => {
    expect(submitErrorView(error(409, "SESSION_LOCKED"))).toEqual({
      kind: "locked",
      text: "설계 리포트를 만든 뒤에는 출발 활동과 정보를 바꿀 수 없어요. 새 세션은 확정 뒤에 시작할 수 있어요",
    });
  });

  test("403 NO_ENTITLEMENT 는 이용권 안내다", () => {
    expect(submitErrorView(error(403, "NO_ENTITLEMENT"))).toEqual({
      kind: "entitlement",
    });
  });

  test("400 은 서버 문구를 그대로 보여 준다", () => {
    expect(
      submitErrorView(error(400, "INVALID_BODY", "값을 확인해 주세요.")),
    ).toEqual({
      kind: "message",
      text: "값을 확인해 주세요.",
    });
  });

  test("타임아웃과 그 밖의 오류는 일반 문구다", () => {
    expect(submitErrorView({ kind: "timeout" })).toMatchObject({
      kind: "message",
    });
    expect(submitErrorView(error(500, "INTERNAL"))).toMatchObject({
      kind: "message",
    });
  });
});
