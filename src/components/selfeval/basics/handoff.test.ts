import { describe, expect, test } from "vitest";
import { clearHandoff, readHandoffItemId } from "./handoff";

function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    has: (k: string) => map.has(k),
  };
}

const payload = (itemId: unknown) =>
  JSON.stringify({ itemId, program: "self" });

describe("readHandoffItemId, clearHandoff", () => {
  test("과제 목록에 있는 itemId 를 돌려주고 읽기만 해서는 키를 지우지 않는다", () => {
    const s = storage({ "growth:handoff": payload("i1") });
    expect(readHandoffItemId(s, ["i0", "i1"])).toBe("i1");
    expect(s.has("growth:handoff")).toBe(true);
    clearHandoff(s);
    expect(s.has("growth:handoff")).toBe(false);
  });

  test("목록에 없는 과제면 null 이다", () => {
    const s = storage({ "growth:handoff": payload("zz") });
    expect(readHandoffItemId(s, ["i1"])).toBeNull();
  });

  test("값이 없거나 깨졌거나 저장소가 없으면 null 이다", () => {
    expect(readHandoffItemId(storage(), ["i1"])).toBeNull();
    expect(
      readHandoffItemId(storage({ "growth:handoff": "{깨짐" }), ["i1"]),
    ).toBeNull();
    expect(
      readHandoffItemId(storage({ "growth:handoff": payload(3) }), ["i1"]),
    ).toBeNull();
    expect(readHandoffItemId(null, ["i1"])).toBeNull();
  });
});
