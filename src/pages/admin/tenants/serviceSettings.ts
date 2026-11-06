// 기관 서비스 설정 화면의 행 계산(사 #160, #164, #166, 결정 r5, r6). 화면 상태 변환만 하고 DB 는 부르지 않는다.
// 설정 행이 없는 서비스는 제공 안 함이다(P20). 켤 때 app_settings.b2b_usage_defaults 로 한도를 미리 채운다.

export const SERVICE_PROGRAMS = [
  { key: "diagnose", label: "학습진단" },
  { key: "target", label: "목표관리" },
  { key: "growth", label: "성장설계" },
  { key: "suhaeng", label: "수행평가" },
  { key: "inquiry", label: "심화탐구" },
  { key: "selfeval", label: "자기평가" },
] as const;

export type ProgramKey = (typeof SERVICE_PROGRAMS)[number]["key"];

export interface UsageDefaults {
  [programKey: string]: {
    monthly_limit?: number;
    term_limit_by_term_months?: Record<string, number>;
  };
}

export interface SettingRow {
  program_key: string;
  enabled: boolean;
  starts_on: string | null;
  ends_on: string | null;
  monthly_limit: number | null;
  term_limit: number | null;
}

export interface ServiceRowForm {
  programKey: ProgramKey;
  label: string;
  provided: boolean;
  /** DB 에 행이 있는지. 켜기 전에 기본값을 채울지 가른다. */
  saved: boolean;
  startsOn: string;
  endsOn: string;
  monthlyLimit: string;
  termLimit: string;
}

const text = (value: number | string | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

export function buildServiceRows(settings: SettingRow[]): ServiceRowForm[] {
  return SERVICE_PROGRAMS.map(({ key, label }) => {
    const saved = settings.find((row) => row.program_key === key);
    return {
      programKey: key,
      label,
      provided: saved?.enabled ?? false,
      saved: saved !== undefined,
      startsOn: text(saved?.starts_on),
      endsOn: text(saved?.ends_on),
      monthlyLimit: text(saved?.monthly_limit),
      termLimit: text(saved?.term_limit),
    };
  });
}

export function enableRow(
  row: ServiceRowForm,
  defaults: UsageDefaults,
  termMonths: number | null,
): ServiceRowForm {
  if (row.saved) return { ...row, provided: true };
  const preset = defaults[row.programKey];
  const termLimit =
    termMonths === null
      ? undefined
      : preset?.term_limit_by_term_months?.[String(termMonths)];
  return {
    ...row,
    provided: true,
    monthlyLimit: text(preset?.monthly_limit),
    termLimit: text(termLimit),
  };
}

export const LIMIT_MESSAGE = "한도는 1 이상 32767 이하의 정수로 넣어 주세요.";
const PERIOD_MESSAGE = "서비스 시작일은 종료일보다 늦을 수 없어요.";

export const isLimit = (value: string) =>
  value === "" || (/^\d+$/.test(value) && +value >= 1 && +value <= 32767);

/** DB 제약(smallint > 0, 기간 순서)과 같은 규칙을 저장 전에 알려 준다. 문제가 없으면 null. */
export function validateServiceRow(row: ServiceRowForm): string | null {
  if (!isLimit(row.monthlyLimit.trim()) || !isLimit(row.termLimit.trim()))
    return LIMIT_MESSAGE;
  if (row.startsOn && row.endsOn && row.startsOn > row.endsOn)
    return PERIOD_MESSAGE;
  return null;
}

const blankToNull = (value: string) => (value.trim() === "" ? null : value);
export const numberOrNull = (value: string) =>
  value.trim() === "" ? null : Number(value);

/** 한 행의 upsert 본문. 끄기는 enabled false 이고 행은 지우지 않는다(DELETE 권한이 없다). */
export function settingPayload(
  tenantId: string,
  row: ServiceRowForm,
  userId: string,
) {
  return {
    tenant_id: tenantId,
    program_key: row.programKey,
    enabled: row.provided,
    starts_on: blankToNull(row.startsOn),
    ends_on: blankToNull(row.endsOn),
    monthly_limit: numberOrNull(row.monthlyLimit),
    term_limit: numberOrNull(row.termLimit),
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
}
