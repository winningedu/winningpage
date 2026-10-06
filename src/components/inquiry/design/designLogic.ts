// 설계 리포트 화면의 순수 로직(절 묶음, 개요 표 행, 체크리스트 행). 계약: 계획서 부록 A DesignView.
import { FIT_LABELS } from "@/lib/inquiry/labels";
import type { DesignView, SectionGroup, SectionId } from "@/lib/inquiry/types";

export const GROUP_LABELS: Record<SectionGroup, string> = {
  intro: "서론",
  body: "본론",
  conclusion: "결론",
};

const GROUP_ORDER: readonly SectionGroup[] = ["intro", "body", "conclusion"];

/** 자료 출처표 아래 안내(No.157, 158). 1차는 검증된 자료 DB 가 없어 항상 빈 표다. */
export const SOURCE_TABLE_NOTE =
  "검증된 자료 후보가 없어 빈 표예요. 아래 검색 계획으로 직접 확인해요";

/** 평가 기준 미리 보기 산식 문구(No.82). */
export const SCORE_FORMULA =
  "항목 점수 = 배점 × 수준(0~4) ÷ 4. 서비스 내부 기준이에요";

export const GUIDANCE_ONLY_META = "작성 지침, 점수 미반영";

export function lengthText(recommendedChars: number | null): string {
  return recommendedChars === null
    ? "분량 제한 없음"
    : `권장 ${recommendedChars}자 이상`;
}

export type SectionCard = {
  id: SectionId;
  numeral: string;
  title: string;
  length: string;
  role: string;
  must: string[];
  avoid: string[];
  tip: string;
};

export type SectionCardGroup = {
  group: SectionGroup;
  label: string;
  cards: SectionCard[];
};

/** 8절을 서론, 본론, 결론으로 묶고 절 메타(번호, 제목, 권장 분량)를 붙인다. */
export function groupSectionCards(design: DesignView): SectionCardGroup[] {
  const cards = design.sections.flatMap((plan) => {
    const meta = design.lengths.find((l) => l.id === plan.id);
    if (!meta) return [];
    return [
      {
        group: meta.group,
        card: {
          id: plan.id,
          numeral: meta.numeral,
          title: meta.title,
          length: lengthText(meta.recommendedChars),
          role: plan.role,
          must: plan.must,
          avoid: plan.avoid,
          tip: plan.tip,
        } satisfies SectionCard,
      },
    ];
  });
  return GROUP_ORDER.map((group) => ({
    group,
    label: GROUP_LABELS[group],
    cards: cards.filter((c) => c.group === group).map((c) => c.card),
  })).filter((g) => g.cards.length > 0);
}

export type OverviewRow = {
  label: string;
  value: string;
  /** 값 옆 배지(학년 단계 적합도). */
  badge?: string;
  /** 값 아래 보조 줄. 어긋남일 때 이유. */
  extra?: { label: string; value: string } | null;
};

/** 탐구 개요 표 행(No.57, 58, 110, 154). 영역 행은 없다. */
export function buildOverviewRows(design: DesignView): OverviewRow[] {
  const o = design.overview;
  const start = o.startGap
    ? `${o.startActivity} / 확인하지 않고 넘어간 것: ${o.startGap}`
    : o.startActivity;
  const rows: OverviewRow[] = [
    { label: "주제", value: `${o.topicTitle} / ${o.subtitle}` },
    { label: "연계 유형", value: o.linkKindLabel },
    { label: "출발 활동", value: start },
    { label: "탐구 질문", value: o.question },
    { label: "가설 1", value: o.hypothesis1 },
    { label: "가설 2", value: o.hypothesis2 },
    {
      label: "학년 단계",
      value: o.stageLabel,
      badge: o.fitLabel || FIT_LABELS[o.fit],
      extra:
        o.fit === "off" && o.fitReason
          ? { label: "어긋나는 이유", value: o.fitReason }
          : null,
    },
  ];
  if (o.planItemTitle) {
    rows.push({ label: "성장설계 과제", value: o.planItemTitle });
  }
  return rows;
}

export type ChecklistRow = {
  no: number;
  text: string;
  /** 평가 항목명과 절. 진로 연결은 작성 지침 표시. */
  meta: string;
  guidanceOnly: boolean;
};

/** 작성 체크리스트 13 행(No.66). 번호는 1부터. */
export function buildChecklistRows(design: DesignView): ChecklistRow[] {
  return design.checklist.map((item, i) => {
    const numeral =
      design.lengths.find((l) => l.id === item.section)?.numeral ??
      item.section;
    const rubricLabel = design.rubricPreview.find(
      (r) => r.id === item.rubric,
    )?.label;
    const head =
      item.guidanceOnly || !rubricLabel ? GUIDANCE_ONLY_META : rubricLabel;
    return {
      no: i + 1,
      text: item.text,
      meta: `${head}, ${numeral}절`,
      guidanceOnly: item.guidanceOnly,
    };
  });
}
