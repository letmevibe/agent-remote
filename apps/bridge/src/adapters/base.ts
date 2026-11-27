import type {
  AgentDescriptor,
  AgentExecutionMode,
  PermissionDecision,
  ReasoningEffort,
  StreamEventPayload,
} from '@agent-remote/protocol';

export interface AgentTurnContext {
  sessionId: string;
  workspacePath: string;
  prompt: string;
  mode: AgentExecutionMode;
  effort?: ReasoningEffort;
  model?: string;
  resumeConversationId?: string;
  onEvent: (event: StreamEventPayload) => void;
  onConversationId?: (externalId: string) => void;
}

export interface AgentTurnHandle {
  cancel: () => void;
  respondPermission?: (requestId: string, decision: PermissionDecision) => void;
  done: Promise<void>;
}

export interface AgentAdapter {
  readonly id: string;
  readonly name: string;
  readonly command: string;
  readonly protocol: AgentDescriptor['protocol'];
  readonly supportsResume: boolean;
  readonly supportsApprovals: boolean;
  detect(): Promise<AgentDescriptor>;
  runTurn(ctx: AgentTurnContext): AgentTurnHandle;
}
