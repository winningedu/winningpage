import { Plus, RefreshCw, UploadCloud } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import BookViewer from "@/components/premiumBook/BookViewer";
import type { PremiumBookPage } from "@/components/premiumBook/bookPairing";
import { supabase } from "@/lib/supabase";
import {
  AdminForm,
  AdminTable,
  collectBannerPaths,
  removeBannerPaths,
  uploadImage,
} from "@/pages/admin/shared/AdminEngine";
import { reportAdminError } from "@/pages/admin/shared/adminErrors";

// CONFIGS(admin-shared-configs 배치 소관, 아직 JS)의 config 값 shape을 여기서 로컬로 추론한다 —
// 이 컴포넌트가 실제로 읽는 필드만 명시하고 나머지(table/columns/fields/defaults 등, AdminTable/
// AdminForm이 소비)는 인덱스 시그니처로 열어둔다.
interface PremiumBookAdminConfig {
  title: string;
  homepage?: boolean;
  guideText?: string;
  [key: string]: unknown;
}

interface PremiumBookPageRow {
  // premium_book_pages.id는 identity 정수 PK다(생성 타입 대조 결과) — string이 아니다.
  id: number;
  sort_order: number;
  image_url: string;
  [key: string]: unknown;
}

interface PremiumBookPageFormValues {
  sort_order: number | string;
  image_url: string;
}

type ListMode = "list" | "create" | "edit";

// Storage 업로드 실패를 원인별 한국어 문구로 구체화한다(QA 223).
//
// 배경: [적용]의 원본 PDF 업로드가 "mime type application/pdf is not supported"
// (StorageApiError statusCode "415")로 실패하는 사고가 있었다 — banners 버킷이
// 원래 이미지 배너 전용으로 만들어져 있었고, 이 리포의 어떤 마이그레이션도
// allowed_mime_types 컬럼을 건드린 적이 없어(20260821000001_storage.sql은
// id/name/public 3컬럼만 upsert) 그 제한이 그대로 남아 있었다(수정:
// supabase/migrations/20260902103514_premium_book_banners_pdf_mime.sql).
// 기존 코드는 pdfError.message를 그대로 노출해 "적용 중단" 안내만 있을 뿐
// 원인(형식/용량/권한/로그인 만료)을 구분하지 못했다 — 이 함수가 그 구분을 맡는다.
// @supabase/storage-js의 StorageError는 message/status(number)/statusCode(string)
// 만 보장한다(lib/common/errors.ts) — statusCode 문자열로 분기한다.
export function describeStorageUploadError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return String(error ?? "알 수 없는 오류");
  }
  const { statusCode, message } = error as {
    statusCode?: unknown;
    message?: unknown;
  };
  const code = String(statusCode ?? "");
  const msg = String(message ?? "") || "알 수 없는 오류";

  if (code === "413") return `파일 용량이 허용 한도를 초과했습니다(${msg})`;
  if (code === "415") return `허용되지 않는 파일 형식입니다(${msg})`;
  if (code === "403")
    return `업로드 권한이 없습니다 — 관리자 계정으로 다시 로그인 후 시도하세요(${msg})`;
  if (code === "401")
    return `로그인이 만료됐습니다 — 다시 로그인 후 시도하세요(${msg})`;
  return msg;
}

// 프리미엄 이용(BOOK) 책자 — bespoke 패널(PDF 업로드→변환→미리보기→적용) + 개별 페이지 제네릭 CRUD를
// 한 컴포넌트 안에 함께 렌더한다. config.custom이 all-or-nothing이라(Admin() 최상단 렌더 분기) 이
// 섹션이 선택되면 Admin()의 제네릭 list/create/edit 경로 자체가 통째로 스킵되기 때문이다 — 그래서
// "개별 페이지 1장 교체" 요구(명세 §6 A ①)를 살리려면 AdminTable/AdminForm을 이 컴포넌트가 직접
// 다시 호출해야 한다. 두 컴포넌트는 Admin() 상태를 참조하지 않는 순수 프레젠테이션 함수라 재사용에
// 문제가 없다(props만 받는다).
//
// PDF→WebP 변환은 명세 §D2 확정안을 그대로 따른다:
//   - pdfjs-dist는 반드시 핸들러(handleConvert) 안에서 동적 import한다. Admin은 App.jsx:39에서
//     lazy() 청크라 정적 import하면 pdfjs worker(약 372KB gzip)가 이미 무거운 Admin 청크에 얹힌다.
//   - worker는 new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)로 배선한다
//     (spike/index.html에서 Vite 6 + pdfjs-dist v6 조합으로 실측 확인된 방식).
//   - 각 페이지를 가로 1024px 목표로 렌더하고 canvas.toBlob('image/webp', 0.8)로 인코딩한다.
//   - toBlob 포맷 가드 필수 — MDN 명세상 브라우저가 WebP 인코딩을 지원하지 않으면 조용히 PNG를
//     반환한다(에러 없음). blob.type이 'image/webp'가 아니면 그 자리에서 변환을 중단한다.
//   - 순차 렌더 + 페이지마다 canvas.width = 0; canvas.height = 0으로 해제해 16장을 동시에 들고
//     있지 않는다.
//
// [적용]은 2단계 시퀀싱이다(명세 §D2) — 원본 PDF + WebP 16장 업로드가 전량 성공한 뒤에만
// premium_book_pages를 건드린다. 업로드 도중 실패하면 DB는 아예 호출하지 않는다(부분 반영 방지).
// upsert는 sort_order UNIQUE가 없어(sql/47_premium_book.sql) id 하이드레이션이 필수다 — 변환 직전이
// 아니라 "적용" 시점에 기존 행을 조회해 sort_order→id 맵을 만들고, 그 id를 실어 PK 기준 upsert한다.
// 중복 sort_order가 있으면 어느 id에 실어야 할지 판정 불가능하므로 그 자리에서 중단한다.
export default function PremiumBookAdmin({
  config,
}: {
  config: PremiumBookAdminConfig;
}) {
  // ---- 개별 페이지 제네릭 목록(요구 C — 명세 §6 A ②) ----
  const [rows, setRows] = useState<PremiumBookPageRow[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [mode, setMode] = useState<ListMode>("list");
  const [editingRow, setEditingRow] = useState<PremiumBookPageRow | null>(null);
  const [page, setPage] = useState(1);

  // ---- PDF 업로드 → 변환 ----
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [convertError, setConvertError] = useState("");

  // ---- 변환 결과(저장 전) — 미리보기는 BookViewer가 그대로 소비한다 ----
  const [previewPages, setPreviewPages] = useState<PremiumBookPage[]>([]); // [{ sort_order, image_url: blobUrl }]
  const [webpBlobs, setWebpBlobs] = useState<Blob[]>([]); // Blob[] — 적용 시 이 원본을 그대로 업로드한다

  // ---- 적용(저장) ----
  const [applying, setApplying] = useState(false);
  const [applyStatus, setApplyStatus] = useState("");
  const [applyError, setApplyError] = useState("");

  const blobUrlsRef = useRef<string[]>([]);
  const convertTokenRef = useRef(0);

  function revokePreviewUrls() {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];
  }

  async function loadRows() {
    setRowsLoading(true);
    const { data, error } = await supabase
      .from("premium_book_pages")
      .select("*")
      .order("sort_order", { ascending: true });
    setRowsLoading(false);

    if (error) {
      reportAdminError(`${config.title} 조회 실패`, error);
      setRows([]);
      return;
    }

    setRows(data || []);
  }

  const onMountLoadRows = useEffectEvent(() => {
    loadRows();
  });
  const onUnmountRevokePreviewUrls = useEffectEvent(() => {
    revokePreviewUrls();
  });

  useEffect(() => {
    onMountLoadRows();
    // 언마운트·재변환 시 blob URL 누수 방지(명세 §D2).
    return () => onUnmountRevokePreviewUrls();
  }, []);

  const duplicateSortOrders = useMemo(() => {
    const seen = new Set<number>();
    const dupes = new Set<number>();
    for (const row of rows) {
      const key = row.sort_order;
      if (seen.has(key)) dupes.add(key);
      seen.add(key);
    }
    return [...dupes].sort((a, b) => a - b);
  }, [rows]);

  function createRow() {
    setEditingRow(null);
    setMode("create");
  }

  function editRow(row: PremiumBookPageRow) {
    setEditingRow(row);
    setMode("edit");
  }

  async function deleteRow(row: PremiumBookPageRow) {
    if (!window.confirm("정말 삭제하시겠습니까?")) return;

    const { error } = await supabase
      .from("premium_book_pages")
      .delete()
      .eq("id", row.id);

    if (error) {
      reportAdminError("삭제 실패", error);
      return;
    }

    // 고아 방지 스펙 3: 삭제된 페이지 row가 참조하던 banners 이미지도 함께 지운다.
    // best-effort — 실패해도 행 삭제 자체는 이미 끝난 뒤다. config.fields는 이
    // 컴포넌트 경계상 unknown이라(PremiumBookAdminConfig 주석) 여기서만 캐스팅한다.
    const referencedPaths = collectBannerPaths(
      row,
      config.fields as Parameters<typeof collectBannerPaths>[1],
    );
    if (referencedPaths.size > 0) removeBannerPaths(referencedPaths);

    await loadRows();
  }

  async function saveRow(form: PremiumBookPageFormValues) {
    const payload = {
      sort_order: Number(form.sort_order) || 1,
      image_url: form.image_url || "",
    };

    if (mode === "create") {
      const { error } = await supabase
        .from("premium_book_pages")
        .insert(payload);
      if (error) {
        reportAdminError("등록 실패", error);
        return;
      }
    } else {
      if (editingRow === null) {
        // 방어적 가드 — edit 모드는 항상 editRow()가 먼저 editingRow를 채운
        // 뒤에만 진입한다. 타입상 number|undefined라 eq() 앞에서 좁힌다.
        reportAdminError("수정 실패", new Error("editingRow가 비어 있습니다."));
        return;
      }
      const { error } = await supabase
        .from("premium_book_pages")
        .update(payload)
        .eq("id", editingRow.id);
      if (error) {
        reportAdminError("수정 실패", error);
        return;
      }
    }

    alert("저장 완료");
    setMode("list");
    setEditingRow(null);
    await loadRows();
  }

  function handlePickPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    revokePreviewUrls();
    setPdfFile(file);
    setPreviewPages([]);
    setWebpBlobs([]);
    setConvertError("");
    setApplyStatus("");
    setApplyError("");
  }

  async function handleConvert() {
    if (!pdfFile) {
      alert("PDF 파일을 먼저 선택하세요.");
      return;
    }
    if (converting || applying) return;

    const token = ++convertTokenRef.current;
    revokePreviewUrls();
    setConvertError("");
    setApplyStatus("");
    setApplyError("");
    setPreviewPages([]);
    setWebpBlobs([]);
    setConverting(true);
    setProgress({ done: 0, total: 0 });

    try {
      // 정적 import 금지 — 핸들러 안에서만 로드해 별도 청크로 분리한다(명세 §D2).
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      const arrayBuffer = await pdfFile.arrayBuffer();
      const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      const pageCount = pdfDoc.numPages;

      if (convertTokenRef.current !== token) return;
      setProgress({ done: 0, total: pageCount });

      const targetWidth = 1024;
      const blobs: Blob[] = [];
      const urls: string[] = [];

      for (let n = 1; n <= pageCount; n++) {
        if (convertTokenRef.current !== token) {
          // 변환 도중 새 PDF가 선택됐다 — 이번 결과는 버린다.
          urls.forEach((url) => {
            URL.revokeObjectURL(url);
          });
          return;
        }

        const pdfPage = await pdfDoc.getPage(n);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const scale = targetWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext("2d");

        // getContext('2d')는 방금 만든 canvas라 사실상 항상 성공한다(브라우저가
        // 2d를 지원하지 않는 극히 예외적 케이스는 기존에도 처리되지 않았다 — 그대로 둔다).
        // canvas: null — pdfjs RenderParameters 타입 문서상 canvasContext로 렌더할 땐
        // canvas는 null이어야 한다는 계약(런타임 동작은 기존과 동일, 타입만 명시).
        await pdfPage.render({ canvas: null, canvasContext: ctx!, viewport })
          .promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) =>
              b ? resolve(b) : reject(new Error("canvas.toBlob returned null")),
            "image/webp",
            0.8,
          );
        });

        // toBlob 포맷 가드(명세 §D2) — 미지원 브라우저는 조용히 PNG를 반환한다. 가드 없이
        // 넘어가면 16장이 통째로 PNG로 저장돼도 아무도 알아채지 못한다.
        if (blob.type !== "image/webp") {
          canvas.width = 0;
          canvas.height = 0;
          throw new Error(
            `이 브라우저는 WebP 인코딩을 지원하지 않습니다(반환된 포맷: ${blob.type || "알 수 없음"}). ` +
              `Chrome 등 WebP 인코딩을 지원하는 브라우저에서 다시 시도하세요.`,
          );
        }

        blobs.push(blob);
        urls.push(URL.createObjectURL(blob));

        // 16장을 동시에 캔버스에 들고 있지 않도록 매 페이지 처리 후 즉시 해제한다.
        canvas.width = 0;
        canvas.height = 0;

        setProgress({ done: n, total: pageCount });
      }

      if (convertTokenRef.current !== token) {
        urls.forEach((url) => {
          URL.revokeObjectURL(url);
        });
        return;
      }

      blobUrlsRef.current = urls;
      setWebpBlobs(blobs);
      setPreviewPages(
        urls.map((url, i) => ({ sort_order: i + 1, image_url: url })),
      );
    } catch (err) {
      console.error(err);
      setConvertError(err?.message || "PDF 변환에 실패했습니다.");
    } finally {
      if (convertTokenRef.current === token) setConverting(false);
    }
  }

  async function handleApply() {
    if (!pdfFile || webpBlobs.length === 0) {
      alert("먼저 PDF를 변환하세요.");
      return;
    }
    if (applying) return;

    setApplying(true);
    setApplyError("");
    setApplyStatus("원본 PDF 업로드 중...");

    try {
      // a. 원본 PDF — 고정 경로 upsert(명세 §D3b). 다운로드 버튼은 만들지 않지만 원본은 보관한다.
      const { error: pdfError } = await supabase.storage
        .from("banners")
        .upload("premium-book/booklet.pdf", pdfFile, {
          upsert: true,
          cacheControl: "3600",
        });

      if (pdfError) {
        throw new Error(
          `원본 PDF 업로드 실패 — 적용 중단: ${describeStorageUploadError(pdfError)}`,
        );
      }

      // b. WebP 16장 — 전량 성공해야 다음 단계(DB)로 넘어간다(2단계 시퀀싱, 명세 §D2).
      const urls: string[] = [];
      for (let i = 0; i < webpBlobs.length; i++) {
        setApplyStatus(
          `페이지 이미지 업로드 중 (${i + 1}/${webpBlobs.length})...`,
        );
        const path = `premium-book/p${String(i + 1).padStart(2, "0")}.webp`;

        const { error: uploadError } = await supabase.storage
          .from("banners")
          // i < webpBlobs.length는 for 루프 조건이 보장한다.
          .upload(path, webpBlobs[i]!, { upsert: true, cacheControl: "3600" });

        if (uploadError) {
          throw new Error(
            `${i + 1}번째 페이지 이미지 업로드 실패 — 적용 중단(DB는 변경되지 않았습니다): ${describeStorageUploadError(uploadError)}`,
          );
        }

        const { data } = supabase.storage.from("banners").getPublicUrl(path);
        urls.push(data.publicUrl);
      }

      // c. id 하이드레이션 upsert(명세 §D2 확정 문단) — sort_order UNIQUE가 없어 conflict target을
      // 지정할 수 없다. 기존 행을 조회해 sort_order→id 맵을 만들고 그 id를 실어 PK 기준 upsert한다.
      setApplyStatus("데이터베이스 반영 중...");

      const { data: existing, error: existingError } = await supabase
        .from("premium_book_pages")
        .select("id, sort_order");

      if (existingError) {
        throw new Error(
          `기존 페이지 조회 실패 — 적용 중단(이미지는 업로드됐지만 DB는 변경되지 않았습니다): ${existingError.message}`,
        );
      }

      const idBySort = new Map();
      for (const row of existing || []) {
        if (idBySort.has(row.sort_order)) {
          throw new Error(
            `sort_order ${row.sort_order} 중복 — 어느 행에 실어야 할지 판정할 수 없어 적용을 중단합니다. ` +
              `이미지는 업로드됐지만 DB는 변경되지 않았습니다. 아래 목록에서 중복 행을 먼저 정리하세요.`,
          );
        }
        idBySort.set(row.sort_order, row.id);
      }

      // id가 있는 행과 없는 행을 한 배열로 보내면 PostgREST가 공통 컬럼 집합으로 맞추며
      // id 없는 행을 id: null로 보내 NOT NULL 위반으로 문장 전체가 실패한다.
      // payload를 균질하게 유지하려고 기존 행은 upsert, 새 행은 insert로 나눠 보낸다.
      const upsertRows: Pick<
        PremiumBookPageRow,
        "id" | "sort_order" | "image_url"
      >[] = [];
      const insertRows: Pick<PremiumBookPageRow, "sort_order" | "image_url">[] =
        [];
      for (const [i, url] of urls.entries()) {
        const sortOrder = i + 1;
        if (idBySort.has(sortOrder)) {
          upsertRows.push({
            id: idBySort.get(sortOrder),
            sort_order: sortOrder,
            image_url: url,
          });
        } else {
          insertRows.push({ sort_order: sortOrder, image_url: url });
        }
      }

      if (upsertRows.length > 0) {
        const { error: upsertError } = await supabase
          .from("premium_book_pages")
          .upsert(upsertRows);

        if (upsertError) {
          throw new Error(
            `페이지 upsert 실패(이미지는 업로드됐습니다): ${upsertError.message}`,
          );
        }
      }

      if (insertRows.length > 0) {
        const { error: insertError } = await supabase
          .from("premium_book_pages")
          .insert(insertRows);

        if (insertError) {
          throw new Error(
            `새 페이지 insert 실패(이미지는 업로드됐습니다. 다시 적용하면 복구됩니다): ${insertError.message}`,
          );
        }
      }

      // d. 새 책자가 더 짧으면 잉여 행 삭제.
      const stale = (existing || [])
        .filter((row) => row.sort_order > urls.length)
        .map((row) => row.id);

      if (stale.length > 0) {
        const { error: deleteError } = await supabase
          .from("premium_book_pages")
          .delete()
          .in("id", stale);

        if (deleteError) {
          throw new Error(
            `잉여 페이지 삭제 실패(페이지 upsert 자체는 성공했습니다): ${deleteError.message}`,
          );
        }
      }

      setApplyStatus(`적용 완료 — ${urls.length}장 반영됨`);
      await loadRows();
    } catch (err) {
      console.error(err);
      setApplyError(err?.message || "적용 중 알 수 없는 오류가 발생했습니다.");
      setApplyStatus("");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-black text-[#111827]">
        {config.title}
      </h1>

      {config.homepage && (
        <div className="mb-4 space-y-1">
          <p className="text-sm font-bold text-red-500">
            이 메뉴에서 저장한 내용은 실제 홈페이지에 반영됩니다.
          </p>
          {config.guideText && (
            <p className="whitespace-pre-line text-sm font-black leading-6 text-red-600">
              {config.guideText}
            </p>
          )}
        </div>
      )}

      {/* bespoke 패널 — PDF 1개 업로드 → 변환 → 미리보기 → 적용 */}
      <div className="mb-6 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-black">PDF 일괄 변환·적용</h2>
        <p className="mb-4 text-sm font-bold text-gray-500">
          운영자는 PDF 파일 하나만 올리면 됩니다. 변환·미리보기까지는 저장되지
          않고, [적용]을 눌러야 실제로 반영됩니다.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-sm border border-gray-400 bg-white px-4 py-2 text-sm font-black hover:bg-gray-50">
            <UploadCloud size={16} />
            PDF 선택
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handlePickPdf}
            />
          </label>

          <span className="text-sm font-bold text-gray-600">
            {pdfFile ? pdfFile.name : "선택된 파일 없음"}
          </span>

          <button
            type="button"
            onClick={handleConvert}
            disabled={!pdfFile || converting || applying}
            className="inline-flex h-9 items-center gap-2 bg-[#2348ff] px-4 text-sm font-black text-white disabled:opacity-40"
          >
            {converting
              ? `변환 중 (${progress.done}/${progress.total || "?"})`
              : "PDF 변환"}
          </button>

          {previewPages.length > 0 && (
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || converting}
              className="inline-flex h-9 items-center gap-2 border border-red-500 bg-red-50 px-4 text-sm font-black text-red-600 disabled:opacity-40"
            >
              {applying ? "적용 중..." : `적용 (${previewPages.length}장 반영)`}
            </button>
          )}
        </div>

        {convertError && (
          <p className="mt-3 text-sm font-bold text-red-600">{convertError}</p>
        )}
        {applyStatus && (
          <p className="mt-3 text-sm font-bold text-blue-600">{applyStatus}</p>
        )}
        {applyError && (
          <p className="mt-3 text-sm font-bold text-red-600">{applyError}</p>
        )}

        {previewPages.length > 0 && (
          <div className="mt-6">
            <p className="mb-2 text-sm font-black text-gray-700">
              미리보기 — 아직 저장 전 상태입니다. [적용]을 눌러야 반영됩니다.
            </p>
            <BookViewer pages={previewPages} />
          </div>
        )}
      </div>

      {/* 개별 페이지 제네릭 목록 — 요구 C. AdminTable/AdminForm을 그대로 재사용한다. */}
      {mode === "list" ? (
        <>
          {duplicateSortOrders.length > 0 && (
            <div className="mb-4 rounded-sm border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
              페이지 번호(sort_order) 중복: {duplicateSortOrders.join(", ")} —
              정렬·표시 순서가 어긋날 수 있습니다. 아래 목록에서 먼저
              정리하세요.
            </div>
          )}

          <div className="mb-4 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={loadRows}
              className="inline-flex h-9 items-center gap-2 border border-gray-500 bg-white px-4 text-sm font-bold"
            >
              <RefreshCw size={14} />
              초기화
            </button>

            <button
              type="button"
              onClick={createRow}
              className="inline-flex h-9 items-center gap-1 bg-[#2348ff] px-4 text-sm font-black text-white shrink-0 whitespace-nowrap"
            >
              <Plus size={14} />
              등록
            </button>
          </div>

          {rowsLoading ? (
            <div className="bg-white p-12 text-center text-sm font-bold text-gray-500 shadow-sm">
              데이터를 불러오는 중입니다.
            </div>
          ) : (
            <AdminTable
              config={config}
              rows={rows}
              page={page}
              setPage={setPage}
              onEdit={editRow}
              onDelete={deleteRow}
            />
          )}
        </>
      ) : (
        <AdminForm
          config={config}
          mode={mode}
          row={editingRow}
          onCancel={() => {
            setMode("list");
            setEditingRow(null);
          }}
          onSave={saveRow}
          onUpload={uploadImage}
        />
      )}
    </div>
  );
}
