// analyticsConfigs: 통계 그룹(본사 대시보드, 방문 분석). 데이터는 각 화면이 API 로 받아
// 그리므로 제네릭 CRUD 가 아니라 custom 컴포넌트(CUSTOM_COMPONENT_REGISTRY)가 전부 그린다.

interface AnalyticsConfig {
  title: string;
  readOnly: true;
  custom: true;
  customComponentKey: string;
  columns: never[];
}

export const analyticsConfigs: Record<string, AnalyticsConfig> = {
  hqDashboard: {
    title: "대시보드",
    readOnly: true,
    custom: true,
    customComponentKey: "hqDashboard",
    columns: [],
  },
  webAnalytics: {
    title: "방문 분석",
    readOnly: true,
    custom: true,
    customComponentKey: "webAnalytics",
    columns: [],
  },
};
