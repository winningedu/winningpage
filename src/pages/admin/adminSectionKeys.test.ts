import { describe, expect, test } from "vitest";
import { ADMIN_ENGINE_SECTION_KEYS } from "./adminSectionKeys";
import { adminSettingsConfigs } from "./configs/adminSettings";
import { admissionConfigs } from "./configs/admission";
import { analyticsConfigs } from "./configs/analytics";
import { boardConfigs } from "./configs/board";
import { goalConfigs } from "./configs/goal";
import { mainConfigs } from "./configs/main";
import { memberConfigs } from "./configs/member";
import { revenueConfigs } from "./configs/revenue";
import { winningConfigs } from "./configs/winning";

type Flags = { custom?: boolean; comingSoon?: boolean };

// Admin.tsx 의 CONFIGS 와 같은 조립. adminRoutes 는 CONFIGS 를 import 하지 못해 키 목록을 따로 든다.
const CONFIGS: Record<string, unknown> = {
  ...mainConfigs,
  ...boardConfigs,
  ...admissionConfigs,
  ...memberConfigs,
  ...winningConfigs,
  ...revenueConfigs,
  ...goalConfigs,
  ...adminSettingsConfigs,
  ...analyticsConfigs,
};

describe("ADMIN_ENGINE_SECTION_KEYS", () => {
  test("custom 도 comingSoon 도 아닌 CONFIGS 키와 같다", () => {
    const derived = Object.entries(CONFIGS as Record<string, Flags>)
      .filter(([, config]) => !config.custom && !config.comingSoon)
      .map(([key]) => key)
      .sort();
    expect([...ADMIN_ENGINE_SECTION_KEYS].sort()).toEqual(derived);
  });
});
