import type { DiffHunk, ParsedFile } from "../config/types.js";

const HUNK_HEADER = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/;

export function parseDiff(rawDiff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = rawDiff.split("\n");

  let currentFile: ParsedFile | null = null;
  let currentHunk: DiffHunk | null = null;
  let hunkLines: string[] = [];

  for (const line of lines) {
    // New file header
    if (line.startsWith("diff --git")) {
      if (currentHunk && currentFile) {
        currentHunk.content = hunkLines.join("\n");
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = null;
      currentHunk = null;
      hunkLines = [];
      continue;
    }

    // File path from +++ line
    if (line.startsWith("+++ b/")) {
      const filename = line.slice(6);
      currentFile = { filename, hunks: [] };
      continue;
    }

    // Skip --- lines and other metadata
    if (line.startsWith("--- ") || line.startsWith("index ")) {
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(HUNK_HEADER);
    if (hunkMatch) {
      if (currentHunk && currentFile) {
        currentHunk.content = hunkLines.join("\n");
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        oldLines: Number(hunkMatch[2] ?? 1),
        newStart: Number(hunkMatch[3]),
        newLines: Number(hunkMatch[4] ?? 1),
        content: "",
      };
      hunkLines = [line];
      continue;
    }

    // Collect hunk content
    if (currentHunk) {
      hunkLines.push(line);
    }
  }

  // Flush last hunk and file
  if (currentHunk && currentFile) {
    currentHunk.content = hunkLines.join("\n");
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}
