// 미리보기 모달의 기본 라벨은 사이트별 설정(columnTitle)의 게시판 이름이다.
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ title: "교육칼럼" }));

vi.mock("@/config/site", () => ({
  site: {
    get columnTitle() {
      return state.title;
    },
  },
}));
vi.mock("./BlockEditor", () => ({ isEmptyDocument: () => true }));
vi.mock("@/components/column/ColumnBody", () => ({
  default: () => <div />,
  getContentBlocks: () => [],
}));

import ColumnPreviewModal from "./ColumnPreviewModal";

describe("ColumnPreviewModal 기본 라벨", () => {
  it.each([["교육칼럼"], ["칼럼-교육청소식"]])(
    "%s: label이 없으면 게시판 이름을 쓴다",
    (title) => {
      state.title = title;
      render(
        <ColumnPreviewModal open onClose={() => {}} post={{ title: "제목" }} />,
      );
      expect(screen.getByText(title)).toBeInTheDocument();
    },
  );
});
