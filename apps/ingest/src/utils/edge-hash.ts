import * as crypto from 'crypto';
import type { CausalEdge } from '@blamr/types';

export function computeEdgeHash(
  prevHash: string,
  edgeData: Omit<CausalEdge, 'prev_hash' | 'edge_hash'>,
  timestampMs: number,
): string {
  const payload = prevHash + JSON.stringify(edgeData) + String(timestampMs);
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export function enrichEdge(edge: Partial<CausalEdge>, prevHash: string): CausalEdge {
  const { prev_hash: _p, edge_hash: _e, ...data } = edge as CausalEdge;
  const hash = computeEdgeHash(prevHash, data as Omit<CausalEdge, 'prev_hash' | 'edge_hash'>, edge.timestamp_ms || Date.now());
  return {
    ...(data as CausalEdge),
    prev_hash: prevHash,
    edge_hash: hash,
  };
}
