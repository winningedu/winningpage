// @vitest-environment jsdom
// 복사 버튼의 결과 안내. 복사한 값(코드, 비밀번호)은 토스트와 로그 어디에도 남지 않는다.

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { toast } from "@/components/ui/toast";
import { copyToClipboard } from "./copyToClipboard";

const SECRET = "ABCD2345XY7Z9K";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("복사에 성공하면 low 우선순위 토스트로 알린다", async () => {
  writeText.mockResolvedValue(undefined);
  const addSpy = vi.spyOn(toast, "add").mockReturnValue("toast-id");

  await copyToClipboard(SECRET);

  expect(writeText).toHaveBeenCalledWith(SECRET);
  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ title: "복사했습니다", priority: "low" }),
  );
  expect(JSON.stringify(addSpy.mock.calls)).not.toContain(SECRET);
});

test("복사에 실패하면 high 우선순위 실패 토스트를 보이고 값 없이 로그만 남긴다", async () => {
  writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
  const addSpy = vi.spyOn(toast, "add").mockReturnValue("toast-id");
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  await copyToClipboard(SECRET);

  expect(addSpy).toHaveBeenCalledWith(
    expect.objectContaining({ title: "복사하지 못했습니다", priority: "high" }),
  );
  expect(errorSpy).toHaveBeenCalled();
  expect(JSON.stringify(addSpy.mock.calls)).not.toContain(SECRET);
  expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(SECRET);
});
