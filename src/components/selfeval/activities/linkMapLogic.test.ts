import { describe, expect, test } from "vitest";
import type { CandidateRow, RecordLink } from "@/lib/selfeval/types";
import {
  layoutLinkMap,
  needsConfirm,
  orderPair,
  strengthLabel,
  unlinkedIds,
} from "./linkMapLogic";

function row(
  id: string,
  over: {
    course?: string | null;
    subject?: string | null;
    submittedAt?: string;
    topic?: string | null;
  } = {},
): CandidateRow {
  return {
    activity: {
      id,
      sourceProgram: "performance",
      status: "confirmed",
      gradeLabel: "고2",
      semester: 1,
      subjectGroup: null,
      subject: over.subject === undefined ? "수학" : over.subject,
      topic: over.topic === undefined ? `주제 ${id}` : over.topic,
      concept: null,
      method: null,
      result: null,
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: "2026-09-01T00:00:00Z",
      courseName: over.course ?? null,
    },
    fit: { activityId: id, score: 70, signals: [], reasons: [] },
    unavailableReason: null,
    alreadyUsed: false,
    role: null,
    submittedAt: over.submittedAt ?? "2026-09-01T00:00:00Z",
  };
}

const link = (
  fromId: string,
  toId: string,
  over: Partial<RecordLink> = {},
): RecordLink => ({
  fromId,
  toId,
  type: "inherit",
  strength: "explicit",
  source: "model",
  confirmed: false,
  deleted: false,
  note: null,
  quoteFrom: null,
  quoteTo: null,
  ...over,
});

describe("layoutLinkMap titles", () => {
  test("주제와 과목이 모두 없으면 제목을 만들지 않고 과목 열은 과목 미기재로 둔다", () => {
    const map = layoutLinkMap([row("a", { topic: null, subject: null })], []);
    expect(map.nodes[0]?.title).toBeNull();
    expect(map.nodes[0]?.label).toBe("과목 미기재");
  });
});

describe("layoutLinkMap", () => {
  const rows = [
    row("b", { course: "확률과 통계", submittedAt: "2026-10-01T00:00:00Z" }),
    row("a", { course: "수학", submittedAt: "2026-09-01T00:00:00Z" }),
    row("c", { course: "수학", submittedAt: "2026-11-01T00:00:00Z" }),
  ];

  test("과목별 열(먼저 낸 과목부터)과 제출일 순 행에 놓는다", () => {
    const map = layoutLinkMap(rows, []);
    expect(map.columns.map((c) => c.label)).toEqual(["수학", "확률과 통계"]);
    const at = (id: string) => map.nodes.find((n) => n.id === id);
    expect([at("a")?.col, at("a")?.row]).toEqual([0, 0]);
    expect([at("b")?.col, at("b")?.row]).toEqual([1, 1]);
    expect([at("c")?.col, at("c")?.row]).toEqual([0, 2]);
  });

  test("과목명이 없으면 과목 칸으로 묶고 둘 다 없으면 미기재 열이다", () => {
    const map = layoutLinkMap(
      [
        row("a", { course: null, subject: "물리" }),
        row("b", { subject: null }),
      ],
      [],
    );
    expect(map.columns.map((c) => c.label)).toEqual(["물리", "과목 미기재"]);
  });

  test("지운 선과 선택하지 않은 기록에 닿는 선은 그리지 않는다", () => {
    const map = layoutLinkMap(rows, [
      link("a", "b"),
      link("a", "c", { deleted: true }),
      link("a", "zzz"),
    ]);
    expect(map.edges.map((e) => [e.fromId, e.toId])).toEqual([["a", "b"]]);
  });

  test("선마다 유형, 강도 문구와 확인 필요 여부를 담는다", () => {
    const map = layoutLinkMap(rows, [
      link("a", "b", { strength: "implicit", type: "deepen" }),
      link("b", "c", { strength: "implicit", confirmed: true }),
      link("a", "c", { source: "student", note: "같은 자료를 다시 썼다" }),
    ]);
    const [ab, bc, ac] = map.edges;
    expect(ab).toMatchObject({
      typeLabel: "같은 질문 심화",
      strengthLabel: "추론",
      needsConfirm: true,
    });
    expect(bc).toMatchObject({
      strengthLabel: "추론, 학생 확인",
      needsConfirm: false,
    });
    expect(ac).toMatchObject({
      strengthLabel: "기록에 명시",
      note: "같은 자료를 다시 썼다",
    });
  });
});

describe("연계 판정 보조", () => {
  test("확인 필요는 암묵이고 학생이 확인하지 않은 선이다", () => {
    expect(needsConfirm(link("a", "b", { strength: "implicit" }))).toBe(true);
    expect(
      needsConfirm(link("a", "b", { strength: "implicit", confirmed: true })),
    ).toBe(false);
    expect(needsConfirm(link("a", "b"))).toBe(false);
    expect(strengthLabel("explicit", false)).toBe("기록에 명시");
  });

  test("지운 선까지 포함해 한 줄도 닿지 않은 보조만 찾는다", () => {
    const links = [
      link("core", "a"),
      link("a", "b"),
      link("core", "c", { deleted: true }),
    ];
    expect(unlinkedIds(links, ["a", "b", "c", "d"])).toEqual(["d"]);
  });

  test("두 기록은 제출일이 앞선 쪽을 앞에 둔다", () => {
    const rows = [
      row("a", { submittedAt: "2026-11-01T00:00:00Z" }),
      row("b", { submittedAt: "2026-09-01T00:00:00Z" }),
    ];
    expect(orderPair(rows, "a", "b")).toEqual({ fromId: "b", toId: "a" });
    expect(orderPair(rows, "b", "a")).toEqual({ fromId: "b", toId: "a" });
  });
});
