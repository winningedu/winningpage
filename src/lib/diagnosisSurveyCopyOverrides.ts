// 학습진단(ver2) 설문 문항 문구 어드민 오버레이 — sql/72_learning_diagnosis_v2_survey_copy.sql.
//
// renewalSurveyQuestions.js 는 채점 엔진과 강결합된 정본이라 절대 고치지 않는다. 이 모듈은
// title/helper/선택지 라벨/리커트 문장 **표시 문구만** DB 값으로 덮어씌우는 순수 오버레이 계층이다
// — scoringId/optionCodes/type/page 등 구조 필드는 원본을 그대로 통과시킨다(mentor_apply_copy와
// 같은 키 단위 폴백: 테이블이 없거나 특정 키가 없으면 그 필드만 정적 값을 쓴다).
import { supabase } from "./supabase";

const TABLE = "learning_diagnosis_v2_survey_copy";

type SurveyCopyRow = { copy_key: string; copy_value: string };

/** 조회 실패·0행이면 빈 Map — 호출부는 오버라이드 0건으로 취급해 원본 그대로 렌더한다. */
async function fetchSurveyCopyOverrides(): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("copy_key, copy_value");
  if (error || !data) return new Map();
  return new Map(
    (data as SurveyCopyRow[]).map((row) => [row.copy_key, row.copy_value]),
  );
}

/**
 * questions 배열에 오버라이드를 적용한 새 배열을 돌려준다. overrideMap 이 비어 있으면 원본을
 * 그대로 돌려준다(불필요한 리렌더 방지).
 *
 * exclusiveValues(OptionGroup 배타선택 매칭, §OptionGroup.jsx:71)는 라벨 문자열을 직접 비교하므로
 * 옵션 라벨을 오버라이드하면서 exclusiveCodes 를 경유해 함께 재계산한다 — 안 하면 q10/q12 의
 * "특별히 큰 어려움은 없어요" 류 배타 선택지가 문구 수정 한 번에 조용히 깨진다.
 */
function applySurveyCopyOverrides<T extends { id: string }>(
  questions: T[],
  overrideMap: Map<string, string> | null | undefined,
): T[] {
  if (!overrideMap || overrideMap.size === 0) return questions;

  return questions.map((question) => {
    // renewalSurveyQuestions.js(미변환 JS)의 문항 셰이프는 필드별로 존재 유무가 갈려
    // 제네릭 T 로는 표현할 수 없다 — 필드 존재는 아래에서 런타임으로 그대로 검사한다.
    const q: any = question;
    const id = q.id;
    let changed = false;
    const next: any = { ...q };

    const titleOverride = overrideMap.get(`${id}.title`);
    if (titleOverride !== undefined) {
      next.title = titleOverride;
      changed = true;
    }

    // helper 가 원래 null/빈 문자열인 문항은 시드 대상이 아니었다(§72 마이그레이션 스코프) —
    // 오버라이드 키도 존재하지 않으므로 이 분기는 자연히 스킵된다.
    if (q.helper) {
      const helperOverride = overrideMap.get(`${id}.helper`);
      if (helperOverride !== undefined) {
        next.helper = helperOverride;
        changed = true;
      }
    }

    if (Array.isArray(q.optionCodes) && q.optionCodes.length > 0) {
      const options = q.options.map((label: string, i: number) => {
        const code = q.optionCodes[i];
        if (code == null) return label;
        const override = overrideMap.get(`${id}.option.${code}`);
        return override !== undefined ? override : label;
      });

      if (options.some((label: string, i: number) => label !== q.options[i])) {
        next.options = options;
        changed = true;

        if (Array.isArray(q.exclusiveCodes) && q.exclusiveCodes.length > 0) {
          next.exclusiveValues = q.exclusiveCodes
            .map((code: string) => {
              const idx = q.optionCodes.indexOf(code);
              return idx === -1 ? null : options[idx];
            })
            .filter((label: string | null) => label !== null);
        }
      }
    }

    if (Array.isArray(q.extra?.statements) && q.extra.statements.length > 0) {
      const statements = q.extra.statements.map((statement: any) => {
        const override = overrideMap.get(`${id}.statement.${statement.key}`);
        return override !== undefined
          ? { ...statement, text: override }
          : statement;
      });

      if (
        statements.some(
          (statement: any, i: number) => statement !== q.extra.statements[i],
        )
      ) {
        next.extra = { ...q.extra, statements };
        changed = true;
      }
    }

    return changed ? next : question;
  });
}
