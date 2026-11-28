// 자기평가서 리포트 데이터 타입(명세 No.133~173). 모양의 정본은 shared/selfeval/report.ts 의 스키마이고
// 여기 타입은 그 z.output 에서 가져온다. 서버(api/_lib/selfeval/report)가 만들고 화면과 PDF 가 같은 모양으로 읽는다.

import type { z } from "zod";
import type {
  reportPayloadSchema,
  reportResponseSchema,
} from "../../../shared/selfeval/report.js";

/** 꼬리표 문자열. 예: P1, D2, A1, H3. */
export type ReportTag = string;

export type ReportPayload = z.output<typeof reportPayloadSchema>;

export type ReportCover = ReportPayload["cover"];
export type ReportStepKey = keyof ReportCover["steps"];

export type ReportCh01 = ReportPayload["ch01"];
export type ReportSentence =
  ReportCh01["paragraphs"][number]["sentences"][number];

export type ReportCh02 = ReportPayload["ch02"];
export type ReportCh02Subject = ReportCh02["subjects"][number];
export type ReportCh02Row = ReportCh02Subject["rows"][number];
export type ReportRecordKind = ReportCh02Row["kind"];
export type ReportRole = ReportCh02Row["role"];
export type ReportUnreflectedReason = NonNullable<ReportCh02Row["reasonCode"]>;

export type ReportCh03 = ReportPayload["ch03"];
export type ReportCh03Row = ReportCh03["rows"][number];
export type ReportRelation = ReportCh03Row["relation"];

export type ReportCh04 = NonNullable<ReportPayload["ch04"]>;
export type ReportCh04Row = ReportCh04["rows"][number];

export type ReportCh05 = ReportPayload["ch05"];
export type ReportTextCard = ReportCh05["cards"]["diagnosis"];
export type ReportTagCard = ReportCh05["cards"]["performance"];
export type ReportNextStep = ReportCh05["nextSteps"][number];
export type ReportNextStepKey = ReportNextStep["key"];

/** 태그 번호를 첫 생성 때 고정한 맵(No.146). 값은 기록 id 또는 수기 로그 id. */
export type ReportTagMap = Record<ReportTag, string>;

/** GET, POST /api/selfeval/report 성공 본문. */
export type ReportResponse = z.output<typeof reportResponseSchema>;

/** GET /api/selfeval/report 응답 본문. */
export type ReportView = ReportResponse["report"];

/** building 은 저장되지 않고, 선점이 진행 중일 때 읽기가 돌려준다. */
export type ReportViewStatus = ReportView["status"];
