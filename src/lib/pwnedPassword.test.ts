import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// sha1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

const fetchMock = vi.fn();

function rangeResponse(body: string, status = 200) {
  return new Response(body, { status });
}

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function load() {
  return import("./pwnedPassword");
}

describe("checkPwnedPassword", () => {
  test("범위 응답에 해시 뒷부분이 있으면 pwned, 앞 5자만 보낸다", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockResolvedValue(
      rangeResponse(
        `0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n${SUFFIX}:9545824\r\n`,
      ),
    );

    await expect(checkPwnedPassword("password")).resolves.toBe("pwned");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${PREFIX}`);
    expect(init.headers).toEqual({ "Add-Padding": "true" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test("COUNT 0 인 줄은 응답 크기를 맞추는 가짜라 유출이 아니다", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockResolvedValue(rangeResponse(`${SUFFIX.toLowerCase()}:0\r\n`));

    await expect(checkPwnedPassword("password")).resolves.toBe("ok");
  });

  test("목록에 없으면 ok", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockResolvedValue(
      rangeResponse("0018A45C4D1DEF81644B54AB7F969B88D65:3\r\n"),
    );

    await expect(checkPwnedPassword("password")).resolves.toBe("ok");
  });

  test("200 이 아니면 unknown 이고 캐시하지 않는다", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockResolvedValueOnce(rangeResponse("", 503));
    fetchMock.mockResolvedValueOnce(rangeResponse(`${SUFFIX}:5\r\n`));

    await expect(checkPwnedPassword("password")).resolves.toBe("unknown");
    await expect(checkPwnedPassword("password")).resolves.toBe("pwned");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("fetch 가 던지면 unknown", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockRejectedValue(new TypeError("network"));

    await expect(checkPwnedPassword("password")).resolves.toBe("unknown");
  });

  test("같은 비밀번호는 한 번만 조회한다", async () => {
    const { checkPwnedPassword } = await load();
    fetchMock.mockResolvedValue(rangeResponse(`${SUFFIX}:5\r\n`));

    await checkPwnedPassword("password");
    await expect(checkPwnedPassword("password")).resolves.toBe("pwned");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("빈 문자열은 조회하지 않고 ok", async () => {
    const { checkPwnedPassword } = await load();

    await expect(checkPwnedPassword("")).resolves.toBe("ok");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("isPwnedPasswordError", () => {
  test("weak_password 이고 reasons 에 pwned 가 있으면 true", async () => {
    const { isPwnedPasswordError } = await load();
    expect(
      isPwnedPasswordError({ code: "weak_password", reasons: ["pwned"] }),
    ).toBe(true);
    expect(
      isPwnedPasswordError({
        name: "AuthWeakPasswordError",
        reasons: ["length", "pwned"],
      }),
    ).toBe(true);
  });

  test("pwned 가 없거나 다른 오류면 false", async () => {
    const { isPwnedPasswordError } = await load();
    expect(
      isPwnedPasswordError({ code: "weak_password", reasons: ["length"] }),
    ).toBe(false);
    expect(isPwnedPasswordError({ code: "weak_password" })).toBe(false);
    expect(isPwnedPasswordError({ code: "other", reasons: ["pwned"] })).toBe(
      false,
    );
    expect(isPwnedPasswordError(null)).toBe(false);
    expect(isPwnedPasswordError("pwned")).toBe(false);
  });
});
