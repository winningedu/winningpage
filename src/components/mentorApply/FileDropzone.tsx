// 멘토신청 5-1 재학 증빙 서류 업로드 드롭존 — docs/mentor-apply-spec.md §폼 명세 섹션 5.
//
// 기존 자산을 쓰지 않은 이유: 저장소의 유일한 파일 업로드 UI 는 `Admin.jsx` 내부 JSX 고,
// 업로드 헬퍼(`uploadImage`)는 비export + `IMAGE_BUCKET='banners'` 하드코딩이라
// 지원서 첨부에 재사용할 수 없다(명세 §재사용 매핑 C). 그래서 신규 컴포넌트다.
//
// ⚠️ 여기서 하는 확장자·용량 검사는 **UX 용일 뿐 보안 장치가 아니다.**
// 클라이언트 검증은 개발자도구로 얼마든지 우회되므로, 실제 강제는 제출 엔드포인트
// (`api/_routes/mentor-apply.js`, 명세 §백엔드/데이터 3)가 MIME·확장자 화이트리스트와
// 크기 상한을 **서버에서 다시** 검사해서 한다. 이 컴포넌트는 사용자가 업로드를
// 끝까지 진행한 뒤에야 거절당하는 일을 줄이는 역할만 한다.
//
// ⚠️ 표시 문구(구 100MB) ↔ 기본 상한(구 10MB) 불일치는 해소됐지만, 결과가 시안
// 원문 100MB 그대로는 아니다. Vercel Functions 요청 본문에 플랜과 무관한 하드
// 리밋 4.5MB 가 있어(base64 오버헤드까지 감안하면 원본 기준 약 3.2MB) 애초에
// 100MB 를 base64 단일 요청으로는 받을 수 없었다. 그래서 업로드를 **2단계
// signed upload URL 방식**으로 바꿨다 — 클라이언트가 Supabase Storage 에 파일을
// 직접 올리고(이 요청은 서버리스 함수를 거치지 않아 함수 본문 상한과 무관하다), 지원서
// 제출 요청에는 업로드된 경로(`proof_file_path`)만 실어 보낸다(MentorApplyForm.jsx 제출
// 로직, api/_routes/mentor-apply-upload-url.js). 이걸로 Vercel 4.5MB 벽은 벗어났지만, 그
// 대신 **Supabase 프로젝트 전역 Storage 업로드 상한(실측 52428800 = 50MB, dev·운영
// 동일)이 새로운 천장**으로 드러났다 — 버킷 file_size_limit 을 100MB 로 걸어도 전역
// 상한에서 먼저 막힌다. 그래서 표시 문구도 상한도 **50MB** 로 정렬했다(2026-08-10
// 사용자 승인, docs/mentor-apply-spec.md §0-1 결정 로그 / §미해결 42·44).
//
// ⚠️ 파일 선택 이후 상태(파일명 표시 / 삭제 버튼)는 **시안에 없다**(확인 항목 ㉜ —
// Figma 전수 재조사에서 프로토타입 reactions 0건·숨김 노드 0건으로 부재 확정).
// 아래 선택 완료 뷰는 시안 파생 추정 구현이며, 드롭존과 같은 박스(높이 11.375rem)
// 안에서 내용만 교체해 레이아웃 시프트가 없도록 했다. 디자인 확정 시 교체 대상.
//
// ⚠️ 접근성 — 숨은 `<input type="file">` 의 accessible name 은 원래 "선택 안 됨" 뷰에서만
// 렌더되는 `<label htmlFor>` 에 의존했다. 파일을 고르면 그 라벨이 사라지는 선택 완료
// 뷰로 바뀌면서 인풋이 이름을 잃는 문제가 있었다 — 뷰 상태와 무관하게 항상 켜져 있는
// `aria-label` 을 인풋에 직접 달아 해결한다(accname 우선순위상 aria-label 이 label
// 연결보다 앞서므로 두 뷰에서 이름이 갈리지 않는다).

import { CheckCircle2, FileText, Loader2, Upload, X } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { useRef, useState } from "react";

// 시안 보조 문구(§폼 명세 5-1)는 원래 "100MB 이하"였으나, Supabase 전역 업로드
// 상한 실측(50MB, 파일 상단 ⚠️ 참고)에 맞춰 사용자 승인 하에 50MB 로 정정했다.
// 표시용이며 실제 상한은 maxSizeBytes 가 정한다.
const HINT_TEXT = "PDF · PNG · JPG · HWP / 1개 / 50MB 이하";
const BODY_TEXT = "파일 선택 또는 여기로 끌어다 놓기";

// accept 속성 기본값과 확장자 화이트리스트는 같은 목록에서 파생시킨다 —
// 둘이 어긋나면 다이얼로그에서는 고를 수 있는데 선택 직후 거절당하는 상태가 된다.
const ALLOWED_EXTENSIONS = ["pdf", "png", "jpg", "jpeg", "hwp"];
const DEFAULT_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

// 2단계 signed upload 전환으로 서버리스 함수 본문 상한(4.5MB)과는 무관해졌지만,
// Supabase 프로젝트 전역 Storage 업로드 상한이 실측 50MB 라 그 값을 기본 상한으로
// 쓴다(위 파일 상단 ⚠️ 참고). 실제 강제는 여전히 서버(Storage 정책 +
// api/_routes/mentor-apply-upload-url.js) 몫이고 여기는 UX 용이다.
//
// api/_routes/mentor-apply.js 의 MAX_FILE_BYTES 와 값이 같아야 한다 — 서버 상수를 그대로
// import 하지 않는 이유는 api/ 가 클라이언트 번들과 분리된 서버리스 함수라서다
// (같은 패턴이 api/_routes/mentor-apply.js:199-201 화이트리스트 복제 주석에도 있다).
// 둘 중 하나만 고치면 "선택은 되는데 제출 직전 서버가 거절"하는 조용한 어긋남이
// 생기므로, 이 값을 바꿀 때는 반드시 서버 쪽도 함께 바꿀 것.
const DEFAULT_MAX_SIZE_BYTES = 50 * 1024 * 1024;

// 숨은 파일 인풋의 기본 accessible name. 특정 필드 문맥에 맞게 부모가 덮어쓸 수 있다.
const DEFAULT_ARIA_LABEL = "재학 증빙 서류 파일 선택";

function getExtension(fileName: string) {
  const parts = String(fileName || "")
    .toLowerCase()
    .split(".");
  return parts.length > 1 ? (parts.pop() ?? "") : "";
}

function formatFileSize(bytes: number) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

type UploadStatus = "idle" | "uploading" | "done";

type FileDropzoneProps = {
  value?: File | null;
  onChange?: (file: File | null) => void;
  error?: string;
  maxSizeBytes?: number;
  accept?: string;
  /** 2단계 업로드 진행 상태 — 실제 업로드는 이 컴포넌트가 아니라 부모(MentorApplyForm)가
   * 제출 시점에 수행하므로(파일 선택 즉시 업로드하지 않는 이유는 그쪽 주석 참고), 상태를
   * 여기로 내려받아 표시만 한다. */
  uploadStatus?: UploadStatus;
  ariaLabel?: string;
  id?: string;
  className?: string;
};

export default function FileDropzone({
  value = null, // File | null
  onChange,
  error,
  maxSizeBytes = DEFAULT_MAX_SIZE_BYTES,
  accept = DEFAULT_ACCEPT,
  // 2단계 업로드 진행 상태 — 실제 업로드는 이 컴포넌트가 아니라 부모(MentorApplyForm)가
  // 제출 시점에 수행하므로(파일 선택 즉시 업로드하지 않는 이유는 그쪽 주석 참고), 상태를
  // 여기로 내려받아 표시만 한다. 'idle' | 'uploading' | 'done'.
  uploadStatus = "idle",
  ariaLabel = DEFAULT_ARIA_LABEL,
  id = "mentor-apply-file",
  className = "",
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  // 부모가 내려주는 error(제출 시 검증·서버 응답)와 이 컴포넌트가 즉시 잡아내는
  // 형식/용량 오류는 출처가 달라 따로 들고 있다가 표시할 때 합친다.
  const [localError, setLocalError] = useState("");

  const message = error || localError;
  const uploading = uploadStatus === "uploading";
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // 선택 완료 뷰에서는 보조 문구 노드가 사라지므로 없는 id 를 가리키지 않게 한다.
  const describedBy =
    [value ? null : hintId, message ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  function acceptFile(file: File | null) {
    if (!file) return;

    if (!ALLOWED_EXTENSIONS.includes(getExtension(file.name))) {
      setLocalError("PDF · PNG · JPG · HWP 형식만 올릴 수 있습니다.");
      return;
    }

    if (file.size > maxSizeBytes) {
      setLocalError(
        `${formatFileSize(maxSizeBytes)} 이하 파일만 올릴 수 있습니다.`,
      );
      return;
    }

    setLocalError("");
    onChange?.(file);
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    // 1개만 받는다(multiple 미지정이라 사실상 1개지만 드롭 경로와 규칙을 맞춘다).
    acceptFile(event.target.files?.[0] ?? null);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    acceptFile(event.dataTransfer?.files?.[0] ?? null);
  }

  function handleRemove() {
    // 업로드 진행 중에는 지우지 못하게 막는다 — 진행 중인 Storage 업로드는 이 컴포넌트가
    // 아니라 부모가 들고 있어 여기서 취소할 방법이 없고, 지운 것처럼 보이는 파일이 뒤늦게
    // 서버에 저장 완료로 잡히면 상태가 어긋난다.
    if (uploading) return;
    setLocalError("");
    onChange?.(null);
    // 같은 파일을 지웠다가 다시 고를 때 change 이벤트가 안 뜨는 것을 막는다.
    if (inputRef.current) inputRef.current.value = "";
  }

  const dropzoneBorderClassName = (() => {
    if (message) return "border-error";
    if (dragging) return "border-accent";
    return "border-line";
  })();

  return (
    <div className={`flex w-full flex-col gap-2 ${className}`}>
      {/* 시각적으로는 숨기되 포커스는 받는다 — label(htmlFor)로 연결돼 있어
          Tab → Enter/Space 만으로 파일 선택 다이얼로그가 열린다. */}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        disabled={uploading}
        className="peer sr-only"
        aria-label={ariaLabel}
        aria-invalid={Boolean(message)}
        aria-describedby={describedBy}
      />

      {/* biome-ignore lint/a11y/noStaticElementInteractions: 드래그앤드롭 전용 핸들러라 키보드 등가가 원천적으로 없다 — 진짜 키보드 경로는 위 sr-only input(label htmlFor 연결)이 맡는다. */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex h-45.5 w-full items-center justify-center rounded-xl border bg-surface-footer px-5 py-10 transition-colors peer-focus-visible:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/30 ${dropzoneBorderClassName}`}
      >
        {value ? (
          // [시안 부재 — 파생 추정] 선택 완료 뷰.
          <div className="flex w-full max-w-65 flex-col items-center gap-2">
            <FileText
              className="h-8 w-8 text-accent"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <p className="w-full break-all text-center text-[1rem] font-medium leading-[1.4] text-ink-strong">
              {value.name}
            </p>
            <p className="text-[0.875rem] leading-[1.4] text-ink-sub">
              {formatFileSize(value.size)}
            </p>
            {/* 업로드 진행 상태 — 실제 업로드/재시도 로직은 부모(MentorApplyForm) 소유,
                여기는 표시만 한다. role="status"(assertive 아님) — 폼 전체 assertive live
                region 은 submitError 한 곳뿐이어야 한다는 저장소 관례(MentorApplyForm.jsx
                submitError 주석)를 따른다. */}
            {uploading && (
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-1 text-[0.875rem] leading-[1.4] text-ink-sub"
              >
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                  strokeWidth={2}
                />
                업로드 중...
              </p>
            )}
            {uploadStatus === "done" && (
              <p className="flex items-center gap-1 text-[0.875rem] leading-[1.4] text-accent">
                <CheckCircle2
                  className="h-3.5 w-3.5"
                  aria-hidden="true"
                  strokeWidth={2}
                />
                업로드 완료
              </p>
            )}
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[0.875rem] font-medium leading-[1.4] text-ink-sub underline underline-offset-2 transition-colors hover:text-ink focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                uploading ? "cursor-not-allowed opacity-50" : ""
              }`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {/* 파일명을 라벨에 담아 스크린리더가 "무엇을" 삭제하는지 알 수 있게 한다. */}
              <span className="sr-only">{`${value.name} `}</span>
              삭제
            </button>
          </div>
        ) : (
          // 드롭존 내부는 260px(16.25rem) 폭 중앙정렬 — 시안 §폼 명세 5-1.
          <label
            htmlFor={id}
            className="flex w-full max-w-65 cursor-pointer flex-col items-center gap-5"
          >
            <Upload
              className="h-8 w-8 text-ink-sub"
              aria-hidden="true"
              strokeWidth={1.5}
            />
            <span className="flex flex-col items-center gap-2">
              <span className="text-center text-[1rem] font-medium leading-[1.4] text-ink-strong">
                {BODY_TEXT}
              </span>
              <span
                id={hintId}
                className="text-center text-[0.875rem] leading-[1.4] text-ink-sub"
              >
                {HINT_TEXT}
              </span>
            </span>
          </label>
        )}
      </div>

      {message && (
        <p
          id={errorId}
          role="alert"
          className="text-[0.875rem] leading-[1.4] text-error"
        >
          {message}
        </p>
      )}
    </div>
  );
}
