/**
 * 학습진단 이어 답하기 초안(사 #44, 결정 107 항목 17) — 스쿨멘토 전용.
 * 이 기기 localStorage 에 사용자별로 저장한다. 서버 저장은 하지 않는다.
 * 저장소 접근은 전부 try/catch 로 감싼다(비공개 모드 등에서 SecurityError 가 날 수 있다).
 */
const KEY_PREFIX = "diagnosis-draft:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export function saveDraft(userId: string, answers: Record<string, unknown>) {
  try {
    localStorage.setItem(
      KEY_PREFIX + userId,
      JSON.stringify({ v: 1, savedAt: Date.now(), answers }),
    );
  } catch {
    // 저장 실패는 설문 진행을 막지 않는다.
  }
}

export function loadDraft(userId: string): Record<string, unknown> | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (
      draft?.v !== 1 ||
      typeof draft.savedAt !== "number" ||
      Date.now() - draft.savedAt > MAX_AGE_MS
    ) {
      localStorage.removeItem(KEY_PREFIX + userId);
      return null;
    }
    return draft.answers ?? null;
  } catch {
    return null;
  }
}

export function clearDraft(userId: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + userId);
  } catch {
    // 삭제 실패는 설문 진행을 막지 않는다.
  }
}
