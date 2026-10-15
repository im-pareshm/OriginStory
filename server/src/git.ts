import { spawn } from 'node:child_process';

export class GitError extends Error {
  readonly stderr: string;
  /** True for a timeout or oversized output: the repo was too big, not broken. */
  readonly timedOut: boolean;

  constructor(message: string, { stderr = '', timedOut = false }: { stderr?: string; timedOut?: boolean } = {}) {
    super(message);
    this.stderr = stderr;
    this.timedOut = timedOut;
  }
}

export interface GitOptions {
  cwd?: string;
  timeoutMs?: number;
  /** Kill git once its stdout passes this many bytes. */
  maxBytes?: number;
}

// Never let git ask for a username/password: private or missing repos must fail fast
// instead of hanging the request (or popping a credential window on Windows).
const GIT_ENV: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
};

const BASE_CONFIG = ['-c', 'credential.helper=', '-c', 'core.quotePath=false', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always'];

/** Runs git with an argument array (never a shell string) and resolves with stdout. */
export function git(args: string[], { cwd, timeoutMs = 60_000, maxBytes = 300 * 1024 * 1024 }: GitOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...BASE_CONFIG, ...args], { cwd, env: GIT_ENV, windowsHide: true });
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let failure: GitError | null = null;

    const timer = setTimeout(() => {
      failure = new GitError(`git ${args[0]} timed out`, { timedOut: true });
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        failure = new GitError(`git ${args[0]} produced too much output`, { timedOut: true });
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
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
