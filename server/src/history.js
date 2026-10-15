// Separators git writes for us via %x1e / %x1f, so commit subjects can't break parsing.
const RECORD = '\x1e';
const FIELD = '\x1f';

/** Arguments for one `git log` pass that yields everything the graveyard needs. */
export const LOG_ARGS = [
  'log',
  '--topo-order', // parents before children, so a file is always born before it dies
  '--reverse',
  '-M', // follow renames instead of treating them as death + birth
  '--raw',
  '--numstat',
  '--no-color',
  `--format=%x1e%H%x1f%an%x1f%at%x1f%s`,
  'HEAD',
];

/**
 * Walks the history oldest-first and tracks every file's life:
 * born on "A", renamed on "R", touched on "M", buried on "D".
 */
export function parseHistory(text) {
  const alive = new Map(); // path -> life
  const buried = new Map(); // path -> grave, to ignore the same deletion on a parallel branch
  const deathCounts = new Map(); // path -> how many times something at this path died
  const graves = [];
  const authors = new Set();
  let commitCount = 0;
  let firstCommitAt = Infinity;
  let lastCommitAt = 0;

  const birth = (path, event) => {
    buried.delete(path);
    const life = {
      path,
      formerNames: [],
      born: event,
      lastWords: event,
      touches: event ? 1 : 0,
      authors: new Set(event ? [event.author] : []),
      lifeNumber: (deathCounts.get(path) ?? 0) + 1,
    };
    alive.set(path, life);
    return life;
  };

  const touch = (life, event) => {
    life.lastWords = event;
    life.touches++;
    life.authors.add(event.author);
  };

  for (const block of text.split(RECORD)) {
    if (!block.trim()) continue;
    const lines = block.split('\n');
    const [hash, author, timestamp, ...subject] = lines[0].split(FIELD);
    const event = { hash, author, at: Number(timestamp) * 1000, message: subject.join(FIELD) };

    commitCount++;
    authors.add(author);
    firstCommitAt = Math.min(firstCommitAt, event.at);
    lastCommitAt = Math.max(lastCommitAt, event.at);

    const changes = [];
    const deletedLines = new Map(); // path -> lines removed (null for binary)
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line[0] === ':') {
        // ":100644 000000 <sha> <sha> D\tpath" or ":... R087\told\tnew"
        const tab = line.indexOf('\t');
        const status = line.slice(1, tab).split(' ')[4] ?? '';
        changes.push({ status: status[0], paths: line.slice(tab + 1).split('\t').map(unquotePath) });
      } else {
        const numstat = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(line);
        if (numstat) deletedLines.set(unquotePath(numstat[3]), numstat[2] === '-' ? null : Number(numstat[2]));
      }
    }

    for (const { status, paths } of changes) {
      const [path, newPath] = paths;
      switch (status) {
        case 'A':
        case 'C': {
          const target = newPath ?? path;
          const existing = alive.get(target);
          if (existing) touch(existing, event);
          else birth(target, event);
          break;
        }
        case 'M':
        case 'T': {
          const life = alive.get(path) ?? birth(path, null);
          touch(life, event);
          break;
        }
        case 'R': {
          const life = alive.get(path) ?? birth(path, null);
          alive.delete(path);
          life.formerNames.push(path);
          life.path = newPath;
          alive.set(newPath, life);
          touch(life, event);
          break;
        }
        case 'D': {
          let life = alive.get(path);
          if (!life) {
            if (buried.has(path)) break; // already buried by another branch
            life = birth(path, null);
          }
          alive.delete(path);
          deathCounts.set(path, (deathCounts.get(path) ?? 0) + 1);
          const lines = deletedLines.has(path) ? deletedLines.get(path) : undefined;
          const grave = {
            path,
            formerNames: life.formerNames,
            born: life.born,
            lastWords: life.lastWords,
            died: event,
            lines: lines ?? null,
            binary: lines === null,
            touches: life.touches,
            authors: [...life.authors],
            lifeNumber: life.lifeNumber,
          };
          graves.push(grave);
          buried.set(path, grave);
          break;
        }
      }
    }
  }

  return {
    graves,
    aliveFileCount: alive.size,
    commitCount,
    contributorCount: authors.size,
    firstCommitAt: commitCount ? firstCommitAt : null,
    lastCommitAt: commitCount ? lastCommitAt : null,
  };
}

const ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };

/** Git C-quotes paths containing tabs, newlines, quotes or backslashes. */
export function unquotePath(path) {
  if (path.length < 2 || path[0] !== '"' || path.at(-1) !== '"') return path;
  const bytes = [];
  const body = path.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') {
      bytes.push(...Buffer.from(ch, 'utf8'));
      continue;
    }
    const next = body[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(body.slice(i, i + 3), 8));
      i += 2;
    } else {
      bytes.push(ESCAPES[next] ?? next.charCodeAt(0));
    }
  }
  return Buffer.from(bytes).toString('utf8');
}
