import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AddScheduleFullModal from "./AddScheduleFullModal";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

const createGoalSchedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/goalApi", () => ({
  createGoalSchedule,
  updateGoalSchedule: vi.fn(),
  deleteGoalSchedule: vi.fn(),
}));

beforeEach(() => {
  siteState.tenantServiceGate = false;
  createGoalSchedule.mockReset();
  createGoalSchedule.mockResolvedValue({
    kind: "not-allowed",
    tenantReason: "disabled",
  });
});

function save() {
  render(
    <AddScheduleFullModal
      open
      onClose={() => {}}
      initial={{
        scheduleType: "exam",
        title: "중간고사",
        dueDate: "2026-12-01",
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "일정 저장하기" }));
}

describe("AddScheduleFullModal 이용 거부 문구", () => {
  it("위닝은 기존 문구를 그대로 보인다", async () => {
    save();
    expect(
      await screen.findByText("유료결제이후 이용해주세요!"),
    ).toBeInTheDocument();
  });

  it("스쿨멘토는 사유에 맞는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    save();
    expect(
      await screen.findByText("소속 기관에서 제공하지 않는 서비스예요."),
    ).toBeInTheDocument();
  });
});
