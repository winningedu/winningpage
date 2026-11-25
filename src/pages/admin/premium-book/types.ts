// 이 화면이 읽는 config 필드만 명시한다. 나머지(table, columns, fields, defaults 등)는 AdminTable 과
// AdminForm 이 쓰므로 인덱스 시그니처로 열어 둔다.
export interface PremiumBookAdminConfig {
  title: string;
  homepage?: boolean;
  guideText?: string;
  columns: readonly unknown[];
  fields?: readonly unknown[];
  [key: string]: unknown;
}
