/** An error whose message is safe to show to the visitor. */
export class UserError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** A repo link after normalizeRepoUrl: everything later steps need to clone it and link back to it. */
export interface NormalizedRepo {
  cloneUrl: string;
  webUrl: string;
  host: string;
  /** "owner/repo" (the last two path segments). */
  name: string;
  /** Lowercased host and path: two links to the same repo share it. */
  key: string;
  /** Prefix for a commit link (append the hash), or null for hosts without a known format. */
  commitUrlBase: string | null;
}

// Hosts where the repo is always the first two path segments, so links like
// github.com/owner/repo/tree/main/src can be trimmed back to the repo itself.
const TWO_SEGMENT_HOSTS = new Set(['github.com', 'codeberg.org', 'bitbucket.org']);

const COMMIT_PATHS: Record<string, string> = {
  'github.com': '/commit/',
  'codeberg.org': '/commit/',
  'gitlab.com': '/-/commit/',
  'bitbucket.org': '/commits/',
};

// How each host links to one line of a file at a given commit: [path prefix, line anchor].
const FILE_PATHS: Record<string, [prefix: string, anchor: string]> = {
  'github.com': ['/blob/', '#L'],
  'codeberg.org': ['/src/commit/', '#L'],
  'gitlab.com': ['/-/blob/', '#L'],
  'bitbucket.org': ['/src/', '#lines-'],
};

/** A link to `line` of `path` as it was at `sha`, or null for hosts we don't know. */
export function fileUrl(repo: Pick<NormalizedRepo, 'host' | 'webUrl'>, sha: string, path: string, line: number): string | null {
  const pattern = FILE_PATHS[repo.host];
  if (!pattern) return null;
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${repo.webUrl}${pattern[0]}${sha}/${encodedPath}${pattern[1]}${line}`;
}

/**
 * Turns whatever the visitor pasted ("owner/repo", "github.com/owner/repo",
 * a full https URL, a link to a subfolder) into a canonical https clone URL.
 */
export function normalizeRepoUrl(input: unknown): NormalizedRepo {
  let text = String(input ?? '').trim();
  if (!text) throw new UserError('Paste a link to a public Git repository.');
  if (text.length > 300) throw new UserError('That link is too long to be a repository URL.');

  // "owner/repo" shorthand means GitHub.
  if (/^[\w.-]+\/[\w.-]+$/.test(text)) text = `https://github.com/${text}`;
  text = text.replace(/^http:\/\//i, 'https://');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new UserError("That doesn't look like a repository URL.");
  }
  if (url.protocol !== 'https:') throw new UserError('Only https:// repository links are supported.');
  if (url.username || url.password) throw new UserError('Links with credentials in them are not allowed.');
  if (url.port) throw new UserError('Links with a custom port are not supported.');

  const host = url.hostname.toLowerCase();
  if (isPrivateHost(host)) throw new UserError('That host is not reachable from the museum.');

  let segments = url.pathname.split('/').filter(Boolean);
  if (TWO_SEGMENT_HOSTS.has(host)) segments = segments.slice(0, 2);
  if (segments.length < 2) throw new UserError('The link should point at a repository, like github.com/owner/repo.');
  if (TWO_SEGMENT_HOSTS.has(host)) segments[1] = (segments[1] ?? '').replace(/\.git$/i, '');

  const path = segments.join('/');
  const cloneUrl = `https://${host}/${path}`;
  const webUrl = cloneUrl.replace(/\.git$/i, '');
  const commitPath = COMMIT_PATHS[host];

  return {
    cloneUrl,
    webUrl,
    host,
    name: segments.slice(-2).join('/').replace(/\.git$/i, ''),
    key: `${host}/${path}`.toLowerCase(),
    commitUrlBase: commitPath ? webUrl + commitPath : null,
  };
}

/**
 * Blocks obvious internal targets so the server can't be used to probe its own network.
 * Checks the hostname text only. See KNOWN_ISSUES.md "Private-network check is by hostname only".
 */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || /\.(localhost|local|internal|lan|home)$/.test(host)) return true;
  if (host.startsWith('[')) return true; // IPv6 literals: no legitimate repo host needs one.
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return !host.includes('.');
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}
