// 자기평가서 앱(/app/selfeval/*) 경로 상수. 라우트 정의, 사이드바, 단계 유도, 페이지 간 이동이
// 모두 이 한 곳을 읽는다(growthPaths.ts 와 같은 이유).
export const SELFEVAL_BASE = "/app/selfeval";

const session = (sessionId: string, screen: string) =>
  `${SELFEVAL_BASE}/s/${encodeURIComponent(sessionId)}/${screen}`;

export const SELFEVAL_PATHS = {
  home: SELFEVAL_BASE,
  new: `${SELFEVAL_BASE}/new`,
  archive: `${SELFEVAL_BASE}/archive`,
  activities: (sessionId: string) => session(sessionId, "activities"),
  analysis: (sessionId: string) => session(sessionId, "analysis"),
  result: (sessionId: string) => session(sessionId, "result"),
  verify: (sessionId: string) => session(sessionId, "verify"),
  done: (sessionId: string) => session(sessionId, "done"),
} as const;

export type SelfevalStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * 세션의 current_step 에서 이어 쓸 화면 경로. 서버 routeForStep(api/_lib/selfeval/session.ts)과
 * 같은 규칙이다. 0 은 기본 입력 전이라 기본 입력 화면을 세션 id 와 함께 연다.
 */
export function routeForStep(step: SelfevalStep, sessionId: string): string {
  switch (step) {
    case 0:
      return `${SELFEVAL_PATHS.new}?sessionId=${encodeURIComponent(sessionId)}`;
    case 1:
      return SELFEVAL_PATHS.activities(sessionId);
    case 2:
    case 3:
      return SELFEVAL_PATHS.analysis(sessionId);
    case 4:
      return SELFEVAL_PATHS.result(sessionId);
    case 5:
      return SELFEVAL_PATHS.verify(sessionId);
    case 6:
      return SELFEVAL_PATHS.done(sessionId);
  }
}
