// 학년도 넘기기 미리보기(W11 ③). 붙여넣은 명단 줄을 현재 재학생과 맞추고 줄마다 결과를 정한다.
// 순수 규칙만 둔다. 읽기와 응답은 라우트(school-year/rollover/preview)가 한다.
//
// 결과: student_not_found 현재 학생이 없음, same_name 같은 이름이 둘 이상이라 사람이 확인, graduating 졸업 대상,
// check_target 새 학년, 그룹, 반, 번호를 확인해야 함, duplicate_target 같은 새 반과 번호가 겹침,
// no_homeroom 새 반에 담임이 없음(안내만, 반영됨), applied 반영.
// 졸업 학년은 호출부가 정한다(고3 항상, 중3 은 학교만). 새 학년은 현재 학년에서 한 학년 올린 값이다(중3 은 고1).

import { maskName } from "./maskName.js";

export const ROLLOVER_GRADES = ["중1", "중2", "중3", "고1", "고2", "고3"];

export interface ParsedCells {
  grade: string;
  group: string;
  className: string;
  number: string;
}

export interface ParsedLine {
  line: number;
  name: string;
  from: ParsedCells;
  to: ParsedCells;
}

export interface PreviewStudent {
  studentId: string;
  name: string;
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

export type PreviewResult =
  | "applied"
  | "student_not_found"
  | "graduating"
  | "check_target"
  | "duplicate_target"
  | "same_name"
  | "no_homeroom";

export interface PreviewSlot {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}

export interface PreviewRow {
  line: number;
  displayName: string;
  from: PreviewSlot | null;
  to: PreviewSlot | null;
  studentId: string | null;
  result: PreviewResult;
}

export interface ApplyRow {
  studentId: string;
  groupId: string | null;
  className: string;
  number: number | null;
}

export interface PreviewInput {
  lines: ParsedLine[];
  students: PreviewStudent[];
  orgType: string | null;
  graduatingGrades: string[];
  /** 그룹 이름(소문자)에서 그룹. */
  groups: Map<string, { id: string; name: string }>;
  /** 새 학년도에 담임이 있는 학급: `${학년}|${그룹id 또는 빈 문자열}|${반 이름}`. */
  homeroomClasses: Set<string>;
}

/** 붙여넣은 글을 줄로 읽는다. 탭이 있으면 탭, 없으면 쉼표로 나누고 머리글 줄(이름으로 시작)은 건너뛴다. */
export function parseRolloverText(text: string): ParsedLine[] {
  const lines: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    if (raw.trim() === "") return;
    const cells = raw
      .split(raw.includes("\t") ? "\t" : ",")
      .map((c) => c.trim());
    if (cells[0] === "이름") return;
    const cell = (i: number) => cells[i] ?? "";
    lines.push({
      line: index + 1,
      name: cell(0),
      from: {
        grade: cell(1),
        group: cell(2),
        className: cell(3),
        number: cell(4),
      },
      to: {
        grade: cell(5),
        group: cell(6),
        className: cell(7),
        number: cell(8),
      },
    });
  });
  return lines;
}

/** fn_normalize_class_name 과 같다. 학교는 숫자만 남기고 앞의 0 을 떼며, 그 밖에는 공백을 모두 지운다. */
export function normalizeClassName(
  orgType: string | null,
  raw: string,
): string {
  return orgType === "학교"
    ? raw.replace(/[^0-9]/g, "").replace(/^0+/, "")
    : raw.replace(/\s/g, "");
}

const digitOf = (value: string): string | null => /\d/.exec(value)?.[0] ?? null;

function parseNumber(cell: string): number | null | "invalid" {
  const text = cell.replace(/번$/, "").trim();
  if (text === "") return null;
  const n = /^\d+$/.test(text) ? Number(text) : Number.NaN;
  return n >= 1 && n <= 99 ? n : "invalid";
}

const isNoGroup = (cell: string) => cell === "" || cell === "없음";

function nextGrade(grade: string): string {
  if (grade === "중3") return "고1";
  return ROLLOVER_GRADES[ROLLOVER_GRADES.indexOf(grade) + 1] ?? grade;
}

function slotOf(s: PreviewStudent): PreviewSlot {
  return {
    grade: s.grade,
    groupName: s.groupName,
    className: s.className,
    number: s.number,
  };
}

/** 기존 학년, 그룹, 반, 번호 칸 중 채운 칸으로 후보를 좁힌다. 빈 칸은 거르지 않는다. */
function narrow(
  candidates: PreviewStudent[],
  from: ParsedCells,
  orgType: string | null,
): PreviewStudent[] {
  return candidates.filter((s) => {
    if (from.grade !== "" && digitOf(from.grade) !== digitOf(s.grade ?? ""))
      return false;
    if (from.group !== "") {
      const want = isNoGroup(from.group) ? null : from.group.toLowerCase();
      if ((s.groupName?.toLowerCase() ?? null) !== want) return false;
    }
    if (
      from.className !== "" &&
      normalizeClassName(orgType, from.className) !==
        normalizeClassName(orgType, s.className ?? "")
    ) {
      return false;
    }
    if (from.number !== "" && parseNumber(from.number) !== s.number)
      return false;
    return true;
  });
}

interface Target {
  slot: PreviewSlot;
  groupId: string | null;
  checkNeeded: boolean;
}

function targetOf(
  line: ParsedLine,
  grade: string,
  input: PreviewInput,
): Target {
  const { to } = line;
  const className = normalizeClassName(input.orgType, to.className);
  const number = parseNumber(to.number);
  const group = isNoGroup(to.group)
    ? null
    : (input.groups.get(to.group.toLowerCase()) ?? null);
  const groupId = group?.id ?? null;
  const unknownGroup = !isNoGroup(to.group) && group === null;
  const wrongGrade = to.grade !== "" && digitOf(to.grade) !== digitOf(grade);
  return {
    slot: {
      grade,
      groupName: group?.name ?? (isNoGroup(to.group) ? null : to.group),
      className: className === "" ? null : className,
      number: number === "invalid" ? null : number,
    },
    groupId,
    checkNeeded:
      className === "" || number === "invalid" || unknownGroup || wrongGrade,
  };
}

export function evaluateRolloverPreview(input: PreviewInput): {
  rows: PreviewRow[];
  applyRows: ApplyRow[];
  summary: { graduate: number; promote: number; waiting: number };
} {
  const rows: PreviewRow[] = [];
  const pending: {
    row: PreviewRow;
    target: Target;
    student: PreviewStudent;
  }[] = [];

  const sameNameKey = (s: PreviewStudent) =>
    `${s.name}|${s.grade ?? ""}|${s.groupName ?? ""}|${s.className}`;
  const sameNameCounts = new Map<string, number>();
  for (const s of input.students) {
    if (s.className === null) continue;
    const key = sameNameKey(s);
    sameNameCounts.set(key, (sameNameCounts.get(key) ?? 0) + 1);
  }

  for (const line of input.lines) {
    const byName = input.students.filter((s) => s.name === line.name);
    const found = narrow(byName, line.from, input.orgType);
    const masked = maskName(line.name);
    if (found.length === 0 || found.length > 1) {
      const same = found.length > 1;
      rows.push({
        line: line.line,
        displayName: same ? `${masked}*` : masked,
        from: null,
        to: null,
        studentId: null,
        result: same ? "same_name" : "student_not_found",
      });
      continue;
    }
    const student = found[0] as PreviewStudent;
    const row: PreviewRow = {
      line: line.line,
      displayName:
        student.className !== null &&
        (sameNameCounts.get(sameNameKey(student)) ?? 0) > 1
          ? `${masked}*`
          : masked,
      from: slotOf(student),
      to: null,
      studentId: student.studentId,
      result: "applied",
    };
    rows.push(row);
    if (student.grade && input.graduatingGrades.includes(student.grade)) {
      row.result = "graduating";
      continue;
    }
    const target = targetOf(line, nextGrade(student.grade ?? ""), input);
    row.to = target.slot;
    if (target.checkNeeded) {
      row.result = "check_target";
      continue;
    }
    pending.push({ row, target, student });
  }

  const slotKey = (t: Target) =>
    t.slot.number === null
      ? null
      : `${t.groupId ?? ""}|${t.slot.className}|${t.slot.number}`;
  const seenKeys = new Map<string, number>();
  for (const p of pending) {
    const key = slotKey(p.target);
    if (key) seenKeys.set(key, (seenKeys.get(key) ?? 0) + 1);
  }
  const seenStudents = new Set<string>();
  const applyRows: ApplyRow[] = [];
  for (const { row, target, student } of pending) {
    const key = slotKey(target);
    if (
      (key && (seenKeys.get(key) ?? 0) > 1) ||
      seenStudents.has(student.studentId)
    ) {
      row.result = "duplicate_target";
      continue;
    }
    seenStudents.add(student.studentId);
    const homeroomKey = `${target.slot.grade}|${target.groupId ?? ""}|${target.slot.className}`;
    row.result = input.homeroomClasses.has(homeroomKey)
      ? "applied"
      : "no_homeroom";
    applyRows.push({
      studentId: student.studentId,
      groupId: target.groupId,
      className: target.slot.className as string,
      number: target.slot.number,
    });
  }

  const graduate = input.students.filter(
    (s) => s.grade && input.graduatingGrades.includes(s.grade),
  ).length;
  const promote = input.students.filter(
    (s) => s.grade && !input.graduatingGrades.includes(s.grade),
  ).length;
  return {
    rows,
    applyRows,
    summary: { graduate, promote, waiting: promote - applyRows.length },
  };
}
