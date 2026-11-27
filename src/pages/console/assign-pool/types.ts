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
  /** 스스로 적은 반이 명단과 맞지 않아 확인을 기다린다. 이때만 아래 반 정보가 채워진다. */
  needsConfirm: boolean;
  /** 이 교사가 확인하고 배치할 수 있다(담임은 담당 반 학생만). */
  canConfirm: boolean;
  classId: string | null;
  groupName: string | null;
  className: string | null;
  number: number | null;
}
