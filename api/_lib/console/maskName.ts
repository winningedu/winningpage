// 콘솔 이름 가림. 담임 이외 화면과 엑셀 출력에 쓴다(결정 8, 27, 41).
// Figma 프레임 기준으로 성 다음 한 글자만 가리고 나머지는 그대로 둔다("김하늘" 은 "김*늘").

import type { ConsoleActorKind } from "./actor.js";

export function maskName(name: string): string {
  const chars = Array.from(name);
  if (chars.length < 2) return name;
  chars[1] = "*";
  return chars.join("");
}

/** 담임만 실명을 본다. 학교 관리자, 본사 대행 등 그 밖의 행위자에게는 가린 이름을 준다. */
export function displayNameFor(
  actor: { kind: ConsoleActorKind },
  name: string,
): string {
  return actor.kind === "homeroom" ? name : maskName(name);
}

/**
 * 목록 전체의 표시 이름. 담임 이외는 가리고, 같은 묶음(학급)에서 가린 이름이 같은 학생끼리는
 * 구분되게 끝에 `*` 를 붙인다(교 #233, 결정 5와 6). 묶음이 다르면 겹쳐도 붙이지 않는다.
 */
export function displayNamesFor(
  actor: { kind: ConsoleActorKind },
  students: { id: string; group: string | null; name: string }[],
): Map<string, string> {
  const shown = new Map(
    students.map((s) => [s.id, displayNameFor(actor, s.name)]),
  );
  if (actor.kind === "homeroom") return shown;
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  const keyOf = (s: { group: string | null }, name: string) =>
    `${s.group ?? ""}\u0000${name}`;
  for (const s of students) {
    // 같은 학생이 여러 줄로 들어와도 한 명으로 센다.
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const key = keyOf(s, shown.get(s.id) ?? "");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const s of students) {
    const name = shown.get(s.id) ?? "";
    if (name !== "" && (counts.get(keyOf(s, name)) ?? 0) > 1)
      shown.set(s.id, `${name}*`);
  }
  return shown;
}
