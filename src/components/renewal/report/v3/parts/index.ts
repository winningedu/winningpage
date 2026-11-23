// Shared presentational parts of the v3 report (pages 1 to 16). Props take
// payload pieces (src/lib/diagnosis-v3/types.ts) as they are; no scoring here.

export { REPORT_LABELS, TOTAL_PAGES } from "./labels";
export {
  default as RadarChart7,
  type RadarAxis,
} from "./RadarChart7";
export { default as ReportSheet } from "./ReportSheet";
export { default as ScoreBars } from "./ScoreBars";
export { default as StatusBadge } from "./StatusBadge";
