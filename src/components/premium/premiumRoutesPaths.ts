// 프리미엄 라우트 경로 상수 — 라우트 조립(premiumRoutes.tsx)·네비게이션(navigation.ts)·
// 탭바(PremiumProgramTabs.tsx)·CTA 배너(cta.to)가 전부 이 파일을 공유한다(매직 문자열 금지).
// 컨벤션: /page/premium/<program> (구 /page/premium-<program>은 폐기, 리다이렉트 없음).

export const PREMIUM_PROGRAM_PATH_PREFIX = "/page/premium";
export const PREMIUM_ADMISSION_A_PATH = "/page/premium/admission-consulting/a";
export const PREMIUM_ADMISSION_S_PATH = "/page/premium/admission-consulting/s";
export const PREMIUM_GRADUATE_SCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/graduate-school`;
export const PREMIUM_GLOBAL_UNIVERSITY_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/global-university`;
export const PREMIUM_SPECIAL_HIGHSCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/special-highschool`;
export const PREMIUM_INTERNATIONAL_SCHOOL_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/international-school`;
// 네비게이션 라벨은 "국제・해외고 국내대 입학컨설팅" — slug는 returning-student (navigation.ts
// 실측). Figma 프레임명은 "국제학교 학습관리"였지만 그건 별도 메뉴(international-school)의
// 슬러그라 혼동하지 않도록 상수명도 실제 라우트(returning-student) 기준으로 짓는다.
export const PREMIUM_RETURNING_STUDENT_PATH = `${PREMIUM_PROGRAM_PATH_PREFIX}/returning-student`;

// /premium-apply(이용신청 메뉴, 프리미엄 프로그램 라우트와 별개) 상담 신청 폼 섹션의
// 앵커 id. 대입A・S 히어로 CTA(QA 행251)가 `${PREMIUM_APPLY_PATH}#${PREMIUM_APPLY_FORM_ANCHOR_ID}`로
// 이동해 폼까지 바로 스크롤되게 한다 — 실제 스크롤 처리는 PremiumApply.tsx가 진다
// (React Router 데이터 라우터는 크로스 라우트 이동 시 해시로 자동 스크롤하지 않는다,
// MentorHero.jsx MENTOR_FORM_ANCHOR_ID는 같은 페이지 내 앵커라 다른 패턴).
export const PREMIUM_APPLY_PATH = "/premium-apply";
export const PREMIUM_APPLY_FORM_ANCHOR_ID = "premium-apply-form";

// 프리미엄 소속 경로 판정 — 프리미엄을 숨기는 사이트(site.features.premium=false)가
// 메뉴 항목·서비스 카드 링크를 거를 때 쓴다. 프로그램 랜딩(/page/premium/*)과 상담 신청
// (/premium-apply, 구 /page/premium-apply)이 대상이다. 쿼리・해시는 무시한다.
const PREMIUM_APPLY_LEGACY_PATH = "/page/premium-apply";

export function isPremiumLink(to: string | null | undefined): boolean {
  const path = String(to ?? "")
    .trim()
    .split(/[?#]/)[0];
  return (
    path === PREMIUM_PROGRAM_PATH_PREFIX ||
    path?.startsWith(`${PREMIUM_PROGRAM_PATH_PREFIX}/`) === true ||
    path === PREMIUM_APPLY_PATH ||
    path === PREMIUM_APPLY_LEGACY_PATH
  );
}
