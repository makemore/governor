/**
 * HTML rendering for the public view. Pure string templates; no JS shipped
 * to the browser. All user-supplied strings flow through escape().
 */
import {
  escape,
  relativeTime,
  type ActivityRow,
  type AttestationView,
  type PublicConfig,
  type SubjectView,
} from './public.js';
import type { EvidenceItem } from './runs.js';
import { FACE_OK, FACE_PENDING, FACE_CYCLE } from './_gov-faces.js';

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
    subjects.length > 0
      ? `<div class="dl" style="margin-top:28px">Full report: ` +
        `<a href="/report">PDF</a> · <a href="/report.md">Markdown</a>` +
        ` &nbsp;|&nbsp; Pass report: ` +
        `<a href="/report?history=passing">PDF</a> · <a href="/report.md?history=passing">Markdown</a></div>`
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
.brandbar .logo{width:40px;height:40px;border-radius:8px;background:var(--brand);color:#fff;display:grid;place-items:center;font:700 18px/1 ui-sans-serif,sans-serif;overflow:hidden}
.brandbar .logo img,.brandbar .logo svg{width:100%;height:100%;display:block;object-fit:cover}
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
ul.rules li{padding:10px 0;border-top:1px solid var(--rule)}
ul.rules li:first-child{border-top:0}
ul.rules .row{display:flex;gap:12px;align-items:center}
ul.rules .mk{width:22px;height:22px;flex:0 0 auto;border-radius:4px;overflow:hidden}
ul.rules .mk svg{width:100%;height:100%;display:block}
ul.rules .no .mk{opacity:.75}
ul.rules .lab{flex:1;font-weight:600}ul.rules .by{color:var(--muted);font-size:12px;white-space:nowrap}
.atts{margin:8px 0 2px 34px;display:flex;flex-direction:column;gap:10px}
.att{font-size:13px;border-left:2px solid var(--rule);padding-left:12px}
.att-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.att .who{color:var(--muted);font-size:12px}
.opill{display:inline-block;font:600 9px/1 ui-sans-serif,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:999px}
.opill.pass{background:color-mix(in srgb,var(--allow) 16%,transparent);color:var(--allow)}
.opill.fail{background:color-mix(in srgb,var(--deny) 16%,transparent);color:var(--deny)}
.opill.waived{background:color-mix(in srgb,var(--pending) 16%,transparent);color:var(--pending)}
.sev{display:inline-block;font:600 9px/1 ui-sans-serif,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;border-radius:4px;border:1px solid var(--rule);color:var(--muted)}
.att .note{margin:5px 0 0}
.att .detail{margin:5px 0 0;white-space:pre-wrap;background:var(--code-bg);border-radius:6px;padding:8px 10px;font:12px/1.5 ui-monospace,Menlo,monospace}
ul.ev{list-style:none;padding:0;margin:6px 0 0;display:flex;flex-direction:column;gap:3px}
ul.ev li{font:12px ui-monospace,Menlo,monospace;word-break:break-all}
ul.ev a{color:var(--brand)}ul.ev code{background:var(--code-bg);padding:1px 5px;border-radius:3px}
.ev .muted{color:var(--muted)}
.timeline{list-style:none;padding:0;margin:0;font-size:13px}
.timeline li{display:grid;grid-template-columns:84px 14px 1fr;gap:12px;padding:10px 0;border-top:1px solid var(--rule);align-items:baseline}
.timeline li:first-child{border-top:0}
.timeline .t{color:var(--muted);font:12px/1.4 ui-monospace,Menlo,monospace}
.timeline .m{color:var(--brand);font:14px/1 ui-monospace,Menlo,monospace}
.timeline code{font:12px ui-monospace,Menlo,monospace;background:var(--code-bg);padding:1px 5px;border-radius:3px}
.dl{margin:12px 0 2px;font-size:12px;color:var(--muted)}
.dl a{color:var(--brand);text-decoration:none}.dl a:hover{text-decoration:underline}
footer{margin-top:56px;padding-top:20px;border-top:1px solid var(--rule);display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:12px;flex-wrap:wrap}
footer a{color:inherit}
</style>`;
}

function renderHeader(cfg: PublicConfig): string {
  // Custom logos win; otherwise the animated gov face cycles through eight
  // emotions over 12s, giving the page a quiet sign of life.
  const logo = cfg.logoUrl
    ? `<img alt="" src="${escape(cfg.logoUrl)}">`
    : FACE_CYCLE;
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
  const dl = `<div class="dl">Full report: ` +
    `<a href="/r/${escape(s.runId)}/report">PDF</a> · ` +
    `<a href="/r/${escape(s.runId)}/report.md">Markdown</a>` +
    ` &nbsp;|&nbsp; Pass report: ` +
    `<a href="/r/${escape(s.runId)}/report?history=passing">PDF</a> · ` +
    `<a href="/r/${escape(s.runId)}/report.md?history=passing">Markdown</a></div>`;
  return `<div class="card"><div class="head">` +
    `<div class="id">${escape(label)} <span class="pill ${s.decision}">${s.decision}</span></div>` +
    `<div class="when">${escape(relativeTime(s.createdAt, nowMs))}</div></div>` +
    `<ul class="rules">${s.items.map((i) => renderItem(cfg, i, nowMs)).join('')}</ul>${dl}</div>`;
}

function renderItem(cfg: PublicConfig, i: SubjectView['items'][number], nowMs: number): string {
  const ok = i.satisfied ? 'ok' : 'no';
  const face = i.satisfied ? FACE_OK : FACE_PENDING;
  const n = i.attestations.length;
  const summary = n === 0 ? 'awaiting attestation' : `${n} sign-off${n === 1 ? '' : 's'}`;
  const atts = n === 0
    ? ''
    : `<div class="atts">${i.attestations.map((a) => renderAttestation(cfg, a, nowMs)).join('')}</div>`;
  return `<li class="${ok}"><div class="row">` +
    `<span class="mk" aria-label="${i.satisfied ? 'satisfied' : 'pending'}">${face}</span>` +
    `<span class="lab">${escape(i.key)}</span><span class="by">${summary}</span></div>${atts}</li>`;
}

function renderAttestation(cfg: PublicConfig, a: AttestationView, nowMs: number): string {
  const oc = (a.outcome || 'pass').toLowerCase();
  const ocClass = oc === 'fail' ? 'fail' : oc === 'waived' ? 'waived' : 'pass';
  const who = actorBlurb(cfg, a.actorKind, a.displayName, a.attestedAt, nowMs);
  const sev = a.severity ? `<span class="sev">${escape(a.severity)}</span>` : '';
  const note = !cfg.hideNotes && a.note ? `<div class="note">${escape(a.note)}</div>` : '';
  const detail = !cfg.hideNotes && a.detail ? `<div class="detail">${escape(a.detail)}</div>` : '';
  return `<div class="att"><div class="att-head">` +
    `<span class="opill ${ocClass}">${escape(oc)}</span><span class="who">${who}</span>${sev}</div>` +
    `${note}${detail}${renderEvidence(a.evidence)}</div>`;
}

function renderEvidence(ev: EvidenceItem[] | null): string {
  if (!ev || ev.length === 0) return '';
  const items = ev.map((e) => {
    if (e.kind === 'url' && e.url && /^https?:\/\//i.test(e.url)) {
      return `<li>🔗 <a href="${escape(e.url)}" rel="noopener noreferrer nofollow">${escape(e.url)}</a></li>`;
    }
    if (e.kind === 'hash' && e.content_hash) {
      const mt = e.media_type ? ` <span class="muted">(${escape(e.media_type)})</span>` : '';
      return `<li># <code>${escape(e.content_hash)}</code>${mt}</li>`;
    }
    const mt = e.media_type ? escape(e.media_type) : 'inline';
    const meta = e.inline_metadata ? ` <code>${escape(JSON.stringify(e.inline_metadata))}</code>` : '';
    const url = e.url ? ` <code>${escape(e.url)}</code>` : '';
    return `<li class="ev">▣ ${mt}${url}${meta}</li>`;
  }).join('');
  return `<ul class="ev">${items}</ul>`;
}

function actorBlurb(cfg: PublicConfig, kind: string, name: string, ts: string, nowMs: number): string {
  const who = cfg.hideActorNames ? `a ${escape(kind)}` : `${escape(name)} (${escape(kind)})`;
  return `${who} · ${escape(relativeTime(ts, nowMs))}`;
}

function renderActivity(cfg: PublicConfig, a: ActivityRow, nowMs: number): string {
  const subject = escape(a.subject_label ?? a.subject_id);
  const who = cfg.hideActorNames ? `a ${escape(a.actor_kind)}` : `${escape(a.actor_display_name)} (${escape(a.actor_kind)})`;
  const oc = (a.outcome || 'pass').toLowerCase();
  const ocClass = oc === 'fail' ? 'fail' : oc === 'waived' ? 'waived' : 'pass';
  const pill = `<span class="opill ${ocClass}">${escape(oc)}</span> `;
  const note = !cfg.hideNotes && a.note ? ` — <i>${escape(a.note)}</i>` : '';
  return `<li><span class="t">${escape(relativeTime(a.attested_at, nowMs))}</span>` +
    `<span class="m">●</span><span class="d">${pill}<b>${subject}</b> ${who} attested <code>${escape(a.item_key)}</code>${note}</span></li>`;
}

function renderFooter(cfg: PublicConfig): string {
  return `<footer><span>Public read-only view · ${escape(cfg.brandName)}</span>` +
    `<span>Powered by <a href="https://github.com/makemore/governor">Governor</a></span></footer>`;
}
