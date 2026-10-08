// 위닝 수행 주제 DB, 위닝 수행 자료 DB 편집 폼 위의 접이식 작성 안내.
// 검색 품질이 카드 문장에 좌우되므로 저장 전에 지킬 규칙을 짧게 보여 준다.

import { RECOMMENDED_CONTENT_CHARS } from "./contentLength";

const GUIDE_ITEMS = [
  "카드 하나는 다른 카드 없이 읽혀도 뜻이 통하게 씁니다.",
  "제목은 내용을 요약하는 서술형으로 씁니다. 예: 마찰 계수를 바꿔 가며 경사면 낙하 시간을 비교하는 탐구",
  "과목명과 진로는 정식 명칭으로 씁니다. 검색이 정확한 단어에 반응합니다.",
  `핵심 내용은 ${RECOMMENDED_CONTENT_CHARS}자 안팎을 권장합니다.`,
  "임베딩 입력 상한이 약 8,000 토큰이라 한 카드에 여러 주제를 섞지 않습니다.",
  "출처와 링크는 실제로 확인한 것만 적습니다.",
  "저장하면 검색용 벡터가 자동으로 다시 만들어집니다.",
];

export default function WritingGuide() {
  return (
    <details className="mb-4 border border-[#c7d2fe] bg-[#eef2ff] px-4 py-3 text-sm">
      <summary className="cursor-pointer font-black text-[#2348ff]">
        카드 작성 안내
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-5 font-bold leading-6 text-gray-700">
        {GUIDE_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}
