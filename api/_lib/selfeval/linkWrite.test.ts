import { describe, expect, it } from "vitest";
import {
  buildLinkChecks,
  carriedWords,
  type LinkInfo,
  linkTargets,
  type SupportLinkState,
  supportLinkStates,
} from "./linkWrite.js";
import type { ActivityRecordLike, Sentence } from "./types.js";

const rec = (over: Partial<ActivityRecordLike> = {}): ActivityRecordLike => ({
  id: "r1",
  sourceProgram: "performance",
  status: "final",
  gradeLabel: null,
  semester: null,
  subjectGroup: "교과",
  subject: "수학",
  topic: null,
  concept: null,
  method: null,
  result: null,
  limitation: null,
  numbers: [],
  sources: [],
  createdAt: "2026-01-01",
  ...over,
});

describe("carriedWords", () => {
  it("개념명, 자료명, 방법명, 수치를 한 낱말씩 번갈아 뽑는다", () => {
    const words = carriedWords(
      rec({
        concept: "수요 탄력성과 기울기",
        sources: ["통계청 가계동향조사"],
        method: "엑셀 회귀분석",
        numbers: ["표본 120명"],
      }),
    );
    expect(words).toEqual(["수요", "통계청 가계동향조사", "엑셀", "120명"]);
  });

  it("최대 네 낱말이고 중복은 한 번만 낸다", () => {
    const words = carriedWords(
      rec({
        concept: "수요 탄력성 기울기 공급",
        method: "수요 회귀분석 검산",
        sources: ["자료 가", "자료 나", "자료 다"],
        numbers: ["10명", "20명", "10명"],
      }),
    );
    expect(words).toHaveLength(4);
    expect(new Set(words).size).toBe(4);
  });

  it("같은 기록이면 항상 같은 낱말을 낸다", () => {
    const r = rec({ concept: "수요 탄력성", numbers: ["3회"] });
    expect(carriedWords(r)).toEqual(carriedWords(r));
  });

  it("7항목이 비어 있으면 빈 배열이다", () => {
    expect(carriedWords(rec())).toEqual([]);
  });
});

const link = (over: Partial<LinkInfo> = {}): LinkInfo => ({
  fromRecordId: "c1",
  toRecordId: "s1",
  linkType: "inherit",
  strength: "explicit",
  source: "model",
  confirmed: false,
  deleted: false,
  note: null,
  quoteFrom: null,
  quoteTo: null,
  ...over,
});

describe("supportLinkStates", () => {
  const records = [
    rec({ id: "c1", concept: "수요 탄력성" }),
    rec({ id: "s1", concept: "공급 곡선" }),
    rec({ id: "s2", concept: "비용 구조" }),
  ];
  const states = (links: LinkInfo[]) =>
    supportLinkStates(records, "c1", ["s1", "s2"], links);

  it("명시 연계는 유형 라벨, 단계, 강도, 확인 여부와 앞 기록의 구체물 낱말을 싣는다", () => {
    const s = states([link()]).get("s1");
    expect(s).toMatchObject({
      mode: "link",
      reason: "linked",
      hop: 1,
      typeLabel: "이어받음",
      strength: "explicit",
      confirmed: false,
      carried: ["수요", "탄력성"],
    });
  });

  it("앞 기록은 연계 선의 from 쪽이다", () => {
    const s = states([
      link({ fromRecordId: "s1", toRecordId: "c1", linkType: "deepen" }),
    ]).get("s1");
    expect(s?.carried).toEqual(["공급", "곡선"]);
  });

  it("2단계 기록은 핵심이 아니라 이어진 기록과의 선을 쓴다", () => {
    const s = states([
      link(),
      link({ fromRecordId: "s1", toRecordId: "s2", linkType: "borrow_method" }),
    ]).get("s2");
    expect(s).toMatchObject({
      mode: "link",
      hop: 2,
      typeLabel: "방법 빌림",
      carried: ["공급", "곡선"],
    });
  });

  it("암묵이고 학생이 확인하지 않은 연계는 기여 항목으로만 쓴다(명세 No.193)", () => {
    const s = states([link({ strength: "implicit" })]).get("s1");
    expect(s).toMatchObject({
      mode: "contribute",
      reason: "implicit_unconfirmed",
    });
  });

  it("암묵이어도 학생이 확인했으면 연계 문장을 쓴다", () => {
    const s = states([link({ strength: "implicit", confirmed: true })]).get(
      "s1",
    );
    expect(s).toMatchObject({ mode: "link", confirmed: true });
  });

  it("지운 연계는 없는 것으로 보고 기여 항목으로만 쓴다(명세 No.194)", () => {
    const s = states([link({ deleted: true })]).get("s1");
    expect(s).toMatchObject({ mode: "contribute", reason: "no_link" });
  });

  it("핵심과 이어지지 않은 기록은 기여 항목으로만 쓴다(명세 No.195)", () => {
    const all = states([link()]);
    expect(all.get("s2")).toMatchObject({
      mode: "contribute",
      reason: "no_link",
    });
  });
});

describe("연계 점검(명세 No.182, 190)", () => {
  const state = (over: Partial<SupportLinkState> = {}): SupportLinkState => ({
    id: "s1",
    mode: "link",
    reason: "linked",
    hop: 1,
    typeLabel: "이어받음",
    strength: "explicit",
    confirmed: false,
    quotes: [],
    carried: ["수요", "탄력성"],
    ...over,
  });
  const sentence = (id: string, text: string, refs: string[]): Sentence => ({
    id,
    text,
    evidence: refs.map((refId) => ({
      sourceType: "D",
      refId,
      item: "method",
      weight: "sub",
    })),
    feeling: false,
    confirmed: false,
  });
  const labels = new Map([
    ["s1", "보조탐구"],
    ["s2", "곁탐구"],
  ]);
  const sentences = [
    sentence("p1-s1", "핵심 기록으로 값을 구함.", ["c1"]),
    sentence("p1-s2", "수요 표를 이어받아 기울기를 구함.", ["s1"]),
    sentence("p1-s3", "수요 값을 다시 비교함.", ["s1"]),
  ];

  it("기록마다 인용한 문장 id 와 처음 인용한 문장을 모은다", () => {
    const [t] = linkTargets([state()], labels, sentences);
    expect(t).toMatchObject({
      recordId: "s1",
      label: "보조탐구",
      sentenceIds: ["p1-s2", "p1-s3"],
      firstText: "수요 표를 이어받아 기울기를 구함.",
    });
  });

  it("처음 인용한 문장에 구체물 낱말이 있으면 있음, 없으면 없음이고 모델 판정을 싣는다", () => {
    const judgments = [
      { recordId: "s1", linkShown: true, standsWithout: false },
    ];
    const [ok] = buildLinkChecks(
      linkTargets([state()], labels, sentences),
      judgments,
    );
    expect(ok).toEqual({
      recordId: "s1",
      label: "보조탐구",
      status: "checked",
      linkShown: true,
      concreteWordPresent: true,
      listingSuspect: false,
    });
    const miss = buildLinkChecks(
      linkTargets([state({ carried: ["공급"] })], labels, sentences),
      [{ recordId: "s1", linkShown: false, standsWithout: true }],
    )[0];
    expect(miss).toMatchObject({
      concreteWordPresent: false,
      linkShown: false,
      listingSuspect: true,
    });
  });

  it("그 기록 문장을 빼도 성립한다는 판정이 나오면 나열 의심이다", () => {
    const [c] = buildLinkChecks(linkTargets([state()], labels, sentences), [
      { recordId: "s1", linkShown: true, standsWithout: true },
    ]);
    expect(c?.listingSuspect).toBe(true);
  });

  it("구체물 낱말이 없는 기록은 낱말 판정을 비워 둔다", () => {
    const [c] = buildLinkChecks(
      linkTargets([state({ carried: [] })], labels, sentences),
      [{ recordId: "s1", linkShown: true, standsWithout: false }],
    );
    expect(c?.concreteWordPresent).toBeNull();
  });

  it("선택했지만 인용한 문장이 없으면 미사용이다", () => {
    const [c] = buildLinkChecks(
      linkTargets([state({ id: "s2" })], labels, sentences),
      [],
    );
    expect(c).toEqual({
      recordId: "s2",
      label: "곁탐구",
      status: "unused",
      linkShown: null,
      concreteWordPresent: null,
      listingSuspect: null,
    });
  });

  it("기여 항목으로만 쓴 기록은 쓰였으면 연계 점검 대상이 아니고 안 쓰였으면 미사용이다", () => {
    const used = state({ mode: "contribute", reason: "no_link", carried: [] });
    expect(buildLinkChecks(linkTargets([used], labels, sentences), [])).toEqual(
      [],
    );
    const unused = buildLinkChecks(
      linkTargets([{ ...used, id: "s2" }], labels, sentences),
      [],
    );
    expect(unused.map((c) => [c.recordId, c.status])).toEqual([
      ["s2", "unused"],
    ]);
  });

  it("모델 판정이 빠진 연계 기록은 판정 없음으로 둔다", () => {
    const [c] = buildLinkChecks(linkTargets([state()], labels, sentences), []);
    expect(c).toMatchObject({
      status: "checked",
      linkShown: null,
      listingSuspect: null,
      concreteWordPresent: true,
    });
  });
});
