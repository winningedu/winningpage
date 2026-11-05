import { describe, expect, test } from "vitest";
import { queryValue } from "./query.js";

describe("queryValue", () => {
  test("takes the first of repeated keys and treats an empty string as absent", () => {
    expect(queryValue(["a", "b"])).toBe("a");
    expect(queryValue("a")).toBe("a");
    expect(queryValue("")).toBeUndefined();
    expect(queryValue([""])).toBeUndefined();
    expect(queryValue(undefined)).toBeUndefined();
  });
});
