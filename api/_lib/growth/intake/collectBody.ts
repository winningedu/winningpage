// POST /api/growth/collect 요청 바디 검증(순수 함수). action 네 갈래를 정규화한다.

import type { SemesterKey, Track } from "../types.js";
import { type UploadRequest, validateUploadRequest } from "./extraction.js";

const TRACKS: readonly Track[] = ["고1", "고2", "고3", "졸업", "N수"];

const SEMESTER_KEYS: readonly SemesterKey[] = [
  "고1-1",
  "고1-2",
  "고2-1",
  "고2-2",
  "고3-1",
  "고3-2",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** summary 와 commit 이 공유하는 집계 입력. */
export type AggregateInput = {
  track: Track;
  directGrades: Partial<Record<SemesterKey, number | null>> | null;
  current: { grade: 1 | 2 | 3; semester: 1 | 2 } | undefined;
};

export type SummaryBody = AggregateInput & { action: "summary" };

export type CommitBody = AggregateInput & { action: "commit" };

export type UploadUrlBody = {
  action: "upload-url";
  upload: UploadRequest & { ext: string };
};

export type ExtractBody = { action: "extract"; uploadId: string };

export type CollectBody =
  | SummaryBody
  | CommitBody
  | UploadUrlBody
  | ExtractBody;

export type CollectValidation =
  | { ok: true; body: CollectBody }
  | { ok: false; status: number; code: string; reason: string };

function parseDirectGrades(
  v: unknown,
): { ok: true; value: AggregateInput["directGrades"] } | { ok: false } {
  if (v === undefined || v === null) return { ok: true, value: null };
  if (typeof v !== "object" || Array.isArray(v)) return { ok: false };
  const out: Partial<Record<SemesterKey, number | null>> = {};
  for (const [k, val] of Object.entries(v)) {
    const key = SEMESTER_KEYS.find((s) => s === k);
    if (!key) return { ok: false };
    if (val === null) {
      out[key] = null;
    } else if (typeof val === "number" && val >= 1 && val <= 9) {
      out[key] = val;
    } else {
      return { ok: false };
    }
  }
  return { ok: true, value: out };
}

function parseCurrent(
  v: unknown,
): { ok: true; value: AggregateInput["current"] } | { ok: false } {
  if (v === undefined) return { ok: true, value: undefined };
  const c = v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  if (!c) return { ok: false };
  const { grade, semester } = c;
  if (
    (grade !== 1 && grade !== 2 && grade !== 3) ||
    (semester !== 1 && semester !== 2)
  ) {
    return { ok: false };
  }
  return { ok: true, value: { grade, semester } };
}

const invalid = (reason: string): CollectValidation => ({
  ok: false,
  status: 400,
  code: "INVALID_BODY",
  reason,
});

function validateAggregate(
  b: Record<string, unknown>,
  action: "summary" | "commit",
): CollectValidation {
  const track = TRACKS.find((t) => t === b.track);
  if (!track) return invalid("track 오류");
  const direct = parseDirectGrades(b.directGrades);
  if (!direct.ok) return invalid("directGrades 오류");
  const current = parseCurrent(b.current);
  if (!current.ok) return invalid("current 오류");
  return {
    ok: true,
    body: {
      action,
      track,
      directGrades: direct.value,
      current: current.value,
    },
  };
}

export function validateCollectBody(raw: unknown): CollectValidation {
  const b =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (b.action === "summary" || b.action === "commit") {
    return validateAggregate(b, b.action);
  }
  if (b.action === "upload-url") {
    const v = validateUploadRequest(b);
    if (!v.ok) {
      const status =
        v.code === "UNSUPPORTED_MIME"
          ? 415
          : v.code === "FILE_TOO_LARGE"
            ? 413
            : 400;
      return { ok: false, status, code: v.code, reason: v.reason };
    }
    return { ok: true, body: { action: "upload-url", upload: v.value } };
  }
  if (b.action === "extract") {
    const uploadId = typeof b.uploadId === "string" ? b.uploadId.trim() : "";
    if (!UUID_RE.test(uploadId)) return invalid("uploadId 오류");
    return { ok: true, body: { action: "extract", uploadId } };
  }
  return invalid("action 오류");
}
