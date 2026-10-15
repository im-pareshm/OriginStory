# Repo Museum

Paste a public Git repository and wander through exhibits built from its history.

**Exhibit I: The File Graveyard.** Every file the repo ever deleted gets a tombstone with its birth and death dates, who deleted it, its last words (the final commit that touched it) and its cause of death (the commit that deleted it).

**Exhibit II: Code Fossils.** Every line still alive is dated by when it was written, and the codebase is drawn as a cliff of rock layers, oldest at the bottom. Hunt for the oldest surviving lines, read headline stats like the code's half-life, and open a core sample of any file to see which years it's made of.

## Run it

Requires Node 22.12+ and `git` on your PATH.

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:3001; Vite proxies `/api` to it.

Checks: `npm run build` (web typecheck and build) and `npm test` (server and web tests). CI runs both on every pull request. `npm run coverage` shows test coverage.

## How it works

- `server/`: Express. For each request it runs `git ls-remote` (fails fast on missing, private or empty repos), does a bare, single-branch clone into a temp folder, runs the exhibit's git commands, and deletes the clone (`dig.js`).
  - Graveyard: one `git log --raw --numstat -M` pass. `history.js` walks it oldest-first, tracking each file through births, renames and deletions.
  - Fossils: `git blame --porcelain -w` on each text file (`fossils.js`, `blame.js`). Big repos are sampled: up to 400 files, the same ones every visit, within about a minute.
  - Nothing is cached: every visit clones fresh.
  - At most 2 clones run at once; clones and logs time out after 3 minutes.
- `web/`: Vite + React + TypeScript. The repo and exhibit are kept in the URL (`?repo=owner/repo&exhibit=fossils`), so any exhibit can be shared as a link.
