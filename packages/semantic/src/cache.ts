export interface DriftCache {
  getRunSystemPrompt(runId: string): Promise<string | null>;
  getRunGoalSnapshot(runId: string): Promise<string | null>;
  setRunSystemPrompt(runId: string, systemPrompt: string, ttlSec?: number): Promise<void>;
  setRunGoalSnapshot(runId: string, goalSnapshot: string, ttlSec?: number): Promise<void>;
  getEmbedding(hash: string): Promise<number[] | null>;
  setEmbedding(hash: string, vector: number[], ttlSec?: number): Promise<void>;
}
