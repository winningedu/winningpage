// 개인정보 접근 로그 화면의 데이터 호출. teachers 가 클라이언트에 막혀 있어 /api/admin/access-logs 로만 읽는다.

import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/lib/http/client";
import { addDaysYmd, dayStartUtc } from "@/lib/time/day";
import { browserTimeZone } from "@/lib/time/zone";

export type AccessLogKind = "view" | "edit" | "export" | "proxy";

const accessLogEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  tenantCode: z.string().nullable(),
  actorName: z.string().nullable(),
  actorEmail: z.string().nullable(),
  reason: z.string().nullable(),
  teacherName: z.string().nullable(),
  teacherLoginId: z.string().nullable(),
  teacherPhone: z.string().nullable(),
  kind: z.enum(["view", "edit", "export", "proxy"]),
  kindLabel: z.string(),
  targetStudentName: z.string().nullable(),
  content: z.string(),
  isProxy: z.boolean(),
});

export type AccessLogEntry = z.infer<typeof accessLogEntrySchema>;

const accessLogPageSchema = z.object({
  items: z.array(accessLogEntrySchema),
  page: z.number(),
  hasNext: z.boolean(),
});

export type AccessLogPage = z.infer<typeof accessLogPageSchema>;

export interface AccessLogFilter {
  tenantCode: string;
  from: string;
  to: string;
  kind: AccessLogKind | "";
  page: number;
}

export function accessLogsQueryOptions(filter: AccessLogFilter) {
  return queryOptions({
    queryKey: ["admin", "access-logs", filter],
    queryFn: ({ signal }) => {
      const searchParams: Record<string, string> = {
        page: String(filter.page),
      };
      if (filter.tenantCode) searchParams.tenantCode = filter.tenantCode;
      // 화면의 날짜는 브라우저 시간대의 하루다. 서버에는 from 포함, to 미포함인 ISO Z 시각으로 보낸다.
      const tz = browserTimeZone();
      if (filter.from) searchParams.from = dayStartUtc(filter.from, tz);
      if (filter.to)
        searchParams.to = dayStartUtc(addDaysYmd(filter.to, 1), tz);
      if (filter.kind) searchParams.kind = filter.kind;
      return api
        .get("admin/access-logs", { searchParams, signal })
        .json(accessLogPageSchema);
    },
  });
}
