// 콘솔은 푸터 없이 사이트 헤더만 쓴다. 헤더가 position:fixed(h-16)라 그 높이만큼 내려 그린다.

import { Outlet } from "react-router";
import Header from "@/components/Header";

export default function ConsoleHeaderFrame() {
  return (
    <>
      <Header />
      <div className="pt-16">
        <Outlet />
      </div>
    </>
  );
}
