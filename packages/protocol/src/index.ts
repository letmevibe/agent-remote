export type AgentId = 'antigravity' | 'codex' | (string & {});

export type AgentExecutionMode = 'plan' | 'accept-edits' | 'auto';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_approval'
  | 'error'
  | 'closed';

export interface AgentDescriptor {
  id: AgentId;
  name: string;
  command: string;
  available: boolean;
  version?: string;
  protocol: 'acp' | 'stream-json' | 'app-server' | 'custom';
  supportsResume: boolean;
  supportsApprovals: boolean;
}

export interface HostInfo {
  hostId: string;
  hostName: string;
  platform: string;
  workspacePath: string;
  bridgeVersion: string;
  agents: AgentDescriptor[];
}

export interface PairPayload {
  v: 1;
  url: string;
  pairCode: string;
  hostName: string;
}

export interface PairResponse {
  deviceToken: string;
  host: HostInfo;
}

export interface SessionSummary {
  id: string;
  title: string;
  agentId: AgentId;
  workspacePath: string;
  mode: AgentExecutionMode;
  model?: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastSeq: number;
  pendingApprovalCount: number;
}

export interface CreateSessionRequest {
  agentId: AgentId;
  workspacePath?: string;
  title?: string;
  mode?: AgentExecutionMode;
  model?: string;
  initialPrompt?: string;
}

export interface SendPromptRequest {
  sessionId: string;
  text: string;
  mode?: AgentExecutionMode;
  model?: string;
}

export interface PermissionRequestPayload {
  requestId: string;
  sessionId: string;
  toolName: string;
  summary: string;
  command?: string;
  filePath?: string;
  diffPreview?: string;
  createdAt: string;
}

export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export interface PermissionResponseRequest {
  sessionId: string;
  requestId: string;
  decision: PermissionDecision;
}

export type StreamEventPayload =
  | {
      type: 'user.message';
      messageId: string;
      text: string;
    }
  | {
      type: 'assistant.delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'thinking.delta';
      messageId: string;
      delta: string;
    }
  | {
      type: 'tool.call';
      callId: string;
      toolName: string;
      summary: string;
      input?: Record<string, unknown>;
    }
  | {
      type: 'tool.result';
      callId: string;
      toolName: string;
      ok: boolean;
      outputPreview: string;
    }
  | {
      type: 'permission.request';
      request: PermissionRequestPayload;
    }
  | {
      type: 'permission.resolved';
      requestId: string;
      decision: PermissionDecision;
    }
  | {
      type: 'session.status';
      status: SessionStatus;
      error?: string;
    }
  | {
      type: 'turn.completed';
      messageId?: string;
    };

export interface StreamEventEnvelope {
  seq: number;
  sessionId: string;
  timestamp: string;
  payload: StreamEventPayload;
}

export interface GitFileChange {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
  additions: number;
  deletions: number;
}

export interface GitDiffResponse {
  workspacePath: string;
  branch: string;
  files: GitFileChange[];
  diff: string;
}

export interface ClientToServerEvents {
  'session:subscribe': (
    payload: { sessionId: string; afterSeq?: number },
    ack?: (res: { ok: boolean; events?: StreamEventEnvelope[]; error?: string }) => void,
  ) => void;
  'session:unsubscribe': (payload: { sessionId: string }) => void;
  'session:prompt': (
    payload: SendPromptRequest,
    ack?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'session:cancel': (
    payload: { sessionId: string },
    ack?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
  'permission:respond': (
    payload: PermissionResponseRequest,
    ack?: (res: { ok: boolean; error?: string }) => void,
  ) => void;
}

export interface ServerToClientEvents {
  'session:event': (event: StreamEventEnvelope) => void;
  'session:updated': (session: SessionSummary) => void;
}
