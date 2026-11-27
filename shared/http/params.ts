// 경로 구간으로 오는 id 스키마. 경로 값은 늘 문자열이다.

import { z } from "zod";

export const uuidId = z.uuid();

/** 숫자 글자만 받아 양의 안전 정수로 바꾼다. 0 으로 시작하는 값(05)은 같은 행을 가리키는 다른 주소가 생기므로 받지 않는다. */
export const positiveIntId = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.int().positive());
