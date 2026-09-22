// PaymentSuccess.tsx "이용 안내" 박스 본문 문구 — 순수 함수로 뺀 이유는 usePaymentConfirmation
// 등 무거운 훅 없이 문구 자체만 단위 테스트하기 위함이다(전체 페이지 렌더는 계정/결제
// 상태를 다 흉내내야 해서 비용이 크다).
//
// grantPermanent/grantFailed/noEntryProduct 3개 상태는 "아래 연락처로 …"로 끝나는데,
// 그 문장은 바로 아래 렌더되는 "문의: 카카오톡 …" 줄(COMPANY.kakao)을 가리킨다.
// kakaoChannelUrl이 없는 사이트(스쿨멘토)는 그 줄 자체가 없어 없는 연락처를 안내하는
// 꼴이 되므로, hasContactChannel이 false면 그 문장만 잘라낸다(새 카피를 짓지 않고
// 기존 승인 문구를 트렁케이션한다).
interface AccessInfoBodyParams {
  isWaitingDeposit: boolean;
  needsLogin: boolean;
  needsSignup: boolean;
  grantPermanent: boolean;
  grantFailed: boolean;
  noEntryProduct: boolean;
  hasMultipleEntries: boolean;
  hasContactChannel: boolean;
}

export function buildAccessInfoBody(params: AccessInfoBodyParams): string {
  const {
    isWaitingDeposit,
    needsLogin,
    needsSignup,
    grantPermanent,
    grantFailed,
    noEntryProduct,
    hasMultipleEntries,
    hasContactChannel,
  } = params;

  if (isWaitingDeposit)
    return "위 가상계좌로 입금기한 내에 입금해 주세요. 입금이 확인되면 이용 권한이 자동으로 부여됩니다.";
  if (needsLogin)
    return "결제가 확인되었습니다. 이용 권한은 결제하신 계정에 등록되어 있습니다. 로그인하신 뒤 이용해 주세요.";
  if (needsSignup)
    return "결제는 정상적으로 완료됐습니다. 다만 비회원으로 결제하셔서 이용 권한을 넣어 드릴 계정이 없습니다. 아래 버튼으로 회원가입하신 뒤 주문번호와 함께 문의해 주시면 바로 등록해 드립니다.";
  if (grantPermanent)
    return hasContactChannel
      ? "결제는 정상적으로 완료됐습니다. 다만 이 주문은 이용 권한 자동 등록이 되지 않아 확인이 필요합니다. 아래 연락처로 주문번호와 함께 문의해 주시면 바로 등록해 드립니다."
      : "결제는 정상적으로 완료됐습니다. 다만 이 주문은 이용 권한 자동 등록이 되지 않아 확인이 필요합니다.";
  if (grantFailed)
    return hasContactChannel
      ? "결제는 정상적으로 완료됐습니다. 다만 이용 권한 등록이 아직 끝나지 않았습니다. 이 페이지를 새로고침하면 자동으로 다시 시도되며, 계속 같은 안내가 보이면 아래 연락처로 주문번호와 함께 문의해 주세요."
      : "결제는 정상적으로 완료됐습니다. 다만 이용 권한 등록이 아직 끝나지 않았습니다. 이 페이지를 새로고침하면 자동으로 다시 시도됩니다.";
  if (noEntryProduct)
    return hasContactChannel
      ? "결제가 확인되었습니다. 이 상품은 별도 입장 화면 없이 진행되는 서비스라, 이용 방법은 아래 연락처로 안내드립니다. 주문 내역은 마이페이지에서 확인할 수 있습니다."
      : "결제가 확인되었습니다. 이 상품은 별도 입장 화면 없이 진행되는 서비스입니다. 주문 내역은 마이페이지에서 확인할 수 있습니다.";
  if (hasMultipleEntries)
    return "결제가 확인되어 지금 바로 이용할 수 있습니다. 아래 버튼으로 각 프로그램에 입장해 주세요.";
  return "결제가 확인되어 지금 바로 이용할 수 있습니다. 아래 버튼으로 프로그램에 입장해 주세요.";
}
