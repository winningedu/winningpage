import { afterEach, describe, expect, test, vi } from "vitest";

async function loadConfigs(siteKey: string) {
  vi.stubEnv("VITE_SITE", siteKey);
  vi.resetModules();
  const { adminSettingsConfigs } = await import("./adminSettings");
  return adminSettingsConfigs as unknown as Record<
    string,
    { custom?: boolean; customComponentKey?: string }
  >;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("adminAccessLogs 설정: 사이트 스위치", () => {
  test("스쿨멘토는 전용 화면(adminAccessLogs 컴포넌트)을 쓴다", async () => {
    const config = (await loadConfigs("schoolmentor")).adminAccessLogs;

    expect(config).toMatchObject({
      custom: true,
      customComponentKey: "adminAccessLogs",
    });
  });

  test("위닝도 hqTenantAdmin 이 켜져 있어 전용 화면을 쓴다", async () => {
    const config = (await loadConfigs("winning")).adminAccessLogs;

    expect(config).toMatchObject({
      custom: true,
      customComponentKey: "adminAccessLogs",
    });
  });
});
