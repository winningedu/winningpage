// 사업자 정보 정본은 src/config/site.ts(site.company)로 옮겼다 — 사이트(위닝에듀/
// 스쿨멘토)별로 값이 다르기 때문. 이 파일은 기존 소비자(랜딩/결제 페이지 푸터 등)의
// `import { COMPANY } from "@/data/company"`를 깨지 않기 위한 re-export만 남긴다.
import { site } from "@/config/site";

export const COMPANY = site.company;
