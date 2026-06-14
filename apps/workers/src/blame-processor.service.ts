import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Kafka, Consumer, Producer } from 'kafkajs';
import { createClient, ClickHouseClient } from '@clickhouse/client';
import Redis from 'ioredis';
import { Pool } from 'pg';
import type { CausalEdge, ConfidenceGateResult } from '@blamr/types';
import { evaluateConfidenceGate, reconcileEdgeConfidenceChain, resolveWorkflowGate, resolveIntentDriftThreshold, isTelemetryFirst } from '@blamr/types';
import {
  enrichEdgesWithSemanticDrift,
  enrichBlameReasonsWithLlm,
  isLlmBlameReasonEnabled,
  isSemanticDriftEnabled,
} from '@blamr/semantic';
import {
  analyzeRunWithMl,
  attachHopAnalysisToReport,
  boostInfluenceFromMl,
  fuseBlameScores,
  isMlEnabled,
  loadMlBundle,
} from '@blamr/ml';
import { computeFromEdges, sleep } from './compute-blame';
import { RedisDriftCache } from './drift-cache';
import { loadWorkspaceSettings } from './workspace-settings';

interface RunCompletedEvent {
  run_id: string;
  workspace_id: string;
  status: 'success' | 'failed';
  error_summary?: string | null;
  completed_at?: number;
  confidence_accept_level?: number | null;
  confidence_gate_mode?: 'final' | 'min' | null;
  confidence_gate?: ConfidenceGateResult | null;
}

@Injectable()
export class BlameProcessorService implements OnModuleInit {
  private readonly logger = new Logger(BlameProcessorService.name);
  private consumer!: Consumer;
  private producer!: Producer;
  private clickhouse!: ClickHouseClient;
  private pg!: Pool;
  private redis!: Redis;
  private driftCache!: RedisDriftCache;

  async onModuleInit() {
    this.pg = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://blamr:blamr_dev@localhost:5432/blamr',
    });
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    this.driftCache = new RedisDriftCache(this.redis);
    this.clickhouse = createClient({
      url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
      database: process.env.CLICKHOUSE_DATABASE || 'blamr',
    });

    const kafka = new Kafka({
      clientId: 'blamr-blame-processor',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:19092').split(','),
    });

    this.consumer = kafka.consumer({ groupId: 'blame-processor' });
    this.producer = kafka.producer();
    await this.consumer.connect();
    await this.producer.connect();
    await this.consumer.subscribe({ topic: 'blame.needed', fromBeginning: false });

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const event = JSON.parse(message.value.toString()) as RunCompletedEvent;
        try {
          await this.processRun(event);
        } catch (err) {
          this.logger.error(`Blame processing failed for ${event.run_id}: ${err}`);
        }
      },
    });

    this.logger.log('Blame processor started');
    if (isSemanticDriftEnabled()) {
      this.logger.log('Semantic drift re-check enabled before blame');
    }
    if (isMlEnabled()) {
      try {
        const bundle = loadMlBundle();
        this.logger.log(
          `ML drift + ranker enabled (v${bundle.version}, drift acc=${bundle.metrics?.drift_accuracy?.toFixed(2) ?? 'n/a'}, ${isTelemetryFirst() ? 'telemetry-first' : 'mutate-edges'})`,
        );
      } catch (err) {
        this.logger.warn(`ML enabled but bundle missing: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (isLlmBlameReasonEnabled()) {
      this.logger.log(
        `LLM blame reasons enabled (model=${process.env.BLAMR_LLM_REASON_MODEL || 'llama3.2:3b'})`,
      );
    }
  }

  private async fetchEdges(runId: string): Promise<CausalEdge[]> {
    for (let attempt = 0; attempt < 15; attempt++) {
      const result = await this.clickhouse.query({
        query: `SELECT * FROM causal_edges WHERE run_id = {runId:String} ORDER BY hop_index`,
        query_params: { runId },
        format: 'JSONEachRow',
      });
      const edges = await result.json<CausalEdge>();
      if (edges.length > 0) return edges;
      await sleep(500);
    }
    return [];
  }

  private async persistReconciledEdges(edges: CausalEdge[]): Promise<void> {
    if (edges.length === 0) return;
    try {
      for (const e of edges) {
        await this.clickhouse.command({
          query: `ALTER TABLE causal_edges UPDATE confidence_in = {ci:Float64}
                    WHERE run_id = {runId:String} AND hop_index = {hop:Int32} AND from_agent = {from:String}`,
          query_params: {
            ci: e.confidence_in,
            runId: e.run_id,
            hop: e.hop_index,
            from: e.from_agent,
          },
        });
      }
      this.logger.debug(`Persisted reconciled confidence_in for ${edges.length} edges (run ${edges[0].run_id})`);
    } catch (err) {
      this.logger.warn(
        `Could not persist reconciled edges to ClickHouse: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async processRun(event: RunCompletedEvent) {
    let edges = await this.fetchEdges(event.run_id);
    if (edges.length === 0) {
      this.logger.warn(`No edges found for run ${event.run_id}, skipping`);
      return;
    }

    const workflowId = edges[0].workflow_id;
    const workspaceId = event.workspace_id || edges[0].workspace_id;
    const workspaceSettings = await loadWorkspaceSettings(this.pg, workspaceId);
    const intentDriftThreshold = resolveIntentDriftThreshold(workspaceSettings);

    const semanticHints = await enrichEdgesWithSemanticDrift(
      edges,
      this.driftCache,
      {
        debug: (m) => this.logger.debug(m),
        warn: (m) => this.logger.warn(m),
      },
      { intentDriftThreshold },
    );

    const gateConfig = resolveWorkflowGate(workflowId, workspaceSettings, {
      confidence_accept_level: event.confidence_accept_level ?? undefined,
      confidence_gate_mode: event.confidence_gate_mode ?? undefined,
    });

    const mlAnalysis = await analyzeRunWithMl(
      edges,
      this.driftCache,
      {
        debug: (m) => this.logger.debug(m),
        warn: (m) => this.logger.warn(m),
      },
      { profile: gateConfig.profile, semanticHints, intentDriftThreshold },
    );
    if (mlAnalysis) {
      boostInfluenceFromMl(edges, mlAnalysis);
    }

    reconcileEdgeConfidenceChain(edges);
    await this.persistReconciledEdges(edges);

    const sorted = [...edges].sort((a, b) => a.hop_index - b.hop_index);

    let status: 'success' | 'failed' = event.status === 'failed' ? 'failed' : 'success';
    let errorSummary = event.error_summary ?? null;
    let confidence_gate: ConfidenceGateResult | null = event.confidence_gate ?? null;

    const shouldEvaluateGate =
      event.confidence_accept_level != null ||
      gateConfig.source !== 'platform_default';

    if (shouldEvaluateGate) {
      confidence_gate = evaluateConfidenceGate({
        acceptLevel: gateConfig.acceptLevel,
        mode: gateConfig.mode,
        hops: sorted.map((e) => ({
          hop_index: e.hop_index,
          from_agent: e.from_agent,
          confidence_out: e.confidence_out,
        })),
      });
      if (!confidence_gate.passed && status === 'success') {
        status = 'failed';
        errorSummary = errorSummary ?? confidence_gate.reason;
      }
    }

    let { run, report } = computeFromEdges(
      event.run_id,
      workflowId,
      workspaceId,
      status,
      errorSummary,
      edges,
    );
    run = { ...run, confidence_gate };

    const failed = status === 'failed';
    let fusedAgents = report.agents;
    if (failed && mlAnalysis) {
      const fused = fuseBlameScores(report.agents, mlAnalysis, true);
      fusedAgents = fused.agents;
      report = { ...report, agents: fusedAgents, method: fused.method };
    }

    if (failed) {
      report = {
        ...report,
        agents: await enrichBlameReasonsWithLlm({
          runId: event.run_id,
          errorSummary: event.error_summary ?? null,
          edges,
          agents: report.agents,
        }),
      };
    }

    const finalReport = attachHopAnalysisToReport(report, mlAnalysis, report.agents);

    await this.pg.query(
      `INSERT INTO workflow_runs (
        id, workflow_id, workspace_id, status, complexity, started_at, ended_at,
        duration_ms, total_tokens, total_cost_usd, error_summary, accuracy_score,
        agents, layout, title, confidence_gate
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        ended_at = EXCLUDED.ended_at,
        duration_ms = EXCLUDED.duration_ms,
        total_tokens = EXCLUDED.total_tokens,
        total_cost_usd = EXCLUDED.total_cost_usd,
        error_summary = EXCLUDED.error_summary,
        accuracy_score = EXCLUDED.accuracy_score,
        agents = EXCLUDED.agents,
        title = EXCLUDED.title,
        confidence_gate = EXCLUDED.confidence_gate`,
      [
        event.run_id,
        run.workflow_id,
        run.workspace_id,
        run.status,
        run.complexity,
        run.started_at,
        run.ended_at,
        run.duration_ms,
        run.total_tokens,
        run.total_cost_usd,
        run.error_summary,
        run.accuracy_score,
        JSON.stringify(run.agents),
        run.layout,
        run.title,
        run.confidence_gate ? JSON.stringify(run.confidence_gate) : null,
      ],
    );

    await this.pg.query(
      `INSERT INTO blame_reports (
        run_id, root_cause_agent, root_cause_pct, method, computed_at_ms, agents, hop_analysis, ml_fusion
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (run_id) DO UPDATE SET
        root_cause_agent = EXCLUDED.root_cause_agent,
        root_cause_pct = EXCLUDED.root_cause_pct,
        method = EXCLUDED.method,
        computed_at_ms = EXCLUDED.computed_at_ms,
        agents = EXCLUDED.agents,
        hop_analysis = EXCLUDED.hop_analysis,
        ml_fusion = EXCLUDED.ml_fusion`,
      [
        event.run_id,
        finalReport.root_cause_agent,
        finalReport.root_cause_pct,
        finalReport.method,
        report.computed_at_ms,
        JSON.stringify(finalReport.agents),
        JSON.stringify(finalReport.hop_analysis ?? []),
        finalReport.ml_fusion ? JSON.stringify(finalReport.ml_fusion) : null,
      ],
    );

    const completed = {
      run_id: event.run_id,
      workspace_id: workspaceId,
      status: run.status,
      root_cause_agent: finalReport.root_cause_agent,
    };

    await this.producer.send({
      topic: 'blame.completed',
      messages: [{ key: event.run_id, value: JSON.stringify(completed) }],
    });

    await this.redis.publish(
      `blame.completed:${event.run_id}`,
      JSON.stringify({ type: 'blame.completed', ...completed }),
    );

    this.logger.log(
      `Blame computed for run ${event.run_id} (${finalReport.root_cause_agent} ${finalReport.root_cause_pct}%, ${finalReport.method})`,
    );
  }
}
