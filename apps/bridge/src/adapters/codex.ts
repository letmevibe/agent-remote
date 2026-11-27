import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { promisify } from 'node:util';
import type { AgentDescriptor } from '@agent-remote/protocol';
import type { AgentAdapter, AgentTurnContext, AgentTurnHandle } from './base.js';

const execFileAsync = promisify(execFile);

function resolveCodexBinary(): string {
  return process.platform === 'win32' ? 'codex.cmd' : 'codex';
}

export class CodexAdapter implements AgentAdapter {
  readonly id = 'codex';
  readonly name = 'OpenAI Codex CLI';
  readonly command = resolveCodexBinary();
  readonly protocol = 'app-server' as const;
  readonly supportsResume = true;
  readonly supportsApprovals = true;

  async detect(): Promise<AgentDescriptor> {
    try {
      await execFileAsync(this.command, ['--version'], { timeout: 5000 });
      return {
        id: this.id,
        name: this.name,
        command: this.command,
        available: true,
        protocol: this.protocol,
        supportsResume: this.supportsResume,
        supportsApprovals: this.supportsApprovals,
      };
    } catch {
      return {
        id: this.id,
        name: this.name,
        command: this.command,
        available: false,
        protocol: this.protocol,
        supportsResume: this.supportsResume,
        supportsApprovals: this.supportsApprovals,
      };
    }
  }

  runTurn(ctx: AgentTurnContext): AgentTurnHandle {
    const args: string[] = ['exec', '--json'];
    if (ctx.model) {
      args.push('--model', ctx.model);
    }
    args.push(ctx.prompt);

    const child = spawn(this.command, args, {
      cwd: ctx.workspacePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const assistantMessageId = crypto.randomUUID();
    const rl = readline.createInterface({ input: child.stdout });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const text =
          (typeof parsed.delta === 'string' && parsed.delta) ||
          (typeof parsed.text === 'string' && parsed.text) ||
          (typeof parsed.message === 'string' && parsed.message) ||
          '';
        if (text) {
          ctx.onEvent({
            type: 'assistant.delta',
            messageId: assistantMessageId,
            delta: text,
          });
        }
      } catch {
        ctx.onEvent({
          type: 'assistant.delta',
          messageId: assistantMessageId,
          delta: `${trimmed}\n`,
        });
      }
    });

    let stderrBuffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
    });

    const done = new Promise<void>((resolve, reject) => {
      child.on('error', (err) => {
        ctx.onEvent({
          type: 'session.status',
          status: 'error',
          error: `Failed to launch ${this.command}: ${err.message}`,
        });
        reject(err);
      });

      child.on('close', (code) => {
        rl.close();
        if (code && code !== 0) {
          ctx.onEvent({
            type: 'session.status',
            status: 'error',
            error: stderrBuffer.trim() || `${this.command} exited with code ${code}`,
          });
        } else {
          ctx.onEvent({
            type: 'turn.completed',
            messageId: assistantMessageId,
          });
        }
        resolve();
      });
    });

    return {
      cancel: () => {
        child.kill('SIGTERM');
      },
      done,
    };
  }
}
