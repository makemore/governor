/**
 * HTML rendering for the public view. Pure string templates; no JS shipped
 * to the browser. All user-supplied strings flow through escape().
 */
import {
  escape,
  relativeTime,
  type ActivityRow,
  type PublicConfig,
  type SubjectView,
} from './public.js';

export function renderPublicPage(
  cfg: PublicConfig,
  subjects: SubjectView[],
  activity: ActivityRow[],
  nowMs: number,
): string {
  const allDeny = subjects.filter((s) => s.decision === 'deny').length;
  const banner = subjects.length === 0
    ? { cls: 'warn', heading: 'No subjects yet.', sub: 'Open a run via the API to see it here.' }
    : allDeny === 0
      ? { cls: '', heading: 'All tracked subjects currently allow.', sub: `${subjects.length} subjects tracked` }
      : { cls: 'warn', heading: `${allDeny} subject${allDeny === 1 ? '' : 's'} pending sign-off.`, sub: `${subjects.length - allDeny} of ${subjects.length} allow` };

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<title>${escape(cfg.brandName)} · ${escape(cfg.title)}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
    `<meta name="description" content="${escape(cfg.tagline)}">`,
    renderStyle(cfg.accent),
    '</head><body><main>',
    renderHeader(cfg),
    renderBanner(banner),
    subjects.length > 0
      ? `<h3>Tracked subjects</h3>${subjects.map((s) => renderSubject(cfg, s, nowMs)).join('')}`
      : '',
    activity.length > 0
      ? `<h3 style="margin-top:36px">Recent activity</h3><ul class="timeline">${activity.map((a) => renderActivity(cfg, a, nowMs)).join('')}</ul>`
      : '',
    renderFooter(cfg),
    '</main></body></html>',
  ].join('');
}

function renderStyle(accent: string): string {
  return `<style>
:root{--brand:${escape(accent)};--brand-soft:color-mix(in srgb,var(--brand) 10%,transparent);
--fg:#1c1410;--bg:#fffbf6;--muted:#7a6a5e;--rule:#efe3d4;--code-bg:#f6ede1;
--allow:#1f6f5c;--deny:#b04a2a;--pending:#b08a2a}
@media(prefers-color-scheme:dark){:root{--fg:#f1e6d8;--bg:#1a1410;--muted:#a89786;
--rule:#3a2f25;--code-bg:#2a1f15;--allow:#4fb89c;--deny:#d97a55;--pending:#d4b35a}}
*{box-sizing:border-box}html,body{margin:0}
body{font:15px/1.55 ui-sans-serif,-apple-system,system-ui,sans-serif;color:var(--fg);background:var(--bg);-webkit-font-smoothing:antialiased}
main{max-width:760px;margin:0 auto;padding:56px 24px 80px}
.brandbar{display:flex;align-items:center;gap:14px;margin:0 0 36px;padding-bottom:20px;border-bottom:1px solid var(--rule)}
.brandbar .logo{width:36px;height:36px;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center;font:700 18px/1 ui-sans-serif,sans-serif;overflow:hidden}
.brandbar .logo img,.brandbar .logo svg{width:100%;height:100%;object-fit:cover}
.brandbar h1{font:600 18px/1.2 ui-sans-serif,sans-serif;margin:0}
.brandbar .sub{color:var(--muted);font-size:13px;margin:2px 0 0}
.banner{background:var(--brand-soft);border:1px solid var(--rule);border-radius:10px;padding:20px 22px;margin:0 0 36px;display:flex;align-items:center;gap:14px}
.banner .dot{width:10px;height:10px;border-radius:50%;background:var(--allow);flex:0 0 auto;box-shadow:0 0 0 4px color-mix(in srgb,var(--allow) 18%,transparent)}
.banner.warn .dot{background:var(--pending);box-shadow:0 0 0 4px color-mix(in srgb,var(--pending) 18%,transparent)}
.banner h2{font:600 16px/1.3 ui-sans-serif,sans-serif;margin:0 0 2px}
.banner p{font-size:13px;color:var(--muted);margin:0}
h3{font:600 11px/1 ui-sans-serif,sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin:0 0 14px}
.card{border:1px solid var(--rule);border-radius:10px;padding:18px 22px;margin:0 0 12px;background:var(--bg)}
.card .head{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:14px}
.card .head .id{font:600 15px/1.2 ui-sans-serif,sans-serif}
.card .head .when{color:var(--muted);font-size:12px;white-space:nowrap}
.pill{display:inline-block;font:600 10px/1 ui-sans-serif,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;margin-left:8px;vertical-align:1px}
.pill.allow{background:color-mix(in srgb,var(--allow) 14%,transparent);color:var(--allow)}
.pill.deny{background:color-mix(in srgb,var(--deny) 14%,transparent);color:var(--deny)}
ul.rules{list-style:none;padding:0;margin:0;font-size:13px}
ul.rules li{display:flex;gap:10px;padding:6px 0;align-items:baseline}
ul.rules .mk{font:14px/1 ui-monospace,Menlo,monospace;width:14px;flex:0 0 auto}
ul.rules .ok .mk{color:var(--allow)}ul.rules .no .mk{color:var(--muted)}
ul.rules .lab{flex:1}ul.rules .by{color:var(--muted);font-size:12px}
.timeline{list-style:none;padding:0;margin:0;font-size:13px}
.timeline li{display:grid;grid-template-columns:84px 14px 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--rule);align-items:baseline}
.timeline li:first-child{border-top:0}
.timeline .t{color:var(--muted);font:12px/1.4 ui-monospace,Menlo,monospace}
.timeline .m{color:var(--brand);font:14px/1 ui-monospace,Menlo,monospace}
.timeline code{font:12px ui-monospace,Menlo,monospace;background:var(--code-bg);padding:1px 5px;border-radius:3px}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--rule);display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:12px;flex-wrap:wrap}
footer a{color:inherit}
</style>`;
}

function renderHeader(cfg: PublicConfig): string {
  const logo = cfg.logoUrl
    ? `<img alt="" src="${escape(cfg.logoUrl)}">`
    : escape(cfg.brandName.slice(0, 1).toUpperCase());
  return `<div class="brandbar"><div class="logo">${logo}</div><div>` +
    `<h1>${escape(cfg.brandName)} · ${escape(cfg.title)}</h1>` +
    `<p class="sub">${escape(cfg.tagline)}</p></div></div>`;
}

function renderBanner(b: { cls: string; heading: string; sub: string }): string {
  return `<div class="banner ${b.cls}"><span class="dot"></span><div>` +
    `<h2>${escape(b.heading)}</h2><p>${escape(b.sub)}</p></div></div>`;
}

function renderSubject(cfg: PublicConfig, s: SubjectView, nowMs: number): string {
  const label = s.subjectLabel ?? s.subjectId;
  return `<div class="card"><div class="head">` +
    `<div class="id">${escape(label)} <span class="pill ${s.decision}">${s.decision}</span></div>` +
    `<div class="when">${escape(relativeTime(s.createdAt, nowMs))}</div></div>` +
    `<ul class="rules">${s.items.map((i) => {
      const ok = i.satisfied ? 'ok' : 'no';
      const mk = i.satisfied ? '✓' : '◯';
      const by = i.attestations.length === 0
        ? 'awaiting attestation'
        : i.attestations.map((a) => actorBlurb(cfg, a.actorKind, a.displayName, a.attestedAt, nowMs)).join(', ');
      return `<li class="${ok}"><span class="mk">${mk}</span>` +
        `<span class="lab">${escape(i.key)}</span><span class="by">${by}</span></li>`;
    }).join('')}</ul></div>`;
}

function actorBlurb(cfg: PublicConfig, kind: string, name: string, ts: string, nowMs: number): string {
  const who = cfg.hideActorNames ? `a ${escape(kind)}` : `${escape(name)} (${escape(kind)})`;
  return `${who} · ${escape(relativeTime(ts, nowMs))}`;
}

function renderActivity(cfg: PublicConfig, a: ActivityRow, nowMs: number): string {
  const subject = escape(a.subject_label ?? a.subject_id);
  const who = cfg.hideActorNames ? `a ${escape(a.actor_kind)}` : `${escape(a.actor_display_name)} (${escape(a.actor_kind)})`;
  const note = !cfg.hideNotes && a.note ? ` — <i>${escape(a.note)}</i>` : '';
  return `<li><span class="t">${escape(relativeTime(a.attested_at, nowMs))}</span>` +
    `<span class="m">●</span><span class="d"><b>${subject}</b> ${who} attested <code>${escape(a.item_key)}</code>${note}</span></li>`;
}

function renderFooter(cfg: PublicConfig): string {
  return `<footer><span>Public read-only view · ${escape(cfg.brandName)}</span>` +
    `<span>Powered by <a href="https://github.com/makemore/governor">Governor</a></span></footer>`;
}
