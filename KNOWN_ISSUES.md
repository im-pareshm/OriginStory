# Known issues

Verified problems that have a workaround in place, or fixes that were deliberately
deferred. This is not a backlog: feature ideas belong in AGENTS.md "What this is".

Rules:

- **Park a fix → add the entry in the same commit** as whatever carries the debt.
- **Fix it → delete the entry in the same commit.** Git history is the archive; there
  is no "resolved" section.
- **Link both ways.** Each entry names the code involved, and that code has a comment
  `See KNOWN_ISSUES.md "<entry title>"`, so `grep -r KNOWN_ISSUES` finds every hook.

Entry format: **Symptom** · **Cause** (verified, with file pointers) · **Workaround in
place** · **Fix plan** (the last step is always "delete this entry") · **Since**.

---

## Private-network check is by hostname only

**Symptom.** Links to `localhost`, `*.local` and private IPv4 literals like
`192.168.1.10` are rejected. But a public hostname whose DNS record points at a
private or loopback address passes the check, and the server will try to clone
from it. A redirect from a public host to an internal one is not checked either.

**Cause.** `isPrivateHost` in `server/src/url.ts` inspects only the text of the
hostname. Nothing resolves the name or checks the address git actually connects to.
Found by reading the code on 2026-10-15; not exploited or tested.

**Workaround in place.** None needed while the app runs only on a developer
machine. It matters as soon as the server is deployed somewhere with internal
services (cloud metadata endpoints, admin panels on the same network).

**Fix plan.** Before deploying: resolve the hostname with `dns.lookup` (all
addresses) and reject private, loopback, link-local and CGNAT ranges for both IPv4
and IPv6. Pass `-c http.followRedirects=false` to git, or re-check the redirect
target. Alternatively, firewall the host so the server process can't reach internal
networks. Then delete this entry.

**Since.** First version of `server/src/url.js` (2026-10-15).
