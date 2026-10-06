import { describe, expect, it } from "vitest";
import { normalizeSections } from "./reportLogic";
import { normalizeBody } from "./sectionBody";

function view(id: string, format: string, body: unknown, over = {}) {
  const [s] = normalizeSections([
    {
      id,
      title: "t",
      format,
      badge: "fact",
      status: "ok",
      evidence_ids: [],
      body,
      ...over,
    },
  ]);
  if (!s) throw new Error("정규화 결과가 비었어요");
  return normalizeBody(s);
}

describe("normalizeBody", () => {
  it("no_data 항목은 자료 없음과 사유를 돌려준다", () => {
    const b = view(
      "1-12",
      "line",
      { text: "자료 없음", reason: "성적 없음" },
      {
        status: "no_data",
        no_data_reason: "성적 없음",
      },
    );
    expect(b).toEqual({ kind: "empty", reason: "성적 없음" });
  });

  it("깨진 body 는 자료 없음으로 둔다", () => {
    expect(view("1-2", "prose", 42)).toEqual({ kind: "empty", reason: null });
    expect(view("1-4", "bar", { bars: "x" })).toEqual({
      kind: "empty",
      reason: null,
    });
  });

  it("prose 는 문자열과 {text} 둘 다 받고 문단으로 나눈다", () => {
    expect(view("1-2", "prose", { text: "가\n\n나" })).toMatchObject({
      kind: "prose",
      paragraphs: ["가", "나"],
    });
    expect(view("1-2", "prose", "가")).toMatchObject({ paragraphs: ["가"] });
  });

  it("list 는 항목별 근거 수를 센다", () => {
    const b = view("3-11", "list", {
      items: [{ text: "a", evidence_ids: ["x", "y"] }, { text: "b" }, 3],
    });
    expect(b).toEqual({
      kind: "list",
      items: [
        { text: "a", evidenceCount: 2 },
        { text: "b", evidenceCount: 0 },
      ],
    });
  });

  it("label/value 행은 헤더 없는 2열 표가 된다", () => {
    const b = view("1-1", "table", {
      rows: [
        { label: "학교", value: "A고" },
        { label: "진로", value: null },
      ],
    });
    expect(b).toMatchObject({
      kind: "table",
      columns: null,
      rows: [
        ["학교", "A고"],
        ["진로", "자료 없음"],
      ],
    });
  });

  it("그 밖의 행은 알려진 키만 헤더로 쓰고 evidence_ids 는 뺀다", () => {
    const b = view("3-5", "table", {
      rows: [
        {
          subject: "수학",
          direction: "심화",
          record_to_leave: "탐구",
          evidence_ids: ["a"],
        },
      ],
    });
    expect(b).toMatchObject({
      columns: ["과목", "방향", "남길 기록"],
      rows: [["수학", "심화", "탐구"]],
    });
  });

  it("1-13 은 note 를 그대로 싣는다", () => {
    const b = view("1-13", "table", {
      rows: [{ label: "내부 추정 등급", value: "2.15" }],
      note: "참고용이에요.",
    });
    expect(b).toMatchObject({ kind: "table", note: "참고용이에요." });
  });

  it("1-14 는 대학별 입결 비교 행과 판정 라벨을 만든다", () => {
    const b = view("1-14", "table", {
      estimate: 2.15,
      rows: [
        {
          university: "가대 도시공학과",
          latest: 2.31,
          diffText: "0.16 여유",
          status: "within",
        },
        { university: "나대", latest: null, diffText: null, status: "no_data" },
      ],
      note: "입결은 참고 자료예요.",
    });
    expect(b).toMatchObject({
      columns: ["대학", "최근 입결", "차이", "판정"],
      rows: [
        ["가대 도시공학과", "2.31", "0.16 여유", "여유"],
        ["나대", "자료 없음", "자료 없음", "자료 없음"],
      ],
      note: "입결은 참고 자료예요.",
    });
  });

  it("3-10 은 status unreachable 을 표시한다", () => {
    const b = view("3-10", "table", {
      status: "unreachable",
      requiredAverage: 1.9,
      rows: [{ key: "고3-1", target: 1.9, note: null }],
      note: "n",
    });
    expect(b).toMatchObject({
      kind: "table",
      unreachable: true,
      columns: ["시기", "목표", "비고"],
      rows: [["고3-1", "1.9", ""]],
    });
  });

  it("bar 는 label/value 막대를 돌려준다", () => {
    expect(
      view("1-4", "bar", {
        bars: [{ label: "고1", value: 2 }, { label: "x" }],
      }),
    ).toEqual({ kind: "bars", bars: [{ label: "고1", value: 2 }] });
  });

  it("1-12 line 은 점과 판정 정보를 읽는다", () => {
    const b = view("1-12", "line", {
      system: "five",
      points: [
        { key: "고1-1", average: 2.5 },
        { key: "고1-2", average: "x" },
      ],
      actual: 2.3,
      estimate: 2.15,
      verdictLabel: "상승",
      thresholdText: "기준 문장",
    });
    expect(b).toMatchObject({
      kind: "curve",
      points: [{ key: "고1-1", average: 2.5 }],
      actual: 2.3,
      estimate: 2.15,
      verdictLabel: "상승",
      thresholdText: "기준 문장",
      maxGrade: 5,
    });
  });

  it("1-3 활동 지도는 학기별로 묶는다", () => {
    const b = view("1-3", "diagram", {
      nodes: [
        {
          id: "a",
          gradeLabel: "고1",
          semester: 1,
          subjectGroup: "과학",
          topic: "열섬",
        },
        {
          id: "b",
          gradeLabel: "고1",
          semester: 1,
          subjectGroup: null,
          topic: "동아리",
        },
        { id: "c", gradeLabel: null, semester: null, topic: "기타" },
      ],
    });
    expect(b).toMatchObject({
      kind: "activityMap",
      semesters: [
        {
          label: "1학년 1학기",
          nodes: [{ topic: "열섬" }, { topic: "동아리" }],
        },
        { label: "학기 미확인", nodes: [{ topic: "기타" }] },
      ],
    });
  });

  it("1-10 방향 진단은 퍼센트와 계산식과 소표본 여부를 읽는다", () => {
    const b = view(
      "1-10",
      "diagram",
      {
        percent: 50,
        verdictLabel: "갈리는 중",
        criteria: "기준",
        smallSample: true,
        linked: ["a", "b"],
      },
      { formula: "7 / 14" },
    );
    expect(b).toMatchObject({
      kind: "direction",
      percent: 50,
      formula: "7 / 14",
      verdictLabel: "갈리는 중",
      criteria: "기준",
      smallSample: true,
      linkedCount: 2,
    });
  });

  it("3-1 성장 흐름은 대주제와 학년별 단계를 읽는다", () => {
    const b = view("3-1", "diagram", {
      theme: "대주제",
      subthemes: [
        { grade: "고1", stage: "seed", stageLabel: "씨앗", text: "t1" },
      ],
    });
    expect(b).toMatchObject({
      kind: "growthFlow",
      theme: "대주제",
      subthemes: [{ grade: "고1", stageLabel: "씨앗", text: "t1" }],
    });
  });
});
