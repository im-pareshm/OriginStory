# AGENTS.md

Guidance for any coding agent (or person) working in this repository. This is the
single source of truth; `CLAUDE.md` only points here. Read it before changing anything.

## What this is

Intent (Paresh, 2026-10-15): **Repo Museum** is a fun weekend project. Paste a public
Git repo link and wander through creative exhibits built only from its git history.
Exhibit I (the File Graveyard) and Exhibit II (Code Fossils) are built; more
exhibits come one at a time.

- **Deferred:** deployment (not decided); caching of results (removed 2026-10-15, to
  be revisited later).
- **Ideas, not built:** a commit "symphony", a subway map of branches, Repo Wrapped
  stats. A "repo as a novel" idea would need an LLM,
  which conflicts with the decision below, so ask before starting it.

## Status (as of 2026-10-15)

Exhibits I and II work end to end locally. The only automated tests are server unit
tests for the blame helpers (see "Testing"). There is no CI and no git remote yet. Parked problems: see [KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Commands

All run on 2026-10-15 with Node 24.18, npm 11.16, git 2.55 on Windows 11.

- `npm install`: installs both workspaces. Its `prepare` step runs
  `scripts/install-hooks.mjs`, which sets `core.hooksPath=.githooks` and
  `commit.template=.gitmessage` (see "Git").
- `npm run dev`: API on http://localhost:3001 (`node --watch`) plus Vite on
  http://localhost:5173, which proxies `/api` to the API. Open the Vite URL.
- `npm run build`: `tsc --noEmit` plus `vite build` for `web/` only. **Use this as
  the check**, together with `npm test -w server`. The server is plain JavaScript
  with no typecheck or lint.
- `npm test -w server`: `node --test`, the server unit tests in `server/test/`.
- `npm run typecheck`: `tsc --noEmit` for `web/` only.
- `npm start -w server`: the API alone, without watch mode.

Node requirement: `>=22.12` (root `package.json` `engines`), because concurrently 10
needs Node 22+ and Vite 8 needs `^20.19 || >=22.12`. Only Node 24.18 has been run.
`git` must be on the PATH: the server runs it.

## Key implementation facts

- **Layout:** npm workspaces. `server/` is Express 5, ESM JavaScript. `web/` is
  Vite 8, React 19, TypeScript 7. No database.
- **The only HTTP routes** (`server/src/index.js`): `GET /api/health`,
  `GET /api/graveyard?repo=<link>` and `GET /api/fossils?repo=<link>`. The exhibit
  routes return `GraveyardData` or `FossilsData` (shapes in `web/src/types.ts`; the
  server has no types, so keep the two in step by hand) or `{ error }`. Messages
  meant for visitors are thrown as `UserError` (`server/src/url.js`) with a status;
  anything else becomes a generic 500.
- **Link handling:** `normalizeRepoUrl` (`server/src/url.js`) accepts `owner/repo`
  (meaning GitHub), a bare host path, a full URL, or a subfolder link on
  github.com, codeberg.org and bitbucket.org. Only https is allowed. Links with
  credentials, custom ports, localhost or private IPs are rejected (the private-IP
  check has a gap; see KNOWN_ISSUES.md).
- **All git calls go through `git()`** (`server/src/git.js`): an argument array (no
  shell), prompts and credential helpers disabled, only the https protocol allowed,
  a timeout and an output cap. Keep it that way: the input is a URL from a stranger.
- **Pipeline** (`dig()` in `server/src/dig.js`, shared by every exhibit): `git
  ls-remote` precheck (fails fast on missing, private or empty repos), then a bare,
  single-branch, no-tags clone into the OS temp dir, then the exhibit's own work on
  the clone, then the clone is deleted. At most 2 clones run at once, across all
  exhibits. Identical requests (same exhibit, same repo) arriving together share one
  dig. The clone times out at 3 minutes.
  - Graveyard (`server/src/graveyard.js`): one `git log` pass (3-minute timeout).
    Only the 5,000 most recent graves are returned (`truncated: true` beyond that).
  - Fossils (`server/src/fossils.js`): `git ls-tree` lists the files; lockfiles,
    vendored, minified, binary and >256 KB files are skipped. Up to 400 files, picked
    by a stable path hash so a repo gives the same sample every visit, are dated with
    `git blame --porcelain -w HEAD` (4 at a time, 20 s per file). No new blame starts
    after 60 s; `sample.complete` is false when not every eligible file was tried.
    Measured 2026-10-15: ky 4 s, express 32 s (all 211 files), vite 78 s (400 of
    2,715 files).
- **The domain logic** is `parseHistory` (`server/src/history.js`): it walks
  `git log --topo-order --reverse -M --raw --numstat` and tracks each file's life.
  A/C is a birth, M/T a touch, R moves the life to a new path, D buries it.
  A deletion of a path that is already buried (the same delete on a parallel
  branch) is ignored on purpose. `lifeNumber` counts re-creations at the same path.
  Checked on 2026-10-15 against expressjs/express: plain git shows 568 deletions,
  and the app returns 566 graves (the 2 difference is parallel-branch duplicates).
- **Fossils domain logic** is in `server/src/blame.js` (pure, unit-tested): which files
  to date, parsing `git blame --porcelain` (commit details appear only on a commit's
  first line), and which lines are fossils (code files first, at least 4 letters or
  digits, one per file, duplicate texts dropped). Line age is the blame **author**
  time, aggregated into UTC months (`layers`) and per-file runs of years (`cores`).
  Checked on 2026-10-15: the `runs` for ky's `source/core/Ky.ts` match plain
  `git blame -w` exactly.
- **Frontend:** the repo and exhibit live in the URL (`?repo=…&exhibit=fossils`; no
  `exhibit` means the graveyard, so older links still work), so exhibits can be
  shared as links (`web/src/App.tsx`, exhibit list in `web/src/exhibits.ts`). While a
  page is open, each exhibit's result for the current repo stays in React state, so
  switching tabs doesn't clone again; reloading or changing repo fetches fresh.
  Epitaph rules and date/lifespan wording are in `web/src/lore.ts`; strata banding,
  stats and the age colour scale in `web/src/strata.ts`. UI pieces are in
  `web/src/components/` (fossils in `components/fossils/`).
- **Env vars:** only `PORT` (API port, default 3001). No `.env` file is used.

## Source-of-truth docs

- `README.md`: the public front door: what the app is, how to run it, how it works.
- `AGENTS.md` (this file): facts, rules and decisions for anyone changing the code.
- `KNOWN_ISSUES.md`: verified problems that are parked, with their workarounds.
- `CLAUDE.md`: only a pointer here.

Don't copy content between them; link instead.

## Docs are part of the change

If your change makes any statement in a doc untrue, fix that doc **in the same
commit**. Never leave a note saying a doc is outdated; fix the doc. Before you
finish, grep the `*.md` files for the names you touched (function, route, script,
env var, file) and re-read any passage that mentions them.

| If you change… | Update |
|---|---|
| npm scripts, Node version, workspaces, file layout | "Commands" and "Key implementation facts" here; README "Run it" |
| The server pipeline: clone, log, limits, timeouts, caching | "Pipeline" here; README "How it works" |
| An HTTP route or the response shape | "The only HTTP routes" here; `web/src/types.ts` |
| Which links are accepted or rejected | "Link handling" here; KNOWN_ISSUES.md if it touches the private-IP gap |
| How history is parsed (births, renames, deaths) | "The domain logic" here; README "How it works" |
| What a visitor sees or can do on the page | README opening paragraph |
| Git hooks, branch rules, commit or PR conventions | "Git" here; the header comments in `.githooks/*`; `.gitmessage`; `.github/pull_request_template.md` |
| Scope: a new exhibit, or something deferred | "What this is" and "Status" here; README |
| A fix you're parking | KNOWN_ISSUES.md (its rules are in the file) |

## Decisions to preserve

Confirmed by Paresh on 2026-10-15. Don't undo these without asking.

- **No AI/LLM in the exhibits.** Everything is computed from git data alone; this
  was confirmed in planning for every exhibit idea except "repo as a novel".
- **The server clones with real `git`**, rather than using the GitHub API or git in
  the browser. Why (from planning): it works for any public https host, has no API
  rate limits, and per-commit line counts would need one API call per commit.
- **One exhibit at a time.** Finish an exhibit before starting the next.
- **No caching for now.** Every visit clones fresh; Paresh will decide on caching
  later. Don't add a cache (memory, files or database) without asking. (Sharing one
  dig between requests that arrive at the same moment is not a cache and stays.)
- **No direct commits to `main`.** See "Git".

## Testing

`npm test -w server` runs `server/test/*.test.js` with `node:test` (no
dependencies). Only `server/src/blame.js` is covered: there are no tests for
`parseHistory`, `normalizeRepoUrl`, `fossils.js` or the frontend. `npm run build`
is the web typecheck.

How changes have been checked by hand: run `npm run dev`, then call the API through
the proxy and compare against plain git, for example
`curl "http://localhost:5173/api/graveyard?repo=expressjs/express"` against
`git log -M --diff-filter=D --name-only --format= HEAD` in a bare clone, or one
file's `cores[].runs` from `/api/fossils` against `git blame --porcelain -w HEAD --
<file>`. Nothing is
destructive: the server writes only to OS temp folders, which it deletes.

## CI

None. Whether to add any is not decided.

## Git

Facts as of 2026-10-15: default branch `main`, no remote yet. The first commit was
made directly on `main` at Paresh's request; everything after it goes through
branches.

- **Rule (Paresh, 2026-10-15): never commit directly to `main`.** Work on a branch
  and merge into `main` through a pull request. Enforced locally by
  `.githooks/pre-commit` (rejects commits while on `main`) and `.githooks/pre-push`
  (rejects pushes to `main`), which `npm install` activates. Both were tested on
  2026-10-15. Hooks can be skipped with `--no-verify`, so host-side branch protection
  is the real guard. Unknown: not set up yet (no remote).
- **Commit messages (Paresh, 2026-10-15):** subject `<type>(<scope>): <short
  description>`, scope required, for example `fix(graveyard): keep renamed files'
  birth date`. Allowed types: `feat` new functionality · `fix` bug fix · `refactor`
  restructuring without behavior change · `perf` · `test` · `docs` · `style`
  formatting only · `build` build or dependencies · `ci` · `chore` maintenance ·
  `revert`. The body answers, in order: why the change is needed, what changed, how
  it was tested, and any breaking changes. The full template is `.gitmessage` (set
  as `commit.template` by `npm install`). `.githooks/commit-msg` rejects subjects
  that don't match, except git's own `Merge …` subjects.
- **Pull requests:** fill in `.github/pull_request_template.md` (summary, changes,
  type, testing, impact, risk, breaking changes, pre-merge checklist).
- **Branch names (Paresh, 2026-10-15):** `<type>/<TICKET-123->?<short-description>`,
  or `release/<major>.<minor>.<patch>`. Types: `feature` new functionality ·
  `bugfix` ordinary defects · `hotfix` only for urgent fixes that need an expedited
  production release · `refactor` · `perf` · `test` · `docs` · `chore` maintenance
  or configuration. Rules: lowercase, words joined by hyphens; include the Jira key
  when there is one (the only uppercase part, e.g. `feature/ATLAS-123-bulk-allocation-save`);
  short, specific, action-oriented; exactly one `/`; no personal names, dates, vague
  words (`changes`, `misc`, `wip`, `temp`) or temporary names (`test-branch`); never
  the target branch name. `.githooks/check-branch-name` enforces all of these except
  personal names, with a 40-character cap on the description. It runs on every commit
  (`pre-commit`) and push (`pre-push`). Check a name by hand with
  `sh .githooks/check-branch-name <name>`.
- **Commit author email:** the GitHub noreply address
  (`78204885+im-pareshm@users.noreply.github.com`), set in this repo's local git
  config, not the personal email (Paresh, 2026-10-15).
- **Hook files must stay executable** for macOS and Linux clones. When adding or
  changing them, use `git add --chmod=+x .githooks/<file>`.
- **Rewriting history** (amend, rebase, reset, force-push): no rule recorded yet.
  Unknown: ask before doing any of these.

## Credentials

The app uses no secrets and must not need any to analyse public repos. Never commit
credentials, tokens or `.env` files. The repo will be public.

## Known issues

Skim [KNOWN_ISSUES.md](KNOWN_ISSUES.md) before starting work. If your task touches a
listed item, fix it or update the entry in the same commit. If you park a fix, add
an entry in the same commit as the workaround.
