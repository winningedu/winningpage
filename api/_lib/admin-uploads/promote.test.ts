// 저장 때 임시 업로드를 banners 로 옮기고 값 안의 임시 URL 을 공개 URL 로 바꾼다.

import { beforeEach, describe, expect, test } from "vitest";
import { SECTIONS } from "../admin-sections/registry.js";
import { RouteParamError } from "../handler.js";
import { promoteTempUploads, UploadExpiredError } from "./promote.js";
import { createFakeStorage } from "./storageTestKit.js";

const U1 = "123e4567-e89b-12d3-a456-426614174000";
const U2 = "223e4567-e89b-12d3-a456-426614174000";
const SUPA = "https://storage.test/storage/v1/object";
const tmpUrl = (name: string) =>
  `${SUPA}/sign/admin-uploads-tmp/${name}?token=eyJ.a-b_c`;
const pub = (path: string) => `${SUPA}/public/banners/${path}`;

let fake: ReturnType<typeof createFakeStorage>;
const admin = () => ({ storage: fake.storage }) as never;

const HERO = `${U1}.image_url.hero.png`;

beforeEach(() => {
  fake = createFakeStorage({
    "admin-uploads-tmp": [
      HERO,
      `${U2}.image_urls.a_b.jpg`,
      `${U1}.attachments.doc.pdf`,
      `${U1}.answer.in.png`,
    ],
  });
});

describe("promoteTempUploads", () => {
  test("이미지 문자열을 필드 폴더로 옮기고 공개 URL 로 바꾼다", async () => {
    const payload = { title: "t", image_url: tmpUrl(HERO) };

    const out = await promoteTempUploads(admin(), SECTIONS.banners, payload);

    expect(out).toEqual({
      title: "t",
      image_url: pub(`landing/hero/${U1}-hero.png`),
    });
    expect(fake.calls.find((c) => c.op === "move")).toEqual({
      bucket: "admin-uploads-tmp",
      op: "move",
      args: [
        HERO,
        `landing/hero/${U1}-hero.png`,
        { destinationBucket: "banners" },
      ],
    });
    expect(fake.names("admin-uploads-tmp")).not.toContain(HERO);
    // 입력 객체는 건드리지 않는다.
    expect(payload.image_url).toBe(tmpUrl(HERO));
  });

  test("배열과 {name, url} 객체와 중첩 JSON 안의 URL 도 바꾼다", async () => {
    const out = await promoteTempUploads(admin(), SECTIONS.notices, {
      image_urls: [
        tmpUrl(`${U2}.image_urls.a_b.jpg`),
        "https://example.com/keep.png",
      ],
      attachments: [
        { name: "doc.pdf", url: tmpUrl(`${U1}.attachments.doc.pdf`) },
      ],
    });

    expect(out).toEqual({
      image_urls: [pub(`admin/${U2}-a_b.jpg`), "https://example.com/keep.png"],
      attachments: [
        { name: "doc.pdf", url: pub(`notice-files/${U1}-doc.pdf`) },
      ],
    });
  });

  test("BlockNote JSON 깊은 곳과 HTML 문자열 안의 URL 도 토큰까지 통째로 바꾼다", async () => {
    const url = tmpUrl(`${U1}.answer.in.png`);
    const out = (await promoteTempUploads(admin(), SECTIONS.faqs, {
      answer_json: [{ type: "image", props: { url }, children: [] }],
      answer: `<p><img src="${url}" alt="x"></p>`,
    })) as { answer_json: { props: { url: string } }[]; answer: string };

    const expected = pub(`faq-body/${U1}-in.png`);
    expect(out.answer_json[0]?.props.url).toBe(expected);
    expect(out.answer).toBe(`<p><img src="${expected}" alt="x"></p>`);
    expect(JSON.stringify(out)).not.toContain("token=");
  });

  test("같은 임시 파일이 여러 곳에 있어도 한 번만 옮긴다", async () => {
    const url = tmpUrl(HERO);
    const out = await promoteTempUploads(admin(), SECTIONS.banners, {
      image_url: url,
      title: `${url} ${url}`,
    });

    const expected = pub(`landing/hero/${U1}-hero.png`);
    expect(out).toEqual({
      image_url: expected,
      title: `${expected} ${expected}`,
    });
    expect(fake.calls.filter((c) => c.op === "move")).toHaveLength(1);
  });

  test("임시 URL 이 없으면 스토리지를 부르지 않고 값을 그대로 둔다", async () => {
    const payload = {
      image_url: pub("landing/hero/a.png"),
      n: 3,
      ok: true,
      none: null,
    };
    const out = await promoteTempUploads(admin(), SECTIONS.banners, payload);
    expect(out).toEqual(payload);
    expect(fake.calls).toHaveLength(0);
  });

  test("임시 파일이 없으면 UploadExpiredError", async () => {
    const gone = `${U2}.image_url.gone.png`;
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: tmpUrl(gone),
      }),
    ).rejects.toBeInstanceOf(UploadExpiredError);
  });

  test("이미 옮긴 파일(원본은 없고 도착지가 있음)은 끝난 것으로 본다", async () => {
    const dest = `landing/hero/${U2}-done.png`;
    fake.put("banners", dest);
    const out = await promoteTempUploads(admin(), SECTIONS.banners, {
      image_url: tmpUrl(`${U2}.image_url.done.png`),
    });
    expect(out).toEqual({ image_url: pub(dest) });
  });

  test("이 섹션 업로드 필드가 아닌 필드 키는 400 으로 막고 아무것도 옮기지 않는다", async () => {
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: tmpUrl(`${U1}.attachments.doc.pdf`),
      }),
    ).rejects.toBeInstanceOf(RouteParamError);
    expect(fake.calls.filter((c) => c.op === "move")).toHaveLength(0);
  });

  test("임시 이름 형식이 아니면 400", async () => {
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: `${SUPA}/sign/admin-uploads-tmp/evil.png?token=t`,
      }),
    ).rejects.toBeInstanceOf(RouteParamError);
  });

  test("옮기다 오류가 나고 원본도 도착지도 없으면 만료로 본다(스토리지는 더 호출하지 않는다)", async () => {
    fake.failures.push({ op: "move" });
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: tmpUrl(HERO),
      }),
    ).rejects.toBeInstanceOf(UploadExpiredError);
  });
});

describe("promoteTempUploads 저장된 객체 검증", () => {
  const moves = () => fake.calls.filter((c) => c.op === "move");

  test("필드 한도(2MB)보다 큰 본문은 400 으로 막고 아무것도 옮기지 않는다", async () => {
    fake.put("admin-uploads-tmp", {
      name: HERO,
      size: 3 * 1024 * 1024,
      contentType: "image/png",
    });
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: tmpUrl(HERO),
      }),
    ).rejects.toMatchObject({
      name: "RouteParamError",
      message: "최대 2MB까지 업로드할 수 있습니다.",
    });
    expect(moves()).toHaveLength(0);
  });

  test("png 이름인데 svg 본문이면 400 으로 막고 아무것도 옮기지 않는다", async () => {
    fake.put("admin-uploads-tmp", {
      name: HERO,
      size: 10,
      contentType: "image/svg+xml",
    });
    await expect(
      promoteTempUploads(admin(), SECTIONS.banners, {
        image_url: tmpUrl(HERO),
      }),
    ).rejects.toMatchObject({
      name: "RouteParamError",
      message: "올릴 수 없는 파일 형식입니다.",
    });
    expect(moves()).toHaveLength(0);
  });

  test("한 파일이 어긋나면 같이 저장하려던 정상 파일도 옮기지 않는다", async () => {
    fake.put("admin-uploads-tmp", {
      name: `${U2}.image_urls.a_b.jpg`,
      size: 10,
      contentType: "image/svg+xml",
    });
    await expect(
      promoteTempUploads(admin(), SECTIONS.notices, {
        image_urls: [tmpUrl(`${U2}.image_urls.a_b.jpg`)],
        attachments: [{ url: tmpUrl(`${U1}.attachments.doc.pdf`) }],
      }),
    ).rejects.toBeInstanceOf(RouteParamError);
    expect(moves()).toHaveLength(0);
  });

  test("규칙에 맞는 크기와 형식이면 옮긴다", async () => {
    fake.put("admin-uploads-tmp", {
      name: HERO,
      size: 2 * 1024 * 1024,
      contentType: "image/png",
    });
    const out = await promoteTempUploads(admin(), SECTIONS.banners, {
      image_url: tmpUrl(HERO),
    });
    expect(out).toEqual({ image_url: pub(`landing/hero/${U1}-hero.png`) });
    expect(moves()).toHaveLength(1);
  });
});

describe("메타 편집 섹션", () => {
  test("메타 경로는 업로드를 옮기지 않으므로 meta 섹션에는 업로드 필드가 없어야 한다", () => {
    const withBoth = Object.entries(SECTIONS).filter(
      ([, entry]) => entry.meta && Object.keys(entry.uploads).length > 0,
    );
    expect(withBoth).toEqual([]);
  });
});
