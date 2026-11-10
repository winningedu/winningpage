import type { VercelRequest, VercelResponse } from "@vercel/node";
import { describe, expect, test, vi } from "vitest";
import { dispatch } from "./dispatch.js";

const makeReq = (url: string | undefined, query: object = {}) =>
  ({ url, query }) as unknown as VercelRequest;

const makeRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as typeof res & VercelResponse;
};

describe("dispatch", () => {
  test("등록된 경로는 같은 req, res 로 해당 핸들러만 불러와 실행한다", async () => {
    const handler = vi.fn();
    const loader = vi.fn(async () => ({ default: handler }));
    const other = vi.fn(async () => ({ default: vi.fn() }));
    const req = makeReq("/api/goal/advice");
    const res = makeRes();

    await dispatch({ "goal/advice": loader, "goal/other": other }, req, res);

    expect(handler).toHaveBeenCalledExactlyOnceWith(req, res);
    expect(other).not.toHaveBeenCalled();
  });
});
