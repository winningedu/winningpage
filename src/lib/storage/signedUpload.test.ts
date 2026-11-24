// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../supabase", () => ({
  supabase: { auth: { getSession: vi.fn() } },
}));

import { ApiError } from "../http/client";
import { putSignedUpload } from "./signedUpload";
import source from "./signedUpload.ts?raw";

const URL_WITH_TOKEN =
  "https://x.supabase.co/storage/v1/object/upload/sign/admin-uploads-tmp/a.b.png?token=tok";

// ky 가 본문을 먼저 읽을 수 있어, 요청 본문은 fetch 안에서 복제해 읽어 둔다.
let sentBody = "";

function stubFetch(respond: () => Promise<Response>) {
  const spy = vi.fn(async (request: Request) => {
    sentBody = await request.clone().text();
    return respond();
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

function sent(spy: ReturnType<typeof stubFetch>): Request {
  const request = spy.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error("fetch가 호출되지 않음");
  return request;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("putSignedUpload", () => {
  test("supabase-js 를 직접 가져오지 않는다", () => {
    expect(source).not.toContain("@supabase/supabase-js");
  });

  test("토큰이 붙은 주소로 파일을 본문 그대로 PUT 한다", async () => {
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));
    const file = new File(["hello"], "a.png", { type: "image/png" });

    await putSignedUpload(URL_WITH_TOKEN, file);

    const request = sent(spy);
    expect(request.method).toBe("PUT");
    expect(request.url).toBe(URL_WITH_TOKEN);
    expect(sentBody).toBe("hello");
    expect(request.headers.get("content-type")).toBe("image/png");
    expect(request.headers.get("cache-control")).toBe("max-age=3600");
    expect(request.headers.has("authorization")).toBe(false);
  });

  test("cacheControl 을 넘기면 max-age 로 실리고 타입이 없으면 octet-stream 이다", async () => {
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));
    const file = new File(["x"], "a.bin");

    await putSignedUpload(URL_WITH_TOKEN, file, { cacheControl: "60" });

    const request = sent(spy);
    expect(request.headers.get("cache-control")).toBe("max-age=60");
    expect(request.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
  });

  test("HTTP 실패는 HTTP_<status> ApiError 이고 재시도하지 않는다", async () => {
    const spy = stubFetch(async () => new Response("no", { status: 403 }));

    const error = await putSignedUpload(
      URL_WITH_TOKEN,
      new File(["x"], "a.png", { type: "image/png" }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: "HTTP_403",
      detail: "파일을 올리지 못했어요.",
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test("네트워크 실패는 NETWORK ApiError 다", async () => {
    stubFetch(async () => {
      throw new TypeError("Failed to fetch");
    });

    const error = await putSignedUpload(
      URL_WITH_TOKEN,
      new File(["x"], "a.png"),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: null, code: "NETWORK" });
  });
});
