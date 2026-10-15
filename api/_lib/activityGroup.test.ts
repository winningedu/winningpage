// activity_records.subject_group 공용 어휘와 직접 입력 정규화 테스트.
import { describe, expect, it } from "vitest";
import {
  activityGroupLabel,
  normalizeActivityGroup,
  SUBJECT_GROUP,
} from "./activityGroup.js";

describe("normalizeActivityGroup", () => {
  it("과목명은 교과로 두고 과목명을 subject 에 담는다", () => {
    expect(normalizeActivityGroup(" 확률과 통계 ")).toEqual({
      subjectGroup: SUBJECT_GROUP,
      subject: "확률과 통계",
    });
  });

  it("자율, 동아리, 진로 접두어는 해당 영역으로 모으고 subject 는 null", () => {
    expect(normalizeActivityGroup("자율활동")).toEqual({
      subjectGroup: "자율",
      subject: null,
    });
    expect(normalizeActivityGroup("동아리 활동")?.subjectGroup).toBe("동아리");
    expect(normalizeActivityGroup("진로")?.subjectGroup).toBe("진로");
  });

  it("창체와 봉사는 자율로 모은다", () => {
    expect(normalizeActivityGroup("창체")?.subjectGroup).toBe("자율");
    expect(normalizeActivityGroup("봉사활동")?.subjectGroup).toBe("자율");
  });

  it("빈 값은 null", () => {
    expect(normalizeActivityGroup("   ")).toBeNull();
    expect(normalizeActivityGroup(null)).toBeNull();
  });
});

describe("activityGroupLabel", () => {
  it("교과면 과목명, 과목명이 없으면 교과, 창체면 영역 이름", () => {
    expect(activityGroupLabel("교과", "수학")).toBe("수학");
    expect(activityGroupLabel("교과", null)).toBe("교과");
    expect(activityGroupLabel("동아리", "로봇부")).toBe("동아리");
    expect(activityGroupLabel(null, "수학")).toBeNull();
  });
});
