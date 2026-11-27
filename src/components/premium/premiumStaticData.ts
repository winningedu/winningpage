// 프리미엄 프로그램 페이지(대입컨설팅 A/S, 대학원입학) 전용 정적 데이터.
// premium-db-decouple — 이전엔 premium_achievements/home_mentor_strategies/university_acceptances
// 테이블을 각각 조회했으나(usePremiumAchievements, useHomeMentors, usePremiumGraduateAcceptances),
// 프리미엄 페이지는 DB 호출 0건이 목표라 dev DB 스냅샷(2026-08-24)을 그대로 코드 상수로 고정했다.
// 각 페이지가 실제 소비하는 필드만 담는다 — 원본 테이블의 id/created_at 등은 제외.
// 값을 바꾸려면(신규 실적・멘토・합격사례) 이 파일을 직접 수정한다(DB 갱신 아님).

import emblemEwha from "@/assets/premium/emblems/ewha.png";
import emblemHanyang from "@/assets/premium/emblems/hanyang.png";
import emblemHongik from "@/assets/premium/emblems/hongik.png";
import emblemKorea from "@/assets/premium/emblems/korea.png";
import emblemSeoulNational from "@/assets/premium/emblems/seoul-national.png";
import emblemSungkyunkwan from "@/assets/premium/emblems/sungkyunkwan.png";
import emblemYonsei from "@/assets/premium/emblems/yonsei.png";
import mentorPhoto01KangJihu from "@/assets/premium/mentors/01-kang-jihu.png";
import mentorPhoto02KimHyeongjun from "@/assets/premium/mentors/02-kim-hyeongjun.png";
import mentorPhoto03ParkSeojeong from "@/assets/premium/mentors/03-park-seojeong.png";
import mentorPhoto04ParkChanil from "@/assets/premium/mentors/04-park-chanil.png";
import mentorPhoto05LeeCheonghun from "@/assets/premium/mentors/05-lee-cheonghun.png";
import mentorPhoto06KimMugyeong from "@/assets/premium/mentors/06-kim-mugyeong.png";
import mentorPhoto07HaHyeonseo from "@/assets/premium/mentors/07-ha-hyeonseo.png";
import mentorPhoto08JeMingyu from "@/assets/premium/mentors/08-je-mingyu.png";
import mentorPhoto09KimDana from "@/assets/premium/mentors/09-kim-dana.png";
import mentorPhoto10KimSeonghun from "@/assets/premium/mentors/10-kim-seonghun.png";
import mentorPhoto11ParkMinjeong from "@/assets/premium/mentors/11-park-minjeong.png";
import mentorPhoto12KimJeongyun from "@/assets/premium/mentors/12-kim-jeongyun.png";
import mentorPhoto13SonJuyeon from "@/assets/premium/mentors/13-son-juyeon.png";
import mentorPhoto14ShinYeongjin from "@/assets/premium/mentors/14-shin-yeongjin.png";
import mentorPhoto15JeongJaewoong from "@/assets/premium/mentors/15-jeong-jaewoong.png";
import mentorPhoto16SeongMinwoo from "@/assets/premium/mentors/16-seong-minwoo.png";
import mentorPhoto17ChoiJeongyeon from "@/assets/premium/mentors/17-choi-jeongyeon.png";
import mentorPhoto18LeeSeunghyun from "@/assets/premium/mentors/18-lee-seunghyun.png";
import mentorPhoto19HanJeongwon from "@/assets/premium/mentors/19-han-jeongwon.png";
import mentorPhoto20JeongChaeyun from "@/assets/premium/mentors/20-jeong-chaeyun.png";
import mentorPhoto21HamDahyun from "@/assets/premium/mentors/21-ham-dahyun.png";
import mentorPhoto22HanHyewon from "@/assets/premium/mentors/22-han-hyewon.png";

export type PremiumAchievement = {
  label: string;
  count: number;
};

type PremiumMentorPhoto = {
  top: number;
  left: number;
  width: number;
  height: number;
  crop?: { top: string; height: string };
};

export type PremiumMentor = {
  id: string;
  mentor_name: string;
  badge: string;
  title_lines: string[];
  photo_url: string;
  photo: PremiumMentorPhoto;
  card_width: number;
  sort_order: number;
};

export type PremiumGraduateAcceptance = {
  id: string;
  name: string;
  emblem_url: string | null;
  subtitle: string | null;
  count: number | null;
  sort_order: number;
};

// 대입컨설팅 A/S 프로그램 랜딩 섹션 2(PremiumStatsPills) — 구 premium_achievements 5행(dev, 2026-08-23).
export const PREMIUM_ACHIEVEMENTS: PremiumAchievement[] = [
  { label: "서연고", count: 37 },
  { label: "메디컬", count: 34 },
  { label: "서성한", count: 43 },
  { label: "과기원", count: 22 },
  { label: "미대", count: 7 },
];

// 대입컨설팅 A/S 프로그램 랜딩 섹션 9(MentorSection) — 구 home_mentor_strategies is_active=true
// 22행(dev, 2026-07-27~29) 전체. 필드는 useHomeMentors.normalizeMentorRow가 정규화한 뒤의
// 형태(photo_layout → photo)로 미리 고정해 두었다 — MentorCard가 그대로 소비한다.
export const PREMIUM_MENTORS: PremiumMentor[] = [
  {
    id: "9fa58342-2907-4966-a435-1858abd3c0b2",
    mentor_name: "강지후",
    badge: "예체능계열 멘토",
    title_lines: ["강지후 멘토", "서울대 동양학과"],
    photo_url: mentorPhoto01KangJihu,
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 10,
  },
  {
    id: "6e0883d9-7d52-4e86-bb58-8467aadc5a94",
    mentor_name: "김형준",
    badge: "위닝 8기",
    title_lines: ["김형준 멘토", "서울대 수의예과"],
    photo_url: mentorPhoto02KimHyeongjun,
    photo: { top: 106, left: 0, width: 210, height: 315 },
    card_width: 210,
    sort_order: 20,
  },
  {
    id: "da64120b-d1cc-46b9-b340-0af473557f90",
    mentor_name: "박서정",
    badge: "위닝 10기",
    title_lines: ["박서정 멘토", "뉴욕대 경제학과"],
    photo_url: mentorPhoto03ParkSeojeong,
    photo: { top: 106, left: 0, width: 210, height: 289 },
    card_width: 210,
    sort_order: 30,
  },
  {
    id: "39e343ee-b111-4b47-9d42-46fab191e01c",
    mentor_name: "박찬일",
    badge: "위닝 13기",
    title_lines: ["박찬일 멘토", "포항공대 무은재학부"],
    photo_url: mentorPhoto04ParkChanil,
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 40,
  },
  {
    id: "b9fc7d83-1221-4862-8f2a-f971d0b9aa1a",
    mentor_name: "이청훈",
    badge: "위닝 8기",
    title_lines: ["이청훈 멘토", "고려대 신소재공학부"],
    photo_url: mentorPhoto05LeeCheonghun,
    photo: { top: 106, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 50,
  },
  {
    id: "49f5832b-59b2-490e-96c6-fb912265c144",
    mentor_name: "김무경",
    badge: "위닝 8기",
    title_lines: ["김무경 멘토", "연세대 응용계학과"],
    photo_url: mentorPhoto06KimMugyeong,
    photo: { top: 95, left: 0, width: 210, height: 296 },
    card_width: 210,
    sort_order: 60,
  },
  {
    id: "f6fae8ae-3b3e-4d9e-a2f3-3c009b2c91e0",
    mentor_name: "하현서",
    badge: "위닝 11기",
    title_lines: ["하현서 멘토", "유니스트 디자인학과"],
    photo_url: mentorPhoto07HaHyeonseo,
    photo: { top: 111, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 70,
  },
  {
    id: "2cb2be81-6e02-4505-a0e5-4836dc8c6045",
    mentor_name: "제민규",
    badge: "위닝 12기",
    title_lines: ["제민규 멘토", "서울대 원자핵공학과"],
    photo_url: mentorPhoto08JeMingyu,
    photo: { top: 106, left: 0, width: 210, height: 271 },
    card_width: 210,
    sort_order: 80,
  },
  {
    id: "a221e9be-0e48-40aa-ab12-6ed6a37ec552",
    mentor_name: "김단아",
    badge: "학습멘토 위닝 2기",
    title_lines: ["김단아 멘토", "포항공대 신소재공학과"],
    photo_url: mentorPhoto09KimDana,
    photo: { top: 106, left: 0, width: 210, height: 315 },
    card_width: 210,
    sort_order: 90,
  },
  {
    id: "8f5f655d-9129-41b6-b1e2-6dc7846230af",
    mentor_name: "김성훈",
    badge: "위닝 9기",
    title_lines: ["김성훈멘토", "서울대 수의학과"],
    photo_url: mentorPhoto10KimSeonghun,
    photo: {
      top: 92,
      left: 0,
      width: 210,
      height: 392,
      crop: { top: "-16.26%", height: "116.12%" },
    },
    card_width: 210,
    sort_order: 100,
  },
  {
    id: "4ff165e1-fa0f-45d5-9135-02d8610ef01f",
    mentor_name: "박민정",
    badge: "해외유학 위닝 14기",
    title_lines: ["박민정 멘토", "Syracuse University 법학전공"],
    photo_url: mentorPhoto11ParkMinjeong,
    photo: { top: 100, left: 5, width: 200, height: 280 },
    card_width: 210,
    sort_order: 110,
  },
  {
    id: "4709958f-d6a4-4f54-bc93-78a9fee8d425",
    mentor_name: "김정윤",
    badge: "위닝 9기",
    title_lines: ["김정윤 멘토", "성균관대 국제통상학과"],
    photo_url: mentorPhoto12KimJeongyun,
    photo: { top: 111, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 120,
  },
  {
    id: "840eed25-5a48-4346-b1aa-729d9840cc9c",
    mentor_name: "손주연",
    badge: "위닝 8기",
    title_lines: ["손주연 멘토", "한양대 미디어커뮤니케이션"],
    photo_url: mentorPhoto13SonJuyeon,
    photo: { top: 87, left: 0, width: 210, height: 286 },
    card_width: 210,
    sort_order: 130,
  },
  {
    id: "34d058ab-de7f-425f-af90-f4652a4849da",
    mentor_name: "신영진",
    badge: "학습 위닝 2기",
    title_lines: ["신영진 멘토", "대구한의대 한의예과"],
    photo_url: mentorPhoto14ShinYeongjin,
    photo: { top: 98, left: 17, width: 200, height: 300 },
    card_width: 210,
    sort_order: 140,
  },
  {
    id: "70ab133a-07cd-4c4b-9308-e283c868935b",
    mentor_name: "정재웅",
    badge: "위닝 13기",
    title_lines: ["정재웅 멘토", "홍익대 디자인컨버전스학과"],
    photo_url: mentorPhoto15JeongJaewoong,
    photo: { top: 109, left: 0, width: 210, height: 271 },
    card_width: 210,
    sort_order: 150,
  },
  {
    id: "31005bc7-b442-431e-b44f-91bf76a79cdf",
    mentor_name: "성민우",
    badge: "위닝 14기",
    title_lines: ["성민우 멘토", "대구한의대 한의학과"],
    photo_url: mentorPhoto16SeongMinwoo,
    photo: { top: 110, left: 0, width: 210, height: 270 },
    card_width: 210,
    sort_order: 160,
  },
  {
    id: "4f5b9da8-c046-4749-a04e-60a33951cf1c",
    mentor_name: "최정연",
    badge: "아트멘토 위닝 1기",
    title_lines: ["최정연 멘토", "서울대 공예과"],
    photo_url: mentorPhoto17ChoiJeongyeon,
    photo: { top: 110, left: 0, width: 210, height: 280 },
    card_width: 210,
    sort_order: 170,
  },
  {
    id: "b1aba719-6ee0-406b-807d-246044bed3e2",
    mentor_name: "이승현",
    badge: "학습 위닝 2기",
    title_lines: ["이승현 멘토", "연세대 신소재 공학과"],
    photo_url: mentorPhoto18LeeSeunghyun,
    photo: { top: 110, left: 0, width: 210, height: 269 },
    card_width: 210,
    sort_order: 180,
  },
  {
    id: "fafc055a-3343-4212-b003-4cd473e90388",
    mentor_name: "한정원",
    badge: "학습 위닝 2기",
    title_lines: ["한정원 멘토", "카네기 맬런 대학교", "전기 및 컴퓨터 공학"],
    photo_url: mentorPhoto19HanJeongwon,
    photo: { top: 110, left: -44, width: 320, height: 300 },
    card_width: 210,
    sort_order: 190,
  },
  {
    id: "3ff7f3ab-f02c-48e7-a2af-7e5394226f46",
    mentor_name: "정채윤",
    badge: "위닝 10기",
    title_lines: ["정채윤 멘토", "가천대 한의예과"],
    photo_url: mentorPhoto20JeongChaeyun,
    photo: { top: 100, left: 0, width: 210, height: 280 },
    card_width: 210,
    sort_order: 200,
  },
  {
    id: "d02c68fc-9690-42c4-8c42-5d4e9cb84395",
    mentor_name: "함다현",
    badge: "위닝 3기",
    title_lines: ["함다현 멘토", "홍익대 회화과"],
    photo_url: mentorPhoto21HamDahyun,
    photo: { top: 100, left: 0, width: 210, height: 264 },
    card_width: 210,
    sort_order: 210,
  },
  {
    id: "aad5b42d-8381-4fa3-9efb-5fbb9e641f96",
    mentor_name: "한혜원",
    badge: "위닝 15기",
    title_lines: ["한혜원 멘토", "한양대 자율전공"],
    photo_url: mentorPhoto22HanHyewon,
    photo: { top: 102, left: 0, width: 200, height: 268 },
    card_width: 210,
    sort_order: 220,
  },
];

// 대학원입학 프로그램 랜딩 §5(PremiumAcceptanceMarquee) — 구 university_acceptances
// track='graduate' 9행(dev, 2026-08-24). 부산대 2행은 emblem_url이 원래도 Storage가 아닌
// 로컬 public 경로(/images/landing/acceptance/pusan.png)라 그대로 문자열로 둔다(다른 랜딩
// 섹션도 이미 같은 경로를 쓰는 공용 에셋 — import 불필요).
export const PREMIUM_GRADUATE_ACCEPTANCES: PremiumGraduateAcceptance[] = [
  {
    id: "1add7b62-b514-4a8f-a380-6205bcee6647",
    name: "서울대학교",
    emblem_url: emblemSeoulNational,
    subtitle: "경제학부 석박통합",
    count: null,
    sort_order: 10,
  },
  {
    id: "a5a13d83-116b-4fb9-b62c-acd101aa7827",
    name: "고려대학교",
    emblem_url: emblemKorea,
    subtitle: "경제학과 석사",
    count: null,
    sort_order: 20,
  },
  {
    id: "79526aed-0951-4962-996e-4f2cd30dc498",
    name: "연세대학교",
    emblem_url: emblemYonsei,
    subtitle: "경제학과 석사",
    count: null,
    sort_order: 30,
  },
  {
    id: "0c4d5a28-fadf-4a83-b878-ba64ae0593bb",
    name: "성균관대학교",
    emblem_url: emblemSungkyunkwan,
    subtitle: "경제학과 석사",
    count: null,
    sort_order: 40,
  },
  {
    id: "663bd8d2-608e-4b4b-a57c-b7dbd831ca09",
    name: "한양대학교",
    emblem_url: emblemHanyang,
    subtitle: "경영전문대학원",
    count: null,
    sort_order: 50,
  },
  {
    id: "c80f3a85-4a83-4e92-b42f-e1c7820c5003",
    name: "이화여대",
    emblem_url: emblemEwha,
    subtitle: "경영전문대학원",
    count: null,
    sort_order: 60,
  },
  {
    id: "db4aebe1-f32c-4a8f-b893-09c221ca2d70",
    name: "홍익대학교",
    emblem_url: emblemHongik,
    subtitle: "미술교육전공 석사",
    count: null,
    sort_order: 70,
  },
  {
    id: "a33ae430-2254-453d-8016-00dfefe3ceba",
    name: "부산대학교",
    emblem_url: "/images/landing/acceptance/pusan.png",
    subtitle: "법학 대학원",
    count: null,
    sort_order: 80,
  },
  {
    id: "67e4e65f-a4d9-4419-bfa8-9eeaccb273d5",
    name: "부산대학교",
    emblem_url: "/images/landing/acceptance/pusan.png",
    subtitle: "미술교육 대학원",
    count: null,
    sort_order: 90,
  },
];
