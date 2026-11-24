import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { ReportPayload } from "@/lib/selfeval/reportTypes";
import SelfevalReportDocument from "./SelfevalReportDocument";
import { SAMPLE_PAYLOAD } from "./testFixtures";

function renderDoc(payload: ReportPayload = SAMPLE_PAYLOAD, name = "QA학생") {
  return render(
    <SelfevalReportDocument
      payload={payload}
      studentName={name}
      onRebuild={() => {}}
    />,
  );
}

const withoutMemos: ReportPayload = {
  ...SAMPLE_PAYLOAD,
  ch04: null,
};

const pageOf = (region: HTMLElement) =>
  region.querySelector("footer span:last-child")?.textContent;

const chapter = (no: string, title: string) =>
  screen.getByRole("region", { name: `${no} ${title}` });

describe("표지", () => {
  test("제목은 과목 자기평가서이고 목차 01~05장을 그린다", () => {
    renderDoc();
    const cover = screen.getByLabelText("자기평가 리포트 표지");
    expect(
      within(cover).getByRole("heading", { name: "수학 자기평가서" }),
    ).toBeInTheDocument();
    const areas = within(cover).getAllByTestId("cover-area");
    expect(areas.map((a) => a.textContent)).toEqual([
      "01자기평가 본문",
      "02과목별 수행, 심화 활동",
      "03기 제출 보고서와의 연관성",
      "04수기 수행보고 연관성",
      "05성장 흐름과 다음 단계",
    ]);
  });

  test("수기 메모가 없어 04장이 없으면 목차 04에 해당 없음을 적고 04장을 그리지 않는다", () => {
    renderDoc(withoutMemos);
    const areas = screen.getAllByTestId("cover-area");
    expect(areas[3]).toHaveTextContent("해당 없음");
    expect(screen.queryByRole("region", { name: /^04 / })).toBeNull();
  });

  test("이용한 단계만 채워 그린다", () => {
    renderDoc({
      ...SAMPLE_PAYLOAD,
      cover: {
        ...SAMPLE_PAYLOAD.cover,
        steps: { ...SAMPLE_PAYLOAD.cover.steps, diagnosis: false, goal: false },
      },
    });
    const filled = screen
      .getAllByTestId("cover-step")
      .map((s) => s.getAttribute("data-filled"));
    expect(filled).toEqual(["false", "false", "true", "true", "true", "true"]);
  });

  test("학생명은 계정에서 받은 값, 학년, 저장일을 정보 줄에 그리고 서비스 유형은 그리지 않는다", () => {
    renderDoc();
    const info = screen.getByTestId("cover-info");
    expect(info).toHaveTextContent("QA학생");
    expect(info).toHaveTextContent("고등학교 1학년");
    expect(info).toHaveTextContent("2026. 11. 10");
    expect(info).not.toHaveTextContent("개별관리");
    expect(info).not.toHaveTextContent("서비스");
  });

  test("서비스 유형이 들어 있는 예전 저장 payload 도 서비스 라벨 없이 그린다", () => {
    for (const serviceTier of ["individual", "standard", null]) {
      const { unmount } = renderDoc({
        ...SAMPLE_PAYLOAD,
        cover: { ...SAMPLE_PAYLOAD.cover, serviceTier },
      } as ReportPayload);
      const info = screen.getByTestId("cover-info");
      expect(info).toHaveTextContent("2026. 11. 10");
      expect(info).not.toHaveTextContent("개별관리");
      expect(info).not.toHaveTextContent("서비스");
      unmount();
    }
  });

  test("학생 이름은 payload 가 아니라 prop 에서만 읽는다", () => {
    const leaked = {
      ...SAMPLE_PAYLOAD,
      studentName: "페이로드이름",
      cover: { ...SAMPLE_PAYLOAD.cover, studentName: "페이로드이름" },
    } as unknown as ReportPayload;
    renderDoc(leaked, "계정이름");
    expect(screen.queryByText(/페이로드이름/)).toBeNull();
    expect(screen.getAllByText(/계정이름/).length).toBeGreaterThan(0);
  });

  test("샘플 전용 표식은 그리지 않는다", () => {
    renderDoc();
    for (const text of [/SAMPLE/, "NEW", "수기 업로드 학생", /개발 참고/]) {
      expect(screen.queryByText(text)).toBeNull();
    }
  });
});

describe("장 머리말과 바닥글", () => {
  test("각 장은 로고와 SELF EVALUATION REPORT 머리말, 학생명과 과목 바닥글, 쪽수를 갖는다", () => {
    renderDoc();
    const ch01 = chapter("01", "자기평가 본문");
    expect(within(ch01).getByAltText("위닝에듀")).toBeInTheDocument();
    expect(
      within(ch01).getByText("SELF EVALUATION REPORT"),
    ).toBeInTheDocument();
    expect(
      within(ch01).getByText("QA학생, 수학 자기평가서"),
    ).toBeInTheDocument();
    expect(pageOf(ch01)).toBe("02");
    expect(pageOf(chapter("05", "성장 흐름과 다음 단계"))).toBe("06");
  });

  test("04장이 없으면 05장 쪽수가 하나 당겨진다", () => {
    renderDoc(withoutMemos);
    expect(pageOf(chapter("05", "성장 흐름과 다음 단계"))).toBe("05");
  });

  test("가운뎃점, 긴 줄표, 화살표를 쓰지 않는다", () => {
    const { container } = renderDoc();
    expect(container.textContent).not.toMatch(/[\u00B7\u2014\u2013\u2192]/);
  });
});

describe("01장 자기평가 본문", () => {
  test("목표 글자 수가 있는 소개 문장과 글자 수, 목표 대비, 문단, 문장 수 줄을 그린다", () => {
    renderDoc();
    const ch = chapter("01", "자기평가 본문");
    expect(
      within(ch).getByText(
        "학생이 완성한 자기평가 결과(목표 500자)입니다. 문장마다 근거가 된 활동 기록을 표시했습니다.",
      ),
    ).toBeInTheDocument();
    expect(
      within(ch).getByText(
        "수학 자기평가서 공백 포함 493자 (목표 대비 -1.4%), 3문단, 9문장",
      ),
    ).toBeInTheDocument();
  });

  test("목표가 없으면 목표 대비를 뺀다", () => {
    renderDoc({
      ...SAMPLE_PAYLOAD,
      ch01: {
        ...SAMPLE_PAYLOAD.ch01,
        targetChars: null,
        diffPercent: null,
      },
    });
    const ch = chapter("01", "자기평가 본문");
    expect(
      within(ch).getByText("수학 자기평가서 공백 포함 493자, 3문단, 9문장"),
    ).toBeInTheDocument();
    expect(within(ch).queryByText(/목표/)).toBeNull();
  });

  test("문단 칩, 동그라미 문장 번호, 문장 본문, 꼬리표 칩을 순서대로 그린다", () => {
    renderDoc();
    const ch = chapter("01", "자기평가 본문");
    expect(
      ["문단 1", "문단 2", "문단 3"].map((t) => within(ch).getByText(t)),
    ).toHaveLength(3);
    const first = within(ch).getByTestId("sentence-1");
    expect(first).toHaveTextContent("①");
    expect(first).toHaveTextContent("매점 도우미 활동 중 친구의 질문을");
    const chips = within(first).getAllByTestId("tag-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["H1", "P1"]);
    expect(chips.map((c) => c.getAttribute("data-kind"))).toEqual(["H", "P"]);
    expect(within(ch).getByTestId("sentence-9")).toHaveTextContent("⑨");
  });

  test("범례는 P, D, H 를 그리고 A 꼬리표가 있을 때만 A 를 더한다", () => {
    const { unmount } = renderDoc();
    const legend = within(chapter("01", "자기평가 본문")).getByTestId("legend");
    expect(legend).toHaveTextContent("수행평가 보고서");
    expect(legend).toHaveTextContent("심화탐구 보고서");
    expect(legend).toHaveTextContent("학생 수기 수행보고");
    expect(legend).not.toHaveTextContent("활동 기록");
    unmount();

    const first = SAMPLE_PAYLOAD.ch01.paragraphs[0];
    const sentence = first?.sentences[0];
    if (!first || !sentence) throw new Error("fixture");
    renderDoc({
      ...SAMPLE_PAYLOAD,
      ch01: {
        ...SAMPLE_PAYLOAD.ch01,
        paragraphs: [
          { sentences: [{ ...sentence, tags: ["A1"] }] },
          ...SAMPLE_PAYLOAD.ch01.paragraphs.slice(1),
        ],
      },
    });
    expect(
      within(chapter("01", "자기평가 본문")).getByTestId("legend"),
    ).toHaveTextContent("활동 기록");
  });

  test("근거가 없는 문장은 확인 필요로 표시한다", () => {
    const first = SAMPLE_PAYLOAD.ch01.paragraphs[0];
    const sentence = first?.sentences[0];
    if (!first || !sentence) throw new Error("fixture");
    renderDoc({
      ...SAMPLE_PAYLOAD,
      ch01: {
        ...SAMPLE_PAYLOAD.ch01,
        paragraphs: [
          { sentences: [{ ...sentence, tags: [], needsConfirm: true }] },
          ...SAMPLE_PAYLOAD.ch01.paragraphs.slice(1),
        ],
      },
    });
    expect(
      within(screen.getByTestId("sentence-1")).getByText("확인 필요"),
    ).toBeInTheDocument();
  });
});
