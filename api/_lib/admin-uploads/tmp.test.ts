// 임시 업로드 이름 규칙과 한도 검증.

import { describe, expect, test } from "vitest";
import type { UploadField } from "../admin-sections/registry.js";
import {
  ALLOWED_MIME_TYPES,
  buildTempName,
  destinationPath,
  MAX_UPLOAD_BYTES,
  parseTempName,
  validateUpload,
} from "./tmp.js";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const MB = 1024 * 1024;

describe("buildTempName", () => {
  test("uuid, 필드 키, 안전한 이름, 소문자 확장자를 점으로 잇는다", () => {
    expect(
      buildTempName({
        uuid: UUID,
        fieldKey: "image_url",
        fileName: "Logo A.PNG",
      }),
    ).toBe(`${UUID}.image_url.Logo_A.png`);
  });

  test("이름이 모두 걸러지면 upload, 50자를 넘으면 자른다", () => {
    expect(
      buildTempName({ uuid: UUID, fieldKey: "f", fileName: "한글.jpg" }),
    ).toBe(`${UUID}.f.upload.jpg`);
    const long = buildTempName({
      uuid: UUID,
      fieldKey: "f",
      fileName: `${"a".repeat(80)}.jpg`,
    });
    expect(long).toBe(`${UUID}.f.${"a".repeat(50)}.jpg`);
  });

  test("연속 밑줄은 하나로 줄이고 앞뒤 밑줄은 뗀다", () => {
    expect(
      buildTempName({ uuid: UUID, fieldKey: "f", fileName: "  a  b  .png" }),
    ).toBe(`${UUID}.f.a_b.png`);
  });

  test("확장자가 없거나 규칙에 맞지 않으면 null", () => {
    for (const fileName of ["noext", "a.", "a.toolongextension1", "a.p-g"]) {
      expect(buildTempName({ uuid: UUID, fieldKey: "f", fileName })).toBeNull();
    }
  });
});

describe("parseTempName", () => {
  test("buildTempName 결과를 되돌린다", () => {
    const name = buildTempName({
      uuid: UUID,
      fieldKey: "image_url",
      fileName: "a b.JPG",
    }) as string;
    expect(parseTempName(name)).toEqual({
      uuid: UUID,
      fieldKey: "image_url",
      safeName: "a_b",
      ext: "jpg",
    });
  });

  test("형식이 아니거나 경로 문자가 섞이면 null", () => {
    for (const name of [
      "",
      "x.png",
      `../${UUID}.f.a.png`,
      `${UUID}.f.a.png/extra`,
      `${UUID}.f.a/b.png`,
      `${UUID}.f.a.PNG`,
      `${UUID}.f-1.a.png`,
      `${UUID}.f.${"a".repeat(51)}.png`,
    ]) {
      expect(parseTempName(name)).toBeNull();
    }
  });
});

describe("destinationPath", () => {
  test("폴더 아래 uuid-이름.확장자", () => {
    const parsed = parseTempName(`${UUID}.f.a_b.png`);
    expect(parsed && destinationPath("landing/hero", parsed)).toBe(
      `landing/hero/${UUID}-a_b.png`,
    );
  });
});

const image: UploadField = { kind: "image", folder: "admin" };
const file: UploadField = { kind: "file", folder: "notice-files" };
const request = (fileName: string, contentType: string, size = 10) => ({
  fileName,
  contentType,
  size,
});

describe("validateUpload", () => {
  test("이미지는 확장자와 MIME 이 짝이 맞아야 한다", () => {
    expect(validateUpload(image, request("a.png", "image/png"))).toBeNull();
    expect(validateUpload(image, request("a.jpg", "image/jpeg"))).toBeNull();
    expect(validateUpload(image, request("a.jpeg", "image/jpeg"))).toBeNull();
    expect(validateUpload(image, request("a.svg", "image/svg+xml"))).toBeNull();
    for (const bad of [
      request("a.png", "image/jpeg"),
      request("a.pdf", "application/pdf"),
      request("a.exe", "image/png"),
      request("a", "image/png"),
    ]) {
      expect(validateUpload(image, bad)).toEqual({
        path: expect.any(String),
        message: "올릴 수 없는 파일 형식입니다.",
      });
    }
  });

  test("파일은 accept 가 있으면 그 확장자만, 없으면 공통 목록을 받는다", () => {
    const pdfOnly: UploadField = { ...file, accept: ["pdf"] };
    expect(
      validateUpload(pdfOnly, request("a.pdf", "application/pdf")),
    ).toBeNull();
    expect(
      validateUpload(pdfOnly, request("a.hwp", "application/x-hwp")),
    ).not.toBeNull();
    expect(
      validateUpload(file, request("a.hwp", "application/octet-stream")),
    ).toBeNull();
    expect(
      validateUpload(file, request("a.hwpx", "application/vnd.hancom.hwpx")),
    ).toBeNull();
    expect(
      validateUpload(file, request("a.exe", "application/octet-stream")),
    ).not.toBeNull();
    expect(validateUpload(file, request("a.pdf", "text/html"))).not.toBeNull();
  });

  test("크기 한도는 필드 값, 없으면 50MiB 이고 딱 한도는 통과한다", () => {
    expect(MAX_UPLOAD_BYTES).toBe(50 * MB);
    expect(
      validateUpload(image, request("a.png", "image/png", 50 * MB)),
    ).toBeNull();
    expect(
      validateUpload(image, request("a.png", "image/png", 50 * MB + 1)),
    ).toEqual({
      path: "size",
      message: "최대 50MB까지 업로드할 수 있습니다.",
    });
    const small: UploadField = { ...image, maxBytes: 3 * MB };
    expect(
      validateUpload(small, request("a.png", "image/png", 3 * MB)),
    ).toBeNull();
    expect(
      validateUpload(small, request("a.png", "image/png", 3 * MB + 1)),
    ).toEqual({
      path: "size",
      message: "최대 3MB까지 업로드할 수 있습니다.",
    });
  });
});

describe("ALLOWED_MIME_TYPES", () => {
  test("octet-stream 과 hwp 계열, 이미지, pdf 를 포함한다", () => {
    for (const mime of [
      "application/octet-stream",
      "application/x-hwp",
      "application/haansofthwp",
      "application/vnd.hancom.hwp",
      "application/vnd.hancom.hwpx",
      "application/haansofthwpx",
      "application/pdf",
      "image/svg+xml",
    ]) {
      expect(ALLOWED_MIME_TYPES).toContain(mime);
    }
  });
});
