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

Exhibits I and II work end to end locally. The server logic and the frontend's
strata and lore logic have tests, which CI runs on every pull request; the network
half of the clone pipeline and the React components don't (see "Testing"). The repo is public on GitHub; nothing is deployed. Parked problems: see
[KNOWN_ISSUES.md](KNOWN_ISSUES.md).

## Commands

All run on 2026-10-15 with Node 24.18, npm 11.16, git 2.55 on Windows 11.

- `npm install`: installs both workspaces. Its `prepare` step runs
  `scripts/install-hooks.mjs`, which sets `core.hooksPath=.githooks` and
  `commit.template=.gitmessage` (see "Git").
- `npm run dev`: API on http://localhost:3001 (`node --watch src/index.ts`) plus Vite
  on http://localhost:5173, which proxies `/api` to the API. Open the Vite URL. Run it
  from the repo root; inside `server/` it starts only the API.
- `npm run typecheck`: strict `tsc` for both workspaces, source and tests: `server/`
  (`tsc -p .`) and `web/` (`tsc -p .`, then `tsc -p test` for the web tests).
- `npm run build`: `tsc --noEmit` plus `vite build` for `web/`.
- `npm test`: runs each workspace's tests with `node --test`: `server/test/**/*.test.ts`
  and `web/test/**/*.test.ts`. Needs `git` on the PATH (see "Testing").
- **The check before every commit is `npm run typecheck && npm run build && npm test`**;
  CI runs exactly these three.
- `npm run coverage`: the same tests with Node's coverage report, per workspace.
- `npm start -w server`: the API alone, without watch mode (`node src/index.ts`).

Node requirement: `>=22.18` (root `package.json` `engines`): the server and all tests
are TypeScript that Node runs directly, which needs Node's type stripping, on by default
from 22.18. (concurrently 10 needs Node 22+ and Vite 8 `^20.19 || >=22.12`, both met.)
Only Node 24.18 has been run. `git` must be on the PATH: the server runs it.

## Key implementation facts

- **Layout:** npm workspaces. `server/` is Express 5 in TypeScript; `web/` is Vite 8,
  React 19, TypeScript. Both use TypeScript 7 in strict mode. No database.
- **TypeScript without a build step:** Node runs the server's `.ts` files directly
  (type stripping); `tsc` only type-checks, and nothing is emitted. So the server can
  only use TypeScript that erases to plain JavaScript: no `enum`, `namespace` or
  constructor parameter properties (`erasableSyntaxOnly` enforces this), type-only
  imports written `import type` (`verbatimModuleSyntax`), and relative imports with
  their `.ts` extension. `server/tsconfig.json` adds `noUncheckedIndexedAccess`,
  `noImplicitReturns`, `noImplicitOverride` and `noFallthroughCasesInSwitch` on top of
  `strict`; `web/tsconfig.json` is `strict` without those four.
- **The only HTTP routes** (`createApp` in `server/src/app.ts`; `index.ts` only
  listens): `GET /api/health`,
  `GET /api/graveyard?repo=<link>` and `GET /api/fossils?repo=<link>`. The exhibit
  routes return `GraveyardData` or `FossilsData`, or `ApiError` (`{ error }`).
  **Those shapes are defined once, in `server/src/api-types.ts`**; `web/src/types.ts`
  only re-exports them, so a change on either side that breaks the contract fails
  `npm run typecheck`. Messages meant for visitors are thrown as `UserError`
  (`server/src/url.ts`) with a status; anything else becomes a generic 500.
- **Link handling:** `normalizeRepoUrl` (`server/src/url.ts`) accepts `owner/repo`
  (meaning GitHub), a bare host path, a full URL, or a subfolder link on
  github.com, codeberg.org and bitbucket.org. Only https is allowed. Links with
  credentials, custom ports, localhost or private IPs are rejected (the private-IP
  check has a gap; see KNOWN_ISSUES.md).
- **All git calls go through `git()`** (`server/src/git.ts`): an argument array (no
  shell), prompts and credential helpers disabled, only the https protocol allowed,
  a timeout and an output cap. Keep it that way: the input is a URL from a stranger.
- **Pipeline** (`dig()` in `server/src/dig.ts`, shared by every exhibit): `git
  ls-remote` precheck (fails fast on missing, private or empty repos), then a bare,
  single-branch, no-tags clone into the OS temp dir, then the exhibit's own work on
  the clone, then the clone is deleted. At most 2 clones run at once, across all
  exhibits. Identical requests (same exhibit, same repo) arriving together share one
  dig. The clone times out at 3 minutes. Each exhibit keeps its logic in a
  `build…(repo, gitDir)` function and wraps it in `dig()` in a `get…(repo)` one, so
  tests can run the logic on a local repo; new exhibits should follow the same split.
  - Graveyard (`server/src/graveyard.ts`): one `git log` pass (3-minute timeout).
    Only the 5,000 most recent graves are returned (`truncated: true` beyond that).
  - Fossils (`server/src/fossils.ts`): `git ls-tree` lists the files; lockfiles,
    vendored, minified, binary and >256 KB files are skipped. Up to 400 files, picked
    by a stable path hash so a repo gives the same sample every visit, are dated with
    `git blame --porcelain -w HEAD` (4 at a time, 20 s per file; results are sorted
    afterwards so finishing order doesn't change the answer). No new blame starts
    after 60 s; `sample.complete` is false when not every eligible file was tried.
    Measured 2026-10-15: ky 4 s, express 32 s (all 211 files), vite 78 s (400 of
    2,715 files).
- **The domain logic** is `parseHistory` (`server/src/history.ts`): it walks
  `git log --topo-order --reverse -M --raw --numstat` and tracks each file's life.
  A/C is a birth, M/T a touch, R moves the life to a new path, D buries it.
  A deletion of a path that is already buried (the same delete on a parallel
  branch) is ignored on purpose. `lifeNumber` counts re-creations at the same path.
  Checked on 2026-10-15 against expressjs/express: plain git shows 568 deletions,
  and the app returns 566 graves (the 2 difference is parallel-branch duplicates).
- **Fossils domain logic** is in `server/src/blame.ts` (pure, unit-tested): which files
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
| npm scripts, Node version, workspaces, file layout | "Commands" and "Key implementation facts" here; README "Run it"; `.github/workflows/ci.yml` if the check commands or Node version change |
| Tests: added, removed, or what they cover | "Testing" here (the coverage list and the "not covered" line) |
| The CI workflow or branch protection | "CI" and "Git" here |
| The server pipeline: clone, log, limits, timeouts, caching | "Pipeline" here; README "How it works" |
| An HTTP route or the response shape | "The only HTTP routes" here; `server/src/api-types.ts` (the frontend picks it up; fix what `npm run typecheck` then flags) |
| A tsconfig, the TypeScript version, or how TypeScript runs | "TypeScript without a build step" and "Commands" here; README "Run it" if the Node version changes |
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
- **TypeScript in strict mode, run directly by Node, with no build step** (Paresh,
  2026-10-15). Chosen over compiling to `dist/` so dev, tests and deploy all run the
  same files with nothing to rebuild; the cost is the erasable-syntax limits under
  "TypeScript without a build step". Don't add a compile step, `any`-typed escape
  hatches or looser compiler settings without asking.
- **The server owns the API types** (Paresh, 2026-10-15): `server/src/api-types.ts` is
  the only definition, and the frontend imports it, so the two sides can't drift.

## Testing

**Rule (proposed and approved by Paresh, 2026-10-15): logic changes come with tests
in the same pull request.** "Logic" means: how git output (log, blame, ls-tree) is
parsed; which links, files or lines are accepted, picked or built; how the numbers
an exhibit shows are derived; and the data logic of any new exhibit. A bug fix in
that logic adds a test that fails without the fix. Changes that only touch styling,
layout or wording don't need tests. A PR that changes logic without tests isn't
ready to merge. To keep logic testable, put it in pure functions the tests can
import (like `server/src/blame.ts`), and have tests import app code, never copy it.

`npm test` uses Node's built-in `node:test` in both workspaces; there are no test
dependencies. All tests are TypeScript that Node runs directly, and `npm run typecheck`
checks them under the same strict settings as the code they test. They import with
explicit `.ts` extensions. A web test can only load modules whose own imports are
type-only or carry `.ts` extensions, because Node, unlike Vite, won't guess the
extension. The web tests have their own `web/test/tsconfig.json`, which swaps the
browser's Vite types for Node's. On 2026-10-15: **73 tests, all passing** (54 server,
19 web).

Server (`server/test/`):

- `url.test.ts`: `normalizeRepoUrl` (accepted link forms, per-host trimming and
  commit links, rejected schemes, credentials, ports, local and private-network
  hosts) and `fileUrl` (each host's format, path encoding).
- `history.test.ts`: `parseHistory` and `unquotePath`, on hand-written log text and
  on real repos (renames, re-creation, binary files, unusual paths, the same
  deletion on two branches). On Windows the unusual-path case drops the `"` (not
  allowed in Windows file names); CI on Linux runs the full case.
- `graveyard.test.ts` / `fossils.test.ts`: `buildGraveyard` and `buildFossils` end to
  end on real repos (output shape, newest-first graves and the grave limit,
  sampling, the file limit and time budget, skipped files), plus the pure
  `pickSample`, `pickFossils` and `Strata`, including order independence.
- `git.test.ts`: the `git()` wrapper: stdout, non-zero exit, timeout, output cap,
  a missing git binary (run in a child process), and that every transport except
  https is refused, so a pasted link can't reach local files.
- `dig.test.ts`: `toUserError` (which git failures become 404/502/422 and which stay
  500s), `withDigSlot` (at most 2 clones at once, slots freed on failure) and
  `headFromLsRemote`.
- `app.test.ts`: the HTTP routes with fake exhibits: health, routing, 400 for bad
  links, `UserError` status, and a generic 500 that leaks no details.
- `blame.test.ts`: the pure fossil helpers in `server/src/blame.ts`.
- `helpers/git-repo.ts`: builds throwaway repos with fixed authors and dates in the
  OS temp dir, deleted after each test file. Use it for any test that needs a repo.

Web (`web/test/`): `strata.test.ts` (banding, grain choice, half-life and share
stats, age colours) and `lore.test.ts` (epitaph rules in priority order, lifespan,
plural, percent and date wording).

Coverage (`npm run coverage`, 2026-10-15): server 94.5% of lines; every file at
100% except `dig.ts` 66%, `graveyard.ts` 89% and `fossils.ts` 97%. Web: `lore.ts`
and `strata.ts` 100%. Node only reports files the tests import, so those web
numbers don't include the components.

Checked on 2026-10-15 that the tests catch real bugs: removing the parallel-branch
check, dropping `formerNames` on rename, allowing `169.254.x.x`, or removing the
order-independence sort in `Strata` each made a test fail.

**Not covered:** the network half of the pipeline: `dig()`, `remoteHead` and the
clone (`dig.ts`), and the `getGraveyard`/`getFossils` wrappers. `git()` allows only
https, so tests can't clone a local repo. Also the "skip a file whose blame fails"
path in `fossils.ts`, all React components, `exhibits.ts` (its import of `./lore`
has no `.ts` extension, so Node can't load it), and `motion.ts`. The hostname-only
private-network gap (KNOWN_ISSUES.md) is not tested because it isn't fixed.

How changes have been checked by hand: run `npm run dev`, then call the API through
the proxy and compare against plain git, for example
`curl "http://localhost:5173/api/graveyard?repo=expressjs/express"` against
`git log -M --diff-filter=D --name-only --format= HEAD` in a bare clone, or one
file's `cores[].runs` from `/api/fossils` against `git blame --porcelain -w HEAD --
<file>`. Nothing is
destructive: the server writes only to OS temp folders, which it deletes.

## CI

`.github/workflows/ci.yml` runs one job, `checks` (Ubuntu, Node 24): `npm ci`, then
`npm run typecheck`, `npm run build` and `npm test`. It runs on every pull request, whatever the base
branch (so stacked PRs are checked too), and on every push to `main`. `checks` is the
required status check for merging into `main` (see "Git"). There is no deploy job.

## Git

Facts as of 2026-10-15: default branch `main`; remote `origin` is
https://github.com/im-pareshm/OriginStory (public). The first commit was made directly
on `main` at Paresh's request; everything after it goes through pull requests, which
are merged on GitHub with a merge commit (PR #1).

- **Rule (Paresh, 2026-10-15): never commit directly to `main`.** Work on a branch
  and merge into `main` through a pull request. Enforced locally by
  `.githooks/pre-commit` (rejects commits while on `main`) and `.githooks/pre-push`
  (rejects pushes to `main`), which `npm install` activates. Both were tested on
  2026-10-15. Hooks can be skipped with `--no-verify`, so GitHub branch protection on
  `main` is the real guard: a pull request is required, the `checks` CI job must
  pass, and force-pushes and deletion are blocked. It applies to admins too, and no
  approving review is required (solo project).
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
