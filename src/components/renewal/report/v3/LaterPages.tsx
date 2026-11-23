// Report v3 pages 7 to 16, one A4 sheet per page. Page 7 is absent for M3 (22_리포트요소 r70).
import type { DiagnosisV3Pages } from "@/lib/diagnosis-v3/types";
import Page07Admission from "./Page07Admission";
import Page08Mbti from "./Page08Mbti";
import Page09Temperament from "./Page09Temperament";
import Page10TempAdmission from "./Page10TempAdmission";
import Page11Plan from "./Page11Plan";
import Page16Services from "./Page16Services";
import PlannerPage from "./PlannerPage";

export default function LaterPages({ pages }: { pages: DiagnosisV3Pages }) {
  return (
    <>
      {pages.p7 ? <Page07Admission page={pages.p7} /> : null}
      <Page08Mbti page={pages.p8} />
      <Page09Temperament page={pages.p9} />
      <Page10TempAdmission page={pages.p10} />
      <Page11Plan page={pages.p11} />
      <PlannerPage page={pages.p12} no={12} />
      <PlannerPage page={pages.p13} no={13} />
      <PlannerPage page={pages.p14} no={14} />
      <PlannerPage page={pages.p15} no={15} />
      <Page16Services page={pages.p16} />
    </>
  );
}
