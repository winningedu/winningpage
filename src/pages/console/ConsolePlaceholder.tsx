// 아직 만들지 않은 콘솔 화면 자리. 가짜 데이터 없이 곧 열린다고만 알린다.

import { useLocation } from "react-router";
import { findMenuItem, menuLabel } from "./menu";
import PageHeader from "./PageHeader";
import { useConsoleMe } from "./useConsoleMe";

export default function ConsolePlaceholder() {
  const { pathname } = useLocation();
  const { me } = useConsoleMe();
  const item = findMenuItem(pathname);
  return (
    <>
      <PageHeader
        title={item ? menuLabel(item, me.tenant.orgType) : "준비 중인 화면"}
      />
      <p className="px-4 pb-12 text-app-body text-ink-sub md:px-8 lg:px-12">
        이 화면은 곧 열려요
      </p>
    </>
  );
}
