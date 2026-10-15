import { spawn } from 'node:child_process';

export class GitError extends Error {
  constructor(message, { stderr = '', timedOut = false } = {}) {
    super(message);
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

// Never let git ask for a username/password: private or missing repos must fail fast
// instead of hanging the request (or popping a credential window on Windows).
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
};

const BASE_CONFIG = ['-c', 'credential.helper=', '-c', 'core.quotePath=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always'];

/** Runs git with an argument array (never a shell string) and resolves with stdout. */
export function git(args, { cwd, timeoutMs = 60_000, maxBytes = 300 * 1024 * 1024 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...BASE_CONFIG, ...args], { cwd, env: GIT_ENV, windowsHide: true });
    const chunks = [];
    let size = 0;
    let stderr = '';
    let failure = null;

    const timer = setTimeout(() => {
      failure = new GitError(`git ${args[0]} timed out`, { timedOut: true });
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        failure = new GitError(`git ${args[0]} produced too much output`, { timedOut: true });
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 8_000) stderr += chunk.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new GitError(`Could not run git: ${err.message}`));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0) return reject(new GitError(`git ${args[0]} exited with code ${code}`, { stderr }));
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
  });
}
