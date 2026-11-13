// 학년도 넘기기 미리보기 규칙 검증(W11 ③). 붙여넣은 명단을 현재 학생과 맞추고 줄마다 결과를 정한다.

import { describe, expect, test } from "vitest";
import {
  evaluateRolloverPreview,
  normalizeClassName,
  type PreviewStudent,
  parseRolloverText,
} from "./rolloverPreview.js";

describe("parseRolloverText", () => {
  test("reads tab separated rows, skips blank lines and the header, and keeps the original line numbers", () => {
    const text = [
      "이름\t기존 학년그룹\t그룹\t반\t번호\t새 학년그룹\t그룹\t반\t번호",
      "",
      "김하늘\t1학년\t없음\t4반\t7번\t2학년\t없음\t3반\t8번",
    ].join("\r\n");

    expect(parseRolloverText(text)).toEqual([
      {
        line: 3,
        name: "김하늘",
        from: {
          grade: "1학년",
          group: "없음",
          className: "4반",
          number: "7번",
        },
        to: { grade: "2학년", group: "없음", className: "3반", number: "8번" },
      },
    ]);
  });

  test("reads comma separated rows, trims cells and fills missing trailing cells with empty strings", () => {
    expect(parseRolloverText("윤하린, 고2 , A레벨, 3, 5")).toEqual([
      {
        line: 1,
        name: "윤하린",
        from: { grade: "고2", group: "A레벨", className: "3", number: "5" },
        to: { grade: "", group: "", className: "", number: "" },
      },
    ]);
  });
});

describe("normalizeClassName", () => {
  test("a school keeps the digits without leading zeros, an academy removes whitespace (fn_normalize_class_name)", () => {
    expect(normalizeClassName("학교", "03반")).toBe("3");
    expect(normalizeClassName("학교", "반")).toBe("");
    expect(normalizeClassName("학원", " A 반 ")).toBe("A반");
  });
});

const student = (
  over: Partial<PreviewStudent> & { studentId: string; name: string },
): PreviewStudent => ({
  grade: "고1",
  groupName: null,
  className: "4",
  number: 7,
  ...over,
});

const base = {
  mode: "rollover" as "rollover" | "midyear",
  orgType: "학원",
  graduatingGrades: ["고3"],
  groups: new Map([["a레벨", { id: "g-a", name: "A레벨" }]]),
  homeroomClasses: new Set<string>(),
};

function run(
  text: string,
  students: PreviewStudent[],
  over: Partial<typeof base> = {},
) {
  return evaluateRolloverPreview({
    ...base,
    ...over,
    lines: parseRolloverText(text),
    students,
  });
}

describe("evaluateRolloverPreview", () => {
  const kim = student({ studentId: "s1", name: "김하늘" });

  test("a matched student with a new class and number is applied with the new grade worked out from the current one", () => {
    const r = run("김하늘\t1학년\t없음\t4\t7번\t2학년\t없음\t3\t8번", [kim]);

    expect(r.rows).toEqual([
      {
        line: 1,
        displayName: "김*늘",
        from: { grade: "고1", groupName: null, className: "4", number: 7 },
        to: { grade: "고2", groupName: null, className: "3", number: 8 },
        studentId: "s1",
        result: "no_homeroom",
      },
    ]);
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "3", number: 8 },
    ]);
  });

  test("a target class that already has a homeroom is plainly applied", () => {
    const r = run("김하늘,1학년,,4,7,2학년,,3,8", [kim], {
      homeroomClasses: new Set(["고2||3"]),
    });
    expect(r.rows[0]?.result).toBe("applied");
  });

  test("the group name is looked up case-insensitively and an unknown group needs a check", () => {
    const known = run("김하늘,1학년,,4,7,2학년,a레벨,3,8", [kim], {
      homeroomClasses: new Set(["고2|g-a|3"]),
    });
    expect(known.rows[0]).toMatchObject({
      result: "applied",
      to: { groupName: "A레벨" },
    });
    expect(known.applyRows[0]?.groupId).toBe("g-a");

    const unknown = run("김하늘,1학년,,4,7,2학년,Z레벨,3,8", [kim]);
    expect(unknown.rows[0]?.result).toBe("check_target");
    expect(unknown.applyRows).toEqual([]);
  });

  test("a name that is not a current student is student_not_found", () => {
    const r = run("없는사람,1학년,,4,7,2학년,,3,8", [kim]);
    expect(r.rows[0]).toMatchObject({
      result: "student_not_found",
      studentId: null,
      from: null,
      to: null,
    });
    expect(r.applyRows).toEqual([]);
  });

  test("the current class and number narrow same-name students and unresolved same names get a trailing star for a human to check", () => {
    const twinA = student({
      studentId: "t1",
      name: "김하늘",
      className: "4",
      number: 7,
    });
    const twinB = student({
      studentId: "t2",
      name: "김하늘",
      className: "5",
      number: 2,
    });

    const narrowed = run("김하늘,1학년,,4,7,2학년,,3,8", [twinA, twinB]);
    expect(narrowed.rows[0]).toMatchObject({ studentId: "t1" });

    const unresolved = run("김하늘,,,,,2학년,,3,8", [twinA, twinB]);
    expect(unresolved.rows[0]).toMatchObject({
      result: "same_name",
      studentId: null,
      displayName: "김*늘*",
    });
    expect(unresolved.applyRows).toEqual([]);
  });

  test("a student in a graduating grade is graduating and has no target", () => {
    const senior = student({ studentId: "s3", name: "박서준", grade: "고3" });
    const r = run("박서준,3학년,,4,7,,,,", [senior]);
    expect(r.rows[0]).toMatchObject({
      result: "graduating",
      to: null,
      studentId: "s3",
    });
    expect(r.applyRows).toEqual([]);
  });

  test("a blank new class, a different new grade or a bad number needs a check and is not applied", () => {
    for (const line of [
      "김하늘,1학년,,4,7,2학년,,,8",
      "김하늘,1학년,,4,7,3학년,,3,8",
      "김하늘,1학년,,4,7,2학년,,3,100",
    ]) {
      const r = run(line, [kim]);
      expect(r.rows[0]?.result).toBe("check_target");
      expect(r.applyRows).toEqual([]);
    }
  });

  test("a blank new number is applied with no number", () => {
    const r = run("김하늘,1학년,,4,7,2학년,,3,", [kim]);
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "3", number: null },
    ]);
  });

  test("two rows into the same new class and number are both duplicate_target and neither is applied", () => {
    const lee = student({
      studentId: "s2",
      name: "이도윤",
      className: "5",
      number: 1,
    });
    const r = run(
      ["김하늘,1학년,,4,7,2학년,,3,8", "이도윤,1학년,,5,1,2학년,,3,8"].join(
        "\n",
      ),
      [kim, lee],
    );
    expect(r.rows.map((x) => x.result)).toEqual([
      "duplicate_target",
      "duplicate_target",
    ]);
    expect(r.applyRows).toEqual([]);
  });

  test("the middle school third year graduates only for a school", () => {
    const mid = student({ studentId: "s4", name: "최민호", grade: "중3" });
    const academy = run("최민호,3학년,,4,7,1학년,,2,3", [mid]);
    expect(academy.rows[0]).toMatchObject({ to: { grade: "고1" } });

    const school = run("최민호,3학년,,4,7,,,,", [mid], {
      orgType: "학교",
      graduatingGrades: ["중3", "고3"],
    });
    expect(school.rows[0]?.result).toBe("graduating");
  });

  test("the summary counts the whole tenant: graduating students, promoted students, and promoted students without an applied row", () => {
    const lee = student({
      studentId: "s2",
      name: "이도윤",
      className: "5",
      number: 1,
    });
    const senior = student({ studentId: "s3", name: "박서준", grade: "고3" });
    const pool = student({
      studentId: "s5",
      name: "정수아",
      grade: null,
      className: null,
      number: null,
    });

    const r = run("김하늘,1학년,,4,7,2학년,,3,8", [kim, lee, senior, pool]);

    expect(r.summary).toEqual({ graduate: 1, promote: 2, waiting: 1 });
  });

  test("students missing from the pasted list still count as promoted or graduating, and the unlisted promoted ones wait for a class", () => {
    const listed = student({ studentId: "s1", name: "김하늘" });
    const unlisted = student({ studentId: "s2", name: "이도윤" });
    const unlistedSenior = student({
      studentId: "s3",
      name: "박서준",
      grade: "고3",
    });

    const r = run("김하늘,1학년,,4,7,2학년,,3,8", [
      listed,
      unlisted,
      unlistedSenior,
    ]);

    expect(r.applyRows).toHaveLength(1);
    expect(r.summary).toEqual({ graduate: 1, promote: 2, waiting: 1 });
  });

  test("a uniquely matched row gets a star when its class has another student with the same real name, numberless students count", () => {
    const a = student({ studentId: "s1", name: "김준호", number: 14 });
    const b = student({ studentId: "s2", name: "김준호", number: null });
    const r = run("김준호,1학년,,4,14\n김준호,1학년,,4,", [a, b]);

    expect(r.rows[0]).toMatchObject({
      displayName: "김*호*",
      studentId: "s1",
    });
    expect(r.rows[1]).toMatchObject({
      displayName: "김*호*",
      result: "same_name",
    });
  });

  test("same name in different classes, a single student, and a not found row get no star", () => {
    const a = student({ studentId: "s1", name: "김준호", className: "4" });
    const b = student({ studentId: "s2", name: "김준호", className: "5" });
    const r = run("김준호,1학년,,4,7\n박민수,1학년,,4,7", [a, b]);

    expect(r.rows[0]?.displayName).toBe("김*호");
    expect(r.rows[1]).toMatchObject({
      displayName: "박*수",
      result: "student_not_found",
    });
  });
});

describe("evaluateRolloverPreview in mid-year mode", () => {
  const kim = student({ studentId: "s1", name: "김하늘", grade: "고1" });
  const midyear = { mode: "midyear" as const };

  test("only group, class and number change: the student's grade stays, and a class change is shown as class_changed (still applied)", () => {
    const r = run("김하늘,1학년,,4,7,1학년,a레벨,5,2", [kim], {
      ...midyear,
      homeroomClasses: new Set(["고1|g-a|5"]),
    });

    expect(r.rows[0]).toMatchObject({
      studentId: "s1",
      result: "class_changed",
      to: { grade: "고1", groupName: "A레벨", className: "5", number: 2 },
    });
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: "g-a", className: "5", number: 2 },
    ]);
  });

  test("a number-only change in the same class is plainly applied", () => {
    const r = run("김하늘,1학년,,4,7,,,4,9", [kim], midyear);
    expect(r.rows[0]?.result).toBe("no_homeroom");
    expect(r.applyRows).toHaveLength(1);
  });

  test("a registered student, a line with the same name and grade but another class: applied with a class change", () => {
    const r = run("김하늘,1학년,,9,3", [kim], midyear);
    expect(r.rows[0]?.result).toBe("class_changed");
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "9", number: 3 },
    ]);
  });

  test("a new grade cell that differs from the current grade needs a check and is not applied", () => {
    const r = run("김하늘,1학년,,4,7,3학년,,5,2", [kim], midyear);
    expect(r.rows[0]?.result).toBe("check_target");
    expect(r.applyRows).toEqual([]);
  });

  test("two lines for the same registered student are all same_name: none applied, none pending", () => {
    const r = run("김하늘,1학년,,9,3\n김하늘,1학년,,8,2", [kim], midyear);
    expect(r.rows.map((x) => x.result)).toEqual(["same_name", "same_name"]);
    expect(r.rows.every((x) => x.studentId === null)).toBe(true);
    expect(r.applyRows).toEqual([]);
    expect(r.pendingRows).toEqual([]);
  });

  test("a registered name in another grade needs a check: not applied, not stored as pending", () => {
    const r = run("김하늘,2학년,,4,7", [kim], midyear);
    expect(r.rows[0]).toMatchObject({
      result: "check_target",
      studentId: null,
    });
    expect(r.applyRows).toEqual([]);
    expect(r.pendingRows).toEqual([]);
  });

  test("a name nobody registered is still pending", () => {
    const r = run("모르는사람,2학년,,4,7", [kim], midyear);
    expect(r.rows[0]?.result).toBe("student_not_found");
    expect(r.pendingRows).toHaveLength(1);
  });

  test("an explicit new grade must match the stage too: 고2 for a 중2 student is a check, 2학년 and 2 are fine", () => {
    const mid = student({ studentId: "m", name: "중이", grade: "중2" });
    const wrong = run("중이,2학년,,4,7,고2,,5,1", [mid], midyear);
    expect(wrong.rows[0]?.result).toBe("check_target");
    expect(wrong.applyRows).toEqual([]);
    for (const cell of ["2학년", "2", "중2"]) {
      const ok = run(`중이,2학년,,4,7,${cell},,5,1`, [mid], midyear);
      expect(ok.applyRows).toHaveLength(1);
    }
  });

  test("a class change with no homeroom in the new class keeps both facts", () => {
    const r = run("김하늘,1학년,,4,7,1학년,,5,2", [kim], midyear);
    expect(r.rows[0]).toMatchObject({
      result: "class_changed",
      noHomeroom: true,
    });
    const withHomeroom = run("김하늘,1학년,,4,7,1학년,,5,2", [kim], {
      ...midyear,
      homeroomClasses: new Set(["고1||5"]),
    });
    expect(withHomeroom.rows[0]?.noHomeroom).toBeUndefined();
  });

  test("limits: a name over 50 characters or a class name over 30 is a check at preview time, never applied or stored", () => {
    const longName = "가".repeat(51);
    const longClass = "나".repeat(31);
    const r = run(
      `${longName},1학년,,4,7\n김하늘,1학년,,4,7,1학년,,${longClass},1\n새사람,1학년,,${longClass},1`,
      [kim],
      midyear,
    );
    expect(r.rows.map((x) => x.result)).toEqual([
      "check_target",
      "check_target",
      "check_target",
    ]);
    expect(r.applyRows).toEqual([]);
    expect(r.pendingRows).toEqual([]);
  });

  test("a student in the top grade is not graduating", () => {
    const r = run(
      "박서준,3학년,,4,7,,,6,1",
      [student({ studentId: "s3", name: "박서준", grade: "고3" })],
      { ...midyear, graduatingGrades: ["고3"] },
    );

    expect(r.rows[0]?.result).not.toBe("graduating");
    expect(r.applyRows).toHaveLength(1);
  });

  test("students missing from the list are not counted as promoted or graduating", () => {
    const r = run(
      "김하늘,1학년,,4,7,,,6,1",
      [kim, student({ studentId: "s2", name: "윤하린", grade: "고3" })],
      midyear,
    );

    expect(r.summary).toEqual({ graduate: 0, promote: 0, waiting: 0 });
  });

  test("a line with only the roster cells (no new cells) takes those cells as the target and matches by name and grade", () => {
    const r = run(
      "김하늘,1학년,,9,3",
      [
        student({
          studentId: "s1",
          name: "김하늘",
          grade: "고1",
          className: "4",
          number: 7,
        }),
      ],
      midyear,
    );

    expect(r.rows[0]).toMatchObject({
      studentId: "s1",
      result: "class_changed",
      to: { grade: "고1", className: "9", number: 3 },
    });
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "9", number: 3 },
    ]);
  });
});

describe("evaluateRolloverPreview pendingRows (미회원가입)", () => {
  test("in rollover a line whose existing grade graduates is not stored (left out of the pending list, not counted as skipped)", () => {
    const r = run(
      "없는사람,고3,,4,7\n없는둘,고1,,4,7",
      [student({ studentId: "s1", name: "김하늘", grade: "고1" })],
      { graduatingGrades: ["고3"] },
    );
    // 졸업하는 학년 줄은 저장 대상에서 아예 뺀다(건너뜀으로 세지 않는다).
    expect(r.pendingRows.map((p) => p.grade)).toEqual(["고2"]);
  });

  const kim = student({ studentId: "s1", name: "김하늘", grade: "고1" });

  test("a not found line is kept with its new cells as the target, in mid-year the grade is the existing grade cell", () => {
    const r = run("없는사람,1학년,,4,7,2학년,a레벨,3,8", [kim], {
      mode: "midyear",
    });

    expect(r.rows[0]?.result).toBe("student_not_found");
    expect(r.pendingRows).toEqual([
      {
        name: "없는사람",
        grade: "고1",
        groupId: "g-a",
        className: "3",
        number: 8,
      },
    ]);
  });

  test("with empty new cells the existing cells are the target; in rollover the grade is the next grade", () => {
    const line = "없는사람,고1,,4,7";
    expect(run(line, [kim], { mode: "midyear" }).pendingRows).toEqual([
      {
        name: "없는사람",
        grade: "고1",
        groupId: null,
        className: "4",
        number: 7,
      },
    ]);
    expect(run(line, [kim]).pendingRows).toEqual([
      {
        name: "없는사람",
        grade: "고2",
        groupId: null,
        className: "4",
        number: 7,
      },
    ]);
  });

  test("a digit only grade is resolved against the grades the tenant has; an ambiguous or unknown one stays unresolved", () => {
    const mixed = [
      student({ studentId: "a", name: "가", grade: "중2" }),
      student({ studentId: "b", name: "나", grade: "고2" }),
    ];
    const r = run("없는사람,2학년,,4,7", mixed, { mode: "midyear" });
    expect(r.pendingRows).toEqual([
      {
        name: "없는사람",
        grade: null,
        groupId: null,
        className: "4",
        number: 7,
      },
    ]);
  });

  test("a line without a class, or with an unknown group, has no class so the apply skips it", () => {
    const r = run("없는사람,1학년,,,\n없는둘,1학년,Z레벨,4,1", [kim], {
      mode: "midyear",
    });
    expect(r.pendingRows.map((p) => p.className)).toEqual([null, null]);
  });

  test("same_name lines and matched lines are not pending", () => {
    const twin = [
      student({ studentId: "s1", name: "김하늘", grade: "고1", number: 1 }),
      student({ studentId: "s2", name: "김하늘", grade: "고1", number: 2 }),
    ];
    const r = run("김하늘,1학년,,4,,,,5,1", twin, { mode: "midyear" });
    expect(r.rows[0]?.result).toBe("same_name");
    expect(r.pendingRows).toEqual([]);
  });
});
