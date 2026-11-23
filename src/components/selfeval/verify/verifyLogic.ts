// 검증 결과 화면의 순수 로직(시안 43~51, 명세 No.53~62).
import type { VerificationSections } from "@/lib/selfeval/types";

export function discriminationLabel(discrimination: number | null): string {
  if (discrimination === null) return "판별력 없음";
  return `${discrimination > 0 ? "+" : ""}${discrimination}p`;
}

export type VerificationSummary = {
  total: number;
  promptMissing: boolean;
  submittable: boolean;
  totalChecks: number;
  passChecks: number;
  needChecks: number;
  mandatoryCount: number;
  clicheDensity: number;
  numberCount: number;
  sentenceCount: number;
};

/** 우측 "검증 요약" 카드의 숫자. 확인 문장은 8항목의 checks 전체다. */
export function summarizeVerification(
  sections: VerificationSections,
): VerificationSummary {
  const checks = sections.items.flatMap((i) => i.checks);
  const passChecks = checks.filter((c) => c.pass).length;
  return {
    total: sections.total,
    promptMissing: sections.promptMissing === true,
    submittable: sections.submittable,
    totalChecks: checks.length,
    passChecks,
    needChecks: checks.length - passChecks,
    mandatoryCount: sections.mandatoryFixes.length,
    clicheDensity: sections.clicheDensity,
    numberCount: sections.numberCount,
    sentenceCount: sections.sentenceCount,
  };
}

export type LinkWarningLine = { key: string; text: string };

/**
 * 연계 경고 문장 목록(명세 No.182, 190). 필수 수정과 따로 보여 주고 점수와 저장 판정에는 쓰지 않는다.
 * null 은 판정을 못 낸 칸이라 경고하지 않는다.
 */
export function linkWarningLines(
  sections: VerificationSections,
): LinkWarningLine[] {
  return (sections.linkChecks ?? []).flatMap((c) => {
    const line = (key: string, text: string) => ({
      key: `${c.recordId}:${key}`,
      text: `${c.label}: ${text}`,
    });
    if (c.status === "unused") {
      return [line("unused", "선택했지만 본문에 쓰이지 않았어요(미사용)")];
    }
    return [
      ...(c.linkShown === false
        ? [line("shown", "연계가 드러난 문장이 없어요")]
        : []),
      ...(c.concreteWordPresent === false
        ? [line("word", "넘어온 구체물 낱말이 연계 문장에 없어요")]
        : []),
      ...(c.listingSuspect === true
        ? [line("listing", "이 기록 문장을 빼도 글이 성립해요(나열 의심)")]
        : []),
    ];
  });
}

export type SaveBadge = { tone: "ok" | "warning" | "error"; label: string };

/** 검증 요약 카드 배지. 빨간 필수 수정이 우선이고, 노란 확인 필요는 저장을 막지 않는다. */
export function saveBadge(summary: VerificationSummary): SaveBadge {
  if (summary.mandatoryCount > 0) {
    return { tone: "error", label: `필수 수정 ${summary.mandatoryCount}건` };
  }
  if (summary.needChecks > 0) {
    return {
      tone: "warning",
      label: `아직 수정이 덜 된 항목 ${summary.needChecks}건`,
    };
  }
  return { tone: "ok", label: "제출 가능" };
}
