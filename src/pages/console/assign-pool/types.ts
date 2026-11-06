export interface SameNameStudent {
  grade: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
  usedServiceCount: number;
  serviceTotal: number;
}

export interface PoolStudent {
  studentId: string;
  name: string;
  enrollmentVersion: number;
  grade: string | null;
  sameNameCount: number;
  sameNameEnrolled: SameNameStudent[];
}
