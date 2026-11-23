import { describe, expect, it } from "vitest";
import {
  applyAddLink,
  applyConfirmLink,
  applyDeleteLink,
  mergeNewModelLinks,
} from "./linkEdit.js";
import type { RecordLink } from "./types.js";

const link = (
  fromId: string,
  toId: string,
  p: Partial<RecordLink> = {},
): RecordLink => ({
  fromId,
  toId,
  type: "background",
  strength: "implicit",
  source: "model",
  confirmed: false,
  deleted: false,
  note: null,
  quoteFrom: "q1",
  quoteTo: "q2",
  ...p,
});

describe("applyDeleteLink", () => {
  it("marks the stored link deleted in either direction", () => {
    const r = applyDeleteLink([link("a", "b")], "b", "a");
    expect(r).toEqual({ ok: true, link: link("a", "b", { deleted: true }) });
  });
  it("fails when the pair has no link", () => {
    expect(applyDeleteLink([], "a", "b")).toMatchObject({
      ok: false,
      code: "LINK_NOT_FOUND",
    });
  });
});

describe("applyConfirmLink", () => {
  it("sets confirmed on an implicit link", () => {
    expect(applyConfirmLink([link("a", "b")], "a", "b")).toEqual({
      ok: true,
      link: link("a", "b", { confirmed: true }),
    });
  });
  it("cannot revive a deleted link", () => {
    expect(
      applyConfirmLink([link("a", "b", { deleted: true })], "a", "b"),
    ).toMatchObject({ ok: false, code: "LINK_NOT_FOUND" });
  });
});

describe("applyAddLink", () => {
  const known = new Set(["a", "b"]);
  const req = {
    fromId: "a",
    toId: "b",
    type: "complement",
    note: "  표본 한계를 이어서 다뤘어요  ",
  };

  it("stores a student link, explicit and confirmed, with the trimmed note", () => {
    expect(applyAddLink([], req, known)).toEqual({
      ok: true,
      link: {
        fromId: "a",
        toId: "b",
        type: "complement",
        strength: "explicit",
        source: "student",
        confirmed: true,
        deleted: false,
        note: "표본 한계를 이어서 다뤘어요",
        quoteFrom: null,
        quoteTo: null,
      },
    });
  });
  it("requires a one-line note", () => {
    expect(applyAddLink([], { ...req, note: "   " }, known)).toMatchObject({
      ok: false,
      code: "NOTE_REQUIRED",
    });
  });
  it("rejects unknown types, unknown records and a record linked to itself", () => {
    expect(applyAddLink([], { ...req, type: "x" }, known)).toMatchObject({
      code: "INVALID_LINK_TYPE",
    });
    expect(applyAddLink([], { ...req, toId: "z" }, known)).toMatchObject({
      code: "UNKNOWN_ACTIVITY",
    });
    expect(applyAddLink([], { ...req, toId: "a" }, known)).toMatchObject({
      code: "SAME_ACTIVITY",
    });
  });
  it("overwrites an existing pair in its stored direction, reviving a deleted one", () => {
    const r = applyAddLink([link("b", "a", { deleted: true })], req, known);
    expect(r).toMatchObject({
      ok: true,
      link: {
        fromId: "b",
        toId: "a",
        deleted: false,
        source: "student",
        confirmed: true,
      },
    });
  });
});

describe("mergeNewModelLinks", () => {
  it("keeps only pairs never stored in either direction, so deleted links are not resurrected", () => {
    const stored = [link("a", "b", { deleted: true }), link("c", "d")];
    const proposed = [link("b", "a"), link("d", "c"), link("a", "c")];
    expect(mergeNewModelLinks(stored, proposed)).toEqual([link("a", "c")]);
  });
});
