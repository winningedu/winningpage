import type { Urgency } from "../urgency";
import type { ServiceKey } from "./services";

export interface StudentRow {
  studentId: string;
  displayName: string;
  joinedAt: string | null;
  grade: string | null;
  groupId: string | null;
  groupName: string | null;
  classId: string | null;
  className: string | null;
  number: number | null;
  services: Record<ServiceKey, boolean>;
  serviceCount: number;
  urgency: Urgency | null;
  weeklyGoalRate: number | null;
  weeklyGoalLevel: "low" | "mid" | "high" | null;
  specialReasons: SpecialReason[];
  canEdit: boolean;
  enrollmentVersion: number;
}

export type SpecialReason =
  | "low_rate"
  | "inactive"
  | "urgency"
  | "feedback_wait"
  | "manual";

export interface SpecialThresholds {
  execRatePct: number;
  inactiveDays: number;
  feedbackWaitDays: number;
}

export interface StudentListExtra {
  scopeTotal: number;
  orgType: string | null;
  specialExecRatePct: number;
  specialInactiveDays: number;
  specialFeedbackWaitDays: number;
}
