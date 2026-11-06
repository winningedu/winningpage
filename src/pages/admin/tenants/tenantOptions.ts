// 기관 등록 폼과 기관 상세가 함께 쓰는 선택지. DB 체크 제약과 1:1.

// tenants_region_check(20260922002929)와 1:1.
export const REGION_OPTIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
  "기타",
];

// tenants_org_type_check 와 1:1.
export const ORG_TYPE_OPTIONS = ["기관", "사기업", "학교", "캠퍼스", "기타"];

// tenants_tier_check 와 1:1. 라벨은 DB 코멘트("내부 분류용 등급")를 그대로 옮긴 것.
export const TIER_OPTIONS = [
  { value: "S", label: "S" },
  { value: "A", label: "A" },
  { value: "B", label: "B" },
  { value: "W", label: "W" },
];
