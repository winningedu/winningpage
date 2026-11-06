import { useCallback, useEffect, useState } from "react";
import { site } from "@/config/site";
import { fetchMyEnrollment, type MyEnrollment } from "./api";

/** 학적 기능이 켜진 사이트에서만 올해 학적을 읽는다. 읽기 전이나 실패면 data 는 null. */
export function useMyEnrollment() {
  const [data, setData] = useState<MyEnrollment | null>(null);

  const reload = useCallback(async () => {
    if (!site.features.studentEnrollment) return;
    setData(await fetchMyEnrollment().catch(() => null));
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, reload };
}
