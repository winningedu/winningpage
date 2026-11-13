// 가입 전 학생(미회원가입) 명단 줄(roster_pending_students)을 학생 목록에 보일지 정한다.
// 같은 기관, 학년도의 같은 학급에 같은 이름의 재학생이 가입했으면 가린다. 가입 전 줄에 번호가 있으면 번호도 같아야 한다.
// 읽을 때 걸러 내므로 줄을 지우지 않는다(다음에 명단을 올리면 통째로 바뀐다).

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
