// 서비스 6종의 표시 순서, 이름, 아이콘, 색(스펙 교 #12). 키는 서버 SERVICE_KEYS 와 같다.

import {
  ClipboardCheck,
  FilePen,
  Microscope,
  Sprout,
  Target,
  UserCheck,
} from "lucide-react";

export const SERVICES = [
  {
    key: "diagnosis",
    label: "학습진단",
    Icon: ClipboardCheck,
    color: "text-service-diagnosis-fg",
  },
  {
    key: "goal",
    label: "목표관리",
    Icon: Target,
    color: "text-service-goal-fg",
  },
  {
    key: "growth",
    label: "성장설계",
    Icon: Sprout,
    color: "text-service-growth-fg",
  },
  {
    key: "performance",
    label: "수행평가",
    Icon: FilePen,
    color: "text-service-performance-fg",
  },
  {
    key: "selfeval",
    label: "자기평가",
    Icon: UserCheck,
    color: "text-service-self-assessment-fg",
  },
  {
    key: "inquiry",
    label: "심화탐구",
    Icon: Microscope,
    color: "text-service-research-fg",
  },
] as const;

export type ServiceKey = (typeof SERVICES)[number]["key"];
