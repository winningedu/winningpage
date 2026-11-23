// PremiumBookAdmin [적용] 회귀 테스트.
//
// 배경: 새 PDF가 기존 행 수보다 페이지가 많으면(기존 16행, 새 PDF 18장) id가 있는 행과
// 없는 행이 한 upsert 배열에 섞인다. PostgREST가 벌크 payload를 공통 컬럼 집합으로 맞추면서
// id 없는 행이 id: null로 전송되어 "null value in column id ... violates not-null constraint"
// 로 문장 전체가 실패했다(이미지는 이미 업로드된 뒤). 기존 id 행은 upsert, 새 행은 insert로
// 나눠 보내 payload를 균질하게 한다.
//
// handleApply는 컴포넌트 안에 있으므로 실제 컴포넌트를 렌더해 PDF 선택, 변환, 적용을
// 구동한다. pdfjs-dist와 canvas는 jsdom에 없으므로 최소 대역으로 바꾼다.

import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  pageCount: 0,
  existing: [] as { id: number; sort_order: number }[],
  insertError: null as { message: string } | null,
  calls: [] as { op: string; arg?: unknown }[],
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      get numPages() {
        return hoisted.pageCount;
      },
      getPage: async () => ({
        getViewport: () => ({ width: 1024, height: 1400 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
}));

vi.mock("@/components/premiumBook/BookViewer", () => ({
  default: () => null,
}));

vi.mock("@/pages/admin/shared/AdminEngine", () => ({
  AdminForm: () => null,
  AdminTable: () => null,
  collectBannerPaths: () => [],
  removeBannerPaths: async () => {},
  uploadImage: async () => {},
}));

vi.mock("@/pages/admin/shared/adminErrors", () => ({
  reportAdminError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => {
  const ok = { error: null };
  const table = () => ({
    select: (cols: string) => {
      hoisted.calls.push({ op: "select", arg: cols });
      const result = {
        data: cols === "*" ? [] : hoisted.existing,
        error: null,
      };
      return Object.assign(Promise.resolve(result), {
        order: () => Promise.resolve(result),
      });
    },
    upsert: async (rows: unknown) => {
      hoisted.calls.push({ op: "upsert", arg: rows });
      return ok;
    },
    insert: async (rows: unknown) => {
      hoisted.calls.push({ op: "insert", arg: rows });
      return { error: hoisted.insertError };
    },
    delete: () => ({
      in: async (_col: string, ids: unknown) => {
        hoisted.calls.push({ op: "delete", arg: ids });
        return ok;
      },
    }),
  });
  return {
    supabase: {
      from: () => table(),
      storage: {
        from: () => ({
          upload: async () => ok,
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.test/${path}` },
          }),
        }),
      },
    },
  };
});

import PremiumBookAdmin from "./PremiumBookAdmin";

const existingRows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 100 + i, sort_order: i + 1 }));

async function runApply(pages: number, existingCount: number) {
  hoisted.pageCount = pages;
  hoisted.existing = existingRows(existingCount);

  const { container } = render(<PremiumBookAdmin config={{ title: "책자" }} />);
  const input = container.querySelector('input[type="file"]') as HTMLElement;
  const file = new File(["%PDF"], "book.pdf", { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: async () => new ArrayBuffer(4),
  });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole("button", { name: "PDF 변환" }));

  const applyButton = await screen.findByRole("button", { name: /^적용 \(/ });
  hoisted.calls.length = 0;
  fireEvent.click(applyButton);
}

const callsOf = (op: string) => hoisted.calls.filter((c) => c.op === op);
const rowsOf = (op: string): Record<string, unknown>[] =>
  (callsOf(op)[0]?.arg as Record<string, unknown>[] | undefined) ?? [];
const writeOps = () =>
  hoisted.calls.map((c) => c.op).filter((op) => op !== "select");

beforeEach(() => {
  hoisted.calls.length = 0;
  hoisted.insertError = null;
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => ({}),
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = function toBlob(cb: BlobCallback) {
    cb(new Blob(["x"], { type: "image/webp" }));
  };
});

afterEach(() => {
  cleanup();
});

describe("PremiumBookAdmin 적용", () => {
  test("기존 행보다 페이지가 많으면 id 행은 upsert, id 없는 행은 별도 insert로 보낸다", async () => {
    await runApply(18, 16);
    await screen.findByText(/적용 완료.*18장 반영됨/);

    const upserts = callsOf("upsert");
    const inserts = callsOf("insert");
    expect(upserts).toHaveLength(1);
    expect(inserts).toHaveLength(1);

    const upsertRows = rowsOf("upsert");
    const insertRows = rowsOf("insert");
    expect(upsertRows).toHaveLength(16);
    for (const row of upsertRows) expect("id" in row).toBe(true);
    expect(insertRows.map((r) => r.sort_order)).toEqual([17, 18]);
    for (const row of insertRows) expect("id" in row).toBe(false);

    // 기존 행 먼저, 새 행 나중.
    expect(writeOps()).toEqual(["upsert", "insert"]);
  });

  test("페이지 수가 같으면 upsert 한 번, insert 없음", async () => {
    await runApply(16, 16);
    await screen.findByText(/적용 완료.*16장 반영됨/);

    expect(callsOf("upsert")).toHaveLength(1);
    expect(callsOf("insert")).toHaveLength(0);
    expect(callsOf("delete")).toHaveLength(0);
  });

  test("페이지가 더 적으면 upsert 후 잉여 행 삭제, insert 없음", async () => {
    await runApply(14, 16);
    await screen.findByText(/적용 완료.*14장 반영됨/);

    expect(callsOf("insert")).toHaveLength(0);
    expect(callsOf("delete")[0]?.arg).toEqual([114, 115]);
    expect(writeOps()).toEqual(["upsert", "delete"]);
  });

  test("기존 행이 없으면 insert만 보내고 upsert는 호출하지 않는다", async () => {
    await runApply(3, 0);
    await screen.findByText(/적용 완료.*3장 반영됨/);

    expect(callsOf("upsert")).toHaveLength(0);
    const inserts = callsOf("insert");
    expect(inserts).toHaveLength(1);
    for (const row of rowsOf("insert")) {
      expect("id" in row).toBe(false);
    }
  });

  test("새 페이지 insert가 실패하면 단계와 이미지 업로드 사실을 알리고 성공으로 표시하지 않는다", async () => {
    hoisted.insertError = { message: "boom" };
    await runApply(18, 16);

    const message = await screen.findByText(/새 페이지 insert 실패/);
    expect(message).toHaveTextContent("이미지는 업로드됐습니다");
    expect(message).toHaveTextContent("boom");
    await waitFor(() => {
      expect(screen.queryByText(/적용 완료/)).toBeNull();
    });
  });
});
