import { site } from "@/config/site";

const SERVICE_NAMES = "수행평가|성장설계|심화탐구|목표관리|학습진단";

const EXACT = new Map([["저장된 활동에서 확인", "이미 채워진 항목"]]);

// 사이트가 '위닝 ' 접두어를 쓰지 않으면(site.features.stripWinningPrefix, 스쿨멘토) 화면 문구의
// '위닝 수행평가' 같은 서비스 이름에서 접두어를 빼고 '위닝 내부 기준'은 '서비스 내부 기준'으로 바꾼다.
// 서비스 이름 '위닝 자기평가서'는 '자기평가'로 쓴다(결정 107.11). 문서를 가리키는 '자기평가서'는 그대로 둔다.
// 서비스 화면의 나머지 '위닝' 브랜드 말은 아래 BRAND_PHRASE에 적은 말만 사이트 이름으로 바꾼다(위닝에듀는 그대로).
// 조사가 붙는 '위닝은', '위닝로직' 같은 말은 사이트 이름으로 바꾸면 어색해서 건드리지 않는다.
const BRAND_PHRASE =
  /위닝(?=에서|에 | 서비스| 채팅| 프로그램| 저장 활동| 콜멘토)/g;

export function siteWording(text: string): string {
  if (!site.features.stripWinningPrefix) return text;
  const exact = EXACT.get(text);
  if (exact !== undefined) return exact;

  return (
    text
      .replaceAll("위닝 자기평가서", "자기평가")
      .replace(new RegExp(`위닝 (${SERVICE_NAMES})`, "g"), "$1")
      .replaceAll("위닝 내부 기준", "서비스 내부 기준")
      .replaceAll("위닝 내부 추정", "서비스 내부 추정")
      .replace(/위닝 A(부터|~)/g, "A$1")
      .replaceAll("무료진단", "학습진단")
      // 같은 사이트는 명세 표기대로 '진행단계'도 '진행 단계'로 띄어 쓴다(결정 14).
      .replaceAll("진행단계", "진행 단계")
      .replace(BRAND_PHRASE, site.brandName)
  );
}
