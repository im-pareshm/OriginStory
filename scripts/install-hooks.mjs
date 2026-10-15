// Runs on `npm install` (the "prepare" script): points git at the committed hooks in
// .githooks/ (no commits or pushes to main, commit subject format) and at the commit
// message template in .gitmessage. Does nothing outside a git checkout.
import { execFileSync } from 'node:child_process';

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { stdio: 'ignore' });
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
  execFileSync('git', ['config', 'commit.template', '.gitmessage'], { stdio: 'inherit' });
} catch {
  // Not a git checkout (e.g. a downloaded tarball): nothing to install.
}
