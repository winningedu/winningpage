import { useState } from "react";
import AdmissionSectionView from "@/components/admission/AdmissionSectionView";
import SafeHtml from "@/components/admission/SafeHtml";
import type { AdmissionDoc } from "@/lib/admissionDoc";
import {
  HWP_SECTION_JSON_KEYS,
  isEmptyDoc,
  stableStringifyDoc,
  validateAdmissionDoc,
} from "@/lib/admissionDoc";
import { isDocRenderEnabled } from "@/lib/admissionFlags";
import {
  buildHwpCategoryDoc,
  buildHwpCategoryHtml,
  clean as cleanAdmissionText,
  HWP_SECTION_HTML_KEYS,
  HWP_SECTION_LABELS,
  HWP_SECTION_ORDER,
  splitHwpTextIntoSections,
} from "@/lib/admissionParsing";
import { toastWarning } from "@/pages/admin/shared/adminToast";
import { confirmAdmin } from "@/pages/admin/shared/confirmAdmin";

// admissionGuidelines row/form은 AdminForm(AdminEngine.jsx, 미변환)이 소유하는
// 제네릭 폼 상태다 — HWP 6섹션(raw/*_html/*_json) + university_name 정도만
// 이 파일이 실제로 읽고 쓰므로 그 키만 얕게 좁히고 나머지는 인덱스 시그니처로 둔다.
interface AdmissionGuidelinesForm {
  university_name?: string;
  [key: string]: unknown;
}

// resolveInfoContent(AdmissionGuidelines.jsx)와 동일한 dedup 검사 —
// buildHwpCategoryHtml이 만든 html은 admission-raw-section-wrap을 자체
// 포함하지만, 과거 다른 경로로 저장된 값은 admission-existing-html을 이미
// 포함할 수도 있다. 이미 자기 래퍼가 있으면 SafeHtml에 className을 더
// 주지 않는다 — 안 그러면 admission-existing-html이 이중으로 붙어
// overflow-x:auto 스크롤 컨테이너가 중첩된다(공개 모달에서 실제로 발생했던
// 버그와 동일 패턴).
const ADMISSION_EXISTING_WRAP_RE =
  /admission-existing-html|admission-raw-section-wrap/;

// admissionGuidelines 저장 직전 가드: 이미 존재하던 행을 수정하면서(신규 등록은 대상 아님)
// 공개 페이지가 실제로 렌더하는 *_html/*_json 필드 중 하나라도 원래 값과 달라지면, 어떤
// 카테고리가 바뀌는지 목록으로 보여주고 확인을 받는다. 취소하면 저장을 막는다.
//
// doc(jsonb) 변경은 문자열 비교로 못 잡는다 — form[jsonKey]/row[jsonKey]는 객체라 단순
// 비교식으로 두면 서로 다른 객체끼리도 항상 '[object Object]' === '[object Object]'로
// "같음" 판정된다(실질적으로 이 가드가 무력화된다). stableStringifyDoc로 deep 비교해야
// 실제 doc 변경을 잡는다(generatedAt은 stableStringifyDoc이 비교에서 알아서 뺀다).
export async function admissionGuidelinesValidate(
  form: AdmissionGuidelinesForm,
  row?: AdmissionGuidelinesForm | null,
): Promise<string | null> {
  if (!row) return null;

  const changedLabels = HWP_SECTION_ORDER.filter((key: string) => {
    const htmlKey = HWP_SECTION_HTML_KEYS[key];
    const jsonKey =
      HWP_SECTION_JSON_KEYS[key as keyof typeof HWP_SECTION_JSON_KEYS];
    const htmlChanged =
      cleanAdmissionText(form[htmlKey]) !==
      cleanAdmissionText(row[htmlKey] ?? "");
    const docChanged =
      stableStringifyDoc((form[jsonKey] as AdmissionDoc | null) ?? null) !==
      stableStringifyDoc((row[jsonKey] as AdmissionDoc | null) ?? null);
    return htmlChanged || docChanged;
  }).map((key: string) => HWP_SECTION_LABELS[key]);

  if (changedLabels.length === 0) return null;

  const proceed = await confirmAdmin({
    title: "다음 항목의 공개 페이지 내용이 변경됩니다:",
    description: `- ${changedLabels.join("\n- ")}\n\n계속 저장하시겠습니까?`,
    confirmLabel: "계속",
  });

  return proceed ? null : "저장이 취소되었습니다.";
}

interface AdmissionParsingPreviewProps {
  form: AdmissionGuidelinesForm;
  onPatch: (patch: Record<string, unknown>) => void;
  locked?: boolean;
}

// admissionGuidelines 편집 폼 전용: HWP 원문 텍스트를 붙여넣으면 공유 파싱 모듈(admissionParsing.js)로
// 6개 카테고리(raw + *_html)를 자동으로 채우고, 실제 공개 페이지 모달과 동일한 표 스타일로 미리보기를
// 렌더한다. 번호("1.~6.") 마커가 없어 자동 분할이 안 되는 원문이면, 좌측 필드 목록에 이미 있는
// 카테고리별 raw textarea에 직접 나눠 붙여넣는 fallback을 안내하고 "미리보기 새로고침"으로 그 값을
// 기준으로 HTML을 재생성한다.
// locked: 카테고리 편집 다이얼로그가 열려 있는 동안 true. 파싱 실행은
// buildPreviewPatch로 **6섹션을 한 번에** patch하므로, 모달에서 편집 중인
// 섹션 doc이 발밑에서 통째로 갈릴 수 있다. 오버레이가 이미 클릭을 막지만
// 상태를 정합시키기 위해 버튼 자체를 disabled로 둔다(모달을 닫으면 풀린다).
export function AdmissionParsingPreview({
  form,
  onPatch,
  locked = false,
}: AdmissionParsingPreviewProps) {
  const [hwpSource, setHwpSource] = useState("");
  const [splitStatus, setSplitStatus] = useState<
    "auto" | "fallback" | "manual" | null
  >(null);
  // 카테고리별 "파싱 결과로 기존 HTML 덮어쓰기" 동의 체크박스 상태. 기본은 비동의(false) —
  // 이미 값이 있는 카테고리는 사용자가 명시적으로 동의해야만 덮어쓴다.
  const [overwriteConsent, setOverwriteConsent] = useState<
    Record<string, boolean>
  >({});

  function toggleConsent(key: string) {
    setOverwriteConsent((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // 카테고리 원문 → HTML+문서(doc) 파싱 결과를 patch로 만든다. 저장된 큐레이션 값을
  // 파괴하지 않기 위해 세 가지를 지킨다:
  // (a) 파싱 결과(html)가 빈 문자열이면 patch에서 제외한다 — 원문이 비어 있다고 기존
  //     값을 지우지 않는다(빈 문자열/빈 doc으로 덮어써서 공개 페이지에서 항목이
  //     사라지는 것을 방지).
  // (b) 이미 html 또는 doc 값이 채워져 있는 카테고리는 "덮어쓰기 동의" 체크박스를 켠
  //     경우에만 patch에 포함한다. 동의하지 않은 카테고리는 skipped로 반환해
  //     호출부가 안내한다.
  // (c) html과 doc은 반드시 같은 원문(sourceForm[key])에서 buildHwpCategoryHtml/
  //     buildHwpCategoryDoc로 동시에 만든다 — 서로 다른 시점/다른 소스에서 만들면
  //     공개 페이지(doc 기준)와 어드민 미리보기(예전엔 html만 봄)가 어긋난다. 이게
  //     바로 이번에 고치는 결함이다: 이전에는 patch[htmlKey]만 채우고 patch[jsonKey]가
  //     아예 없어서, 스위치(ADMISSION_JSON_ENABLED)가 켜진 뒤로는 관리자가 원문을
  //     고쳐 파싱을 실행해도 공개 페이지(doc을 읽음)에 반영되지 않았다.
  //     doc이 validateAdmissionDoc을 통과하지 못하면 jsonKey는 쓰지 않는다(기존 값
  //     보존) — 대신 docFailures로 반환해 호출부가 관리자에게 실패 사유를 보여준다.
  //     html은 그 경우에도 계속 갱신한다(원래도 무손실 폴백 경로라, doc이 실패해도
  //     html까지 막을 이유는 없다 — 적어도 html은 최신으로 유지된다).
  function buildPreviewPatch(sourceForm: AdmissionGuidelinesForm) {
    const patch: Record<string, unknown> = {};
    const skipped: string[] = [];
    const docFailures: { label: string; errors: string[] }[] = [];

    HWP_SECTION_ORDER.forEach((key: string) => {
      const htmlKey = HWP_SECTION_HTML_KEYS[key];
      const jsonKey =
        HWP_SECTION_JSON_KEYS[key as keyof typeof HWP_SECTION_JSON_KEYS];
      const rawText = sourceForm[key];

      const generatedHtml = buildHwpCategoryHtml(
        key,
        rawText,
        // admissionParsing.ts(다른 배치 소유)의 row 매개변수가 기본값 null만으로 타입
        // 추론돼(null | undefined) 실제 런타임 계약(임의 row 객체 허용)과 어긋난다 —
        // 그 파일은 이 배치 범위 밖이라 시그니처는 고치지 않고 호출부만 캐스팅한다.
        sourceForm as unknown as null,
        sourceForm.university_name,
      );
      if (!generatedHtml) return;

      const existingDoc = sourceForm[jsonKey] as
        | AdmissionDoc
        | null
        | undefined;
      const hasExisting =
        (existingDoc && !isEmptyDoc(existingDoc)) ||
        Boolean(cleanAdmissionText(sourceForm[htmlKey]));
      if (hasExisting && !overwriteConsent[key]) {
        skipped.push(HWP_SECTION_LABELS[key]);
        return;
      }

      patch[htmlKey] = generatedHtml;

      const generatedDoc = buildHwpCategoryDoc(
        key,
        rawText,
        // 위 buildHwpCategoryHtml 호출과 같은 이유(admissionParsing.ts row 매개변수
        // 오추론) — 호출부 캐스팅으로만 대응한다.
        sourceForm as unknown as null,
        sourceForm.university_name,
      );
      const docValidation = validateAdmissionDoc(generatedDoc);
      if (!docValidation.ok) {
        docFailures.push({
          label: HWP_SECTION_LABELS[key],
          errors: docValidation.errors,
        });
        return;
      }

      patch[jsonKey] = generatedDoc;
    });

    return { patch, skipped, docFailures };
  }

  function warnSkipped(skipped: string[]) {
    if (!skipped.length) return;
    toastWarning(
      "다음 카테고리는 이미 내용이 있어 자동 반영하지 않았습니다(기존 값 보존):",
      `${skipped.join(", ")}. 덮어쓰려면 해당 카테고리의 "파싱 결과로 덮어쓰기 동의" 체크박스를 켠 뒤 다시 실행하세요.`,
    );
  }

  function warnDocFailures(docFailures: { label: string; errors: string[] }[]) {
    if (!docFailures.length) return;
    const detail = docFailures
      .map((f) => `${f.label}: ${f.errors.join(" / ")}`)
      .join(", ");
    toastWarning(
      "다음 카테고리는 구조화 문서 생성에 실패해 기존 값을 보존했습니다(HTML만 갱신됨):",
      `${detail} 공개 페이지에 반영하려면 원문을 다시 확인하거나 개발팀에 문의하세요.`,
    );
  }

  function runAutoParse() {
    if (!cleanAdmissionText(hwpSource)) {
      toastWarning("HWP 원문 텍스트를 먼저 붙여넣어 주세요.");
      return;
    }

    const sections = splitHwpTextIntoSections(hwpSource);
    const found = HWP_SECTION_ORDER.some((key: string) =>
      cleanAdmissionText(sections[key]),
    );

    if (!found) {
      setSplitStatus("fallback");
      toastWarning(
        "번호(1.~6.) 마커를 찾지 못해 카테고리 자동 분할에 실패했습니다.",
        '좌측 각 카테고리의 원문 입력란에 항목별로 직접 붙여넣은 뒤 "미리보기 새로고침"을 눌러주세요.',
      );
      return;
    }

    const rawPatch: Record<string, unknown> = {};
    HWP_SECTION_ORDER.forEach((key: string) => {
      if (cleanAdmissionText(sections[key])) rawPatch[key] = sections[key];
    });
    const mergedRaw = { ...form, ...rawPatch };

    setSplitStatus("auto");
    const { patch, skipped, docFailures } = buildPreviewPatch(mergedRaw);
    onPatch({ ...rawPatch, ...patch });
    warnSkipped(skipped);
    warnDocFailures(docFailures);
  }

  function refreshPreview() {
    setSplitStatus((prev) => prev || "manual");
    const { patch, skipped, docFailures } = buildPreviewPatch(form);
    onPatch(patch);
    warnSkipped(skipped);
    warnDocFailures(docFailures);
  }

  return (
    <section className="admission-parsing-preview bg-white p-5 shadow-sm">
      <h2 className="text-sm font-black">HWP 원문 파싱 · 미리보기</h2>
      <p className="mt-1 text-xs font-bold leading-5 text-gray-500">
        모집요강 원문 전체(번호 &quot;1.~6.&quot; 포함)를 붙여넣고 파싱을
        실행하면 좌측 6개 카테고리 원문/HTML 필드가 자동으로 채워집니다. 자동
        분할이 안 되면 좌측 각 카테고리 원문 입력란에 직접 나눠 붙여넣은 뒤
        &quot;미리보기 새로고침&quot;을 눌러주세요.
      </p>

      <textarea
        value={hwpSource}
        onChange={(e) => setHwpSource(e.target.value)}
        rows={12}
        placeholder="HWP에서 복사한 모집요강 원문 전체를 붙여넣으세요"
        className="mt-3 w-full resize-y border border-[#9ca3af] bg-white px-3 py-2 font-mono text-xs leading-5 outline-hidden"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={runAutoParse}
          disabled={locked}
          className="rounded-sm border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-primary hover:bg-[#eef2ff] hover:text-primary disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300"
        >
          파싱 실행(자동 분할)
        </button>
        <button
          type="button"
          onClick={refreshPreview}
          disabled={locked}
          className="rounded-sm border border-gray-400 bg-white px-3 py-1.5 text-xs font-black transition hover:border-primary hover:bg-[#eef2ff] hover:text-primary disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-300 disabled:hover:border-gray-200 disabled:hover:bg-gray-50 disabled:hover:text-gray-300"
        >
          미리보기 새로고침(좌측 원문 기준)
        </button>
      </div>

      {locked && (
        <p className="mt-2 rounded-sm border border-[#c7d2fe] bg-[#eef2ff] px-3 py-2 text-xs font-black leading-5 text-primary">
          카테고리 편집 창이 열려 있는 동안에는 파싱을 실행할 수 없습니다.
          파싱은 6개 카테고리를 한 번에 덮어쓰므로 편집 중인 내용이 사라질 수
          있습니다.
        </p>
      )}

      {splitStatus === "fallback" && (
        <p className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black leading-5 text-amber-700">
          자동 분할 실패 — 좌측 각 카테고리 원문(raw) 입력란에 카테고리별로 직접
          붙여넣은 뒤 &quot;미리보기 새로고침&quot;을 눌러주세요.
        </p>
      )}

      {/* admission-modal-body는 여기 쓰지 않는다 — AdmissionGuidelines.jsx의 모달 스코프
          규칙에 기대는 죽은 참조였다(이 페이지엔 그 CSS가 로드되지 않는다, 2026-08-06
          전수조사로 확인). data-section은 카테고리별로 다르므로 아래 map 안 개별 항목에
          붙인다(minimum_requirements/exam_schedule 폭 규칙이 카테고리 단위이기 때문). */}
      <div className="mt-4 space-y-4 border-t border-[#edf0f4] pt-4">
        {HWP_SECTION_ORDER.map((key: string) => {
          const html = form[HWP_SECTION_HTML_KEYS[key]] as string | undefined;
          const doc = isDocRenderEnabled()
            ? (form[
                HWP_SECTION_JSON_KEYS[key as keyof typeof HWP_SECTION_JSON_KEYS]
              ] as AdmissionDoc | null | undefined)
            : null;
          const docOk = Boolean(
            doc && validateAdmissionDoc(doc).ok && !isEmptyDoc(doc),
          );
          // buildPreviewPatch는 아직 htmlKey만 채운다(jsonKey 동시 생성은 별도
          // 커밋 범위) — 그래도 doc이 이미 저장돼 있을 수 있으니(백필 등) 동의
          // 체크박스 노출 조건은 html뿐 아니라 doc 존재 여부도 함께 본다.
          const hasExisting = docOk || Boolean(cleanAdmissionText(html));
          return (
            <div key={key} className="admission-surface" data-section={key}>
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-black text-primary">
                  {HWP_SECTION_LABELS[key]}
                </h3>
                {hasExisting && (
                  <label className="flex items-center gap-1 text-[11px] font-bold text-amber-700">
                    <input
                      type="checkbox"
                      checked={Boolean(overwriteConsent[key])}
                      onChange={() => toggleConsent(key)}
                    />
                    파싱 결과로 덮어쓰기 동의
                  </label>
                )}
              </div>
              {docOk ? (
                <AdmissionSectionView
                  doc={doc}
                  sectionKey={key}
                  surface="admin"
                />
              ) : html ? (
                // html은 buildHwpCategoryHtml → buildRawSectionHtml 경로로 만들어지며
                // 보통 admission-raw-section-wrap을 자체 포함한다. 다만 이 필드는
                // 과거에 다른 경로로 저장된 값(admission-existing-html 자체 포함
                // 여부가 다를 수 있음)도 들어올 수 있어, 공개 모달과 동일하게
                // "이미 자기 래퍼를 가졌는지" 검사해 이중 래핑을 피한다.
                <SafeHtml
                  html={html}
                  {...(ADMISSION_EXISTING_WRAP_RE.test(html)
                    ? {}
                    : { className: "admission-existing-html" })}
                />
              ) : (
                <p className="text-xs font-bold text-muted-foreground">
                  미리보기 없음 — 원문을 입력하고 파싱을 실행하세요.
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* 표/블록 표면 스타일은 이제 AdmissionSurface.jsx가 소유한다(2단계, 2026-08-06
          사용자 지시 "컴포넌트화") — 여기 있던 자체 사본(그리드 테두리·13px·#013262 헤더 등,
          공개 모달의 수십 차례 Figma 재조정을 못 따라가 드리프트됐었다)은 삭제했다.
          이 페이지에 남기는 건 이 표 시스템과 무관한 범용 유틸리티 .muted뿐이다.
          ⚠ 2026-08-06 결함 수정: .admission-parsing-preview 스코프의 가로 스크롤바
          숨김 규칙(scrollbar-width:none 등)을 여기서 지웠다 — 이 패널의 6개 카테고리에
          admission-surface를 붙이면서(위 map 안) 이 패널의 .admission-scroll-table도
          그 숨김 규칙 대상이 됐는데, 공개 모달과 달리 이 페이지엔 대체 스크롤 수단
          (.admission-modal-x-scroll 프록시)이 없다 — 관리자가 870px 컨테이너 안에서
          1567px 표(모집인원및입결 등)를 스크롤할 방법 자체를 잃었다(실측: scrollLeft
          강제 설정하면 스크롤은 되는데 스크롤바가 안 보여 존재를 알 방법이 없었다).
          이 규칙을 처음 넣은 688ee97에는 스크롤 관련 근거 주석이 없다 — "모달과 동일하게
          유지"라는 범용 문구뿐이라, 프록시 스크롤바 전제(공개 모달 전용 장치, BLOCK3
          쉘 padding 계산에 의존)를 검증 없이 그대로 복사해온 것으로 보인다. 프록시를
          어드민에 옮기지 않고(공개 전용 장치를 옮기면 그 계산을 다시 맞춰야 함) 대신
          네이티브 스크롤바가 보이도록 숨김 규칙 자체를 없앴다. */}
      <style>{`
        .muted { color: #667085; }
      `}</style>
    </section>
  );
}
