// GET /api/performance/cleanup-attachments   (Vercel Cron 전용 — 일 1회)
// Authorization: Bearer <CRON_SECRET>
//
//   → 200 { ok, ranAt, stuck, maxCleanupAttempts, retention:{...}, orphan:{...} }
//   → 401 (시크릿 불일치 · 미설정)
//   → 405 (GET/POST 외)
//   → 500 { error:{code:'INTERNAL'} }
//
// ── 이 파일이 하는 일 — **성격이 다른 스윕 2개**를 한 번에 돈다
//
//   §8.8 「24시간 TTL 스윕과의 역할 구분」 표가 둘을 명시적으로 갈라놨다.
//
//     A. 90일 보관 정책 집행 (§8.8 「결정 (cron 인프라 신설)」)
//        대상: deleted_at is null and created_at < now() - interval '90 days'
//        역할: 사용자에게 고지한 `90일 후 자동 삭제` 약속을 실제로 지킨다.
//
//     B. 24시간 TTL 스윕 (§8.8 「잔존물 청소(별개)」)
//        대상: ocr_status='pending' and created_at < now() - interval '24 hours'
//        역할: 업로드 토큰만 받고 분석에 도달하지 못한 고아 파일을 빨리 치운다
//              (`upload-url.js` 하단 주석 「실패해도 남는 것: pending 고아 행」).
//
//   **둘은 서로를 대체하지 않는다.** A는 "정상 보관 중인 분석 완료분"이 만기에
//   도달했을 때, B는 "애초에 분석되지 않은 잔존물"을 대상으로 한다. 조건이 겹치는
//   유일한 구간은 `90일이 지나도록 pending으로 남은 행`인데, 이 함수는 A를 먼저
//   돌고 A가 `deleted_at`을 찍으므로 B의 조회(`deleted_at is null` 포함)에서 그 행이
//   자동으로 빠진다 — 같은 행을 두 번 지우려는 시도는 발생하지 않는다.
//
// ── 왜 cron이 필요한가 (허위 고지 방지)
//   외부 앱은 비전 응답 직후 원본을 즉시 지웠고(`analyze-assessment-storage.js:23-32`,
//   `:120`) 이 저장소 `vercel.json`에는 `crons` 키가 0건이었다(§8.8 실측). 즉 90일
//   정책을 지탱할 실행 수단이 없었다. §11-~~Q52~~(즉시 삭제 개정안)가 부결되어 90일이
//   정본으로 유지됐으므로, 정책을 낮추는 대신 이 파일 + Vercel Cron으로 인프라를
//   채운다. 삭제 권한은 오직 여기에만 있다 — `analyze-guide.js`는 실패 경로에서도
//   원본을 건드리지 않는다(그 파일 `markAttachmentsFailed` 주석).
//
// ── 인증 (Vercel 공식 방식)
//   이 저장소에 기존 cron이 없어 관례가 없으므로 Vercel 문서의 CRON_SECRET 방식을
//   그대로 따른다(https://vercel.com/docs/cron-jobs/manage-cron-jobs). `CRON_SECRET`이
//   프로젝트 환경변수에 있으면 Vercel이 cron 호출에 `Authorization: Bearer <값>`을
//   자동으로 실어 보낸다. 여기서는 그 헤더가 일치할 때만 통과시킨다.
//
//   **fail-closed다.** `CRON_SECRET`이 비어 있으면 통과가 아니라 401이다 — 환경변수를
//   빠뜨린 배포에서 이 엔드포인트가 무인증 공개 삭제 API가 되는 것이 최악의 결과다.
//   (외부 앱 `analyze-assessment-storage.js`가 세션 하나로 임의 경로를 지울 수 있었던
//    §8.8 BLOCK과 같은 계열의 사고를 여기서 되풀이하지 않는다.)
//   비교는 길이 노출을 줄이려고 `timingSafeEqual`로 한다.
//
// ── 경로는 DB가 정본이다 (§8.8 BLOCK)
//   삭제 대상 경로는 전부 `performance_attachments.storage_path`에서 읽는다. 요청 본문·
//   쿼리에서 온 문자열이 Storage 호출에 들어가는 지점이 한 곳도 없다. 이 엔드포인트가
//   받는 유일한 입력은 `limit`(정수, 상한 clamp)뿐이다.
//
// ── 배치 처리 (타임아웃 방어)
//   대상이 수천 건일 수 있는데 한 번에 다 돌면 `maxDuration`(Hobby 상한 60초)에 걸려
//   **아무것도 커밋되지 않은 채** 죽는다. 그래서 스윕마다 상한 `DEFAULT_BATCH`건만
//   처리하고, 남은 건은 그대로 두어 다음 실행이 이어받는다(조회 정렬이 `created_at`
//   오름차순이라 오래된 것부터 확정적으로 줄어든다). 응답의 `hasMore`가 true면
//   "이번 실행으로 다 못 끝냈다"는 뜻이다 — 계속 true면 배치 상한이나 주기를 올려야
//   한다는 신호다. (`admin-embed.js`의 backfill이 반복 호출을 전제로 하는 것과 같은 관례.)
//
// ── 스케줄과 플랜 제약 (vercel.json은 주석을 못 다는 JSON이라 여기 적는다)
//   등록: `vercel.json` `crons[0]` = { path: '/api/performance/cleanup-attachments',
//   schedule: '0 18 * * *' }. 이 저장소의 `crons` 키는 이 커밋 이전까지 **0건**이었다
//   (§8.8 실측 그대로) — 이 프로젝트가 Vercel Cron을 쓰는 첫 사례다.
//
//   Vercel cron 표현식은 **UTC 기준**이다. `0 18 * * *` = UTC 18:00 = KST 03:00로,
//   국내 사용자 트래픽이 가장 적은 시간대에 만기분을 턴다.
//
//   플랜 제약 (확인함 — https://vercel.com/docs/cron-jobs/usage-and-pricing, 2026-07-15판)
//     Hobby      : 프로젝트당 100개 / **최소 간격 1일** / 정밀도 시간 단위(±59분)
//     Pro·Enterprise : 프로젝트당 100개 / 최소 간격 1분 / 정밀도 분 단위
//   → 요구된 **일 1회는 Hobby를 포함한 모든 플랜에서 가능**하다. 다만 Hobby에서는
//     실제 실행이 18:00~18:59 UTC 사이 아무 때나 일어난다(문서 명시). 90일 만기에
//     ±1시간 오차는 무의미하므로 그대로 둔다. 하루 2회 이상으로 올리려면 Pro가
//     필요하고, Hobby에서 `0 */12 * * *` 같은 표현식을 쓰면 **배포 자체가 실패한다.**
//   ⚠️ cron은 **production 배포에서만** 활성화된다(preview에서는 돌지 않는다).
//
// ── 실패를 조용히 넘기지 않는다
//   Storage remove가 실패한 행은 `deleted_at`을 **찍지 않는다.** 파일이 남아 있는데
//   장부에만 삭제로 적히면 `sql/54_performance_app.sql`이 경고한 "기록과 실제 상태가
//   어긋난" 상태가 되고, 그 행은 영영 재시도 대상에서 빠진다. 실패는 그대로 로그
//   (`console.error`)에 남기고 카운트에 실어 다음 실행이 다시 집는다.
//
// ── 실패분이 배치를 막지 않게 한다 (head-of-line blocking)
//   위 규율만으로는 **영구적 이유로 계속 실패하는 묶음이 큐 앞자리를 영원히 점유**한다.
//   조회가 `created_at` 오름차순 + `limit(batch+1)`이므로, 오래된 100건(REMOVE_CHUNK)이
//   경로 손상·버킷 정책 변경 같은 이유로 매번 실패하면 그 뒤의 만기분은 배치 상한 안에
//   절대 들어오지 못한다 — 90일 삭제 약속이 조용히 멈추는데 `hasMore`는 계속 true라
//   정상 적체와 구분도 되지 않는다.
//   → `performance_attachments.cleanup_attempts` / `cleanup_last_error_at`(sql/55 (2))로
//     실패 횟수를 세고, 조회에서 `cleanup_attempts < MAX_CLEANUP_ATTEMPTS`인 행만 집는다.
//     임계를 넘긴 행은 배치에서 빠지되 **사라지지 않는다** — 매 실행 응답의 `stuck`으로
//     건수를 노출해 운영이 알아채고 손으로 조사하게 한다(로그에도 남긴다).
//     backoff가 아니라 상한을 쓰는 이유: cron이 하루 1회라 실행 간격 자체가 이미 24시간
//     backoff다. 여기에 시간 조건을 더 얹으면 재시도가 며칠씩 늦어지기만 한다.

import { defineHandler } from "../_lib/handler.js";
import type { createSupabaseAdmin } from "../_lib/supabaseAdmin.js";
import { BUCKET } from "../_routes/performance/upload-url.js";

/** §8.8 「보관 기간 — 90일」 */
const RETENTION_DAYS = 90;

/** §8.8 「잔존물 청소 — 24시간 TTL」 */
const ORPHAN_TTL_HOURS = 24;

// 스윕 1회당 처리 상한. 60초 안에 (조회 1 + remove N/100 + update N/100)을 끝내야 한다.
// Storage remove는 왕복 1회당 수백ms라 200건 ≈ remove 2회 + update 2회 수준이다.
const DEFAULT_BATCH = 200;
const MAX_BATCH = 500;

// Storage `remove()` 한 번에 넘길 경로 수. 배열 하나가 지나치게 길면 storage-api 쪽에서
// 요청이 거절될 수 있어 잘라서 보낸다.
const REMOVE_CHUNK = 100;

// DB `.in()` 한 번에 넘길 id 수. URL 길이 한계(PostgREST는 쿼리스트링으로 나간다)를 피한다.
const UPDATE_CHUNK = 100;

// 이 횟수만큼 실패한 행은 배치 대상에서 제외한다(파일 상단 「head-of-line blocking」).
// 5회 = cron 일 1회 기준 닷새 연속 실패다. 일시적 장애(스토리지 순단 등)는 그 안에
// 반드시 풀리므로, 5회를 넘겼다는 것은 사람이 봐야 하는 상태라는 뜻이다.
const MAX_CLEANUP_ATTEMPTS = 5;

type AttachmentRow = {
  id: string;
  storage_path: string | null;
  cleanup_attempts: number | null;
};

function clampBatch(raw: unknown) {
  const value = Number.parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_BATCH;
  return Math.min(value, MAX_BATCH);
}

function chunk<T>(list: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * 한 스윕의 공통 실행부 — 조회 → Storage 삭제 → 장부 기록.
 *
 * 두 스윕은 **조회 조건과 마감 상태만 다르고** 그 뒤 절차가 완전히 같아서 여기로 모은다.
 * 조건을 짜는 쪽(`applyFilter`)을 호출부가 넘기므로, 이 함수가 조건을 임의로 넓히거나
 * 좁힐 여지는 없다.
 *
 * @param supabaseAdmin service_role 클라이언트
 * @param spec.name 로그용 스윕 이름
 * @param spec.applyFilter 대상 조건을 얹는다. supabase-js 쿼리빌더 체인 타입이 필터
 *   단계마다 달라져 정확한 타입을 적으면 오히려 좁아지므로 any로 통과시킨다.
 * @param spec.batch 이번 실행 처리 상한
 * @param spec.extraPatch 마감 시 함께 쓸 컬럼(예: ocr_status)
 */
async function runSweep(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  {
    name,
    applyFilter,
    batch,
    extraPatch = {},
  }: {
    name: string;
    // biome-ignore lint/suspicious/noExplicitAny: supabase-js 쿼리빌더 체인 타입
    applyFilter: (query: any) => any;
    batch: number;
    extraPatch?: Record<string, unknown>;
  },
) {
  // 필터를 먼저 다 얹고 나서 order/limit을 붙인다. supabase-js에서 `.order()`·`.limit()`은
  // TransformBuilder를 돌려주므로, 그 뒤에 비교 필터를 이어 붙이면 타입 계약을 벗어난다.
  const filtered = applyFilter(
    supabaseAdmin
      .from("performance_attachments")
      .select("id,storage_path,cleanup_attempts")
      // 이미 지운 행은 두 스윕 모두에서 제외한다. `deleted_at`이 A·B의 공통
      // 멱등 표식이라 재실행해도 같은 행을 다시 집지 않는다.
      .is("deleted_at", null)
      // 계속 실패하는 행이 배치 앞자리를 영원히 점유하지 못하게 한다(파일 상단
      // 「head-of-line blocking」). 제외된 행은 아래 `countStuck`이 세어 보고한다.
      .lt("cleanup_attempts", MAX_CLEANUP_ATTEMPTS),
  );

  const { data, error } = await filtered
    // 오래된 것부터. 반복 실행으로 큐가 확정적으로 줄어든다.
    .order("created_at", { ascending: true })
    // batch + 1건을 떠서 "다음 실행에 남은 게 있는지"를 추가 count 쿼리 없이 판정한다.
    .limit(batch + 1);
  if (error) throw new Error(`${name} 대상 조회 실패: ${error.message}`);

  const found: AttachmentRow[] = data || [];
  const hasMore = found.length > batch;
  const rows = hasMore ? found.slice(0, batch) : found;

  const result = { scanned: rows.length, deleted: 0, removeFailed: 0, hasMore };
  if (!rows.length) return result;

  // 재시도 카운터를 올릴 때 쓸 현재값. supabase-js에는 원자적 증가가 없어 조회값 +1로
  // 쓴다 — 이 잡은 cron 단독 실행이라 경합이 없고, 값이 한 번 어긋나도 상한 판정이
  // 하루 늦어질 뿐이다(정확한 회계가 아니라 배치 보호가 목적이다).
  const attemptsById = new Map(
    rows.map((row) => [row.id, Number(row.cleanup_attempts) || 0]),
  );

  // ── ① Storage 원본 삭제
  //    `storage_path`가 이미 null인 행(업로드 토큰만 받고 서명 실패 등으로 경로를 잃은
  //    잔존 행)은 지울 객체가 없다 — 장부만 닫으면 된다.
  const withPath = rows.filter((row) => row.storage_path);
  const pathless = rows.filter((row) => !row.storage_path);

  const closable: string[] = [...pathless.map((row) => row.id)];

  for (const group of chunk(withPath, REMOVE_CHUNK)) {
    const paths = group.map((row) => row.storage_path as string);
    const { error: removeError } = await supabaseAdmin.storage
      .from(BUCKET)
      .remove(paths);

    if (removeError) {
      // 실패한 묶음은 `deleted_at`을 찍지 않는다 — 파일이 살아 있는데 장부만 닫으면
      // 그 행은 다음 실행의 대상에서 빠져 영구 잔존물이 된다. 대신 재시도 카운터를
      // 올려 이 묶음이 다음 배치의 앞자리를 계속 점유하지 못하게 한다.
      result.removeFailed += group.length;
      await bumpCleanupAttempts(
        supabaseAdmin,
        name,
        group.map((row) => row.id),
        attemptsById,
      );
      console.error(
        `performance/cleanup-attachments[${name}] Storage 원본 삭제 실패 (${group.length}건, 다음 실행에서 재시도):`,
        removeError,
      );
      continue;
    }

    // remove()는 이미 없는 객체를 에러로 보지 않는다(반환 목록에서 빠질 뿐). 파일이
    // 사라진 것이 목표이므로 그 경우도 성공으로 닫는다.
    closable.push(...group.map((row) => row.id));
  }

  if (!closable.length) return result;

  // ── ② 장부 기록: 실제 삭제 시각 + 경로 무효화
  //    `storage_path`를 null로 되돌리는 것은 §8.3이 이 컬럼을 nullable로 둔 이유
  //    그대로다("cron이 원본을 지우고 나면 무효 포인터가 되므로"). `analyze-guide.js`가
  //    `deleted_at || !storage_path`를 404 ATTACHMENT_GONE로 처리하므로 둘 중 어느 쪽만
  //    봐도 같은 결론이 나온다.
  const deletedAt = new Date().toISOString();

  for (const ids of chunk(closable, UPDATE_CHUNK)) {
    const { error: updateError } = await supabaseAdmin
      .from("performance_attachments")
      .update({ deleted_at: deletedAt, storage_path: null, ...extraPatch })
      .in("id", ids);

    if (updateError) {
      // 파일은 지웠는데 장부를 못 닫은 경우다. 다음 실행이 같은 행을 다시 집지만
      // remove()가 없는 객체에 대해 성공하므로 결국 수렴한다. 조용히 넘기지 않는다.
      // (수렴하지 못하는 종류의 실패라면 카운터가 임계에 닿아 배치에서 빠진다.)
      result.removeFailed += ids.length;
      await bumpCleanupAttempts(supabaseAdmin, name, ids, attemptsById);
      console.error(
        `performance/cleanup-attachments[${name}] deleted_at 기록 실패 (${ids.length}건, 원본은 이미 삭제됨):`,
        updateError,
      );
      continue;
    }

    result.deleted += ids.length;
  }

  return result;
}

/**
 * 정리에 실패한 행들의 `cleanup_attempts`를 +1 하고 `cleanup_last_error_at`을 찍는다.
 *
 * 같은 현재값끼리 묶어 `.in()` 한 번으로 쓴다 — 원자적 증가(`col = col + 1`)를
 * supabase-js가 지원하지 않아 조회값 기반으로 올린다(호출부 주석 참고).
 * **이 갱신이 실패해도 스윕 결과를 바꾸지 않는다** — 이미 실패로 집계된 건이고,
 * 카운터가 안 올라가면 다음 실행이 같은 행을 다시 집을 뿐이다(현행 동작과 동일).
 */
async function bumpCleanupAttempts(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
  name: string,
  ids: string[],
  attemptsById: Map<string, number>,
) {
  if (!ids.length) return;

  const byValue = new Map<number, string[]>();
  for (const id of ids) {
    const next = (attemptsById.get(id) ?? 0) + 1;
    if (!byValue.has(next)) byValue.set(next, []);
    byValue.get(next)?.push(id);
  }

  const erroredAt = new Date().toISOString();

  for (const [attempts, group] of byValue) {
    for (const chunkIds of chunk(group, UPDATE_CHUNK)) {
      const { error } = await supabaseAdmin
        .from("performance_attachments")
        .update({
          cleanup_attempts: attempts,
          cleanup_last_error_at: erroredAt,
        })
        .in("id", chunkIds);

      if (error) {
        console.error(
          `performance/cleanup-attachments[${name}] 재시도 카운터 갱신 실패 (${chunkIds.length}건):`,
          error,
        );
      }
    }
  }
}

/**
 * 임계를 넘겨 배치에서 제외된 행 수. **`hasMore`(정상 적체)와 구분하려고** 따로 센다 —
 * 이 값이 0이 아니면 90일 삭제가 그 건수만큼 멈춰 있다는 뜻이고, 자동으로는 풀리지
 * 않으므로 사람이 원인(경로 손상·버킷 정책 등)을 봐야 한다.
 */
async function countStuck(
  supabaseAdmin: ReturnType<typeof createSupabaseAdmin>,
) {
  const { count, error } = await supabaseAdmin
    .from("performance_attachments")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .gte("cleanup_attempts", MAX_CLEANUP_ATTEMPTS);

  if (error) {
    console.error("performance/cleanup-attachments stuck 집계 실패:", error);
    return null;
  }

  return count ?? 0;
}

export default defineHandler({
  // Vercel Cron은 GET으로 호출한다. POST는 운영자가 `vercel crons run` 대신 손으로
  // 두드릴 때를 위한 것이며 인증은 동일하다.
  methods: ["GET", "POST"],
  auth: "cron",
  errorShape: "coded",
  methodNotAllowedMessage: "GET만 허용됩니다.",
  methodNotAllowedCode: "METHOD_NOT_ALLOWED",
  unhandledMessage: "첨부 정리에 실패했습니다.",
  unhandledCode: "INTERNAL",
  logLabel: "performance/cleanup-attachments",
  handler: async (req, res, ctx) => {
    const batch = clampBatch(req.query?.limit);
    const supabaseAdmin = ctx.supabaseAdmin;
    const now = Date.now();

    // ── A. 90일 보관 정책 집행 (§8.8 「결정 (cron 인프라 신설)」)
    //    deleted_at is null and created_at < now() - interval '90 days'
    const retentionCutoff = new Date(
      now - RETENTION_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const retention = await runSweep(supabaseAdmin, {
      name: "retention-90d",
      batch,
      applyFilter: (query) => query.lt("created_at", retentionCutoff),
      // 상태는 건드리지 않는다. 만기 삭제는 분석 결과(`ocr_status`/`ocr_text`)를
      // 부정하는 사건이 아니라 **원본 보관 기한**이 끝났다는 뜻이다.
    });

    // ── B. 24시간 TTL 스윕 (§8.8 「잔존물 청소(별개)」)
    //    ocr_status='pending' and created_at < now() - interval '24 hours'
    //    A가 먼저 돌며 90일 넘은 pending 행에 이미 deleted_at을 찍었으므로 여기 조회
    //    (`.is('deleted_at', null)`)에서 그 행은 빠진다 — 이중 처리가 없다.
    const orphanCutoff = new Date(
      now - ORPHAN_TTL_HOURS * 60 * 60 * 1000,
    ).toISOString();
    const orphan = await runSweep(supabaseAdmin, {
      name: "orphan-24h",
      batch,
      applyFilter: (query) =>
        query.eq("ocr_status", "pending").lt("created_at", orphanCutoff),
      // 원본이 사라진 뒤에도 `pending`(=「업로드만 됨(파일 존재)」, sql/54 컬럼 주석)으로
      // 남으면 상태와 실제가 어긋난다. 분석에 도달하지 못한 채 종료된 것이므로 failed로
      // 닫는다(check 제약이 허용하는 세 값 중 이 상황에 맞는 유일한 종료 상태다).
      extraPatch: { ocr_status: "failed" },
    });

    // 임계를 넘겨 배치에서 빠진 건수. 이번 실행의 실패 카운터 갱신까지 반영해야
    // 하므로 두 스윕이 끝난 **뒤에** 센다.
    const stuck = await countStuck(supabaseAdmin);

    if (stuck) {
      console.error(
        `performance/cleanup-attachments: ${stuck}건이 ${MAX_CLEANUP_ATTEMPTS}회 이상 실패해 ` +
          "배치 대상에서 제외됐습니다. 자동으로 풀리지 않습니다 — 원본 경로/버킷 정책을 확인할 것.",
      );
    }

    const failed = retention.removeFailed + orphan.removeFailed;

    if (failed > 0) {
      // 90일 약속을 못 지킨 건이 있다는 뜻이다. 상위 요약을 한 줄 더 남겨 로그 검색에
      // 걸리게 한다(개별 실패는 runSweep이 이미 찍었다).
      console.error(
        `performance/cleanup-attachments: ${failed}건을 정리하지 못했습니다 ` +
          `(retention ${retention.removeFailed} / orphan ${orphan.removeFailed}). 다음 실행에서 재시도합니다.`,
      );
    }

    // 부분 실패는 200이다 — 재시도가 이미 설계돼 있어 cron 자체를 실패로 표시할 이유가
    // 없다. 판단 재료는 응답 본문(`ok`/`hasMore`)과 위 로그다.
    res.status(200).json({
      // `stuck`이 있으면 ok가 아니다 — 실패 건이 0이어도 그만큼의 90일 삭제가 멈춰 있다.
      ok: failed === 0 && !stuck,
      ranAt: new Date(now).toISOString(),
      batchLimit: batch,
      stuck,
      maxCleanupAttempts: MAX_CLEANUP_ATTEMPTS,
      retention: {
        ...retention,
        cutoff: retentionCutoff,
        retentionDays: RETENTION_DAYS,
      },
      orphan: { ...orphan, cutoff: orphanCutoff, ttlHours: ORPHAN_TTL_HOURS },
    });
  },
});

// Storage remove + DB update가 배치로 도는 데다 만기가 몰린 날은 상한까지 꽉 찬다.
// 기본 10초로는 잘리므로 Vercel Hobby 상한인 60초를 그대로 쓴다(`admin-embed.js`와 동일).
// 60초로도 모자라면 `?limit=`을 줄이는 게 아니라 **주기를 늘리는 쪽**이 맞다 — 배치를
// 줄이면 한 번에 처리되는 양이 줄어 만기 적체가 오히려 길어진다.
export const config = { runtime: "nodejs", maxDuration: 60 };
