// W11 학생불러오기-일괄설정. 교사 콘솔 /teacher/import. 담임은 셸(ConsoleLayout)이 막는다.
// 휴대폰(768 미만)에서는 ① 명단 엑셀과 ③ 일괄 변경을 숨기고 그룹 관리만 보인다(결정 8).

import { useState } from "react";
import PageHeader from "../PageHeader";
import GroupManager from "./GroupManager";
import RolloverSection from "./RolloverSection";

export default function ImportSetupPage() {
  const [text, setText] = useState("");
  return (
    <>
      <PageHeader
        title="학생불러오기-일괄설정"
        subtitle="명단 엑셀 올리기, 학년그룹 일괄 변경, 그룹(레벨) 관리"
        mobileSubtitle="그룹(레벨) 관리"
        notice="명단 엑셀 올리기와 학년그룹 일괄 변경은 PC나 태블릿에서 할 수 있어요"
      />
      <div className="flex max-w-content flex-col gap-5 px-4 md:px-8 lg:px-12">
        <div className="flex flex-col gap-5 max-md:hidden">
          <RolloverSection text={text} onTextChange={setText} />
        </div>
        <GroupManager />
      </div>
    </>
  );
}
