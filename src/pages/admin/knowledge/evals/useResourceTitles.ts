import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { evalKeys, fetchResourceTitles } from "./api";

const NO_TITLES: Record<string, string> = {};

// 기대 자료 id 의 제목을 모아 불러온다. ids 문자열이 바뀔 때만 다시 부른다.
// 제목을 못 읽어도 화면은 id 로 보여 주면 되므로 오류는 따로 알리지 않는다.
export default function useResourceTitles(
  ids: string[],
): Record<string, string> {
  const key = [...new Set(ids)].sort().join(",");
  const { data } = useQuery({
    queryKey: evalKeys.titles(key),
    queryFn: ({ signal }) => fetchResourceTitles(key.split(","), signal),
    enabled: key !== "",
    placeholderData: keepPreviousData,
  });
  return data ?? NO_TITLES;
}
