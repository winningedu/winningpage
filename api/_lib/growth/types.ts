// 성장설계 공용 타입. 여러 모듈이 같은 유니온을 각자 정의하지 않도록 한곳에 둔다.

/** 등급 체계: 5등급제(2025학년도 이후 입학) / 9등급제(2024학년도 이전 입학) */
export type GradeSystem = "five" | "nine";

/** 학생 트랙 */
export type Track = "고1" | "고2" | "고3" | "졸업" | "N수";

/** 고등학교 학년 */
export type HighGrade = "고1" | "고2" | "고3";

/** 학기 키 */
export type SemesterKey =
  | "고1-1"
  | "고1-2"
  | "고2-1"
  | "고2-2"
  | "고3-1"
  | "고3-2";

/** 위닝 5축 */
export type Axis = "A" | "B" | "C" | "D" | "E";
