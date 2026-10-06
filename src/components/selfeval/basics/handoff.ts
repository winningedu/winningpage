// 성장설계 실행계획에서 넘어온 과제 전달값(sessionStorage `growth:handoff`)을 읽는다.
// 저장 모양은 growth/plan/planLogic.ts 의 storeHandoff(ProgramHandoff JSON)다.
// 읽기와 지우기를 나눈다. 렌더 중에는 읽기만 하고(StrictMode 가 초기화 함수를 두 번 부른다),
// 지우기는 효과에서 한다. 지우지 않으면 다음에 직접 들어온 새 세션에도 같은 과제가 미리 선택된다.
import { HANDOFF_STORAGE_KEY } from "@/components/growth/plan/planLogic";

type StorageLike = Pick<Storage, "getItem" | "removeItem">;

export function clearHandoff(storage: StorageLike | null): void {
  try {
    storage?.removeItem(HANDOFF_STORAGE_KEY);
  } catch {
    // 저장소를 못 쓰는 환경이면 지울 것도 없다.
  }
}

export function readHandoffItemId(
  storage: StorageLike | null,
  validItemIds: string[],
): string | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(HANDOFF_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    const id =
      typeof parsed === "object" && parsed !== null
        ? (parsed as { itemId?: unknown }).itemId
        : null;
    return typeof id === "string" && validItemIds.includes(id) ? id : null;
  } catch {
    return null;
  }
}
