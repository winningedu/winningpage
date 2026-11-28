// 어드민 제네릭 섹션 엔진의 HTTP 호출(/api/admin/sections/...). 계약은 B3 계약서의 "Section engine routes".
// 행 모양은 섹션마다 달라 느슨하게 받는다(검증은 서버 몫).

import { z } from "zod";
import { api } from "@/lib/http/client";
import {
  type SectionValuesBody,
  sectionExportSchema,
  sectionListSchema,
  sectionRowSchema,
} from "../../../../shared/sections/contract.js";
import {
  type IssueUploadInput,
  issuedUploadSchema,
} from "../../../../shared/uploads/contract.js";
import {
  type UploadPreviewBody,
  uploadPreviewSchema,
} from "../../../../shared/uploads/preview.js";
export type SectionPageParams = { page: number; q: string };

export const sectionKeys = {
  // 섹션 하나의 목록 쿼리 전부(페이지, 검색어 변형 포함)를 무효화할 때 쓴다.
  section: (key: string) => ["admin", "sections", key] as const,
  // 수정 화면이 id 로 받는 행 하나.
  row: (key: string, id: string | number) =>
    [...sectionKeys.section(key), "row", String(id)] as const,
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
    .json(sectionListSchema);
}

export function fetchSectionRow(
  key: string,
  id: string | number,
  signal?: AbortSignal,
) {
  return api.get(one(key, id), signal ? { signal } : {}).json(sectionRowSchema);
}

export function createSectionRow(
  key: string,
  values: SectionValuesBody["values"],
) {
  return api
    .post(base(key), { json: { values } satisfies SectionValuesBody })
    .json(sectionRowSchema);
}

export function updateSectionRow(
  key: string,
  id: string | number,
  values: SectionValuesBody["values"],
) {
  return api
    .patch(one(key, id), { json: { values } satisfies SectionValuesBody })
    .json(sectionRowSchema);
}

export function updateSectionMeta(
  key: string,
  id: string | number,
  values: SectionValuesBody["values"],
) {
  return api
    .patch(`${one(key, id)}/meta`, {
      json: { values } satisfies SectionValuesBody,
    })
    .json(sectionRowSchema);
}

export async function deleteSectionRow(key: string, id: string | number) {
  await api.delete(one(key, id));
}

export function markSectionReviewed(key: string, id: string | number) {
  return api.post(`${one(key, id)}/reviewed`).json(sectionRowSchema);
}

export function fetchExportChunk(key: string, from: number, q: string) {
  return api
    .get(`${base(key)}/export`, { searchParams: { from, q } })
    .json(sectionExportSchema);
}

// 임시 버킷 업로드 3단계(서버가 주소를 발급하고, 브라우저가 PUT 하고, 미리보기 주소를 받는다).

export function issueUpload(
  section: string,
  file: Omit<IssueUploadInput, "section">,
) {
  return api
    .post("admin/uploads", { json: { section, ...file } })
    .json(issuedUploadSchema);
}

export async function previewUpload(
  section: UploadPreviewBody["section"],
  path: UploadPreviewBody["path"],
) {
  const { url } = await api
    .post("admin/uploads/preview", {
      json: { section, path } satisfies UploadPreviewBody,
    })
    .json(uploadPreviewSchema);
  return url;
}

export async function removeUploads(section: string, paths: string[]) {
  await api.delete("admin/uploads", { json: { section, paths } });
}

// 응답 모양은 서버가 정한다. 화면은 성공 여부만 쓴다.
const refundResultSchema = z.object({
  alreadyCompleted: z.boolean().optional(),
  refund: z.unknown().optional(),
});

export function completeRefund(refundRequestId: string | number) {
  return api
    .post("complete-refund", { json: { refundRequestId } })
    .json(refundResultSchema);
}

// 저장 뒤 임베딩 요청. 토스트와 저장은 이 응답을 기다리지 않는다.
export function requestEmbedding(id: string, knowledgeType: string) {
  return api
    .post("performance/admin-embed", {
      json: { action: "embed-one", id, knowledgeType },
      timeout: 60_000,
    })
    .json(z.record(z.string(), z.unknown()));
}
