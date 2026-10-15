export interface CommitEvent {
  hash: string;
  author: string;
  /** Milliseconds since epoch. */
  at: number;
  message: string;
}

export interface Grave {
  path: string;
  formerNames: string[];
  /** Null when the birth happened somewhere git log doesn't show (e.g. inside a merge). */
  born: CommitEvent | null;
  /** The last commit that touched the file before it died. */
  lastWords: CommitEvent | null;
  died: CommitEvent;
  /** Lines in the file when it was deleted; null for binary files. */
  lines: number | null;
  binary: boolean;
  touches: number;
  authors: string[];
  /** 1 for a file's first life, 2+ when something at this path was deleted and later re-created. */
  lifeNumber: number;
}

export interface RepoInfo {
  name: string;
  url: string;
  host: string;
  branch: string | null;
  head: string;
  commitUrlBase: string | null;
  commitCount: number;
  contributorCount: number;
  aliveFileCount: number;
  firstCommitAt: number | null;
  lastCommitAt: number | null;
}

export interface GraveyardData {
  repo: RepoInfo;
  graves: Grave[];
  totalGraves: number;
  truncated: boolean;
  generatedAt: number;
}
