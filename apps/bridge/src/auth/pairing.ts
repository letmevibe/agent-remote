import crypto from 'node:crypto';
import type { PairPayload } from '@agent-remote/protocol';

export class PairingService {
  private readonly hostId: string;
  private readonly validTokens = new Set<string>();
  private activePairCode: string;

  constructor() {
    this.hostId = crypto.randomUUID();
    this.activePairCode = this.generateCode();
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
