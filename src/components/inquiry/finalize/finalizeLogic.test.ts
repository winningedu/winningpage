import { describe, expect, test } from "vitest";
import type { FinalizePreview } from "@/lib/inquiry/types";
import {
  blankTextKeys,
  buildSummaryRows,
  canSubmit,
  initFormState,
  missingLabels,
  toRequestFields,
} from "./finalizeLogic";

function preview(over: Partial<FinalizePreview> = {}): FinalizePreview {
  return {
    summary: {
      topic: "축종별 스트레스지수 기준은 실제 폭염 피해와 일치하는가",
      subject: "생명과학",
      linkage: "여름철 팬팅 탐구 (비판형)",
      concepts: ["온습도지수", "폐사율"],
      limitation: "표본이 적어요",
      score: 91.3,
      label: "ready_with_minor_edits",
      planItemTitle: null,
    },
    fields: {
      topic: "주제",
      concept: "개념",
      method: "방법",
      result: "결과",
      limitation: "한계",
      numbers: ["폐사율 3.2%", "표본 12건"],
      sources: ["기상청 자료"],
    },
    missing: [],
    ...over,
  };
}

describe("buildSummaryRows", () => {
  test("6항목을 순서대로 만든다", () => {
    const rows = buildSummaryRows(preview());
    expect(rows.map((r) => r.label)).toEqual([
      "주제",
      "영역",
      "연계",
      "사용 개념",
      "이번에 남은 한계",
      "평가 점수",
    ]);
    expect(rows[1]?.value).toBe("교과, 생명과학");
    expect(rows[3]?.value).toBe("온습도지수, 폐사율");
    expect(rows[5]?.value).toBe("내부 기준 91.3점");
    expect(rows[5]?.badge).toBe("소규모 보완 후 제출 가능");
  });

  test("한계가 비면 빨간 추출 실패 문구", () => {
    const rows = buildSummaryRows(
      preview({
        summary: { ...preview().summary, limitation: "" },
      }),
    );
    const row = rows[4];
    expect(row?.value).toBe("추출하지 못했어요. Ⅵ 한계 절이 비어 있어요");
    expect(row?.error).toBe(true);
  });

  test("성장설계 과제가 있을 때만 회신 행을 더한다", () => {
    expect(buildSummaryRows(preview())).toHaveLength(6);
    const rows = buildSummaryRows(
      preview({
        summary: { ...preview().summary, planItemTitle: "공개 데이터 결합" },
      }),
    );
    expect(rows).toHaveLength(7);
    expect(rows[6]).toMatchObject({
      label: "성장설계 회신",
      value: "실행계획 과제 '공개 데이터 결합': 확정하면 완료로 알려요",
    });
  });
});

describe("폼 상태", () => {
  test("초기값은 추출값이고 여러 줄 항목은 줄바꿈으로 합친다", () => {
    const form = initFormState(preview());
    expect(form.topic).toBe("주제");
    expect(form.numbers).toBe("폐사율 3.2%\n표본 12건");
    expect(form.sources).toBe("기상청 자료");
  });

  test("텍스트 5개 중 비었거나 공백뿐인 키를 돌려준다", () => {
    const form = { ...initFormState(preview()), limitation: "  ", method: "" };
    expect(blankTextKeys(form)).toEqual(["method", "limitation"]);
    expect(canSubmit(form)).toBe(false);
  });

  test("수치와 자료명이 비어도 제출할 수 있다", () => {
    const form = { ...initFormState(preview()), numbers: "", sources: "" };
    expect(canSubmit(form)).toBe(true);
  });

  test("제출 바디는 trim 하고 줄 단위로 배열을 만들며 빈 줄을 버린다", () => {
    const form = {
      ...initFormState(preview()),
      topic: "  새 주제  ",
      numbers: "3.2%\n\n  7건  \n",
      sources: "A\nB",
    };
    expect(toRequestFields(form)).toEqual({
      topic: "새 주제",
      concept: "개념",
      method: "방법",
      result: "결과",
      limitation: "한계",
      numbers: ["3.2%", "7건"],
      sources: ["A", "B"],
    });
  });
});

describe("missingLabels", () => {
  test("서버가 돌려준 키를 화면 이름으로 바꾸고 모르는 키는 버린다", () => {
    expect(missingLabels(["limitation", "method", "zzz", 3])).toEqual([
      "한계",
      "방법",
    ]);
    expect(missingLabels(undefined)).toEqual([]);
  });
});
