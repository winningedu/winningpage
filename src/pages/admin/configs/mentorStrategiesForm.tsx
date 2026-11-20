import MentorCard from "@/components/landing/MentorCard";
import { ScrollArea } from "@/components/ui/scroll-area";

// ── 멘토 성공전략 카드: photo_layout jsonb ↔ 평탄화 폼 필드 변환 + 라이브 프리뷰 ──

// AdminForm이 config.rowToForm/formToPayload/validate/FormPreview에 넘기는 form은
// AdminEngine.jsx(미변환, allowJs)가 소유한 제네릭 폼 상태라 구체 타입이 없다 —
// 여기서는 이 파일이 실제로 읽고 쓰는 photo_* 평탄화 키만 얕게 좁혀서 쓴다.
interface MentorForm {
  photo_top?: unknown;
  photo_left?: unknown;
  photo_width?: unknown;
  photo_height?: unknown;
  photo_crop_enabled?: unknown;
  photo_crop_top?: unknown;
  photo_crop_height?: unknown;
  title_lines?: unknown;
  mentor_name?: unknown;
  badge?: unknown;
  photo_url?: unknown;
  card_width?: unknown;
  [key: string]: unknown;
}

interface PhotoLayout {
  top: number;
  left: number;
  width: number;
  height: number;
  crop?: { top: string; height: string };
}

const MENTOR_PHOTO_FORM_KEYS = [
  "photo_top",
  "photo_left",
  "photo_width",
  "photo_height",
  "photo_crop_enabled",
  "photo_crop_top",
  "photo_crop_height",
] as const;

// 프리셋 좌표 근거: sql/30 백필 22건 (표준 = 최빈 배치, 와이드 = 김무경, 크롭형 = 김성훈)
const MENTOR_CARD_PRESETS: {
  label: string;
  help: string;
  patch: Record<string, unknown>;
}[] = [
  {
    label: "표준",
    help: "기존 22건 최빈 배치 — 210 카드",
    patch: {
      card_width: 210,
      photo_top: 106,
      photo_left: 0,
      photo_width: 210,
      photo_height: 270,
      photo_crop_enabled: false,
      photo_crop_top: "",
      photo_crop_height: "",
    },
  },
  {
    label: "와이드 230",
    help: "김무경형 — 넓은 카드",
    patch: {
      card_width: 230,
      photo_top: 95,
      photo_left: 0,
      photo_width: 230,
      photo_height: 296,
      photo_crop_enabled: false,
      photo_crop_top: "",
      photo_crop_height: "",
    },
  },
  {
    label: "크롭형",
    help: "김성훈형 — 큰 사진 상단 크롭",
    patch: {
      card_width: 210,
      photo_top: 92,
      photo_left: 0,
      photo_width: 210,
      photo_height: 392,
      photo_crop_enabled: true,
      photo_crop_top: "-16.26%",
      photo_crop_height: "116.12%",
    },
  },
];

function parseMentorTitleLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((line) => String(line).trim()).filter(Boolean);
  }
  return String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// 폼의 photo_* 평탄화 값 → photo_layout jsonb ({top,left,width,height,crop?}) / 미완성이면 null
function buildMentorPhotoLayout(form: MentorForm): PhotoLayout | null {
  const raw = [
    form.photo_top,
    form.photo_left,
    form.photo_width,
    form.photo_height,
  ];
  if (raw.some((v) => v === "" || v === null || v === undefined)) return null;

  // raw는 항상 4개 원소를 가진 고정 배열이라 map 결과도 4개다(런타임 보장) — 튜플로 캐스팅해
  // 구조분해 결과가 number(undefined 아님)로 좁혀지게 한다.
  const [top, left, width, height] = raw.map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if (![top, left, width, height].every(Number.isFinite)) return null;
  if (width <= 0 || height <= 0) return null;

  const layout: PhotoLayout = { top, left, width, height };

  if (form.photo_crop_enabled) {
    const cropTop = String(form.photo_crop_top || "").trim();
    const cropHeight = String(form.photo_crop_height || "").trim();
    if (cropTop && cropHeight)
      layout.crop = { top: cropTop, height: cropHeight };
  }

  return layout;
}

export function mentorRowToForm(
  row: Record<string, unknown>,
): Record<string, unknown> {
  let titleLines: unknown = row.title_lines;
  if (typeof titleLines === "string") {
    try {
      titleLines = JSON.parse(titleLines);
    } catch {
      titleLines = null;
    }
  }

  const layout: PhotoLayout | null =
    row.photo_layout && typeof row.photo_layout === "object"
      ? (row.photo_layout as PhotoLayout)
      : null;

  const form: Record<string, unknown> = {
    ...row,
    title_lines: Array.isArray(titleLines) ? titleLines.join("\n") : "",
    card_width: row.card_width ?? 210,
    photo_top: layout?.top ?? "",
    photo_left: layout?.left ?? "",
    photo_width: layout?.width ?? "",
    photo_height: layout?.height ?? "",
    photo_crop_enabled: Boolean(layout?.crop),
    photo_crop_top: layout?.crop?.top ?? "",
    photo_crop_height: layout?.crop?.height ?? "",
  };

  delete form.photo_layout;
  return form;
}

// 크롭 사용 체크했는데 top/height 중 하나라도 비면 저장 중단 (조용한 소실 방지)
// 반환값: 에러 메시지(문자열) 또는 null(검증 통과)
export function mentorFormValidate(form: MentorForm): string | null {
  if (form.photo_crop_enabled) {
    const cropTop = String(form.photo_crop_top || "").trim();
    const cropHeight = String(form.photo_crop_height || "").trim();
    if (!cropTop || !cropHeight) {
      return "크롭 값(top/height)을 모두 입력해야 크롭이 적용됩니다";
    }
  }
  return null;
}

export function mentorFormToPayload(form: MentorForm): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...form };
  const titleLines = parseMentorTitleLines(form.title_lines);

  payload.mentor_name = String(form.mentor_name || "").trim();
  payload.badge = String(form.badge || "").trim() || null;
  payload.title_lines = titleLines.length > 0 ? titleLines : null;
  // title 컬럼은 NOT NULL(DEFAULT 없음)인데 랜딩 렌더는 title_lines만 소비한다 —
  // title_lines 첫 줄 → mentor_name → 고정 문자열 순으로 채워 INSERT 23502를 막는다.
  payload.title =
    titleLines[0]?.trim() ||
    String(form.mentor_name || "").trim() ||
    "멘토 전략";
  payload.photo_url = form.photo_url || null;
  payload.photo_layout = buildMentorPhotoLayout(form);
  payload.card_width = Number(form.card_width) || 210;

  for (const key of MENTOR_PHOTO_FORM_KEYS) delete payload[key];
  return payload;
}

interface MentorCardFormPreviewProps {
  form: MentorForm;
  onPatch: (patch: Record<string, unknown>) => void;
}

export function MentorCardFormPreview({
  form,
  onPatch,
}: MentorCardFormPreviewProps) {
  const titleLines = parseMentorTitleLines(form.title_lines);
  const photoLayout = buildMentorPhotoLayout(form);

  // MentorCard(공개 랜딩과 동일 컴포넌트)가 기대하는 mentor prop shape로 매핑
  const previewMentor = {
    id: "preview",
    mentor_name: String(form.mentor_name || "").trim() || "멘토",
    badge: String(form.badge || "").trim(),
    title_lines: titleLines.length > 0 ? titleLines : null,
    photo_url: form.photo_url || "",
    photo: photoLayout,
    card_width: Number(form.card_width) || 210,
  };

  const isMissingRequiredFields = !(
    previewMentor.badge &&
    titleLines.length > 0 &&
    previewMentor.photo_url &&
    photoLayout
  );

  return (
    <section className="bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black">라이브 프리뷰</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
        메인 &apos;멘토&apos; 영역과 동일한 컴포넌트로 렌더됩니다.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {MENTOR_CARD_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            title={preset.help}
            onClick={() => onPatch(preset.patch)}
            className="rounded-sm border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-primary hover:bg-[#FFF8E8] hover:text-primary"
          >
            {preset.label}
          </button>
        ))}
      </div>

      {isMissingRequiredFields && (
        <p className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-700">
          필수 항목(배지·소개 문구·인물 사진·사진 배치)이 비어 있어 랜딩에
          카드가 노출되지 않습니다.
        </p>
      )}

      <ScrollArea axis="x" className="mt-3 rounded-sm bg-primary p-5">
        {isMissingRequiredFields ? (
          <p className="p-5 text-center text-xs font-bold leading-5 text-white/60">
            필수 항목을 모두 입력하면 카드 미리보기가 표시됩니다.
          </p>
        ) : (
          <ul className="m-0 flex list-none justify-center p-0">
            <MentorCard mentor={previewMentor} />
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
