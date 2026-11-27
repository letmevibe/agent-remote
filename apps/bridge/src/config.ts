import os from 'node:os';
import path from 'node:path';

export interface BridgeConfig {
  port: number;
  host: string;
  hostName: string;
  workspacePath: string;
  publicUrl?: string;
}

export function detectLanAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const iface of entries) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

export function resolveConfig(argv: string[]): BridgeConfig {
  let port = Number(process.env.AGENT_REMOTE_PORT ?? 4789);
  let host = process.env.AGENT_REMOTE_HOST ?? '0.0.0.0';
  let hostName = process.env.AGENT_REMOTE_NAME ?? os.hostname();
  let workspacePath = process.env.AGENT_REMOTE_CWD ?? process.cwd();
  let publicUrl = process.env.AGENT_REMOTE_PUBLIC_URL;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '--port' || arg === '-p') && next) {
      port = Number(next);
      i += 1;
    } else if (arg === '--host' && next) {
      host = next;
      i += 1;
    } else if (arg === '--name' && next) {
      hostName = next;
      i += 1;
    } else if ((arg === '--cwd' || arg === '-C') && next) {
      workspacePath = path.resolve(next);
      i += 1;
    } else if (arg === '--public-url' && next) {
      publicUrl = next.replace(/\/+$/, '');
      i += 1;
    }
  }

  return {
    port: Number.isFinite(port) && port > 0 ? port : 4789,
    host,
    hostName,
    workspacePath: path.resolve(workspacePath),
    publicUrl,
  };
}
