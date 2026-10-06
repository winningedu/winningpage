// 학년 단계 규칙 테스트(명세 No.44, 45, 46, 47, 110). 순수 함수만 다룬다.
import { describe, expect, it } from "vitest";
import {
  fitFor,
  gradeNote,
  sortTopicsByFit,
  stageLabel,
  stageOf,
} from "./stage.js";

describe("stageOf (No.44)", () => {
  it("학년을 씨앗, 꽃, 만개로 바꾼다", () => {
    expect(stageOf("고1")).toBe("seed");
    expect(stageOf("고2")).toBe("flower");
    expect(stageOf("고3")).toBe("bloom");
  });
});

describe("fitFor (No.45, 110)", () => {
  it("고1: 후속과 전이는 맞음, 확장은 어긋남, 비판은 보통", () => {
    expect(fitFor("고1", "followup")).toBe("match");
    expect(fitFor("고1", "transfer")).toBe("match");
    expect(fitFor("고1", "extension")).toBe("off");
    expect(fitFor("고1", "critique")).toBe("neutral");
  });

  it("고2: 비판, 전이, 확장은 맞음, 후속은 보통, 어긋남 없음", () => {
    expect(fitFor("고2", "critique")).toBe("match");
    expect(fitFor("고2", "transfer")).toBe("match");
    expect(fitFor("고2", "extension")).toBe("match");
    expect(fitFor("고2", "followup")).toBe("neutral");
  });

  it("고3: 후속과 비판은 맞음, 전이와 확장은 어긋남", () => {
    expect(fitFor("고3", "followup")).toBe("match");
    expect(fitFor("고3", "critique")).toBe("match");
    expect(fitFor("고3", "transfer")).toBe("off");
    expect(fitFor("고3", "extension")).toBe("off");
  });
});

describe("sortTopicsByFit (No.45)", () => {
  it("맞음, 보통, 어긋남 순으로 정렬하고 같은 적합도는 입력 순서를 지킨다", () => {
    const topics = [
      { id: "a", fit: "off" as const },
      { id: "b", fit: "neutral" as const },
      { id: "c", fit: "match" as const },
      { id: "d", fit: "match" as const },
      { id: "e", fit: "off" as const },
    ];
    expect(sortTopicsByFit(topics).map((t) => t.id)).toEqual([
      "c",
      "d",
      "b",
      "a",
      "e",
    ]);
  });

  it("원본 배열을 바꾸지 않고 빈 배열도 받는다", () => {
    const topics = [{ fit: "off" as const }, { fit: "match" as const }];
    sortTopicsByFit(topics);
    expect(topics[0]?.fit).toBe("off");
    expect(sortTopicsByFit([])).toEqual([]);
  });
});

describe("gradeNote (No.46, 47)", () => {
  it("고1과 고3은 안내 문구가 있고 고2는 null", () => {
    expect(gradeNote("고1")).toContain("1학년");
    expect(gradeNote("고3")).toContain("3학년");
    expect(gradeNote("고2")).toBeNull();
  });
});

describe("stageLabel", () => {
  it("단계 라벨을 한국어로 돌려준다", () => {
    expect(stageLabel("seed")).toBe("씨앗");
    expect(stageLabel("flower")).toBe("꽃");
    expect(stageLabel("bloom")).toBe("만개");
  });
});
