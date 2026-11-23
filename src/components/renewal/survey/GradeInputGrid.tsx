/**
 * GradeInputGrid
 * Figma: hsokTD6OilcNEXyCR24sn4 / 1889:9045 (Q6 2세트 / Q7 1세트)
 *
 * 시안 실측:
 *   입력 박스 100×68 (6.25rem × 4.25rem) / radius 8 (0.5rem)
 *   필드 ↔ 필드 gap 16 (1rem) / 라벨 ↔ 박스 gap 4 (0.25rem)
 *   그룹 라벨 ↔ 필드행 gap 8 (0.5rem) / 세트 ↔ 세트 gap 20 (1.25rem)
 *   필드 라벨 16px Medium #808080 / 값·플레이스홀더 20px Regular
 *
 * 폭은 리커트와 함께 카드 콘텐츠 폭 992(62rem) 기준으로 통일한다 (SPEC §9-A6).
 * wide(1184) 이상은 100px 고정 트랙 auto-fill grid라 세트가 달라도 컬럼이 정렬된다.
 * 그 미만은 명시 열 수(3/4/6/7) + 1fr 트랙 — 아래 그리드 주석 참고.
 *
 * 상태 (§9-A2): hover border #B0B0B0 / focus border #013262 + outline 2px #0B84FD 30%
 *              filled 텍스트 #181D24 / error border #D92D20
 *
 * 고아 행(orphan row) 보정 (impeccable polish ①):
 *   문항마다 필드 수가 다르고(q6 1/1/6필드) 브레이크포인트마다 열 수도 다르므로
 *   (열 수) % (필드 수) 가 0이 아닌 조합에서는 마지막 줄이 다 차지 않는다. 열 수·필드 배치는
 *   그대로 두고, 부족분만큼 회색 disabled 플레이스홀더(순수 장식 <div>, aria-hidden)를 채워
 *   격자를 시각적으로 완성한다. 필드 수는 렌더 시점에만 정해지므로 Tailwind 클래스를
 *   문자열로 조립할 수 없어(JIT 인식 불가) 전용 CSS(grade-input-grid-filler.css)의
 *   data-v-{bp} 속성 스위치로 뷰포트별 표시 여부를 토글한다.
 */
import { useId } from "react";
import "../../../styles/grade-input-grid-filler.css";
import {
  GRADE_SYSTEM_INPUT_RULES,
  MOCK_GRADE_INPUT_RULE,
} from "@/data/renewalSurveyQuestions";

// grade-input-grid-filler.css 의 data-v-{bp} 속성명과 반드시 같은 순서로 대응한다.
// wide(74rem/1184px) 이상은 auto-fill(6.25rem) 트랙이지만, 그리드 자체가 max-w-[62rem](992px)로
// 캡핑되어 있고 이 폭은 wide 진입 시점에 이미 확보되는 상한이라(카드 padding·컨테이너 max-width가
// wide 임계값보다 먼저 고정된다) 실측상 열 수가 8로 고정된다(Playwright 실측 확인 완료).
const GRID_BREAKPOINTS = ["base", "sm", "md", "lg", "wide"];
const BREAKPOINT_COLS = [3, 4, 6, 7, 8];

export type GradeInputRule = {
  code: string;
  min: number;
  max: number;
  decimals: number;
  pattern: RegExp;
};

type GradeField = {
  key: string;
  label: string;
  scale?: string;
  placeholder?: string;
  placeholderBySystem?: Record<string, string>;
  required?: boolean;
};

export type GradeGroup = {
  key: string;
  label?: string;
  // QA 행348(2026-09-02) — q4 카드가 사라진 대신 등급 체계를 그룹 라벨에 괄호로 표기한다.
  // 체계별 항목이 없으면 label 로 폴백한다(placeholderBySystem 과 같은 계약).
  labelBySystem?: Record<string, string>;
  hiddenWhenGradeSystem?: string[];
  fields: GradeField[];
};

type GradeInputGridProps = {
  groups?: GradeGroup[];
  constraint?: GradeInputRule;
  value?: Record<string, string>;
  onChange?: (value: Record<string, string>) => void;
};

function neededFillerCount(fieldCount: number, cols: number) {
  // 한 줄 안에 다 들어가는 그룹은 애초에 '고아 행'이 없다. 채우면 격자가 완성되는 게 아니라
  // 입력칸 하나 뒤에 회색 박스가 줄줄이 붙어 비활성 입력칸처럼 보인다 — q6 재구성으로
  // 1칸짜리 그룹(내신 전체 평균 / 최근 시험 평균)이 생기면서 실제로 드러난 경로다.
  if (fieldCount <= cols) return 0;
  const remainder = fieldCount % cols;
  return remainder === 0 ? 0 : cols - remainder;
}

/**
 * 칸별 입력 규격 (명세 §3.4).
 *
 * `scale: 'MOCK'` 은 등급 체계와 무관하게 정수 1~9 고정이고, 나머지(내신·최근시험)는 q4 선택에 따라
 * 정의역이 통째로 바뀐다 — 중학생 평균은 100점 만점이라 기존 단일 마스크로는 `100` 을 타이핑조차 못 했다.
 * constraint 가 없는 호출부(등급 체계에 종속되지 않는 문항)는 9등급제 규격으로 떨어진다.
 */
function ruleForField(
  field: GradeField,
  constraint?: GradeInputRule,
): GradeInputRule {
  if (field.scale === "MOCK") return MOCK_GRADE_INPUT_RULE;
  return constraint ?? GRADE_SYSTEM_INPUT_RULES.NINE;
}

function isOutOfRange(raw: string, rule: GradeInputRule) {
  if (raw === "" || raw == null) return false;
  const num = Number(raw);
  if (Number.isNaN(num)) return true;
  return num < rule.min || num > rule.max;
}

export default function GradeInputGrid({
  groups,
  constraint,
  value,
  onChange,
}: GradeInputGridProps) {
  const values = value || {};
  // two grids on one screen (q6s, q6m) share field keys such as KOR
  const gridId = useId();

  function handleFieldChange(field: GradeField, raw: string) {
    if (raw !== "" && !ruleForField(field, constraint).pattern.test(raw))
      return;
    onChange?.({ ...values, [field.key]: raw });
  }

  if (!groups || groups.length === 0) return null;

  // 숨겨진 그룹의 기존 입력값은 지우지 않는다 — 사용자가 q4 를 잘못 눌렀다가 되돌릴 때 값이 날아가면
  // 복구할 방법이 없다. 대신 채점 계층이 등급 체계에 맞지 않는 칸을 무시한다(§3.4: MIDDLE_AVG →
  // recentExamAvg 미사용 · mockFilledCount = 0).
  const visibleGroups = groups.filter(
    // constraint 없으면 종전에도 includes(undefined)가 항상 false→visible이었다(동일 결과를 명시).
    (group) =>
      !constraint || !group.hiddenWhenGradeSystem?.includes(constraint.code),
  );

  return (
    <div className="flex w-full max-w-248 flex-col gap-5">
      {visibleGroups.map((group) => {
        const fieldCount = group.fields.length;
        // 브레이크포인트별로 부족한 칸 수. 그 중 최댓값만큼만 플레이스홀더 DOM을 만들고,
        // 각 뷰포트에서는 앞에서부터 필요한 개수만 data-v-{bp}="1"로 표시한다(나머지는 CSS로 숨김).
        const neededByBp = BREAKPOINT_COLS.map((cols) =>
          neededFillerCount(fieldCount, cols),
        );
        const fillerCount = Math.max(0, ...neededByBp);
        const fillers = Array.from({ length: fillerCount }, (_, i) => i);
        const groupLabel =
          group.labelBySystem?.[constraint?.code ?? ""] ?? group.label;

        return (
          <div key={group.key} className="flex w-full flex-col gap-2">
            {groupLabel && (
              <p className="text-base font-medium leading-5 text-ink">
                {groupLabel}
              </p>
            )}

            {/* 열 수는 명시 고정한다. sm 이상을 auto-fill(100px) 로 두면
                (a) 열 수가 3→4→5→7 로 폭에 따라 튀면서 폭마다 다른 그룹이 고아 행을 만들고
                (b) 남는 폭이 트랙으로 흡수되지 않아 그리드 우측에 34~38px 사공간이 생겼다.
                1fr 트랙 + 명시 열 수면 트랙 폭이 640→109.5 / 768→89 / 1024→110.6 으로 89~111px 대역에 머물고
                라벨 최장값 `1학년 1학기`(16px 실측 73.56px)도 truncate 없이 들어간다.
                wide(1184) 이상은 시안 규격(100px 고정 트랙)으로 복귀한다. */}
            <div className="grid w-full grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 wide:grid-cols-[repeat(auto-fill,6.25rem)]">
              {group.fields.map((field) => {
                const raw = values[field.key] ?? "";
                const rule = ruleForField(field, constraint);
                const outOfRange = isOutOfRange(raw, rule);
                const inputId = `${gridId}-${field.key}`;
                // 체계별 예시값이 따로 있으면 그것을 쓴다(중학생 평균에서 `3.24` 는 오입력을 유도한다).
                const placeholder =
                  field.placeholderBySystem?.[rule.code] ?? field.placeholder;

                return (
                  <div key={field.key} className="flex min-w-0 flex-col gap-1">
                    <label
                      htmlFor={inputId}
                      className="block truncate text-base font-medium leading-5 text-[#808080]"
                    >
                      {field.label}
                    </label>

                    <input
                      id={inputId}
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      placeholder={placeholder}
                      value={raw}
                      onChange={(event) =>
                        handleFieldChange(field, event.target.value)
                      }
                      aria-invalid={outOfRange || undefined}
                      aria-required={field.required || undefined}
                      className={`h-17 w-full min-w-0 rounded-lg border bg-white text-center text-xl font-normal leading-5 text-ink-title transition-[border-color,box-shadow] duration-150 placeholder:text-line focus:outline-solid focus:outline-2 focus:outline-accent/30 ${
                        outOfRange
                          ? "border-[#D92D20]"
                          : "border-line hover:border-[#B0B0B0] focus:border-primary"
                      }`}
                    />
                  </div>
                );
              })}

              {fillers.map((i) => {
                const visibility: Record<string, string> = {};
                GRID_BREAKPOINTS.forEach((bp, bpIndex) => {
                  // neededByBp는 GRID_BREAKPOINTS와 동일 length로 생성되어 bpIndex는 항상 범위 내.
                  visibility[`data-v-${bp}`] =
                    i < neededByBp[bpIndex]! ? "1" : "0";
                });

                return (
                  <div
                    key={`filler-${i}`}
                    aria-hidden="true"
                    className="fd-grade-filler pointer-events-none min-w-0 flex-col gap-1"
                    {...visibility}
                  >
                    <div className="h-5" />
                    <div className="h-17 w-full min-w-0 rounded-lg border border-[#EDEDED] bg-[#F5F5F5]" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
