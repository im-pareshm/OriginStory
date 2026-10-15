/**
 * Pure helpers for the Code Fossils exhibit: which files to date, and how to read
 * `git blame --porcelain` into one { sha, text } per line.
 */
import type { CommitEvent } from './api-types.ts';

/** One blob from `git ls-tree -r -l`. */
export interface TreeEntry {
  path: string;
  mode: string;
  /** Bytes; NaN when git printed "-". */
  size: number;
}

export interface BlameLine {
  sha: string;
  /** Line number in the file at HEAD, from 1. */
  line: number;
  text: string;
}

export interface Blame {
  commits: Map<string, CommitEvent>;
  /** Sorted by line number. */
  lines: BlameLine[];
}

const MAX_FILE_BYTES = 256 * 1024;

const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'Cargo.lock',
  'go.sum',
  'poetry.lock',
  'Pipfile.lock',
  'composer.lock',
  'Gemfile.lock',
  'mix.lock',
  'pubspec.lock',
]);

const SKIPPED_DIRS = new Set(['node_modules', 'vendor', 'third_party', 'dist', 'build']);

const BINARY_EXTENSIONS = new Set(
  (
    'png jpg jpeg gif bmp ico icns webp avif tif tiff psd ai eps sketch fig xcf svgz ' +
    'woff woff2 ttf otf eot ' +
    'zip gz tgz bz2 xz 7z rar jar war tar ' +
    'pdf doc docx xls xlsx ppt pptx ' +
    'mp3 mp4 m4a wav ogg flac webm mov avi mkv ' +
    'wasm so dll dylib exe bin dat class pyc o a lib node ' +
    'sqlite db'
  ).split(' '),
);

/** Parses `git ls-tree -r -l -z HEAD` into blobs: "<mode> <type> <sha> <size>\t<path>\0". */
export function parseTree(text: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of text.split('\0')) {
    if (!record) continue;
    const tab = record.indexOf('\t');
    const [mode = '', type, , size] = record.slice(0, tab).split(/ +/);
    if (type !== 'blob') continue;
    entries.push({ path: record.slice(tab + 1), mode, size: Number(size) });
  }
  return entries;
}

/** Whether a tracked file is worth dating: real text that people wrote, not generated or vendored. */
export function isFossilCandidate({ path, mode, size }: TreeEntry): boolean {
  if (mode === '120000' || mode === '160000') return false; // symlinks and submodules
  if (!Number.isFinite(size) || size === 0 || size > MAX_FILE_BYTES) return false;
  const segments = path.split('/');
  const name = segments.at(-1) ?? '';
  if (LOCKFILES.has(name)) return false;
  if (segments.slice(0, -1).some((dir) => SKIPPED_DIRS.has(dir))) return false;
  if (/\.min\.[a-z]+$/i.test(name) || /\.map$/i.test(name)) return false;
  const dot = name.lastIndexOf('.');
  return dot < 0 || !BINARY_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

const PLAIN_EXTENSIONS = new Set('md markdown mdx txt rst adoc json jsonc json5 yml yaml toml ini cfg conf properties xml svg csv tsv lock'.split(' '));
const PLAIN_NAMES = /^(license|licence|copying|notice|authors|contributors|changelog|changes|history|readme|codeowners)(\.|$)/i;

/**
 * Whether a file's oldest line belongs in the fossil hunt. Config, docs and dotfiles still
 * count towards the strata, but "root = true" from .editorconfig isn't much of a fossil.
 */
export function isCodeFile(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (name.startsWith('.') || PLAIN_NAMES.test(name)) return false;
  const dot = name.lastIndexOf('.');
  return dot < 0 || !PLAIN_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

const LINE_HEADER = /^([0-9a-f]{40,64}) \d+ (\d+)/;

/**
 * Reads `git blame --porcelain` output. Commit details are printed only the first time
 * a commit appears, so they're collected into `commits` and each line points at its sha.
 * Returns null for binary content.
 */
export function parseBlame(text: string): Blame | null {
  if (text.includes('\0')) return null;
  const commits = new Map<string, CommitEvent>();
  const lines: BlameLine[] = [];
  let current: CommitEvent | null = null;
  let lineNumber = 0;

  for (const row of text.split('\n')) {
    if (row[0] === '\t') {
      // Real output always has a header before the first content row; ignore anything else.
      if (current) lines.push({ sha: current.hash, line: lineNumber, text: row.slice(1) });
      continue;
    }
    const header = LINE_HEADER.exec(row);
    if (header) {
      const sha = header[1]!;
      lineNumber = Number(header[2]);
      current = commits.get(sha) ?? { hash: sha, author: '', at: 0, message: '' };
      commits.set(sha, current);
      continue;
    }
    if (!current) continue;
    const space = row.indexOf(' ');
    const key = space < 0 ? row : row.slice(0, space);
    const value = row.slice(space + 1);
    if (key === 'author') current.author = value;
    else if (key === 'author-time') current.at = Number(value) * 1000;
    else if (key === 'summary') current.message = value;
  }

  lines.sort((a, b) => a.line - b.line);
  return { commits, lines };
}

/** True when a line has enough substance to be a fossil worth showing (not a lone `}` or `*\/`). */
export function isMeaningful(text: string): boolean {
  return (text.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= 4;
}

/** FNV-1a, the same hash as `hashString` in web/src/lore.ts, for a stable file sample. */
export function hashString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
