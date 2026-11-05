import type { ServiceKey } from "./services";
import type { Urgency } from "./UrgencyChip";

export interface StudentRow {
  studentId: string;
  displayName: string;
  joinedAt: string | null;
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
  services: Record<ServiceKey, boolean>;
  serviceCount: number;
  urgency: Urgency | null;
  canEdit: boolean;
  enrollmentVersion: number;
}

export interface StudentListExtra {
  scopeTotal: number;
  orgType: string | null;
}
