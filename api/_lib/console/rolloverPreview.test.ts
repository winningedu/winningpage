// 학년도 넘기기 미리보기 규칙 검증(W11 ③). 붙여넣은 명단을 현재 학생과 맞추고 줄마다 결과를 정한다.

import { describe, expect, test } from "vitest";
import {
  evaluateRolloverPreview,
  isGradeCell,
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
  mixedClasses: new Set<string>(),
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
    expect(r.rows[0]).toMatchObject({
      result: "no_homeroom",
      to: { grade: "고1", className: "4", number: 9 },
    });
    expect(r.rows[0]?.to).not.toHaveProperty("mixed");
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "4", number: 9 },
    ]);
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

describe("isGradeCell", () => {
  test.each([
    "고2",
    " 고 2 ",
    "중3",
    "고1반",
    "고2학년",
    "1",
    "2학년",
    " 3 학년 ",
  ])("%s is a grade cell", (cell) => {
    expect(isGradeCell(cell)).toBe(true);
  });

  test.each(["", "   ", "다학년", "초6", "4학년", "4", "중등", "고4", "혼합"])(
    "%j is not a grade cell",
    (cell) => {
      expect(isGradeCell(cell)).toBe(false);
    },
  );
});

describe("mixed-grade lines (다학년, academy only)", () => {
  const kim = student({ studentId: "s1", name: "김하늘", grade: "고1" });
  const lee = student({
    studentId: "s2",
    name: "이서준",
    grade: "고1",
    className: "4",
    number: 8,
  });
  const midyear = { mode: "midyear" as const };

  describe("R1 what makes a line 다학년", () => {
    test("a 5-column line with a blank grade cell is mixed: the student keeps the grade, the slot says mixed", () => {
      const r = run("김하늘,,,A,3", [kim], {
        ...midyear,
        homeroomClasses: new Set(["||A"]),
      });

      expect(r.rows[0]).toMatchObject({
        studentId: "s1",
        result: "class_changed",
        to: { grade: null, mixed: true, className: "A", number: 3 },
      });
      expect(r.applyRows).toEqual([
        {
          studentId: "s1",
          groupId: null,
          className: "A",
          number: 3,
          mixed: true,
        },
      ]);
    });

    test.each([" 다학년 ", "다 학년"])(
      "the token %j on a 5-column line is mixed",
      (cell) => {
        const r = run(`김하늘,${cell},,A,3`, [kim], midyear);
        expect(r.applyRows).toMatchObject([{ className: "A", mixed: true }]);
      },
    );

    test("the token on a 9-column line is mixed in a mid-year and in a rollover", () => {
      const mid = run("김하늘,1학년,,4,7,다학년,,A,3", [kim], midyear);
      const roll = run("김하늘,1학년,,4,7,다학년,,A,3", [kim], {
        homeroomClasses: new Set(["||A"]),
      });

      expect(mid.applyRows).toMatchObject([{ className: "A", mixed: true }]);
      expect(roll.rows[0]).toMatchObject({
        result: "applied",
        to: { grade: null, mixed: true, className: "A", number: 3 },
      });
    });

    test("a class that already exists as mixed makes a real-grade line mixed but keeps the student's own grade", () => {
      const r = run("김하늘,고1,,A,3", [kim], {
        ...midyear,
        mixedClasses: new Set(["|a"]),
      });

      expect(r.applyRows).toMatchObject([{ studentId: "s1", mixed: true }]);
      expect(r.rows[0]).toMatchObject({ to: { grade: null, mixed: true } });
    });

    test("an existing mixed class is matched by group and name, not by name alone", () => {
      const r = run("김하늘,고1,,A,3", [kim], {
        ...midyear,
        mixedClasses: new Set(["g-a|a"]),
      });

      expect(r.applyRows[0]).not.toHaveProperty("mixed");
    });

    test("a real grade cell is an ordinary line", () => {
      const r = run("김하늘,고1,,A,3", [kim], midyear);

      expect(r.rows[0]?.to).toMatchObject({ grade: "고1", className: "A" });
      expect(r.rows[0]?.to).not.toHaveProperty("mixed");
      expect(r.applyRows[0]).not.toHaveProperty("mixed");
    });
  });

  describe("R2 a blank new grade on a 9-column line is not 다학년", () => {
    test("mid-year keeps the student's grade and the graded class (number change only)", () => {
      const r = run("김하늘,1학년,,4,7,,,4,9", [kim], midyear);

      expect(r.rows[0]).toMatchObject({
        to: { grade: "고1", className: "4", number: 9 },
      });
      expect(r.applyRows[0]).not.toHaveProperty("mixed");
    });

    test("a rollover uses the next grade", () => {
      const r = run("김하늘,1학년,,4,7,,,4,9", [kim]);

      expect(r.rows[0]).toMatchObject({ to: { grade: "고2", className: "4" } });
      expect(r.applyRows[0]).not.toHaveProperty("mixed");
    });

    test("a pending 9-column line with a blank new grade is graded in a rollover and in a mid-year", () => {
      const line = "모르는사람,고1,,A,3,,,B,4";
      expect(run(line, [kim]).pendingRows).toEqual([
        {
          name: "모르는사람",
          grade: "고2",
          groupId: null,
          className: "B",
          number: 4,
        },
      ]);
      expect(run(line, [kim], midyear).pendingRows).toEqual([
        {
          name: "모르는사람",
          grade: "고1",
          groupId: null,
          className: "B",
          number: 4,
        },
      ]);
    });

    test("it is 다학년 only when the target class already is one (R1c)", () => {
      const r = run("김하늘,1학년,,4,7,,,A,3", [kim], {
        ...midyear,
        mixedClasses: new Set(["|a"]),
      });

      expect(r.applyRows).toMatchObject([{ className: "A", mixed: true }]);
    });
  });

  describe("R3 other text in the deciding grade cell is a check", () => {
    test.each([
      "4",
      "고4",
      "１",
      "1반",
      "3-2",
      "초6",
      "중등",
      "A레벨",
      "4학년",
    ])(
      "%j on a 5-column line needs a check and is neither applied nor stored",
      (cell) => {
        const r = run(
          `김하늘,${cell},,A,3\n모르는사람,${cell},,A,4`,
          [kim],
          midyear,
        );

        expect(r.rows.map((x) => x.result)).toEqual([
          "check_target",
          "check_target",
        ]);
        expect(r.applyRows).toEqual([]);
        expect(r.pendingRows).toEqual([]);
      },
    );

    test.each(["4", "고4", "1반", "초6", "중등", "A레벨"])(
      "%j in the new grade cell of a 9-column line needs a check",
      (cell) => {
        const mid = run(`김하늘,1학년,,4,7,${cell},,A,3`, [kim], midyear);
        const roll = run(`김하늘,1학년,,4,7,${cell},,A,3`, [kim]);

        expect(mid.rows[0]?.result).toBe("check_target");
        expect(roll.rows[0]?.result).toBe("check_target");
        expect(mid.applyRows).toEqual([]);
        expect(roll.applyRows).toEqual([]);
      },
    );

    test("free text in the existing-grade cell of a 9-column line is ignored for matching", () => {
      const r = run("김하늘,초6,,4,7,1학년,,5,1", [kim], midyear);

      expect(r.rows[0]).toMatchObject({ studentId: "s1" });
    });
  });

  describe("R4 no spreading, and disagreeing lines are all checked", () => {
    test("two graded lines in other classes stay graded and are not mixed", () => {
      const r = run(
        "김하늘,고1,,4,7,고1,,5,1\n이서준,고1,,4,8,,,5,2",
        [kim, lee],
        midyear,
      );

      expect(r.rows.map((x) => x.result)).not.toContain("check_target");
      expect(r.applyRows).toHaveLength(2);
      for (const a of r.applyRows) expect(a).not.toHaveProperty("mixed");
      for (const row of r.rows) expect(row.to).not.toHaveProperty("mixed");
    });

    test("a mixed line does not convert a graded line aimed at another class", () => {
      const r = run("김하늘,고1,,B,3\n이서준,,,A,4", [kim, lee], midyear);

      const byId = Object.fromEntries(r.applyRows.map((a) => [a.studentId, a]));
      expect(byId.s1).not.toHaveProperty("mixed");
      expect(byId.s2).toMatchObject({ mixed: true });
    });

    test("graded and mixed lines aimed at the same class are all check_target, whatever the order, and none is applied or stored", () => {
      const text = ["김하늘,고1,,A,3", "이서준,,,A,4", "모르는사람,고2,,A,5"];
      for (const lines of [text, [...text].reverse()]) {
        const r = run(lines.join("\n"), [kim, lee], midyear);

        expect(r.rows.map((x) => x.result)).toEqual(
          lines.map(() => "check_target"),
        );
        expect(r.applyRows).toEqual([]);
        expect(r.pendingRows).toEqual([]);
      }
    });

    test("two graded A lines of different grades plus a blank 5-column A line are all checked", () => {
      const r = run(
        "김하늘,고1,,A,3\n이서준,고2,,A,4\n모르는사람,,,A,5",
        [kim, lee],
        midyear,
      );

      expect(r.rows.map((x) => x.result)).toEqual([
        "check_target",
        "check_target",
        "check_target",
      ]);
      expect(r.applyRows).toEqual([]);
    });

    test("only mixed lines, or only graded lines, into one class are fine", () => {
      const mixedOnly = run(
        "김하늘,,,A,3\n이서준,다학년,,A,4",
        [kim, lee],
        midyear,
      );
      const gradedOnly = run(
        "김하늘,고1,,A,3\n이서준,고1,,A,4",
        [kim, lee],
        midyear,
      );

      expect(mixedOnly.applyRows.every((a) => a.mixed)).toBe(true);
      expect(mixedOnly.applyRows).toHaveLength(2);
      expect(gradedOnly.applyRows).toHaveLength(2);
    });

    test("when the class is already mixed (R1c) there is no disagreement: every line goes to it", () => {
      const r = run("김하늘,고1,,A,3\n이서준,,,A,4", [kim, lee], {
        ...midyear,
        mixedClasses: new Set(["|a"]),
      });

      expect(r.applyRows.map((a) => a.mixed)).toEqual([true, true]);
    });

    test("the same class name in another group is not the same class", () => {
      const r = run("김하늘,고1,,A,3\n이서준,,A레벨,A,4", [kim, lee], midyear);

      expect(r.rows.map((x) => x.result)).not.toContain("check_target");
    });
  });

  describe("R6 graded and mixed classes of the same name differ", () => {
    test("moving from a graded class into a mixed class of the same name and group is a class change", () => {
      const r = run("김하늘,,,4,7", [kim], midyear);

      expect(r.rows[0]).toMatchObject({ result: "class_changed" });
    });

    test("moving out of a mixed class into the graded class of the same name is a class change", () => {
      const inMixed = student({
        studentId: "s3",
        name: "박도윤",
        className: "4",
        mixedClass: true,
      });
      const r = run("박도윤,고1,,4,7", [inMixed], midyear);

      expect(r.rows[0]).toMatchObject({ result: "class_changed" });
    });

    test("staying in a mixed class is not a class change", () => {
      const inMixed = student({
        studentId: "s3",
        name: "박도윤",
        className: "4",
        mixedClass: true,
      });
      const r = run("박도윤,,,4,9", [inMixed], midyear);

      expect(r.rows[0]).toMatchObject({ result: "no_homeroom" });
    });
  });

  describe("other rules that stay", () => {
    test("matching ignores the grade: same-name students in different grades are same_name", () => {
      const twin = [
        student({ studentId: "t1", name: "박도윤", grade: "고1" }),
        student({ studentId: "t2", name: "박도윤", grade: "중3" }),
      ];

      const same = run("박도윤,,,A,3", twin, midyear);
      expect(same.rows[0]?.result).toBe("same_name");
      expect(same.applyRows).toEqual([]);
      expect(same.pendingRows).toEqual([]);
      expect(run("박도윤,고1,,A,3", twin, midyear).applyRows).toMatchObject([
        { studentId: "t1" },
      ]);
    });

    test("two lines that resolve to one student are all same_name", () => {
      const r = run("김하늘,,,A,3\n김하늘,,,A,4", [kim], midyear);

      expect(r.rows.map((x) => x.result)).toEqual(["same_name", "same_name"]);
      expect(r.applyRows).toEqual([]);
      expect(r.pendingRows).toEqual([]);
    });

    test("a name nobody registered is stored as pending with no grade, flagged mixed", () => {
      const r = run("모르는사람,,,A,3", [kim], midyear);

      expect(r.rows[0]?.result).toBe("student_not_found");
      expect(r.pendingRows).toEqual([
        {
          name: "모르는사람",
          grade: null,
          groupId: null,
          className: "A",
          number: 3,
          mixed: true,
        },
      ]);
    });

    test("a pending line into an already mixed class keeps the grade it gave", () => {
      const r = run("모르는사람,고1,,A,3", [lee], {
        ...midyear,
        mixedClasses: new Set(["|a"]),
      });

      expect(r.pendingRows).toEqual([
        {
          name: "모르는사람",
          grade: "고1",
          groupId: null,
          className: "A",
          number: 3,
          mixed: true,
        },
      ]);
    });

    test("no class, a bad number, an unknown group and a student without a grade still need a check", () => {
      const noGrade = student({ studentId: "n", name: "무학년", grade: null });
      const lines = [
        "김하늘,,,,3",
        "이서준,,Z레벨,A,3",
        "무학년,,,B,3",
        "박도윤,,,B,100",
      ];
      const r = run(
        lines.join("\n"),
        [kim, lee, noGrade, student({ studentId: "p", name: "박도윤" })],
        midyear,
      );

      expect(r.rows.map((x) => x.result)).toEqual([
        "check_target",
        "check_target",
        "check_target",
        "check_target",
      ]);
      expect(r.applyRows).toEqual([]);
    });

    test("a name registered only in another grade needs a check for a grade line but is matched by name for a mixed line", () => {
      expect(run("김하늘,고3,,A,3", [kim], midyear).rows[0]?.result).toBe(
        "check_target",
      );
      expect(run("김하늘,,,A,3", [kim], midyear).rows[0]).toMatchObject({
        studentId: "s1",
      });
    });

    test("a mixed 9-column line whose existing cells exclude the student still needs a check", () => {
      const r = run("김하늘,,,9,7,다학년,,A,3", [kim], midyear);

      expect(r.rows[0]?.result).toBe("check_target");
      expect(r.pendingRows).toEqual([]);
    });

    test("two mixed lines into the same class and number are duplicate_target", () => {
      const r = run("김하늘,,,A,3\n이서준,,,A,3", [kim, lee], midyear);

      expect(r.rows.map((x) => x.result)).toEqual([
        "duplicate_target",
        "duplicate_target",
      ]);
    });

    test("the homeroom lookup of a mixed class uses an empty grade part", () => {
      const withHomeroom = run("김하늘,,,A,3", [kim], {
        ...midyear,
        homeroomClasses: new Set(["||A"]),
      });
      const without = run("김하늘,,,A,3", [kim], {
        ...midyear,
        homeroomClasses: new Set(["고1||A"]),
      });

      expect(withHomeroom.rows[0]?.result).toBe("class_changed");
      expect(without.rows[0]).toMatchObject({
        result: "class_changed",
        noHomeroom: true,
      });
    });

    test("a graduating student in a rollover is still graduating", () => {
      const senior = student({ studentId: "g", name: "고삼", grade: "고3" });
      const r = run("고삼,고3,,4,7,다학년,,A,3", [senior]);

      expect(r.rows[0]?.result).toBe("graduating");
      expect(r.applyRows).toEqual([]);
    });
  });
});

describe("school tenants are unchanged by the mixed-grade rules", () => {
  const kim = student({ studentId: "s1", name: "김하늘", grade: "고1" });
  const school = {
    orgType: "학교",
    graduatingGrades: ["중3", "고3"],
    homeroomClasses: new Set(["고2||3"]),
  };

  test("a blank new grade still infers the next grade and never produces mixed fields", () => {
    const r = run("김하늘,1학년,,4,7,,,3,8", [kim], school);

    expect(r.rows[0]).toEqual({
      line: 1,
      displayName: "김*늘",
      from: { grade: "고1", groupName: null, className: "4", number: 7 },
      to: { grade: "고2", groupName: null, className: "3", number: 8 },
      studentId: "s1",
      result: "applied",
    });
    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "3", number: 8 },
    ]);
  });

  test("free text in the new grade cell is still a wrong grade needing a check", () => {
    const r = run("김하늘,1학년,,4,7,다학년,,3,8", [kim], school);

    expect(r.rows[0]?.result).toBe("check_target");
    expect(r.applyRows).toEqual([]);
  });

  test("a mid-year roster line with a blank grade still matches by name only and keeps the student's grade", () => {
    const r = run("김하늘,,,3,8", [kim], { ...school, mode: "midyear" });

    expect(r.applyRows).toEqual([
      { studentId: "s1", groupId: null, className: "3", number: 8 },
    ]);
    expect(r.rows[0]?.to).toEqual({
      grade: "고1",
      groupName: null,
      className: "3",
      number: 8,
    });
  });

  test("an existing mixed class set is ignored for a school", () => {
    const r = run("김하늘,1학년,,4,7,2학년,,3,8", [kim], {
      ...school,
      mixedClasses: new Set(["|3"]),
    });

    expect(r.applyRows[0]).not.toHaveProperty("mixed");
  });

  test("a pending line without a grade is still not flagged", () => {
    const r = run("모르는사람,,,4,7", [kim], { ...school, mode: "midyear" });

    expect(r.pendingRows).toEqual([
      {
        name: "모르는사람",
        grade: null,
        groupId: null,
        className: "4",
        number: 7,
      },
    ]);
  });
});
