// 학생 상세는 /admin/goalStudents/:id 실제 라우트다. 새로고침과 직접 입력이 같은 /admin 부모
// (requireAdminMiddleware, AdminLayout) 아래에서 열려야 섹션 권한 확인이 그대로 걸린다.
import { describe, expect, it } from "vitest";
import { requireAdminMiddleware } from "@/lib/routeMiddleware";
import adminRoutes from "./adminRoutes";

describe("어드민 라우트 goalStudents 상세", () => {
  const parent = adminRoutes[0];
  const paths = parent?.children?.map((child) => child.path) ?? [];

  it("/admin 부모(어드민 미들웨어) 아래에 goalStudents/:id 가 있다", () => {
    expect(parent?.middleware).toContain(requireAdminMiddleware);
    expect(paths).toContain("goalStudents/:id");
  });

  it("와일드카드(*)보다 앞에 있어 기본 섹션으로 튕기지 않는다", () => {
    expect(paths.indexOf("goalStudents/:id")).toBeLessThan(paths.indexOf("*"));
  });
});
