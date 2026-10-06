// 성장설계 앱 설정 읽기. 폴백 없이 없거나 잘못되면 오류를 던진다.

export const GROWTH_SETTING_KEYS = {
  sufficiencyThresholds: "growth_sufficiency_thresholds",
} as const;

export class GrowthSettingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrowthSettingError";
  }
}

/** 충족도 임계값 파싱. `{enough: 양의 정수}` 만 허용한다. */
export function parseSufficiencyThresholds(value: unknown): {
  enough: number;
} {
  const enough =
    value !== null && typeof value === "object"
      ? (value as { enough?: unknown }).enough
      : undefined;
  if (typeof enough !== "number" || !Number.isInteger(enough) || enough <= 0) {
    throw new GrowthSettingError(
      "설정 형식 오류: enough 는 양의 정수여야 한다",
    );
  }
  return { enough };
}

/** 설정 행을 읽어 parse 한다. 행이 없으면 오류. fetchRow 는 호출자가 주입한다. */
export async function readGrowthSetting<T>(
  fetchRow: (key: string) => Promise<{ value: unknown } | null>,
  key: string,
  parse: (value: unknown) => T,
): Promise<T> {
  const row = await fetchRow(key);
  if (!row) throw new GrowthSettingError(`설정 없음: ${key}`);
  return parse(row.value);
}
