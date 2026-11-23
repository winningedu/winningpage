import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import { withDedupedKeys } from "@/lib/reactKeys";
import { supabase } from "@/lib/supabase";
import { formatDate as formatInstantDate } from "@/lib/time/format";

interface CategoryMeta {
  title: string;
  label: string;
  description: string;
}

type AttachmentFile = string | { name?: string; url: string };

// admission_posts 테이블 행. select('*') — 이 화면이 실제로 읽는 필드만 좁혀서 적는다.
// id는 bigint PK다(uuid가 아니다) — database.types.ts admission_posts.Row 참고.
interface AdmissionBoardRow {
  id: number;
  category: string;
  title?: string;
  content?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  image_url?: string | null;
  image_urls?: unknown;
  attachments?: unknown;
  is_pinned?: boolean;
  created_at?: string;
  [key: string]: unknown;
}

const DEFAULT_META: CategoryMeta = {
  title: "게시판",
  label: "게시판",
  description: "",
};

const CATEGORY_META: Record<string, CategoryMeta> = {
  essay: {
    title: "논술정보",
    label: "논술",
    description: "논술 전형 정보와 대학별 논술 가이드를 확인하세요.",
  },
};

function normalizeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value ? [value] : [];
    }
  }

  return [];
}

const PREVIEW_MAX_LENGTH = 120;

function formatDate(value: unknown): string {
  if (!value) return "";
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return formatInstantDate(date);
}

function getContentPreview(value: unknown): string {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  return text.length > PREVIEW_MAX_LENGTH
    ? `${text.slice(0, PREVIEW_MAX_LENGTH)}...`
    : text;
}

function getAttachmentName(file: AttachmentFile | null | undefined): string {
  if (!file) return "첨부파일 다운로드";
  if (typeof file === "string") return "첨부파일 다운로드";
  return file.name || "첨부파일 다운로드";
}

function getAttachmentUrl(file: AttachmentFile | null | undefined): string {
  if (!file) return "";
  return typeof file === "string" ? file : file.url;
}

export default function AdmissionBoard() {
  const params = useParams();
  const location = useLocation();
  const pathCategory = location.pathname.split("/").filter(Boolean)[1];
  const category = params.category || pathCategory;
  const id = params.id;
  const routeMeta = CATEGORY_META[category as string] || DEFAULT_META;

  const [rows, setRows] = useState<AdmissionBoardRow[]>([]);
  const [post, setPost] = useState<AdmissionBoardRow | null>(null);
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();

    if (!q) return rows;

    return rows.filter((row) => {
      const attachmentsText = (
        normalizeArray(row.attachments) as AttachmentFile[]
      )
        .map((file) => (typeof file === "string" ? file : file?.name || ""))
        .join(" ");

      const target =
        `${row.title || ""} ${row.content || ""} ${row.file_name || ""} ${attachmentsText}`.toLowerCase();
      return target.includes(q);
    });
  }, [rows, keyword]);

  useEffect(() => {
    let alive = true;

    async function loadList() {
      setLoading(true);

      let query = supabase
        .from("admission_posts")
        .select("*")
        .eq("is_active", true);

      // category는 라우트가 항상 :category 세그먼트로 채운다(라인 99의
      // routeMeta 조회도 동일하게 `as string`으로 가정) — 값이 없는 경로는
      // 실질적으로 없다.
      query = query.eq("category", category as string);

      const { data, error } = await query
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        console.error("입시정보 조회 실패:", error);
        setRows([]);
      } else {
        setRows(data || []);
      }

      setLoading(false);
    }

    async function loadDetail() {
      setLoading(true);

      const { data, error } = await supabase
        .from("admission_posts")
        .select("*")
        // id는 bigint PK라 URL 파라미터(string)를 숫자로 변환해 비교한다.
        .eq("id", Number(id))
        .eq("is_active", true)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        console.error("입시정보 상세 조회 실패:", error);
        setPost(null);
      } else {
        setPost(data || null);
      }

      setLoading(false);
    }

    if (id) loadDetail();
    else loadList();

    return () => {
      alive = false;
    };
  }, [category, id]);

  if (id) {
    const images = post ? (normalizeArray(post.image_urls) as string[]) : [];
    const attachments = post
      ? (normalizeArray(post.attachments) as AttachmentFile[])
      : [];
    const detailCategory = post?.category || category;
    const detailMeta = CATEGORY_META[detailCategory as string] || DEFAULT_META;
    const detailListPath = `/admission/${detailCategory}`;

    return (
      <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
        <section className="border-b border-[#E8EDF3] bg-[#F8FAFC]">
          <div className="mx-auto max-w-content px-6 py-14">
            <p className="text-sm font-black text-[#B88737]">입시정보</p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">
              {detailMeta.title}
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-[980px] px-6 py-14">
          {loading ? (
            <div className="py-20 text-center text-sm font-bold text-gray-500">
              불러오는 중입니다.
            </div>
          ) : !post ? (
            <div className="py-20 text-center">
              <p className="text-lg font-black">게시글을 찾을 수 없습니다.</p>
              <Link
                to={detailListPath}
                className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-[#0D1B2A] px-6 text-sm font-black text-white"
              >
                목록으로
              </Link>
            </div>
          ) : (
            <>
              <div className="border-b border-[#0D1B2A] pb-7">
                <div className="mb-4 flex items-center gap-2">
                  {post.is_pinned && (
                    <span className="rounded-full bg-[#0D1B2A] px-3 py-1 text-xs font-black text-white">
                      중요
                    </span>
                  )}
                  <span className="text-sm font-bold text-gray-500">
                    {formatDate(post.created_at)}
                  </span>
                </div>

                <h2 className="text-3xl font-black tracking-[-0.04em]">
                  {post.title}
                </h2>
              </div>

              {images.length > 0 ? (
                <div className="mt-10 space-y-0 overflow-hidden rounded-2xl border border-[#E6E9EF] bg-white">
                  {withDedupedKeys(images).map(({ item: url, key }) => (
                    <img
                      key={key}
                      src={url}
                      alt=""
                      className="w-full object-contain"
                    />
                  ))}
                </div>
              ) : post.image_url ? (
                <img
                  src={post.image_url}
                  alt=""
                  className="mt-10 max-h-[520px] w-full rounded-2xl object-cover"
                />
              ) : null}

              <div className="prose prose-lg mt-10 max-w-none whitespace-pre-wrap leading-8 text-[#1F2937]">
                {post.content || ""}
              </div>

              {attachments.length > 0 ? (
                <div className="mt-10 space-y-2">
                  {withDedupedKeys(
                    attachments.filter((file) => getAttachmentUrl(file)),
                    getAttachmentUrl,
                  ).map(({ item: file, key }) => (
                    <a
                      key={key}
                      href={getAttachmentUrl(file)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-12 items-center gap-2 rounded-xl border border-[#B88737]/40 bg-[#FFF8E8] px-5 text-sm font-black text-[#8A5B16]"
                    >
                      <Download size={17} />
                      {getAttachmentName(file)}
                    </a>
                  ))}
                </div>
              ) : post.file_url ? (
                <a
                  href={post.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-10 inline-flex h-12 items-center gap-2 rounded-xl border border-[#B88737]/40 bg-[#FFF8E8] px-5 text-sm font-black text-[#8A5B16]"
                >
                  <Download size={17} />
                  {post.file_name || "첨부파일 다운로드"}
                </a>
              ) : null}

              <div className="mt-14 border-t border-gray-200 pt-8 text-center">
                <Link
                  to={detailListPath}
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-[#0D1B2A] px-8 text-sm font-black text-white"
                >
                  목록으로
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white pt-16 text-[#0D1B2A]">
      <section className="border-b border-[#E8EDF3] bg-[#F8FAFC]">
        <div className="mx-auto max-w-content px-6 py-14">
          <p className="text-sm font-black text-[#B88737]">입시정보</p>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">
            {routeMeta.title}
          </h1>
          <p className="mt-4 text-base font-medium text-gray-500">
            {routeMeta.description}
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-content px-6 py-12">
        <div className="mb-8 flex flex-wrap items-center justify-end gap-4">
          <div className="flex h-11 w-full max-w-[360px] items-center rounded-xl border border-gray-300 bg-white px-4">
            <Search size={17} className="text-gray-400" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder={`${routeMeta.title} 검색`}
              className="ml-2 h-full flex-1 bg-transparent text-sm font-bold outline-hidden"
            />
          </div>
        </div>

        <div className="mb-4 text-sm font-bold text-gray-500">
          전체 <span className="text-[#B88737]">{filteredRows.length}</span>건
        </div>

        <div className="overflow-hidden border-y border-[#D7DEE8]">
          {loading ? (
            <div className="py-20 text-center text-sm font-bold text-gray-500">
              불러오는 중입니다.
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-20 text-center text-sm font-bold text-gray-400">
              등록된 게시글이 없습니다.
            </div>
          ) : (
            filteredRows.map((row) => {
              const attachmentCount =
                normalizeArray(row.attachments).length ||
                (row.file_url ? 1 : 0);

              return (
                <Link
                  key={row.id}
                  to={`/admission/${row.category}/${row.id}`}
                  className="block border-b border-[#EEF2F6] px-2 py-6 transition last:border-b-0 hover:bg-[#F8FAFC]"
                >
                  <div className="flex items-start justify-between gap-5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {row.is_pinned && (
                          <span className="rounded-full bg-[#0D1B2A] px-2.5 py-1 text-xs font-black text-white">
                            중요
                          </span>
                        )}
                        <h2 className="truncate text-xl font-black tracking-[-0.04em]">
                          {row.title}
                        </h2>
                      </div>

                      {row.content && (
                        <p className="mt-3 text-sm font-medium leading-6 text-gray-500">
                          {getContentPreview(row.content)}
                        </p>
                      )}

                      {attachmentCount > 0 && (
                        <p className="mt-3 text-xs font-black text-[#B88737]">
                          첨부파일 {attachmentCount}개
                        </p>
                      )}
                    </div>

                    <div className="shrink-0 text-sm font-bold text-gray-400">
                      {formatDate(row.created_at)}
                    </div>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
