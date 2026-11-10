import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPrograms() {
  vi.resetModules();
  return (await import("./programs.js")).SERVICE_CREDIT_PROGRAMS;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("SERVICE_CREDIT_PROGRAMS 라벨", () => {
  it("스쿨멘토는 명세 서비스 이름을 순서대로 쓴다", async () => {
    vi.stubEnv("SITE", "schoolmentor");

    const programs = await loadPrograms();

    expect(programs.map((p) => p.label)).toEqual([
      "학습진단",
      "목표관리",
      "성장설계",
      "수행평가",
      "심화탐구",
      "자기평가",
    ]);
  });

  it("위닝은 SERVICE_CONFIGS 이름 그대로다", async () => {
    vi.stubEnv("SITE", "winning");
    const programs = await loadPrograms();
    const { SERVICE_CONFIGS } = await import("../serviceAccess.js");

    const order = [
      "diagnose",
      "goal",
      "growth",
      "suhaeng",
      "inquiry",
      "selfeval",
    ];

    expect(programs.map((p) => p.label)).toEqual(
      order.map((key) => SERVICE_CONFIGS[key]?.service_name),
    );
  });

  it("SITE 가 비어 있어도 위닝 이름을 쓴다", async () => {
    vi.stubEnv("SITE", "");
    const programs = await loadPrograms();

    expect(programs[1]?.label).toBe("목표관리 서비스");
  });
});
