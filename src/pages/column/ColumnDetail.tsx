import { ChevronRight, ExternalLink, Link as LinkIcon, Share2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import ColumnBody, { hasBlockContent } from "@/components/column/ColumnBody";
import ColumnCard from "@/components/column/ColumnCard";
import { withDedupedKeys } from "@/lib/reactKeys";
import {
  ALL_CATEGORY,
  type ColumnRow,
  fetchActiveColumns,
  fetchColumnById,
  getCategoryLabel,
  getCoverUrl,
  normalizeImageUrls,
} from "./columnData";

const RELATED_PAGE_SIZE = 4;

export default function ColumnDetail() {
  const { id } = useParams();
  const [post, setPost] = useState<ColumnRow | null>(null);
  const [relatedPool, setRelatedPool] = useState<ColumnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharePopoverOpen, setSharePopoverOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [relatedStart, setRelatedStart] = useState(0);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setSharePopoverOpen(false);
      setCopied(false);
      setRelatedStart(0);

      const [detail, allRows] = await Promise.all([
        fetchColumnById(id),
        fetchActiveColumns(),
      ]);

      if (!alive) return;

      setPost(detail);
      setRelatedPool(allRows);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const coverUrl = post ? getCoverUrl(post) : "";
  const remainingImages = post ? normalizeImageUrls(post).slice(1) : [];
  const hasBlocks = hasBlockContent(post);
  const linkUrl = typeof post?.link_url === "string" ? post.link_url : "";

  const relatedRows = useMemo(() => {
    if (!post) return [];

    const categoryLabel = getCategoryLabel(post);
    const pool = relatedPool.filter((row) => row.id !== post.id);
    const sameCategory =
      categoryLabel !== ALL_CATEGORY
        ? pool.filter((row) => getCategoryLabel(row) === categoryLabel)
        : pool;

    return sameCategory.length > 0 ? sameCategory : pool;
  }, [post, relatedPool]);

  const visibleRelated = relatedRows.slice(
    relatedStart,
    relatedStart + RELATED_PAGE_SIZE,
  );
  const hasMoreRelated = relatedStart + RELATED_PAGE_SIZE < relatedRows.length;

  function handleShareClick() {
    setSharePopoverOpen((prev) => !prev);
    setCopied(false);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (loading) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 py-24 text-center sm:px-8">
          <p className="text-sm font-bold text-gray-400">불러오는 중입니다.</p>
        </div>
      </main>
    );
  }

  if (!post) {
    return (
      <main className="bg-white pt-16">
        <div className="mx-auto w-full max-w-content px-5 py-24 text-center sm:px-8">
          <h1 className="text-xl font-bold text-ink">
            게시글을 찾을 수 없습니다.
          </h1>
          <Link
            to="/info/column"
            className="mt-8 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white"
          >
            교육칼럼 홈으로
          </Link>
        </div>
      </main>
    );
  }

  const titleBlock = (
    <div className="flex flex-col gap-2">
      <Link
        to="/info/column"
        className="w-fit text-base font-semibold leading-[1.4] tracking-[-0.02em] text-accent"
      >
        교육칼럼
      </Link>

      <div className="flex items-start justify-between gap-6">
        <h1 className="break-keep text-3xl font-semibold leading-[1.3] tracking-[-0.02em] text-ink sm:text-[2.25rem]">
          {post.title}
        </h1>

        <div className="relative shrink-0">
          <button
            type="button"
            onClick={handleShareClick}
            aria-label="공유하기"
            className="flex h-12 w-12 items-center justify-center rounded-full text-ink transition-colors hover:bg-[#F4F4F4]"
          >
            <Share2 size={24} />
          </button>

          {sharePopoverOpen && (
            <div className="absolute right-0 top-14 z-10 flex w-29.25 flex-col items-center gap-2 rounded-2xl bg-white p-4 shadow-[0_0.5rem_1.5rem_rgba(0,0,0,0.15)]">
              <button
                type="button"
                onClick={handleCopyLink}
                aria-label="링크 복사"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F4F4F4] text-ink"
              >
                <LinkIcon size={35} />
              </button>
              <span className="text-xs font-medium text-[#7A7A7A]">
                {copied ? "복사되었습니다" : "링크 복사"}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <main className="bg-white pt-16">
      {coverUrl ? (
        <>
          <img
            src={coverUrl}
            alt={post.title || ""}
            className="h-104 w-full object-cover md:h-136"
          />
          <section className="mt-16 md:mt-25">
            <div className="mx-auto w-full max-w-content px-5 sm:px-8">
              {titleBlock}
            </div>
          </section>
        </>
      ) : (
        <div className="flex h-104 w-full flex-col justify-end bg-[#F4F4F4] pb-10 md:h-136 md:pb-25">
          <div className="mx-auto w-full max-w-content px-5 sm:px-8">
            {titleBlock}
          </div>
        </div>
      )}

      <section>
        <div className="mx-auto w-full max-w-content px-5 sm:px-8">
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-16 inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-6 text-sm font-semibold text-white md:mt-24"
            >
              바로가기
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
          <ColumnBody
            post={post}
            className={
              linkUrl
                ? "mt-8"
                : `mt-16 ${coverUrl ? "md:mt-24" : "md:mt-23.75"}`
            }
          />

          {remainingImages.length > 0 && !hasBlocks && (
            <div className="mt-10 space-y-5">
              {withDedupedKeys(remainingImages).map(
                ({ item: url, key }, index) => (
                  <img
                    key={key}
                    src={url}
                    alt={`${post.title || ""} 이미지 ${index + 2}`}
                    className="w-full rounded-xl object-cover"
                  />
                ),
              )}
            </div>
          )}
        </div>
      </section>

      {relatedRows.length > 0 && (
        <section className="mt-20 pb-20 sm:pb-24 md:mt-25 md:pb-33">
          <div className="mx-auto w-full max-w-content px-5 sm:px-8">
            <h2 className="break-keep text-2xl sm:text-[2.25rem] font-semibold leading-[1.3] tracking-[-0.02em] text-black">
              함께 읽으면 좋은 글
            </h2>

            <div className="relative mt-10">
              <div className="grid grid-cols-1 gap-x-5 gap-y-9 sm:grid-cols-2 wide:grid-cols-4">
                {visibleRelated.map((row) => (
                  <ColumnCard key={row.id} column={row} variant="grid" />
                ))}
              </div>

              {hasMoreRelated && (
                <button
                  type="button"
                  onClick={() =>
                    setRelatedStart((prev) => prev + RELATED_PAGE_SIZE)
                  }
                  aria-label="다음 관련 글"
                  className="absolute -right-4 top-1/2 flex h-12 w-12.5 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-[0_0.25rem_0.75rem_rgba(0,0,0,0.15)] sm:right-0 sm:translate-x-1/2 wide:top-22.75"
                >
                  <ChevronRight size={24} />
                </button>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
