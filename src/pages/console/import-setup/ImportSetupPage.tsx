// W11 학생불러오기-일괄설정. 교사 콘솔 /teacher/import. 담임은 셸(ConsoleLayout)이 막는다.
// 휴대폰(768 미만)에서는 ① 명단 엑셀과 ③ 일괄 변경을 그리지 않고 그룹 관리만 보인다(결정 8).
// ① 은 엑셀을 브라우저에서 읽어 ③ 입력칸에 줄로 채운다(결정 50). 맞춤은 ③ 미리보기가 한다.

import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import PageHeader from "../PageHeader";
import { useToast } from "../Toast";
import Dropzone from "./Dropzone";
import GroupManager from "./GroupManager";
import RolloverSection from "./RolloverSection";
import { readRosterLines } from "./rosterFile";
import TemplateLink from "./TemplateLink";

export default function ImportSetupPage() {
  const toast = useToast();
  const [text, setText] = useState("");
  const [locked, setLocked] = useState(false);
  const mobile = useIsMobile();

  const readFile = async (file: File) => {
    try {
      setText(await readRosterLines(file));
    } catch (e) {
      toast.show({ tone: "Error", message: (e as Error).message });
    }
  };

  return (
    <>
      <PageHeader
        title="학생불러오기-일괄설정"
        subtitle="명단 엑셀 올리기, 학년그룹 일괄 변경, 그룹(레벨) 관리"
        mobileSubtitle="그룹(레벨) 관리"
        notice="명단 엑셀 올리기와 학년그룹 일괄 변경은 PC나 태블릿에서 할 수 있어요"
      />
      <div className="flex max-w-content flex-col gap-5 px-4 md:px-8 lg:px-12">
        {!mobile && (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <h2 className="flex-1 text-lg font-semibold tracking-[-0.02em] text-ink-strong">
                  ① 명단 엑셀 올리기
                </h2>
                <TemplateLink
                  file="student-roster.xlsx"
                  downloadName="스쿨멘토_학생불러오기_샘플.xlsx"
                />
              </div>
              <Dropzone
                accept=".xlsx,.xls,.csv"
                disabled={locked}
                onFile={(f) => void readFile(f)}
              />
            </section>
            <RolloverSection
              text={text}
              onTextChange={setText}
              onLockedChange={setLocked}
            />
          </div>
        )}
        <GroupManager />
      </div>
    </>
  );
}
