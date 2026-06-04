/**
 * Downloadable report rendering for the public view. Two formats, both pure
 * string templates with no runtime deps so they work identically on Node and
 * the Worker: Markdown (a diff-able audit artefact) and a print-friendly HTML
 * page the browser can turn into a PDF via "Print → Save as PDF".
 */
import {
  escape,
  relativeTime,
  type AttestationView,
  type PublicConfig,
  type SubjectView,
} from './public.js';
import type { EvidenceItem } from './runs.js';

const OUTCOME_LABEL: Record<string, string> = { pass: 'PASS', fail: 'FAIL', waived: 'WAIVED' };

function outcomeLabel(o: string): string {
  return OUTCOME_LABEL[(o || 'pass').toLowerCase()] ?? (o || 'pass').toUpperCase();
}

function fileSafe(s: string): string {
  return s.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'report';
}

// 'full' renders the whole append-only chain (every attestation, including
// superseded fails); 'passing' keeps only the pass/waived attestations — a
// clean "what was signed off" record with notes + evidence, no history.
export type ReportHistory = 'full' | 'passing';

export interface ReportOptions {
  history: ReportHistory;
  // Base path of the report (no query) so the HTML page can render a toggle.
  togglePath?: string;
}

export function parseHistory(v: string | null | undefined): ReportHistory {
  return v === 'passing' ? 'passing' : 'full';
}

function historyLabel(h: ReportHistory): string {
  return h === 'passing' ? 'passing & waived attestations only' : 'full attestation chain';
}

function visibleAtts(atts: AttestationView[], history: ReportHistory): AttestationView[] {
  if (history === 'full') return atts;
  return atts.filter((a) => {
    const o = (a.outcome || 'pass').toLowerCase();
    return o === 'pass' || o === 'waived';
  });
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

// ---------------------------------------------------------------- Markdown ---

function mdInline(s: string): string {
  // Neutralise characters that would otherwise be read as Markdown control.
  return s.replace(/([\\`*_{}\[\]()#+\-!|])/g, '\\$1').replace(/\r?\n/g, ' ');
}

function mdEvidence(ev: EvidenceItem[] | null): string[] {
  if (!ev || ev.length === 0) return [];
  const out = ['  - Evidence:'];
  for (const e of ev) {
    if (e.kind === 'url' && e.url) {
      out.push(`    - URL: ${e.url}`);
    } else if (e.kind === 'hash' && e.content_hash) {
      const mt = e.media_type ? ` (${e.media_type})` : '';
      out.push(`    - Hash: \`${e.content_hash}\`${mt}`);
    } else {
      const mt = e.media_type ?? 'inline';
      const meta = e.inline_metadata ? ` ${JSON.stringify(e.inline_metadata)}` : '';
      const url = e.url ? ` ${e.url}` : '';
      out.push(`    - Inline: ${mt}${url}${meta}`.trimEnd());
    }
  }
  return out;
}

function mdAttestation(
  a: AttestationView,
  nowMs: number,
  prevId: string | null,
  showChain: boolean,
): string[] {
  const sev = a.severity ? ` · severity: ${a.severity}` : '';
  const when = `${a.attestedAt} (${relativeTime(a.attestedAt, nowMs)})`;
  const chain = showChain && prevId ? ` · supersedes \`${prevId}\`` : '';
  const out = [
    `- **${outcomeLabel(a.outcome)}** \`${a.id}\` — ${a.displayName} (${a.actorKind}) · ${when}${sev}${chain}`,
  ];
  if (a.note) out.push(`  - Note: ${a.note.replace(/\r?\n/g, ' ')}`);
  if (a.detail) {
    out.push('  - Detail:', '    ~~~', ...a.detail.split(/\r?\n/).map((l) => `    ${l}`), '    ~~~');
  }
  out.push(...mdEvidence(a.evidence));
  return out;
}

function mdSubject(s: SubjectView, nowMs: number, history: ReportHistory): string[] {
  const label = s.subjectLabel ?? s.subjectId;
  const out = [
    `## ${mdInline(label)}`,
    '',
    `- **Decision:** ${s.decision.toUpperCase()} (${s.satisfiedItems}/${s.totalItems} items satisfied)`,
    `- **Subject ID:** \`${s.subjectId}\``,
  ];
  if (s.checklistTitle) out.push(`- **Checklist:** ${mdInline(s.checklistTitle)}`);
  out.push(`- **Run ID:** \`${s.runId}\``, `- **Opened:** ${s.createdAt}`, '', '### Items', '');
  for (const i of s.items) {
    const atts = visibleAtts(i.attestations, history);
    const mark = i.satisfied ? '✓' : '✗';
    const state = i.satisfied ? 'satisfied' : 'pending';
    out.push(`#### ${mark} ${mdInline(i.key)} — ${state}`);
    if (i.description) out.push('', mdInline(i.description));
    out.push('');
    if (atts.length === 0) {
      out.push(history === 'passing' ? '_No passing attestations._' : '_No attestations yet._', '');
    } else {
      let prev: string | null = null;
      for (const a of atts) {
        out.push(...mdAttestation(a, nowMs, prev, history === 'full'));
        prev = a.id;
      }
      out.push('');
    }
  }
  return out;
}

export function renderSubjectMarkdown(
  cfg: PublicConfig,
  s: SubjectView,
  nowMs: number,
  opts: ReportOptions,
): string {
  const head = [
    `# ${cfg.brandName} — ${cfg.title}`,
    '',
    `_Generated ${new Date(nowMs).toISOString()} · ${historyLabel(opts.history)}_`,
    '',
    '---',
    '',
  ];
  return [...head, ...mdSubject(s, nowMs, opts.history)].join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function renderLogMarkdown(
  cfg: PublicConfig,
  subjects: SubjectView[],
  nowMs: number,
  opts: ReportOptions,
): string {
  const denied = subjects.filter((s) => s.decision === 'deny').length;
  const head = [
    `# ${cfg.brandName} — ${cfg.title} (full log)`,
    '',
    `_Generated ${new Date(nowMs).toISOString()} · ${historyLabel(opts.history)}_`,
    '',
    `**${subjects.length}** subject${subjects.length === 1 ? '' : 's'} tracked · ` +
      `**${subjects.length - denied}** allow · **${denied}** pending sign-off`,
    '',
    '---',
    '',
  ];
  const body: string[] = [];
  for (const s of subjects) body.push(...mdSubject(s, nowMs, opts.history), '---', '');
  return [...head, ...body].join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
}

export function reportFileName(s: SubjectView, ext: string, history: ReportHistory = 'full'): string {
  const suffix = history === 'passing' ? '-passing' : '';
  return `governor-${fileSafe(s.subjectLabel ?? s.subjectId)}-report${suffix}.${ext}`;
}

// ------------------------------------------------ Print-friendly HTML (PDF) ---

function htmlEvidence(ev: EvidenceItem[] | null): string {
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
    return `<li>▣ ${mt}${url}${meta}</li>`;
  }).join('');
  return `<ul class="ev">${items}</ul>`;
}

function htmlAttestation(
  cfg: PublicConfig,
  a: AttestationView,
  nowMs: number,
  prevId: string | null,
  showChain: boolean,
): string {
  const oc = (a.outcome || 'pass').toLowerCase();
  const ocClass = oc === 'fail' ? 'fail' : oc === 'waived' ? 'waived' : 'pass';
  const who = cfg.hideActorNames ? `a ${escape(a.actorKind)}` : `${escape(a.displayName)} (${escape(a.actorKind)})`;
  const when = `${escape(a.attestedAt)} · ${escape(relativeTime(a.attestedAt, nowMs))}`;
  const sev = a.severity ? `<span class="sev">${escape(a.severity)}</span>` : '';
  const aid = `<code class="aid" title="attestation id">${escape(a.id)}</code>`;
  const chain = showChain && prevId
    ? `<span class="chain">supersedes <a href="#att-${escape(prevId)}">${escape(shortId(prevId))}</a></span>`
    : '';
  const note = !cfg.hideNotes && a.note ? `<div class="note">${escape(a.note)}</div>` : '';
  const detail = !cfg.hideNotes && a.detail ? `<div class="detail">${escape(a.detail)}</div>` : '';
  return `<div class="att" id="att-${escape(a.id)}"><div class="att-head"><span class="opill ${ocClass}">${escape(oc)}</span>` +
    `${aid}<span class="who">${who} · ${when}</span>${sev}${chain}</div>${note}${detail}${htmlEvidence(a.evidence)}</div>`;
}

function htmlSubject(cfg: PublicConfig, s: SubjectView, nowMs: number, history: ReportHistory): string {
  const label = escape(s.subjectLabel ?? s.subjectId);
  const meta = [
    `Subject ID: <code>${escape(s.subjectId)}</code>`,
    s.checklistTitle ? `Checklist: ${escape(s.checklistTitle)}` : '',
    `Run ID: <code>${escape(s.runId)}</code>`,
    `Opened: ${escape(s.createdAt)}`,
  ].filter(Boolean).join(' &middot; ');
  const items = s.items.map((i) => {
    const list = visibleAtts(i.attestations, history);
    const state = i.satisfied ? 'satisfied' : 'pending';
    const desc = i.description ? `<p class="desc">${escape(i.description)}</p>` : '';
    const atts = list.length === 0
      ? `<p class="none">${history === 'passing' ? 'No passing attestations.' : 'No attestations yet.'}</p>`
      : `<div class="atts">${list
          .map((a, idx) => htmlAttestation(cfg, a, nowMs, idx > 0 ? list[idx - 1]!.id : null, history === 'full'))
          .join('')}</div>`;
    return `<section class="item ${i.satisfied ? 'ok' : 'no'}"><h3>${i.satisfied ? '✓' : '✗'} ` +
      `<span>${escape(i.key)}</span> <em class="${state}">${state}</em></h3>${desc}${atts}</section>`;
  }).join('');
  return `<article class="subject"><header><h2>${label} ` +
    `<span class="pill ${s.decision}">${s.decision}</span></h2>` +
    `<p class="summary">${s.satisfiedItems}/${s.totalItems} items satisfied</p>` +
    `<p class="meta">${meta}</p></header>${items}</article>`;
}

function reportStyle(accent: string): string {
  return `<style>
:root{--brand:${escape(accent)};--fg:#1c1410;--bg:#fff;--muted:#6b5d52;--rule:#e6dccd;--code-bg:#f5efe5;--allow:#1f6f5c;--deny:#b04a2a;--pending:#b08a2a}
*{box-sizing:border-box}html,body{margin:0}
body{font:14px/1.5 ui-sans-serif,-apple-system,system-ui,sans-serif;color:var(--fg);background:#f3eee5}
main{max-width:820px;margin:0 auto;padding:40px 28px 80px;background:var(--bg)}
.bar{display:flex;justify-content:space-between;align-items:center;gap:16px;margin:0 0 24px;padding-bottom:16px;border-bottom:2px solid var(--rule)}
.bar h1{font:600 20px/1.2 ui-sans-serif,sans-serif;margin:0}.bar .gen{color:var(--muted);font-size:12px}
button.print{font:600 13px ui-sans-serif,sans-serif;padding:8px 14px;border:1px solid var(--brand);background:var(--brand);color:#fff;border-radius:8px;cursor:pointer}
.subject{margin:0 0 32px;padding:0 0 8px;border-bottom:1px solid var(--rule);page-break-inside:avoid}
.subject h2{font:600 18px/1.3 ui-sans-serif,sans-serif;margin:0 0 4px}
.pill{display:inline-block;font:600 10px/1 ui-sans-serif,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:4px 8px;border-radius:999px;vertical-align:2px}
.pill.allow{background:color-mix(in srgb,var(--allow) 16%,transparent);color:var(--allow)}
.pill.deny{background:color-mix(in srgb,var(--deny) 16%,transparent);color:var(--deny)}
.summary{color:var(--muted);margin:0 0 4px}.meta{color:var(--muted);font-size:12px;margin:0 0 16px}
.item{margin:0 0 16px;page-break-inside:avoid}.item h3{font:600 14px/1.3 ui-sans-serif,sans-serif;margin:0 0 4px}
.item h3 em{font-style:normal;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.item h3 em.satisfied{color:var(--allow)}.desc{margin:0 0 8px;color:var(--muted)}.none{color:var(--muted);font-style:italic;margin:0}
.atts{display:flex;flex-direction:column;gap:10px;margin-left:18px}
.att{border-left:2px solid var(--rule);padding-left:12px}
.att-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.who{color:var(--muted);font-size:12px}
.opill{display:inline-block;font:600 9px/1 ui-sans-serif,sans-serif;letter-spacing:.08em;text-transform:uppercase;padding:3px 7px;border-radius:999px}
.opill.pass{background:color-mix(in srgb,var(--allow) 16%,transparent);color:var(--allow)}
.opill.fail{background:color-mix(in srgb,var(--deny) 16%,transparent);color:var(--deny)}
.opill.waived{background:color-mix(in srgb,var(--pending) 16%,transparent);color:var(--pending)}
.sev{font:600 9px/1 ui-sans-serif,sans-serif;letter-spacing:.06em;text-transform:uppercase;padding:3px 7px;border-radius:4px;border:1px solid var(--rule);color:var(--muted)}
.aid{font:11px ui-monospace,Menlo,monospace;background:var(--code-bg);color:var(--muted);padding:1px 5px;border-radius:3px}
.chain{font-size:11px;color:var(--muted)}.chain a{color:var(--brand);text-decoration:none}
.modes{margin:0 0 20px;font-size:13px;color:var(--muted)}
.modes a{color:var(--brand);text-decoration:none;padding:2px 8px;border-radius:6px}
.modes a.on{background:color-mix(in srgb,var(--brand) 14%,transparent);font-weight:600}
.note{margin:5px 0 0}.detail{margin:5px 0 0;white-space:pre-wrap;background:var(--code-bg);border-radius:6px;padding:8px 10px;font:12px/1.5 ui-monospace,Menlo,monospace}
code{font:12px ui-monospace,Menlo,monospace;background:var(--code-bg);padding:1px 5px;border-radius:3px}
ul.ev{list-style:none;padding:0;margin:6px 0 0;font:12px ui-monospace,Menlo,monospace}ul.ev li{word-break:break-all;margin:2px 0}
ul.ev a{color:var(--brand)}.muted{color:var(--muted)}
@media print{body{background:#fff}main{max-width:none;padding:0}.no-print{display:none!important}a{color:inherit;text-decoration:none}}
</style>`;
}

export function renderReportPage(
  cfg: PublicConfig,
  heading: string,
  subjects: SubjectView[],
  nowMs: number,
  opts: ReportOptions,
): string {
  const body = subjects.length === 0
    ? '<p class="none">No subjects to report.</p>'
    : subjects.map((s) => htmlSubject(cfg, s, nowMs, opts.history)).join('');
  let toggle = '';
  if (opts.togglePath) {
    const base = escape(opts.togglePath);
    const full = opts.history === 'full' ? ' class="on"' : '';
    const passing = opts.history === 'passing' ? ' class="on"' : '';
    toggle = `<div class="modes no-print">History: ` +
      `<a${full} href="${base}">full chain</a> · ` +
      `<a${passing} href="${base}?history=passing">passing only</a></div>`;
  }
  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8">',
    `<title>${escape(cfg.brandName)} — ${escape(heading)}</title>`,
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
    reportStyle(cfg.accent),
    '</head><body><main>',
    `<div class="bar"><div><h1>${escape(cfg.brandName)} — ${escape(heading)}</h1>`,
    `<div class="gen">Generated ${escape(new Date(nowMs).toISOString())} · ${escape(historyLabel(opts.history))}</div></div>`,
    '<button class="print no-print" onclick="window.print()">Print / Save as PDF</button></div>',
    toggle,
    body,
    '</main></body></html>',
  ].join('');
}
