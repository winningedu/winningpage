// 선생님 계정 안내(원부 5절). 위닝 본문은 승인 제출본(UO_3127)과 글자 단위로 같아야 한다.

import { afterEach, describe, expect, test, vi } from "vitest";
import { ALIMTALK_TEMPLATES } from "./alimtalkTemplates.js";

const T = ALIMTALK_TEMPLATES.teacherAccount;
const vars = {
  이름: "김선생",
  계정종류: "선생님",
  소속: "위닝고등학교",
  아이디: "ABCD2345XY7Z9K",
  임시비밀번호: "Xy7!pQ2mZk",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("teacherAccount", () => {
  test("코드 환경변수, 제목, 비밀 변수, 대체 문자 없음", () => {
    expect(T.codeEnv).toBe("ALIGO_TPL_TEACHER_ACCOUNT");
    expect(T.subject).toBe("계정 정보 안내");
    expect(T.secretVars).toEqual(["임시비밀번호"]);
    expect(T.smsFallback).toBeUndefined();
  });

  test("위닝 본문과 버튼", () => {
    vi.stubEnv("SITE", "");
    expect(T.build(vars)).toBe(
      "안녕하세요, 김선생님.\n위닝에듀 선생님 계정 정보를 안내드립니다.\n\n■ 소속: 위닝고등학교\n■ 아이디: ABCD2345XY7Z9K\n■ 임시 비밀번호: Xy7!pQ2mZk\n\n아래 버튼을 눌러 로그인한 뒤, 처음 로그인할 때 비밀번호를 새로 설정해 주세요.\n\n※ 임시 비밀번호는 다른 사람에게 알려 주지 마세요.\n※ 요청하지 않은 안내라면 소속 기관 관리자에게 문의해 주세요.",
    );
    expect(T.button?.(vars)).toEqual({
      name: "선생님 화면 바로가기",
      linkType: "WL",
      linkTypeName: "웹링크",
      linkMo: "https://www.winningedu.com/teacher",
      linkPc: "https://www.winningedu.com/teacher",
    });
  });

  test("스쿨멘토는 브랜드와 버튼 도메인만 바뀐다", () => {
    vi.stubEnv("SITE", "schoolmentor");
    expect(T.build(vars).split("\n")[1]).toBe(
      "스쿨멘토 선생님 계정 정보를 안내드립니다.",
    );
    expect(T.build(vars)).not.toContain("위닝에듀");
    expect(T.button?.(vars).linkMo).toBe("https://www.schoolmentor.kr/teacher");
    expect(T.button?.(vars).linkPc).toBe("https://www.schoolmentor.kr/teacher");
  });
});
