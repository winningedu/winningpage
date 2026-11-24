import { describe, expect, it } from "vitest";
import {
  parseListSearch,
  parseSectionView,
  sectionPath,
  withListState,
} from "./sectionUrl";

describe("parseSectionView", () => {
  it("경로에서 목록, 등록, 수정을 읽는다", () => {
    expect(parseSectionView("/admin/popups", "popups")).toEqual({
      kind: "list",
    });
    expect(parseSectionView("/admin/popups/", "popups")).toEqual({
      kind: "list",
    });
    expect(parseSectionView("/admin/popups/new", "popups")).toEqual({
      kind: "new",
    });
    expect(parseSectionView("/admin/popups/a%2Fb", "popups")).toEqual({
      kind: "edit",
      id: "a/b",
    });
  });

  it("엉뚱한 경로와 깨진 인코딩은 목록으로 본다", () => {
    expect(parseSectionView("/admin/notices", "popups")).toEqual({
      kind: "list",
    });
    expect(parseSectionView("/admin/popups/a/b", "popups")).toEqual({
      kind: "list",
    });
    expect(parseSectionView("/admin/popups/%E0%A4%A", "popups")).toEqual({
      kind: "list",
    });
  });

  it("sectionPath 는 읽는 쪽과 맞물린다", () => {
    expect(
      parseSectionView(sectionPath("popups", { id: "a b" }), "popups"),
    ).toEqual({
      kind: "edit",
      id: "a b",
    });
    expect(sectionPath("popups", "new")).toBe("/admin/popups/new");
  });
});

describe("list search", () => {
  it("값이 없거나 이상하면 기본값이다", () => {
    expect(
      parseListSearch(new URLSearchParams("page=0&months=5&stale=2")),
    ).toEqual({
      page: 1,
      q: "",
      filter: "",
      stale: false,
      months: 6,
    });
    expect(parseListSearch(new URLSearchParams("page=x"))).toMatchObject({
      page: 1,
    });
  });

  it("쓴 값을 그대로 읽고, 기본값은 주소에서 뺀다", () => {
    const params = withListState(new URLSearchParams(), {
      page: 3,
      q: "abc",
      filter: "수시",
      stale: true,
      months: 12,
    });
    expect(parseListSearch(params)).toEqual({
      page: 3,
      q: "abc",
      filter: "수시",
      stale: true,
      months: 12,
    });
    const cleared = withListState(params, {
      page: 1,
      q: "",
      filter: "",
      stale: false,
      months: 6,
    });
    expect(cleared.toString()).toBe("");
  });
});
