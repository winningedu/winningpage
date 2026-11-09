// 콘솔 화면이 함께 쓰는 날짜 표기.

import { diffDaysYMD, kstYMD } from "@/lib/goal/calc/index.js";

/** 2026-11-05 를 2026.11.05 로. */
export const dotDate = (ymd: string) => ymd.replaceAll("-", ".");

/** 시각(ISO)을 한국 날짜 2026.11.05 로. */
export const kstDotDate = (iso: string) => dotDate(kstYMD(new Date(iso)));

/** 시각을 한국 시간 2026.11.05 14:20 으로. */
export const kstDotDateTime = (at: Date) =>
  dotDate(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(at),
  );

/** 시각(ISO)이 한국 달력으로 오늘이면 "오늘", 아니면 "n일 전". */
export const kstDaysAgoText = (iso: string, now: Date) => {
  const days = diffDaysYMD(kstYMD(new Date(iso)), kstYMD(now));
  return days <= 0 ? "오늘" : `${days}일 전`;
};
