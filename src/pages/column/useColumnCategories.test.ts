import { renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const fetchColumnCategories = vi.fn();

vi.mock("./columnData", () => ({
  fetchColumnCategories: () => fetchColumnCategories(),
}));

import { useColumnCategories } from "./useColumnCategories";

it("불러오는 동안은 빈 배열, 이후 조회한 label 배열을 돌려준다", async () => {
  fetchColumnCategories.mockResolvedValue(["A", "B"]);
  const { result } = renderHook(() => useColumnCategories());
  expect(result.current).toEqual([]);
  await waitFor(() => expect(result.current).toEqual(["A", "B"]));
});
