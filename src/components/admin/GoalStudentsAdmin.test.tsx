// QA — GoalStudentDetail은 목록→상세 전환 시 항상 새로 마운트되지만(부모의
// if(detailId) 분기), 그 사실에 기대 상태 초기화를 맡기지 않는다. profileId prop이
// 바뀌면(재사용되는 경우를 포함해) 컴포넌트 스스로 재발송 결과를 초기화해야 한다 —
// 그러지 않으면 이전 학생의 성공/실패 요약이 다음 학생 화면에 그대로 남는다.
import "@testing-library/jest-dom/vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster, toast } from "@/components/ui/toast";
import { ConfirmAdminHost } from "@/pages/admin/shared/confirmAdmin";
import { GoalStudentDetail } from "./GoalStudentsAdmin";

const { studentRowHolder, studentErrorHolder } = vi.hoisted(() => ({
  studentRowHolder: { current: null as Record<string, unknown> | null },
  studentErrorHolder: {
    current: null as { message: string; code?: string } | null,
  },
}));

/** 어떤 메서드 체인을 걸어도 자기 자신을 돌려주다가 await되면 result로 resolve되는
 * 프록시. supabase.from(table).select(...).eq(...).maybeSingle() 같은 체인을
 * 테이블별로 하나의 고정 결과로 흉내 낸다. */
function makeChainable(result: unknown) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve(result);
      }
      return () => proxy;
    },
  };
  const proxy: unknown = new Proxy({}, handler);
  return proxy;
}

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === "goal_students") {
        return makeChainable({
          data: studentRowHolder.current,
          error: studentErrorHolder.current,
        });
      }
      if (table === "goal_daily_records") {
        return makeChainable({ data: [], error: null, count: 0 });
      }
      // goal_student_state / profiles / goal_probability_logs / goal_university_cuts
      return makeChainable({ data: null, error: null });
    }),
  },
}));

vi.mock("@/pages/admin/shared/adminSession", () => ({
  getFreshSupabaseAccessTokenOrSignOut: vi.fn().mockResolvedValue("test-token"),
}));

const noop = () => {};

afterEach(() => {
  toast.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  studentErrorHolder.current = null;
});

describe("GoalStudentDetail — 학생 전환 시 재발송 상태 초기화", () => {
  it("학생 A의 재발송 결과가 학생 B 화면으로 넘어가지 않는다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          sent: 1,
          failed: 0,
          skipped: 0,
          recipients: [],
        }),
      }),
    );

    studentRowHolder.current = { profile_id: "student-a" };
    const { rerender } = render(
      <GoalStudentDetail profileId="student-a" onBack={noop} />,
    );

    await screen.findByText("student-a");

    fireEvent.click(screen.getByRole("button", { name: "다시 보내기" }));

    // recipients: []이면 "연결된 학부모가 없어 보낼 대상이 없습니다."가 뜬다
    // (resendResult가 채워졌다는 신호로 쓴다 — 요약 문장은 여러 텍스트 노드로
    // 쪼개져 있어 이 고정 문구가 더 안정적이다).
    await screen.findByText("연결된 학부모가 없어 보낼 대상이 없습니다.");

    studentRowHolder.current = { profile_id: "student-b" };
    rerender(<GoalStudentDetail profileId="student-b" onBack={noop} />);

    await screen.findByText("student-b");

    expect(
      screen.queryByText("연결된 학부모가 없어 보낼 대상이 없습니다."),
    ).not.toBeInTheDocument();
  });
});

describe("GoalStudentDetail 오류 안내", () => {
  it("학생 상세 조회에 실패하면 원문 없이 안내만 토스트로 보인다", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    studentErrorHolder.current = {
      message: "permission denied for 홍길동",
      code: "42501",
    };
    render(
      <>
        <GoalStudentDetail profileId="student-a" onBack={noop} />
        <Toaster />
      </>,
    );

    await waitFor(() => {
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("학생 상세 조회 실패");
      expect(
        document.querySelector('[data-slot="toast-description"]'),
      ).toHaveTextContent("코드: 42501");
    });
    expect(document.body.textContent).not.toContain("홍길동");
    expect(alertSpy).not.toHaveBeenCalled();
  });
});

describe("GoalStudentDetail 온보딩 리셋 확인", () => {
  function renderDetail() {
    studentRowHolder.current = { profile_id: "student-a" };
    render(
      <>
        <GoalStudentDetail profileId="student-a" onBack={noop} />
        <Toaster />
        <ConfirmAdminHost />
      </>,
    );
  }

  it("확인창에서 취소하면 리셋 요청을 보내지 않는다", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("온보딩 이전 상태로 되돌립니다.");
    fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("확인하면 리셋을 요청하고 성공 토스트를 보인 뒤 새로고침한다", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});
    renderDetail();

    fireEvent.click(await screen.findByRole("button", { name: "온보딩 리셋" }));
    fireEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", {
        name: "리셋",
      }),
    );

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="toast-title"]'),
      ).toHaveTextContent("온보딩 리셋이 완료되었습니다."),
    );
    // 토스트가 읽히도록 새로고침은 잠시 뒤에 한다.
    expect(reload).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2500);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
