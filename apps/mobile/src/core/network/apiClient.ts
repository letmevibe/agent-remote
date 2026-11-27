import type {
  CreateSessionRequest,
  GitDiffResponse,
  HostInfo,
  PairResponse,
  SessionSummary,
} from '@agent-remote/protocol';
import type { SavedHost } from '../storage/hostStore';

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`,
    );
  }

  return (await res.json()) as T;
}

export async function pairWithHost(
  baseUrl: string,
  pairCode: string,
): Promise<PairResponse> {
  const normalized = baseUrl.replace(/\/+$/, '');
  return requestJson<PairResponse>(`${normalized}/api/pair`, {
    method: 'POST',
    body: JSON.stringify({ pairCode }),
  });
}

export async function fetchHostInfo(host: SavedHost): Promise<HostInfo> {
  return requestJson<HostInfo>(`${host.url}/api/host`, {
    headers: { Authorization: `Bearer ${host.deviceToken}` },
  });
}

export async function fetchSessions(host: SavedHost): Promise<SessionSummary[]> {
  const data = await requestJson<{ sessions: SessionSummary[] }>(
    `${host.url}/api/sessions`,
    {
      headers: { Authorization: `Bearer ${host.deviceToken}` },
    },
  );
  return data.sessions;
}

export async function createSession(
  host: SavedHost,
  payload: CreateSessionRequest,
): Promise<SessionSummary> {
  const data = await requestJson<{ session: SessionSummary }>(
    `${host.url}/api/sessions`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${host.deviceToken}` },
      body: JSON.stringify(payload),
    },
  );
  return data.session;
}

export async function fetchWorkspaceDiff(
  host: SavedHost,
): Promise<GitDiffResponse> {
  return requestJson<GitDiffResponse>(`${host.url}/api/diff`, {
    headers: { Authorization: `Bearer ${host.deviceToken}` },
  });
}
