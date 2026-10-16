// 정보 입력 화면 공통 클래스. 성장설계 시작 화면 카드 관례(growth/start/cardStyles.ts)를 따른다.
export {
  CARD,
  CARD_HINT,
  CARD_TITLE,
  SUB_TILE,
} from "@/components/growth/start/cardStyles";

const PILL_BASE =
  "inline-flex h-9 items-center rounded-full border px-4 text-app-label outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50";
export const PILL_ON = `${PILL_BASE} border-accent bg-accent font-semibold text-white`;
export const PILL_OFF = `${PILL_BASE} border-line bg-white text-ink hover:bg-surface-04`;
export const FIELD_LABEL = "text-app-label font-medium text-ink-sub";
export const FIELD_ERROR = "text-app-caption text-destructive";
export const INPUT_CLASS = "h-10 text-app-label md:text-app-label";
export const REQUIRED_BADGE =
  "rounded-full bg-surface-04 px-2 py-0.5 text-app-caption font-medium text-ink-sub";
