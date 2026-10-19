import { describe, expect, it } from "vitest";
import { site } from "@/config/site";
import { REPORT_COVER_PRESETS, type ReportCoverKind } from "./coverPresets";

const KINDS: ReportCoverKind[] = [
  "diagnosis",
  "goalWeekly",
  "goalMonthly",
  "growth",
  "performance",
  "inquiryDesign",
  "inquiryFinal",
  "inquiryRecord",
  "selfeval",
];

// U+2014, U+2013, U+00B7, U+2192
const BANNED = new RegExp("[\\u2014\\u2013\\u00B7\\u2192]");

describe("REPORT_COVER_PRESETS", () => {
  it.each(KINDS)("%s 프리셋은 모든 필드를 갖는다", (kind) => {
    const preset = REPORT_COVER_PRESETS[kind];

    expect(preset.serviceLabel).toBeTruthy();
    expect(preset.englishLabel).toBeTruthy();
    expect(preset.areasHeading).toBeTruthy();
    expect(preset.subtitle).toHaveLength(2);
    expect(preset.subtitle.every(Boolean)).toBe(true);
    expect(preset.disclaimer).toBeTruthy();
  });

  it.each(KINDS)("%s 항목은 3~4개다", (kind) => {
    const { areas } = REPORT_COVER_PRESETS[kind];

    expect(areas.length).toBeGreaterThanOrEqual(3);
    expect(areas.length).toBeLessThanOrEqual(4);
  });

  it("goalWeekly 3개, goalMonthly 4개 항목", () => {
    expect(REPORT_COVER_PRESETS.goalWeekly.areas).toHaveLength(3);
    expect(REPORT_COVER_PRESETS.goalMonthly.areas).toHaveLength(4);
  });

  it("inquiryDesign 은 날짜 라벨이 없다", () => {
    expect(REPORT_COVER_PRESETS.inquiryDesign.dateLabel).toBeNull();
  });

  it("inquiryRecord 는 확정 전 기록용이라 날짜 라벨과 최종 본문 항목이 없다", () => {
    const { dateLabel, areas } = REPORT_COVER_PRESETS.inquiryRecord;

    expect(dateLabel).toBeNull();
    expect(areas).toEqual(["설계 리포트", "평가 리포트", "확정 저장 내용"]);
  });

  it.each(KINDS)("%s 문구에 금지 문자가 없다", (kind) => {
    const preset = REPORT_COVER_PRESETS[kind];
    const texts = [
      preset.serviceLabel,
      preset.englishLabel,
      preset.areasHeading,
      ...preset.subtitle,
      ...preset.areas,
      preset.dateLabel ?? "",
      preset.disclaimer,
    ];

    for (const text of texts) expect(text).not.toMatch(BANNED);
  });

  it.each([
    "growth",
    "inquiryDesign",
    "inquiryFinal",
    "inquiryRecord",
    "selfeval",
  ] as const)("%s 고지에는 생활기록부가 없다", (kind) => {
    expect(REPORT_COVER_PRESETS[kind].disclaimer).not.toContain("생활기록부");
  });

  it.each(KINDS)("%s 고지에 site.brandName 이 들어 있다", (kind) => {
    expect(REPORT_COVER_PRESETS[kind].disclaimer).toContain(site.brandName);
  });
});
