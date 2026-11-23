import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { CandidateRow, RecordLink } from "@/lib/selfeval/types";
import LinkMap from "./LinkMap";

function row(id: string, topic: string, course: string, date: string) {
  return {
    activity: {
      id,
      sourceProgram: "performance",
      status: "confirmed",
      gradeLabel: "고2",
      semester: 1,
      subjectGroup: null,
      subject: course,
      topic,
      concept: null,
      method: null,
      result: null,
      limitation: null,
      numbers: null,
      sources: null,
      createdAt: date,
      courseName: course,
    },
    fit: { activityId: id, score: 70, signals: [], reasons: [] },
    unavailableReason: null,
    alreadyUsed: false,
    role: null,
    submittedAt: date,
  } as CandidateRow;
}

const rows = [
  row("a", "버스 배차 분석", "수학", "2026-09-01T00:00:00Z"),
  row("b", "표본조사 설계", "확률과 통계", "2026-10-01T00:00:00Z"),
  row("c", "지역 마케팅", "한국지리", "2026-11-01T00:00:00Z"),
];

const link = (over: Partial<RecordLink> = {}): RecordLink => ({
  fromId: "a",
  toId: "b",
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

function setup(links: RecordLink[], over: { rows?: CandidateRow[] } = {}) {
  const handlers = {
    onDelete: vi.fn(),
    onConfirm: vi.fn(),
    onAdd: vi.fn(),
  };
  render(
    <LinkMap
      rows={over.rows ?? rows}
      links={links}
      busy={false}
      {...handlers}
    />,
  );
  return handlers;
}

describe("LinkMap", () => {
  test("과목별 열 이름과 기록 제목을 보여 준다", () => {
    setup([link()]);
    const map = screen.getByRole("region", { name: "연계 지도" });
    for (const t of ["수학", "확률과 통계", "한국지리"]) {
      expect(within(map).getAllByText(t).length).toBeGreaterThan(0);
    }
    expect(within(map).getAllByText("버스 배차 분석").length).toBeGreaterThan(
      0,
    );
  });

  test("선마다 유형과 강도를 적고 지우기를 누르면 두 기록 id 로 알린다", () => {
    const h = setup([link()]);
    const item = screen.getByRole("listitem", {
      name: "버스 배차 분석과 표본조사 설계",
    });
    expect(within(item).getByText("이어받음, 기록에 명시")).toBeTruthy();
    fireEvent.click(within(item).getByRole("button", { name: "선 지우기" }));
    expect(h.onDelete).toHaveBeenCalledWith("a", "b");
  });

  test("확인하지 않은 암묵 연계는 연결 문장에 쓰지 않는다고 알리고 확인 버튼을 준다", () => {
    const h = setup([link({ strength: "implicit" })]);
    expect(
      screen.getByText("확인하기 전에는 연결 문장 없이 참고 항목으로만 써요"),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "실제로 이어서 했어요" }),
    );
    expect(h.onConfirm).toHaveBeenCalledWith("a", "b");
  });

  test("확인했거나 명시된 연계에는 확인 버튼과 안내가 없다", () => {
    setup([
      link({ strength: "implicit", confirmed: true }),
      link({ fromId: "b", toId: "c" }),
    ]);
    expect(
      screen.queryByRole("button", { name: "실제로 이어서 했어요" }),
    ).toBeNull();
    expect(screen.queryByText(/확인하기 전에는/)).toBeNull();
  });

  test("지운 선과 선택하지 않은 기록의 선은 그리지 않는다", () => {
    setup([link({ deleted: true }), link({ fromId: "a", toId: "zzz" })]);
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(screen.getByText("이어진 선이 없어요")).toBeTruthy();
  });

  test("새 선은 한 줄 설명이 있어야 긋고 제출일이 앞선 기록을 앞에 둔다", () => {
    const h = setup([]);
    const add = screen.getByRole("group", { name: "새 선 긋기" });
    fireEvent.change(within(add).getByLabelText("앞 기록"), {
      target: { value: "c" },
    });
    fireEvent.change(within(add).getByLabelText("뒤 기록"), {
      target: { value: "a" },
    });
    const submit = within(add).getByRole("button", { name: "선 긋기" });
    expect((submit as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(add).getByLabelText("연계 유형"), {
      target: { value: "background" },
    });
    fireEvent.change(within(add).getByLabelText("어떻게 이어지는지 한 줄"), {
      target: { value: "통계 개념을 빌려 썼다" },
    });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);
    expect(h.onAdd).toHaveBeenCalledWith({
      fromId: "a",
      toId: "c",
      type: "background",
      note: "통계 개념을 빌려 썼다",
    });
  });

  test("같은 기록끼리는 이을 수 없다", () => {
    setup([]);
    const add = screen.getByRole("group", { name: "새 선 긋기" });
    fireEvent.change(within(add).getByLabelText("앞 기록"), {
      target: { value: "a" },
    });
    fireEvent.change(within(add).getByLabelText("뒤 기록"), {
      target: { value: "a" },
    });
    fireEvent.change(within(add).getByLabelText("어떻게 이어지는지 한 줄"), {
      target: { value: "설명" },
    });
    expect(
      (
        within(add).getByRole("button", {
          name: "선 긋기",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  test("선택한 기록이 하나뿐이면 새 선 긋기를 보이지 않는다", () => {
    setup([], { rows: [rows[0] as CandidateRow] });
    expect(screen.queryByRole("group", { name: "새 선 긋기" })).toBeNull();
  });
});
