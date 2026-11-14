// 스쿨멘토 이용안내 화면(src/pages/UsageGuide.tsx)의 "이용하고 싶으신 서비스" 선택지 -
// 화면과 서버(api/_routes/create-consult-request.ts)가 함께 읽는 단일 정본이다.
// 스쿨멘토 서비스 메뉴 이름(src/data/navigation.ts SCHOOLMENTOR_FALLBACK_NAV_GROUPS)과 같다.
export const USAGE_GUIDE_SERVICE_OPTIONS = [
  "학습진단",
  "목표관리",
  "성장설계",
  "수행평가",
  "심화탐구",
  "자기평가",
] as const;
