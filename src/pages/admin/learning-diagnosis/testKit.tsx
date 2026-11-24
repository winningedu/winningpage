// 학습진단 화면 테스트 공용. react-query 안에 그리고 기본 조회 응답을 건다.

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { Toaster } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import { on } from "@/pages/admin/shared/fakeApi";
import LearningDiagnosisAdmin from "./LearningDiagnosisAdmin";

export const BASE = "admin/learning-diagnosis";

export const question = {
  id: "q1",
  title: "가장 큰 고민",
  description: "",
  input_type: "single",
  is_required: true,
  is_active: true,
  sort_order: 1,
};

export const option = {
  id: "o1",
  question_id: "q1",
  label: "수행평가",
  program_ids: ["p1"],
  is_active: true,
  sort_order: 1,
};

export const program = {
  id: "p1",
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
};

/** 세 목록 조회 응답을 건다. 넘기지 않은 목록은 기본 행 하나다. */
export function seed(
  data: {
    questions?: unknown[];
    options?: unknown[];
    programs?: unknown[];
  } = {},
) {
  on("GET", `${BASE}/questions`, { items: data.questions ?? [question] });
  on("GET", `${BASE}/options`, { items: data.options ?? [option] });
  on("GET", `${BASE}/programs`, { items: data.programs ?? [program] });
}

export function renderAdmin() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LearningDiagnosisAdmin />
      <Toaster />
      <ConfirmAdminHost />
    </QueryClientProvider>,
  );
}
