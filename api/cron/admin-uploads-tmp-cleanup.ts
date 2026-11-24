// GET /api/cron/admin-uploads-tmp-cleanup, 관리자 임시 업로드 정리 (매일 04:50 KST)
//
// 임시 버킷(admin-uploads-tmp)에서 24시간 넘게 남은 파일을 지운다(저장하지 않고 닫은 폼이 남긴 것).
// 오래된 순으로 100개씩 읽어 만료분만 storage remove() 로 지운다(storage.objects 행은 직접 지우지 않는다).
// 지우기에 실패한 파일은 남겨 두고 다음 쪽에서 건너뛰어 읽으며, 다음 실행이 다시 집는다.
// 한 번에 지우거나 실패한 수가 1000건에 닿으면 멈춘다(남았으면 hasMore).
//
// 시각: 04:50 KST = 19:50 UTC (vercel.json crons "50 19 * * *").

import { TMP_BUCKET } from "../_lib/admin-uploads/tmp.js";
import { defineHandler } from "../_lib/handler.js";

export const config = { runtime: "nodejs" };

const PAGE_SIZE = 100;
const RUN_CAP = 1000;
const TTL_MS = 24 * 60 * 60 * 1000;

export default defineHandler({
  methods: ["GET"],
  auth: "cron",
  errorShape: "problem",
  unhandledMessage: "임시 업로드 정리 중 오류가 발생했습니다.",
  logLabel: "cron/admin-uploads-tmp-cleanup",
  handler: async (_req, res, ctx) => {
    const bucket = ctx.supabaseAdmin.storage.from(TMP_BUCKET);
    // 만료 기준은 정확히 24시간 초과(24시간은 둔다).
    const cutoff = Date.now() - TTL_MS;

    let scanned = 0;
    let removed = 0;
    let failed = 0;
    let offset = 0;
    let hasMore = false;

    for (;;) {
      const { data, error } = await bucket.list("", {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "created_at", order: "asc" },
      });
      if (error) throw new Error("admin uploads tmp list failed");
      scanned += data.length;

      const folders = data.filter((entry) => entry.id === null).length;
      const files = data.filter((entry) => entry.id !== null);
      const expired: string[] = [];
      let reachedFresh = false;
      for (const file of files) {
        // 생성 시각순이라 처음 안 만료된 파일 뒤는 모두 안 만료다.
        if (file.created_at && Date.parse(file.created_at) < cutoff) {
          expired.push(file.name);
        } else {
          reachedFresh = true;
          break;
        }
      }

      // 지운 파일은 목록에서 빠지지만, 실패한 파일과 폴더는 남아 다음 쪽 시작 위치를 밀어낸다.
      offset += folders;
      if (expired.length > 0) {
        const { error: removeError } = await bucket.remove(expired);
        if (removeError) {
          failed += expired.length;
          offset += expired.length;
          console.error(
            "cron/admin-uploads-tmp-cleanup 삭제 실패 (다음 실행에서 재시도):",
            removeError,
          );
        } else {
          removed += expired.length;
        }
      }

      if (reachedFresh || data.length < PAGE_SIZE) break;
      if (removed + failed >= RUN_CAP) {
        hasMore = true;
        break;
      }
    }

    console.log(
      JSON.stringify({
        job: "admin-uploads-tmp-cleanup",
        scanned,
        removed,
        failed,
      }),
    );
    res.status(200).json({ scanned, removed, failed, hasMore });
  },
});
