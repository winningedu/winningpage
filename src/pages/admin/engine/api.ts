// 어드민 제네릭 섹션 엔진의 HTTP 호출(/api/admin/sections/...). 계약은 B3 계약서의 "Section engine routes".
// 행 모양은 섹션마다 달라 느슨하게 받는다(검증은 서버 몫).

import { z } from "zod";
import { api } from "@/lib/http/client";

const rowSchema = z.record(z.string(), z.any());
const listSchema = z.object({ items: z.array(rowSchema), total: z.number() });
const exportSchema = z.object({
  items: z.array(rowSchema),
  next: z.number().nullable(),
});

export type SectionRow = z.infer<typeof rowSchema>;
export type SectionPageParams = { page: number; q: string };

export const sectionKeys = {
  // 섹션 하나의 목록 쿼리 전부(페이지, 검색어 변형 포함)를 무효화할 때 쓴다.
  section: (key: string) => ["admin", "sections", key] as const,
  list: (key: string, params?: SectionPageParams) =>
    params
      ? ([...sectionKeys.section(key), params] as const)
      : sectionKeys.section(key),
};

const base = (key: string) => `admin/sections/${encodeURIComponent(key)}`;
const one = (key: string, id: string | number) =>
  `${base(key)}/${encodeURIComponent(String(id))}`;

export function fetchSectionList(
  key: string,
  params: SectionPageParams | undefined,
  signal?: AbortSignal,
) {
  return api
    .get(base(key), {
      searchParams: params ? { page: params.page, q: params.q } : {},
      ...(signal ? { signal } : {}),
    })
    .json(listSchema);
}

export function createSectionRow(key: string, values: Record<string, unknown>) {
  return api.post(base(key), { json: { values } }).json(rowSchema);
}

export function updateSectionRow(
  key: string,
  id: string | number,
  values: Record<string, unknown>,
) {
  return api.patch(one(key, id), { json: { values } }).json(rowSchema);
}

export function updateSectionMeta(
  key: string,
  id: string | number,
  values: Record<string, unknown>,
) {
  return api
    .patch(`${one(key, id)}/meta`, { json: { values } })
    .json(rowSchema);
}

export async function deleteSectionRow(key: string, id: string | number) {
  await api.delete(one(key, id));
}

export function markSectionReviewed(key: string, id: string | number) {
  return api.post(`${one(key, id)}/reviewed`).json(rowSchema);
}

export function fetchExportChunk(key: string, from: number, q: string) {
  return api
    .get(`${base(key)}/export`, { searchParams: { from, q } })
    .json(exportSchema);
}
