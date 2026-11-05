// 콘솔 화면이 함께 쓰는 날짜 표기.

import { kstYMD } from "@/lib/goal/calc/index.js";

/** 2026-11-05 를 2026.11.05 로. */
export const dotDate = (ymd: string) => ymd.replaceAll("-", ".");

/** 시각(ISO)을 한국 날짜 2026.11.05 로. */
export const kstDotDate = (iso: string) => dotDate(kstYMD(new Date(iso)));
