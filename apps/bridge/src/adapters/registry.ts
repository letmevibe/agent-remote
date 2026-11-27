import type { AgentDescriptor, AgentId } from '@agent-remote/protocol';
import { AntigravityAdapter } from './antigravity.js';
import type { AgentAdapter } from './base.js';
import { CodexAdapter } from './codex.js';

export class AdapterRegistry {
  private readonly adapters = new Map<AgentId, AgentAdapter>();

  constructor() {
    this.register(new AntigravityAdapter());
    this.register(new CodexAdapter());
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: AgentId): AgentAdapter | undefined {
    return this.adapters.get(id);
  }

  async detectAll(): Promise<AgentDescriptor[]> {
    const list = Array.from(this.adapters.values());
    return Promise.all(list.map((adapter) => adapter.detect()));
  }
}
