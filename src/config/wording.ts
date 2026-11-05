import { site } from "@/config/site";

const SERVICE_NAMES = "수행평가|자기평가서|성장설계|심화탐구|목표관리";

// 사이트가 '위닝 ' 접두어를 쓰지 않으면(site.features.stripWinningPrefix, 스쿨멘토) 화면 문구의
// '위닝 수행평가' 같은 서비스 이름에서 접두어를 빼고 '위닝 내부 기준'은 '서비스 내부 기준'으로 바꾼다.
export function siteWording(text: string): string {
  if (!site.features.stripWinningPrefix) return text;

  return text
    .replace(new RegExp(`위닝 (${SERVICE_NAMES})`, "g"), "$1")
    .replaceAll("위닝 내부 기준", "서비스 내부 기준");
}
