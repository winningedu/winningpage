import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { ADMIN_SECTION_KEYS } from "../adminSectionKeys";
import { mainConfigs } from "./main";

type Field = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  compress?: boolean;
  folder?: string;
  cacheControl?: string;
  imageSpec?: { width?: number; height?: number; aspectOnly?: boolean };
};
type Config = {
  title: string;
  table: string;
  order: string;
  fields: Field[];
};

const configs = mainConfigs as unknown as Record<string, Config>;
const banners = configs.banners as Config;

describe("푸터관리 어드민 섹션", () => {
  test("footer_operator_images 를 sort_order 순으로 관리하는 config 가 있다", () => {
    const config = configs.footerImages as Config;
    expect(config).toMatchObject({
      title: "푸터관리",
      table: "footer_operator_images",
      order: "sort_order",
    });
    expect(config.fields.map((f) => [f.key, f.type, !!f.required])).toEqual([
      ["is_active", "radioBoolean", true],
      ["title", "text", true],
      ["image_url", "image", true],
      ["sort_order", "number", false],
    ]);
  });

  test("이미지는 푸터 전용 폴더에 배너와 같은 캐시 설정으로 올리고, 비율만 안내한다", () => {
    const image = (configs.footerImages as Config).fields.find(
      (f) => f.key === "image_url",
    ) as Field;
    const bannerImage = banners.fields.find(
      (f) => f.key === "image_url",
    ) as Field;
    expect(image.folder).toBe("landing/footer");
    expect(image.cacheControl).toBe(bannerImage.cacheControl);
    expect(image.compress).toBe(true);
    expect(image.imageSpec).toMatchObject({
      width: 660,
      height: 250,
      aspectOnly: true,
    });
  });

  test("섹션 키가 메인화면 관리 키들 바로 뒤에 등록돼 있다", () => {
    const keys: readonly string[] = ADMIN_SECTION_KEYS;
    expect(keys.indexOf("footerImages")).toBe(
      keys.indexOf("mentorStrategies") + 1,
    );
  });

  test("사이드바 메인화면 관리 그룹에서 멘토스 소개 바로 뒤에 푸터관리가 있다", () => {
    const source = fs.readFileSync(
      path.resolve(import.meta.dirname, "../../Admin.tsx"),
      "utf8",
    );
    expect(source).toMatch(
      /\{ key: "mentorStrategies", label: "멘토스 소개" \},\s*\{ key: "footerImages", label: "푸터관리" \},/,
    );
  });

  test("admin_resources 메뉴 행을 넣는 데이터 SQL 이 있다", () => {
    const dataDir = path.resolve(
      import.meta.dirname,
      "../../../../supabase/data",
    );
    const file = fs
      .readdirSync(dataDir)
      .find((name) => name.endsWith("_admin_resources_footer_images.sql"));
    expect(file).toBeDefined();
    const sql = fs.readFileSync(path.join(dataDir, file as string), "utf8");
    expect(sql).toMatch(
      /values \('footerImages', '메인화면 관리', '푸터관리', 170, true\)/,
    );
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
    expect(sql).not.toMatch(/admin_role_resources|grant/i);
  });
});
