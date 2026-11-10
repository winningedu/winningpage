// 서비스이용횟수조정 대상 6개 서비스. 이름과 program_key 는 SERVICE_CONFIGS 가 정본이다.
// goal 서비스의 program_key 는 'target' 이고 회차 없이 기간(granted_months)으로만 부여된다.

import { SERVICE_CONFIGS } from "../serviceAccess.js";
import { isSchoolmentorSite } from "../site.js";

const ORDER = [
  "diagnose",
  "goal",
  "growth",
  "suhaeng",
  "inquiry",
  "selfeval",
] as const;

// 스쿨멘토 화면 이름(결정 107.11). SERVICE_CONFIGS.service_name 은 위닝 오류 문구 등에도 쓰여 그대로 둔다.
const SPEC_LABEL: Record<(typeof ORDER)[number], string> = {
  diagnose: "학습진단",
  goal: "목표관리",
  growth: "성장설계",
  suhaeng: "수행평가",
  inquiry: "심화탐구",
  selfeval: "자기평가",
};

export type ServiceCreditProgram = {
  programKey: string;
  label: string;
  periodBased: boolean;
};

export const SERVICE_CREDIT_PROGRAMS: ServiceCreditProgram[] = ORDER.map(
  (serviceKey) => {
    const config = SERVICE_CONFIGS[serviceKey];
    const programKey = config?.program_keys[0];
    if (!config || !programKey)
      throw new Error(`SERVICE_CONFIGS.${serviceKey} 가 없습니다.`);
    return {
      programKey,
      label: isSchoolmentorSite()
        ? SPEC_LABEL[serviceKey]
        : config.service_name,
      periodBased: serviceKey === "goal",
    };
  },
);
