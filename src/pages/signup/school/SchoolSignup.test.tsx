import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupProvider } from "@/context/SignupContext";
import SchoolSignup from "./SchoolSignup";

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { setSession: vi.fn(async () => ({ error: null })) },
  },
}));

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup/student"]}>
      <SignupProvider>
        <Routes>
          <Route path="/signup/student" element={<SchoolSignup />} />
        </Routes>
      </SignupProvider>
    </MemoryRouter>,
  );
}

function check(name: RegExp) {
  fireEvent.click(screen.getByRole("checkbox", { name }));
}

// 경로별 응답을 정해 두는 fetch 대역. 호출 본문은 calls에 쌓인다.
type Reply = { status?: number; body: unknown };
const calls: { url: string; body: Record<string, unknown> }[] = [];

function mockApi(routes: Record<string, Reply | ((body: unknown) => Reply)>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, body });
      const route = routes[url];
      const reply = typeof route === "function" ? route(body) : route;
      const status = reply?.status ?? 200;
      return {
        ok: status < 300,
        status,
        json: async () => reply?.body ?? {},
      };
    }),
  );
}

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name }));
}

function type(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function agreeRequiredTerms() {
  check(/이용약관/);
  check(/개인정보 수집 및 이용/);
  check(/DB 전환 안내/);
  click("다음");
}

const TENANT = { tenantId: "t-1", name: "새빛중학교", orgType: "학교" };

beforeEach(() => {
  window.sessionStorage.clear();
  calls.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("1단계 약관 동의", () => {
  it("필수 3개를 모두 동의해야 다음으로 넘어간다", () => {
    renderSignup();

    const next = screen.getByRole("button", { name: "다음" });
    expect(next).toBeDisabled();

    check(/이용약관/);
    check(/개인정보 수집 및 이용/);
    expect(next).toBeDisabled();

    check(/DB 전환 안내/);
    expect(next).toBeEnabled();
  });
});

describe("2단계 소속 확인", () => {
  it("소속코드를 확인하면 기관명이 보이고 다음 단계로 간다", async () => {
    mockApi({ "/api/signup/tenant-lookup": { body: TENANT } });
    renderSignup();
    agreeRequiredTerms();

    type("소속코드", "abcdefgh");
    click("확인");

    expect(await screen.findByText("새빛중학교")).toBeInTheDocument();
    expect(calls[0]?.body).toEqual({ code: "ABCDEFGH" });

    click("다음");
    expect(screen.getByLabelText("이름")).toBeInTheDocument();
  });

  it("없는 코드는 다시 확인하라고 안내하고 다음으로 넘기지 않는다", async () => {
    mockApi({
      "/api/signup/tenant-lookup": {
        status: 404,
        body: { code: "TENANT_NOT_FOUND" },
      },
    });
    renderSignup();
    agreeRequiredTerms();

    type("소속코드", "ABCDEFGH");
    click("확인");

    expect(
      await screen.findByText("소속코드를 다시 확인해 주세요."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("형식이 틀린 코드는 서버에 묻지 않고 거절한다", () => {
    mockApi({});
    renderSignup();
    agreeRequiredTerms();

    type("소속코드", "ABC");
    click("확인");

    expect(
      screen.getByText("소속코드를 다시 확인해 주세요."),
    ).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("시도 횟수를 넘기면 잠시 후 다시 하라고 안내한다", async () => {
    mockApi({
      "/api/signup/tenant-lookup": { status: 429, body: { code: "WC068" } },
    });
    renderSignup();
    agreeRequiredTerms();

    type("소속코드", "ABCDEFGH");
    click("확인");

    expect(await screen.findByText(/잠시 후 다시 시도/)).toBeInTheDocument();
  });

  it("코드를 고치면 확인 결과가 사라진다", async () => {
    mockApi({ "/api/signup/tenant-lookup": { body: TENANT } });
    renderSignup();
    agreeRequiredTerms();
    type("소속코드", "ABCDEFGH");
    click("확인");
    await screen.findByText("새빛중학교");

    type("소속코드", "ABCDEFGJ");

    expect(screen.queryByText("새빛중학교")).toBeNull();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("코드를 비우고 다음을 누르면 확인 창이 뜨고 기타 소속으로 가입할 수 있다", () => {
    renderSignup();
    agreeRequiredTerms();

    click("다음");

    expect(
      screen.getByText(
        "소속코드를 모르시나요? 담당 선생님께 먼저 확인해 주세요",
      ),
    ).toBeInTheDocument();

    click("기타 소속으로 가입");

    expect(screen.getByLabelText("이름")).toBeInTheDocument();
  });

  it("확인 창에서 코드 입력하기를 누르면 창만 닫힌다", () => {
    renderSignup();
    agreeRequiredTerms();
    click("다음");

    click("코드 입력하기");

    expect(
      screen.queryByText(
        "소속코드를 모르시나요? 담당 선생님께 먼저 확인해 주세요",
      ),
    ).toBeNull();
    expect(screen.getByLabelText("소속코드")).toBeInTheDocument();
  });
});

// 소속을 확인한 뒤 3단계까지 간다. orgType으로 학교와 학원을 가른다.
async function goToStudentInfo(orgType = "학교") {
  mockApi({
    "/api/signup/tenant-lookup": { body: { ...TENANT, orgType } },
  });
  renderSignup();
  agreeRequiredTerms();
  type("소속코드", "ABCDEFGH");
  click("확인");
  await screen.findByText("새빛중학교");
  click("다음");
}

describe("3단계 학생 정보 칸", () => {
  it("학교 소속은 학년, 반, 번호를 받고 그룹은 숨긴다", async () => {
    await goToStudentInfo("학교");

    for (const label of [
      "이름",
      "아이디",
      "비밀번호",
      "비밀번호 확인",
      "휴대폰번호",
      "이메일",
      "생년월일",
      "성별",
      "학년",
      "반",
      "번호(선택)",
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    expect(screen.queryByLabelText("그룹(선택)")).toBeNull();
    expect(
      screen.getByText("학년, 반, 번호는 선생님 화면의 학급 편성에 쓰여요."),
    ).toBeInTheDocument();
  });

  it("학원 소속은 그룹 칸이 보인다", async () => {
    await goToStudentInfo("학원");

    expect(screen.getByLabelText("그룹(선택)")).toBeInTheDocument();
    expect(screen.getByLabelText("반")).toBeInTheDocument();
  });

  it("기타 소속은 학년만 받고 그룹, 반, 번호를 숨긴다", () => {
    renderSignup();
    agreeRequiredTerms();
    click("다음");
    click("기타 소속으로 가입");

    expect(screen.getByLabelText("학년")).toBeInTheDocument();
    expect(screen.queryByLabelText("그룹(선택)")).toBeNull();
    expect(screen.queryByLabelText("반")).toBeNull();
    expect(screen.queryByLabelText("번호(선택)")).toBeNull();
  });

  it("학교의 반 칸은 숫자만 받는다", async () => {
    await goToStudentInfo("학교");

    type("반", "3반");

    expect(screen.getByLabelText("반")).toHaveValue("3");
  });

  it("14세 미만이면 성별 칸을 숨긴다", async () => {
    await goToStudentInfo("학교");

    type("생년월일", "20180304");

    expect(screen.queryByLabelText("성별")).toBeNull();
  });
});

