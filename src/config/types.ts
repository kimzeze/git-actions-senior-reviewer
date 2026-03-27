import { z } from "zod";

export const ReviewModeSchema = z.enum(["lightweight", "standard", "full"]);
export type ReviewMode = z.infer<typeof ReviewModeSchema>;

export const SeveritySchema = z.enum(["critical", "warning", "info", "nitpick"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const CategorySchema = z.enum(["bug", "security", "quality"]);
export type Category = z.infer<typeof CategorySchema>;

export const ReviewConfigSchema = z.object({
  anthropicApiKey: z.string().min(1),
  githubToken: z.string().min(1),
  prNumber: z.number().int().positive(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  serviceName: z.string().default("default"),
  reviewModel: z.string().default("auto"),
  excludePatterns: z.array(z.string()).default([]),
  team: z.string().optional(),
  stacks: z.array(z.string()).default([]),
  slackWebhookUrl: z.string().optional(),
  targetRepoPath: z.string().optional(),
});

export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;

export interface FileChange {
  filename: string;
  status: "added" | "modified" | "removed" | "renamed";
  additions: number;
  deletions: number;
  patch?: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  content: string;
}

export interface ParsedFile {
  filename: string;
  hunks: DiffHunk[];
}

export interface PRContext {
  number: number;
  title: string;
  body: string;
  author: string;
  baseBranch: string;
  headBranch: string;
  files: FileChange[];
  parsedDiff: ParsedFile[];
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface AgentFinding {
  file: string;
  line: number;
  endLine?: number;
  severity: Severity;
  category: Category;
  title: string;
  description: string;
  suggestion?: string;
}

export interface AgentResult {
  agentName: string;
  findings: AgentFinding[];
  tokenUsage: { input: number; output: number };
  durationMs: number;
}

export interface ReviewResult {
  mode: ReviewMode;
  findings: AgentFinding[];
  agentResults: AgentResult[];
  totalTokenUsage: { input: number; output: number };
  totalDurationMs: number;
}
