// 위닝에듀(W)·스쿨멘토(S) prod DB의 마이그레이션 적용 상태가 같은지 검사한다.
//
// 왜 — 같은 repo의 마이그레이션을 두 Supabase 프로젝트에 각각 다른 워크플로
// (db-push-prod.yml / db-push-prod-schoolmentor.yml)가 적용한다. 한쪽만 실패하면
// 스키마 버전이 어긋나는데, S는 비공개라 아무도 접속하지 않아 몇 주간 모를 수
// 있다(2026-08-21 repair 마킹 사고처럼 "적용된 줄 알았는데 안 된" 유형). 매일 한
// 번 두 DB의 supabase_migrations.schema_migrations 버전 집합을 비교해 차이가
// 있으면 non-zero 로 끝낸다(scheduled.yml 이 Issue 로 알린다).
//
// 접속 — Management API `POST /v1/projects/{ref}/database/query` (SELECT 만).
// DB 비밀번호가 필요 없고 CI 에 이미 있는 SUPABASE_ACCESS_TOKEN 만 쓴다.
//
// env:
//   SUPABASE_ACCESS_TOKEN      필수
//   WINNING_PROJECT_REF        기본 ykrpjcsubmbenfcnwlzd (db-push-prod.yml 과 동일)
//   SCHOOLMENTOR_PROJECT_REF   필수 — 비어 있으면 검사할 대상이 없으므로 "건너뜀"으로
//                              정상 종료한다(S 프로젝트 생성 전 상태와 구분하기 위해
//                              로그에 남긴다).
//
// 사용:
//   node scripts/check-schema-parity.mjs

const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const W_REF = process.env.WINNING_PROJECT_REF || "ykrpjcsubmbenfcnwlzd";
const S_REF = process.env.SCHOOLMENTOR_PROJECT_REF;

if (!ACCESS_TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN 이 없습니다.");
  process.exit(2);
}

if (!S_REF) {
  console.log(
    "SCHOOLMENTOR_PROJECT_REF 미설정 — 스쿨멘토 프로젝트가 아직 없는 것으로 보고 검사를 건너뜁니다.",
  );
  process.exit(0);
}

const QUERY =
  "select version from supabase_migrations.schema_migrations order by version";

/**
 * @param {string} ref
 * @returns {Promise<string[]>}
 */
async function fetchVersions(ref) {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY }),
    },
  );
  if (!res.ok) {
    throw new Error(`${ref}: HTTP ${res.status} ${await res.text()}`);
  }
  const rows = /** @type {{ version: string }[]} */ (await res.json());
  return rows.map((r) => String(r.version));
}

const [w, s] = await Promise.all([fetchVersions(W_REF), fetchVersions(S_REF)]);
const wSet = new Set(w);
const sSet = new Set(s);
const onlyW = w.filter((v) => !sSet.has(v));
const onlyS = s.filter((v) => !wSet.has(v));

console.log(`W(${W_REF}): ${w.length}개, 최신 ${w.at(-1) ?? "-"}`);
console.log(`S(${S_REF}): ${s.length}개, 최신 ${s.at(-1) ?? "-"}`);

if (onlyW.length === 0 && onlyS.length === 0) {
  console.log("일치 — 두 prod DB 의 마이그레이션 버전 집합이 같습니다.");
  process.exit(0);
}

if (onlyW.length) console.error(`W 에만 있음: ${onlyW.join(", ")}`);
if (onlyS.length) console.error(`S 에만 있음: ${onlyS.join(", ")}`);
console.error(
  "불일치 — db-push-prod / db-push-prod-schoolmentor 실행 이력을 확인하고, 실패한 쪽을 workflow_dispatch 로 다시 돌리십시오.",
);
process.exit(1);
