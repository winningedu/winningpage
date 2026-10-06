// 검증 결과 화면의 순수 로직(시안 43~51, 명세 No.53~62).
import type { VerificationSections } from "@/lib/selfeval/types";

export function discriminationLabel(discrimination: number | null): string {
  if (discrimination === null) return "판별력 없음";
  return `${discrimination > 0 ? "+" : ""}${discrimination}p`;
}

export type VerificationSummary = {
  total: number;
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
