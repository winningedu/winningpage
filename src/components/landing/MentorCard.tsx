/**
 * 멘토 카드 (MentorSection에서 추출한 프레젠테이션 컴포넌트)
 * - 카드 = #fbfafa 배경 + 상단 텍스트(badge/title_lines) + 하단 투명 인물사진(photo_url/photo) 합성
 * - badge/title_lines/photo_url/photo 중 하나라도 없는 row는 카드를 렌더하지 않음(null 반환)
 * - 마퀴/클론 로직은 MentorSection이 소유 — 이 컴포넌트는 isClone 여부만 받아 aria-hidden 처리
 * - 관리자 라이브 프리뷰에서도 동일 컴포넌트를 사용해 프리뷰=실렌더를 보장
 * - 0803 시안(카드 156px 폭, 시안 실값 155.84 — 210 원본 대비 ×0.742 균일 축소)은 DB의 210 기준
 *   원본 좌표를 그대로 두고 렌더 시 RENDER_SCALE(156/210)을 곱해서 축소한다 — DB 마이그레이션 없이
 *   시안에 맞춘다.
 */

import { site } from "@/config/site";

// MentorSection이 넘기는 mentor의 타입과 정확히 같은 모양으로 맞춘다(id + 인덱스 시그니처) —
// 여기서 badge/title_lines/photo_url/photo 등을 구체적인 optional 필드로 미리 좁혀 선언하면,
// MentorSection 쪽 `{ id; [key: string]: unknown }` 타입과 이름은 겹치되 값 타입이 달라(unknown
// vs string 등) 그 호출부에서 대입 타입 에러가 난다. 그래서 이 파일 안에서는 값을 쓰는 지점마다
// MentorFields로 좁혀 읽는다(호출부 타입은 건드리지 않는다).
type Mentor = {
  id: string | number;
  [key: string]: unknown;
};

// home_mentor_strategies row의 실제 사용 필드 — 이 파일 내부에서만 쓰는 좁히기 전용 타입.
//   - mentor_name: alt 텍스트 생성용 ("${mentor_name} 멘토")
//   - badge/title_lines: 카드 상단 텍스트 블록 (badge 1행 + title_lines 각 라인)
//   - photo_url/photo: 카드 하단 투명 인물사진 및 절대 위치(px, 210 기준 원본 — 렌더 시 RENDER_SCALE 적용 후 rem 환산)
//   - photo.crop: 사진 높이가 카드를 초과해 내부 크롭이 필요한 경우만 존재 (예: 김성훈)
//   - card_width: 카드 너비(px, 210 기준 원본), 기본 210
type MentorFields = {
  mentor_name?: string;
  badge?: string;
  title_lines?: string[];
  photo_url?: string;
  photo?: {
    top: number;
    left: number;
    width: number;
    height: number;
    crop?: { top: string; height: string };
  };
  card_width?: number;
  sort_order?: number;
};

function readMentorFields(mentor: Mentor): MentorFields {
  return mentor as MentorFields;
}

// 0803 시안 카드 156px 폭 (시안 실값 155.84, 210 원본 대비 ×0.742 균일 축소) 기준 렌더 스케일
// (DB는 여전히 210 기준 원본 좌표를 저장) — 이 스케일 하나로 높이/radius/텍스트/사진 좌표가 함께 축소된다.
const RENDER_SCALE = 156 / 210;

// 210 기준 카드 고정 치수(px) — 렌더 시 RENDER_SCALE 적용 후 rem 환산
const CARD_HEIGHT_PX = 360;
const CARD_RADIUS_PX = 20;
const TEXT_BLOCK_TOP_PX = 24;
const TEXT_BLOCK_WIDTH_PX = 196;
const TEXT_GAP_PX = 4;
const BADGE_FONT_PX = 16;
const LINE_FONT_PX = 15;

const toRem = (px: number) => `${(px * RENDER_SCALE) / 16}rem`;

type MentorCardProps = {
  mentor: Mentor;
  isClone?: boolean;
};

export default function MentorCard({
  mentor,
  isClone = false,
}: MentorCardProps) {
  const fields = readMentorFields(mentor);
  const hasPhoto = Boolean(fields.photo_url && fields.photo);
  // 스쿨멘토는 사진이 없는 카드도 기본 이미지로 그린다(결정 25). 위닝은 그대로 사진이 없으면 카드를 건너뛴다.
  const useDefaultImage = !hasPhoto && site.features.b2bMenu;
  const hasNewCard = Boolean(
    fields.badge && fields.title_lines && (hasPhoto || useDefaultImage),
  );
  if (!hasNewCard) return null;

  const { badge, title_lines, photo_url, photo, mentor_name, card_width } =
    fields;
  const titleLines = title_lines as string[];
  const photoBox = hasPhoto
    ? (photo as NonNullable<MentorFields["photo"]>)
    : null;

  return (
    <li
      aria-hidden={isClone || undefined}
      className="relative shrink-0 overflow-hidden bg-[#fbfafa]"
      style={{
        width: toRem(card_width || 210),
        height: toRem(CARD_HEIGHT_PX),
        borderRadius: toRem(CARD_RADIUS_PX),
      }}
    >
      <div
        className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center text-center"
        style={{
          top: toRem(TEXT_BLOCK_TOP_PX),
          width: toRem(TEXT_BLOCK_WIDTH_PX),
          gap: toRem(TEXT_GAP_PX),
        }}
      >
        <p
          className="font-semibold leading-[1.4] text-ink"
          style={{ fontSize: toRem(BADGE_FONT_PX) }}
        >
          {badge}
        </p>
        {titleLines.map((line) => (
          <p
            key={line}
            className="font-medium leading-[1.4] text-[#808080]"
            style={{ fontSize: toRem(LINE_FONT_PX) }}
          >
            {line}
          </p>
        ))}
      </div>
      {useDefaultImage ? (
        <div
          className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-surface-muted"
          style={{ height: "12.5375rem" }}
        >
          <img
            src={site.logo.horizontal}
            alt=""
            draggable="false"
            className="w-3/4 opacity-40"
          />
        </div>
      ) : (
        photoBox && (
          <div
            className={`absolute ${photoBox.crop ? "overflow-hidden" : ""}`}
            style={{
              top: toRem(photoBox.top),
              left: toRem(photoBox.left),
              width: toRem(photoBox.width),
              height: toRem(photoBox.height),
            }}
          >
            <img
              src={photo_url}
              alt={`${mentor_name} 멘토`}
              loading="lazy"
              draggable="false"
              className={
                photoBox.crop
                  ? "absolute left-0 w-full object-cover"
                  : "h-full w-full object-cover"
              }
              style={
                photoBox.crop
                  ? { top: photoBox.crop.top, height: photoBox.crop.height }
                  : undefined
              }
            />
          </div>
        )
      )}
    </li>
  );
}
