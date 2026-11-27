import crypto from 'node:crypto';
import type {
  AgentExecutionMode,
  CreateSessionRequest,
  PermissionDecision,
  SendPromptRequest,
  SessionStatus,
  SessionSummary,
  StreamEventEnvelope,
  StreamEventPayload,
} from '@agent-remote/protocol';
import type { AgentTurnHandle } from '../adapters/base.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StateStore } from '../storage/stateStore.js';

interface InternalSession {
  summary: SessionSummary;
  events: StreamEventEnvelope[];
  activeTurn?: AgentTurnHandle;
  externalConversationId?: string;
}

const MAX_BUFFERED_EVENTS = 1500;

export class SessionManager {
  private readonly sessions = new Map<string, InternalSession>();

  constructor(
    private readonly registry: AdapterRegistry,
    private readonly defaultWorkspacePath: string,
    private readonly onEventBroadcast: (event: StreamEventEnvelope) => void,
    private readonly onSessionUpdated: (session: SessionSummary) => void,
    private readonly store?: StateStore,
  ) {
    const persisted = store?.getState().sessions ?? [];
    for (const item of persisted) {
      // Reset stale running status after a bridge restart
      const summary: SessionSummary = {
        ...item.summary,
        status:
          item.summary.status === 'running' ||
          item.summary.status === 'waiting_approval'
            ? 'idle'
            : item.summary.status,
        pendingApprovalCount: 0,
      };
      this.sessions.set(summary.id, {
        summary,
        events: item.events ?? [],
        externalConversationId: item.externalConversationId,
      });
    }
  }

  list(): SessionSummary[] {
    return Array.from(this.sessions.values())
      .map((s) => s.summary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(sessionId: string): SessionSummary | undefined {
    return this.sessions.get(sessionId)?.summary;
  }

  getEventsAfter(sessionId: string, afterSeq = 0): StreamEventEnvelope[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.events.filter((e) => e.seq > afterSeq);
  }

  create(req: CreateSessionRequest): SessionSummary {
    const adapter = this.registry.get(req.agentId);
    if (!adapter) {
      throw new Error(`Unknown agent adapter: ${req.agentId}`);
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const summary: SessionSummary = {
      id,
      title: req.title?.trim() || `${adapter.name} Session`,
      agentId: req.agentId,
      workspacePath: req.workspacePath || this.defaultWorkspacePath,
      mode: req.mode ?? 'accept-edits',
      effort: req.effort ?? 'medium',
      model: req.model,
      status: 'idle',
      createdAt: now,
      updatedAt: now,
      lastSeq: 0,
      pendingApprovalCount: 0,
    };

    this.sessions.set(id, { summary, events: [] });
    this.persist();
    this.onSessionUpdated(summary);

    if (req.initialPrompt?.trim()) {
      this.sendPrompt({
        sessionId: id,
        text: req.initialPrompt.trim(),
        mode: summary.mode,
        model: summary.model,
      });
    }

    return summary;
  }

  sendPrompt(req: SendPromptRequest): void {
    const session = this.sessions.get(req.sessionId);
    if (!session) {
      throw new Error(`Session not found: ${req.sessionId}`);
    }
    if (session.activeTurn) {
      throw new Error('Session is already running a turn');
    }

    const adapter = this.registry.get(session.summary.agentId);
    if (!adapter) {
      throw new Error(`Adapter not found: ${session.summary.agentId}`);
    }

    if (req.mode) {
      session.summary.mode = req.mode;
    }
    if (req.effort) {
      session.summary.effort = req.effort;
    }
    if (req.model) {
      session.summary.model = req.model;
    }

    this.appendEvent(session, {
      type: 'user.message',
      messageId: crypto.randomUUID(),
      text: req.text,
    });

    this.setStatus(session, 'running');

    const handle = adapter.runTurn({
      sessionId: session.summary.id,
      workspacePath: session.summary.workspacePath,
      prompt: req.text,
      mode: session.summary.mode as AgentExecutionMode,
      effort: session.summary.effort,
      model: session.summary.model,
      resumeConversationId: session.externalConversationId,
      onConversationId: (externalId) => {
        if (session.externalConversationId !== externalId) {
          session.externalConversationId = externalId;
          this.persist();
        }
      },
      onEvent: (payload) => {
        if (payload.type === 'permission.request') {
          session.summary.pendingApprovalCount += 1;
          this.setStatus(session, 'waiting_approval');
        }
        this.appendEvent(session, payload);
      },
    });

    session.activeTurn = handle;

    handle.done
      .catch(() => {
        // Error status already emitted by adapter
      })
      .finally(() => {
        session.activeTurn = undefined;
        session.summary.pendingApprovalCount = 0;
        if (session.summary.status !== 'error') {
          this.setStatus(session, 'idle');
        }
      });
  }

  cancel(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session?.activeTurn) return;
    session.activeTurn.cancel();
    session.activeTurn = undefined;
    this.setStatus(session, 'idle');
  }

  respondPermission(
    sessionId: string,
    requestId: string,
    decision: PermissionDecision,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.activeTurn?.respondPermission?.(requestId, decision);
    session.summary.pendingApprovalCount = Math.max(
      0,
      session.summary.pendingApprovalCount - 1,
    );
    this.appendEvent(session, {
      type: 'permission.resolved',
      requestId,
      decision,
    });
    if (session.summary.pendingApprovalCount === 0 && session.activeTurn) {
      this.setStatus(session, 'running');
    }
  }

  private setStatus(session: InternalSession, status: SessionStatus): void {
    session.summary.status = status;
    session.summary.updatedAt = new Date().toISOString();
    this.appendEvent(session, { type: 'session.status', status });
    this.onSessionUpdated(session.summary);
  }

  private appendEvent(
    session: InternalSession,
    payload: StreamEventPayload,
  ): StreamEventEnvelope {
    const seq = session.summary.lastSeq + 1;
    const envelope: StreamEventEnvelope = {
      seq,
      sessionId: session.summary.id,
      timestamp: new Date().toISOString(),
      payload,
    };

    session.summary.lastSeq = seq;
    session.summary.updatedAt = envelope.timestamp;
    session.events.push(envelope);
    if (session.events.length > MAX_BUFFERED_EVENTS) {
      session.events.shift();
    }

    this.persist();
    this.onEventBroadcast(envelope);
    return envelope;
  }

  private persist(): void {
    this.store?.update((draft) => {
      draft.sessions = Array.from(this.sessions.values()).map((s) => ({
        summary: s.summary,
        events: s.events.slice(-300),
        externalConversationId: s.externalConversationId,
      }));
    });
  }
}
