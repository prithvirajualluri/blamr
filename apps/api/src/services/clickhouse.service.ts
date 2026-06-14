import { Injectable, OnModuleInit } from '@nestjs/common';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import type { CausalEdge } from '@blamr/types';

@Injectable()
export class ClickHouseService implements OnModuleInit {
  private client!: ClickHouseClient;

  onModuleInit() {
    this.client = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'blamr',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
    });
  }

  async insertEdges(edges: CausalEdge[]): Promise<void> {
    if (edges.length === 0) return;
    await this.client.insert({
      table: 'causal_edges',
      values: edges.map((e) => ({
        id: e.id,
        run_id: e.run_id,
        workflow_id: e.workflow_id,
        workspace_id: e.workspace_id,
        from_agent: e.from_agent,
        to_agent: e.to_agent,
        hop_index: e.hop_index,
        timestamp_ms: e.timestamp_ms,
        confidence_in: e.confidence_in,
        confidence_out: e.confidence_out,
        intent_delta: e.intent_delta,
        influence_score: e.influence_score,
        tokens_in: e.tokens_in,
        tokens_out: e.tokens_out,
        latency_ms: e.latency_ms,
        model: e.model,
        call_type: e.call_type,
        cost_usd: e.cost_usd,
        prev_hash: e.prev_hash,
        edge_hash: e.edge_hash,
      })),
      format: 'JSONEachRow',
    });
  }

  async getEdgesByRunId(runId: string): Promise<CausalEdge[]> {
    const result = await this.client.query({
      query: `SELECT * FROM causal_edges WHERE run_id = {runId:String} ORDER BY hop_index`,
      query_params: { runId },
      format: 'JSONEachRow',
    });
    return result.json<CausalEdge>();
  }

  async getEdgesByRunIds(runIds: string[]): Promise<Map<string, CausalEdge[]>> {
    if (runIds.length === 0) return new Map();
    const result = await this.client.query({
      query: `SELECT * FROM causal_edges WHERE run_id IN ({runIds:Array(String)}) ORDER BY run_id, hop_index`,
      query_params: { runIds },
      format: 'JSONEachRow',
    });
    const edges = await result.json<CausalEdge>();
    const map = new Map<string, CausalEdge[]>();
    for (const edge of edges) {
      const list = map.get(edge.run_id) || [];
      list.push(edge);
      map.set(edge.run_id, list);
    }
    return map;
  }
}
