/**
 * Runtime config + shared types for the Node reference server.
 *
 * This file mirrors governor/server/worker/src/types.ts. The worker reads
 * its config from a Cloudflare `env` object injected per-request; the
 * Node server reads the same names from process.env at boot and freezes
 * them into a Config singleton.
 */
import type { Database } from 'better-sqlite3';

export type ActorKind = 'human' | 'agent' | 'service';

export interface AuthedActor {
  id: string;
  kind: ActorKind;
  display_name: string;
  roles: Set<string>;
}

export interface Config {
  port: number;
  dbPath: string;
  version: string;
  bootstrapToken: string | undefined;

  // Persistence posture. See storage.ts for the full tier explanation.
  // If replicationUrl is set, the operator has committed to off-host
  // replication (Litestream in the official image, or their own
  // equivalent). allowSingleHost / allowEphemeral are explicit opt-ins
  // to weaker tiers; without one of these three signals the server
  // refuses to start.
  replicationUrl: string | undefined;
  allowSingleHost: boolean;
  allowEphemeral: boolean;

  // Public read-only view (off by default; identical semantics to the worker).
  publicEnabled: boolean;
  brandName: string;
  brandAccent: string;
  brandLogoUrl: string | null;
  publicTitle: string;
  publicTagline: string;
  publicHideActorNames: boolean;
  publicHideNotes: boolean;
}

export interface Deps {
  db: Database;
  cfg: Config;
}

export type AppVars = { actor: AuthedActor };

export function readConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    port: Number(env.PORT ?? '8080'),
    dbPath: env.GOVERNOR_DB_PATH ?? '/data/governor.sqlite',
    version: env.GOVERNOR_VERSION ?? 'dev',
    bootstrapToken: env.GOVERNOR_BOOTSTRAP_TOKEN,

    replicationUrl: env.GOVERNOR_REPLICATION_URL || undefined,
    allowSingleHost: env.GOVERNOR_ALLOW_SINGLE_HOST === 'true',
    allowEphemeral: env.GOVERNOR_ALLOW_EPHEMERAL === 'true',

    publicEnabled: env.GOVERNOR_PUBLIC_ENABLED === 'true',
    brandName: env.GOVERNOR_BRAND_NAME ?? 'Governor',
    brandAccent: env.GOVERNOR_BRAND_ACCENT ?? '#1f6f5c',
    brandLogoUrl: env.GOVERNOR_BRAND_LOGO_URL ?? null,
    publicTitle: env.GOVERNOR_PUBLIC_TITLE ?? 'Attestation log',
    publicTagline:
      env.GOVERNOR_PUBLIC_TAGLINE ??
      'Live record of who has signed off on what, and what is still waiting.',
    publicHideActorNames: env.GOVERNOR_PUBLIC_HIDE_ACTOR_NAMES === 'true',
    publicHideNotes: env.GOVERNOR_PUBLIC_HIDE_NOTES === 'true',
  };
}
