import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { SessionSummary, StreamEventEnvelope } from '@agent-remote/protocol';

export interface PersistedSession {
  summary: SessionSummary;
  events: StreamEventEnvelope[];
  externalConversationId?: string;
}

export interface PersistedBridgeState {
  hostId?: string;
  validTokens: string[];
  sessions: PersistedSession[];
}

export class StateStore {
  private readonly filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private state: PersistedBridgeState;

  constructor(customPath?: string) {
    const dir = customPath
      ? path.dirname(customPath)
      : path.join(os.homedir(), '.agent-remote');
    this.filePath = customPath ?? path.join(dir, 'state.json');
    this.state = this.load();
  }

  getState(): PersistedBridgeState {
    return this.state;
  }

  update(mutator: (draft: PersistedBridgeState) => void): void {
    mutator(this.state);
    this.scheduleSave();
  }

  flushSync(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // Ignore persistence write errors so bridge stays operational
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.flushSync();
    }, 250);
  }

  private load(): PersistedBridgeState {
    try {
      if (!fs.existsSync(this.filePath)) {
        return { validTokens: [], sessions: [] };
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<PersistedBridgeState>;
      return {
        hostId: typeof parsed.hostId === 'string' ? parsed.hostId : undefined,
        validTokens: Array.isArray(parsed.validTokens) ? parsed.validTokens : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      return { validTokens: [], sessions: [] };
    }
  }
}
