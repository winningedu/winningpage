type Artifact = { reportId?: string } | null | undefined;

// 저장 리포트 상세에서 설계 이후 단계로 이어가는 CTA 라벨. 이어갈 단계가 없으면 null.
export function resumeCtaFor(detail: {
  design?: Artifact;
  evaluation?: Artifact;
  final?: Artifact;
}): string | null {
  if (detail.final || !detail.design) return null;
  return detail.evaluation ? "최종 제출본 작성하기" : "이어서 작성하기";
}
