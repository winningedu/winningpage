-- selfeval v4.2 신규 테이블에 QA 관리자 쓰기 차단 트리거를 붙인다.
-- scripts/b2b-qa-account-guard.spec.sql 이 모든 public 테이블에 이 트리거가 있는지 확인한다.
create trigger trg_qa_admin_write_block before insert or update or delete on public.selfeval_manual_logs for each statement execute function public.fn_block_qa_admin_write();
create trigger trg_qa_admin_write_block before insert or update or delete on public.selfeval_record_links for each statement execute function public.fn_block_qa_admin_write();
create trigger trg_qa_admin_write_block before insert or update or delete on public.selfeval_report_views for each statement execute function public.fn_block_qa_admin_write();
