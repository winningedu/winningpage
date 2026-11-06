// 콘솔 읽기 목록 공용 도우미. 범위 안의 행을 끝까지 읽은 뒤 서버에서 이름을 가리고 나눈다.
// Supabase(max_rows 1000)는 한 번에 1000행까지만 주므로 range 로 이어 읽는다.

export const PAGE_SIZE_DEFAULT = 50;
export const PAGE_SIZE_MAX = 50;
const FETCH_CHUNK = 1000;

export interface PageQuery {
  page: number;
  pageSize: number;
}

export interface Paged<T> {
  total: number;
  page: number;
  pageCount: number;
  items: T[];
}

function positiveInt(raw: string | string[] | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  return /^[1-9]\d*$/.test(value) ? Number(value) : Number.NaN;
}

/** page 는 1부터, pageSize 는 기본 50 에 최대 50. 형식이 틀리면 null 이다. */
export function parsePageQuery(query: {
  page?: string | string[];
  pageSize?: string | string[];
}): PageQuery | null {
  const page = positiveInt(query.page);
  const pageSize = positiveInt(query.pageSize);
  if (Number.isNaN(page) || Number.isNaN(pageSize)) return null;
  return {
    page: page ?? 1,
    pageSize: Math.min(pageSize ?? PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX),
  };
}

export function paginate<T>(
  items: T[],
  { page, pageSize }: PageQuery,
): Paged<T> {
  const start = (page - 1) * pageSize;
  return {
    total: items.length,
    page,
    pageCount: Math.ceil(items.length / pageSize),
    items: items.slice(start, start + pageSize),
  };
}

/** range(from, to) 로 한 쪽씩 부르는 함수를 받아 모든 행을 모은다. 한 쪽이라도 실패하면 던진다. */
export async function fetchAllRows<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += FETCH_CHUNK) {
    const { data, error } = await page(from, from + FETCH_CHUNK - 1);
    if (error || !data) throw new Error("console read failed");
    rows.push(...data);
    if (data.length < FETCH_CHUNK) return rows;
  }
}
