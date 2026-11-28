// Entry of the v3 diagnosis engine. Pure TS shared by api/ and src/: no
// React, clock, site config or Supabase; inputs arrive as arguments.

import { buildPages, scoreEngine } from "./report.js";
import {
  type DiagnosisV3Answers,
  type DiagnosisV3Context,
  type DiagnosisV3Payload,
  SCHEMA_VERSION,
} from "./types.js";

export * from "./types.js";
export {
  type ValidationError,
  validateAnswers,
} from "./validate.js";

export function scoreDiagnosisV3(
  answers: DiagnosisV3Answers,
  context: DiagnosisV3Context,
): DiagnosisV3Payload {
  const engine = scoreEngine(answers, context);
  return {
    version: SCHEMA_VERSION,
    scores: engine.scores,
    pages: buildPages(engine),
  };
}
