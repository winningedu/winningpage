// 사이드바와 드로어가 함께 쓰는 메뉴. 역할별 항목, 교사 카드, 현재 위치 강조, 승인 대기 배지를 검증한다.

import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ConsoleMe } from "./api";
import ConsoleNav from "./ConsoleNav";
import { adminMe, homeroomMe, proxyMe } from "./testUtils";

function renderNav(
  me: ConsoleMe,
  props: {
    pendingCount?: number;
    activePath?: string;
    onNavigate?: () => void;
  } = {},
) {
  return render(
    <MemoryRouter>
      <ConsoleNav
        me={me}
        pendingCount={props.pendingCount ?? 0}
        activePath={props.activePath ?? "/teacher"}
        {...(props.onNavigate ? { onNavigate: props.onNavigate } : {})}
      />
    </MemoryRouter>,
  );
}

const linkLabels = () =>
  screen.getAllByRole("link").map((a) => a.textContent?.replace(/\d+\+?$/, ""));

describe("ConsoleNav 담임교사", () => {
  it("담임 메뉴 항목만 순서대로 보여 준다", () => {
    renderNav(homeroomMe);

    expect(linkLabels()).toEqual([
      "대시보드",
      "학생 관리",
      "서비스별 현황표",
      "개인종합코칭",
      "입시 상담코칭",
      "학생조회-변경-이력",
      "마이페이지",
    ]);
    expect(screen.getByText("마이페이지(내 정보 및 설정)")).toBeTruthy();
    expect(screen.queryByText("교육기관관리")).toBeNull();
  });

  it("교사 카드에 기관, 이름, 역할, 주 담당 학급, 아이디를 보여 준다", () => {
    renderNav(homeroomMe);

    expect(screen.getByText("한빛고등학교")).toBeTruthy();
    expect(screen.getByText("박지훈 선생님")).toBeTruthy();
    expect(screen.getByText("담임교사")).toBeTruthy();
    expect(screen.getByText("2학년 3반 담임")).toBeTruthy();
    expect(screen.getByText("아이디 SM26HB83K7MPQ2")).toBeTruthy();
  });
});

describe("ConsoleNav 학교 전체 관리자와 본사 대행", () => {
  it("관리자 메뉴 항목을 순서대로 보여 준다", () => {
    renderNav(adminMe);

    expect(linkLabels()).toEqual([
      "대시보드",
      "학생 관리",
      "이용현황",
      "서비스별 현황표",
      "개인종합코칭",
      "입시 상담코칭",
      "학생불러오기-일괄설정",
      "미배정 목록",
      "학생조회-변경-이력",
      "교사 정보 입력관리",
      "교사 엑셀 일괄업로드",
      "교사 계정 관리",
      "내정보관리",
      "마이페이지",
    ]);
    expect(screen.getByText("교육기관관리")).toBeTruthy();
    expect(screen.getByText("최민정 선생님")).toBeTruthy();
    expect(screen.getByText("학교 전체 관리자")).toBeTruthy();
    expect(screen.getByText("전교 통합 관리 권한")).toBeTruthy();
    expect(screen.getByText("아이디 SM26HB83R4TXW9")).toBeTruthy();
  });

  it("본사 대행은 관리자 메뉴에 '본사 직원' 카드를 쓰고 아이디 줄이 없다", () => {
    renderNav(proxyMe);

    expect(screen.getByText("내정보관리")).toBeTruthy();
    expect(screen.getByText("본사 직원")).toBeTruthy();
    expect(screen.getByText("본사 대행")).toBeTruthy();
    expect(screen.queryByText(/아이디/)).toBeNull();
  });
});

describe("ConsoleNav 현재 위치와 배지", () => {
  it("가장 긴 접두사 항목만 현재 위치로 표시한다", () => {
    renderNav(adminMe, { activePath: "/teacher/teachers/excel" });

    const current = screen
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["교사 엑셀 일괄업로드"]);
  });

  it("/teacher 는 정확히 일치할 때만 대시보드를 강조한다", () => {
    renderNav(homeroomMe, { activePath: "/teacher/my" });

    expect(
      screen
        .getByRole("link", { name: "대시보드" })
        .getAttribute("aria-current"),
    ).toBeNull();
    expect(
      screen
        .getByRole("link", { name: "마이페이지" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("승인 대기 배지는 0이면 숨기고 100 이상이면 99+ 로 보여 준다", () => {
    const { unmount } = renderNav(homeroomMe, { pendingCount: 0 });
    const history = () =>
      screen.getByRole("link", { name: /학생조회-변경-이력/ });
    expect(within(history()).queryByText(/\d/)).toBeNull();
    unmount();

    renderNav(homeroomMe, { pendingCount: 7 });
    expect(within(history()).getByText("7")).toBeTruthy();
  });

  it("100 이상이면 99+", () => {
    renderNav(homeroomMe, { pendingCount: 100 });

    expect(screen.getByText("99+")).toBeTruthy();
  });

  it("항목을 누르면 onNavigate 를 부른다(드로어 닫기)", () => {
    const onNavigate = vi.fn();
    renderNav(homeroomMe, { onNavigate });

    fireEvent.click(screen.getByRole("link", { name: "학생 관리" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});
