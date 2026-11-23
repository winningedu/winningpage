// Entry of the v3 diagnosis engine. Pure TS shared by api/ and src/: no
// React, clock, site config or Supabase; inputs arrive as arguments.

import type {
  DiagnosisV3Answers,
  DiagnosisV3Context,
  DiagnosisV3Payload,
} from "./types.js";

export * from "./types.js";
export {
  type ValidationError,
  type ValidationResult,
  validateAnswers,
} from "./validate.js";

export function scoreDiagnosisV3(
  _answers: DiagnosisV3Answers,
  _context: DiagnosisV3Context,
): DiagnosisV3Payload {
  throw new Error("scoreDiagnosisV3 is not implemented");
}
