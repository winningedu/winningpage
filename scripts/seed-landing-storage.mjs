// =====================================================================
// 랜딩 초기 이미지 → Supabase Storage(banners/landing/**) 이전 스크립트
// (docs/landing-image-admin-plan.md §1 참고)
//
// 사용법:
//   SEED_SUPABASE_URL=... SEED_SECRET_KEY=... \
//     node scripts/seed-landing-storage.mjs --env dev [--apply-db] [--out ./landing-url-map.json]
//
//   --env dev|prod  : 라벨·안전확인용. dev면 SEED_SUPABASE_URL에 dev 프로젝트 ref가
//                     없으면 즉시 중단(운영 URL 오기입 방지). prod면 'yes' 입력 프롬프트를
//                     통과해야 진행.
//   --apply-db      : 5개 테이블의 '/images/landing/%' URL 컬럼을 publicUrl로 UPDATE.
//                     미지정 시 dry-run — 대상 row 수만 출력.
//   --out <path>    : 로컬경로→publicUrl 매핑 JSON 저장 경로 (기본 ./landing-url-map.json)
//
// 사전 최적화(sharp)를 쓰려면 `pnpm add -D sharp` 필요 —
// 미설치 시 원본 그대로 업로드하는 폴백으로 동작한다.
//
// 안전장치:
//   - upload은 upsert:false — 이미 존재(409)하면 skip 로그 후 계속.
//   - DB UPDATE는 반드시 "col like '/images/landing/%'" 가드 (관리자 수정값 보존, idempotent).
//   - DDL·시드 SQL은 이 스크립트가 다루지 않음 (sql/30_landing_admin_media.sql 참고).
// =====================================================================

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------
// 멘토 한글 파일명 → Storage 키 슬러그 매핑 (photos/cards 공용, 22명)
// 형식: '<sort_order/10 2자리>-<로마자 성-이름>' — sort_order는
// src/data/landingPreview.js mentors 픽스처(10~220) 기준.
// 이후 SQL 백필·검증 스크립트에서 재사용 (export 유지).
// ---------------------------------------------------------------------
export const MENTOR_SLUGS = {
  강지후: "01-kang-jihu",
  김형준: "02-kim-hyeongjun",
  박서정: "03-park-seojeong",
  박찬일: "04-park-chanil",
  이청훈: "05-lee-cheonghun",
  김무경: "06-kim-mugyeong",
  하현서: "07-ha-hyeonseo",
  제민규: "08-je-mingyu",
  김단아: "09-kim-dana",
  김성훈: "10-kim-seonghun",
  박민정: "11-park-minjeong",
  김정윤: "12-kim-jeongyun",
  손주연: "13-son-juyeon",
  신영진: "14-shin-yeongjin",
  정재웅: "15-jeong-jaewoong",
  성민우: "16-seong-minwoo",
  최정연: "17-choi-jeongyeon",
  이승현: "18-lee-seunghyun",
  한정원: "19-han-jeongwon",
  정채윤: "20-jeong-chaeyun",
  함다현: "21-ham-dahyun",
  한혜원: "22-han-hyewon",
};

const BUCKET = "banners";
const DEV_PROJECT_REF = "gjowqdiopinhixfivnkx";
const CACHE_CONTROL = "31536000, immutable";
const MAX_LONG_EDGE = 1600; // px — 초과 시 비율 유지 리사이즈
const MAX_BYTES = 500 * 1024; // 500KB 초과 시 재인코딩 시도
const LOCAL_PREFIX = "/images/landing/";

/**
 * DB_TARGETS 5개 테이블의 조회 행. 동적 select(`id, ${column}`)라
 * supabase-js가 이 쿼리 결과를 GenericStringError로 추론한다. dot 접근하는
 * id만 선언하고, 대상 URL 컬럼은 동적 키(row[column])로만 접근하므로
 * (noImplicitAny 꺼짐) 별도 선언 없이 암시적 any로 통과한다. 5개 테이블 중
 * banners.id만 생성 타입에서 number이고 나머지 4개는 string이라 union으로 둔다
 * (실제 사용처는 템플릿 리터럴과 .eq() 인자뿐이라 어느 쪽이든 문제 없다).
 * @typedef {{ id: import("../src/types/database.types.ts").Tables<"banners">["id"] | import("../src/types/database.types.ts").Tables<"home_side_banners">["id"] }} UrlColumnRow
 */

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const landingDir = path.join(rootDir, "public/images/landing");

// URL 컬럼 UPDATE 대상 (플랜 §1-3: 5개 테이블 고정)
const DB_TARGETS = [
  { table: "banners", columns: ["image_url"] },
  { table: "home_side_banners", columns: ["image_url", "mobile_image_url"] },
  { table: "university_acceptances", columns: ["emblem_url"] },
  { table: "program_categories", columns: ["icon_image_url"] },
  { table: "home_mentor_strategies", columns: ["photo_url"] },
];

function parseCliArgs() {
  const { values } = parseArgs({
    options: {
      env: { type: "string" },
      "apply-db": { type: "boolean", default: false },
      out: { type: "string", default: "./landing-url-map.json" },
    },
  });
  if (values.env !== "dev" && values.env !== "prod") {
    console.error(
      "사용법: --env dev|prod 필수 (예: node scripts/seed-landing-storage.mjs --env dev)",
    );
    process.exit(1);
  }
  return { env: values.env, applyDb: values["apply-db"], out: values.out };
}

async function confirmProd() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("PROD 업로드 진행? yes 입력: ")).trim();
  rl.close();
  if (answer !== "yes") {
    console.error("중단: yes가 입력되지 않았습니다.");
    process.exit(1);
  }
}

// ---------------------------------------------------------------------
// 업로드 대상 수집: { localPath('/images/landing/...'), absPath, key('landing/...') }
// ---------------------------------------------------------------------
async function listPngs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith(".png"))
    .map((e) => e.name);
}

async function collectFiles() {
  const files = [];
  const add = (relLocal, key) => {
    files.push({
      localPath: LOCAL_PREFIX + relLocal,
      absPath: path.join(landingDir, relLocal),
      key: `landing/${key}`,
    });
  };

  // hero: 전 파일 (미참조 main-banner-bg, side-banner-callmentor 포함)
  for (const name of await listPngs(path.join(landingDir, "hero"))) {
    add(`hero/${name}`, `hero/${name}`);
  }

  // acceptance: medical 하위 폴더 평면화, 파일명 충돌 시 medical- prefix
  const topNames = await listPngs(path.join(landingDir, "acceptance"));
  for (const name of topNames) {
    add(`acceptance/${name}`, `acceptance/${name}`);
  }
  for (const name of await listPngs(
    path.join(landingDir, "acceptance/medical"),
  )) {
    const flatName = topNames.includes(name) ? `medical-${name}` : name;
    add(`acceptance/medical/${name}`, `acceptance/${flatName}`);
  }

  // services: icon-shadow.png는 정적 유지 — 이관 제외
  for (const name of await listPngs(path.join(landingDir, "services"))) {
    if (name === "icon-shadow.png") continue;
    add(`services/${name}`, `services/${name}`);
  }

  // mentors: 한글 파일명 → 슬러그 키 (Storage 키에 한글 금지)
  for (const sub of ["photos", "cards"]) {
    for (const name of await listPngs(
      path.join(landingDir, `mentors/${sub}`),
    )) {
      const slug = MENTOR_SLUGS[path.basename(name, ".png")];
      if (!slug) {
        throw new Error(
          `MENTOR_SLUGS에 없는 멘토 파일: mentors/${sub}/${name} — 매핑 추가 필요`,
        );
      }
      add(`mentors/${sub}/${name}`, `mentors/${sub}/${slug}.png`);
    }
  }

  return files;
}

// ---------------------------------------------------------------------
// sharp 사전 최적화 (미설치 시 원본 폴백)
// ---------------------------------------------------------------------
async function loadSharp() {
  try {
    return (await import("sharp")).default;
  } catch {
    console.warn(
      "[warn] sharp 미설치 — 원본 그대로 업로드합니다. 최적화하려면: pnpm add -D sharp",
    );
    return null;
  }
}

async function prepareBuffer(sharp, absPath) {
  const original = await readFile(absPath);
  if (!sharp) return original;

  const meta = await sharp(original).metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (longEdge <= MAX_LONG_EDGE && original.length <= MAX_BYTES)
    return original;

  // fit:'inside' — 장변 기준 비율 유지 축소 (확대 금지)
  const optimized = await sharp(original)
    .resize({
      width: MAX_LONG_EDGE,
      height: MAX_LONG_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  if (optimized.length >= original.length) return original;
  console.log(
    `  최적화 ${path.basename(absPath)}: ${(original.length / 1024).toFixed(0)}KB → ${(optimized.length / 1024).toFixed(0)}KB` +
      (longEdge > MAX_LONG_EDGE
        ? ` (장변 ${longEdge}px → ${MAX_LONG_EDGE}px)`
        : ""),
  );
  return optimized;
}

// ---------------------------------------------------------------------
// 업로드 + publicUrl 수집
// ---------------------------------------------------------------------
async function uploadAll(supabase, sharp, files) {
  const urlMap = {}; // localPath → publicUrl
  let uploaded = 0;
  let skipped = 0;

  for (const file of files) {
    const buffer = await prepareBuffer(sharp, file.absPath);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(file.key, buffer, {
        cacheControl: CACHE_CONTROL,
        contentType: "image/png",
        upsert: false,
      });

    if (error) {
      // 이미 존재(409) — 키 불변 정책상 정상 케이스, skip 후 URL만 수집
      const isConflict =
        error.statusCode === "409" ||
        /already exists/i.test(error.message ?? "");
      if (!isConflict) {
        throw new Error(`업로드 실패 ${file.key}: ${error.message}`);
      }
      console.log(`  skip (이미 존재): ${file.key}`);
      skipped += 1;
    } else {
      uploaded += 1;
    }

    urlMap[file.localPath] = supabase.storage
      .from(BUCKET)
      .getPublicUrl(file.key).data.publicUrl;
  }

  console.log(
    `업로드 완료: 신규 ${uploaded}건, skip ${skipped}건, 총 ${files.length}키`,
  );
  return urlMap;
}

// ---------------------------------------------------------------------
// DB URL 교체 — 반드시 like '/images/landing/%' 가드 (dry-run 기본)
// ---------------------------------------------------------------------
async function updateDb(supabase, urlMap, applyDb) {
  for (const { table, columns } of DB_TARGETS) {
    for (const column of columns) {
      const { data: rows, error } = await supabase
        .from(table)
        .select(`id, ${column}`)
        .like(column, `${LOCAL_PREFIX}%`);
      if (error) {
        throw new Error(`${table}.${column} 조회 실패: ${error.message}`);
      }
      const typedRows = /** @type {UrlColumnRow[]} */ (
        /** @type {unknown} */ (rows)
      );

      if (!applyDb) {
        console.log(
          `[dry-run] ${table}.${column}: 교체 대상 ${typedRows.length}건`,
        );
        continue;
      }

      let updated = 0;
      for (const row of typedRows) {
        const publicUrl = urlMap[row[column]];
        if (!publicUrl) {
          console.warn(
            `  [warn] 매핑 없음 — ${table}#${row.id} ${column}=${row[column]} (건너뜀)`,
          );
          continue;
        }
        // update에도 like 가드 재적용 — 조회~수정 사이 관리자 변경 보존
        const { error: updateError } = await supabase
          .from(table)
          .update({ [column]: publicUrl })
          .eq("id", row.id)
          .like(column, `${LOCAL_PREFIX}%`);
        if (updateError) {
          throw new Error(
            `${table}#${row.id} ${column} UPDATE 실패: ${updateError.message}`,
          );
        }
        updated += 1;
      }
      console.log(`${table}.${column}: ${updated}/${rows.length}건 URL 교체`);
    }
  }
}

async function main() {
  const { env, applyDb, out } = parseCliArgs();

  const supabaseUrl = process.env.SEED_SUPABASE_URL;
  const secretKey = process.env.SEED_SECRET_KEY;
  if (!supabaseUrl || !secretKey) {
    console.error("환경변수 SEED_SUPABASE_URL, SEED_SECRET_KEY 필요");
    process.exit(1);
  }

  console.log(`대상 환경: ${env} (${supabaseUrl})`);
  if (env === "dev" && !supabaseUrl.includes(DEV_PROJECT_REF)) {
    console.error(
      `중단: --env dev인데 SEED_SUPABASE_URL에 dev 프로젝트 ref(${DEV_PROJECT_REF})가 없습니다 — 운영 URL 오기입 방지`,
    );
    process.exit(1);
  }
  if (env === "prod") await confirmProd();

  await stat(landingDir).catch(() => {
    console.error(`이미지 디렉터리 없음: ${landingDir}`);
    process.exit(1);
  });

  const supabase = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sharp = await loadSharp();

  const files = await collectFiles();
  console.log(`업로드 대상: ${files.length}키 (bucket=${BUCKET})`);

  const urlMap = await uploadAll(supabase, sharp, files);

  const outPath = path.resolve(process.cwd(), out);
  await writeFile(outPath, `${JSON.stringify(urlMap, null, 2)}\n`);
  console.log(`URL 매핑 저장: ${outPath}`);

  await updateDb(supabase, urlMap, applyDb);
  if (!applyDb) {
    console.log("dry-run 종료 — 실제 UPDATE는 --apply-db 지정");
  }
}

// 직접 실행 시에만 구동 — MENTOR_SLUGS import 재사용 시 부작용 방지
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
