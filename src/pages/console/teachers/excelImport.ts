// W15 판정 이름과 적용(청크 전송). 서버 판정 9종의 화면 이름, 오류 여부와 20행씩 나눠 보내는 적용 순서를 둔다.

import { consoleRequest, errorMessage } from "../api";
import type { IssuedRow } from "./issuedFile";
import type { TeacherFileRow } from "./teacherFile";

export type Verdict =
  | "format_error"
  | "group_not_registered"
  | "class_duplicate"
  | "phone_conflict"
  | "same_name_other"
  | "shared_login"
  | "same"
  | "changed"
  | "new";

export const VERDICT_LABEL: Record<Verdict, string> = {
  format_error: "형식 오류",
  group_not_registered: "등록되지 않은 그룹",
  class_duplicate: "파일 안 학급 중복",
  phone_conflict: "전화번호 오류",
  same_name_other: "이름이 같은 다른 선생님",
  shared_login: "여러 반 공통 아이디",
  same: "동일",
  changed: "변경",
  new: "신규",
};

const ERRORS: Verdict[] = [
  "format_error",
  "group_not_registered",
  "class_duplicate",
  "phone_conflict",
];

export const isErrorVerdict = (v: Verdict) => ERRORS.includes(v);

export type ApplyMode = "overwrite" | "skip";

/** 서버가 청크 하나에 받는 행 수(MAX_IMPORT_ROWS)와 같다. */
const CHUNK = 20;
const FAILED_MESSAGE =
  "일부만 적용됐어요. 같은 화면에서 다시 적용하면 이어서 처리해요";

export interface ApplyTotals {
  created: number;
  updated: number;
  accounts: number;
  files: IssuedRow[];
  /** 끝낸 청크 수. 다시 적용하면 그 뒤부터 보낸다. */
  chunksDone: number;
}

export const EMPTY_TOTALS: ApplyTotals = {
  created: 0,
  updated: 0,
  accounts: 0,
  files: [],
  chunksDone: 0,
};

const last4 = (phone: string) => phone.replace(/\D/g, "").slice(-4);

interface ImportResponse {
  counts: { created: number; updated: number; accounts: number };
  accounts: { loginId: string; tempPassword: string; rowIndexes: number[] }[];
}

/**
 * 오류가 아닌 행만 20행씩 순서대로 보낸다. 같은 requestId 와 순번은 서버가 한 번만 처리하므로
 * 실패하면 totals 를 들고 다시 부르면 끝낸 청크는 건너뛰고 이어서 보낸다(임시 비밀번호는 응답에만 있어 totals 에 모은다).
 */
export async function applyRows(
  rows: TeacherFileRow[],
  mode: ApplyMode,
  requestId: string,
  from: ApplyTotals,
): Promise<{ totals: ApplyTotals; error: string | null }> {
  const totals: ApplyTotals = { ...from, files: [...from.files] };
  for (let i = totals.chunksDone * CHUNK; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await consoleRequest("/api/console/teachers/import", {
      method: "POST",
      body: { requestId, chunkIndex: totals.chunksDone + 1, mode, rows: chunk },
    });
    const body = res.body as ImportResponse | null;
    if (res.status !== 200 || !body) {
      return { totals, error: errorMessage(res.body) ?? FAILED_MESSAGE };
    }
    totals.created += body.counts.created;
    totals.updated += body.counts.updated;
    totals.accounts += body.counts.accounts;
    for (const account of body.accounts) {
      const people = account.rowIndexes.map((n) => chunk[n] as TeacherFileRow);
      const first = people[0] as TeacherFileRow;
      totals.files.push({
        name: first.name,
        phoneLast4: last4(first.phone),
        grade: people
          .map((p) => p.grade)
          .filter(Boolean)
          .join(", "),
        className: people
          .map((p) => p.className)
          .filter(Boolean)
          .join(", "),
        loginId: account.loginId,
        tempPassword: account.tempPassword,
      });
    }
    totals.chunksDone += 1;
  }
  return { totals, error: null };
}
