// 성장설계 순수 함수 모듈 배럴.
// 이름이 겹치는 타입은 한쪽을 원래 이름으로 두고 다른 쪽에 모듈명 접두사를 붙여 내보낸다.

export * from "./axes.js";
export * from "./consistency.js";
export * from "./gradeCurve.js";
export * from "./gradeSystem.js";
export * from "./linkagePhrases.js";
export * from "./prefill.js";
export * from "./projection.js";
export * from "./sections.js";
export * from "./targetGrade.js";
export * from "./tracks.js";
export * from "./types.js";
export * from "./validation.js";

// 이름 충돌 해소
export type { SemesterAverage } from "./gradeSystem.js";
export type { SemesterAverage as GradeCurveSemesterAverage } from "./gradeCurve.js";
export type { SemesterSubjects } from "./gradeSystem.js";
export type { SemesterSubjects as PrefillSemesterSubjects } from "./prefill.js";
export type { SectionItem, ValidationResult } from "./sections.js";
export type {
  SectionItem as ValidationSectionItem,
  ValidationResult as ValidationValidationResult,
} from "./validation.js";
