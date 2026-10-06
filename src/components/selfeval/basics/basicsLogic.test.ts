import { describe, expect, test } from "vitest";
import type { EntryResponse } from "@/lib/selfeval/types";
import {
  type BasicsForm,
  buildCreateInput,
  buildProfilePayload,
  classifySubmitError,
  initialForm,
  validateBasics,
} from "./basicsLogic";

type Entry = EntryResponse["entry"];

function entry(over: Partial<Entry> = {}): Entry {
  return {
    quota: null,
    allowed: true,
    activityCount: 3,
    openSession: null,
    growth: null,
    profile: null,
    replyResent: 0,
    academicYearDefault: 2026,
    ...over,
  };
}

function filled(over: Partial<BasicsForm> = {}): BasicsForm {
  return {
    ...initialForm(
      entry({
        profile: {
          gradeLabel: "고2",
          semester: 2,
          career: "데이터 분석가",
          department: "통계학과",
          universities: ["가대학교"],
        },
      }),
    ),
    subject: "수학",
    schoolPrompt: "수학 탐구 활동을 쓰세요",
    ...over,
  };
}

describe("initialForm", () => {
  test("프로필 값과 학년도 기본값으로 채운다", () => {
    const f = filled();
    expect(f.academicYear).toBe("2026");
    expect(f.gradeLabel).toBe("고2");
    expect(f.semester).toBe("2");
    expect(f.career).toBe("데이터 분석가");
    expect(f.department).toBe("통계학과");
    expect(f.universities).toEqual(["가대학교", ""]);
  });

  test("프로필이 없으면 학년과 학기를 비워 두고 목표 글자 수는 500, 영역은 교과다", () => {
    const f = initialForm(entry());
    expect(f.gradeLabel).toBe("");
    expect(f.semester).toBe("");
    expect(f.targetChars).toBe("500");
    expect(f.targetCharsMode).toBe("with_space");
    expect(f.area).toBe("subject");
  });

  test("성장설계가 있으면 연동을 기본으로 켠다", () => {
    const growth = {
      reportId: "r1",
      issuedAt: "2026-09-01T00:00:00Z",
      stale: false,
      banner: {
        theme: "t",
        stageLabel: null,
        currentSubtheme: null,
        weakAxisNames: [],
        issuedAt: "2026-09-01T00:00:00Z",
      },
      planItems: [],
    };
    expect(initialForm(entry({ growth })).growthApplied).toBe(true);
    expect(initialForm(entry()).growthApplied).toBe(false);
  });
});

describe("validateBasics", () => {
  test("모두 채우면 오류가 없다", () => {
    expect(validateBasics(filled())).toEqual({});
  });

  test("교과 영역은 과목명이 필수다", () => {
    expect(validateBasics(filled({ subject: "  " })).subject).toBeTruthy();
  });

  test("창체 영역은 활동명이 필수이고 과목명은 묻지 않는다", () => {
    const f = filled({ area: "club", subject: "", activityName: "" });
    const errors = validateBasics(f);
    expect(errors.activityName).toBeTruthy();
    expect(errors.subject).toBeUndefined();
    expect(validateBasics({ ...f, activityName: "천문 동아리" })).toEqual({});
  });

  test("학교 문항은 필수다", () => {
    expect(
      validateBasics(filled({ schoolPrompt: "" })).schoolPrompt,
    ).toBeTruthy();
  });

  test("학년과 학기를 고르지 않으면 오류다", () => {
    const errors = validateBasics(filled({ gradeLabel: "", semester: "" }));
    expect(errors.gradeLabel).toBeTruthy();
    expect(errors.semester).toBeTruthy();
  });

  test("목표 글자 수는 비워도 되고 값이 있으면 100에서 3000 사이 정수다", () => {
    expect(validateBasics(filled({ targetChars: "" }))).toEqual({});
    expect(
      validateBasics(filled({ targetChars: "99" })).targetChars,
    ).toBeTruthy();
    expect(
      validateBasics(filled({ targetChars: "3001" })).targetChars,
    ).toBeTruthy();
    expect(
      validateBasics(filled({ targetChars: "12.5" })).targetChars,
    ).toBeTruthy();
    expect(
      validateBasics(filled({ targetChars: "abc" })).targetChars,
    ).toBeTruthy();
    expect(validateBasics(filled({ targetChars: "700" }))).toEqual({});
  });

  test("같은 희망 대학을 두 번 적으면 오류다", () => {
    expect(
      validateBasics(filled({ universities: ["가대학교", "가대학교"] }))
        .universities,
    ).toBeTruthy();
  });
});

describe("buildCreateInput", () => {
  test("교과 영역은 과목명만 싣고 활동명은 null 이다", () => {
    const input = buildCreateInput(filled({ activityName: "남은 값" }));
    expect(input).toMatchObject({
      academicYear: 2026,
      gradeLabel: "고2",
      semester: 2,
      area: "subject",
      subject: "수학",
      activityName: null,
      schoolPrompt: "수학 탐구 활동을 쓰세요",
      teacherNote: null,
      targetChars: 500,
      targetCharsMode: "with_space",
      growthApplied: false,
      planItemId: null,
    });
    expect(input.career).toEqual({
      career: "데이터 분석가",
      department: "통계학과",
      universities: ["가대학교"],
    });
  });

  test("창체 영역은 활동명만 싣는다", () => {
    const input = buildCreateInput(
      filled({
        area: "autonomy",
        activityName: " 학급 자치 ",
        subject: "수학",
      }),
    );
    expect(input.subject).toBeNull();
    expect(input.activityName).toBe("학급 자치");
  });

  test("목표 글자 수를 비우면 null 이고 선생님 요구사항은 비면 null 이다", () => {
    const input = buildCreateInput(
      filled({ targetChars: "", teacherNote: " 분량 지켜라 " }),
    );
    expect(input.targetChars).toBeNull();
    expect(input.teacherNote).toBe("분량 지켜라");
  });

  test("연동을 끄면 과제를 싣지 않는다", () => {
    expect(
      buildCreateInput(filled({ growthApplied: false, planItemId: "p1" }))
        .planItemId,
    ).toBeNull();
    expect(
      buildCreateInput(filled({ growthApplied: true, planItemId: "p1" })),
    ).toMatchObject({ growthApplied: true, planItemId: "p1" });
  });
});

describe("buildProfilePayload", () => {
  test("학생 공용 프로필에 올릴 값만 뽑고 빈 칸은 null 로 둔다", () => {
    expect(
      buildProfilePayload(
        filled({ career: "", universities: ["", " 나대학교 "] }),
      ),
    ).toEqual({
      grade: "고2",
      semester: 2,
      career: null,
      department: "통계학과",
      universities: ["나대학교"],
    });
  });
});

describe("classifySubmitError", () => {
  const err = (
    status: number,
    code: string,
    extra?: Record<string, unknown>,
  ) => ({
    kind: "error" as const,
    status,
    code,
    message: "서버 문구",
    ...(extra ? { extra } : {}),
  });

  test("SESSION_OPEN 은 열린 세션 id 를 들고 온다", () => {
    expect(
      classifySubmitError(err(409, "SESSION_OPEN", { openSessionId: "s9" })),
    ).toEqual({ kind: "open", openSessionId: "s9" });
    expect(classifySubmitError(err(409, "SESSION_OPEN"))).toEqual({
      kind: "open",
      openSessionId: null,
    });
  });

  test("이용 횟수 소진과 이용권 없음은 이용권 안내로 모은다", () => {
    expect(classifySubmitError(err(409, "QUOTA_EXHAUSTED"))).toEqual({
      kind: "quota",
    });
    expect(classifySubmitError(err(403, "NO_ENTITLEMENT"))).toEqual({
      kind: "quota",
    });
  });

  test("분석 시작 뒤 수정은 locked, 세션이 닫혔으면 not_open 이다", () => {
    expect(classifySubmitError(err(409, "SESSION_LOCKED")).kind).toBe("locked");
    expect(classifySubmitError(err(409, "SESSION_NOT_OPEN")).kind).toBe(
      "not_open",
    );
    expect(classifySubmitError(err(404, "SESSION_NOT_FOUND")).kind).toBe(
      "not_open",
    );
  });

  test("실행계획 항목 오류와 본문 오류는 서버 문구를 그대로 쓴다", () => {
    expect(classifySubmitError(err(400, "PLAN_ITEM_INVALID"))).toEqual({
      kind: "message",
      message: "서버 문구",
    });
    expect(classifySubmitError(err(400, "INVALID_BODY"))).toEqual({
      kind: "message",
      message: "서버 문구",
    });
  });

  test("타임아웃은 재시도 안내 문구를 쓴다", () => {
    expect(classifySubmitError({ kind: "timeout" }).kind).toBe("message");
  });
});
