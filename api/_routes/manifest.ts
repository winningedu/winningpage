import type { RouteLoader } from "./dispatch.js";

// 라우트 키(/api/ 뒤 경로)별 핸들러 지연 로더. 정적 문자열 지정자여야 Vercel 파일 추적기가 따라간다.
export const routes: Record<string, RouteLoader> = {
  "admin/me/activate": () => import("./admin/me/activate.js"),
  "admin/admission/active-year": () =>
    import("./admin/admission/active-year.js"),
  "admin/admission/results/count": () =>
    import("./admin/admission/results/count.js"),
  "admin/admission/results/rows": () =>
    import("./admin/admission/results/rows.js"),
  "admin/admission/results/bulk": () =>
    import("./admin/admission/results/bulk.js"),
  "admin/admission/guidelines/bulk": () =>
    import("./admin/admission/guidelines/bulk.js"),
  "admin/learning-diagnosis/questions": () =>
    import("./admin/learning-diagnosis/questions.js"),
  "admin/learning-diagnosis/questions/[id]": () =>
    import("./admin/learning-diagnosis/questions/[id].js"),
  "admin/learning-diagnosis/options": () =>
    import("./admin/learning-diagnosis/options.js"),
  "admin/learning-diagnosis/options/[id]": () =>
    import("./admin/learning-diagnosis/options/[id].js"),
  "admin/learning-diagnosis/programs": () =>
    import("./admin/learning-diagnosis/programs.js"),
  "admin/learning-diagnosis/programs/[id]": () =>
    import("./admin/learning-diagnosis/programs/[id].js"),
  "admin/mentor-applications/[id]": () =>
    import("./admin/mentor-applications/[id].js"),
  "admin/mentor-applications/[id]/proof-url": () =>
    import("./admin/mentor-applications/[id]/proof-url.js"),
  "admin/home-section-copy/[sectionKey]": () =>
    import("./admin/home-section-copy/[sectionKey].js"),
  "admin/hq-dashboard/summary": () => import("./admin/hq-dashboard/summary.js"),
  "admin/hq-dashboard/tenants": () => import("./admin/hq-dashboard/tenants.js"),
  "admin/hq-dashboard/usage": () => import("./admin/hq-dashboard/usage.js"),
  "admin/growth-reports": () => import("./admin/growth-reports.js"),
  "admin/growth-reports/[id]": () => import("./admin/growth-reports/[id].js"),
  "admin/hq-dashboard/logins": () => import("./admin/hq-dashboard/logins.js"),
  "admin/hq-dashboard/b2c": () => import("./admin/hq-dashboard/b2c.js"),
  "admin/hq-dashboard/trends": () => import("./admin/hq-dashboard/trends.js"),
  "admin/inquiry-sessions": () => import("./admin/inquiry-sessions.js"),
  "admin/inquiry-sessions/[id]": () =>
    import("./admin/inquiry-sessions/[id].js"),
  "admin/me/permissions": () => import("./admin/me/permissions.js"),
  "admin/knowledge-items/titles": () =>
    import("./admin/knowledge-items/titles.js"),
  "admin/knowledge-eval/queries": () =>
    import("./admin/knowledge-eval/queries.js"),
  "admin/knowledge-eval/queries/[id]": () =>
    import("./admin/knowledge-eval/queries/[id].js"),
  "admin/members/[id]": () => import("./admin/members/[id].js"),
  "admin/members/[id]/tenant": () => import("./admin/members/[id]/tenant.js"),
  "admin/members/[id]/messages": () =>
    import("./admin/members/[id]/messages.js"),
  "admin/members/[id]/orders": () => import("./admin/members/[id]/orders.js"),
  "admin/members/[id]/services": () =>
    import("./admin/members/[id]/services.js"),
  "admin/members/[id]/links": () => import("./admin/members/[id]/links.js"),
  "admin/sections/[key]": () => import("./admin/sections/[key].js"),
  "admin/sections/[key]/[id]": () => import("./admin/sections/[key]/[id].js"),
  "admin/sections/[key]/[id]/meta": () =>
    import("./admin/sections/[key]/[id]/meta.js"),
  "admin/sections/[key]/[id]/reviewed": () =>
    import("./admin/sections/[key]/[id]/reviewed.js"),
  "admin/sections/[key]/export": () =>
    import("./admin/sections/[key]/export.js"),
  "admin/selfeval-sessions": () => import("./admin/selfeval-sessions.js"),
  "admin/selfeval-sessions/[id]": () =>
    import("./admin/selfeval-sessions/[id].js"),
  "admin/premium-book/pages": () => import("./admin/premium-book/pages.js"),
  "admin/premium-book/pages/[id]": () =>
    import("./admin/premium-book/pages/[id].js"),
  "admin/revenue/pending": () => import("./admin/revenue/pending.js"),
  "admin/revenue/services": () => import("./admin/revenue/services.js"),
  "admin/roles/[id]": () => import("./admin/roles/[id].js"),
  "admin/roles/[id]/permissions": () =>
    import("./admin/roles/[id]/permissions.js"),
  "admin/staff/[profileId]": () => import("./admin/staff/[profileId].js"),
  "admin/staff/[profileId]/permissions": () =>
    import("./admin/staff/[profileId]/permissions.js"),
  "admin/students/search": () => import("./admin/students/search.js"),
  "admin/tenants/[id]": () => import("./admin/tenants/[id].js"),
  "admin/tenants/member-purge": () => import("./admin/tenants/member-purge.js"),
  "admin/tenants/member-purge-preview": () =>
    import("./admin/tenants/member-purge-preview.js"),
  "admin/tenants/move-student": () => import("./admin/tenants/move-student.js"),
  "admin/tenants/purge-logs": () => import("./admin/tenants/purge-logs.js"),
  "admin/tenants/school-admin": () => import("./admin/tenants/school-admin.js"),
  "admin/tenants/school-admins": () =>
    import("./admin/tenants/school-admins.js"),
  "admin/tenants/[id]/service-settings": () =>
    import("./admin/tenants/[id]/service-settings.js"),
  "admin/tenants/student-usage": () =>
    import("./admin/tenants/student-usage.js"),
  "admin/uploads": () => import("./admin/uploads.js"),
  "admin/uploads/preview": () => import("./admin/uploads/preview.js"),
  "auth/login": () => import("./auth/login.js"),
  "auth/teacher-reset-password": () =>
    import("./auth/teacher-reset-password.js"),
  "change-phone": () => import("./change-phone.js"),
  "check-service-access": () => import("./check-service-access.js"),
  "complete-refund": () => import("./complete-refund.js"),
  "confirm-payment": () => import("./confirm-payment.js"),
  "console/admission-coaching": () => import("./console/admission-coaching.js"),
  "console/assign-pool": () => import("./console/assign-pool.js"),
  "console/change-password": () => import("./console/change-password.js"),
  "console/classes": () => import("./console/classes.js"),
  "console/classes/capacity": () => import("./console/classes/capacity.js"),
  "console/classes/delete": () => import("./console/classes/delete.js"),
  "console/coaching": () => import("./console/coaching.js"),
  "console/coaching/print-log": () => import("./console/coaching/print-log.js"),
  "console/coaching/report": () => import("./console/coaching/report.js"),
  "console/coaching/service": () => import("./console/coaching/service.js"),
  "console/coaching/students": () => import("./console/coaching/students.js"),
  "console/counsel-status": () => import("./console/counsel-status.js"),
  "console/dashboard": () => import("./console/dashboard.js"),
  "console/enrollment-requests": () =>
    import("./console/enrollment-requests.js"),
  "console/enrollment-requests/count": () =>
    import("./console/enrollment-requests/count.js"),
  "console/enrollment-requests/decide": () =>
    import("./console/enrollment-requests/decide.js"),
  "console/enrollment/export": () => import("./console/enrollment/export.js"),
  "console/enrollment/summary": () => import("./console/enrollment/summary.js"),
  "console/first-password": () => import("./console/first-password.js"),
  "console/graduates": () => import("./console/graduates.js"),
  "console/groups": () => import("./console/groups.js"),
  "console/groups/delete": () => import("./console/groups/delete.js"),
  "console/me": () => import("./console/me.js"),
  "console/memos": () => import("./console/memos.js"),
  "console/memos/hide": () => import("./console/memos/hide.js"),
  "console/org-info": () => import("./console/org-info.js"),
  "console/org-info/confirm": () => import("./console/org-info/confirm.js"),
  "console/proxy/end": () => import("./console/proxy/end.js"),
  "console/proxy/start": () => import("./console/proxy/start.js"),
  "console/proxy/tenants": () => import("./console/proxy/tenants.js"),
  "console/school-year": () => import("./console/school-year.js"),
  "console/school-year/rollover": () =>
    import("./console/school-year/rollover.js"),
  "console/school-year/rollover/preview": () =>
    import("./console/school-year/rollover/preview.js"),
  "console/service-status": () => import("./console/service-status.js"),
  "console/students": () => import("./console/students.js"),
  "console/students/detail": () => import("./console/students/detail.js"),
  "console/students/enrollment": () =>
    import("./console/students/enrollment.js"),
  "console/students/enrollment-history": () =>
    import("./console/students/enrollment-history.js"),
  "console/students/flag": () => import("./console/students/flag.js"),
  "console/students/history": () => import("./console/students/history.js"),
  "console/teachers/accounts": () => import("./console/teachers/accounts.js"),
  "console/teachers/assignments": () =>
    import("./console/teachers/assignments.js"),
  "console/teachers/connect-preview": () =>
    import("./console/teachers/connect-preview.js"),
  "console/teachers/delete": () => import("./console/teachers/delete.js"),
  "console/teachers/import": () => import("./console/teachers/import.js"),
  "console/teachers/import-preview": () =>
    import("./console/teachers/import-preview.js"),
  "console/teachers/issue": () => import("./console/teachers/issue.js"),
  "console/teachers/list": () => import("./console/teachers/list.js"),
  "console/teachers/name": () => import("./console/teachers/name.js"),
  "console/teachers/register": () => import("./console/teachers/register.js"),
  "console/teachers/reissue": () => import("./console/teachers/reissue.js"),
  "console/teachers/status": () => import("./console/teachers/status.js"),
  "console/teachers/unissued": () => import("./console/teachers/unissued.js"),
  "create-consult-request": () => import("./create-consult-request.js"),
  "create-service-ticket": () => import("./create-service-ticket.js"),
  "delete-account": () => import("./delete-account.js"),
  "diagnosis/access": () => import("./diagnosis/access.js"),
  "diagnosis/consume": () => import("./diagnosis/consume.js"),
  "diagnosis/submit": () => import("./diagnosis/submit.js"),
  "enrollment/join-tenant": () => import("./enrollment/join-tenant.js"),
  "enrollment/join-tenant-lookup": () =>
    import("./enrollment/join-tenant-lookup.js"),
  "enrollment/me": () => import("./enrollment/me.js"),
  "enrollment/request-change": () => import("./enrollment/request-change.js"),
  "enrollment/self-assign": () => import("./enrollment/self-assign.js"),
  "find-account-by-phone": () => import("./find-account-by-phone.js"),
  "goal/admin/cuts/bulk": () => import("./goal/admin/cuts/bulk.js"),
  "goal/admin/cuts/jungsi-missing": () =>
    import("./goal/admin/cuts/jungsi-missing.js"),
  "goal/admin/cuts/rows": () => import("./goal/admin/cuts/rows.js"),
  "goal/admin/cuts/summary": () => import("./goal/admin/cuts/summary.js"),
  "goal/admin/students": () => import("./goal/admin/students.js"),
  "goal/admin/students/[id]": () => import("./goal/admin/students/[id].js"),
  "goal/admin/students/[id]/records": () =>
    import("./goal/admin/students/[id]/records.js"),
  "goal/admin/resend-report": () => import("./goal/admin/resend-report.js"),
  "goal/admin/reset-student": () => import("./goal/admin/reset-student.js"),
  "goal/advice": () => import("./goal/advice.js"),
  "goal/daily-record": () => import("./goal/daily-record.js"),
  "goal/grades": () => import("./goal/grades.js"),
  "goal/intake": () => import("./goal/intake.js"),
  "goal/intake-update": () => import("./goal/intake-update.js"),
  "goal/plan-tasks": () => import("./goal/plan-tasks.js"),
  "goal/ranking": () => import("./goal/ranking.js"),
  "goal/report": () => import("./goal/report.js"),
  "goal/schedules": () => import("./goal/schedules.js"),
  "goal/student": () => import("./goal/student.js"),
  "goal/timer": () => import("./goal/timer.js"),
  "goal/workbooks": () => import("./goal/workbooks.js"),
  "growth/plan": () => import("./growth/plan.js"),
  "growth/plan/item": () => import("./growth/plan/item.js"),
  "growth/reports": () => import("./growth/reports.js"),
  "growth/survey": () => import("./growth/survey.js"),
  "inquiry/assets": () => import("./inquiry/assets.js"),
  "inquiry/finalize": () => import("./inquiry/finalize.js"),
  "inquiry/reports": () => import("./inquiry/reports.js"),
  "inquiry/session": () => import("./inquiry/session.js"),
  "inquiry/submission": () => import("./inquiry/submission.js"),
  "lookup-child": () => import("./lookup-child.js"),
  "mentor-apply": () => import("./mentor-apply.js"),
  "mentor-apply-upload-url": () => import("./mentor-apply-upload-url.js"),
  "nice-identity-callback": () => import("./nice-identity-callback.js"),
  "nice-identity-result": () => import("./nice-identity-result.js"),
  "nice-identity-start": () => import("./nice-identity-start.js"),
  "performance/bootstrap": () => import("./performance/bootstrap.js"),
  "performance/discard-attachment": () =>
    import("./performance/discard-attachment.js"),
  "performance/finalize": () => import("./performance/finalize.js"),
  "performance/reports": () => import("./performance/reports.js"),
  "performance/session": () => import("./performance/session.js"),
  "performance/submission": () => import("./performance/submission.js"),
  "performance/upload-url": () => import("./performance/upload-url.js"),
  "request-enrollment": () => import("./request-enrollment.js"),
  "reset-password-by-phone": () => import("./reset-password-by-phone.js"),
  "send-phone-code": () => import("./send-phone-code.js"),
  "session-check": () => import("./session-check.js"),
  "signup-welcome": () => import("./signup-welcome.js"),
  "signup/school-student": () => import("./signup/school-student.js"),
  "signup/tenant-lookup": () => import("./signup/tenant-lookup.js"),
  "toss-webhook": () => import("./toss-webhook.js"),
  "verify-phone-code": () => import("./verify-phone-code.js"),
};
