import { ADMIN_PERMISSION_LEVEL_OPTIONS } from "@/pages/admin/configs/adminSettings";
import type { Level, PermissionItem } from "./api";

// 접근 수준 라디오 칸. 마지막 "미지정"은 값이 아니라 행이 없는 상태다.
export const LEVEL_CHOICES: { value: Level | ""; label: string }[] = [
  ...ADMIN_PERMISSION_LEVEL_OPTIONS.map((option) =>
    typeof option === "object"
      ? { value: option.value as Level, label: option.label }
      : { value: option as Level, label: String(option) },
  ),
  { value: "", label: "미지정" },
];

// 화면 상태: 키가 없으면 '미지정'이다.
export type LevelDraft = Record<string, Level>;

export const toDraft = (items: PermissionItem[]): LevelDraft =>
  Object.fromEntries(items.map((item) => [item.resourceKey, item.level]));

export const toItems = (draft: LevelDraft): PermissionItem[] =>
  Object.entries(draft).map(([resourceKey, level]) => ({ resourceKey, level }));

export function sameDraft(a: LevelDraft, b: LevelDraft) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  );
}
