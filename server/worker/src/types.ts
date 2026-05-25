import type { D1Database } from '@cloudflare/workers-types';

export interface Env {
  DB: D1Database;
  GOVERNOR_BOOTSTRAP_TOKEN?: string;
  GOVERNOR_VERSION?: string;
  // Public view: off by default. When "true", the root path renders a
  // branded read-only status page for browsers (API clients still get JSON).
  GOVERNOR_PUBLIC_ENABLED?: string;
  GOVERNOR_BRAND_NAME?: string;
  GOVERNOR_BRAND_ACCENT?: string;        // CSS colour, e.g. "#1f6f5c"
  GOVERNOR_BRAND_LOGO_URL?: string;      // optional; falls back to the tick mark
  GOVERNOR_PUBLIC_TITLE?: string;
  GOVERNOR_PUBLIC_TAGLINE?: string;
  GOVERNOR_PUBLIC_HIDE_ACTOR_NAMES?: string;  // "true" → role only
  GOVERNOR_PUBLIC_HIDE_NOTES?: string;        // "true" → suppress notes
}

export type ActorKind = 'human' | 'agent' | 'service';

export interface AuthedActor {
  id: string;
  kind: ActorKind;
  display_name: string;
  roles: Set<string>;
}
