import { describe, expect, test } from "vitest";
import { makeDesign } from "./designFixture";
import {
  buildChecklistRows,
  buildOverviewRows,
  groupSectionCards,
  lengthText,
  SCORE_FORMULA,
  SOURCE_TABLE_NOTE,
} from "./designLogic";

describe("groupSectionCards", () => {
  test("8절을 서론 2, 본론 3, 결론 3 묶음으로 나눈다", () => {
    const groups = groupSectionCards(makeDesign());
    expect(groups.map((g) => [g.label, g.cards.length])).toEqual([
      ["서론", 2],
      ["본론", 3],
      ["결론", 3],
    ]);
  });

  test("카드에 번호, 제목, 권장 분량, 역할이 붙는다", () => {
    const card = groupSectionCards(makeDesign())[0]?.cards[0];
    expect(card).toMatchObject({
      id: "I",
      numeral: "Ⅰ",
      title: "탐구 동기",
      length: "권장 300자 이상",
      role: "I절의 역할",
      tip: "I 작성 요령",
    });
    expect(card?.must).toEqual(["I 필수 1", "I 필수 2"]);
    expect(card?.avoid).toEqual(["I 금지 1"]);
  });
});

describe("lengthText", () => {
  test("권장이 없으면 분량 제한 없음", () => {
    expect(lengthText(null)).toBe("분량 제한 없음");
    expect(lengthText(150)).toBe("권장 150자 이상");
  });
});

describe("buildOverviewRows", () => {
  test("기본 행 순서와 값", () => {
    const rows = buildOverviewRows(makeDesign());
    expect(rows.map((r) => r.label)).toEqual([
      "주제",
      "연계 유형",
      "출발 활동",
      "탐구 질문",
      "가설 1",
      "가설 2",
      "학년 단계",
    ]);
    expect(rows[0]?.value).toBe("폭염과 가축 폐사 / 기상 지표의 예측력");
    expect(rows[1]?.value).toBe("비판형");
    expect(rows[2]?.value).toBe(
      "여름철 산책 판단 기준 탐구 / 확인하지 않고 넘어간 것: 지수가 무엇을 측정하는지 확인하지 않음",
    );
  });

  test("학년 단계 행은 적합도 라벨을 달고 맞음이면 이유 줄이 없다", () => {
    const row = buildOverviewRows(makeDesign()).at(-1);
    expect(row).toMatchObject({
      label: "학년 단계",
      value: "고2 꽃 단계",
      badge: "맞음",
      extra: null,
    });
  });

  test("어긋남이면 어긋나는 이유 줄이 붙는다", () => {
    const d = makeDesign();
    d.overview = {
      ...d.overview,
      fit: "off",
      fitLabel: "어긋남",
      fitReason: "고3 에는 확장형이 부담돼요",
    };
    const row = buildOverviewRows(d).at(-1);
    expect(row?.badge).toBe("어긋남");
    expect(row?.extra).toEqual({
      label: "어긋나는 이유",
      value: "고3 에는 확장형이 부담돼요",
    });
  });

  test("성장설계 과제 행은 있을 때만 붙는다", () => {
    const d = makeDesign();
    d.overview = { ...d.overview, planItemTitle: "데이터 분석 과제" };
    const rows = buildOverviewRows(d);
    expect(rows.at(-1)).toMatchObject({
      label: "성장설계 과제",
      value: "데이터 분석 과제",
    });
  });

  test("출발 활동 빈틈이 비어 있으면 활동만 보인다", () => {
    const d = makeDesign();
    d.overview = { ...d.overview, startGap: "" };
    expect(buildOverviewRows(d)[2]?.value).toBe("여름철 산책 판단 기준 탐구");
  });
});

describe("buildChecklistRows", () => {
  test("번호와 평가 항목명, 절 번호를 붙이고 진로 연결은 점수 미반영 표시", () => {
    const rows = buildChecklistRows(makeDesign());
    expect(rows[0]).toEqual({
      no: 1,
      text: "출발 활동 이름이 나오는가",
      meta: "기존 활동과의 연계 및 탐구 동기, Ⅰ절",
      guidanceOnly: false,
    });
    expect(rows[1]).toEqual({
      no: 2,
      text: "진로 연결을 직무로 쓰는가",
      meta: "작성 지침, 점수 미반영, Ⅴ절",
      guidanceOnly: true,
    });
  });
});

describe("고정 문구", () => {
  test("출처표 안내와 산식", () => {
    expect(SOURCE_TABLE_NOTE).toBe(
      "검증된 자료 후보가 없어 빈 표예요. 아래 검색 계획으로 직접 확인해요",
    );
    expect(SCORE_FORMULA).toBe(
      "항목 점수 = 배점 × 수준(0~4) ÷ 4. 서비스 내부 기준이에요",
    );
  });
});
