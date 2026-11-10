/**
 * 학습진단 이어 답하기 초안(사 #44, 결정 107 항목 17), 스쿨멘토 전용.
 * 이 기기 localStorage 에 사용자별로 저장한다. 서버 저장은 하지 않는다.
 * 저장소 접근은 전부 try/catch 로 감싼다(비공개 모드 등에서 SecurityError 가 날 수 있다).
 */
const KEY_PREFIX = "diagnosis-draft:";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function isExpired(raw: string | null): boolean {
  try {
    const draft = JSON.parse(raw ?? "");
    return (
      draft?.v !== 1 ||
      typeof draft.savedAt !== "number" ||
      Date.now() - draft.savedAt > MAX_AGE_MS
    );
  } catch {
    return true;
  }
}

function draftKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith(KEY_PREFIX)) keys.push(key);
  }
  return keys;
}

/** 어느 사용자의 것이든 만료된 초안을 지운다. 만료는 읽을 때만 확인되므로, 공용 PC에
 * 남은 다른 사용자의 초안을 저장하거나 읽을 때 함께 쓸어낸다. */
function sweepExpiredDrafts() {
  try {
    for (const key of draftKeys()) {
      if (isExpired(localStorage.getItem(key))) localStorage.removeItem(key);
    }
  } catch {
    // 정리 실패는 설문 진행을 막지 않는다.
  }
}

/** 로그아웃, 세션 킥, 탈퇴 때 이 기기의 모든 사용자 초안을 지운다. */
export function clearAllDrafts() {
  try {
    for (const key of draftKeys()) localStorage.removeItem(key);
  } catch {
    // 삭제 실패는 로그아웃 진행을 막지 않는다.
  }
}

export function saveDraft(userId: string, answers: Record<string, unknown>) {
  sweepExpiredDrafts();
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
  sweepExpiredDrafts();
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
