import { useState } from "react";
import { useMyEnrollment } from "./useMyEnrollment";

/**
 * 서비스 화면의 학년 칸을 잠글지(사 #40). 올해 학적이 있는 학생이 학년이 채워진 채로 화면을 연 경우만 잠근다.
 * 열 때의 값으로 정하므로 빈 채로 열어 학생이 고른 값은 다시 바꿀 수 있다.
 */
export function useGradeLock(value: string): boolean {
  const { data } = useMyEnrollment();
  const [valueAtLoad] = useState(value);
  return data?.enrollment != null && valueAtLoad !== "";
}
