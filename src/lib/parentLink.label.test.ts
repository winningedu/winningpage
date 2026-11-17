// 학부모 연결 안내 문구가 학생 화면과 같은 코드 이름을 쓰는지 본다.
// 학생 등록 사이트(스쿨멘토)는 학생 고유코드, 그 외(위닝에듀)는 연결코드다.

import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  site: { features: { studentEnrollment: false } },
  rpc: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock("../config/site", () => ({ site: mocks.site }));
vi.mock("./supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("./apiFetch", () => ({
  apiFetch: mocks.apiFetch,
  getAuthHeader: async () => ({ Authorization: "Bearer t" }),
}));

import { linkCodeLabel, lookupChild, requestParentLink } from "./parentLink";

function serverSays(reason: string) {
  mocks.apiFetch.mockResolvedValue({
    ok: false,
    json: async () => ({ ok: false, reason }),
  });
}

describe("parentLink 코드 명칭", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.apiFetch.mockReset();
  });

  test("학생 등록 사이트는 학생 고유코드로 안내한다", async () => {
    mocks.site.features.studentEnrollment = true;
    expect(linkCodeLabel()).toBe("학생 고유코드");

    serverSays("invalid_code_format");
    expect(await lookupChild("ABCDEF")).toMatchObject({
      message: "학생 고유코드 6자리를 정확히 입력해 주세요.",
    });
    serverSays("link_code_not_found");
    expect(await lookupChild("ABCDEF")).toMatchObject({
      message: "일치하는 학생 고유코드를 찾을 수 없습니다",
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "cannot_link_self" },
    });
    expect(await requestParentLink("ABCDEF")).toMatchObject({
      message: "본인의 학생 고유코드는 사용할 수 없습니다.",
    });
  });

  test("그 외 사이트는 연결코드로 안내한다", async () => {
    mocks.site.features.studentEnrollment = false;
    expect(linkCodeLabel()).toBe("연결코드");

    serverSays("invalid_code_format");
    expect(await lookupChild("ABCDEF")).toMatchObject({
      message: "연결코드 6자리를 정확히 입력해 주세요.",
    });
    serverSays("link_code_not_found");
    expect(await lookupChild("ABCDEF")).toMatchObject({
      message: "일치하는 연결코드를 찾을 수 없습니다",
    });
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "cannot_link_self" },
    });
    expect(await requestParentLink("ABCDEF")).toMatchObject({
      message: "본인의 연결코드는 사용할 수 없습니다.",
    });
  });
});
