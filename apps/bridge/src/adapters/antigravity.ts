import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { promisify } from 'node:util';
import type { AgentDescriptor } from '@agent-remote/protocol';
import type { AgentAdapter, AgentTurnContext, AgentTurnHandle } from './base.js';

const execFileAsync = promisify(execFile);

function resolveAgyBinary(): string {
  return process.platform === 'win32' ? 'agy.exe' : 'agy';
}

export class AntigravityAdapter implements AgentAdapter {
  readonly id = 'antigravity';
  readonly name = 'Antigravity CLI';
  readonly command = resolveAgyBinary();
  readonly protocol = 'stream-json' as const;
  readonly supportsResume = true;
  readonly supportsApprovals = true;

  async detect(): Promise<AgentDescriptor> {
    try {
      await execFileAsync(this.command, ['--help'], { timeout: 5000 });
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
    const args: string[] = [
      '--print',
      '--output-format',
      'stream-json',
      '--mode',
      ctx.mode,
    ];

    if (ctx.model) {
      args.push('--model', ctx.model);
    }
    if (ctx.resumeConversationId) {
      args.push('--resume', ctx.resumeConversationId);
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
        this.handleJsonEvent(parsed, assistantMessageId, ctx);
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

  private handleJsonEvent(
    raw: Record<string, unknown>,
    messageId: string,
    ctx: AgentTurnContext,
  ): void {
    const convId =
      (typeof raw.conversationId === 'string' && raw.conversationId) ||
      (typeof raw.conversation_id === 'string' && raw.conversation_id) ||
      (typeof raw.session_id === 'string' && raw.session_id);

    if (convId && ctx.onConversationId) {
      ctx.onConversationId(convId);
    }

    const type = String(raw.type ?? '');

    if (type.includes('thinking') || type.includes('reasoning')) {
      const delta = String(raw.delta ?? raw.text ?? raw.content ?? '');
      if (delta) {
        ctx.onEvent({ type: 'thinking.delta', messageId, delta });
      }
      return;
    }

    if (type.includes('tool_use') || type.includes('tool_call')) {
      const callId = String(raw.id ?? raw.callId ?? crypto.randomUUID());
      const toolName = String(raw.name ?? raw.tool ?? 'tool');
      ctx.onEvent({
        type: 'tool.call',
        callId,
        toolName,
        summary: `${toolName}`,
        input:
          typeof raw.input === 'object' && raw.input !== null
            ? (raw.input as Record<string, unknown>)
            : undefined,
      });
      return;
    }

    if (type.includes('tool_result')) {
      const callId = String(raw.tool_use_id ?? raw.callId ?? crypto.randomUUID());
      const toolName = String(raw.name ?? raw.tool ?? 'tool');
      const output =
        typeof raw.output === 'string'
          ? raw.output
          : typeof raw.content === 'string'
            ? raw.content
            : JSON.stringify(raw.output ?? raw.content ?? '');
      ctx.onEvent({
        type: 'tool.result',
        callId,
        toolName,
        ok: raw.is_error !== true,
        outputPreview: output.slice(0, 2000),
      });
      return;
    }

    const text =
      (typeof raw.delta === 'string' && raw.delta) ||
      (typeof raw.text === 'string' && raw.text) ||
      (typeof raw.result === 'string' && raw.result) ||
      '';

    if (text) {
      ctx.onEvent({
        type: 'assistant.delta',
        messageId,
        delta: text,
      });
    }
  }
}
