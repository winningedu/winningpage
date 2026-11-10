import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Grades from "./Grades";

const siteState = vi.hoisted(() => ({ tenantServiceGate: false }));
vi.mock("@/config/site", () => ({ site: { features: siteState } }));

vi.mock("@/context/AuthProvider", () => ({
  useAuth: () => ({ userId: "student-1" }),
}));

const api = vi.hoisted(() => ({
  fetchGoalStudent: vi.fn(),
  fetchGoalGrades: vi.fn(),
  addGoalGrade: vi.fn(),
  updateGoalGrade: vi.fn(),
  deleteGoalGrade: vi.fn(),
}));
vi.mock("@/lib/goalApi", () => api);

// 모달 폼은 이 테스트의 관심사가 아니다. 제출 결과의 detail 만 보여 주는 대역으로 바꾼다.
function Stub({
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
}
vi.mock("@/components/goal/modals/AddNaesinGradeModal", () => ({
  default: Stub,
}));
vi.mock("@/components/goal/modals/AddMockExamGradeModal", () => ({
  default: Stub,
}));

const denyState = { reason: "month_cap" };

const MONTH_CAP =
  "이번 달 이용 횟수를 모두 썼어요. 다음 달 1일부터 다시 이용할 수 있어요.";

const TEACHER = "선생님 계정에서는 학생 서비스를 이용할 수 없어요.";

beforeEach(() => {
  denyState.reason = "month_cap";
  siteState.tenantServiceGate = false;
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchGoalStudent.mockResolvedValue({
    kind: "onboarded",
    student: {
      targets: {
        min: { naesinCut: 2.5 },
        ideal: { jungsiCut: 90 },
      },
      scores: { convertedGrade: 2, currentMogo: 80 },
    },
  });
  api.fetchGoalGrades.mockResolvedValue({
    kind: "ok",
    naesinRecords: [{ term: "1-1", value: 2, subjects: {} }],
    mockRecords: [],
  });
  const denied = async () => ({
    kind: "not-allowed",
    tenantReason: denyState.reason,
  });
  api.addGoalGrade.mockImplementation(denied);
  api.updateGoalGrade.mockImplementation(denied);
});

async function openAdd() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Grades />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(
    (await screen.findAllByText("+ 회차 추가"))[0] as HTMLElement,
  );
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
}

async function openEdit() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <Grades />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(
    (await screen.findAllByRole("button", { name: "수정" }))[0] as HTMLElement,
  );
  fireEvent.click(screen.getByRole("button", { name: "수정" }));
  fireEvent.click(screen.getByRole("button", { name: "제출" }));
}

describe("Grades 이용 거부 문구", () => {
  it("추가: 위닝은 기존 문구를 그대로 보인다", async () => {
    await openAdd();
    expect(await screen.findByText("이용권이 필요합니다.")).toBeInTheDocument();
  });

  it("추가: 스쿨멘토는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    await openAdd();
    expect(await screen.findByText(MONTH_CAP)).toBeInTheDocument();
  });

  it("추가: 스쿨멘토는 선생님 계정에 선생님 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    denyState.reason = "teacher";
    await openAdd();
    expect(await screen.findByText(TEACHER)).toBeInTheDocument();
  });

  it("수정: 위닝은 기존 문구를 그대로 보인다", async () => {
    await openEdit();
    expect(await screen.findByText("이용권이 필요합니다.")).toBeInTheDocument();
  });

  it("수정: 스쿨멘토는 결정 99 문구를 보인다", async () => {
    siteState.tenantServiceGate = true;
    await openEdit();
    expect(await screen.findByText(MONTH_CAP)).toBeInTheDocument();
  });
});
