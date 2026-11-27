import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  SessionStatus,
  SessionSummary,
  StreamEventEnvelope,
} from '@agent-remote/protocol';

interface RawSummaryRow {
  conversation_id?: string;
  title?: string;
  preview?: string;
  last_modified_time?: string;
  workspace_uris?: string;
  status?: string;
  parent_conversation_id?: string;
  killed?: number;
}

export interface DiscoveredConversation {
  summary: SessionSummary;
  externalConversationId: string;
  sourceDir: string;
  isCliNative: boolean;
}

function uriToPath(uri: string, fallback: string): string {
  try {
    if (uri.startsWith('file://')) {
      return path.resolve(fileURLToPath(uri));
    }
    return path.resolve(uri);
  } catch {
    return fallback;
  }
}

function parseWorkspacePath(workspaceUrisRaw: string | undefined, fallback: string): string {
  if (!workspaceUrisRaw) return fallback;
  try {
    const parsed = JSON.parse(workspaceUrisRaw);
    if (Array.isArray(parsed) && typeof parsed[0] === 'string' && parsed[0].trim()) {
      return uriToPath(parsed[0].trim(), fallback);
    }
  } catch {
    // Ignore malformed JSON
  }
  return fallback;
}

function normalizeTimestamp(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function mapStatus(raw: string | undefined): SessionStatus {
  if (!raw) return 'idle';
  if (raw.includes('RUNNING')) return 'running';
  if (raw.includes('WAITING')) return 'waiting_approval';
  return 'idle';
}

function extractUserRequest(content: string): string {
  const match = content.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/);
  if (match && match[1]) {
    return match[1].trim();
  }
  return content.trim();
}

export async function discoverAntigravityConversations(
  fallbackWorkspace: string,
  limitPerSource = 40,
): Promise<DiscoveredConversation[]> {
  let DatabaseSync: typeof import('node:sqlite').DatabaseSync;
  try {
    ({ DatabaseSync } = await import('node:sqlite'));
  } catch {
    return [];
  }

  const dirs = [
    path.join(os.homedir(), '.gemini', 'antigravity-cli'),
    path.join(os.homedir(), '.gemini', 'antigravity'),
  ];

  const byId = new Map<string, DiscoveredConversation>();

  for (const baseDir of dirs) {
    const dbPath = path.join(baseDir, 'conversation_summaries.db');
    if (!fs.existsSync(dbPath)) continue;

    let db: InstanceType<typeof DatabaseSync> | undefined;
    try {
      db = new DatabaseSync(dbPath, { readOnly: true });
      const rows = db
        .prepare(
          `SELECT conversation_id, title, preview, last_modified_time, workspace_uris, status, parent_conversation_id, killed
           FROM conversation_summaries
           WHERE (parent_conversation_id IS NULL OR parent_conversation_id = '')
             AND (killed IS NULL OR killed = 0)
           ORDER BY last_modified_time DESC
           LIMIT ?`,
        )
        .all(limitPerSource) as RawSummaryRow[];

      for (const row of rows) {
        const id = row.conversation_id?.trim();
        if (!id || byId.has(id)) continue;

        const title =
          row.title?.trim() ||
          row.preview?.trim().slice(0, 64) ||
          'Antigravity Conversation';
        const updatedAt = normalizeTimestamp(row.last_modified_time);
        const workspacePath = parseWorkspacePath(
          row.workspace_uris,
          fallbackWorkspace,
        );

        byId.set(id, {
          externalConversationId: id,
          sourceDir: baseDir,
          isCliNative: baseDir.endsWith('antigravity-cli'),
          summary: {
            id,
            title,
            agentId: 'antigravity',
            workspacePath,
            mode: 'accept-edits',
            effort: 'medium',
            status: mapStatus(row.status),
            createdAt: updatedAt,
            updatedAt,
            lastSeq: 0,
            pendingApprovalCount: 0,
          },
        });
      }
    } catch {
      // Ignore locked or incompatible SQLite DB
    } finally {
      try {
        db?.close();
      } catch {
        // Ignore close error
      }
    }
  }

  return Array.from(byId.values()).sort((a, b) =>
    b.summary.updatedAt.localeCompare(a.summary.updatedAt),
  );
}

export function loadAntigravityTranscriptEvents(
  sessionId: string,
  conversationId: string,
  preferredSourceDir?: string,
): StreamEventEnvelope[] {
  const candidateDirs = [
    preferredSourceDir,
    path.join(os.homedir(), '.gemini', 'antigravity-cli'),
    path.join(os.homedir(), '.gemini', 'antigravity'),
  ].filter((d): d is string => Boolean(d));

  let transcriptPath: string | null = null;
  for (const dir of candidateDirs) {
    const p = path.join(
      dir,
      'brain',
      conversationId,
      '.system_generated',
      'logs',
      'transcript.jsonl',
    );
    if (fs.existsSync(p)) {
      transcriptPath = p;
      break;
    }
  }

  if (!transcriptPath) return [];

  try {
    const raw = fs.readFileSync(transcriptPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const events: StreamEventEnvelope[] = [];
    let seq = 0;

    for (const line of lines.slice(-120)) {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }

      const type = String(entry.type ?? '');
      const timestamp =
        typeof entry.created_at === 'string'
          ? entry.created_at
          : new Date().toISOString();
      const stepIdx = String(entry.step_index ?? seq);
      const content = typeof entry.content === 'string' ? entry.content : '';

      if (type === 'USER_INPUT' && content) {
        const text = extractUserRequest(content);
        if (!text) continue;
        seq += 1;
        events.push({
          seq,
          sessionId,
          timestamp,
          payload: {
            type: 'user.message',
            messageId: `hist-u-${stepIdx}`,
            text,
          },
        });
      } else if (type === 'PLANNER_RESPONSE' && content) {
        seq += 1;
        events.push({
          seq,
          sessionId,
          timestamp,
          payload: {
            type: 'assistant.delta',
            messageId: `hist-a-${stepIdx}`,
            delta: content,
          },
        });
      }
    }

    return events;
  } catch {
    return [];
  }
}
