import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import NaesinCard from "./NaesinCard";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

const addGoalGrade = vi.hoisted(() => vi.fn());
vi.mock("@/lib/goalApi", () => ({ addGoalGrade }));

// 모달 폼은 이 테스트의 관심사가 아니다. 제출 결과의 detail 만 보여 주는 대역으로 바꾼다.
vi.mock("@/components/goal/modals/AddNaesinGradeModal", () => ({
  default: function Stub({
    open,
    onSubmit,
  }: {
    open: boolean;
    onSubmit: (e: object) => Promise<{ ok: boolean; detail?: string }>;
  }) {
    const [detail, setDetail] = useState("");
    if (!open) return null;
    return (
      <div>
        <button
          type="button"
          onClick={async () => {
            const r = await onSubmit({ term: "1-1", subjects: {} });
            setDetail(r.detail ?? "");
          }}
        >
          제출
        </button>
        <p>{detail}</p>
      </div>
    );
  },
}));

const data = { round: "1학기", metricLabel: "평균", metricValue: "2.0" };

beforeEach(() => {
  siteState.tenantServiceGate = false;
  addGoalGrade.mockReset();
  addGoalGrade.mockResolvedValue({
    kind: "not-allowed",
    tenantReason: "term_cap",
  });
});

async function submit() {
  render(<NaesinCard data={data} />);
  fireEvent.click(screen.getByRole("button", { name: /성적 추가/ }));
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
}

describe("NaesinCard 이용 거부 문구", () => {
  test("위닝은 기존 문구를 그대로 보인다", async () => {
    await submit();
    expect(await screen.findByText("이용권이 필요합니다.")).toBeInTheDocument();
  });

  test("스쿨멘토는 사유에 맞는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    await submit();
    expect(
      await screen.findByText(
        "이번 학기 이용 횟수를 모두 썼어요. 선생님께 문의해 주세요.",
      ),
    ).toBeInTheDocument();
  });
});
