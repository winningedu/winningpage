// 파일 추가 모달의 업로드 상태 머신과 실행 흐름(시안 646:2436, 646:2730, 명세 No.42, 43, 122, 145).
// 흐름: collectUploadUrl -> Storage 서명 URL 직접 업로드 -> collectExtract. 바이트는 서버리스를
// 거치지 않는다(performance/guideUpload.ts 와 같은 선례). 끝나면 호출자가 summary 를 다시 부른다.
import type {
  ApiResult,
  ExtractResult,
  HighGrade,
  UploadRequest,
  UploadUrlResult,
} from "@/lib/growth/api";

// 서버 ALLOWED_UPLOAD_MIME, MAX_UPLOAD_BYTES(api/_lib/growth/intake/extraction.ts)와 같아야 한다.
// api/ 는 클라이언트 번들과 분리돼 import 하지 못해 복제한다. 사전 검사는 UX 용이고 강제는 서버 몫이다.
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/plain",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;
export const ACCEPT_ATTRIBUTE = ".pdf,.png,.jpg,.jpeg,.txt,.docx";
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const LIMIT_MESSAGE = "이 학기에는 파일을 10개까지 올릴 수 있어요";
export const EXTRACT_FAILED_MESSAGE =
  "글자를 읽지 못했어요. 직접 입력에 적어 주세요";
const UPLOAD_FAILED_MESSAGE =
  "파일을 올리지 못했어요. 잠시 뒤 다시 시도해 주세요.";
const TIMEOUT_MESSAGE =
  "추출이 오래 걸리고 있어요. 잠시 뒤 올린 목록을 확인하고 다시 시도해 주세요.";

export function validateUploadFile(
  file: Pick<File, "type" | "size">,
): string | null {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
    return "PDF, 이미지, TXT, DOCX 파일만 올릴 수 있어요.";
  }
  if (file.size < 1) return "빈 파일은 올릴 수 없어요.";
  if (file.size > MAX_UPLOAD_BYTES) return "파일은 10MB까지 올릴 수 있어요.";
  return null;
}

export type UploadState =
  | { phase: "idle" }
  | { phase: "requesting" }
  | { phase: "uploading" }
  | { phase: "extracting" }
  | { phase: "ok"; topic: string | null }
  | { phase: "failed"; message: string }
  | { phase: "limit"; message: string };

export type UploadEvent =
  | { type: "start" }
  | { type: "url-issued" }
  | { type: "uploaded" }
  | { type: "extracted"; topic: string | null }
  | { type: "failed"; message: string }
  | { type: "limit"; message: string }
  | { type: "reset" };

export const IDLE: UploadState = { phase: "idle" };

export function isUploadBusy(state: UploadState): boolean {
  return (
    state.phase === "requesting" ||
    state.phase === "uploading" ||
    state.phase === "extracting"
  );
}

export function uploadReducer(
  state: UploadState,
  event: UploadEvent,
): UploadState {
  switch (event.type) {
    case "reset":
      return IDLE;
    case "start":
      return isUploadBusy(state) ? state : { phase: "requesting" };
    case "url-issued":
      return { phase: "uploading" };
    case "uploaded":
      return { phase: "extracting" };
    case "extracted":
      return { phase: "ok", topic: event.topic };
    case "failed":
      return { phase: "failed", message: event.message };
    case "limit":
      return { phase: "limit", message: event.message };
  }
}

export type UploadDeps = {
  requestUploadUrl: (
    upload: UploadRequest,
  ) => Promise<ApiResult<UploadUrlResult>>;
  uploadToStorage: (
    bucket: string,
    path: string,
    token: string,
    file: File,
  ) => Promise<{ error: unknown }>;
  extract: (uploadId: string) => Promise<ApiResult<ExtractResult>>;
};

/** unreadable: 추출은 돌았지만 글자를 읽지 못함. 화면은 직접 입력 폼으로 안내한다. */
export type UploadOutcome = "ok" | "failed" | "limit" | "unreadable";

function errorMessage(result: Exclude<ApiResult<unknown>, { kind: "ok" }>) {
  return result.kind === "timeout" ? TIMEOUT_MESSAGE : result.message;
}

export async function runUpload(
  deps: UploadDeps,
  request: { gradeLabel: HighGrade; semester: 1 | 2; file: File },
  dispatch: (event: UploadEvent) => void,
): Promise<UploadOutcome> {
  const { file } = request;
  const fail = (message: string): UploadOutcome => {
    dispatch({ type: "failed", message });
    return "failed";
  };

  dispatch({ type: "start" });
  const issued = await deps.requestUploadUrl({
    fileName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    gradeLabel: request.gradeLabel,
    semester: request.semester,
    consent: true,
  });
  if (issued.kind !== "ok") {
    if (issued.kind === "error" && issued.code === "UPLOAD_LIMIT") {
      dispatch({ type: "limit", message: LIMIT_MESSAGE });
      return "limit";
    }
    return fail(errorMessage(issued));
  }

  dispatch({ type: "url-issued" });
  const { bucket, path, token, uploadId } = issued.data;
  const stored = await deps.uploadToStorage(bucket, path, token, file);
  if (stored.error) return fail(UPLOAD_FAILED_MESSAGE);

  dispatch({ type: "uploaded" });
  const extracted = await deps.extract(uploadId);
  if (extracted.kind !== "ok") return fail(errorMessage(extracted));
  if (extracted.data.status === "failed") {
    fail(EXTRACT_FAILED_MESSAGE);
    return "unreadable";
  }

  dispatch({
    type: "extracted",
    topic: extracted.data.extracted?.topic ?? null,
  });
  return "ok";
}
