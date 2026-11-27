// 멘토 신청 API 계약. 서버(api/_routes/admin/mentor-applications.ts)가 이 모양으로 돌려주고, 브라우저(멘토 신청 화면)가 응답 스키마로 검증한다.

import { z } from "zod";

// 쓰는 컬럼만 명시하고 나머지는 통과시킨다.
export const mentorApplicationSchema = z.looseObject({
  id: z.string(),
  status: z.string().nullish(),
  proof_file_path: z.string().nullish(),
  proof_file_name: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
});

export type MentorApplication = z.output<typeof mentorApplicationSchema>;

/** GET /api/admin/mentor-applications 응답. 최신순. */
export const mentorApplicationListSchema = z.object({
  items: z.array(mentorApplicationSchema),
});

export type MentorApplicationList = z.output<
  typeof mentorApplicationListSchema
>;
