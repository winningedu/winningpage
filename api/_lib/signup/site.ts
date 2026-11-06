// 스쿨멘토 가입 라우트의 사이트 게이트. 같은 repo 를 위닝 프로젝트에도 배포하므로
// 위닝에서는 이 라우트들이 없는 것처럼 404 를 낸다. getSiteKey() 는 SITE 가 비면 던지는데,
// 아직 SITE 를 설정하지 않은 위닝 배포를 500 으로 만들 수 없어서 여기서는 던지지 않고
// "schoolmentor 로 명시된 때만 열림"으로 본다(폴백으로 여는 것이 아니라 닫는 쪽이다).

import { getEnv } from "../supabaseAdmin.js";

export function isSchoolmentorSite(): boolean {
  return getEnv("SITE") === "schoolmentor";
}
