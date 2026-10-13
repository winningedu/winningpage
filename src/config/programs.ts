// 신규 서비스 3종(성장설계, 자기평가, 심화탐구)의 노출 게이트용 순수 데이터와 판정.
// env나 site에 의존하지 않아 sites.ts(vite.config.js도 공유)가 타입을 가져다 쓸 수 있다.
export const GATEABLE_PROGRAMS = ["growth", "selfeval", "inquiry"] as const;

export type GateableProgram = (typeof GATEABLE_PROGRAMS)[number];

// 프로그램별 소개 페이지와 앱 경로 접두사. 경로 경계(정확히 일치하거나 하위 경로)로만 매칭한다.
const PROGRAM_PATH_PREFIXES: Record<GateableProgram, readonly string[]> = {
  growth: ["/services/growth", "/app/growth"],
  selfeval: ["/services/self-assessment", "/app/selfeval"],
  inquiry: ["/services/research", "/app/inquiry"],
};

// 쉼표로 구분한 문자열(VITE_HIDDEN_PROGRAMS)을 숨길 프로그램 배열로 바꾼다.
// 공백, 대소문자, 중복, 모르는 키를 정리해 안전한 값만 남긴다.
export function parseHiddenPrograms(
  raw: string | undefined,
): GateableProgram[] {
  const known = new Set<string>(GATEABLE_PROGRAMS);
  const result: GateableProgram[] = [];
  for (const part of (raw ?? "").split(",")) {
    const key = part.trim().toLowerCase();
    if (known.has(key) && !result.includes(key as GateableProgram)) {
      result.push(key as GateableProgram);
    }
  }
  return result;
}

export function programOfLink(
  to: string | null | undefined,
): GateableProgram | null {
  const path = String(to ?? "")
    .trim()
    .split(/[?#]/)[0];
  for (const program of GATEABLE_PROGRAMS) {
    const matched = PROGRAM_PATH_PREFIXES[program].some(
      (prefix) => path === prefix || path?.startsWith(`${prefix}/`),
    );
    if (matched) return program;
  }
  return null;
}

export function isHiddenProgramLink(
  to: string | null | undefined,
  hidden: readonly GateableProgram[],
): boolean {
  const program = programOfLink(to);
  return program !== null && hidden.includes(program);
}
