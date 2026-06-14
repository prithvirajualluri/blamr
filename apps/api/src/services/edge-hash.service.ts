import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class EdgeHashService {
  computeEdgeHash(prevHash: string, edgeData: Record<string, unknown>, timestampMs: number): string {
    const payload = prevHash + JSON.stringify(edgeData) + String(timestampMs);
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  verifyChain(edges: Array<{ prev_hash: string; edge_hash: string; [key: string]: unknown }>): boolean {
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const { prev_hash, edge_hash, ...data } = edge;
      const expected = this.computeEdgeHash(
        prev_hash,
        data as Record<string, unknown>,
        (edge.timestamp_ms as number) || 0,
      );
      if (expected !== edge_hash) return false;
    }
    return true;
  }
}
