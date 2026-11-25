// 멘토 신청 상태 값. 브라우저(상세 Select, 목록 라벨)와 서버(PATCH 검증)가 한 목록을 같이 쓴다.
// React 를 가져오지 않는다. api/ 도 이 파일을 불러온다.
// mentor_applications.status 컬럼에는 CHECK 가 없지만 이 6개가 실제 사용 값이다.

export const MENTOR_APPLICATION_STATUS_OPTIONS: {
  value: string;
  label: string;
}[] = [
  { value: "submitted", label: "제출됨" },
  { value: "screening", label: "서류심사" },
  { value: "interview", label: "면접" },
  { value: "training", label: "교육" },
  { value: "active", label: "활동중" },
  { value: "rejected", label: "불합격" },
];
