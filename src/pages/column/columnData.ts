import { supabase } from "@/lib/supabase";

export const ALL_CATEGORY = "전체";

export type ColumnRow = {
  id: string | number;
  title?: string;
  category?: string;
  content?: string;
  content_json?: unknown;
  image_url?: string;
  image_urls?: unknown;
  view_count?: number;
  is_featured?: boolean;
  published_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

// ColumnRow보다 느슨한 모양 — id를 요구하지 않는다. galleries 행뿐 아니라 어드민 미리보기
// 스냅샷(ColumnBody의 ColumnBodyPost처럼 id가 없을 수도 있는 값)도 그대로 받기 위함이다.
// 아래 순수 판독 함수들은 id를 전혀 쓰지 않으므로 요구할 이유가 없다.
export type ColumnRowLike = {
  id?: string | number;
  title?: string;
  category?: string;
  content?: string;
  content_json?: unknown;
  image_url?: string;
  image_urls?: unknown;
  view_count?: number;
  is_featured?: boolean;
  published_at?: string;
  created_at?: string;
  [key: string]: unknown;
};

/**
 * galleries.image_urls(jsonb/string/array 혼재) → 문자열 배열로 정규화.
 * AS-IS Gallery.jsx normalizeArray 이식.
 */
export function normalizeImageUrls(
  row: ColumnRowLike | null | undefined,
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

export function getThumbnailUrl(row: ColumnRowLike | null | undefined): string {
  return normalizeImageUrls(row)[0] || row?.image_url || "";
}

// 커버 이미지도 동일 로직 — 의미 분리용 별칭.
export function getCoverUrl(row: ColumnRowLike | null | undefined): string {
  return getThumbnailUrl(row);
}

export function getDisplayDate(
  row: ColumnRowLike | null | undefined,
): string | undefined {
  return (row?.published_at as string | undefined) || row?.created_at;
}

export function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

/**
 * view_count 없거나 부재/비정상 값이면 null — 호출부는 null이면 조회수 메타 자체를 숨겨야 함.
 */
export function getViewCount(
  row: ColumnRowLike | null | undefined,
): number | null {
  const num = Number(row?.view_count);
  return Number.isFinite(num) ? num : null;
}

/**
 * category가 categories(column_categories의 활성 label)에 속하지 않으면 '전체' 취급(필터 미노출·뱃지/칩 미렌더 판단은 호출부 몫).
 */
export function getCategoryLabel(
  row: ColumnRowLike | null | undefined,
  categories: string[],
): string {
  const value = row?.category;
  return categories.includes(value as string)
    ? (value as string)
    : ALL_CATEGORY;
}

/**
 * 칩 목록 — 활성 행만 sort_order, label 순. 실패하면 빈 배열(전체 칩만 노출).
 */
export async function fetchColumnCategories(): Promise<string[]> {
  const { data, error } = await supabase
    .from("column_categories")
    .select("label")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    console.error("교육칼럼 카테고리 조회 실패:", error);
    return [];
  }

  return (data || []).map((row) => row.label);
}

/**
 * select('*') 고정 — category/view_count/published_at/is_featured 컬럼이 DB에 없어도
 * 에러 없이 동작해야 함 (스키마 확장 전 fallback 원칙).
 */
export async function fetchActiveColumns(): Promise<ColumnRow[]> {
  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("교육칼럼 조회 실패:", error);
    return [];
  }

  return (data || []) as ColumnRow[];
}

export async function fetchColumnById(
  id: string | number | undefined,
): Promise<ColumnRow | null> {
  if (id === undefined) return null;

  const { data, error } = await supabase
    .from("galleries")
    .select("*")
    // galleries.id는 uuid(string)다 — 호출부가 라우트 파라미터 등에서 number를
    // 넘기는 경우를 대비해 문자열로 맞춘다.
    .eq("id", String(id))
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error("교육칼럼 상세 조회 실패:", error);
    return null;
  }

  return (data as ColumnRow) || null;
}

/**
 * is_featured===true 인 것을 getDisplayDate desc로 최대 4건 뽑고,
 * 부족하면(또는 전부 false/컬럼 부재) 최신순으로 채워 총 4건을 반환.
 */
export function pickFeaturedColumns(rows: ColumnRow[]): ColumnRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      new Date(getDisplayDate(b) || 0).getTime() -
      new Date(getDisplayDate(a) || 0).getTime(),
  );

  const featured = sorted
    .filter((row) => row?.is_featured === true)
    .slice(0, 4);

  if (featured.length >= 4) return featured;

  const featuredIds = new Set(featured.map((row) => row.id));
  const rest = sorted.filter((row) => !featuredIds.has(row.id));

  return [...featured, ...rest].slice(0, 4);
}
