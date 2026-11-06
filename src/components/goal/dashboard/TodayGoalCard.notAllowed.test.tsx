import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import TodayGoalCard from "./TodayGoalCard";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

const submitDailyRecord = vi.hoisted(() => vi.fn());
vi.mock("@/lib/goalApi", () => ({ submitDailyRecord }));

const data = {
  studyHours: 2,
  quickAddOptions: [0.5, 1],
  upperGoalRate: 40,
  lowerGoalRate: 80,
  upperTargetHours: 5,
  lowerTargetHours: 2.5,
  cooldown: null,
  summary: null,
  tomorrowTargets: { upper: 0, lower: 0 },
};

beforeEach(() => {
  siteState.tenantServiceGate = false;
  submitDailyRecord.mockReset();
  submitDailyRecord.mockResolvedValue({
    kind: "not-allowed",
    tenantReason: "month_cap",
  });
});

async function save() {
  render(<TodayGoalCard data={data as never} />);
  fireEvent.click(screen.getByRole("button", { name: /기록 저장/ }));
}

describe("TodayGoalCard 이용 거부 문구", () => {
  test("위닝은 기존 문구를 그대로 보인다", async () => {
    await save();
    expect(
      await screen.findByText("이용권이 필요한 서비스입니다."),
    ).toBeInTheDocument();
  });

  test("스쿨멘토는 사유에 맞는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    await save();
    expect(
      await screen.findByText(
        "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.",
      ),
    ).toBeInTheDocument();
  });
});
