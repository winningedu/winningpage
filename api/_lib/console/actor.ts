// 콘솔 요청의 행위자. fn_console_actor 가 돌려준 값을 핸들러가 쓰기 좋은 모양으로 담는다.

export type ConsoleActorKind = "homeroom" | "school_admin" | "hq_proxy";

export interface ConsoleActor {
  kind: ConsoleActorKind;
  tenantId: string;
  /** 본사 대행(hq_proxy)이면 null. */
  teacherId: string | null;
  /** 담당 학급. 학교 관리자와 대행은 기관 전체라 비어 있다. */
  classIds: string[];
  /** 본사 대행 세션일 때만 값이 있다. */
  proxySessionId: string | null;
  mustChangePassword: boolean;
  /** 교사 로그인 아이디. 본사 대행이면 null. */
  loginId: string | null;
}
