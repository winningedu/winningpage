import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/http/client", () => ({ api: http }));

import {
  completeRefund,
  createSectionRow,
  deleteSectionRow,
  fetchExportChunk,
  fetchSectionList,
  fetchSectionRow,
  issueUpload,
  markSectionReviewed,
  previewUpload,
  removeUploads,
  requestEmbedding,
  sectionKeys,
  updateSectionMeta,
  updateSectionRow,
} from "./api";

const reply = (body: unknown) => ({ json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sectionKeys", () => {
  it("전량 섹션은 섹션 키만, 서버 페이지 섹션은 page 와 q 를 키에 싣는다", () => {
    expect(sectionKeys.list("notices")).toEqual([
      "admin",
      "sections",
      "notices",
    ]);
    expect(
      sectionKeys.list("admissionResults", { page: 2, q: "서울" }),
    ).toEqual([
      "admin",
      "sections",
      "admissionResults",
      { page: 2, q: "서울" },
    ]);
    expect(sectionKeys.section("notices")).toEqual([
      "admin",
      "sections",
      "notices",
    ]);
  });
});

describe("fetchSectionList", () => {
  it("페이지 없는 섹션은 쿼리 없이 부르고 signal 을 넘긴다", async () => {
    http.get.mockReturnValue(reply({ items: [{ id: 1 }], total: 1 }));
    const signal = new AbortController().signal;

    const result = await fetchSectionList("notices", undefined, signal);

    expect(http.get).toHaveBeenCalledWith("admin/sections/notices", {
      searchParams: {},
      signal,
    });
    expect(result).toEqual({ items: [{ id: 1 }], total: 1 });
  });

  it("서버 페이지 섹션은 page 와 q 를 보낸다", async () => {
    http.get.mockReturnValue(reply({ items: [], total: 0 }));

    await fetchSectionList("admissionResults", { page: 3, q: "서울" });

    expect(http.get).toHaveBeenCalledWith("admin/sections/admissionResults", {
      searchParams: { page: 3, q: "서울" },
    });
  });
});

describe("쓰기 요청", () => {
  it("등록은 POST 로 values 만 보낸다", async () => {
    http.post.mockReturnValue(reply({ id: "n1" }));

    const row = await createSectionRow("notices", { title: "a" });

    expect(http.post).toHaveBeenCalledWith("admin/sections/notices", {
      json: { values: { title: "a" } },
    });
    expect(row).toEqual({ id: "n1" });
  });

  it("수정은 PATCH, 메타 수정은 /meta 로 보낸다", async () => {
    http.patch.mockReturnValue(reply({ id: "n1" }));

    await updateSectionRow("notices", "n1", { title: "b" });
    await updateSectionMeta("admissionGuidelines", "g1", { title: "c" });

    expect(http.patch).toHaveBeenNthCalledWith(1, "admin/sections/notices/n1", {
      json: { values: { title: "b" } },
    });
    expect(http.patch).toHaveBeenNthCalledWith(
      2,
      "admin/sections/admissionGuidelines/g1/meta",
      { json: { values: { title: "c" } } },
    );
  });

  it("삭제는 DELETE, 검토 완료는 /reviewed POST 다", async () => {
    http.delete.mockResolvedValue(undefined);
    http.post.mockReturnValue(reply({ id: "k1" }));

    await deleteSectionRow("notices", "n1");
    await markSectionReviewed("knowledge", "k1");

    expect(http.delete).toHaveBeenCalledWith("admin/sections/notices/n1");
    expect(http.post).toHaveBeenCalledWith(
      "admin/sections/knowledge/k1/reviewed",
    );
  });
});

describe("fetchExportChunk", () => {
  it("from 과 q 를 보내고 items 와 next 를 돌려준다", async () => {
    http.get.mockReturnValue(reply({ items: [{ id: 1 }], next: 1000 }));

    const chunk = await fetchExportChunk("admissionResults", 0, "서울");

    expect(http.get).toHaveBeenCalledWith(
      "admin/sections/admissionResults/export",
      {
        searchParams: { from: 0, q: "서울" },
      },
    );
    expect(chunk).toEqual({ items: [{ id: 1 }], next: 1000 });
  });
});

describe("업로드 호출", () => {
  it("issueUpload 는 section, field, 파일 정보를 POST admin/uploads 로 보낸다", async () => {
    http.post.mockReturnValue(reply({ path: "p", uploadUrl: "u" }));

    const issued = await issueUpload("notices", {
      field: "image",
      fileName: "a.png",
      contentType: "image/png",
      size: 10,
    });

    expect(http.post).toHaveBeenCalledWith("admin/uploads", {
      json: {
        section: "notices",
        field: "image",
        fileName: "a.png",
        contentType: "image/png",
        size: 10,
      },
    });
    expect(issued).toEqual({ path: "p", uploadUrl: "u" });
  });

  it("previewUpload 는 임시 파일의 읽기 주소를 돌려준다", async () => {
    http.post.mockReturnValue(reply({ url: "https://tmp/read" }));

    const url = await previewUpload("notices", "p");

    expect(http.post).toHaveBeenCalledWith("admin/uploads/preview", {
      json: { section: "notices", path: "p" },
    });
    expect(url).toBe("https://tmp/read");
  });

  it("removeUploads 는 DELETE admin/uploads 에 section 과 paths 를 싣는다", async () => {
    http.delete.mockResolvedValue(undefined);

    await removeUploads("notices", ["a.png", "b.png"]);

    expect(http.delete).toHaveBeenCalledWith("admin/uploads", {
      json: { section: "notices", paths: ["a.png", "b.png"] },
    });
  });
});

describe("completeRefund", () => {
  it("POST complete-refund 에 refundRequestId 를 보낸다", async () => {
    http.post.mockReturnValue(reply({ alreadyCompleted: true }));

    const result = await completeRefund(12);

    expect(http.post).toHaveBeenCalledWith("complete-refund", {
      json: { refundRequestId: 12 },
    });
    expect(result).toEqual({ alreadyCompleted: true });
  });
});

describe("requestEmbedding", () => {
  it("embed-one 을 60초 제한으로 POST 한다", async () => {
    http.post.mockReturnValue(reply({ action: "embed-one" }));

    await requestEmbedding("k1");

    expect(http.post).toHaveBeenCalledWith("performance/admin-embed", {
      json: { action: "embed-one", id: "k1" },
      timeout: 60_000,
    });
  });
});

describe("fetchSectionRow", () => {
  it("id 를 경로에 인코딩해 GET 하고 signal 을 넘긴다", async () => {
    http.get.mockReturnValue(reply({ id: "a/b", title: "x" }));
    const signal = new AbortController().signal;

    const row = await fetchSectionRow("popups", "a/b", signal);

    expect(http.get).toHaveBeenCalledWith("admin/sections/popups/a%2Fb", {
      signal,
    });
    expect(row).toEqual({ id: "a/b", title: "x" });
  });

  it("행 쿼리 키는 섹션 키 아래에 둔다(섹션 무효화가 함께 닿는다)", () => {
    expect(sectionKeys.row("popups", 7)).toEqual([
      "admin",
      "sections",
      "popups",
      "row",
      "7",
    ]);
  });
});
