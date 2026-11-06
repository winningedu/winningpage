// W8 서비스 탭. 주소의 탭 이름과 서버가 쓰는 서비스 키는 자기평가와 심화탐구에서 다르다.

export const TABS = [
  { key: "diagnosis", label: "학습진단", api: "diagnosis" },
  { key: "goal", label: "목표관리", api: "goal" },
  { key: "growth", label: "성장설계", api: "growth" },
  { key: "performance", label: "수행평가", api: "performance" },
  { key: "self-assessment", label: "자기평가", api: "selfeval" },
  { key: "research", label: "심화탐구", api: "inquiry" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

export interface StatusItem {
  studentId: string;
  name: string;
  grade: string;
  groupName: string | null;
  className: string;
  number: number | null;
  /** 서비스 기록이 있어도 읽을 값이 없으면 null. */
  detail: Record<string, unknown> | null;
}
