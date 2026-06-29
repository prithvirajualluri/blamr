import Redis from 'ioredis';
import type { LiveEvent } from '@blamr/types';
import { liveEventChannel } from '@blamr/types';

let client: Redis | null = null;

function redis(): Redis {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { lazyConnect: true });
  }
  return client;
}

/** Best-effort workspace live feed publish (Redis pub/sub). */
export async function publishLiveEvent(event: LiveEvent): Promise<void> {
  try {
    await redis().publish(liveEventChannel(event.workspace_id), JSON.stringify(event));
  } catch {
    // non-blocking telemetry fan-out
  }
}
