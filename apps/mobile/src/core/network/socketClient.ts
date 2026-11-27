import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@agent-remote/protocol';
import type { SavedHost } from '../storage/hostStore';

export type BridgeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let activeSocket: BridgeSocket | null = null;
let activeHostKey: string | null = null;

export function getBridgeSocket(host: SavedHost): BridgeSocket {
  const key = `${host.url}|${host.deviceToken}`;
  if (activeSocket && activeHostKey === key) {
    return activeSocket;
  }

  if (activeSocket) {
    activeSocket.disconnect();
  }

  activeHostKey = key;
  activeSocket = io(host.url, {
    auth: { token: host.deviceToken },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
  });

  return activeSocket;
}

export function disconnectBridgeSocket(): void {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
    activeHostKey = null;
  }
}
