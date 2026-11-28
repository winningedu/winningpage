import { describe, expect, it } from "vitest";
import { must, mustHave, mustRead } from "./must.js";

describe("must", () => {
  it("오류가 없으면 data 를 돌려준다", () => {
    expect(must({ data: [1], error: null }, "읽기")).toEqual([1]);
  });

  it("오류가 있으면 설명과 메시지를 담아 던진다", () => {
    expect(() =>
      must({ data: null, error: { message: "boom" } }, "읽기"),
    ).toThrow("읽기: boom");
  });
});

describe("mustRead", () => {
  it("쿼리를 기다려 data 를 돌려준다", async () => {
    const query = Promise.resolve({ data: { id: 1 }, error: null });
    expect(await mustRead(query, "읽기")).toEqual({ id: 1 });
  });

  it("쿼리가 오류를 돌려주면 같은 문구로 거절한다", async () => {
    const query = Promise.resolve({ data: null, error: { message: "boom" } });
    await expect(mustRead(query, "읽기")).rejects.toThrow("읽기: boom");
  });
});

describe("mustHave", () => {
  it("값이 있으면 그대로 돌려준다", () => {
    expect(mustHave(0, "쓰기")).toBe(0);
  });

  it("null 이나 undefined 면 결과 없음으로 던진다", () => {
    expect(() => mustHave(null, "쓰기")).toThrow("쓰기: 결과 없음");
    expect(() => mustHave(undefined, "쓰기")).toThrow("쓰기: 결과 없음");
  });
});
