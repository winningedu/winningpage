// 검증 결과가 현재 본문보다 오래됐는지 판정한다(계획서 §6 52).
// current_step 은 5 이후 재생성이나 편집에도 5 로 남기 때문에 단계로는 알 수 없다.
// 그래서 현재 본문의 생성 시각과 최신 검증의 생성 시각을 비교한다.
type Stamped = { createdAt: string };

type DetailLike = {
  reports: { verification: Stamped | null };
  current: Stamped | null;
};

export function isVerificationStale(detail: DetailLike): boolean {
  const verification = detail.reports.verification;
  if (!verification) return true;
  const current = detail.current;
  if (!current) return false;
  return (
    new Date(current.createdAt).getTime() >
    new Date(verification.createdAt).getTime()
  );
}
