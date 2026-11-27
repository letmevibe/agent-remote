import { spawn, execFile } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { promisify } from 'node:util';
import type { AgentDescriptor, ModelInfo } from '@agent-remote/protocol';
import type { AgentAdapter, AgentTurnContext, AgentTurnHandle } from './base.js';

const execFileAsync = promisify(execFile);

function resolveAgyBinary(): string {
  return process.platform === 'win32' ? 'agy.exe' : 'agy';
}

interface AgyStepUpdate {
  conversation_id?: string;
  step_index?: number;
  state?: string;
  step_type?: string;
  text_delta?: string;
  thinking_delta?: string;
  tool_name?: string;
  summary?: string;
  output?: string;
  error?: string;
}

interface AgyStreamEvent {
  event?: string;
  conversation_id?: string;
  step_update?: AgyStepUpdate;
  result?: {
    conversation_id?: string;
    status?: string;
    response?: string;
    error?: string;
  };
}

export class AntigravityAdapter implements AgentAdapter {
  readonly id = 'antigravity';
  readonly name = 'Antigravity CLI';
  readonly command = resolveAgyBinary();
  readonly protocol = 'stream-json' as const;
  readonly supportsResume = true;
  readonly supportsApprovals = true;
  private cachedModels: { items: ModelInfo[]; expiresAt: number } | null = null;

  async listModels(): Promise<ModelInfo[]> {
    if (this.cachedModels && Date.now() < this.cachedModels.expiresAt) {
      return this.cachedModels.items;
    }

    try {
      const { stdout } = await execFileAsync(this.command, ['models'], {
        timeout: 15000,
      });
      const items: ModelInfo[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes('\t')) continue;
        const [id, ...rest] = trimmed.split('\t');
        const label = rest.join(' ').trim();
        if (id && label) {
          items.push({ id: id.trim(), label });
        }
      }
      if (items.length > 0) {
        this.cachedModels = {
          items,
          expiresAt: Date.now() + 5 * 60 * 1000,
        };
      }
      return items;
    } catch {
      return this.cachedModels?.items ?? [];
    }
  }

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
      '--output-format',
      'stream-json',
      '--mode',
      ctx.mode,
    ];

    if (ctx.model) {
      args.push('--model', ctx.model);
    } else if (ctx.effort) {
      args.push('--effort', ctx.effort);
    }
    if (ctx.resumeConversationId) {
      args.push('--resume', ctx.resumeConversationId);
    }

    // --print takes the prompt string directly as its value
    args.push('--print', ctx.prompt);

    const child = spawn(this.command, args, {
      cwd: ctx.workspacePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const assistantMessageId = crypto.randomUUID();
    const seenToolSteps = new Set<string>();
    let streamedAnyText = false;
    let emittedTurnCompleted = false;

    const rl = readline.createInterface({ input: child.stdout });

    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        const parsed = JSON.parse(trimmed) as AgyStreamEvent;
        this.handleEvent(parsed, {
          assistantMessageId,
          seenToolSteps,
          markTextStreamed: () => {
            streamedAnyText = true;
          },
          hasStreamedText: () => streamedAnyText,
          markTurnCompleted: () => {
            emittedTurnCompleted = true;
          },
          ctx,
        });
      } catch {
        streamedAnyText = true;
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
        } else if (!emittedTurnCompleted) {
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

  private handleEvent(
    raw: AgyStreamEvent,
    state: {
      assistantMessageId: string;
      seenToolSteps: Set<string>;
      markTextStreamed: () => void;
      hasStreamedText: () => boolean;
      markTurnCompleted: () => void;
      ctx: AgentTurnContext;
    },
  ): void {
    const { ctx, assistantMessageId, seenToolSteps } = state;

    const convId =
      raw.conversation_id ||
      raw.step_update?.conversation_id ||
      raw.result?.conversation_id;

    if (convId && ctx.onConversationId) {
      ctx.onConversationId(convId);
    }

    if (raw.event === 'step_update' && raw.step_update) {
      const step = raw.step_update;
      const stepType = step.step_type ?? '';

      if (step.thinking_delta) {
        ctx.onEvent({
          type: 'thinking.delta',
          messageId: assistantMessageId,
          delta: step.thinking_delta,
        });
      }

      if (stepType === 'agent_response') {
        if (step.text_delta) {
          state.markTextStreamed();
          ctx.onEvent({
            type: 'assistant.delta',
            messageId: assistantMessageId,
            delta: step.text_delta,
          });
        }
        return;
      }

      if (stepType && stepType !== 'user_input' && stepType !== 'thinking') {
        const callId = `step-${step.step_index ?? crypto.randomUUID()}`;
        const toolName = step.tool_name || stepType;

        if (!seenToolSteps.has(callId)) {
          seenToolSteps.add(callId);
          ctx.onEvent({
            type: 'tool.call',
            callId,
            toolName,
            summary: step.summary || toolName,
          });
        }

        if (step.state === 'DONE' || step.state === 'ERROR') {
          ctx.onEvent({
            type: 'tool.result',
            callId,
            toolName,
            ok: step.state === 'DONE' && !step.error,
            outputPreview: (step.output || step.error || 'Completed').slice(0, 2000),
          });
        }
      }
      return;
    }

    if (raw.event === 'result' && raw.result) {
      if (raw.result.status && raw.result.status !== 'SUCCESS') {
        ctx.onEvent({
          type: 'session.status',
          status: 'error',
          error: raw.result.error || `Agent finished with status ${raw.result.status}`,
        });
        return;
      }

      if (!state.hasStreamedText() && raw.result.response) {
        state.markTextStreamed();
        ctx.onEvent({
          type: 'assistant.delta',
          messageId: assistantMessageId,
          delta: raw.result.response,
        });
      }

      state.markTurnCompleted();
      ctx.onEvent({
        type: 'turn.completed',
        messageId: assistantMessageId,
      });
    }
  }
}
