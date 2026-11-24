// 관리자 임시 업로드 규칙: 버킷 이름, 임시 객체 이름 만들기와 읽기, 허용 형식과 크기.
// 브라우저는 이 이름을 만들지 않는다(서버가 정하고 돌려준다).

import type { UploadField } from "../admin-sections/registry.js";

export const TMP_BUCKET = "admin-uploads-tmp";
export const PUBLIC_BUCKET = "banners";

/** 임시 업로드 URL과 읽기 URL 유효 시간(2시간). */
export const SIGNED_URL_TTL_SECONDS = 7200;

/** 필드에 maxBytes 가 없을 때의 한도. 버킷 file_size_limit(데이터 SQL)과 같은 값이다. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

// accept 가 없는 파일 필드의 허용 확장자: 이미지와 문서 공통 목록.
const FILE_EXTENSIONS: readonly string[] = [
  ...Object.keys(IMAGE_MIME_BY_EXT),
  "pdf",
  "hwp",
  "hwpx",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "zip",
];

/**
 * 버킷 allowed_mime_types 와 정확히 같아야 한다(데이터 SQL, tmp.test.ts 가 대조).
 * octet-stream 은 브라우저가 hwp 에 타입을 비우거나 이 값으로 보내서 넣었다.
 */
export const ALLOWED_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
  "application/x-hwp",
  "application/haansofthwp",
  "application/vnd.hancom.hwp",
  "application/vnd.hancom.hwpx",
  "application/haansofthwpx",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
];

const EXT_PATTERN = /^[a-z0-9]{1,10}$/;

/** 원본 이름 마지막 점 뒤를 소문자로. 규칙에 안 맞거나 점이 없으면 null. */
export function extensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = fileName.slice(dot + 1).toLowerCase();
  return EXT_PATTERN.test(ext) ? ext : null;
}

// AdminEngine uploadImage 의 safeName 과 같은 규칙.
function safeBaseName(fileName: string): string {
  return (
    fileName
      .replace(/\.[^/.]+$/, "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 50) || "upload"
  );
}

/** 임시 객체 이름: <uuid>.<fieldKey>.<safeName>.<ext>. 확장자가 규칙에 안 맞으면 null. */
export function buildTempName(input: {
  uuid: string;
  fieldKey: string;
  fileName: string;
}): string | null {
  const ext = extensionOf(input.fileName);
  if (!ext) return null;
  return `${input.uuid}.${input.fieldKey}.${safeBaseName(input.fileName)}.${ext}`;
}

export interface ParsedTempName {
  uuid: string;
  fieldKey: string;
  safeName: string;
  ext: string;
}

const TEMP_NAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_]+)\.([A-Za-z0-9_-]{1,50})\.([a-z0-9]{1,10})$/;

/** buildTempName 의 역. 형식이 아니면 null(경로 구분자나 점이 낀 이름도 여기서 걸린다). */
export function parseTempName(name: string): ParsedTempName | null {
  const match = TEMP_NAME.exec(name);
  if (!match) return null;
  const [, uuid, fieldKey, safeName, ext] = match;
  return {
    uuid: uuid as string,
    fieldKey: fieldKey as string,
    safeName: safeName as string,
    ext: ext as string,
  };
}

/** 저장 때 banners 에 놓을 경로. */
export function destinationPath(folder: string, parsed: ParsedTempName) {
  return `${folder}/${parsed.uuid}-${parsed.safeName}.${parsed.ext}`;
}

export interface UploadRejection {
  path: string;
  message: string;
}

const BAD_TYPE = "올릴 수 없는 파일 형식입니다.";

/** 업로드 요청을 필드 규칙에 대 본다. 통과면 null, 아니면 첫 위반 하나. */
export function validateUpload(
  field: UploadField,
  request: { fileName: string; contentType: string; size: number },
): UploadRejection | null {
  const ext = extensionOf(request.fileName);
  if (!ext) return { path: "fileName", message: BAD_TYPE };

  if (field.kind === "image") {
    if (IMAGE_MIME_BY_EXT[ext] === undefined) {
      return { path: "fileName", message: BAD_TYPE };
    }
    if (IMAGE_MIME_BY_EXT[ext] !== request.contentType) {
      return { path: "contentType", message: BAD_TYPE };
    }
  } else {
    if (!(field.accept ?? FILE_EXTENSIONS).includes(ext)) {
      return { path: "fileName", message: BAD_TYPE };
    }
    if (!ALLOWED_MIME_TYPES.includes(request.contentType)) {
      return { path: "contentType", message: BAD_TYPE };
    }
  }

  const limit = field.maxBytes ?? MAX_UPLOAD_BYTES;
  if (request.size > limit) {
    return {
      path: "size",
      message: `최대 ${limit / (1024 * 1024)}MB까지 업로드할 수 있습니다.`,
    };
  }
  return null;
}
