import { describe, expect, it } from "vitest";
import { buildAccessInfoBody } from "./paymentSuccessCopy";

// PaymentSuccess.tsx의 "이용 안내" 박스 본문 — grantPermanent/grantFailed/
// noEntryProduct 3개 상태는 "아래 연락처로 …" 문장으로 끝나는데, 이는 바로 아래
// 렌더되는 "문의: 카카오톡 …" 줄(COMPANY.kakao)을 가리킨다. kakaoChannelUrl이
// 없는 사이트(스쿨멘토)에서는 그 줄 자체가 없으므로, 없는 연락처를 가리키는
// 문장도 함께 빠져야 한다(임의 카피 신설이 아니라 기존 문구의 트렁케이션).
const BASE_PARAMS = {
  isWaitingDeposit: false,
  needsLogin: false,
  needsSignup: false,
  grantPermanent: false,
  grantFailed: false,
  noEntryProduct: false,
  hasMultipleEntries: false,
  hasContactChannel: true,
};

describe("buildAccessInfoBody — 연락 수단 있음(winning, 기존 문구 그대로)", () => {
  it("grantPermanent", () => {
    expect(buildAccessInfoBody({ ...BASE_PARAMS, grantPermanent: true })).toBe(
      "결제는 정상적으로 완료됐습니다. 다만 이 주문은 이용 권한 자동 등록이 되지 않아 확인이 필요합니다. 아래 연락처로 주문번호와 함께 문의해 주시면 바로 등록해 드립니다.",
    );
  });

  it("grantFailed", () => {
    expect(buildAccessInfoBody({ ...BASE_PARAMS, grantFailed: true })).toBe(
      "결제는 정상적으로 완료됐습니다. 다만 이용 권한 등록이 아직 끝나지 않았습니다. 이 페이지를 새로고침하면 자동으로 다시 시도되며, 계속 같은 안내가 보이면 아래 연락처로 주문번호와 함께 문의해 주세요.",
    );
  });

  it("noEntryProduct", () => {
    expect(buildAccessInfoBody({ ...BASE_PARAMS, noEntryProduct: true })).toBe(
      "결제가 확인되었습니다. 이 상품은 별도 입장 화면 없이 진행되는 서비스라, 이용 방법은 아래 연락처로 안내드립니다. 주문 내역은 마이페이지에서 확인할 수 있습니다.",
    );
  });
});

describe("buildAccessInfoBody — 연락 수단 없음(schoolmentor, '아래 연락처로' 문장 생략)", () => {
  it("grantPermanent", () => {
    expect(
      buildAccessInfoBody({
        ...BASE_PARAMS,
        grantPermanent: true,
        hasContactChannel: false,
      }),
    ).toBe(
      "결제는 정상적으로 완료됐습니다. 다만 이 주문은 이용 권한 자동 등록이 되지 않아 확인이 필요합니다.",
    );
  });

  it("grantFailed", () => {
    expect(
      buildAccessInfoBody({
        ...BASE_PARAMS,
        grantFailed: true,
        hasContactChannel: false,
      }),
    ).toBe(
      "결제는 정상적으로 완료됐습니다. 다만 이용 권한 등록이 아직 끝나지 않았습니다. 이 페이지를 새로고침하면 자동으로 다시 시도됩니다.",
    );
  });

  it("noEntryProduct", () => {
    expect(
      buildAccessInfoBody({
        ...BASE_PARAMS,
        noEntryProduct: true,
        hasContactChannel: false,
      }),
    ).toBe(
      "결제가 확인되었습니다. 이 상품은 별도 입장 화면 없이 진행되는 서비스입니다. 주문 내역은 마이페이지에서 확인할 수 있습니다.",
    );
  });
});

describe("buildAccessInfoBody — 연락 수단과 무관한 기존 분기", () => {
  it("isWaitingDeposit는 그대로다", () => {
    expect(
      buildAccessInfoBody({
        ...BASE_PARAMS,
        isWaitingDeposit: true,
        hasContactChannel: false,
      }),
    ).toBe(
      "위 가상계좌로 입금기한 내에 입금해 주세요. 입금이 확인되면 이용 권한이 자동으로 부여됩니다.",
    );
  });
});
