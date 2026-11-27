// app.onError. 던진 오류를 problem 응답으로 바꾼다. Hono 는 오류가 난 층에서 onError 를 부르므로 바깥 미들웨어(로그, 감사)는 최종 status 를 본다.

import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { PROBLEM_CODE } from "../../../shared/http/codes.js";
import { SectionPermissionDeniedError } from "../adminPermission.js";
import { RouteParamError } from "../handler.js";
import { CONFIG_ERROR_RESPONSE_MESSAGE } from "../httpResponse.js";
import { QaBlockedError } from "../qaAccount.js";
import { isSupabaseConfigError } from "../supabaseAdmin.js";
import { InvalidTimeZoneError, TimeZoneRequiredError } from "../timeZone.js";
import type { BaseEnv } from "./factory.js";
import {
  ProblemError,
  problemResponse,
  qaBlocked,
  validationFailed,
} from "./problem.js";

export const handleError: ErrorHandler<BaseEnv> = (error, c) => {
  if (error instanceof ProblemError) {
    return problemResponse(
      c,
      error.status,
      error.message,
      error.code,
      error.extra,
    );
  }
  if (error instanceof QaBlockedError) {
    const qa = qaBlocked(error.code);
    return problemResponse(c, 403, qa.message, qa.code, qa.extra);
  }
  if (error instanceof RouteParamError) {
    return validationFailed(c, [{ path: error.path, message: error.message }]);
  }
  // zValidator 의 깨진 JSON 본문.
  if (error instanceof HTTPException && error.status === 400) {
    return validationFailed(c, []);
  }
  if (error instanceof SectionPermissionDeniedError) {
    return problemResponse(c, 403, error.message, PROBLEM_CODE.FORBIDDEN);
  }
  if (error instanceof InvalidTimeZoneError) {
    return problemResponse(
      c,
      400,
      error.message,
      PROBLEM_CODE.INVALID_TIME_ZONE,
    );
  }
  if (error instanceof TimeZoneRequiredError) {
    return problemResponse(
      c,
      400,
      error.message,
      PROBLEM_CODE.TIME_ZONE_REQUIRED,
    );
  }
  console.error(`${c.get("logLabel") || "handler"} error:`, error);
  if (isSupabaseConfigError(error)) {
    return problemResponse(c, 500, CONFIG_ERROR_RESPONSE_MESSAGE);
  }
  return problemResponse(c, 500, c.get("unhandledMessage"));
};
