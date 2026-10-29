import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import OutlineButton from "@/components/auth/OutlineButton";
import PrimaryButton from "@/components/auth/PrimaryButton";
import InlineCard from "@/components/performance/chat/InlineCard";
import {
  HEIC_REJECT_MESSAGE,
  IMAGE_ACCEPT_ATTR,
  isAllowedImageFile,
  isHeicFile,
  isPdfFile,
  MAX_FILE_BYTES,
  MAX_PHOTOS,
  MAX_TOTAL_BYTES,
  prepareGuideImage,
} from "@/lib/performance/guideImage";
import PhotoAddTile from "./PhotoAddTile";
import PhotoThumb from "./PhotoThumb";

// STEP2 안내문 업로드 카드 — docs/수행평가-상세-명세.md §5.6(`3754:3261`) / §5.7(`3754:3315`).
//
// ── 실측 (§5.6 「컴포넌트」)
//   카드      596×281 r16 stroke `#d9d9d9`, pad 좌우 1.875rem(30) 상 1.25rem(20) 하 1.5rem(24)
//             → `InlineCard`가 좌우/상단을 이미 그대로 갖고 있어 하단만 `pb-6`으로 얹는다.
//   제목      0.875rem/1.125rem w600 `#525252`   @486,747
//   설명      0.875rem/1.125rem w400 `#808080`   @486,773 (제목 아래 0.5rem)
//   타일 줄   @486,812 (설명 아래 1.25rem)
//   버튼 줄   @486,932 각 255×52 r12 (타일 아래 1.25rem)
//     · primary `분석 시작하기`  — 빈 상태 `#d9d9d9`(비활성) / 1장 이상 `#013262`(활성, §5.7 + §11.1 Q5)
//     · secondary `안내문 없이 시작하기` — stroke `#d9d9d9`, 라벨 1rem w500 `#808080`
//   버튼 2개(255+20+255=530)가 카드 내부 폭(536)보다 6px 좁다 — 시안의 우측 인셋
//   불일치이며 고정폭으로 옮기면 좁은 뷰포트에서 깨진다. 두 버튼을 `flex-1`로 나눠
//   내부 폭을 채우고 사이 간격만 실측대로 1.25rem을 준다.
//
// ── 문구는 원문 그대로다 (§5.6 「문구 원문」). 손대지 말 것.
//
// ── 첨부 표현 (§5.7 단정 1)
//   첨부된 사진은 PhotoAddTile **자리를 덮는다** — 같은 90×100 슬롯이 빈 타일 ↔ 썸네일로
//   갈아 끼워지는 구조다. 그래서 썸네일들을 먼저 깔고 마지막에 빈 타일 하나를 둔다
//   (5장을 채우면 빈 타일은 사라진다). 2~5장일 때의 줄바꿈 규칙·카드 최대 높이는
//   시안이 없다(§11.3 Q81) — `flex-wrap`으로 흘리고 카드 높이는 내용에 맡긴다.
//
// ── 클라이언트 검증은 1차 필터다
//   장수·용량·형식 상한을 여기서도 보지만 **정본은 서버**(`api/performance/upload-url.js`)다.
//   여기서 막는 이유는 불필요한 왕복과 실패한 업로드 자리(pending 고아 행)를 줄이는 것뿐이다.
//   에러 표시 UI는 시안에 없다(§11.3 Q39 — 시안에 토스트 컴포넌트 자체가 없다).
//   그래서 카드 안 한 줄 `role="alert"` 텍스트로 최소한만 만든다(BasicInfoForm의
//   `submitError` 표시와 같은 관례).
//
// ── 이 카드가 하지 않는 것
//   실제 업로드(`/api/performance/upload-url` → `uploadToSignedUrl`)와 분석 호출은
//   호출부(다음 슬라이스)의 몫이다. 이 컴포넌트는 **전처리까지 끝난 File 배열**을
//   `onSubmit`으로 넘긴다 — 업로드 진행률 표시도 시안이 없어 만들지 않았다(§5.7 미정).

const TITLE = "수행평가 안내문 업로드";
const DESCRIPTION =
  "PNG, JPG, PDF 파일을 여러 장 올릴 수 있어요. 안내문이 없으면 아래 버튼으로 직접 입력하세요.";

const TOO_MANY_MESSAGE = `안내문 사진은 최대 ${MAX_PHOTOS}장까지 올릴 수 있어요.`;
const FILE_TOO_LARGE_MESSAGE = "사진 한 장은 10MB까지 올릴 수 있어요.";
const TOTAL_TOO_LARGE_MESSAGE = "사진 전체 용량은 25MB까지 올릴 수 있어요.";
const UNSUPPORTED_MESSAGE = "PNG, JPG, WEBP 이미지 또는 PDF만 올릴 수 있어요.";
const PREPARE_FAILED_MESSAGE =
  "사진을 읽지 못했어요. 다른 파일로 다시 시도해 주세요.";

// 진행 상태 안내(스크린리더 전용). 시안에 진행률 UI가 없어(§5.7 「미정」) 보이는 요소를
// 임의로 만들지 않되, **상태 변화 자체가 전달되지 않는 것**은 별개 문제라 여기서 닫는다.
// 5장 × 10MB JPEG의 EXIF 판독 + createImageBitmap + canvas 리사이즈 + toBlob은 모바일에서
// 수 초가 걸린다 — 그동안 눈에 보이는 단서는 버튼 스피너(`loading={locked}`)가 담당하고,
// 이 문구가 같은 사실을 소리로 전달한다.
const PROCESSING_STATUS = "사진을 준비하는 중입니다.";
const SUBMITTING_STATUS = "안내문을 분석하는 중입니다.";
const attachedStatus = (count: number) => `사진 ${count}장이 첨부되었습니다.`;

// §8.8 「고지 문구」 확정 문구 — **한 글자도 바꾸지 말 것.**
//
// ⚠️ 이 줄은 **시안에 없다.** Figma 텍스트 노드 전량에서 이 문구는 0건이고(§11-Q82),
//   업로드 카드(`3754:3261`/`3754:3315`)에도 보관 안내 자리가 그려져 있지 않다.
//   그래도 넣는 이유: 원본을 90일 보관하는 것은 사용자에게 고지 없이 할 수 없는 처리이고,
//   §8.8이 이 문구를 정책 표의 「고지 문구」 행으로 확정했다. 삭제를 실제로 집행하는 쪽은
//   `api/performance/cleanup-attachments.js` + Vercel Cron 일 1회이므로, 이 문장은
//   빈말이 아니라 그 cron이 뒷받침한다.
//   시안 없이 추가되는 줄이라 위치·타이포는 임의 결정이다 — 버튼 줄 아래 각주로 두고
//   본문(0.875rem)보다 한 단계 작은 0.75rem `#808080`을 준다.
const RETENTION_NOTICE =
  "업로드한 안내문은 분석 목적으로만 사용되며 90일 후 자동 삭제됩니다.";

type GuidePhoto = {
  id: string;
  file: File;
  /** 미리보기용 objectURL. 반드시 해제해야 한다. */
  url: string;
};

type GuideUploadCardProps = {
  /** `분석 시작하기` — 전처리까지 끝난 파일 배열 */
  onSubmit?: (files: File[]) => void;
  /** `안내문 없이 시작하기`(§5.8 직접 입력 분기로 전환) */
  onSkip?: () => void;
  /** 업로드/분석 진행 중이면 두 버튼과 파일 선택을 잠근다 */
  submitting?: boolean;
  /** 호출부(업로드·분석) 실패 메시지 */
  submitError?: string | null;
};

export default function GuideUploadCard({
  onSubmit,
  onSkip,
  submitting = false,
  submitError = null,
}: GuideUploadCardProps) {
  // { id, file, url } — `url`은 미리보기용 objectURL이라 반드시 해제해야 한다.
  const [photos, setPhotos] = useState<GuidePhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 언마운트 시 남은 objectURL 해제. `photos`를 의존성에 넣으면 매 변경마다 해제돼
  // 미리보기가 깨지므로 ref로 최신 목록을 따로 들고 본다.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(
    () => () => {
      photosRef.current.forEach((photo) => {
        URL.revokeObjectURL(photo.url);
      });
    },
    [],
  );

  const locked = submitting || processing;

  async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files || []);
    // 같은 파일을 연속으로 고를 수 있게 즉시 비운다(외부 앱 `addImages`와 같은 이유).
    event.target.value = "";
    if (!picked.length) return;

    setError(null);
    setProcessing(true);

    try {
      const accepted: GuidePhoto[] = [];
      let message: string | null = null;
      let remaining = MAX_PHOTOS - photos.length;
      let usedBytes = photos.reduce((sum, photo) => sum + photo.file.size, 0);

      for (const file of picked) {
        if (remaining <= 0) {
          message = message || TOO_MANY_MESSAGE;
          break;
        }

        // §8.8 「HEIC」 — accept로 이미 걸러지지만, 파일 선택기 필터를 우회했거나
        // OS가 MIME을 안 붙인 경우가 남는다. 지정 문구로 해결 방법을 알려준다.
        if (isHeicFile(file)) {
          message = message || HEIC_REJECT_MESSAGE;
          continue;
        }

        if (!isAllowedImageFile(file)) {
          message = message || UNSUPPORTED_MESSAGE;
          continue;
        }

        let prepared: File;
        try {
          // 장변 2000px 리사이즈 + EXIF 회전 보정(§8.8). 상한 판정은 **전처리 후** 크기로
          // 한다 — 실제로 업로드되는 바이트가 그쪽이기 때문이다.
          prepared = await prepareGuideImage(file);
        } catch (prepareError) {
          console.error("[performance] 안내문 사진 전처리 실패:", prepareError);
          message = message || PREPARE_FAILED_MESSAGE;
          continue;
        }

        if (prepared.size > MAX_FILE_BYTES) {
          message = message || FILE_TOO_LARGE_MESSAGE;
          continue;
        }

        if (usedBytes + prepared.size > MAX_TOTAL_BYTES) {
          message = message || TOTAL_TOO_LARGE_MESSAGE;
          continue;
        }

        usedBytes += prepared.size;
        remaining -= 1;
        accepted.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file: prepared,
          url: URL.createObjectURL(prepared),
        });
      }

      if (accepted.length) setPhotos((prev) => [...prev, ...accepted]);
      if (message) setError(message);
    } finally {
      setProcessing(false);
    }
  }

  function handleRemove(id: string) {
    setPhotos((prev) => {
      const target = prev.find((photo) => photo.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((photo) => photo.id !== id);
    });
    setError(null);
  }

  const visibleError = submitError || error;

  // `aria-live` 영역은 **항상 마운트돼 있어야** 변경이 읽힌다(나중에 삽입되는 노드는
  // 브라우저·스크린리더 조합에 따라 초기 내용으로 취급돼 조용히 지나간다). 그래서
  // 문구만 갈아 끼우고 요소 자체는 조건부로 렌더하지 않는다.
  const statusMessage = (() => {
    if (processing) return PROCESSING_STATUS;
    if (submitting) return SUBMITTING_STATUS;
    if (photos.length) return attachedStatus(photos.length);
    return "";
  })();

  return (
    <InlineCard className="pb-6">
      <p className="text-app-label font-semibold text-ink">{TITLE}</p>
      <p className="mt-2 text-app-label text-ink-sub">{DESCRIPTION}</p>

      <div className="mt-5 flex flex-wrap gap-3">
        {photos.map((photo, index) => (
          <PhotoThumb
            key={photo.id}
            src={photo.url}
            alt={`첨부한 안내문 사진 ${index + 1}`}
            {...(isPdfFile(photo.file) ? { pdfName: photo.file.name } : {})}
            {...(locked ? {} : { onRemove: () => handleRemove(photo.id) })}
          />
        ))}

        {photos.length < MAX_PHOTOS && (
          <PhotoAddTile
            onClick={() => inputRef.current?.click()}
            disabled={locked}
          />
        )}
      </div>

      {/* §8.8 — accept를 `image/jpeg,image/png,image/webp`로 좁힌다. 외부 앱의
          `accept="image/*"`(suhaengpyeong/index.html:1540)는 HEIC가 그대로 선택된다. */}
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTR}
        multiple
        className="hidden"
        onChange={handleFilesSelected}
      />

      <p role="status" aria-live="polite" className="sr-only">
        {statusMessage}
      </p>

      {visibleError && (
        <p role="alert" className="mt-3 text-app-label text-[#d01c1c]">
          {visibleError}
        </p>
      )}

      <div className="mt-5 flex gap-5">
        {/* `loading`은 `submitting`이 아니라 `locked`다 — 전처리(`processing`)도 사용자가
            기다리는 시간이고, 그동안 아무 표시가 없으면 "파일을 골랐는데 버튼만 죽은"
            화면이 된다. `PrimaryButton`이 `loading`에 스피너와 `aria-busy`를 함께 건다. */}
        <PrimaryButton
          onClick={() => onSubmit?.(photos.map((photo) => photo.file))}
          disabled={photos.length === 0 || locked}
          loading={locked}
        >
          분석 시작하기
        </PrimaryButton>

        {/* 시안 secondary는 stroke `#d9d9d9` + 라벨 `#808080` w500이라 OutlineButton의
            muted 톤(border-line #d7d7d7 / text-ink)과 색만 다르다 — 컴포넌트를 새로
            만들지 않고 색은 클래스로 덮는다(`ink.sub`가 `ink.DEFAULT` 뒤, `performance.line`이
            top-level `line` 뒤에 정의돼 있어 유틸리티 순서상 이 두 개는 실제로 이긴다).
            **굵기만은 클래스로 못 덮는다** — 베이스의 `.font-semibold`가 스타일시트
            뒤쪽이라 항상 이긴다. 그래서 `weight` prop으로 고른다(OutlineButton 주석). */}
        <OutlineButton
          tone="muted"
          weight="medium"
          disabled={locked}
          {...(onSkip ? { onClick: onSkip } : {})}
          className="border-performance-line text-ink-sub"
        >
          안내문 없이 시작하기
        </OutlineButton>
      </div>

      {/* §8.8 보관 정책 고지 — 시안 없음(§11-Q82). 위 RETENTION_NOTICE 주석 참고. */}
      <p className="mt-4 text-app-caption text-ink-sub">{RETENTION_NOTICE}</p>
    </InlineCard>
  );
}
