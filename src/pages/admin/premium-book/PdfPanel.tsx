import { UploadCloud } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import BookViewer from "@/components/premiumBook/BookViewer";
import type { PremiumBookPage } from "@/components/premiumBook/bookPairing";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/http/client";
import { putSignedUpload } from "@/lib/storage/signedUpload";
import { issueUpload } from "@/pages/admin/engine/api";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { useApplyBook } from "./api";

// 서버 업로드 규칙과 메뉴 권한이 쓰는 키(api/_lib/premium-book/uploads.ts)와 같다.
const SECTION_KEY = "premiumBookPages";

const UPLOAD_EXPIRED_TEXT = "올린 파일이 만료됐어요. 파일을 다시 올려 주세요.";
const DUPLICATE_SORT_ORDER_TEXT =
  "페이지 번호(sort_order) 중복이 있어 적용을 중단합니다. 이미지는 업로드됐지만 DB는 변경되지 않았습니다. 아래 목록에서 중복 행을 먼저 정리하세요.";
// 이미지는 올라갔어도 같은 PDF 를 다시 적용하면 고정 경로와 id 기준 upsert 라 같은 결과로 복구된다.
const APPLY_FAILED_TEXT =
  "적용 중 오류가 발생했습니다. 이미지는 업로드됐을 수 있습니다. 다시 적용하면 복구됩니다.";

// 서버 원문은 화면에 올리지 않고 코드별 문구만 쓴다.
function applyErrorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "UPLOAD_EXPIRED") return UPLOAD_EXPIRED_TEXT;
    if (error.code === "DUPLICATE_SORT_ORDER") return DUPLICATE_SORT_ORDER_TEXT;
  }
  return APPLY_FAILED_TEXT;
}

/** 임시 업로드 한 파일: 주소 발급, PUT. 서버가 돌려준 임시 객체 이름을 돌려준다. */
async function uploadTemp(file: File, field: "booklet_pdf" | "page_webp") {
  const issued = await issueUpload(SECTION_KEY, {
    field,
    fileName: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  });
  await putSignedUpload(issued.uploadUrl, file);
  return issued.path;
}

// PDF 한 개를 올리면 페이지별 WebP 로 바꿔 미리보고, [적용] 으로 한 번에 반영하는 패널.
//
// PDF 를 WebP 로 바꾸는 방식:
//   - pdfjs-dist 는 반드시 핸들러(handleConvert) 안에서 동적 import 한다. Admin 은 lazy 청크라
//     정적 import 하면 pdfjs worker(약 372KB gzip)가 이미 무거운 Admin 청크에 얹힌다.
//   - worker 는 new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url) 로 배선한다.
//   - 각 페이지를 가로 1024px 목표로 렌더하고 canvas.toBlob('image/webp', 0.8) 로 인코딩한다.
//   - toBlob 포맷 가드 필수. 브라우저가 WebP 인코딩을 지원하지 않으면 에러 없이 PNG 를 돌려준다.
//     blob.type 이 'image/webp' 가 아니면 그 자리에서 변환을 중단한다.
//   - 순차 렌더 + 페이지마다 canvas.width = 0; canvas.height = 0 으로 해제해 여러 장을 동시에 들고 있지 않는다.
export function PdfPanel() {
  // ---- PDF 업로드, 변환 ----
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [converting, setConverting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [convertError, setConvertError] = useState("");

  // ---- 변환 결과(저장 전). 미리보기는 BookViewer 가 그대로 소비한다 ----
  const [previewPages, setPreviewPages] = useState<PremiumBookPage[]>([]);
  const [webpBlobs, setWebpBlobs] = useState<Blob[]>([]);

  const [applyStatus, setApplyStatus] = useState("");
  const [applyError, setApplyError] = useState("");
  const apply = useApplyBook();
  const applying = apply.isPending || applyStatus.endsWith("...");

  const blobUrlsRef = useRef<string[]>([]);
  const convertTokenRef = useRef(0);

  function revokePreviewUrls() {
    for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
    blobUrlsRef.current = [];
  }

  const onUnmountRevokePreviewUrls = useEffectEvent(() => {
    revokePreviewUrls();
  });

  useEffect(() => {
    // 언마운트와 재변환 때 blob URL 이 새지 않게 한다.
    return () => onUnmountRevokePreviewUrls();
  }, []);

  function handlePickPdf(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    // 같은 파일을 다시 골라도 change 가 일어나도록 입력값을 비운다.
    e.target.value = "";
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
      toastWarning("PDF 파일을 먼저 선택하세요.");
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
          // 변환 도중 새 PDF 가 선택됐다. 이번 결과는 버린다.
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

        // getContext('2d') 는 방금 만든 canvas 라 사실상 항상 성공한다.
        // canvas: null 은 canvasContext 로 렌더할 때 pdfjs RenderParameters 가 요구하는 값이다.
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

        // 미지원 브라우저는 조용히 PNG 를 돌려준다. 가드가 없으면 전부 PNG 로 저장돼도 아무도 모른다.
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

        // 여러 장을 동시에 캔버스에 들고 있지 않도록 매 페이지 처리 후 바로 해제한다.
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

  // [적용]은 2단계다. 원본 PDF 와 WebP 가 모두 임시 업로드에 오른 뒤에만 서버 apply 를 부른다.
  // 하나라도 실패하면 apply 를 부르지 않아 DB 는 바뀌지 않는다.
  async function handleApply() {
    if (!pdfFile || webpBlobs.length === 0) {
      toastWarning("먼저 PDF를 변환하세요.");
      return;
    }
    if (applying) return;

    setApplyError("");
    setApplyStatus("원본 PDF 업로드 중...");

    let pdfPath: string;
    try {
      pdfPath = await uploadTemp(
        new File([pdfFile], "booklet.pdf", { type: "application/pdf" }),
        "booklet_pdf",
      );
    } catch (error) {
      console.error(error);
      setApplyError("원본 PDF 업로드 실패, 적용 중단");
      setApplyStatus("");
      return;
    }

    const pagePaths: string[] = [];
    for (const [i, blob] of webpBlobs.entries()) {
      setApplyStatus(
        `페이지 이미지 업로드 중 (${i + 1}/${webpBlobs.length})...`,
      );
      const name = `p${String(i + 1).padStart(2, "0")}.webp`;
      try {
        pagePaths.push(
          await uploadTemp(
            new File([blob], name, { type: "image/webp" }),
            "page_webp",
          ),
        );
      } catch (error) {
        console.error(error);
        setApplyError(
          `${i + 1}번째 페이지 이미지 업로드 실패, 적용 중단(DB는 변경되지 않았습니다)`,
        );
        setApplyStatus("");
        return;
      }
    }

    setApplyStatus("데이터베이스 반영 중...");
    try {
      await apply.mutateAsync({ pdf: pdfPath, pages: pagePaths });
      setApplyStatus(`적용 완료, ${pagePaths.length}장 반영됨`);
    } catch (error) {
      console.error(error);
      setApplyError(applyErrorText(error));
      setApplyStatus("");
    }
  }

  return (
    <div className="mb-6 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-xl font-semibold">PDF 일괄 변환 및 적용</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        운영자는 PDF 파일 하나만 올리면 됩니다. 변환과 미리보기까지는 저장되지
        않고, [적용]을 눌러야 실제로 반영됩니다.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 text-sm font-medium hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50">
          <UploadCloud size={16} aria-hidden="true" />
          PDF 선택
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            onChange={handlePickPdf}
          />
        </label>

        <span className="text-sm text-gray-600">
          {pdfFile ? pdfFile.name : "선택된 파일 없음"}
        </span>

        <Button
          type="button"
          size="lg"
          onClick={handleConvert}
          disabled={!pdfFile || converting || applying}
        >
          {converting
            ? `변환 중 (${progress.done}/${progress.total || "?"})`
            : "PDF 변환"}
        </Button>

        {previewPages.length > 0 && (
          <Button
            type="button"
            size="lg"
            variant="destructive"
            onClick={handleApply}
            disabled={applying || converting}
          >
            {applying ? "적용 중..." : `적용 (${previewPages.length}장 반영)`}
          </Button>
        )}
      </div>

      {convertError && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {convertError}
        </p>
      )}
      {applyStatus && (
        <p role="status" className="mt-3 text-sm font-medium text-primary">
          {applyStatus}
        </p>
      )}
      {applyError && (
        <p role="alert" className="mt-3 text-sm font-medium text-destructive">
          {applyError}
        </p>
      )}

      {previewPages.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-gray-700">
            미리보기: 아직 저장 전 상태입니다. [적용]을 눌러야 반영됩니다.
          </p>
          <BookViewer pages={previewPages} />
        </div>
      )}
    </div>
  );
}
