export type RuntimeProfile =
  | "base"
  | "net-basic"
  | "net-advanced"
  | "lab"
  | "vm-danger";

export type IsolationMode = "container" | "vm";

export type FindingStatus =
  | "lead"
  | "candidate"
  | "validated"
  | "rejected"
  | "reported"
  | "unresolved";

export interface MissionWorkspace {
  root: string;
  missionFile: string;
  stateFile: string;
  surfaceFile: string;
  coverageFile: string;
  commandsFile: string;
  threatModelFile: string;
  hypothesesDir: string;
  findingsDir: string;
  evidenceDir: string;
  runsDir: string;
  reportsDir: string;
  scratchDir: string;
}

export interface FindingDraft {
  id: string;
  title: string;
  status: FindingStatus;
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: "low" | "medium" | "high";
  affectedAssets: string[];
  summary: string;
  impact: string;
  evidenceLinks: string[];
  reproduction: string[];
  remediation: string;
  openQuestions: string[];
}
