import { ArrowLeft, Download } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import SafeHtml from "@/components/admission/SafeHtml";
import BoardListPage from "@/components/board/BoardListPage";
import { site } from "@/config/site";
import { withDedupedKeys } from "@/lib/reactKeys";
import { supabase } from "@/lib/supabase";
import {
  BOARD_SOURCES,
  type BoardRow,
  formatBoardDate,
  incrementBoardView,
} from "./board/boardData";

type Attachment = string | { name?: string; url?: string };

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

function getAttachmentName(file: Attachment | null | undefined) {
  if (!file) return "첨부파일 다운로드";
  if (typeof file === "string") return "첨부파일 다운로드";
  return file.name || "첨부파일 다운로드";
}

function getAttachmentUrl(file: Attachment | null | undefined) {
  if (!file) return "";
  return typeof file === "string" ? file : file.url || "";
}

function renderNoticeContent(content: string | null | undefined) {
  if (!content) return null;

  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(content);

  if (hasHtml) {
    return <SafeHtml html={content} className="notice-content" />;
  }

  return <div className="notice-content whitespace-pre-line">{content}</div>;
}

export default function Events() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");

  const [notices, setNotices] = useState<BoardRow[]>([]);
  // 어떤 id 요청에 대한 로드가 끝났는지. 상세 대기 상태와 '없는 글' 을 구분하는 유일한 근거다.
  const [loadedId, setLoadedId] = useState<string | null>(null);

  // 목록은 BoardListPage 가 스스로 로드한다. 여기서는 `?id=` 상세일 때만 조회한다.
  // (목록 분기에서도 조회하면 같은 테이블을 두 번 읽는다.)
  //
  // 한 번 확보한 목록은 그대로 재사용한다. 이 가드가 없으면 목록→상세를 오갈 때마다
  // notices 전량을 다시 읽는다. SPA 세션 도중 관리자가 추가한 글이 보이지 않는 건
  // 수용한다 — 새로고침/재진입이면 빈 목록에서 다시 시작하므로 자연히 반영된다.
  // 조회 실패로 notices 가 빈 채 남으면 다음 상세 진입에서 다시 시도한다.
  useEffect(() => {
    if (!selectedId) return undefined;
    if (notices.length > 0) return undefined;

    let mounted = true;

    async function fetchNotices() {
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .eq("is_active", true)
        .order("is_pinned", { ascending: false })
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (error) {
        console.error("공지사항 조회 오류:", error);
        setNotices([]);
        setLoadedId(selectedId);
        return;
      }

      setNotices((data || []) as BoardRow[]);
      setLoadedId(selectedId);
    }

    fetchNotices();

    return () => {
      mounted = false;
    };
  }, [selectedId, notices.length]);

  const selectedNotice = useMemo(() => {
    if (!selectedId) return null;
    return (
      notices.find((notice) => String(notice.id) === String(selectedId)) || null
    );
  }, [selectedId, notices]);

  // 조회수 +1 (설계 결정 D3 — 1일 1회 IP 중복 방지는 RPC 내부 책임).
  // StrictMode 개발 모드의 effect 이중 실행에도 id 당 1회만 나가도록 ref 로 잠근다.
  // ref 는 StrictMode 재마운트 시뮬레이션에서도 보존되므로 두 번째 실행은 건너뛴다.
  // incrementBoardView 는 어떤 실패에도 throw 하지 않는다(boardData.js:181-201).
  const viewedIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!selectedNotice) return;

    const noticeId = selectedNotice.id as string | number;

    if (viewedIdRef.current === noticeId) return;

    viewedIdRef.current = noticeId;
    incrementBoardView(BOARD_SOURCES.notices, noticeId);
  }, [selectedNotice]);

  // 상세 요청이 아직 도착하지 않은 구간. 이 가드가 없으면 목록(BoardListPage)이 한 프레임
  // 그려졌다가 상세로 튀고, 그 사이 목록이 자체 조회까지 한 번 더 날린다.
  // notices 를 이미 확보했다면 조회 자체가 없으므로 대기 구간도 없다 — 여기서
  // loadedId 만 보면 두 번째 상세부터 로딩 화면이 한 프레임 깜빡인다.
  if (selectedId && loadedId !== selectedId && notices.length === 0) {
    return (
      <main className="min-h-screen bg-white pt-16">
        <section className="mx-auto max-w-content px-6 py-16">
          <div
            role="status"
            className="py-16 text-center text-sm font-medium text-[#767676]"
          >
            불러오는 중입니다.
          </div>
        </section>
      </main>
    );
  }

  if (selectedNotice) {
    const images = normalizeArray(selectedNotice.image_urls) as string[];
    const attachments = normalizeArray(
      selectedNotice.attachments,
    ) as Attachment[];

    return (
      <main className="min-h-screen bg-white pt-16">
        <section className="mx-auto max-w-content px-6 py-16">
          <button
            type="button"
            onClick={() => setSearchParams({})}
            className="mb-8 inline-flex items-center gap-2 text-[16px] font-bold text-gray-600 hover:text-black"
          >
            <ArrowLeft size={20} />
            목록으로
          </button>

          <div className="border-y border-[#d9d9d9]">
            <div className="border-b border-[#e5e5e5] px-4 py-7">
              <div className="mb-3 flex items-center gap-2">
                {selectedNotice.is_pinned && (
                  <span className="rounded-sm bg-[#0D1B2A] px-2 py-1 text-xs font-black text-white">
                    공지
                  </span>
                )}

                <span className="text-sm font-medium text-gray-500">
                  {formatBoardDate(selectedNotice.created_at)}
                </span>
              </div>

              <h1 className="break-keep text-[30px] font-black leading-[1.35] tracking-[-0.03em] text-[#111827]">
                {selectedNotice.title}
              </h1>
            </div>

            <article className="min-h-[420px] px-4 py-12">
              {images.length > 0 ? (
                <div className="mb-10 space-y-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {withDedupedKeys(images).map(({ item: url, key }, index) => (
                    <img
                      key={key}
                      src={url}
                      alt={`${selectedNotice.title} 이미지 ${index + 1}`}
                      className="w-full object-contain"
                    />
                  ))}
                </div>
              ) : selectedNotice.image_url ? (
                <div className="mb-10 flex justify-center">
                  <img
                    src={selectedNotice.image_url as string}
                    alt={selectedNotice.title as string}
                    className="max-h-none max-w-full object-contain"
                  />
                </div>
              ) : null}

              {renderNoticeContent(selectedNotice.content as string)}

              {attachments.length > 0 ? (
                <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <p className="mb-3 text-sm font-black text-[#111827]">
                    첨부파일
                  </p>

                  <div className="space-y-2">
                    {withDedupedKeys(
                      attachments.filter((file) => getAttachmentUrl(file)),
                      getAttachmentUrl,
                    ).map(({ item: file, key }) => (
                      <a
                        key={key}
                        href={getAttachmentUrl(file)}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A] hover:text-[#0D1B2A]"
                      >
                        <Download size={16} />
                        {getAttachmentName(file)}
                      </a>
                    ))}
                  </div>
                </div>
              ) : selectedNotice.file_url ? (
                <div className="mt-12 rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <p className="mb-3 text-sm font-black text-[#111827]">
                    첨부파일
                  </p>

                  <a
                    href={selectedNotice.file_url as string}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:border-[#0D1B2A] hover:text-[#0D1B2A]"
                  >
                    <Download size={16} />
                    {(selectedNotice.file_name as string) ||
                      "첨부파일 다운로드"}
                  </a>
                </div>
              ) : null}
            </article>
          </div>
        </section>
      </main>
    );
  }

  // 목록 분기 — BoardListPage 가 <main> 과 <h1> 을 직접 렌더하므로 감싸지 않는다(감싸면 main/h1 2개).
  // is_pinned 표기는 BoardTable 의 '중요' 칩이 전담한다 — 여기서 [공지] prefix / 배경 하이라이트를
  // 다시 붙이면 중복이 된다.
  return (
    <BoardListPage
      title={site.news.noticeTitle}
      source={BOARD_SOURCES.notices}
      getDetailHref={(row) =>
        `/events?id=${encodeURIComponent(String(row.id))}`
      }
      emptyMessage={site.news.noticeEmpty}
      {...(site.boardBanners ? { banner: site.boardBanners.info } : {})}
    />
  );
}
