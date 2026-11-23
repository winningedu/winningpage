import { supabase } from "@/lib/supabase";
import { formatDate as formatInstantDate } from "@/lib/time/format";

export type CaseCategory = "susi" | "jungsi";

// admission_posts 테이블 행. select('*') 고정이라 스키마 확장(content_json 등)에도
// 조회 자체는 깨지지 않으므로, 화면이 실제로 읽는 필드만 좁혀서 적는다.
// id는 bigint PK다(uuid가 아니다) — database.types.ts admission_posts.Row 참고.
export interface AdmissionPostRow {
  id: number;
  category: CaseCategory | string;
  image_urls?: unknown;
  image_url?: string | null;
  [key: string]: unknown;
}

interface HeroScopeConfig {
  ratesTable: string;
  heroLabel: string;
}

export const CATEGORY_LABELS: Record<CaseCategory, string> = {
  susi: "수시",
  jungsi: "정시",
};

export const CASE_CATEGORIES: CaseCategory[] = ["susi", "jungsi"];

/**
 * 히어로 scope — 코드는 공용, 데이터는 **테이블 자체가 다르다**.
 * 대학 로고 스트립(admission_case_logos)은 scope와 무관하게 두 페이지가 공유한다
 * (시안 실측 결과 로고 12종·1행 7개/2행 5개 배치가 완전히 동일).
 */
// 기본 scope 설정 — Record 인덱스 접근으로 되짚으면 undefined 가능 타입이 되므로
// 폴백용으로 별도 상수를 먼저 만들어 둔다(DEFAULT_HERO_SCOPE_CONFIG 참고).
// 합격률 폴백 수치는 두지 않는다(QA 시트 2026-08-21 확정) — 하드코딩 폴백이
// 특목고 페이지에 수시정시와 동일한 가짜 수치를 노출시킨 원인이었다. 숫자는
// 각 scope의 DB 테이블 값만 신뢰하고, 없으면 아예 렌더하지 않는다.
const DEFAULT_HERO_SCOPE_ENTRY: HeroScopeConfig = {
  ratesTable: "admission_acceptance_rates",
  heroLabel: "목표 대학 합격률",
};

export const HERO_SCOPES: Record<string, HeroScopeConfig> = {
  "susi-jungsi": DEFAULT_HERO_SCOPE_ENTRY,
  "special-highschool": {
    ratesTable: "special_highschool_acceptance_rates",
    heroLabel: "목표 특목고 합격률",
  },
};

export const DEFAULT_HERO_SCOPE = "susi-jungsi";
export const DEFAULT_HERO_SCOPE_CONFIG: HeroScopeConfig =
  DEFAULT_HERO_SCOPE_ENTRY;

/**
 * admission_posts.image_urls(jsonb/string/array 혼재) → 문자열 배열로 정규화.
 * columnData.js normalizeImageUrls 이식.
 */
// row 파라미터는 Pick<AdmissionPostRow,...>(전부 optional인 "약한 타입")
// 대신 인덱스 시그니처로 둔다 — 이 함수는 admission_posts 외에 다른 화면
// (다른 배치가 소유한 row 타입, 예: AdmissionCaseCard의 AdmissionCaseRow)의
// 조회 결과도 그대로 받는다. 전부 optional인 타입끼리는 구조적으로 호환
// 되더라도 TS의 weak-type 검사가 "공통 속성 없음"(TS2559)으로 오판하는데,
// 인덱스 시그니처 타입은 그 검사 대상에서 제외된다.
export function normalizeImageUrls(
  row: Record<string, unknown> | null | undefined,
): string[] {
  const value = row?.image_urls;
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : value ? [value] : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

export function getThumbnailUrl(
  row: Record<string, unknown> | null | undefined,
): string {
  return normalizeImageUrls(row)[0] || (row?.image_url as string) || "";
}

export function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return formatInstantDate(date);
}

/**
 * select('*') 고정 — 운영 DB에 content_json 컬럼이 아직 없어도(38번 SQL 미적용 상태)
 * 에러 없이 동작해야 함 (스키마 확장 전 fallback 원칙, columnData.js와 동일 원칙).
 */
export async function fetchAdmissionCases(
  category: string,
): Promise<AdmissionPostRow[]> {
  const { data, error } = await supabase
    .from("admission_posts")
    .select("*")
    .eq("is_active", true)
    .eq("category", category)
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("합격사례 조회 실패:", error);
    return [];
  }

  return data || [];
}

/**
 * QA 시트(입시정보 카테고리) 반영 — 수시/정시 구분 탭을 숨기고 목록을 통합 노출한다.
 * select 필터만 category 단건 → CASE_CATEGORIES 전체로 넓힌 것 외에는 fetchAdmissionCases와
 * 동일한 정렬 규약(고정 → 순서 → 최신순)을 쓴다.
 */
export async function fetchAllAdmissionCases(): Promise<AdmissionPostRow[]> {
  const { data, error } = await supabase
    .from("admission_posts")
    .select("*")
    .eq("is_active", true)
    .in("category", CASE_CATEGORIES)
    .order("is_pinned", { ascending: false })
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("합격사례 통합 조회 실패:", error);
    return [];
  }

  return data || [];
}

export async function fetchAdmissionCaseById(
  id: string,
): Promise<AdmissionPostRow | null> {
  const { data, error } = await supabase
    .from("admission_posts")
    .select("*")
    // id는 bigint PK라 라우트 파라미터(string)를 숫자로 변환해 비교한다.
    .eq("id", Number(id))
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("합격사례 상세 조회 실패:", error);
    return null;
  }

  return data || null;
}

/**
 * 노출 중인 연도별 합격률. 폴백 수치 없음 — 테이블 미생성/조회 실패면 빈 배열을
 * 반환하고, 호출부(AcceptanceRateHero)는 숫자 블록 자체를 렌더하지 않는다.
 * 정상 응답이면 활성 행이 0건이어도(어드민이 전부 비활성화한 상태) 마찬가지로
 * 빈 배열이 그대로 온다 — "조회 실패"와 "의도적으로 0건"을 호출부가 구분할
 * 필요가 없어졌으므로 반환값 형태를 굳이 나누지 않는다.
 * select('*') 고정 — 마이그레이션 미적용 환경에서도 죽지 않게 하는 규약(fetchAdmissionCases와 동일).
 * @returns {Promise<Array<{ year: number, rate: number }>>}
 */
export async function fetchAcceptanceRates(
  scope: string = DEFAULT_HERO_SCOPE,
): Promise<{ year: number; rate: number }[]> {
  const scopeConfig = HERO_SCOPES[scope] || DEFAULT_HERO_SCOPE_CONFIG;
  // ratesTable은 HERO_SCOPES에 등록된 두 테이블(admission_acceptance_rates /
  // special_highschool_acceptance_rates, 컬럼 구성이 동일하다) 중 하나로만
  // 채워진다. 생성 타입 관점에서는 임의 문자열이라 .from()에 그대로 넘기면
  // 전체 테이블의 합집합으로 추론되어 타입 계산이 무한히 깊어진다(TS2589) —
  // 실제 후보 두 테이블로 좁혀 넘긴다.
  const { data, error } = await supabase
    .from(
      scopeConfig.ratesTable as
        | "admission_acceptance_rates"
        | "special_highschool_acceptance_rates",
    )
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("year", { ascending: true });

  if (error) {
    // 폴백 수치 없음 — 조회 실패 시 숫자 블록을 렌더하지 않는 것이 정본이다.
    console.error("연도별 합격률 조회 실패:", error);
    return [];
  }

  return data || [];
}

/**
 * 히어로 대학 로고 스트립. 폴백 로고 없음 — 테이블 미생성/조회 실패면 null을
 * 반환하고, 호출부(AcceptanceRateHero)는 초기 빈 상태를 그대로 유지해 로고
 * 스트립을 렌더하지 않는다. 정상 응답이면 활성 행이 0건이어도(어드민이 전부
 * 비활성화한 상태) 빈 배열을 그대로 반환해 호출부가 로고 스트립 자체를
 * 숨길 수 있게 한다.
 * @returns {Promise<Array<{ id: string, name: string, logo_url: string,
 *   display_height_rem: number, opacity: number, sort_order: number }> | null>}
 */
export interface AdmissionCaseLogoRow {
  id: string;
  name: string;
  logo_url: string;
  display_height_rem: number | null;
  opacity: number | null;
  sort_order: number | null;
  row_no?: number;
}

export async function fetchAdmissionCaseLogos(): Promise<
  AdmissionCaseLogoRow[] | null
> {
  const { data, error } = await supabase
    .from("admission_case_logos")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("합격 대학 로고 조회 실패:", error);
    return null;
  }

  return data || [];
}

/**
 * 합격률 평균(소수 첫째 자리 반올림). 어드민 요약값과 동일한 계산.
 * @param {Array<{ rate: number | string }>} rates
 * @returns {number}
 */
export function computeAcceptanceAverage(
  rates: { rate: number | string }[] | null | undefined,
): number {
  const list = (rates || []).filter((row) =>
    Number.isFinite(Number(row?.rate)),
  );
  if (list.length === 0) return 0;
  const sum = list.reduce((acc, row) => acc + Number(row.rate), 0);
  return Math.round((sum / list.length) * 10) / 10;
}
