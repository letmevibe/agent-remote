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
import {
  discoverAntigravityConversations,
  loadAntigravityTranscriptEvents,
} from '../adapters/antigravityHistory.js';
import type { AdapterRegistry } from '../adapters/registry.js';
import type { StateStore } from '../storage/stateStore.js';

interface InternalSession {
  summary: SessionSummary;
  events: StreamEventEnvelope[];
  activeTurn?: AgentTurnHandle;
  externalConversationId?: string;
  sourceDir?: string;
  isCliNative?: boolean;
  transcriptLoaded?: boolean;
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

  async syncLocalAntigravitySessions(): Promise<void> {
    const discovered = await discoverAntigravityConversations(
      this.defaultWorkspacePath,
    );
    for (const item of discovered) {
      const existing = this.sessions.get(item.summary.id);
      if (existing) {
        existing.summary.title = item.summary.title;
        existing.summary.updatedAt = item.summary.updatedAt;
        if (!existing.activeTurn) {
          existing.summary.status = item.summary.status;
        }
        existing.sourceDir = item.sourceDir;
        if (existing.isCliNative === undefined) {
          existing.isCliNative = item.isCliNative;
        }
        continue;
      }

      this.sessions.set(item.summary.id, {
        summary: item.summary,
        events: [],
        externalConversationId: item.externalConversationId,
        sourceDir: item.sourceDir,
        isCliNative: item.isCliNative,
        transcriptLoaded: false,
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

    if (
      session.events.length === 0 &&
      !session.transcriptLoaded &&
      session.externalConversationId
    ) {
      session.transcriptLoaded = true;
      const loaded = loadAntigravityTranscriptEvents(
        session.summary.id,
        session.externalConversationId,
        session.sourceDir,
      );
      if (loaded.length > 0) {
        session.events = loaded;
        session.summary.lastSeq = loaded[loaded.length - 1]!.seq;
      }
    }

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

    // Only pass --resume for native agy-cli trajectories; for Desktop/IDE
    // imported sessions, carry recent context into a new agy-cli trajectory
    // and then bind its conversation ID for all future turns.
    let promptToSend = req.text;
    let resumeId = session.externalConversationId;

    if (session.isCliNative === false) {
      resumeId = undefined;
      const recentContext = session.events
        .slice(-8, -1)
        .map((e) => {
          if (e.payload.type === 'user.message') return `User: ${e.payload.text}`;
          if (e.payload.type === 'assistant.delta') return `Assistant: ${e.payload.delta}`;
          return '';
        })
        .filter(Boolean)
        .join('\n\n')
        .slice(-3000);

      if (recentContext) {
        promptToSend = `Continuing conversation "${session.summary.title}". Recent context:\n${recentContext}\n\nNew user message:\n${req.text}`;
      }
    }

    const handle = adapter.runTurn({
      sessionId: session.summary.id,
      workspacePath: session.summary.workspacePath,
      prompt: promptToSend,
      mode: session.summary.mode as AgentExecutionMode,
      effort: session.summary.effort,
      model: session.summary.model,
      resumeConversationId: resumeId,
      onConversationId: (externalId) => {
        if (session.externalConversationId !== externalId || session.isCliNative === false) {
          session.externalConversationId = externalId;
          session.isCliNative = true;
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
