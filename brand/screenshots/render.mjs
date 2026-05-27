// Renders a representative Governor public status page to HTML, in both
// light and dark variants. Used to regenerate the README screenshots.
//
//   node brand/screenshots/render.mjs
//
// Then capture with headless Chrome:
//
//   for v in light dark; do
//     "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
//       --headless=new --disable-gpu --hide-scrollbars \
//       --window-size=1100,1500 --force-device-scale-factor=2 \
//       --screenshot=brand/screenshots/public-${v}.png \
//       file://$(pwd)/brand/screenshots/${v}.html
//   done
//
// Keep CSS in sync with server/{node,worker}/src/public-render.ts. The
// markup here is a snapshot for the README; the live page is canonical.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ACCENT = '#1f6f5c';

// Generated face icons used by the live page. Regenerate via
// `node brand/build-face-cycle.mjs` after changing the emotion set.
const FACES = JSON.parse(readFileSync(join(here, '..', '..', 'server', 'worker', 'src', '_gov-faces.ts'), 'utf8')
  .replace(/^[\s\S]*?export const FACE_OK = (".*?");[\s\S]*?export const FACE_PENDING = (".*?");[\s\S]*?export const FACE_CYCLE = (".*?");[\s\S]*$/,
    (_, a, b, c) => `{"ok":${a},"pending":${b},"cycle":${c}}`));

const STYLE_VARS_LIGHT =
  `--fg:#1c1410;--bg:#fffbf6;--muted:#7a6a5e;--rule:#efe3d4;--code-bg:#f6ede1;` +
  `--allow:#1f6f5c;--deny:#b04a2a;--pending:#b08a2a`;
const STYLE_VARS_DARK =
  `--fg:#f1e6d8;--bg:#1a1410;--muted:#a89786;--rule:#3a2f25;--code-bg:#2a1f15;` +
  `--allow:#4fb89c;--deny:#d97a55;--pending:#d4b35a`;

function style(vars) {
  return `<style>
:root{--brand:${ACCENT};--brand-soft:color-mix(in srgb,var(--brand) 10%,transparent);${vars}}
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
ul.rules li{display:flex;gap:12px;padding:8px 0;align-items:center}
ul.rules .mk{width:22px;height:22px;flex:0 0 auto;border-radius:4px;overflow:hidden}
ul.rules .mk svg{width:100%;height:100%;display:block}
ul.rules .no .mk{opacity:.75}
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

const HEADER = `<div class="brandbar"><div class="logo">${FACES.cycle}</div><div>
  <h1>Acme Robotics · Release sign-off</h1>
  <p class="sub">Who approved which release, and when.</p>
</div></div>`;

const BANNER = `<div class="banner warn"><span class="dot"></span><div>
  <h2>1 subject pending sign-off.</h2><p>2 of 3 allow</p>
</div></div>`;

function item(ok, key, by) {
  const cls = ok ? 'ok' : 'no'; const face = ok ? FACES.ok : FACES.pending;
  return `<li class="${cls}"><span class="mk">${face}</span><span class="lab">${key}</span><span class="by">${by}</span></li>`;
}

const SUBJECTS = `<h3>Tracked subjects</h3>
<div class="card"><div class="head"><div class="id">myapp v1.4.0 <span class="pill deny">deny</span></div><div class="when">8m ago</div></div>
<ul class="rules">
${item(true,  'tests-green',     'github-actions (service) · 6m ago')}
${item(true,  'code-review',     'Bob Chen (human) · 4m ago')}
${item(false, 'security-review', 'awaiting attestation')}
${item(false, 'two-managers',    '0 of 2 attestations')}
</ul></div>
<div class="card"><div class="head"><div class="id">myapp v1.3.2 <span class="pill allow">allow</span></div><div class="when">3d ago</div></div>
<ul class="rules">
${item(true, 'tests-green',     'github-actions (service) · 3d ago')}
${item(true, 'code-review',     'Dana Park (human) · 3d ago')}
${item(true, 'security-review', 'Carol Singh (human) · 3d ago')}
${item(true, 'two-managers',    'Priya Rao + Tom Webb · 3d ago')}
</ul></div>
<div class="card"><div class="head"><div class="id">infra/terraform-apply <span class="pill allow">allow</span></div><div class="when">1h ago</div></div>
<ul class="rules">
${item(true, 'plan-clean',      'github-actions (service) · 1h ago')}
${item(true, 'sre-on-call',     'Maya Iyer (human) · 58m ago')}
</ul></div>`;

const ACTIVITY = `<h3 style="margin-top:36px">Recent activity</h3>
<ul class="timeline">
<li><span class="t">4m ago</span><span class="m">●</span><span class="d"><b>myapp v1.4.0</b> Bob Chen (human) attested <code>code-review</code> — <i>diff LGTM, no schema changes</i></span></li>
<li><span class="t">6m ago</span><span class="m">●</span><span class="d"><b>myapp v1.4.0</b> github-actions (service) attested <code>tests-green</code> — <i>build #482, 1284 tests</i></span></li>
<li><span class="t">58m ago</span><span class="m">●</span><span class="d"><b>infra/terraform-apply</b> Maya Iyer (human) attested <code>sre-on-call</code></span></li>
<li><span class="t">1h ago</span><span class="m">●</span><span class="d"><b>infra/terraform-apply</b> github-actions (service) attested <code>plan-clean</code></span></li>
<li><span class="t">3d ago</span><span class="m">●</span><span class="d"><b>myapp v1.3.2</b> Tom Webb (human) attested <code>two-managers</code></span></li>
</ul>`;

const FOOTER = `<footer><span>Public read-only view · Acme Robotics</span><span>Powered by <a href="https://github.com/makemore/governor">Governor</a></span></footer>`;

function page(vars) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>Acme Robotics · Release sign-off</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
${style(vars)}
</head><body><main>${HEADER}${BANNER}${SUBJECTS}${ACTIVITY}${FOOTER}</main></body></html>`;
}

writeFileSync(join(here, 'light.html'), page(STYLE_VARS_LIGHT));
writeFileSync(join(here, 'dark.html'), page(STYLE_VARS_DARK));
console.log('wrote light.html, dark.html in', here);
