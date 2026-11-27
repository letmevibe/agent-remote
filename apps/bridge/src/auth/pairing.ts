import crypto from 'node:crypto';
import type { PairPayload } from '@agent-remote/protocol';
import type { StateStore } from '../storage/stateStore.js';

export class PairingService {
  private readonly hostId: string;
  private readonly validTokens: Set<string>;
  private activePairCode: string;

  constructor(private readonly store?: StateStore) {
    const persisted = store?.getState();
    this.hostId = persisted?.hostId ?? crypto.randomUUID();
    this.validTokens = new Set<string>(persisted?.validTokens ?? []);
    this.activePairCode = this.generateCode();

    if (store && !persisted?.hostId) {
      store.update((draft) => {
        draft.hostId = this.hostId;
      });
    }
  }

  getHostId(): string {
    return this.hostId;
  }

  getPairCode(): string {
    return this.activePairCode;
  }

  rotatePairCode(): string {
    this.activePairCode = this.generateCode();
    return this.activePairCode;
  }

  buildPairPayload(url: string, hostName: string): PairPayload {
    return {
      v: 1,
      url,
      pairCode: this.activePairCode,
      hostName,
    };
  }

  exchangePairCode(pairCode: string): string | null {
    const normalized = pairCode.trim().toUpperCase();
    if (!normalized || normalized !== this.activePairCode) {
      return null;
    }
    const deviceToken = `ar_${crypto.randomBytes(24).toString('hex')}`;
    this.validTokens.add(deviceToken);
    this.store?.update((draft) => {
      draft.validTokens = Array.from(this.validTokens);
    });
    return deviceToken;
  }

  verifyToken(token: string | undefined): boolean {
    if (!token) return false;
    return this.validTokens.has(token);
  }

  private generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = crypto.randomBytes(6);
    let out = '';
    for (let i = 0; i < 6; i += 1) {
      out += chars[bytes[i]! % chars.length];
    }
    return out;
  }
}
