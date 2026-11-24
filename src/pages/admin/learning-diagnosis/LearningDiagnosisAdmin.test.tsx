// 학습진단 관리 화면. 서버 호출은 가짜 api 로 막고 호출한 경로와 본문을 본다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/lib/http/client",
  async () => (await import("./fakeApi")).clientMock,
);

import { toast } from "@/components/ui/toast";
import { callsTo, FakeApiError, on, resetApi } from "./fakeApi";
import { BASE, renderAdmin, seed } from "./testKit";

const toastTitle = () => document.querySelector('[data-slot="toast-title"]');

// 질문은 조회가 끝나면 모두 펼쳐진 채로 뜬다.
const questionDeleteButton = () =>
  screen.findByRole("button", { name: "질문 삭제" });

beforeEach(() => {
  resetApi();
  seed();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  toast.close();
  vi.restoreAllMocks();
});

describe("LearningDiagnosisAdmin 조회", () => {
  it("세 목록을 서버에서 받아 그린다", async () => {
    renderAdmin();
    expect(await screen.findByText("가장 큰 고민")).toBeInTheDocument();
    expect(screen.getByDisplayValue("수행평가")).toBeInTheDocument();
    expect(screen.getByDisplayValue("수행평가 서비스")).toBeInTheDocument();
  });

  it("새로고침 버튼은 세 목록을 다시 받는다", async () => {
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "새로고침" }));
    await waitFor(() =>
      expect(callsTo("GET", `${BASE}/questions`)).toHaveLength(2),
    );
    expect(callsTo("GET", `${BASE}/options`)).toHaveLength(2);
    expect(callsTo("GET", `${BASE}/programs`)).toHaveLength(2);
  });

  it("조회에 실패하면 원문 없이 닫을 때까지 남는 오류 토스트가 보인다", async () => {
    on("GET", `${BASE}/questions`, () => {
      throw new FakeApiError(500, "INTERNAL_ERROR", "서버 원문");
    });
    const addSpy = vi.spyOn(toast, "add");
    renderAdmin();
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("학습진단 데이터 조회 실패"),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", priority: "high", timeout: 0 }),
    );
    expect(document.body.textContent).not.toContain("서버 원문");
  });
});

describe("LearningDiagnosisAdmin 질문", () => {
  it("질문 삭제 확인창에서 취소하면 삭제하지 않는다", async () => {
    renderAdmin();
    fireEvent.click(await questionDeleteButton());
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(
      "질문을 삭제하면 질문 안의 답변도 함께 삭제됩니다. 삭제하시겠습니까?",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(callsTo("DELETE", `${BASE}/questions/q1`)).toHaveLength(0);
  });

  it("질문 삭제를 확인하면 삭제하고 목록을 다시 받는다", async () => {
    on("DELETE", `${BASE}/questions/q1`, undefined);
    renderAdmin();
    fireEvent.click(await questionDeleteButton());
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );
    await waitFor(() =>
      expect(callsTo("DELETE", `${BASE}/questions/q1`)).toHaveLength(1),
    );
    await waitFor(() =>
      expect(callsTo("GET", `${BASE}/questions`)).toHaveLength(2),
    );
  });

  it("질문 내용을 비우고 추가하면 경고 토스트가 보이고 요청하지 않는다", async () => {
    const addSpy = vi.spyOn(toast, "add");
    renderAdmin();
    fireEvent.click(await screen.findByRole("button", { name: "질문 추가" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("질문 내용을 입력하세요."),
    );
    expect(addSpy).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "high", timeout: 0 }),
    );
    expect(callsTo("POST", `${BASE}/questions`)).toHaveLength(0);
  });

  it("새 질문을 추가하면 다음 순서 번호로 등록한다", async () => {
    on("POST", `${BASE}/questions`, { id: "q2" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.change(screen.getByPlaceholderText(/가장 큰 학습 고민/), {
      target: { value: "새 질문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "질문 추가" }));
    await waitFor(() =>
      expect(callsTo("POST", `${BASE}/questions`)).toHaveLength(1),
    );
    expect(callsTo("POST", `${BASE}/questions`)[0]?.options.json).toEqual({
      title: "새 질문",
      description: "",
      input_type: "single",
      is_required: true,
      is_active: true,
      sort_order: 2,
    });
  });

  it("질문 저장은 PATCH 로 보내고 성공 토스트가 보인다", async () => {
    on("PATCH", `${BASE}/questions/q1`, { id: "q1" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("질문 저장 완료"),
    );
    expect(callsTo("PATCH", `${BASE}/questions/q1`)[0]?.options.json).toEqual({
      title: "가장 큰 고민",
      description: "",
      input_type: "single",
      is_required: true,
      is_active: true,
      sort_order: 1,
    });
  });

  it("질문 저장이 실패하면 서버 원문 없이 오류 토스트가 보인다", async () => {
    on("PATCH", `${BASE}/questions/q1`, () => {
      throw new FakeApiError(500, "INTERNAL_ERROR", "서버 원문");
    });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "질문 저장" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("질문 저장 실패"),
    );
    expect(document.body.textContent).not.toContain("서버 원문");
  });

  it("저장하는 동안 저장 버튼이 비활성이다", async () => {
    let finish: (value: unknown) => void = () => {};
    on(
      "PATCH",
      `${BASE}/questions/q1`,
      () => new Promise((resolve) => (finish = resolve)),
    );
    renderAdmin();
    await questionDeleteButton();
    const save = screen.getByRole("button", { name: "질문 저장" });
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    finish({ id: "q1" });
    await waitFor(() => expect(save).toBeEnabled());
  });
});

describe("LearningDiagnosisAdmin 답변", () => {
  it("답변 추가는 빈 답변을 다음 순서로 등록한다", async () => {
    on("POST", `${BASE}/options`, { id: "o2" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "답변 추가" }));
    await waitFor(() =>
      expect(callsTo("POST", `${BASE}/options`)).toHaveLength(1),
    );
    expect(callsTo("POST", `${BASE}/options`)[0]?.options.json).toEqual({
      question_id: "q1",
      label: "",
      program_ids: [],
      is_active: true,
      sort_order: 2,
    });
  });

  it("답변 저장은 label, 추천 프로그램, 순서를 PATCH 로 보낸다", async () => {
    on("PATCH", `${BASE}/options/o1`, { id: "o1" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("답변 저장 완료"),
    );
    expect(callsTo("PATCH", `${BASE}/options/o1`)[0]?.options.json).toEqual({
      label: "수행평가",
      program_ids: ["p1"],
      is_active: true,
      sort_order: 1,
    });
  });

  it("답변 내용을 비우고 저장하면 경고만 보이고 요청하지 않는다", async () => {
    renderAdmin();
    await questionDeleteButton();
    fireEvent.change(screen.getByPlaceholderText("답변 내용을 입력하세요"), {
      target: { value: " " },
    });
    fireEvent.click(screen.getByRole("button", { name: "답변 저장" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("답변 내용을 입력하세요."),
    );
    expect(callsTo("PATCH", `${BASE}/options/o1`)).toHaveLength(0);
  });

  it("답변 삭제를 확인하면 DELETE 를 보낸다", async () => {
    on("DELETE", `${BASE}/options/o1`, undefined);
    renderAdmin();
    await questionDeleteButton();
    const optionBox = screen
      .getByPlaceholderText("답변 내용을 입력하세요")
      .closest("div.rounded-sm") as HTMLElement;
    fireEvent.click(within(optionBox).getByRole("button", { name: "삭제" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );
    await waitFor(() =>
      expect(callsTo("DELETE", `${BASE}/options/o1`)).toHaveLength(1),
    );
  });
});

describe("LearningDiagnosisAdmin 추천 프로그램", () => {
  it("새 프로그램은 이름을 다듬어 등록하고 비어 있으면 경고한다", async () => {
    on("POST", `${BASE}/programs`, { id: "p2" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "추천 프로그램 추가" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("프로그램명을 입력하세요."),
    );
    expect(callsTo("POST", `${BASE}/programs`)).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText(/위닝 수행평가 서비스/), {
      target: { value: " 새 프로그램 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "추천 프로그램 추가" }));
    await waitFor(() =>
      expect(callsTo("POST", `${BASE}/programs`)).toHaveLength(1),
    );
    expect(callsTo("POST", `${BASE}/programs`)[0]?.options.json).toEqual({
      title: "새 프로그램",
      badge: "추천 서비스",
      description: "",
      primary_button_text: "서비스 확인하기",
      primary_button_link: "",
      secondary_button_text: "",
      secondary_button_link: "",
      icon: "target",
      is_active: true,
      sort_order: 2,
    });
  });

  it("프로그램 저장은 PATCH 로 보낸다", async () => {
    on("PATCH", `${BASE}/programs/p1`, { id: "p1" });
    renderAdmin();
    await questionDeleteButton();
    fireEvent.click(screen.getByRole("button", { name: "저장" }));
    await waitFor(() =>
      expect(toastTitle()).toHaveTextContent("추천 프로그램 저장 완료"),
    );
    expect(callsTo("PATCH", `${BASE}/programs/p1`)[0]?.options.json).toEqual({
      title: "수행평가 서비스",
      badge: "추천 서비스",
      description: "",
      primary_button_text: "서비스 확인하기",
      primary_button_link: "",
      secondary_button_text: "",
      secondary_button_link: "",
      icon: "target",
      is_active: true,
      sort_order: 1,
    });
  });

  it("프로그램 삭제를 확인하면 DELETE 를 보낸다", async () => {
    on("DELETE", `${BASE}/programs/p1`, undefined);
    renderAdmin();
    await questionDeleteButton();
    const card = screen
      .getByDisplayValue("수행평가 서비스")
      .closest("div.border") as HTMLElement;
    fireEvent.click(within(card).getByRole("button", { name: "삭제" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "삭제",
      }),
    );
    await waitFor(() =>
      expect(callsTo("DELETE", `${BASE}/programs/p1`)).toHaveLength(1),
    );
  });
});
