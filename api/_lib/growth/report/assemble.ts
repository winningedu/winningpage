// 8단계(앱 조립)의 순수 부분. DB 와 시계에 닿지 않는다.

import {
  parentVisibleSections,
  SECTION_REGISTRY,
  type SectionItem,
} from "../sections.js";
import {
  capPlanItems,
  orderPlanPeriods,
  type PlanItem,
  type PlanPeriod,
  type PlanPriority,
} from "../tracks.js";
import type { Axis, Track } from "../types.js";
import { type ValidationIssue, validateStep } from "../validation.js";
import type { PlanItemDraft, ReportContext } from "./types.js";

/** id 로 합친다. 같은 id 는 앱 항목이 이긴다(데이터 섹션은 앱이 정본). 레지스트리 순서, 미등록 id 는 버린다. */
export function mergeSections(
  modelSections: SectionItem[],
  appSections: SectionItem[],
): SectionItem[] {
  const byId = new Map<string, SectionItem>();
  for (const s of modelSections) byId.set(s.id, s);
  for (const s of appSections) byId.set(s.id, s);
  return SECTION_REGISTRY.flatMap((def) => {
    const found = byId.get(def.id);
    return found ? [found] : [];
  });
}

export type AssembleResult =
  | { ok: true; sections: SectionItem[] }
  | { ok: false; sections: SectionItem[]; issues: ValidationIssue[] };

/** 합친 뒤 8단계 검증을 통과시킨다. 실패해도 sections 는 돌려준다(운영 디버그용). */
export function assembleFinal(
  context: ReportContext,
  modelSections: SectionItem[],
  appSections: SectionItem[],
): AssembleResult {
  const sections = mergeSections(modelSections, appSections);
  const result = validateStep(
    8,
    { sections },
    {
      expectedSectionIds: context.expectedSectionIds,
      knownEvidenceIds: context.evidenceIds,
    },
  );
  return result.ok
    ? { ok: true, sections }
    : { ok: false, sections, issues: result.issues };
}

/** growth_plan_items insert 행. done_* 컬럼은 넣지 않는다. */
export type PlanItemRow = {
  report_id: string;
  profile_id: string;
  program: "school" | "self" | "deep";
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  period_label: string | null;
  deadline: string | null;
  status: "pending";
  carried_from_report_id: string | null;
  sort_order: number;
};

/** 이전 회차의 pending 항목. */
export type CarriedItem = {
  id: string;
  report_id: string;
  program: "school" | "self" | "deep";
  title: string;
  description: string | null;
  priority: PlanPriority;
  axis: Axis | null;
  category: string | null;
  period: PlanPeriod;
  period_label: string | null;
  deadline: string | null;
};

type Candidate = PlanItem & { row: Omit<PlanItemRow, "sort_order"> };

const titleKey = (title: string) => title.replace(/\s+/g, "");

/**
 * 이월 항목을 앞에, 새 초안을 뒤에 두고 제목(공백 제거) 중복은 새 초안을 버린다.
 * 시기 묶음으로 정렬한 뒤 required, recommended 3건 상한을 적용하고 sort_order 를 연번으로 매긴다.
 * period_label 은 입력 그대로 둔다(고3 월 라벨은 7단계 모델이 정한다).
 */
export function planRows(
  context: ReportContext,
  planDraft: PlanItemDraft[],
  carried: CarriedItem[],
): PlanItemRow[] {
  const seen = new Set(carried.map((c) => titleKey(c.title)));
  const fromCarried: Candidate[] = carried.map((c) => ({
    id: `carried:${c.id}`,
    period: c.period,
    deadline: c.deadline,
    priority: c.priority,
    row: {
      report_id: context.reportId,
      profile_id: context.profileId,
      program: c.program,
      title: c.title,
      description: c.description,
      priority: c.priority,
      axis: c.axis,
      category: c.category,
      period: c.period,
      period_label: c.period_label,
      deadline: c.deadline,
      status: "pending",
      carried_from_report_id: c.report_id,
    },
  }));
  const fromDraft: Candidate[] = [];
  planDraft.forEach((d, index) => {
    const key = titleKey(d.title);
    if (seen.has(key)) return;
    seen.add(key);
    fromDraft.push({
      id: `draft:${index}`,
      period: d.period,
      deadline: d.deadline,
      priority: d.priority,
      row: {
        report_id: context.reportId,
        profile_id: context.profileId,
        program: d.program,
        title: d.title,
        description: d.description,
        priority: d.priority,
        axis: d.axis,
        category: d.category,
        period: d.period,
        period_label: d.periodLabel,
        deadline: d.deadline,
        status: "pending",
        carried_from_report_id: null,
      },
    });
  });

  const ordered = orderPlanPeriods([...fromCarried, ...fromDraft]);
  const capped = capPlanItems(ordered);
  const kept = new Map<string, Candidate>();
  for (const c of [...capped.required, ...capped.recommended]) {
    kept.set(c.id, c);
  }
  return ordered
    .flatMap((c) => {
      const survivor = kept.get(c.id);
      return survivor ? [survivor] : [];
    })
    .map((c, sortOrder) => ({
      ...c.row,
      priority: c.priority,
      sort_order: sortOrder,
    }));
}

export type ProfileSurveyCopy = {
  profile_id: string;
  track: Track;
  survey_answers: Record<string, unknown>;
  survey_saved_at: string;
};

/** 완료 시 growth_profiles 에 복사할 값. */
export function profileSurveyCopy(context: ReportContext): ProfileSurveyCopy {
  return {
    profile_id: context.profileId,
    track: context.track,
    survey_answers: context.survey,
    survey_saved_at: context.nowIso,
  };
}

export type CompletionPayload = {
  sections: SectionItem[];
  planRows: PlanItemRow[];
  profile: ProfileSurveyCopy;
};

/** 8단계 완료 저장에 필요한 값을 한 덩어리로 묶는다. */
export function completionPayload(
  context: ReportContext,
  sections: SectionItem[],
  planDraft: PlanItemDraft[],
  carried: CarriedItem[],
): CompletionPayload {
  return {
    sections,
    planRows: planRows(context, planDraft, carried),
    profile: profileSurveyCopy(context),
  };
}

/** 학부모 열람용 목록(성적 민감 항목 제외). */
export function parentView(sections: SectionItem[]): {
  items: SectionItem[];
  excludedIds: string[];
} {
  return parentVisibleSections(sections);
}
