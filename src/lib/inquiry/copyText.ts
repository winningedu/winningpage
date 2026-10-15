import { SECTIONS } from "./submission";
import type { SubmissionSections } from "./types";

export type BodyEntry = { id: string; heading: string; body: string };

/** 확정 작성본에서 본문이 있는 절만 Ⅰ~Ⅷ 순서로 뽑는다. 화면과 복사가 같은 목록을 쓴다. */
export function submissionBodyEntries(
  sections: SubmissionSections,
): BodyEntry[] {
  return SECTIONS.flatMap((meta) => {
    const body = sections[meta.id].trim();
    return body === ""
      ? []
      : [{ id: meta.id, heading: `${meta.numeral} ${meta.title}`, body }];
  });
}

/** 확정 작성본 8절을 "절 제목, 본문" 순서로 빈 줄을 두고 이은 복사용 글. 비어 있는 절은 뺀다. */
export function submissionCopyText(sections: SubmissionSections): string {
  return submissionBodyEntries(sections)
    .flatMap((e) => [e.heading, e.body])
    .join("\n\n");
}
