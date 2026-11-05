// 선배 카드 동의 확인 칸(결정 25, 사 #155): 확인한 카드만 스쿨멘토 홈에 보인다. 새 카드는 미확인으로 시작한다.
import { describe, expect, it } from "vitest";
import { mainConfigs } from "./main";
import { mentorFormToPayload, mentorRowToForm } from "./mentorStrategiesForm";

type Config = {
  fields: { key: string; label: string; type: string }[];
  defaults: Record<string, unknown>;
};
const config = mainConfigs.mentorStrategies as unknown as Config;

describe("mentorStrategies 동의 확인 칸", () => {
  it("노출 여부 바로 다음에 예, 아니오 선택 칸으로 있다", () => {
    const keys = config.fields.map((f) => f.key);
    const field = config.fields[keys.indexOf("is_active") + 1];
    expect(field?.key).toBe("consent_confirmed");
    expect(field?.label).toBe("선배 동의 확인");
    expect(field?.type).toBe("radioBoolean");
  });

  it("새 카드는 미확인(false)으로 시작한다", () => {
    expect(config.defaults.consent_confirmed).toBe(false);
  });

  it("저장하고 다시 열어도 값이 유지된다", () => {
    const payload = mentorFormToPayload({
      mentor_name: "김형준",
      consent_confirmed: true,
    });
    expect(payload.consent_confirmed).toBe(true);
    expect(
      mentorRowToForm({ id: 1, consent_confirmed: true }).consent_confirmed,
    ).toBe(true);
  });
});
