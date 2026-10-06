// 성장설계 실행계획 화면이 sessionStorage 에 남긴 연동 전달값을 읽고 지운다.
// 키와 저장 모양은 성장설계가 정한다(components/growth/plan/planLogic.ts 의 HANDOFF_STORAGE_KEY,
// storeHandoff). 저장 값은 ProgramHandoff JSON 이고 itemId 가 growth_plan_items 의 id 다.
// 저장소를 못 쓰는 환경(사생활 보호 모드 등)에서는 읽기는 null, 지우기는 무동작이다.

/** 성장설계 planLogic.ts 의 HANDOFF_STORAGE_KEY 와 같은 값(handoff.test.ts 가 대조한다). */
const HANDOFF_STORAGE_KEY = "growth:handoff";

export type GrowthHandoffRead = {
  /** 전달값의 itemId. 없으면 null. */
  planItemId: string | null;
  /** 저장된 JSON 원본. 모양 검증은 서버가 한다. */
  raw: unknown;
};

export function readGrowthHandoff(): GrowthHandoffRead | null {
  try {
    const text = sessionStorage.getItem(HANDOFF_STORAGE_KEY);
    if (text === null) return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return null;
    }
    const itemId = (raw as { itemId?: unknown }).itemId;
    return {
      planItemId: typeof itemId === "string" && itemId !== "" ? itemId : null,
      raw,
    };
  } catch {
    return null;
  }
}

export function clearGrowthHandoff(): void {
  try {
    sessionStorage.removeItem(HANDOFF_STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰면 지울 것도 없다.
  }
}
