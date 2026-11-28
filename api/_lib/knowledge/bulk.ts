// 수행평가 지식 DB 엑셀 일괄 반영의 한도와 필드 목록. 요청 검증과 변환은 shared/knowledge/request.ts 의 knowledgeBulkBody 가 맡는다.
// 라우트(api/_routes/admin/knowledge-bulk.ts)는 그 결과를 그대로 DB 에 쓴다.

import {
  BULK_REQUIRED_FIELDS,
  BULK_WRITABLE_FIELDS,
  MAX_BULK_ROWS,
} from "../../../shared/knowledge/contract.js";

// 한도와 필드 목록은 shared/knowledge/contract.ts 가 정하고 여기서 다시 내보낸다(src 가 이 파일에서 읽는다).
export { BULK_REQUIRED_FIELDS, BULK_WRITABLE_FIELDS, MAX_BULK_ROWS };
