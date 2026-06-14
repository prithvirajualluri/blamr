export interface DriftCache {
  getRunGoal(runId: string): Promise<string | null>;
  setRunGoal(runId: string, goal: string, ttlSec?: number): Promise<void>;
  getEmbedding(hash: string): Promise<number[] | null>;
  setEmbedding(hash: string, vector: number[], ttlSec?: number): Promise<void>;
}
