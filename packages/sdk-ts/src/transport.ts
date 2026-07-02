import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface TransportConfig {
  /** When true, POST synchronously (tests). Env: BLAMR_SYNC_INGEST=1 */
  sync?: boolean;
  /** Disable all network and disk I/O. Env: BLAMR_DISABLED=1 */
  disabled?: boolean;
  /** Offline queue directory. Env: BLAMR_QUEUE_DIR */
  queueDir?: string;
  /** Max bytes on disk. Env: BLAMR_MAX_QUEUE_BYTES (default 256MB) */
  maxQueueBytes?: number;
  /** In-memory queue cap before spilling to disk */
  maxMemoryQueue?: number;
}

export interface QueuedRequest {
  method?: 'POST' | 'PUT';
  path: string;
  body: unknown;
}

function envFlag(name: string): boolean {
  const v = process.env[name];
  return v === '1' || v === 'true';
}

function defaultQueueDir(): string {
  return path.join(os.homedir(), '.blamr', 'queue');
}

export function resolveTransportConfig(overrides?: TransportConfig): Required<TransportConfig> {
  return {
    sync: overrides?.sync ?? envFlag('BLAMR_SYNC_INGEST'),
    disabled: overrides?.disabled ?? envFlag('BLAMR_DISABLED'),
    queueDir: overrides?.queueDir ?? process.env.BLAMR_QUEUE_DIR ?? defaultQueueDir(),
    maxQueueBytes:
      overrides?.maxQueueBytes ??
      parseInt(process.env.BLAMR_MAX_QUEUE_BYTES || String(256 * 1024 * 1024), 10),
    maxMemoryQueue: overrides?.maxMemoryQueue ?? 50_000,
  };
}

export class BlamrTransport {
  private readonly cfg: Required<TransportConfig>;
  private readonly memory: QueuedRequest[] = [];
  private flushing = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private diskFlushTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(
    private readonly apiKey: string,
    private readonly endpoint: string,
    config?: TransportConfig,
  ) {
    this.cfg = resolveTransportConfig(config);
    if (!this.cfg.sync && !this.cfg.disabled) {
      this.diskFlushTimer = setInterval(() => void this.flushDiskToNetwork(), 2000);
      if (typeof this.diskFlushTimer.unref === 'function') this.diskFlushTimer.unref();
    }
  }

  /** Enqueue a POST body. Resolves immediately unless sync mode. */
  send(path: string, body: unknown): Promise<void> {
    return this.sendWithMethod('POST', path, body);
  }

  sendWithMethod(method: 'POST' | 'PUT', path: string, body: unknown): Promise<void> {
    if (this.cfg.disabled) return Promise.resolve();
    if (this.cfg.sync) return this.post(method, path, body);

    this.memory.push({ method, path, body });
    if (this.memory.length >= this.cfg.maxMemoryQueue) {
      this.spillToDisk(this.memory.splice(0));
    }
    this.scheduleFlush();
    return Promise.resolve();
  }

  /** Drain memory + disk queues before run completion. */
  async flush(): Promise<void> {
    if (this.cfg.disabled) return;
    await this.flushMemory();
    await this.flushDiskToNetwork();
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.diskFlushTimer) {
      clearInterval(this.diskFlushTimer);
      this.diskFlushTimer = null;
    }
    await this.flush();
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.cfg.sync) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushMemory();
    }, 5);
    if (typeof this.flushTimer.unref === 'function') this.flushTimer.unref();
  }

  private async flushMemory(): Promise<void> {
    if (this.flushing || this.memory.length === 0) return;
    this.flushing = true;
    const batch = this.memory.splice(0);
    try {
      for (const req of batch) {
        try {
          await this.post(req.method ?? 'POST', req.path, req.body);
        } catch {
          this.spillToDisk([req]);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private spillToDisk(batch: QueuedRequest[]): void {
    if (!this.cfg.queueDir || batch.length === 0) return;
    try {
      fs.mkdirSync(this.cfg.queueDir, { recursive: true });
      this.pruneDisk();
      const file = path.join(
        this.cfg.queueDir,
        `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jsonl`,
      );
      const lines = batch.map((r) => JSON.stringify(r)).join('\n') + '\n';
      fs.appendFileSync(file, lines, 'utf8');
    } catch {
      // best-effort offline queue
    }
  }

  private pruneDisk(): void {
    if (!this.cfg.queueDir || !fs.existsSync(this.cfg.queueDir)) return;
    const files = fs
      .readdirSync(this.cfg.queueDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(this.cfg.queueDir, f))
      .sort();
    let total = files.reduce((s, f) => s + (fs.statSync(f).size || 0), 0);
    while (total > this.cfg.maxQueueBytes && files.length > 0) {
      const oldest = files.shift()!;
      try {
        total -= fs.statSync(oldest).size || 0;
        fs.unlinkSync(oldest);
      } catch {
        break;
      }
    }
  }

  private listDiskFiles(): string[] {
    if (!this.cfg.queueDir || !fs.existsSync(this.cfg.queueDir)) return [];
    return fs
      .readdirSync(this.cfg.queueDir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => path.join(this.cfg.queueDir, f))
      .sort();
  }

  private async flushDiskToNetwork(): Promise<void> {
    if (this.cfg.sync || this.cfg.disabled || this.closed) return;
    for (const file of this.listDiskFiles()) {
      let content: string;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const lines = content.split('\n').filter((l) => l.trim());
      let allOk = true;
      for (const line of lines) {
        try {
          const req = JSON.parse(line) as QueuedRequest;
          await this.post(req.method ?? 'POST', req.path, req.body);
        } catch {
          allOk = false;
          break;
        }
      }
      if (allOk) {
        try {
          fs.unlinkSync(file);
        } catch {
          // keep file for retry
        }
      }
    }
  }

  private async post(method: 'POST' | 'PUT', reqPath: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.endpoint}${reqPath}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`blamr ingest failed (${res.status}): ${text}`);
    }
  }
}
