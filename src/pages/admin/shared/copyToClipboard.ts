import { toast } from "@/components/ui/toast";

/**
 * 값을 클립보드에 복사하고 결과를 토스트로 알린다. 복사하는 값은 소속코드나 초기
 * 비밀번호일 수 있어 토스트 문구와 로그에 싣지 않는다.
 */
export async function copyToClipboard(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ type: "success", priority: "low", title: "복사했습니다" });
  } catch (error) {
    console.error("클립보드 복사 실패", error);
    toast.add({
      type: "error",
      priority: "high",
      title: "복사하지 못했습니다",
      description: "브라우저의 클립보드 권한을 확인해 주세요.",
    });
  }
}
