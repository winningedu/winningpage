// 섹션 저장 때 임시 업로드(admin-uploads-tmp)를 banners 로 옮기고, 값 안의 임시 읽기 URL 을
// 공개 URL 로 바꾼다. 브라우저는 업로드 직후 받은 임시 읽기 URL 을 폼 값으로 들고 있다가 그대로 보낸다.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { VercelResponse } from "@vercel/node";
import type { SectionEntry } from "../admin-sections/registry.js";
import { RouteParamError } from "../handler.js";
import {
  destinationPath,
  PUBLIC_BUCKET,
  parseTempName,
  sendUploadExpired,
  TMP_BUCKET,
} from "./tmp.js";

/** 저장하려는 임시 파일이 사라졌다(2시간 URL 만료나 24시간 정리). 라우트가 409 UPLOAD_EXPIRED 로 바꾼다. */
export class UploadExpiredError extends Error {
  constructor() {
    super("temp upload expired");
    this.name = "UploadExpiredError";
  }
}

// 스킴부터 쿼리 끝까지 통째로 잡는다(토큰이 남으면 안 된다). 공백, 따옴표, 꺾쇠에서 끊는다.
const TEMP_URL =
  /https?:\/\/[^\s"'<>]*\/storage\/v1\/object\/sign\/admin-uploads-tmp\/([^\s"'<>?#/]+)(?:\?[^\s"'<>#]*)?/g;

function collectNames(value: unknown, names: Set<string>): void {
  if (typeof value === "string") {
    for (const match of value.matchAll(TEMP_URL)) names.add(match[1] as string);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNames(item, names);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectNames(item, names);
  }
}

function replaceUrls(value: unknown, urls: Map<string, string>): unknown {
  if (typeof value === "string") {
    return value.replace(
      TEMP_URL,
      (whole, name: string) => urls.get(name) ?? whole,
    );
  }
  if (Array.isArray(value)) return value.map((item) => replaceUrls(item, urls));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceUrls(item, urls),
      ]),
    );
  }
  return value;
}

/**
 * payload 안(배열, 객체, BlockNote JSON 포함)의 임시 읽기 URL 을 모두 찾아 파일을 banners 로 옮기고
 * 공개 URL 로 바꾼 새 payload 를 돌려준다. 임시 URL 이 없으면 스토리지를 부르지 않는다.
 * 이미 옮겨진 파일(원본 없음, 도착지 있음)은 끝난 것으로 본다. 둘 다 없으면 UploadExpiredError.
 * 이 섹션 업로드 필드가 아닌 필드 키의 파일은 400(RouteParamError)이다.
 */
export async function promoteTempUploads<T>(
  admin: SupabaseClient,
  entry: SectionEntry,
  payload: T,
): Promise<T> {
  const names = new Set<string>();
  collectNames(payload, names);
  if (names.size === 0) return payload;

  // 하나라도 규칙에 안 맞으면 아무것도 옮기기 전에 거절한다.
  const plan = [...names].map((name) => {
    const parsed = parseTempName(name);
    const field = parsed && entry.uploads[parsed.fieldKey];
    if (!parsed || !field) {
      throw new RouteParamError("values", "올바르지 않은 업로드 경로입니다.");
    }
    return { name, dest: destinationPath(field.folder, parsed) };
  });

  const urls = new Map<string, string>();
  for (const { name, dest } of plan) {
    const { error } = await admin.storage
      .from(TMP_BUCKET)
      .move(name, dest, { destinationBucket: PUBLIC_BUCKET });
    if (error) {
      const { data: moved } = await admin.storage
        .from(PUBLIC_BUCKET)
        .exists(dest);
      if (!moved) throw new UploadExpiredError();
    }
    urls.set(
      name,
      admin.storage.from(PUBLIC_BUCKET).getPublicUrl(dest).data.publicUrl,
    );
  }
  return replaceUrls(payload, urls) as T;
}

/**
 * 라우트용 묶음: 만료면 409 를 보내고 null, 아니면 바뀐 payload. 그 밖의 오류는 그대로 던진다.
 * 호출은 쓰기 쿼리 전에 해서 만료 때 DB 를 건드리지 않는다.
 */
export async function promoteForWrite<T>(
  res: VercelResponse,
  admin: SupabaseClient,
  entry: SectionEntry,
  payload: T,
): Promise<T | null> {
  try {
    return await promoteTempUploads(admin, entry, payload);
  } catch (error) {
    if (!(error instanceof UploadExpiredError)) throw error;
    sendUploadExpired(res);
    return null;
  }
}
