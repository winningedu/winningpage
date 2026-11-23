import { expect, test } from "vitest";
import { SCHEMA_VERSION } from "./types.js";

test("payload schema version is the v3 tag stored in diagnosis_reports", () => {
  expect(SCHEMA_VERSION).toBe("2026-11-v3");
});
