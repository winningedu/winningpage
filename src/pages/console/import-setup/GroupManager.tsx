// W11 그룹(레벨) 관리. 등록된 그룹을 보여주고 추가, 삭제한다.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
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

  return (
    <section className="flex flex-col gap-4">
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
      {loadFailed && <Notice tone="Danger">그룹을 불러오지 못했어요</Notice>}
      {groups && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-app-label text-ink-sub">
            {groups.length === 0 ? "등록된 그룹: 없음" : "등록된 그룹"}
          </span>
          {groups.map((g) => (
            <Chip key={g.id} tone="Neutral">
              {g.name}
            </Chip>
          ))}
        </div>
      )}
    </section>
  );
}
