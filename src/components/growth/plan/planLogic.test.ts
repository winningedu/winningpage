import { describe, expect, it, vi } from "vitest";
import type { PlanBody, PlanItemView, ProgramHandoff } from "@/lib/growth/api";
import {
  applyItemPatch,
  applyOptimisticCheck,
  applyServerChange,
  buildChangeRows,
  buildHandoffRows,
  canSetDeadline,
  carriedSection,
  checkFailureOutcome,
  doneBadge,
  groupPeriodLabel,
  HANDOFF_STORAGE_KEY,
  handoffDestination,
  handoffSubtitle,
  isUncheckLocked,
  isValidDeadline,
  parseAvoidRepeats,
  progressNote,
  rollbackItem,
  showHandoffButton,
  storeHandoff,
  toDeadlinePayload,
} from "./planLogic";

function item(over: Partial<PlanItemView> = {}): PlanItemView {
  return {
    id: "i1",
    program: "school",
    title: "t",
    description: null,
    priority: "required",
    axis: null,
    category: null,
    period: "semester",
    periodLabel: "2026년 11월",
    deadline: null,
    dday: null,
    urgent: false,
    deadlineLabel: null,
    done: false,
    doneSource: null,
    doneAt: null,
    carried: false,
    carriedFromReportId: null,
    sortOrder: 0,
    ...over,
  };
}

function plan(items: PlanItemView[], carried: PlanItemView[] = []): PlanBody {
  return {
    reportId: "r1",
    issuedAt: "2026-11-14T00:00:00Z",
    track: "고2",
    theme: "대주제",
    stage: "꽃",
    currentGrade: "고2",
    subtheme: "소주제",
    groups: [{ period: "semester", label: "남은 학기", items }],
    progress: {
      total: items.length,
      done: 0,
      remaining: items.length,
      percent: 0,
    },
    nextDeadline: null,
    carried,
    avoidRepeats: [],
    metrics: null,
    handoffs: {},
  };
}

describe("낙관적 갱신과 롤백", () => {
  it("체크하면 항목이 수동 완료가 되고 진행률이 즉시 바뀐다", () => {
    const base = plan([
      item({ id: "a" }),
      item({ id: "b" }),
      item({ id: "c" }),
    ]);
    const next = applyOptimisticCheck(base, "a", true, "2026-11-20T00:00:00Z");
    expect(next.groups[0]?.items[0]).toMatchObject({
      done: true,
      doneSource: "manual",
    });
    expect(next.progress).toEqual({
      total: 3,
      done: 1,
      remaining: 2,
      percent: 33,
    });
    expect(base.groups[0]?.items[0]?.done).toBe(false);
  });

  it("해제하면 doneSource 와 doneAt 이 비워진다", () => {
    const base = plan([
      item({ id: "a", done: true, doneSource: "manual", doneAt: "x" }),
    ]);
    const next = applyOptimisticCheck(base, "a", false, "now");
    expect(next.groups[0]?.items[0]).toMatchObject({
      done: false,
      doneSource: null,
      doneAt: null,
    });
    expect(next.progress.percent).toBe(0);
  });

  it("없는 항목이면 그대로 돌려준다", () => {
    const base = plan([item()]);
    expect(applyOptimisticCheck(base, "zzz", true, "now")).toBe(base);
  });

  it("이월 항목은 groups 와 carried 양쪽이 같이 바뀌지만 진행률은 한 번만 센다", () => {
    const c = item({ id: "c", carried: true, carriedFromReportId: "r0" });
    const base = plan([item({ id: "a" }), c], [c]);
    const next = applyOptimisticCheck(base, "c", true, "now");
    expect(next.carried[0]?.done).toBe(true);
    expect(next.progress).toMatchObject({ total: 2, done: 1 });
  });

  it("롤백은 그 항목만 되돌리고 다른 항목의 변경은 유지한다", () => {
    const a = item({ id: "a" });
    const b = item({ id: "b" });
    let state = applyOptimisticCheck(plan([a, b]), "a", true, "now");
    state = applyOptimisticCheck(state, "b", true, "now");
    const rolled = rollbackItem(state, a);
    expect(rolled.groups[0]?.items.map((i) => i.done)).toEqual([false, true]);
    expect(rolled.progress.done).toBe(1);
  });

  it("서버 응답으로 item, progress, metrics, nextDeadline 을 덮어쓴다", () => {
    const base = applyOptimisticCheck(
      plan([item({ id: "a" })]),
      "a",
      true,
      "now",
    );
    const serverItem = item({
      id: "a",
      done: true,
      doneSource: "manual",
      doneAt: "srv",
    });
    const next = applyServerChange(base, {
      ok: true,
      changed: true,
      item: serverItem,
      progress: { total: 9, done: 4, remaining: 5, percent: 44 },
      metrics: { marker: 1 },
      nextDeadline: { itemId: "a" },
    });
    expect(next.groups[0]?.items[0]?.doneAt).toBe("srv");
    expect(next.progress.percent).toBe(44);
    expect(next.metrics).toEqual({ marker: 1 });
    expect(next.nextDeadline).toEqual({ itemId: "a" });
  });

  it("변경 없음 응답은 항목만 맞추고 지표는 건드리지 않는다", () => {
    const base = plan([item({ id: "a" })]);
    const next = applyServerChange(base, {
      ok: true,
      changed: false,
      reason: "already_done",
      item: item({ id: "a", done: true, doneSource: "manual" }),
    });
    expect(next.groups[0]?.items[0]?.done).toBe(true);
    expect(next.metrics).toBe(base.metrics);
  });

  it("applyItemPatch 는 원본을 바꾸지 않는다", () => {
    const base = plan([item({ id: "a" })]);
    applyItemPatch(base, item({ id: "a", done: true }));
    expect(base.groups[0]?.items[0]?.done).toBe(false);
  });
});

describe("체크 실패 분기", () => {
  it("CONFLICT 는 롤백하고 다시 불러온다", () => {
    expect(checkFailureOutcome("CONFLICT")).toMatchObject({
      rollback: true,
      refetch: true,
    });
  });
  it("REPORT_NOT_LATEST 는 롤백하고 안내한다", () => {
    const r = checkFailureOutcome("REPORT_NOT_LATEST");
    expect(r.rollback).toBe(true);
    expect(r.message).toContain("최근 회차");
  });
  it("PROGRAM_DONE_LOCKED 는 롤백과 안내, 재조회는 없다", () => {
    expect(checkFailureOutcome("PROGRAM_DONE_LOCKED")).toMatchObject({
      rollback: true,
      refetch: false,
    });
  });
  it("알 수 없는 코드도 롤백한다", () => {
    expect(checkFailureOutcome(null).rollback).toBe(true);
  });
});

describe("마감일 검증", () => {
  it("YYYY-MM-DD 실제 날짜만 통과한다", () => {
    expect(isValidDeadline("2026-12-05")).toBe(true);
    expect(isValidDeadline("2026-02-30")).toBe(false);
    expect(isValidDeadline("2026-2-5")).toBe(false);
    expect(isValidDeadline("20261205")).toBe(false);
    expect(isValidDeadline("")).toBe(false);
  });
  it("빈 값은 해제, 잘못된 값은 undefined 로 바꾼다", () => {
    expect(toDeadlinePayload("")).toBeNull();
    expect(toDeadlinePayload("2026-12-05")).toBe("2026-12-05");
    expect(toDeadlinePayload("2026-13-01")).toBeUndefined();
  });
  it("마감일 입력은 과목 선택 시기에만 둔다", () => {
    expect(canSetDeadline(item({ period: "course_selection" }))).toBe(true);
    expect(canSetDeadline(item({ period: "semester" }))).toBe(false);
    expect(canSetDeadline(item({ period: "vacation" }))).toBe(false);
  });
});

describe("항목 표시", () => {
  it("연동 확정 완료는 해제할 수 없고 수동 완료는 해제할 수 있다", () => {
    expect(isUncheckLocked(item({ done: true, doneSource: "self" }))).toBe(
      true,
    );
    expect(isUncheckLocked(item({ done: true, doneSource: "deep" }))).toBe(
      true,
    );
    expect(isUncheckLocked(item({ done: true, doneSource: "manual" }))).toBe(
      false,
    );
    expect(isUncheckLocked(item({ done: false }))).toBe(false);
  });

  it("진행 문구: 학교는 직접 체크, 연동 가능한 self 는 송신측 전까지 직접 체크 안내", () => {
    expect(progressNote(item({ program: "school" }), false)).toBe(
      "진행: 직접 체크",
    );
    expect(progressNote(item({ program: "self" }), true)).toBe(
      "진행: 위닝 자기평가서에서 진행한 뒤 여기서 직접 체크해요.",
    );
    expect(progressNote(item({ program: "deep" }), true)).toContain(
      "위닝 심화탐구",
    );
  });

  it("연동 미사용 분기: 전달값 없는 self, deep 은 수동 체크 안내만 한다", () => {
    expect(progressNote(item({ program: "self" }), false)).toBe(
      "진행: 직접 체크. 위닝 프로그램을 쓰지 않아도 하면 체크해요.",
    );
    expect(showHandoffButton(item({ id: "x", program: "self" }), {})).toBe(
      false,
    );
  });

  it("school 항목은 전달값이 있어도 연동 버튼이 없다", () => {
    const h = { x: {} as ProgramHandoff };
    expect(showHandoffButton(item({ id: "x", program: "school" }), h)).toBe(
      false,
    );
    expect(showHandoffButton(item({ id: "x", program: "self" }), h)).toBe(true);
    expect(
      showHandoffButton(item({ id: "x", program: "self", done: true }), h),
    ).toBe(false);
  });

  it("완료 배지: 연동 확정, 직접 체크, 학교는 없음", () => {
    expect(
      doneBadge(item({ program: "self", done: true, doneSource: "self" })),
    ).toBe("위닝 자기평가서에서 확정, 자동 완료");
    expect(
      doneBadge(item({ program: "deep", done: true, doneSource: "manual" })),
    ).toBe("직접 체크로 완료");
    expect(
      doneBadge(item({ program: "school", done: true, doneSource: "manual" })),
    ).toBeNull();
    expect(doneBadge(item())).toBeNull();
  });

  it("묶음의 기간 라벨은 항목 periodLabel 에서 읽는다", () => {
    expect(
      groupPeriodLabel({
        period: "semester",
        label: "남은 학기",
        items: [
          item({ periodLabel: null }),
          item({ periodLabel: "2026년 11월" }),
        ],
      }),
    ).toBe("2026년 11월");
  });
});

describe("연동 이동", () => {
  const handoff: ProgramHandoff = {
    reportId: "r1",
    itemId: "i1",
    program: "self",
    theme: "대주제",
    currentGrade: "고2",
    stage: "꽃, 과목에서 진로로",
    subtheme: "소주제",
    condition: {
      title: "조건 제목",
      description: "조건 설명",
      axis: "D",
      category: null,
    },
  };

  it("전달값 요약을 줄 단위로 조립한다", () => {
    const rows = buildHandoffRows(handoff, "2026-11-14T03:00:00Z");
    expect(rows).toEqual([
      { label: "발행 리포트", value: "2026년 11월 14일 발행 리포트" },
      { label: "서사 대주제", value: "대주제" },
      { label: "학년 소주제", value: "소주제" },
      { label: "학년 단계", value: "고2 꽃, 과목에서 진로로" },
      { label: "대상 축", value: "D 공동체역량" },
      { label: "활동 조건", value: "조건 제목" },
      { label: "조건 설명", value: "조건 설명" },
    ]);
  });

  it("값이 없는 줄은 만들지 않는다", () => {
    const rows = buildHandoffRows(
      {
        ...handoff,
        theme: null,
        subtheme: null,
        currentGrade: null,
        stage: null,
        condition: {
          title: "t",
          description: null,
          axis: null,
          category: null,
        },
      },
      null,
    );
    expect(rows).toEqual([{ label: "활동 조건", value: "t" }]);
  });

  it("self 는 자기평가서 새 세션 화면, 나머지는 서비스 소개 경로다", () => {
    expect(handoffDestination("self")).toBe("/app/selfeval/new");
    expect(handoffDestination("deep")).toBe("/services/research");
    expect(handoffDestination("school")).toBe("/services");
  });

  it("전달값을 growth:handoff 키에 JSON 으로 저장한다", () => {
    const setItem = vi.fn();
    expect(storeHandoff(handoff, { setItem })).toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      HANDOFF_STORAGE_KEY,
      JSON.stringify(handoff),
    );
    expect(HANDOFF_STORAGE_KEY).toBe("growth:handoff");
  });

  it("저장소가 던져도 false 로 끝낸다", () => {
    expect(
      storeHandoff(handoff, {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toBe(false);
    expect(storeHandoff(handoff, null)).toBe(false);
  });
});

describe("이월 묶음", () => {
  it("이월 항목이 없으면 null", () => {
    expect(carriedSection(plan([item()]))).toBeNull();
  });
  it("있으면 건수와 항목을 돌려준다", () => {
    const c = item({ id: "c", carried: true });
    expect(carriedSection(plan([c], [c]))).toEqual({ count: 1, items: [c] });
  });
});

describe("완료하면 달라지는 것", () => {
  const snap = (percent: number | null, counts: Record<string, number>) => ({
    consistency: { percent, verdictLabel: percent === null ? null : "보통" },
    axes: Object.entries(counts).map(([axis, count]) => ({
      axis,
      name: `이름${axis}`,
      count,
      verdictLabel: `판정${count}`,
    })),
  });

  it("metrics 가 null 이거나 모양이 다르면 null", () => {
    expect(buildChangeRows(null)).toBeNull();
    expect(buildChangeRows({ now: 1 })).toBeNull();
  });

  it("방향 일관성과 바뀌는 축만 지금, 완료 후 열로 만든다", () => {
    const rows = buildChangeRows({
      now: snap(50, { C: 8, D: 0, E: 2 }),
      afterAll: snap(65, { C: 10, D: 3, E: 2 }),
      changedAxesRemaining: ["D"],
    });
    expect(rows?.map((r) => r.key)).toEqual([
      "consistency",
      "axis-C",
      "axis-D",
    ]);
    expect(rows?.[0]).toMatchObject({ now: "50%", after: "65%" });
    expect(rows?.[1]).toMatchObject({
      label: "C 이름C 근거",
      now: "8건",
      after: "10건",
    });
    expect(rows?.[2]).toMatchObject({ now: "0건", after: "3건" });
  });

  it("카운트는 같아도 changedAxesRemaining 에 있으면 포함한다", () => {
    const rows = buildChangeRows({
      now: snap(50, { A: 1 }),
      afterAll: snap(50, { A: 1 }),
      changedAxesRemaining: ["A"],
    });
    expect(rows?.map((r) => r.key)).toEqual(["consistency", "axis-A"]);
  });

  it("percent 가 null 이면 판정 라벨이나 자료 없음으로 채운다", () => {
    const rows = buildChangeRows({
      now: snap(null, {}),
      afterAll: snap(null, {}),
      changedAxesRemaining: [],
    });
    expect(rows?.[0]).toMatchObject({ now: "자료 없음", after: "자료 없음" });
  });
});

describe("피해야 할 반복", () => {
  it("문자열과 text 객체에서 문구만 뽑는다", () => {
    expect(
      parseAvoidRepeats(["a", { text: "b", evidenceIds: [] }, { x: 1 }, 3, ""]),
    ).toEqual(["a", "b"]);
    expect(parseAvoidRepeats(undefined)).toEqual([]);
  });
});

describe("handoffSubtitle", () => {
  it("송신측이 없는 지금은 자동 완료를 약속하지 않고 직접 체크를 안내한다", () => {
    const text = handoffSubtitle("자기평가서");
    expect(text).toBe(
      "이 과제의 방향을 받은 상태로 자기평가서가 열려요. 해당 프로그램에서 진행한 뒤 여기서 직접 체크해 완료해요.",
    );
    expect(text).not.toContain("자동");
  });
});
