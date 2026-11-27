// 로그인 지표 필터는 주소 검색 파라미터에 둔다(새로 고침, 링크 공유에도 같은 화면). 기관 표(tenantTable PARAM)와
// 같은 화면이라 키에 login 접두어를 붙인다. includeInternal 은 기관 현황과 함께 쓰는 스위치 하나다("1" 이면 포함).
// 주소에 없거나 모르는 값은 결정된 기본값(이번 달 1일부터 오늘, 일 단위, 달력 기준 MAU, QA, 관리자 계정 제외, 1쪽)으로 읽는다(Q7).

export const LOGIN_PARAM = {
  from: "loginFrom",
  to: "loginTo",
  grain: "loginGrain",
  mau: "loginMau",
  page: "loginPage",
} as const;

import {
  GRAINS,
  type Grain,
  MAU_MODES,
  type MauMode,
} from "../../../../shared/hq-dashboard/contract.js";

export type { Grain, MauMode };
export { GRAINS, MAU_MODES };

export interface LoginFilters {
  from: string;
  to: string;
  grain: Grain;
  mau: MauMode;
  includeInternal: boolean;
  page: number;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function oneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function dateOr(value: string | null, fallback: string): string {
  return value && DATE_RE.test(value) ? value : fallback;
}

export function readLoginFilters(
  params: URLSearchParams,
  today: string,
): LoginFilters {
  const page = Number(params.get(LOGIN_PARAM.page));
  return {
    from: dateOr(params.get(LOGIN_PARAM.from), `${today.slice(0, 8)}01`),
    to: dateOr(params.get(LOGIN_PARAM.to), today),
    grain: oneOf(params.get(LOGIN_PARAM.grain), GRAINS, "day"),
    mau: oneOf(params.get(LOGIN_PARAM.mau), MAU_MODES, "calendar"),
    includeInternal: params.get("includeInternal") === "1",
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function search(entries: [string, string][], includeInternal: boolean): string {
  const params = new URLSearchParams(entries);
  params.set("includeInternal", includeInternal ? "1" : "0");
  return params.toString();
}

// scope b2c 는 위닝 B2C 구역(B2cSection)이 부른다. 기본(all)은 주소에 싣지 않는다.
export function statsSearch(f: LoginFilters, scope?: "b2c"): string {
  const entries: [string, string][] = [
    ["view", "stats"],
    ["from", f.from],
    ["to", f.to],
    ["grain", f.grain],
    ["mau", f.mau],
  ];
  if (scope) entries.push(["scope", scope]);
  return search(entries, f.includeInternal);
}

// 가입, 결제 추이(/trends)는 로그인 지표와 같은 기간, 묶음, MAU 기준을 쓴다.
export function trendSearch(f: LoginFilters): string {
  return search(
    [
      ["from", f.from],
      ["to", f.to],
      ["grain", f.grain],
      ["mau", f.mau],
    ],
    f.includeInternal,
  );
}

export function b2cSearch(f: LoginFilters): string {
  return search(
    [
      ["from", f.from],
      ["to", f.to],
    ],
    f.includeInternal,
  );
}

export function logSearch(f: LoginFilters): string {
  return search(
    [
      ["view", "log"],
      ["from", f.from],
      ["to", f.to],
      ["page", String(f.page)],
    ],
    f.includeInternal,
  );
}
