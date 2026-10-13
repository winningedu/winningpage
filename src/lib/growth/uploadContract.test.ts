// collectUploadUrl 이 만든 요청 본문이 서버 validateCollectBody 계약과 맞는지 확인한다.
// 클라이언트와 서버가 각자 테스트만 통과하고 와이어 모양이 어긋났던 사고를 막는다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const { apiFetchMock, getAuthHeaderMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getAuthHeaderMock: vi.fn(),
}));

vi.mock("../apiFetch", async () => {
  const actual =
    await vi.importActual<typeof import("../apiFetch")>("../apiFetch");
  return {
    ...actual,
    apiFetch: apiFetchMock,
    getAuthHeader: getAuthHeaderMock,
  };
});

import { validateCollectBody } from "../../../api/_lib/growth/intake/collectBody";
import { collectUploadUrl } from "./api";

const upload = {
  fileName: "a.pdf",
  mimeType: "application/pdf",
  byteSize: 10,
  gradeLabel: "고1" as const,
  semester: 1 as const,
  consent: true as const,
};

beforeEach(() => {
  apiFetchMock.mockReset();
  getAuthHeaderMock.mockResolvedValue({ Authorization: "Bearer tok" });
  apiFetchMock.mockResolvedValue(
    new Response(JSON.stringify({}), { status: 200 }),
  );
});

describe("업로드 URL 요청 본문 계약", () => {
  test("collectUploadUrl 본문을 서버 validateCollectBody 가 받아들인다", async () => {
    await collectUploadUrl(upload);
    const init = apiFetchMock.mock.calls[0]?.[1] as RequestInit;
    const result = validateCollectBody(JSON.parse(String(init.body)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body.action).toBe("upload-url");
  });

  test("upload 로 감싼 본문은 서버가 거부한다", () => {
    const result = validateCollectBody({ action: "upload-url", upload });
    expect(result.ok).toBe(false);
  });
});
