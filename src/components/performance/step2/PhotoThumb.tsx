import { FileText, X } from "lucide-react";

// 첨부된 사진 썸네일 — docs/수행평가-상세-명세.md §5.7(`3754:3315`) 실측.
//
//   `image 379` @486,812 90×100(5.625rem×6.25rem) r8(0.5rem)
//   → PhotoAddTile 자리를 **덮는** 구조다(§5.7 단정 1) — 즉 같은 치수의 타일이
//     빈 슬롯 ↔ 썸네일로 갈아 끼워지는 것이고, 카드는 썸네일들 + 마지막 빈 슬롯을
//     같은 줄에 나열한다.
//   원본 비율이 90:100과 다를 수 있으므로 `object-cover`로 채운다(시안의 더미
//   이미지도 잘려 있다).
//
// ── 삭제(x) 버튼: **시안 없음.** §5.7 「상태 (미정)」이 "다중 첨부 시 썸네일 그리드·
//    삭제(x) 버튼·업로드 진행률·파일 형식 에러 시안 없음"이라고 명시했고, §8.8에도
//    제안이 없다. 그래서 최소한으로 만든다 — 선택을 되돌릴 방법이 아예 없으면 잘못
//    고른 사진을 5장 상한에 물린 채 진행하게 되기 때문이다.
//    구현 근거는 외부 앱의 같은 자리 UI(`suhaengpyeong/index.html:1571-1574`
//    `.image-thumb-remove` ✕ 버튼)뿐이며, 색·치수·위치는 시안이 없어 이 파일이
//    임의로 정한 값이다(우상단 1.25rem 원형, 반투명 먹). 시안이 나오면 교체할 것.
type PhotoThumbProps = {
  /** 로컬 미리보기 URL(`URL.createObjectURL`) 또는 서명 URL */
  src: string;
  /** 대체 텍스트. 안내문 내용은 알 수 없으므로 순번으로 구분한다. */
  alt?: string;
  /** 생략하면 삭제 버튼을 그리지 않는다(업로드 중 등). */
  onRemove?: () => void;
  /** 주면 이미지 대신 PDF 아이콘과 이 파일명을 보여준다(PDF는 `<img>`로 그릴 수 없다). */
  pdfName?: string;
};

export default function PhotoThumb({
  src,
  alt = "첨부한 안내문 사진",
  onRemove,
  pdfName,
}: PhotoThumbProps) {
  return (
    <div className="relative h-25 w-22.5 shrink-0 overflow-hidden rounded-lg border border-performance-line bg-performance-bubble">
      {pdfName ? (
        <div
          role="img"
          aria-label={alt}
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-1"
        >
          <FileText
            data-testid="pdf-thumb-icon"
            className="h-8 w-8 text-ink-sub"
            aria-hidden="true"
          />
          <span className="w-full break-all text-center text-app-caption text-ink-sub line-clamp-2">
            {pdfName}
          </span>
        </div>
      ) : (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      )}

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${alt} 삭제`}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white transition hover:bg-black/70"
        >
          <X className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
