import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import cors from 'cors';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import type {
  AttachmentRef,
  ClientToServerEvents,
  CreateSessionRequest,
  HostInfo,
  PairResponse,
  ProjectInfo,
  ServerToClientEvents,
} from '@agent-remote/protocol';
import { AdapterRegistry } from './adapters/registry.js';
import { PairingService } from './auth/pairing.js';
import type { BridgeConfig } from './config.js';
import { SessionManager } from './sessions/manager.js';
import { StateStore } from './storage/stateStore.js';
import { getWorkspaceGitDiff } from './workspace/git.js';

export interface StartedBridge {
  server: http.Server;
  pairing: PairingService;
  registry: AdapterRegistry;
  sessions: SessionManager;
  store: StateStore;
}

export async function startBridgeServer(
  config: BridgeConfig,
  options?: { statePath?: string },
): Promise<StartedBridge> {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '20mb' }));

  const server = http.createServer(app);
  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(server, {
    cors: { origin: '*' },
  });

  const store = new StateStore(options?.statePath);
  const pairing = new PairingService(store);
  const registry = new AdapterRegistry();

  const sessions = new SessionManager(
    registry,
    config.workspacePath,
    (event) => {
      io.to(`session:${event.sessionId}`).emit('session:event', event);
      const p = event.payload;
      if (p.type === 'user.message') {
        console.log(`\n[Phone] ${p.text}`);
      } else if (p.type === 'assistant.delta') {
        process.stdout.write(p.delta);
      } else if (p.type === 'tool.call') {
        console.log(`\n[Tool] ${p.toolName}: ${p.summary}`);
      } else if (p.type === 'turn.completed') {
        console.log('\n[Done]');
      } else if (p.type === 'session.status' && p.status === 'error' && p.error) {
        console.error(`\n[Error] ${p.error}`);
      }
    },
    (summary) => {
      io.emit('session:updated', summary);
    },
    store,
  );

  await sessions.syncLocalAntigravitySessions();

  const requireAuth: express.RequestHandler = (req, res, next) => {
    const authHeader = req.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    if (!pairing.verifyToken(token)) {
      res.status(401).json({ error: 'Unauthorized device token' });
      return;
    }
    next();
  };

  app.get('/health', (_req, res) => {
    res.json({ ok: true, version: '0.1.0' });
  });

  const buildHostInfo = async (): Promise<HostInfo> => {
    const [agents, models] = await Promise.all([
      registry.detectAll(),
      registry.get('antigravity')?.listModels?.() ?? Promise.resolve([]),
    ]);
    return {
      hostId: pairing.getHostId(),
      hostName: config.hostName,
      platform: `${os.platform()}-${os.arch()}`,
      workspacePath: config.workspacePath,
      bridgeVersion: '0.1.0',
      agents,
      models,
    };
  };

  app.post('/api/pair', async (req, res) => {
    const pairCode = String(req.body?.pairCode ?? '');
    const deviceToken = pairing.exchangePairCode(pairCode);
    if (!deviceToken) {
      res.status(401).json({ error: 'Invalid pairing code' });
      return;
    }
    const host = await buildHostInfo();
    const response: PairResponse = { deviceToken, host };
    res.json(response);
  });

  app.get('/api/host', requireAuth, async (_req, res) => {
    const host = await buildHostInfo();
    res.json(host);
  });

  app.get('/api/models', requireAuth, async (_req, res) => {
    const models =
      (await registry.get('antigravity')?.listModels?.()) ?? [];
    res.json({ models });
  });

  app.get('/api/sessions', requireAuth, async (_req, res) => {
    await sessions.syncLocalAntigravitySessions();
    res.json({ sessions: sessions.list() });
  });

  app.post('/api/sessions', requireAuth, (req, res) => {
    try {
      const body = req.body as CreateSessionRequest;
      const session = sessions.create(body);
      res.status(201).json({ session });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Failed to create session',
      });
    }
  });

  app.get('/api/projects', requireAuth, async (_req, res) => {
    await sessions.syncLocalAntigravitySessions();
    const projectMap = new Map<string, ProjectInfo>();
    const addProject = (dirPath: string) => {
      const normalized = path.resolve(dirPath);
      if (!projectMap.has(normalized)) {
        projectMap.set(normalized, {
          id: normalized,
          name: path.basename(normalized) || normalized,
          path: normalized,
        });
      }
    };

    addProject(config.workspacePath);
    for (const s of sessions.list()) {
      addProject(s.workspacePath);
    }

    res.json({ projects: Array.from(projectMap.values()) });
  });

  app.post('/api/uploads', requireAuth, (req, res) => {
    try {
      const nameRaw = String(req.body?.name ?? 'image.jpg');
      const mimeType = String(req.body?.mimeType ?? 'image/jpeg');
      const base64 = String(req.body?.base64 ?? '');
      if (!base64) {
        res.status(400).json({ error: 'Missing base64 image data' });
        return;
      }

      const safeName = nameRaw.replace(/[^a-zA-Z0-9._-]/g, '_');
      const id = crypto.randomUUID();
      const uploadDir = path.join(os.homedir(), '.agent-remote', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const hostPath = path.join(uploadDir, `${Date.now()}-${safeName}`);
      fs.writeFileSync(hostPath, Buffer.from(base64, 'base64'));

      const attachment: AttachmentRef = {
        id,
        name: safeName,
        mimeType,
        hostPath,
      };
      res.status(201).json({ attachment });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to save upload',
      });
    }
  });

  app.get('/api/diff', requireAuth, async (req, res) => {
    const requestedPath =
      typeof req.query.workspacePath === 'string' && req.query.workspacePath.trim()
        ? req.query.workspacePath.trim()
        : config.workspacePath;
    const diff = await getWorkspaceGitDiff(requestedPath);
    res.json(diff);
  });

  io.use((socket, next) => {
    const token =
      typeof socket.handshake.auth?.token === 'string'
        ? socket.handshake.auth.token
        : undefined;
    if (!pairing.verifyToken(token)) {
      next(new Error('Unauthorized'));
      return;
    }
    next();
  });

  io.on('connection', (socket) => {
    socket.on('session:subscribe', ({ sessionId, afterSeq }, ack) => {
      const summary = sessions.get(sessionId);
      if (!summary) {
        ack?.({ ok: false, error: 'Session not found' });
        return;
      }
      socket.join(`session:${sessionId}`);
      const events = sessions.getEventsAfter(sessionId, afterSeq ?? 0);
      ack?.({ ok: true, events });
    });

    socket.on('session:unsubscribe', ({ sessionId }) => {
      socket.leave(`session:${sessionId}`);
    });

    socket.on('session:prompt', (payload, ack) => {
      try {
        sessions.sendPrompt(payload);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to send prompt',
        });
      }
    });

    socket.on('session:cancel', ({ sessionId }, ack) => {
      sessions.cancel(sessionId);
      ack?.({ ok: true });
    });

    socket.on('permission:respond', ({ sessionId, requestId, decision }, ack) => {
      sessions.respondPermission(sessionId, requestId, decision);
      ack?.({ ok: true });
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(config.port, config.host, () => resolve());
  });

  return { server, pairing, registry, sessions, store };
}
