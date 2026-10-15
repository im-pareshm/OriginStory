// The JSON the API returns. This is the single source of these shapes: the server builds
// them and web/src/types.ts re-exports them, so the two sides can't drift apart.

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

/** What every exhibit reports about the repo it was built from. */
export interface RepoBasics {
  name: string;
  url: string;
  host: string;
  branch: string | null;
  head: string;
  commitUrlBase: string | null;
}

export interface RepoInfo extends RepoBasics {
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

/** Surviving lines written in one calendar month (UTC), by their blame author time. */
export interface Layer {
  /** "YYYY-MM". */
  month: string;
  lines: number;
  /** Top 5 authors of this month's surviving lines, most first. */
  authors: [name: string, lines: number][];
}

/** The oldest meaningful line still alive in a file. */
export interface Fossil {
  path: string;
  line: number;
  text: string;
  commit: CommitEvent;
  /** Link to this line at HEAD, or null for hosts without a known link format. */
  url: string | null;
}

/** One file's lines, top to bottom, as runs of [year written, line count]. */
export interface Core {
  path: string;
  lines: number;
  runs: [year: number, count: number][];
  oldest: Fossil | null;
}

export interface FossilsData {
  repo: RepoBasics;
  /** Ascending by month. */
  layers: Layer[];
  cores: Core[];
  /** The oldest lines in the sample, at most one per file, code files first. */
  fossils: Fossil[];
  sample: {
    /** Files dated with git blame. */
    blamed: number;
    /** Text files worth dating (not lockfiles, vendored, minified or binary). */
    eligible: number;
    tracked: number;
    /** Every eligible file was attempted, so the numbers aren't a sample. */
    complete: boolean;
  };
  generatedAt: number;
}

/** The body of every non-2xx API response. */
export interface ApiError {
  error: string;
}
