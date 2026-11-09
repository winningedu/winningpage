// W11 그룹(레벨) 관리. 등록된 그룹을 보여주고 추가, 삭제한다.

import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { consoleRequest, errorMessage } from "../api";
import Chip from "../Chip";
import Notice from "../Notice";
import { SAVE_FAILED_MESSAGE } from "../passwordRule";
import TextField from "../TextField";
import { useToast } from "../Toast";

interface Group {
  id: string;
  name: string;
  studentCount: number;
}

export default function GroupManager() {
  const toast = useToast();
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [target, setTarget] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);
  const blocked = target !== null && target.studentCount > 0;
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await consoleRequest("/api/console/groups");
      if (res.status !== 200) throw new Error(`groups ${res.status}`);
      setGroups((res.body as { groups: Group[] }).groups);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    setAdding(true);
    try {
      const res = await consoleRequest("/api/console/groups", {
        method: "POST",
        body: { name: name.trim() },
      });
      if (res.status !== 200) {
        toast.show({
          tone: "Error",
          message: errorMessage(res.body) ?? SAVE_FAILED_MESSAGE,
        });
        return;
      }
      setName("");
      await load();
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setAdding(false);
    }
  };

  const remove = async (group: Group) => {
    setDeleting(true);
    try {
      const res = await consoleRequest("/api/console/groups/delete", {
        method: "POST",
        body: { groupId: group.id },
      });
      if (res.status !== 200) {
        toast.show({
          tone: "Error",
          message: errorMessage(res.body) ?? SAVE_FAILED_MESSAGE,
        });
        return;
      }
      setTarget(null);
      await load();
    } catch {
      toast.show({ tone: "Error", message: SAVE_FAILED_MESSAGE });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 md:border-t md:border-line md:pt-8">
      <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-strong">
        그룹(레벨) 관리
      </h2>
      <p className="text-app-body text-ink-sub">
        운영하고 있는 그룹이나 레벨 이름을 등록합니다. 등록한 이름이
        학생정보편집, 담당학급배정, 필터에서 나타납니다.
      </p>
      <div className="flex flex-col items-start gap-3">
        <TextField
          label="그룹(레벨이 구분되어 있으면 입력, 없으면 빈칸)"
          placeholder="예: A레벨"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={adding || name.trim() === ""}
          onClick={() => void add()}
          className="h-11 rounded-lg border-line px-5 text-app-label font-semibold text-primary max-md:w-full md:h-10"
        >
          추가
        </Button>
      </div>
      {loadFailed && (
        <Notice tone="Danger">
          그룹을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요
        </Notice>
      )}
      {groups && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-app-label text-ink-sub">
            {groups.length === 0 ? "등록된 그룹: 없음" : "등록된 그룹"}
          </span>
          {groups.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-0.5">
              <Chip tone="Neutral">{g.name}</Chip>
              <button
                type="button"
                aria-label={`${g.name} 삭제`}
                onClick={() => setTarget(g)}
                className="flex size-6 items-center justify-center text-ink-sub"
              >
                <X aria-hidden className="size-[0.875rem]" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Dialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
      >
        <DialogContent
          showCloseButton={false}
          overlayClassName="bg-black/40 supports-backdrop-filter:backdrop-blur-none"
          className="gap-5 rounded-2xl px-5 pt-7 pb-6 shadow-popover ring-0 sm:max-w-[27.5rem]"
        >
          {target && (
            <>
              <DialogTitle className="text-app-dialog-title font-semibold tracking-[-0.02em] text-ink-strong">
                {target.name}{" "}
                {blocked ? "그룹을 지울 수 없어요" : "그룹을 삭제할까요?"}
              </DialogTitle>
              <p className="text-app-body text-ink-strong">
                {blocked
                  ? `소속 학생이 ${target.studentCount}명 있어 지울 수 없어요. 학생정보편집에서 학생의 그룹을 먼저 바꿔 주세요`
                  : "소속 학생이 없는 그룹이에요. 삭제하면 학생정보편집, 담당학급배정, 필터의 보기에서 빠져요"}
              </p>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTarget(null)}
                  className="h-10 rounded-lg border-line px-5 text-app-label font-semibold text-primary"
                >
                  취소
                </Button>
                <Button
                  type="button"
                  disabled={deleting || blocked}
                  onClick={() => void remove(target)}
                  className="h-10 rounded-lg bg-error px-5 text-app-label font-semibold text-primary-foreground disabled:opacity-40"
                >
                  삭제
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
