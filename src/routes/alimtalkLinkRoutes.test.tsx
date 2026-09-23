import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseReportId } from "./alimtalkLinkRoutes";

// reportId 변수값 파서 회귀 테스트(QA 시트 행210) — 구 형식(기간키만)과 신 형식
// (기간키.학생profile id)을 둘 다 받아야 한다. 발신 파이프라인이 바뀌어도 이미
// 발송된 과거 알림톡(구 형식)의 링크는 계속 유효해야 하기 때문이다.
describe("parseReportId", () => {
  it("빈 값은 둘 다 undefined로 접는다", () => {
    expect(parseReportId(undefined)).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
    expect(parseReportId("")).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
  });

  it("구 형식(주간, '.' 없음)은 전체를 at으로 본다", () => {
    expect(parseReportId("2026-08-17")).toEqual({
      at: "2026-08-17",
      studentProfileId: undefined,
    });
  });

  it("구 형식(월간, '.' 없음)은 전체를 at으로 본다", () => {
    expect(parseReportId("2026-08")).toEqual({
      at: "2026-08",
      studentProfileId: undefined,
    });
  });

  it("신 형식(주간.학생id)은 첫 '.'로 나눈다", () => {
    expect(
      parseReportId("2026-08-17.3f2a9c1e-aaaa-bbbb-cccc-000000000000"),
    ).toEqual({
      at: "2026-08-17",
      studentProfileId: "3f2a9c1e-aaaa-bbbb-cccc-000000000000",
    });
  });

  it("신 형식(월간.학생id)은 첫 '.'로 나눈다", () => {
    expect(parseReportId("2026-08.3f2a9c1e-uuid")).toEqual({
      at: "2026-08",
      studentProfileId: "3f2a9c1e-uuid",
    });
  });

  it("'.'로 시작하면 at은 undefined, studentProfileId만 남는다", () => {
    expect(parseReportId(".3f2a9c1e-uuid")).toEqual({
      at: undefined,
      studentProfileId: "3f2a9c1e-uuid",
    });
  });

  it("'.'로 끝나면 studentProfileId는 undefined, at만 남는다", () => {
    expect(parseReportId("2026-08-17.")).toEqual({
      at: "2026-08-17",
      studentProfileId: undefined,
    });
  });

  it("'.' 하나뿐이면 둘 다 undefined", () => {
    expect(parseReportId(".")).toEqual({
      at: undefined,
      studentProfileId: undefined,
    });
  });

  it("신 형식(주간_학생id, '_' 구분자)도 첫 구분자로 나눈다", () => {
    expect(
      parseReportId("2026-08-17_3f2a9c1e-aaaa-bbbb-cccc-000000000000"),
    ).toEqual({
      at: "2026-08-17",
      studentProfileId: "3f2a9c1e-aaaa-bbbb-cccc-000000000000",
    });
  });

  it("신 형식(월간_학생id, '_' 구분자)도 첫 구분자로 나눈다", () => {
    expect(parseReportId("2026-08_3f2a9c1e-uuid")).toEqual({
      at: "2026-08",
      studentProfileId: "3f2a9c1e-uuid",
    });
  });

  it("쓰레기값(공백·특수문자)도 첫 '.' 기준으로 그대로 나눈다", () => {
    expect(parseReportId("garbage value")).toEqual({
      at: "garbage value",
      studentProfileId: undefined,
    });
    expect(parseReportId("a.b.c")).toEqual({
      at: "a",
      studentProfileId: "b.c",
    });
  });
});

// 자녀 2명 이상일 때 뜨는 선택 화면 렌더 테스트(QA 시트 행210). useMemberType과
// fn_parent_children RPC를 모두 스텁해 실제 세션/네트워크 없이 그린다
// (Header.test.tsx의 관례를 따른다).
vi.mock("@/hooks/useMemberType", () => ({
  useMemberType: () => ({
    loading: false,
    userId: "parent-1",
    memberType: "parent",
    error: null,
    refetch: () => {},
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: async (fn: string) => {
      if (fn === "fn_parent_children") {
        return {
          data: [
            {
              student_profile_id: "child-a",
              student_name: "김민준",
              link_status: "approved",
            },
            {
              student_profile_id: "child-b",
              student_name: "김서연",
              link_status: "approved",
            },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    },
  },
}));

describe("GoalReportRedirect 자녀 선택 화면", () => {
  it("자녀가 2명이면 이름 링크 2개를 그리고 period·at을 쿼리로 유지한다", async () => {
    const { default: alimtalkLinkRoutes } = await import(
      "./alimtalkLinkRoutes"
    );
    const { createMemoryRouter, RouterProvider } = await import("react-router");

    const router = createMemoryRouter(alimtalkLinkRoutes, {
      initialEntries: ["/services/goal/reports/weekly/2026-08-17"],
    });

    render(<RouterProvider router={router} />);

    // 링크 접근성 이름은 자녀 이름 + "리포트 보기 →" 전체다(두 span이 한
    // <a> 안에 있어서다) — 자녀 이름을 포함하는지로 느슨하게 매칭한다.
    const linkA = await screen.findByRole("link", { name: /김민준/ });
    const linkB = await screen.findByRole("link", { name: /김서연/ });

    expect(linkA).toHaveAttribute(
      "href",
      "/mypage/children/child-a/report?period=weekly&at=2026-08-17",
    );
    expect(linkB).toHaveAttribute(
      "href",
      "/mypage/children/child-b/report?period=weekly&at=2026-08-17",
    );
  });
});
