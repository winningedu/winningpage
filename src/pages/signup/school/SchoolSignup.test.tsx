import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignupProvider } from "@/context/SignupContext";
import { supabase } from "@/lib/supabase";
import { runIdentityVerification } from "../identityVerification";
import SchoolSignup from "./SchoolSignup";

vi.mock("../identityVerification", () => ({
  runIdentityVerification: vi.fn(),
  fetchIdentityMobile: vi.fn(async () => ""),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(),
    auth: { setSession: vi.fn(async () => ({ error: null })) },
  },
}));

function LocationProbe() {
  return <p data-testid="path">{useLocation().pathname}</p>;
}

function renderSignup() {
  return render(
    <MemoryRouter initialEntries={["/signup/student"]}>
      <SignupProvider>
        <Routes>
          <Route path="/signup/student" element={<SchoolSignup />} />
          <Route path="*" element={<LocationProbe />} />
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

const SEND_OK = { body: { ok: true, expires_in: 180, cooldown: 60 } };
const VERIFY_OK = { body: { ok: true } };
const SIGNUP_OK = {
  body: {
    session: { access_token: "access", refresh_token: "refresh" },
    username: "mentor01",
    linkCode: "LINK12",
    tenantName: "새빛중학교",
  },
};

// 소속을 확인한 뒤 3단계까지 간다. orgType으로 학교와 학원을 가른다.
async function goToStudentInfo(orgType = "학교") {
  mockApi({
    "/api/signup/tenant-lookup": { body: { ...TENANT, orgType } },
    "/api/send-phone-code": SEND_OK,
    "/api/verify-phone-code": VERIFY_OK,
    "/api/signup/school-student": SIGNUP_OK,
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

describe("3단계 아이디 중복 확인", () => {
  it("사용할 수 있으면 안내하고, 아이디를 고치면 결과가 사라진다", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: true,
      error: null,
    } as never);
    await goToStudentInfo();

    type("아이디", "mentor01");
    click("중복 확인");

    expect(
      await screen.findByText("사용할 수 있는 아이디입니다."),
    ).toBeInTheDocument();
    expect(supabase.rpc).toHaveBeenCalledWith("is_username_available", {
      check_username: "mentor01",
    });

    type("아이디", "mentor02");

    expect(screen.queryByText("사용할 수 있는 아이디입니다.")).toBeNull();
  });

  it("이미 쓰는 아이디면 알려 준다", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: false,
      error: null,
    } as never);
    await goToStudentInfo();

    type("아이디", "mentor01");
    click("중복 확인");

    expect(
      await screen.findByText("이미 사용 중인 아이디입니다."),
    ).toBeInTheDocument();
  });

  it("형식이 틀린 아이디는 서버에 묻지 않는다", async () => {
    vi.mocked(supabase.rpc).mockClear();
    await goToStudentInfo();

    type("아이디", "Ab");
    click("중복 확인");

    expect(
      screen.getByText(
        "아이디는 영문 소문자와 숫자 4자에서 20자로 입력해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("3단계 휴대폰 인증", () => {
  it("인증번호는 소속을 실어 보내고, 6자리를 넣으면 바로 검증한다", async () => {
    await goToStudentInfo();
    calls.length = 0;
    mockApi({
      "/api/send-phone-code": {
        body: { ok: true, expires_in: 180, cooldown: 60 },
      },
      "/api/verify-phone-code": { body: { ok: true } },
    });

    type("휴대폰번호", "01012345678");
    click("인증번호 보내기");
    await waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]?.body).toEqual({
      phone: "01012345678",
      purpose: "signup",
      tenant_id: "t-1",
    });

    type("휴대폰 인증번호", "123456");

    expect(
      await screen.findByText("전화번호 인증이 완료되었습니다."),
    ).toBeInTheDocument();
    expect(calls[1]?.body).toEqual({
      phone: "01012345678",
      code: "123456",
      purpose: "signup",
    });
  });

  it("이미 가입한 번호면 아이디 찾기로 안내한다", async () => {
    await goToStudentInfo();
    mockApi({
      "/api/send-phone-code": {
        status: 409,
        body: { ok: false, reason: "phone_taken" },
      },
    });

    type("휴대폰번호", "01012345678");
    click("인증번호 보내기");

    expect(
      await screen.findByText(
        "이미 가입한 번호예요. 아이디 찾기에서 확인해 주세요.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "아이디 찾기" })).toHaveAttribute(
      "href",
      "/login/find-id",
    );
    expect(screen.getByLabelText("휴대폰 인증번호")).toBeDisabled();
  });

  it("기타 소속은 catch_all로 보낸다", async () => {
    mockApi({
      "/api/send-phone-code": {
        body: { ok: true, expires_in: 180, cooldown: 60 },
      },
    });
    renderSignup();
    agreeRequiredTerms();
    click("다음");
    click("기타 소속으로 가입");

    type("휴대폰번호", "01012345678");
    click("인증번호 보내기");
    await waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0]?.body).toEqual({
      phone: "01012345678",
      purpose: "signup",
      catch_all: true,
    });
  });

  it("소속코드를 바꾸면 인증을 다시 받아야 한다", async () => {
    await goToStudentInfo();
    mockApi({
      "/api/send-phone-code": {
        body: { ok: true, expires_in: 180, cooldown: 60 },
      },
      "/api/verify-phone-code": { body: { ok: true } },
      "/api/signup/tenant-lookup": { body: { ...TENANT, tenantId: "t-2" } },
    });
    type("휴대폰번호", "01012345678");
    click("인증번호 보내기");
    await waitFor(() =>
      expect(screen.getByLabelText("휴대폰 인증번호")).toBeEnabled(),
    );
    type("휴대폰 인증번호", "123456");
    await screen.findByText("전화번호 인증이 완료되었습니다.");

    click("이전");
    type("소속코드", "ABCDEFGJ");
    click("확인");
    await screen.findByText("새빛중학교");
    click("다음");

    expect(screen.queryByText("전화번호 인증이 완료되었습니다.")).toBeNull();
    expect(screen.getByLabelText("휴대폰 인증번호")).toBeDisabled();
  });
});

// 3단계의 모든 필수 칸을 올바르게 채운다(14세 이상, 학교 소속).
async function fillValidStudent() {
  vi.mocked(supabase.rpc).mockResolvedValue({
    data: true,
    error: null,
  } as never);
  type("이름", "김학생");
  type("아이디", "mentor01");
  click("중복 확인");
  await screen.findByText("사용할 수 있는 아이디입니다.");
  type("비밀번호", "abc123!");
  type("비밀번호 확인", "abc123!");
  type("휴대폰번호", "01012345678");
  click("인증번호 보내기");
  await waitFor(() =>
    expect(screen.getByLabelText("휴대폰 인증번호")).toBeEnabled(),
  );
  type("휴대폰 인증번호", "123456");
  await screen.findByText("전화번호 인증이 완료되었습니다.");
  type("이메일", "a@b.co");
  type("생년월일", "20100304");
  type("성별", "남");
  type("학년", "중2");
  type("반", "3");
}

describe("3단계 다음 버튼", () => {
  it("필수 칸을 모두 올바르게 채워야 켜진다", async () => {
    await goToStudentInfo();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();

    await fillValidStudent();

    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
  });

  it("비밀번호 확인이 다르면 알려 주고 막는다", async () => {
    await goToStudentInfo();
    await fillValidStudent();

    type("비밀번호 확인", "abc123?");

    expect(screen.getByText("비밀번호가 서로 달라요.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("아이디를 확인한 뒤 고치면 다시 확인할 때까지 막는다", async () => {
    await goToStudentInfo();
    await fillValidStudent();

    type("아이디", "mentor02");

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });

  it("번호는 1에서 99 사이가 아니면 막는다", async () => {
    await goToStudentInfo();
    await fillValidStudent();

    type("번호(선택)", "0");

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
  });
});

describe("3단계 만 14세 미만", () => {
  async function fillUnder14Student() {
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: true,
      error: null,
    } as never);
    type("이름", "김학생");
    type("아이디", "mentor01");
    click("중복 확인");
    await screen.findByText("사용할 수 있는 아이디입니다.");
    type("비밀번호", "abc123!");
    type("비밀번호 확인", "abc123!");
    type("이메일", "a@b.co");
    type("생년월일", "20180304");
    type("학년", "중1");
    type("반", "3");
  }

  it("PASS 본인인증을 마치면 본인 휴대폰 없이도 다음으로 갈 수 있다", async () => {
    vi.stubEnv("VITE_UNDER14_SIGNUP_ENABLED", "true");
    vi.mocked(runIdentityVerification).mockResolvedValue({
      ok: true,
      requestId: "req-1",
      isUnder14: true,
      age: 8,
      mobile: "01099998888",
    });
    await goToStudentInfo();
    await fillUnder14Student();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();

    click("PASS 간편 인증");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "다음" })).toBeEnabled(),
    );
    expect(runIdentityVerification).toHaveBeenCalledWith({
      purpose: "under14_guardian",
    });
    vi.unstubAllEnvs();
  });

  it("14세 미만 가입이 닫힌 배포에서는 안내하고 막는다", async () => {
    vi.stubEnv("VITE_UNDER14_SIGNUP_ENABLED", "false");
    await goToStudentInfo();
    await fillUnder14Student();

    expect(
      screen.getByText("만 14세 이상만 가입할 수 있습니다."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PASS 간편 인증" })).toBeNull();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();
    vi.unstubAllEnvs();
  });
});

async function goToGuardian() {
  await goToStudentInfo();
  await fillValidStudent();
  click("다음");
}

describe("4단계 학부모 정보", () => {
  it("비워 두고 건너뛸 수 있고, 번호를 적었다면 인증해야 다음으로 간다", async () => {
    await goToGuardian();

    expect(
      screen.getByRole("button", { name: "건너뛰기" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();

    type("학부모 휴대폰번호", "01055556666");

    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();

    click("인증번호 보내기");
    await waitFor(() =>
      expect(screen.getByLabelText("학부모 인증번호")).toBeEnabled(),
    );
    type("학부모 인증번호", "123456");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "다음" })).toBeEnabled(),
    );
    expect(calls.at(-2)?.body).toEqual({
      phone: "01055556666",
      purpose: "guardian_signup",
    });
  });

  it("14세 미만은 건너뛸 수 없고, PASS 번호가 잠겨 있고, 수집 동의가 필요하다", async () => {
    vi.stubEnv("VITE_UNDER14_SIGNUP_ENABLED", "true");
    vi.mocked(runIdentityVerification).mockResolvedValue({
      ok: true,
      requestId: "req-1",
      isUnder14: true,
      age: 8,
      mobile: "01099998888",
    });
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: true,
      error: null,
    } as never);
    await goToStudentInfo();
    type("이름", "김학생");
    type("아이디", "mentor01");
    click("중복 확인");
    await screen.findByText("사용할 수 있는 아이디입니다.");
    type("비밀번호", "abc123!");
    type("비밀번호 확인", "abc123!");
    type("이메일", "a@b.co");
    type("생년월일", "20180304");
    type("학년", "중1");
    type("반", "3");
    click("PASS 간편 인증");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "다음" })).toBeEnabled(),
    );
    click("다음");

    expect(screen.queryByRole("button", { name: "건너뛰기" })).toBeNull();
    expect(screen.getByLabelText("학부모 휴대폰번호")).toHaveValue(
      "010-9999-8888",
    );
    expect(screen.getByLabelText("학부모 휴대폰번호")).toBeDisabled();
    expect(screen.getByRole("button", { name: "다음" })).toBeDisabled();

    check(/법정대리인 정보를 학부모 정보로 수집합니다/);

    expect(screen.getByRole("button", { name: "다음" })).toBeEnabled();
    vi.unstubAllEnvs();
  });

  it("이전으로 돌아가도 입력한 값이 남는다", async () => {
    await goToGuardian();
    type("학부모 이름", "김부모");

    click("이전");

    expect(screen.getByLabelText("이름")).toHaveValue("김학생");
    expect(screen.getByLabelText("아이디")).toHaveValue("mentor01");

    click("다음");

    expect(screen.getByLabelText("학부모 이름")).toHaveValue("김부모");
  });
});

function lastCall(url: string) {
  return calls.filter((call) => call.url === url).at(-1);
}

describe("가입 제출과 5단계 완료", () => {
  it("학부모 정보를 건너뛰면 학생 정보만 보내고 세션을 넣고 완료 화면을 보인다", async () => {
    await goToGuardian();
    type("학부모 이름", "김부모");

    click("건너뛰기");

    expect(
      await screen.findByRole("button", { name: "학습진단 시작하기" }),
    ).toBeInTheDocument();
    expect(lastCall("/api/signup/school-student")?.body).toEqual({
      username: "mentor01",
      password: "abc123!",
      name: "김학생",
      email: "a@b.co",
      phone: "01012345678",
      birthDate: "2010-03-04",
      gender: "남",
      tenantId: "t-1",
      grade: "중2",
      className: "3",
      guardianConsent: false,
      agreeService: true,
      agreePrivacy: true,
      agreeDbTransfer: true,
      agreeMarketing: false,
    });
    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "access",
      refresh_token: "refresh",
    });
    expect(
      screen.getByRole("button", { name: "서비스 둘러보기" }),
    ).toBeInTheDocument();
  });
});
