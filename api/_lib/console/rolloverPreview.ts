// 학년도 넘기기 미리보기(W11 ③). 붙여넣은 명단 줄을 현재 재학생과 맞추고 줄마다 결과를 정한다.
// 순수 규칙만 둔다. 읽기와 응답은 라우트(school-year/rollover/preview)가 한다.
//
// 두 방식(mode): rollover 는 학년 +1 과 졸업, midyear 는 학년을 두고 그룹, 반, 번호만 바꾼다(학기 중 몇 번이든).
// 현재 학생이 없는 줄(student_not_found)은 pendingRows 로 돌려줘 가입 전 명단(미회원가입)으로 저장하게 한다.
//
// 결과: student_not_found 현재 학생이 없음(미회원가입), same_name 같은 이름이 둘 이상이라 사람이 확인, graduating 졸업 대상,
// check_target 새 학년, 그룹, 반, 번호를 확인해야 함, duplicate_target 같은 새 반과 번호가 겹침,
// no_homeroom 새 반에 담임이 없음(안내만, 반영됨), applied 반영.
// 졸업 학년은 호출부가 정한다(고3 항상, 중3 은 학교만). 새 학년은 현재 학년에서 한 학년 올린 값이다(중3 은 고1).
//
// 다학년(학원만, 학교는 아래 규칙이 모두 꺼진다): 학년 칸이 "다학년" 이면 그 줄은 다학년 학급 줄이다. 명단 양식(5칸) 줄은 학년 칸이
// 비어 있어도 다학년이다. 새 칸까지 있는 줄(9칸)의 빈 새 학년 칸은 예전처럼 학생의 학년을 쓰고, 목표 학급이 이미 다학년일
// 때만(mixedClasses) 다학년이다. 그 밖의 글(학년이 아닌 값)은 확인 대상이다. 줄끼리 퍼지지 않는다: 같은 학급을 가리키는 줄이
// 다학년과 실제 학년으로 갈리면 그 줄 모두 확인 대상이다. 다학년 줄은 학년으로 학생을 좁히지 않고(이름으로 찾음) 학생의
// 학년은 그대로 두거나(학기 중) 한 학년 올린다(넘기기).

import { maskName } from "./maskName.js";

/** 한 번에 읽는 명단 줄 수의 한도(미리보기와 적용이 같이 쓴다). */
export const MAX_ROWS = 3000;
/** 가입 전 줄의 이름과 반 이름 길이 한도(적용이 같은 한도로 막는다). */
export const MAX_NAME_LENGTH = 50;
export const MAX_CLASS_NAME_LENGTH = 30;

/** 제어 문자와 서식 문자(보이지 않는 글자)를 뺀 이름. */
export const cleanName = (name: string) =>
  name.replace(/[\p{Cc}\p{Cf}]/gu, "").trim();

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
  /** 학적 version. 학기 중 적용이 그 사이 바뀐 학생을 알아보는 데 쓴다. */
  version?: number;
  /** 지금 학급이 다학년 학급이면 true. 같은 이름의 학년 학급으로 옮기는 것도 반 변경이다. */
  mixedClass?: boolean;
}

export type PreviewResult =
  | "applied"
  | "student_not_found"
  | "graduating"
  | "check_target"
  | "duplicate_target"
  | "same_name"
  | "no_homeroom"
  | "class_changed";

export interface PreviewSlot {
  /** 다학년 학급이면 null. */
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
  /** 다학년 학급이면 true(아니면 키가 없다). */
  mixed?: boolean;
}

export interface PreviewRow {
  line: number;
  displayName: string;
  from: PreviewSlot | null;
  to: PreviewSlot | null;
  studentId: string | null;
  result: PreviewResult;
  /** 반이 바뀌는 줄(class_changed)에서 새 반에 담임이 없을 때. 두 사실을 같이 보인다. */
  noHomeroom?: boolean;
}

export interface ApplyRow {
  studentId: string;
  groupId: string | null;
  className: string;
  number: number | null;
  /** 학기 중 방식에서만. 미리보기 때의 학적 version. */
  version?: number;
  /** 다학년 학급 줄이면 true(아니면 키가 없다). */
  mixed?: boolean;
}

/** 가입하지 않은 학생의 명단 줄. 학년이나 반을 못 정한 줄은 null 로 두고 저장할 때 건너뛴다. */
export interface PendingRow {
  name: string;
  grade: string | null;
  groupId: string | null;
  className: string | null;
  number: number | null;
  /** 다학년 학급 줄이면 true(아니면 키가 없다). 학년은 줄에 적힌 실제 학년이거나 null 이다. */
  mixed?: boolean;
}

export interface PreviewInput {
  /** rollover 는 학년 +1 과 졸업, midyear 는 학년을 두고 그룹, 반, 번호만 바꾼다(서버가 정한다). */
  mode: "rollover" | "midyear";
  lines: ParsedLine[];
  students: PreviewStudent[];
  orgType: string | null;
  graduatingGrades: string[];
  /** 그룹 이름(소문자)에서 그룹. */
  groups: Map<string, { id: string; name: string }>;
  /** 새 학년도에 담임이 있는 학급: `${학년}|${그룹id 또는 빈 문자열}|${반 이름}`. */
  homeroomClasses: Set<string>;
  /** 새 학년도에 이미 다학년 학급인 학급: `${그룹id 또는 빈 문자열}|${반 이름 소문자}`. 학원만 쓴다. */
  mixedClasses?: Set<string>;
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

/** 학년 칸인가. "고2", "고2학년" 처럼 학년으로 시작하거나 "2", "2학년" 처럼 1부터 3까지 숫자뿐이면 학년이다. */
export function isGradeCell(cell: string): boolean {
  const text = cell.replace(/\s/g, "");
  return (
    ROLLOVER_GRADES.some((g) => text.startsWith(g)) ||
    /^[1-3](학년)?$/.test(text)
  );
}

/** 학원(학교가 아닌 기관)만 다학년 줄을 쓴다. */
const isAcademy = (orgType: string | null) => orgType !== "학교";

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

/** "고2" 처럼 학년이 적혔으면 그대로, "2학년" 처럼 숫자뿐이면 기관에 있는 학년 중 하나로 정해질 때만 정한다. */
function resolveGrade(cell: string, known: string[]): string | null {
  const text = cell.replace(/\s/g, "");
  const explicit = ROLLOVER_GRADES.find((g) => text.startsWith(g));
  if (explicit) return explicit;
  const digit = digitOf(text);
  if (!digit) return null;
  const hits = [...new Set(known)].filter((g) => g.endsWith(digit));
  return hits.length === 1 ? (hits[0] as string) : null;
}

function pendingOf(
  line: ParsedLine,
  midyear: boolean,
  input: PreviewInput,
  mixed: boolean,
): PendingRow | null {
  const current = input.students.flatMap((s) => (s.grade ? [s.grade] : []));
  const academy = isAcademy(input.orgType);
  const { from } = line;
  const to = isRosterOnly(line) ? { ...from, grade: "" } : line.to;
  let grade: string | null;
  // 학원에서 학년이 아닌 글("초6" 등)은 빈 칸으로 보고 글은 저장하지 않는다.
  const existing = resolveGrade(
    academy && !isGradeCell(from.grade) ? "" : from.grade,
    current,
  );
  if (!midyear && existing && input.graduatingGrades.includes(existing)) {
    // 졸업하는 학년의 명단 줄은 저장 대상에서 뺀다(건너뜀으로 세지 않는다).
    return null;
  } else if (midyear) {
    grade = existing;
  } else if (to.grade !== "" && (!academy || isGradeCell(to.grade))) {
    grade = resolveGrade(to.grade, current.map(nextGrade));
  } else {
    grade = existing === null ? null : nextGrade(existing);
  }
  const target = targetOf({ ...line, to }, grade ?? "", input, mixed);
  const unknownGroup = !isNoGroup(to.group) && target.groupId === null;
  return {
    name: cleanName(line.name),
    grade,
    groupId: target.groupId,
    className: unknownGroup ? null : target.slot.className,
    number: target.slot.number,
    ...(mixed && { mixed: true }),
  };
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
  mixed: boolean,
): Target {
  const { to } = line;
  const className = normalizeClassName(input.orgType, to.className);
  const number = parseNumber(to.number);
  const group = isNoGroup(to.group)
    ? null
    : (input.groups.get(to.group.toLowerCase()) ?? null);
  const groupId = group?.id ?? null;
  const unknownGroup = !isNoGroup(to.group) && group === null;
  // 학기 중에는 "고2" 처럼 학년을 적었으면 중학교인지 고등학교인지도 같아야 한다. 숫자만이면 숫자만 본다.
  const written = ROLLOVER_GRADES.find((g) =>
    to.grade.replace(/\s/g, "").startsWith(g),
  );
  const wrongGrade =
    !mixed &&
    to.grade !== "" &&
    (input.mode === "midyear" && written !== undefined
      ? written !== grade
      : digitOf(to.grade) !== digitOf(grade));
  return {
    slot: {
      grade: mixed ? null : grade,
      groupName: group?.name ?? (isNoGroup(to.group) ? null : to.group),
      className: className === "" ? null : className,
      number: number === "invalid" ? null : number,
      ...(mixed && { mixed: true }),
    },
    groupId,
    checkNeeded:
      className === "" || number === "invalid" || unknownGroup || wrongGrade,
  };
}

/** 이미 반이 있는 학생이 다른 반이나 그룹으로 옮겨 가는가. 번호만 바뀌면 아니다. */
function classChanges(student: PreviewStudent, target: Target): boolean {
  if (student.className === null) return false;
  return (
    (student.mixedClass ?? false) !== (target.slot.mixed ?? false) ||
    student.className !== target.slot.className ||
    (student.groupName?.toLowerCase() ?? null) !==
      (target.slot.groupName?.toLowerCase() ?? null)
  );
}

/** 새 칸(그룹, 반, 번호)이 모두 비어 있으면 명단 양식 줄이라 기존 칸이 곧 바뀔 값이다. */
const isRosterOnly = (line: ParsedLine) =>
  line.to.group === "" && line.to.className === "" && line.to.number === "";

/** 줄의 새 칸(그룹, 반, 번호). 명단 양식 줄이면 기존 칸이 곧 새 칸이다. */
const targetCellsOf = (line: ParsedLine) =>
  isRosterOnly(line) ? line.from : line.to;

/** 다학년 여부를 정하는 학년 칸: 명단 양식 줄은 기존 학년 칸, 새 칸까지 있는 줄은 새 학년 칸. */
const decidingGradeOf = (line: ParsedLine) =>
  isRosterOnly(line) ? line.from.grade : line.to.grade;

/** 줄이 가리키는 학급: `${그룹id 또는 빈 문자열}|${반 이름 소문자}`. 반이 비었거나 모르는 그룹이면 null. */
function classKeyOf(line: ParsedLine, input: PreviewInput): string | null {
  const cells = targetCellsOf(line);
  const className = normalizeClassName(
    input.orgType,
    cells.className,
  ).toLowerCase();
  if (className === "") return null;
  if (isNoGroup(cells.group)) return `|${className}`;
  const group = input.groups.get(cells.group.toLowerCase());
  return group ? `${group.id}|${className}` : null;
}

const isMixedToken = (cell: string) => cell.replace(/\s/g, "") === "다학년";

interface LineFlags {
  /** 다학년 학급 줄. */
  mixed: boolean;
  /** 학년 칸이 이상하거나 같은 학급을 가리키는 줄끼리 엇갈려 사람이 확인해야 하는 줄. */
  check: boolean;
}

/**
 * 줄마다 다학년 여부와 확인 대상 여부를 정한다(학원만, 학교는 모두 평소와 같다).
 * 다학년: 학년 칸이 "다학년", 5칸 줄의 빈 학년 칸, 목표 학급이 이미 다학년(mixedClasses).
 * 확인: 학년 칸이 학년도 다학년도 빈 칸도 아닌 글, 또 이미 다학년이 아닌 학급을 가리키는 줄이 다학년 줄과 실제 학년(또는
 * 학생 학년을 쓰는 빈 9칸 줄)으로 갈리면 그 줄 모두.
 */
function flagLines(input: PreviewInput): Map<ParsedLine, LineFlags> {
  const flags = new Map<ParsedLine, LineFlags>();
  if (!isAcademy(input.orgType)) return flags;
  const existing = input.mixedClasses ?? new Set<string>();
  type Kind = "grade" | "mixed" | "blank" | "junk";
  const kindOf = (line: ParsedLine): Kind => {
    const cell = decidingGradeOf(line);
    if (isGradeCell(cell)) return "grade";
    if (isMixedToken(cell)) return "mixed";
    if (cell.trim() === "") return isRosterOnly(line) ? "mixed" : "blank";
    return "junk";
  };
  const byClass = new Map<string, ParsedLine[]>();
  for (const line of input.lines) {
    const key = classKeyOf(line, input);
    if (key === null || existing.has(key) || kindOf(line) === "junk") continue;
    byClass.set(key, [...(byClass.get(key) ?? []), line]);
  }
  const conflicting = new Set<ParsedLine>();
  for (const lines of byClass.values()) {
    const kinds = lines.map(kindOf);
    if (kinds.includes("mixed") && kinds.some((k) => k !== "mixed")) {
      for (const line of lines) conflicting.add(line);
    }
  }
  for (const line of input.lines) {
    const key = classKeyOf(line, input);
    const kind = kindOf(line);
    flags.set(line, {
      check: kind === "junk" || conflicting.has(line),
      mixed: kind === "mixed" || (key !== null && existing.has(key)),
    });
  }
  return flags;
}

export function evaluateRolloverPreview(input: PreviewInput): {
  rows: PreviewRow[];
  applyRows: ApplyRow[];
  pendingRows: PendingRow[];
  summary: { graduate: number; promote: number; waiting: number };
} {
  const midyear = input.mode === "midyear";
  const academy = isAcademy(input.orgType);
  const lineFlags = flagLines(input);
  const rows: PreviewRow[] = [];
  const pendingRows: PendingRow[] = [];
  const pending: {
    row: PreviewRow;
    target: Target;
    student: PreviewStudent;
    mixed: boolean;
  }[] = [];

  const sameNameKey = (s: PreviewStudent) =>
    `${s.name}|${s.grade ?? ""}|${s.groupName ?? ""}|${s.className}`;
  const sameNameCounts = new Map<string, number>();
  for (const s of input.students) {
    if (s.className === null) continue;
    const key = sameNameKey(s);
    sameNameCounts.set(key, (sameNameCounts.get(key) ?? 0) + 1);
  }

  const rosterOnlyOf = (line: ParsedLine) => midyear && isRosterOnly(line);
  // 학원에서 학년이 아닌 글("초6" 등)은 빈 칸처럼 학생을 좁히지 않는다.
  const matchGrade = (cell: string) =>
    academy && !isGradeCell(cell) ? "" : cell;
  const foundFor = (line: ParsedLine) =>
    narrow(
      input.students.filter((s) => s.name === line.name),
      // 학기 중 명단 양식 줄은 이름과 학년으로만 찾는다(기존 반과 번호는 곧 바뀔 값이다).
      rosterOnlyOf(line)
        ? {
            grade: matchGrade(line.from.grade),
            group: "",
            className: "",
            number: "",
          }
        : { ...line.from, grade: matchGrade(line.from.grade) },
      input.orgType,
    );
  // 학기 중에는 한 학생을 가리키는 줄이 둘 이상이면 어느 줄이 맞는지 알 수 없어 모두 사람이 확인한다.
  const lineCounts = new Map<string, number>();
  if (midyear) {
    for (const line of input.lines) {
      const found = foundFor(line);
      if (found.length === 1) {
        const id = (found[0] as PreviewStudent).studentId;
        lineCounts.set(id, (lineCounts.get(id) ?? 0) + 1);
      }
    }
  }

  for (const line of input.lines) {
    const rosterOnly = rosterOnlyOf(line);
    const found = foundFor(line);
    const masked = maskName(line.name);
    const name = cleanName(line.name);
    // 길이 한도를 넘는 줄은 적용이 막으므로 미리보기에서 먼저 확인 대상으로 돌린다.
    if (
      name === "" ||
      name.length > MAX_NAME_LENGTH ||
      [line.from.className, line.to.className].some(
        (c) => c.length > MAX_CLASS_NAME_LENGTH,
      )
    ) {
      rows.push({
        line: line.line,
        displayName: masked,
        from: null,
        to: null,
        studentId: null,
        result: "check_target",
      });
      continue;
    }
    if (lineFlags.get(line)?.check) {
      rows.push({
        line: line.line,
        displayName: masked,
        from: null,
        to: null,
        studentId: null,
        result: "check_target",
      });
      continue;
    }
    const repeated =
      found.length === 1 &&
      (lineCounts.get((found[0] as PreviewStudent).studentId) ?? 0) > 1;
    if (found.length === 0 || found.length > 1 || repeated) {
      const same = found.length > 1 || repeated;
      // 학기 중에 이름이 같은 가입 학생이 다른 학년에 있으면 가입 전 줄로 만들지 않고 확인하게 한다.
      const registeredElsewhere =
        midyear &&
        found.length === 0 &&
        input.students.some((s) => s.name === line.name);
      if (registeredElsewhere) {
        rows.push({
          line: line.line,
          displayName: masked,
          from: null,
          to: null,
          studentId: null,
          result: "check_target",
        });
        continue;
      }
      if (!same) {
        const pendingRow = pendingOf(
          line,
          midyear,
          input,
          lineFlags.get(line)?.mixed ?? false,
        );
        if (pendingRow) pendingRows.push(pendingRow);
      }
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
    if (midyear && !student.grade) {
      row.result = "check_target";
      continue;
    }
    if (
      !midyear &&
      student.grade &&
      input.graduatingGrades.includes(student.grade)
    ) {
      row.result = "graduating";
      continue;
    }
    // 학기 중에는 학년을 바꾸지 않으므로 새 학년 칸이 지금 학년과 다르면 targetOf 가 확인 대상으로 돌린다.
    const toLine: ParsedLine = rosterOnly
      ? { ...line, to: { ...line.from, grade: line.to.grade } }
      : line;
    const mixed = lineFlags.get(line)?.mixed ?? false;
    const target = targetOf(
      toLine,
      midyear ? (student.grade as string) : nextGrade(student.grade ?? ""),
      input,
      mixed,
    );
    row.to = target.slot;
    if (target.checkNeeded) {
      row.result = "check_target";
      continue;
    }
    pending.push({ row, target, student, mixed });
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
  for (const { row, target, student, mixed } of pending) {
    const key = slotKey(target);
    if (
      (key && (seenKeys.get(key) ?? 0) > 1) ||
      seenStudents.has(student.studentId)
    ) {
      row.result = "duplicate_target";
      continue;
    }
    seenStudents.add(student.studentId);
    const homeroomKey = `${mixed ? "" : target.slot.grade}|${target.groupId ?? ""}|${target.slot.className}`;
    row.result = input.homeroomClasses.has(homeroomKey)
      ? "applied"
      : "no_homeroom";
    // 학기 중 반이나 그룹이 바뀌는 학생은 눈에 띄게 한다(반영은 된다).
    if (midyear && classChanges(student, target)) {
      if (row.result === "no_homeroom") row.noHomeroom = true;
      row.result = "class_changed";
    }
    applyRows.push({
      studentId: student.studentId,
      groupId: target.groupId,
      className: target.slot.className as string,
      number: target.slot.number,
      ...(midyear && { version: student.version }),
      ...(mixed && { mixed: true }),
    });
  }

  if (midyear) {
    return {
      rows,
      applyRows,
      pendingRows,
      summary: { graduate: 0, promote: 0, waiting: 0 },
    };
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
    pendingRows,
    summary: { graduate, promote, waiting: promote - applyRows.length },
  };
}
