import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import BlockedMemberNotice from "./BlockedMemberNotice";

function renderNotice(memberType: string | null) {
  render(
    <MemoryRouter>
      <BlockedMemberNotice memberType={memberType} />
    </MemoryRouter>,
  );
}

describe("BlockedMemberNotice", () => {
  it("멘토는 결제 대상이 아니라는 안내를 본다", () => {
    renderNotice("mentor");

    expect(
      screen.getByText("멘토 회원은 결제를 이용할 수 없어요"),
    ).toBeInTheDocument();
  });

  it.each(["teacher", "교사"])(
    "선생님(%s)은 가입을 마치라는 안내가 아니라 결제 대상이 아니라는 안내를 본다",
    (memberType) => {
      renderNotice(memberType);

      expect(
        screen.getByText("선생님 회원은 결제를 이용할 수 없어요"),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("회원 정보를 먼저 완성해 주세요"),
      ).not.toBeInTheDocument();
    },
  );

  it("유형이 비어 있으면 가입을 마치라는 안내를 본다", () => {
    renderNotice("");

    expect(
      screen.getByText("회원 정보를 먼저 완성해 주세요"),
    ).toBeInTheDocument();
  });
});
