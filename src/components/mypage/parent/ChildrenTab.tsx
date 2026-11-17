import { useCallback, useEffect, useState } from "react";
import { site } from "@/config/site";
import { supabase } from "@/lib/supabase";
import ChildCard, { type Child } from "./ChildCard";
import LinkChildModal from "./LinkChildModal";
import RemoveChildModal from "./RemoveChildModal";

// 학부모 마이페이지 "자녀 등록 및 수정" 탭
// (Figma 3610:2365 빈 상태 / 3636:104 목록).
//
// 목록은 fn_parent_children(sql/73) 하나로 받는다. 클라이언트에서 조립할 수
// 없는 데이터라서다 — profiles_select_own 때문에 학부모는 자녀의 이름·학교를
// 못 읽고, 이용 권한도 못 읽는다(그 RPC 파일 상단 주석 참고).

function EmptyState({ onOpenLink }: { onOpenLink: () => void }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl bg-surface-04 px-8 py-16 text-center">
      <p className="text-[1.0625rem] font-semibold text-ink">
        아직 연결된 자녀가 없어요
      </p>
      <p className="mt-3 break-keep text-[0.875rem] leading-[1.6] text-ink-sub">
        자녀를 연결하면 학습 리포트와 진단 결과를 함께 볼 수 있고,
        <br />
        결제한 서비스가 자녀 계정에서 바로 열려요.
      </p>
      <button
        type="button"
        onClick={onOpenLink}
        className="mt-6 inline-flex h-10 items-center justify-center rounded-lg bg-primary px-5 text-[0.875rem] font-semibold text-white transition hover:opacity-90"
      >
        {`${site.features.studentEnrollment ? "학생 고유코드" : "연결코드"}로 자녀 찾기`}
      </button>
    </div>
  );
}

export default function ChildrenTab() {
  const [children, setChildren] = useState<Child[] | null>(null); // null = 로딩 중
  const [loadError, setLoadError] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<Child | null>(null);

  const reload = useCallback(async () => {
    const { data, error } = await supabase.rpc("fn_parent_children");
    if (error) {
      console.error("자녀 목록 조회 실패:", error);
      setLoadError(
        "자녀 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
      setChildren([]);
      return;
    }
    setLoadError("");
    // fn_parent_children의 생성 반환 타입은 services를 Json(jsonb 컬럼)으로,
    // link_status를 string으로만 표현한다 — 실제 payload 모양(ChildCard.tsx의
    // Child/ChildService)으로 캐스트한다. link_status는 ChildCard의
    // STATUS_BADGE[...] || STATUS_BADGE.pending! 폴백이 예상 밖 값도 안전하게 받는다.
    setChildren((data || []) as unknown as Child[]);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (children === null) {
    return (
      <p className="text-[0.875rem] text-ink-sub">자녀 목록 불러오는 중...</p>
    );
  }

  return (
    <section>
      {loadError && (
        <p className="mb-5 rounded-lg bg-[#FCEAEE] px-4 py-3 text-[0.8125rem] text-[#D6336C]">
          {loadError}
        </p>
      )}

      {children.length === 0 ? (
        <EmptyState onOpenLink={() => setLinkOpen(true)} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[1.5rem] font-semibold leading-[1.3] tracking-[-0.03rem] text-ink">
              연결된 자녀 <span className="text-accent">{children.length}</span>
            </h2>
            <button
              type="button"
              onClick={() => setLinkOpen(true)}
              className="shrink-0 rounded-lg border border-line px-4 py-2 text-[0.8125rem] font-medium text-ink transition hover:bg-surface-04"
            >
              + 자녀 추가
            </button>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {children.map((child) => (
              <ChildCard
                key={child.link_id}
                child={child}
                onRemove={setRemoveTarget}
              />
            ))}
          </div>
        </>
      )}

      <LinkChildModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={reload}
      />

      <RemoveChildModal
        open={!!removeTarget}
        child={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          setRemoveTarget(null);
          reload();
        }}
      />
    </section>
  );
}
