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
  const hidden = new Set<string>();
  for (const p of pending) {
    const joined = active.some(
      (a) =>
        a.classId === p.classId &&
        a.name === p.name &&
        (p.number === null || a.number === p.number),
    );
    if (joined) hidden.add(p.id);
  }
  return hidden;
}
