// 성장설계 연계 표현 인식 테스트(명세 No.63, 근거 표시 No.84).
// 순수 함수만 다루므로 DB/네트워크 없이 검증한다.
import { describe, expect, test } from "vitest";
import { detectLinkage, extractLinkedSentences } from "./linkagePhrases.js";

describe("detectLinkage - 연계 성립(No.63)", () => {
  test("과목 뒤 '에서' + '다룬 후' + '이번에는' 이 함께 있으면 subject_link 로 본다", () => {
    const r = detectLinkage(
      "한국지리에서 유동인구 공개데이터를 다룬 후 이번에는 자료를 직접 수집하는 쪽으로 설계함",
    );
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("subject_link");
    expect(r.matched.a).toBe("한국지리에서");
    expect(r.matched.b).toBe("다룬");
    expect(r.matched.c).toBe("이번에");
  });

  test("'작년' + '학습한' + '적용하여' 는 grade_link 다", () => {
    const r = detectLinkage(
      "작년에 학습한 통계 개념을 적용하여 설문을 설계했다",
    );
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("grade_link");
    expect(r.matched.a).toBe("작년");
  });

  test("'2학년 때' + '진행한' + '확장하여' 는 grade_link 다", () => {
    const r = detectLinkage(
      "2학년 때 진행한 열섬 조사를 이번에 유동인구와 연계하여 보았다",
    );
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("grade_link");
  });

  test("학년 표현과 과목 표현이 함께 있으면 grade_link 가 우선한다", () => {
    const r = detectLinkage(
      "1학년 때 통합과학에서 학습한 내용을 연계하여 보고서를 썼다",
    );
    expect(r.kind).toBe("grade_link");
  });

  test("'지난 학기 … 수업에서 다룬 … 연계하여' 는 subject_link 다", () => {
    const r = detectLinkage(
      "지난 학기 문학 수업에서 다룬 비평 방식을 연계하여 영상 분석에 적용하였다",
    );
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("subject_link");
  });

  test("과목 표현 없이 '앞서' 만 있으면 linked 이고 kind 는 null 이다", () => {
    const r = detectLinkage(
      "앞서 진행한 배차 분석의 표본을 사례로 삼아 이번에 다시 검토함",
    );
    expect(r.linked).toBe(true);
    expect(r.kind).toBeNull();
    expect(r.matched.a).toBe("앞서");
  });

  test("'이전에' 도 선행 맥락으로 인식한다", () => {
    const r = detectLinkage("이전에 학습한 회귀 모형에 이번에 변수를 추가했다");
    expect(r.linked).toBe(true);
  });

  test("줄바꿈, 중복 공백과 대소문자를 정규화한 뒤 매칭한다", () => {
    const r = detectLinkage("2학년   때\n진행한 실험을\n연계하여 보았다");
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("grade_link");
  });

  // 명세 한계: "2학년 … 에서 … 재해석함" 은 C 그룹(이번에, 연계하여, 적용하여 등) 표현이 없어
  // 명세 문구대로라면 연계가 아니다. 사람이 보면 연계지만 명세를 확대 해석하지 않고 false 로 고정한다.
  test("C 그룹 표현이 없으면 학년, 과목, 선행 행위가 있어도 비연계다(명세 한계)", () => {
    const r = detectLinkage(
      "1학년 통합과학에서 학습한 지점별 온도 자료를 2학년 수학Ⅰ에서 함수로 재해석함",
    );
    expect(r.linked).toBe(false);
    expect(r.kind).toBeNull();
    expect(r.matched.c).toBeNull();
  });
});

describe("detectLinkage - 비연계", () => {
  test.each([
    ["A, B, C 모두 없음", "버스 배차 간격과 대기인원을 분석했다"],
    ["C 만 있음", "이번에 새로 설문을 만들었다"],
    ["A, B 만 있음(C 없음)", "1학년 때 열섬 조사를 했다"],
    ["B 만 있음", "통계를 학습했다"],
    ["빈 문자열", ""],
  ])("%s", (_label, text) => {
    const r = detectLinkage(text);
    expect(r.linked).toBe(false);
    expect(r.kind).toBeNull();
  });

  test("'이번 활동에서' 는 C 이지 과목 신호(A)가 아니다", () => {
    const r = detectLinkage("이번 활동에서 다룬 자료를 정리했다");
    expect(r.matched.a).toBeNull();
    expect(r.linked).toBe(false);
  });
});

describe("detectLinkage - B/C 는 명세 목록과 같은 동사 활용형만(No.63)", () => {
  test.each([
    [
      "B 에 '배운' 단독",
      "작년에 배운 통계 개념을 이번에 적용하여 설문을 설계했다",
    ],
    ["B 에 '했던' 단독", "작년에 했던 조사를 이번에 적용하여 보았다"],
    ["C 에 '바탕으로'", "작년에 학습한 통계 개념을 바탕으로 설문을 설계했다"],
    ["C 에 '확장하여'", "2학년 때 진행한 열섬 조사를 확장하여 보았다"],
    ["C 에 '이어서' 만 있음", "이전에 학습한 회귀 모형에 변수를 추가했다"],
  ])("%s 는 비연계", (_label, text) => {
    expect(detectLinkage(text).linked).toBe(false);
  });

  test.each([
    "작년에 학습했던 통계 개념을 이번에 적용해 설문을 설계했다",
    "2학년 때 진행했던 열섬 조사를 이번에 유동인구와 연계해 보았다",
    "1학년 때 다뤘던 함수 그래프를 이번에 적용하여 분석했다",
  ])("같은 동사의 활용형은 허용한다: %s", (text) => {
    expect(detectLinkage(text).linked).toBe(true);
  });
});

describe("detectLinkage - A 신호 범위(No.63)", () => {
  test("중학 학년 표현은 학년 신호가 아니다(고교 학년 간 연계만)", () => {
    const r = detectLinkage("중2 때 진행한 내용을 이번에 적용하여 보았다");
    expect(r.linked).toBe(false);
  });

  test.each([
    "학교에서 진행한 축제를 이번에 정리했다",
    "동아리에서 다룬 경험을 이번에 적용하여 정리했다",
    "도서관에서 학습한 내용을 이번에 적용하여 정리했다",
  ])("일반 장소 명사 + '에서' 는 과목 신호가 아니다: %s", (text) => {
    const r = detectLinkage(text);
    expect(r.matched.a).toBeNull();
    expect(r.linked).toBe(false);
  });

  test("'수학 시간에' 는 과목 신호다", () => {
    const r = detectLinkage("수학 시간에 학습한 미분을 이번에 적용하여 풀었다");
    expect(r.linked).toBe(true);
    expect(r.kind).toBe("subject_link");
  });

  test("'수업에서' 는 과목 신호다", () => {
    const r = detectLinkage("수업에서 다룬 자료를 이번에 적용하여 정리했다");
    expect(r.kind).toBe("subject_link");
  });

  test("일반 장소 명사가 앞에 있어도 다른 과목 신호가 있으면 연계된다", () => {
    const r = detectLinkage(
      "학교에서 한국지리에서 다룬 자료를 이번에 적용하여 정리했다",
    );
    expect(r.kind).toBe("subject_link");
    expect(r.matched.a).toBe("한국지리에서");
  });
});

describe("extractLinkedSentences - 근거 문장 추출(No.84)", () => {
  test("마침표, 물음표, 줄바꿈 단위로 나눠 연계 문장만 돌려준다", () => {
    const text =
      "버스 배차 간격을 분석했다. 작년에 학습한 통계 개념을 적용하여 설문을 설계했다.\n통계를 학습했다? 2학년 때 진행한 조사를 이번에는 비교했다";
    expect(extractLinkedSentences(text)).toEqual([
      "작년에 학습한 통계 개념을 적용하여 설문을 설계했다",
      "2학년 때 진행한 조사를 이번에는 비교했다",
    ]);
  });

  test("소수점의 마침표에서는 문장을 나누지 않는다", () => {
    const text = "작년에 학습한 기법을 3.5배 빠르게 이번에 적용해 처리했다.";
    expect(extractLinkedSentences(text)).toHaveLength(1);
  });

  test("연계 문장이 없거나 빈 문자열이면 빈 배열이다", () => {
    expect(extractLinkedSentences("")).toEqual([]);
    expect(
      extractLinkedSentences("통계를 학습했다. 이번에 설문을 만들었다."),
    ).toEqual([]);
  });
});
