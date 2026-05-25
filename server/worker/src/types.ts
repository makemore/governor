import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  GOVERNOR_BOOTSTRAP_TOKEN?: string;
  GOVERNOR_VERSION?: string;
}

export type ActorKind = 'human' | 'agent' | 'service';

export interface AuthedActor {
  id: string;
  kind: ActorKind;
  display_name: string;
  roles: Set<string>;
}
