import { describe, expect, test } from "vitest";
import {
  classifySaveFailure,
  prefillBanners,
  saveStatusLabel,
} from "./surveySave";

const NOW = Date.parse("2026-10-06T10:00:00Z");

describe("saveStatusLabel", () => {
  test("저장 중", () => {
    expect(saveStatusLabel({ phase: "saving" }, NOW)).toBe("저장 중");
  });
  test("실패", () => {
    expect(saveStatusLabel({ phase: "error" }, NOW)).toBe(
      "저장 실패, 다시 시도",
    );
  });
  test("1분 안이면 방금", () => {
    expect(
      saveStatusLabel({ phase: "saved", savedAt: NOW - 20_000 }, NOW),
    ).toBe("자동 저장됨, 방금");
  });
  test("1분 넘으면 몇 분 전", () => {
    expect(
      saveStatusLabel({ phase: "saved", savedAt: NOW - 5 * 60_000 }, NOW),
    ).toBe("자동 저장됨, 5분 전");
  });
  test("한 시간 넘으면 몇 시간 전", () => {
    expect(
      saveStatusLabel({ phase: "saved", savedAt: NOW - 3 * 3_600_000 }, NOW),
    ).toBe("자동 저장됨, 3시간 전");
  });
  test("아직 저장한 적이 없으면 표시하지 않는다", () => {
    expect(saveStatusLabel({ phase: "idle" }, NOW)).toBeNull();
  });
});

describe("classifySaveFailure", () => {
  test("409 REPORT_LOCKED 는 잠금", () => {
    expect(
      classifySaveFailure({
        kind: "error",
        status: 409,
        code: "REPORT_LOCKED",
        message: "",
      }),
    ).toBe("locked");
  });
  test("403 NO_ENTITLEMENT 는 이용권 없음", () => {
    expect(
      classifySaveFailure({
        kind: "error",
        status: 403,
        code: "NO_ENTITLEMENT",
        message: "",
      }),
    ).toBe("entitlement");
  });
  test("그 외 실패와 타임아웃은 일반 실패", () => {
    expect(
      classifySaveFailure({
        kind: "error",
        status: 500,
        code: "X",
        message: "",
      }),
    ).toBe("failed");
    expect(classifySaveFailure({ kind: "timeout" })).toBe("failed");
  });
});

describe("prefillBanners", () => {
  test("재진입이면 불러온 문항 수와 이어서 답할 번호를 안내한다", () => {
    expect(
      prefillBanners({
        resumed: true,
        answered: 13,
        nextNumber: 14,
        origins: {},
      }),
    ).toEqual([
      {
        title: "지난번에 답한 13문항을 불러왔어요",
        body: "14번부터 이어서 답하면 돼요. 답은 문항마다 자동 저장돼요.",
      },
    ]);
  });
  test("이어서 답할 번호가 없으면 본문에서 번호를 뺀다", () => {
    const [banner] = prefillBanners({
      resumed: true,
      answered: 24,
      nextNumber: null,
      origins: {},
    });
    expect(banner?.body).toBe("답은 문항마다 자동 저장돼요.");
  });
  test("출처별 문항 수를 센다", () => {
    const banners = prefillBanners({
      resumed: false,
      answered: 3,
      nextNumber: 1,
      origins: { q5: "diagnosis", q10: "diagnosis", q8: "activity" },
    });
    expect(banners.map((b) => b.title)).toEqual([
      "무료진단 응답으로 2문항을 미리 채웠어요",
      "저장된 활동에서 확인한 1문항을 미리 채웠어요",
    ]);
  });
  test("프리필이 없으면 안내도 없다", () => {
    expect(
      prefillBanners({
        resumed: false,
        answered: 0,
        nextNumber: 1,
        origins: {},
      }),
    ).toEqual([]);
  });
});
