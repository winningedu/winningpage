// W6b, W12 가 함께 쓰는 학적 저장 도우미. 번호 입력 해석과 번호 중복 문구.

import { errorMessage } from "./api";
import type { GradeLabeler } from "./classLabel";
import { SAVE_FAILED_MESSAGE } from "./passwordRule";

export const CONFLICT_MESSAGE = "다른 분이 먼저 바꿨어요. 새로 고침해 주세요";
export const NUMBER_INVALID_MESSAGE = "번호는 1부터 99까지 숫자로 적어 주세요";

/** 비우면 번호를 지우는 것(null), 적었으면 1부터 99까지 정수(끝의 "번"은 뗀다). 그 밖은 undefined. */
export function parseNumber(input: string): number | null | undefined {
  const text = input.trim().replace(/번$/, "").trim();
  if (text === "") return null;
  if (!/^\d{1,2}$/.test(text)) return undefined;
  const value = Number(text);
  return value >= 1 ? value : undefined;
}

/** 서버가 번호를 쓰는 학생(occupant)을 실어 보낸다. 가린 이름 여부는 서버가 정한다(결정 30). */
export function numberTakenMessage(
  body: unknown,
  gradeLabel: GradeLabeler,
): string {
  const { occupant } = body as {
    occupant?: {
      grade: string;
      className: string;
      number: number;
      displayName: string | null;
    };
  };
  if (!occupant) return errorMessage(body) ?? SAVE_FAILED_MESSAGE;
  const place = `${gradeLabel(occupant.grade)} ${occupant.className}반 ${occupant.number}번`;
  const holder = occupant.displayName ? `, ${occupant.displayName}` : "";
  return `이미 사용 중인 번호예요(${place}${holder}). 다른 번호를 골라 주세요`;
}
