import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import { COMPANY } from "./company";

// data/company.ts는 결제/랜딩 페이지들이 여전히 쓰는 기존 진입점이다 — 정본은
// src/config/site.ts의 site.company로 옮겼고, 이 파일은 그 값을 그대로
// re-export만 해서 기존 import(`@/data/company`)를 깨지 않는다.
describe("COMPANY", () => {
  it("site.company와 동일한 값을 재노출한다", () => {
    expect(COMPANY).toBe(site.company);
  });
});
