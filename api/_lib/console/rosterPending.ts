// 가입 전 학생(미회원가입) 명단 줄(roster_pending_students)을 학생 목록에 보일지 정한다.
// 같은 기관, 학년도의 같은 학급에 같은 이름의 재학생이 가입했으면 가린다. 가입 전 줄에 번호가 있으면 번호도 같아야 한다.
// 읽을 때 걸러 내므로 줄을 지우지 않는다(다음에 명단을 올리면 통째로 바뀐다).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsoleActor } from "./actor.js";
import { readAll } from "./directory.js";
import { scopeQuery } from "./scope.js";

export interface PendingRecord {
  id: string;
  name: string;
  classId: string;
  number: number | null;
}

export interface ActiveRecord {
  name: string;
  classId: string | null;
  number: number | null;
}

export function hiddenPendingIds(
  pending: PendingRecord[],
  active: ActiveRecord[],
): Set<string> {
  // 학급과 이름(앞뒤 공백 제외, 트리거의 btrim 과 같다)별로 재학생 번호를 모아 둔다.
  const keyOf = (classId: string, name: string) =>
    `${classId}\u0000${name.trim()}`;
  const numbers = new Map<string, Set<number | null>>();
  for (const a of active) {
    if (a.classId === null) continue;
    const key = keyOf(a.classId, a.name);
    const set = numbers.get(key) ?? new Set<number | null>();
    set.add(a.number);
    numbers.set(key, set);
  }
  const hidden = new Set<string>();
  for (const p of pending) {
    const set = numbers.get(keyOf(p.classId, p.name));
    if (set && (p.number === null || set.has(p.number))) hidden.add(p.id);
  }
  return hidden;
}

const PROFILE_CHUNK = 100;

/**
 * 보는 사람의 범위 안, 이번 학년도의 가입 전 명단 줄 중 학생 목록에 보이는 것(가입한 같은 이름 재학생이 있으면 가린다).
 * 범위 규칙과 가림 규칙은 목록(students.ts)과 같다.
 */
export async function loadPendingStudents(
  admin: SupabaseClient,
  actor: ConsoleActor,
  schoolYear: number,
  active: { studentId: string; classId: string; number: number | null }[],
) {
  const all = await readAll<{
    id: string;
    name: string;
    class_id: string;
    number: number | null;
  }>(admin, "roster_pending_students", "id, name, class_id, number", (query) =>
    scopeQuery(query, actor, { classColumn: "class_id" }).eq(
      "school_year",
      schoolYear,
    ),
  );
  if (all.length === 0) return [];
  // in 목록이 URL 한도를 넘지 않게 100명씩 읽는다.
  const chunks: string[][] = [];
  for (let i = 0; i < active.length; i += PROFILE_CHUNK) {
    chunks.push(active.slice(i, i + PROFILE_CHUNK).map((a) => a.studentId));
  }
  const profiles = (
    await Promise.all(
      chunks.map((chunk) =>
        readAll<{ id: string; name: string | null }>(
          admin,
          "profiles",
          "id, name",
          (q) => q.in("id", chunk),
        ),
      ),
    )
  ).flat();
  const nameOf = new Map(profiles.map((p) => [p.id, p.name ?? ""]));
  const hidden = hiddenPendingIds(
    all.map((p) => ({
      id: p.id,
      name: p.name,
      classId: p.class_id,
      number: p.number,
    })),
    active.map((a) => ({
      name: nameOf.get(a.studentId) ?? "",
      classId: a.classId,
      number: a.number,
    })),
  );
  return all.filter((p) => !hidden.has(p.id));
}
