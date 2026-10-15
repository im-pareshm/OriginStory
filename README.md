# Repo Museum

Paste a public Git repository and wander through exhibits built from its history.

**Exhibit I: The File Graveyard.** Every file the repo ever deleted gets a tombstone with its birth and death dates, who deleted it, its last words (the final commit that touched it) and its cause of death (the commit that deleted it).

## Run it

Requires Node 22.12+ and `git` on your PATH.

```sh
npm install
npm run dev
```

Open http://localhost:5173. The API runs on http://localhost:3001; Vite proxies `/api` to it.

## How it works

- `server/`: Express. For each request it runs `git ls-remote` (fails fast on missing, private or empty repos), does a bare, single-branch clone into a temp folder, runs one `git log --raw --numstat -M` pass, and deletes the clone.
  - `history.js` walks the log oldest-first, tracking each file through births, renames and deletions.
  - Nothing is cached: every visit clones fresh.
  - At most 2 clones run at once; clones and logs time out after 3 minutes.
- `web/`: Vite + React + TypeScript. The repo is kept in the URL (`?repo=owner/repo`), so graveyards can be shared as links.
