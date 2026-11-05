// 768 미만(결정 43)이면 true. 첫 렌더부터 맞아야 데스크톱 목록을 한 번 더 부르지 않는다.

import { useEffect, useState } from "react";

const QUERY = "(max-width: 767px)";

export function useMobileLayout(): boolean {
  const [mobile, setMobile] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const sync = () => setMobile(mql.matches);
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);
  return mobile;
}
