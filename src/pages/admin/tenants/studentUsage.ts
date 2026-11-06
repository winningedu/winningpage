// 학생별 이용 횟수 조정(사 #166, 결정 r5, r6, 102.11). 입력 칸을 student_usage_overrides upsert 행으로 바꾼다.
// null 은 기관 설정을 따른다. 고른 학생 모두에게 같은 값을 한 배열로 보낸다(일괄 변경).

import {
  isLimit,
  LIMIT_MESSAGE,
  numberOrNull,
  SERVICE_PROGRAMS,
} from "./serviceSettings";

export interface OverrideEdit {
  monthly: string;
  term: string;
}

export interface OverrideRow {
  profile_id: string;
  program_key: string;
  monthly_limit?: number | null;
  term_limit?: number | null;
  updated_by: string;
}

/** 고친 칸의 표식. 서비스 키와 칸 이름을 점으로 잇는다(예: diagnose.monthly). */
export const dirtyKey = (programKey: string, field: keyof OverrideEdit) =>
  `${programKey}.${field}`;

/** 이번에 고친 칸(dirty)만 쓴다. 다른 학생이나 안 건드린 칸의 기존 조정을 일괄 변경이 덮지 않게 한다. */
export function overridePayloads(
  profileIds: string[],
  edits: Record<string, OverrideEdit>,
  dirty: Set<string>,
  userId: string,
): OverrideRow[] {
  return profileIds.flatMap((profileId) =>
    SERVICE_PROGRAMS.flatMap(({ key }) => {
      const monthly = dirty.has(dirtyKey(key, "monthly"));
      const term = dirty.has(dirtyKey(key, "term"));
      if (!monthly && !term) return [];
      return [
        {
          profile_id: profileId,
          program_key: key,
          ...(monthly && {
            monthly_limit: numberOrNull(edits[key]?.monthly ?? ""),
          }),
          ...(term && { term_limit: numberOrNull(edits[key]?.term ?? "") }),
          updated_by: userId,
        },
      ];
    }),
  );
}

/** supabase-js upsert 는 첫 행의 열만 쓰므로, 같은 열 묶음의 행끼리 모아 한 번씩 보낸다. */
export function groupByColumns(rows: OverrideRow[]): OverrideRow[][] {
  const groups = new Map<string, OverrideRow[]>();
  for (const row of rows) {
    const columns = Object.keys(row).sort().join(",");
    groups.set(columns, [...(groups.get(columns) ?? []), row]);
  }
  return [...groups.values()];
}

/** 기관 설정으로 되돌리기: 6개 서비스 두 한도를 모두 null 로 보낸다(DELETE 권한이 없다). */
export function resetPayloads(
  profileIds: string[],
  userId: string,
): OverrideRow[] {
  return profileIds.flatMap((profileId) =>
    SERVICE_PROGRAMS.map(({ key }) => ({
      profile_id: profileId,
      program_key: key,
      monthly_limit: null,
      term_limit: null,
      updated_by: userId,
    })),
  );
}

export function validateOverrideEdits(
  edits: Record<string, OverrideEdit>,
  dirty: Set<string>,
): string | null {
  for (const entry of dirty) {
    const [key = "", field = ""] = entry.split(".");
    const value = edits[key]?.[field as keyof OverrideEdit];
    if (value !== undefined && !isLimit(value.trim())) return LIMIT_MESSAGE;
  }
  return null;
}

const OUTSIDE_PERIOD =
  "지금은 소속 기관의 서비스 이용 기간이 아니에요. 선생님께 문의해 주세요.";

const DENY_LABELS: Record<string, string> = {
  catch_all: "소속코드를 입력하면 서비스를 이용할 수 있어요.",
  disabled: "소속 기관에서 제공하지 않는 서비스예요.",
  outside_period: OUTSIDE_PERIOD,
  grace: OUTSIDE_PERIOD,
  month_cap:
    "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
  term_cap: "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
};

/** 학생에게 보이는 막힘 문구(결정 99)를 관리자 화면에도 그대로 쓴다. 허용이면 빈 문자열. */
export function denyReasonLabel(reason: string | null): string {
  if (!reason) return "";
  return DENY_LABELS[reason] ?? reason;
}
