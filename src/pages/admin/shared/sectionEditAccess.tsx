import { createContext, useContext } from "react";

// 지금 열린 메뉴에서 쓰기 동작(등록, 수정, 삭제, 저장)을 보여도 되는지.
// AdminLayout 이 권한 맵으로 정해 내려 주고, 섹션 화면은 이 값으로 쓰기 버튼을 감춘다.
// 기본값이 false 라 공급자 밖에서는 쓰기를 닫는다(fail-closed).
const SectionEditAccessContext = createContext(false);

export const SectionEditAccessProvider = SectionEditAccessContext.Provider;

export function useCanEditSection(): boolean {
  return useContext(SectionEditAccessContext);
}
