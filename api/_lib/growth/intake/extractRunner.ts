// 추출 요청의 다운로드, 원문 해석, 모델 호출을 하나의 시간 예산 안에서 수행한다.

import { callText, callVision } from "../../gemini.js";
import type { Db, UploadClaim } from "./collectDb.js";
import {
  buildExtractionPrompt,
  EXTRACTION_MAX_OUTPUT_TOKENS,
  EXTRACTION_RESPONSE_SCHEMA,
  type ExtractionParse,
  parseExtractionResponse,
  textFromUpload,
} from "./extraction.js";
import { decideExtractionMode, remainingBudgetMs } from "./extractOutcome.js";

export const BUCKET = "growth-uploads";

export type Extraction =
  | { kind: "parsed"; parse: ExtractionParse }
  | { kind: "missing" | "upstream" | "timeout" };

export class DeadlineExceeded extends Error {}

/** 남은 예산 안에 끝나지 않으면 abort 신호를 보내고 DeadlineExceeded 로 거절한다. */
export async function withinBudget<T>(
  run: (signal: AbortSignal) => PromiseLike<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new DeadlineExceeded());
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** 다운로드, 원문 해석, 모델 호출을 하나의 마감 안에서 수행한다. */
export async function runExtraction(
  db: Db,
  row: UploadClaim & { grade_label: string; semester: number },
  path: string,
  startedAt: number,
): Promise<Extraction> {
  const left = () => remainingBudgetMs(startedAt, Date.now());
  try {
    const { data: blob, error } = await withinBudget(
      () => db.storage.from(BUCKET).download(path),
      left(),
    );
    if (error || !blob) {
      console.error("growth/collect 원본 다운로드 실패:", error);
      return { kind: "missing" };
    }
    const bytes = new Uint8Array(
      await withinBudget(() => blob.arrayBuffer(), left()),
    );
    let uploadText: Awaited<ReturnType<typeof textFromUpload>>;
    try {
      uploadText = await withinBudget(
        () => textFromUpload({ mimeType: row.mime_type, bytes }),
        left(),
      );
    } catch (e) {
      if (e instanceof DeadlineExceeded) throw e;
      console.error("growth/collect 원문 해석 실패:", e);
      return { kind: "parsed", parse: { ok: false, reason: "원문 해석 실패" } };
    }
    const mode = decideExtractionMode(uploadText);
    if (mode === "unsupported") {
      return {
        kind: "parsed",
        parse: { ok: false, reason: "지원하지 않는 형식" },
      };
    }
    const prompt = buildExtractionPrompt({
      fileName: row.file_name,
      gradeLabel: row.grade_label,
      semester: row.semester,
      mode,
      ...(uploadText.kind === "text" ? { text: uploadText.text } : {}),
    });
    try {
      const raw = await withinBudget((abortSignal) => {
        const options = {
          responseMimeType: "application/json",
          responseSchema: EXTRACTION_RESPONSE_SCHEMA,
          maxOutputTokens: EXTRACTION_MAX_OUTPUT_TOKENS,
          abortSignal,
        };
        return mode === "text"
          ? callText(prompt.system, prompt.user, options)
          : callVision(
              prompt.system,
              [{ data: bytes, mimeType: row.mime_type }],
              prompt.user,
              options,
            );
      }, left());
      return { kind: "parsed", parse: parseExtractionResponse(raw) };
    } catch (e) {
      if (e instanceof DeadlineExceeded) throw e;
      console.error("growth/collect 모델 호출 실패:", e);
      return left() === 0 ? { kind: "timeout" } : { kind: "upstream" };
    }
  } catch (e) {
    if (e instanceof DeadlineExceeded) return { kind: "timeout" };
    throw e;
  }
}

/** 추출 실패 종류별 응답 상태, 코드, 기록 사유, 안내 문구. */
export const EXTRACTION_FAILURES = {
  missing: [
    410,
    "UPLOAD_OBJECT_MISSING",
    "객체 없음",
    "올린 파일을 찾을 수 없어요. 다시 올려 주세요.",
  ],
  upstream: [
    502,
    "EXTRACTION_UPSTREAM_FAILED",
    "모델 호출 실패",
    "자료를 분석하지 못했어요. 잠시 후 다시 시도해 주세요.",
  ],
  timeout: [
    504,
    "EXTRACTION_TIMEOUT",
    "시간 초과",
    "분석이 오래 걸려 중단했어요. 잠시 후 다시 시도해 주세요.",
  ],
} as const;
