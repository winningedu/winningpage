// 특목고 합격 사례 카드 — 네이비 폴더 일러스트(전부 div + CSS, 이미지 에셋 없음).
// 러프 구현: 카드는 aspect-[344/242.38]로 폭에 비례해 스케일된다.
// 내부 지오메트리(세로)는 시안 원본 242.38px 기준 %로 환산했다. 폰트 크기만 rem 고정.
// 카드가 링크가 아니므로 <article>로 감싼다(수시정시 AdmissionCaseCard와 prop 공유 0개, 재사용하지 않음).
type HighschoolCaseRow = {
  year?: number | string;
  result_label?: string;
  student_name?: string;
  middle_school?: string;
  school_name?: string;
};

type SpecialHighschoolCaseCardProps = {
  row?: HighschoolCaseRow;
};

export default function SpecialHighschoolCaseCard({
  row,
}: SpecialHighschoolCaseCardProps) {
  const resultLabel = row?.result_label || "합격자";
  const metaLine1 = `${row?.year ?? ""}년 고입 ${resultLabel}`;
  const metaLine2 =
    row?.middle_school && row.middle_school !== ""
      ? `${row?.student_name || ""} (${row.middle_school})`
      : row?.student_name || "";

  return (
    <article className="relative mx-auto aspect-[344/242.38] w-full max-w-88 overflow-hidden bg-[#EAF3FF]">
      {/* 오른쪽 바깥 그림자(선택 폴리시) */}
      <div
        aria-hidden="true"
        className="absolute"
        style={{
          left: "84.6%",
          width: "10.8%",
          top: "35.48%",
          height: "64.36%",
          background: "linear-gradient(180deg, #9FA9B3 0%, #C0CCD8 100%)",
        }}
      />

      {/* 흰 종이 시트 */}
      <div
        aria-hidden="true"
        className="absolute rounded-sm bg-white"
        style={{
          left: "13%",
          right: "8%",
          top: "17.99%",
          height: "36.76%",
        }}
      />

      {/* 중간 네이비 시트 */}
      <div
        aria-hidden="true"
        className="absolute rounded-t-sm bg-gold-light"
        style={{
          left: "36.2%",
          right: "18.3%",
          top: "27.13%",
          height: "27.77%",
        }}
      />

      {/* 폴더 탭 */}
      <div
        aria-hidden="true"
        className="absolute rounded-tl-[0.3rem] bg-gold-tab"
        style={{
          left: "8.43%",
          width: "34.7%",
          top: "22.86%",
          height: "9.82%",
        }}
      >
        <span
          className="flex h-full items-center pl-[0.28rem] text-white"
          style={{
            fontSize: "0.70625rem",
            lineHeight: "0.90875rem",
          }}
        >
          Success Case
        </span>
      </div>

      {/* 폴더 본체 */}
      <div
        className="absolute bottom-0 overflow-hidden rounded-tr-[0.4rem] bg-cream"
        style={{ left: "8.43%", width: "79.94%", top: "32.7%" }}
      >
        {/* 메타 2줄 — 폴더 본체 높이 기준 18.85% 아래 */}
        <div
          className="absolute inset-x-0 px-2 text-center"
          style={{ top: "18.85%" }}
        >
          <p
            className="font-semibold text-gold-text"
            style={{
              fontSize: "0.70625rem",
              lineHeight: "0.90875rem",
            }}
          >
            {metaLine1}
          </p>
          <p
            className="text-taupe"
            style={{
              fontSize: "0.70625rem",
              lineHeight: "0.90875rem",
            }}
          >
            {metaLine2}
          </p>
        </div>

        {/* 학교명 — 폴더 본체 높이 기준 44.57% 아래 */}
        <p
          className="absolute inset-x-0 break-keep px-2 text-center font-bold text-navy-ink"
          style={{
            fontSize: "1.81875rem",
            lineHeight: "2.375rem",
            top: "44.57%",
          }}
        >
          {row?.school_name}
        </p>
      </div>
    </article>
  );
}
