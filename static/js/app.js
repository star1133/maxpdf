import { h, ic, $, clear, toast, modal, debounce } from './ui.js';
import { t, tp, getLang, setLang } from './i18n.js';
import { PDF_CATS, PDF_TOOLS, DEV_CATS, DEV_TOOLS, byId } from './registry.js';
import { ToolPage } from './toolkit.js';
import { initPWA, paintInstall } from './pwa.js';
import { initHaptics, haptic, hapticsSupported, hapticsEnabled, setHaptics } from './haptics.js';

const app = $('#app');
const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);

// ---- theme ---------------------------------------------------------------------
try { const th = localStorage.getItem('maxpdf.theme'); if (th) document.documentElement.dataset.theme = th; } catch { /* ignore */ }
function paintChrome() {
  const th = $('#btn-theme'); clear(th); th.append(ic(isDark() ? 'sun' : 'moon'));
  const s = $('#btn-search'); clear(s); s.append(ic('search')); s.title = s.ariaLabel = t('Search tools ( / )', 'ค้นหาเครื่องมือ ( / )');
  th.title = th.ariaLabel = t('Switch light / dark theme', 'สลับธีมสว่าง / มืด');
  $('#mainnav').setAttribute('aria-label', t('Main navigation', 'เมนูหลัก'));
  $('#btn-lang').textContent = getLang() === 'th' ? 'EN' : 'ไทย';
  paintHaptics();
  $('#btn-lang').title = getLang() === 'th' ? 'เปลี่ยนเป็นภาษาอังกฤษ (English)' : 'Switch to Thai (ไทย)';
  const path = location.pathname;
  const nav = $('#mainnav'); clear(nav);
  [['/', t('All tools', 'ทั้งหมด'), (p) => p === '/'], ['/pdf', t('PDF Tools', 'เครื่องมือ PDF'), (p) => p.startsWith('/pdf')], ['/workflows', t('Workflows', 'เวิร์กโฟลว์'), (p) => p.startsWith('/workflows')], ['/dev', t('Dev Tools', 'เครื่องมือ Dev'), (p) => p.startsWith('/dev')]].forEach(([href, label, on]) => nav.append(h('a', { href, 'data-link': '', class: on(path) ? 'on' : '' }, label)));
  $('#foot').replaceChildren(h('div', '© MaxPDF · ', t('Free PDF & developer tools', 'เครื่องมือ PDF และเครื่องมือนักพัฒนา ฟรี')), h('div.wrapflex', { style: { alignItems: 'center' } }, h('button.btn.sm#btn-install', { type: 'button' }), h('span', t('Dev tools run in your browser. PDFs are deleted automatically.', 'เครื่องมือ Dev ทำงานในเบราว์เซอร์ ไฟล์ PDF ถูกลบอัตโนมัติ'))));
  paintInstall();
}
function paintHaptics() {
  const b = $('#btn-haptics'); if (!b) return;
  b.classList.toggle('hidden', !hapticsSupported()); clear(b); b.append(ic('vibrate'));
  b.setAttribute('aria-pressed', String(hapticsEnabled()));
  b.title = b.ariaLabel = hapticsEnabled() ? t('Haptics on', 'การสั่นเปิดอยู่') : t('Haptics off', 'การสั่นปิดอยู่');
}
$('#btn-haptics').addEventListener('click', () => { setHaptics(!hapticsEnabled()); paintHaptics(); toast(hapticsEnabled() ? t('Haptic feedback on', 'เปิดการสั่นตอบสนอง') : t('Haptic feedback off', 'ปิดการสั่นตอบสนอง')); });
$('#btn-theme').addEventListener('click', () => { const next = isDark() ? 'light' : 'dark'; document.documentElement.dataset.theme = next; try { localStorage.setItem('maxpdf.theme', next); } catch { /* ignore */ } paintChrome(); });
$('#btn-lang').addEventListener('click', () => { setLang(getLang() === 'th' ? 'en' : 'th'); route(); });
$('#btn-search').addEventListener('click', openPalette);
document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); openPalette(); } });

// ---- router --------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault(); go(a.getAttribute('href'));
});
window.addEventListener('popstate', () => route());
export function go(path) { if (path !== location.pathname) history.pushState({}, '', path); route(); window.scrollTo(0, 0); }

let routeToken = 0;
async function route() {
  const token = ++routeToken; const path = location.pathname.replace(/\/+$/, '') || '/';
  paintChrome(); clear(app); app.style.removeProperty('--c');
  let m;
  try {
    if (path === '/') return home('all');
    if (path === '/pdf') return home('pdf');
    if (path === '/dev') return home('dev');
    if (path === '/workflows') { const { mountWorkflows } = await import('./workflow.js'); document.title = t('Workflows', 'เวิร์กโฟลว์') + ' — MaxPDF'; if (token === routeToken) await mountWorkflows(app); return; }
    if ((m = /^\/pdf\/([\w-]+)$/.exec(path))) return await pdfTool(m[1], token);
    if ((m = /^\/dev\/([\w-]+)$/.exec(path))) return await devTool(m[1], token);
    return notFound();
  } catch (e) {
    console.error(e);
    if (token === routeToken) app.append(h('div.alert.err', ic('warn'), t('Something went wrong loading this page.', 'โหลดหน้านี้ไม่สำเร็จ'), ' ', h('a', { href: '/', 'data-link': '' }, t('Home', 'หน้าแรก'))));
  }
}
function notFound() { document.title = '404 — MaxPDF'; app.append(h('div.empty', h('h2', '404'), h('p', t('Page not found.', 'ไม่พบหน้านี้')), h('a.btn.primary', { href: '/', 'data-link': '' }, t('Go home', 'กลับหน้าแรก')))); }

// ---- home ----------------------------------------------------------------------
const CAT_VAR = { organize: 'organize', optimize: 'optimize', to: 'convert', from: 'convert', edit: 'edit', security: 'security', intel: 'intel' };
function toolRow(d, kind) {
  return h('a.tool', { href: `/${kind}/${d.id}`, 'data-link': '', style: { '--c': kind === 'dev' ? 'var(--c-dev)' : `var(--c-${CAT_VAR[d.cat]})` } },
    ic(d.icon), h('b', tp(d.name), d.isNew && h('span.new', t('NEW', 'ใหม่'))), h('span.d', tp(d.desc)));
}
function home(view) {
  document.title = 'MaxPDF — ' + t('PDF & Dev Tools', 'เครื่องมือ PDF และ Dev');
  let q = ''; let tab = view === 'dev' ? 'dev' : view === 'pdf' ? 'pdf' : 'all';
  const tabs = [['all', t('All', 'ทั้งหมด')], ['pdf', 'PDF'], ...PDF_CATS.map(([id, n]) => [id, tp(n)]), ['dev', t('Dev tools', 'เครื่องมือ Dev')]];
  const tabsEl = h('div.tabs', { role: 'tablist' }); const body = h('div');
  const search = h('input', { type: 'search', placeholder: t('Search tools', 'ค้นหาเครื่องมือ'), 'aria-label': t('Search tools', 'ค้นหาเครื่องมือ'), enterkeyhint: 'search', oninput: debounce((e) => { q = e.target.value.trim().toLowerCase(); draw(); }, 120) });
  const match = (d) => !q || (tp(d.name) + ' ' + tp(d.desc) + ' ' + d.name[0] + ' ' + d.id).toLowerCase().includes(q);
  function draw() {
    clear(tabsEl); tabs.forEach(([id, label]) => tabsEl.append(h('button.tab' + (tab === id ? '.on' : ''), { role: 'tab', 'aria-selected': String(tab === id), onclick: () => { tab = id; draw(); } }, label)));
    clear(body); let any = false;
    const sec = (title, tools, kind) => { const l = tools.filter(match); if (!l.length) return; any = true; body.append(h('h2.sec-title', title, h('small', String(l.length))), h('div.grid', l.map((d) => toolRow(d, kind)))); };
    if (tab !== 'dev') PDF_CATS.filter(([id]) => tab === 'all' || tab === 'pdf' || tab === id).forEach(([id, n]) => sec(tp(n), PDF_TOOLS.filter((x) => x.cat === id), 'pdf'));
    if (tab === 'all' || tab === 'dev') DEV_CATS.forEach(([id, n]) => sec(t('Dev · ', 'Dev · ') + tp(n), DEV_TOOLS.filter((x) => x.cat === id), 'dev'));
    if ((tab === 'all' || tab === 'pdf') && !q) body.append(h('h2.sec-title', t('Automate', 'ทำอัตโนมัติ')), h('a.promo', { href: '/workflows', 'data-link': '' }, h('div', h('b', t('Workflows', 'เวิร์กโฟลว์')), h('span', t('Chain tools, save the recipe, run it on any files.', 'ต่อเครื่องมือเป็นสายงาน บันทึกสูตร แล้วรันกับไฟล์ใดก็ได้'))), ic('workflow')));
    if (!any) body.append(h('div.empty', t('No tools match your search.', 'ไม่พบเครื่องมือที่ค้นหา')));
  }
  app.append(h('div.home-top', h('div', h('h1', t('PDF and developer tools', 'เครื่องมือ PDF และเครื่องมือนักพัฒนา')), h('p', t('Free, no sign-up. Dev tools run in your browser; PDFs are processed on the server and deleted automatically.', 'ใช้ฟรี ไม่ต้องสมัคร เครื่องมือ Dev ทำงานในเบราว์เซอร์ ส่วน PDF ประมวลผลบนเซิร์ฟเวอร์และลบอัตโนมัติ'))),
    h('label.searchbar', ic('search'), search, h('kbd', '/'))), tabsEl, body);
  draw();
}

// ---- tool pages ----------------------------------------------------------------
const IMPL_MODULES = ['./tools/organize.js', './tools/misc.js', './tools/editor.js', './tools/redact.js', './tools/forms.js'];
let impls;
async function loadImpls() { if (!impls) { impls = {}; for (const m of await Promise.all(IMPL_MODULES.map((x) => import(x)))) Object.entries(m).forEach(([k, v]) => { if (v && typeof v === 'object' && !Array.isArray(v) && !(k in impls)) impls[k] = v; }); } return impls; }
async function pdfTool(id, token) {
  const def = byId(id, PDF_TOOLS); if (!def) return notFound();
  document.title = tp(def.name) + ' — MaxPDF';
  const all = await loadImpls(); const impl = all[id]; if (!impl) return notFound();
  if (token !== routeToken) return;
  const page = new ToolPage(app, def, impl);
  await page.start();
}

const DEV_MAP = {
  json: ['format', 'json'], 'json-ts': ['format', 'jsonTs'], yaml: ['format', 'yaml'], csv: ['format', 'csv'], beautify: ['format', 'beautify'], sql: ['format', 'sql'], xml: ['format', 'xml'], markdown: ['format', 'markdown'],
  base64: ['encode', 'base64'], url: ['encode', 'url'], 'html-ent': ['encode', 'htmlEnt'], jwt: ['encode', 'jwt'], hash: ['encode', 'hash'], unicode: ['encode', 'unicode'], numbase: ['encode', 'numbase'],
  uuid: ['gen', 'uuid'], password: ['gen', 'password'], lorem: ['gen', 'lorem'], qr: ['gen', 'qr'], random: ['gen', 'random'],
  diff: ['text', 'diff'], case: ['text', 'caseConv'], counter: ['text', 'counter'], lines: ['text', 'lines'], slug: ['text', 'slug'], regex: ['text', 'regex'], baht: ['text', 'baht'],
  color: ['web', 'color'], contrast: ['web', 'contrast'], gradient: ['web', 'gradient'], shadow: ['web', 'shadow'], http: ['web', 'http'], useragent: ['web', 'useragent'],
  timestamp: ['sys', 'timestamp'], cron: ['sys', 'cron'], chmod: ['sys', 'chmod'], cidr: ['sys', 'cidr'],
  'img-compress': ['img', 'imgCompress'], 'img-base64': ['img', 'imgBase64'], favicon: ['img', 'favicon'],
};
async function devTool(id, token) {
  const def = byId(id, DEV_TOOLS); const spec = DEV_MAP[id]; if (!def || !spec) return notFound();
  document.title = tp(def.name) + ' — MaxPDF';
  app.style.setProperty('--c', 'var(--c-dev)');
  const mod = await import(`./dev/${spec[0]}.js`); if (token !== routeToken) return;
  const root = h('div.dev-wrap');
  app.append(h('div.crumbs', h('a', { href: '/dev', 'data-link': '' }, t('Dev tools', 'เครื่องมือ Dev')), ic('chevR'), h('span', tp(def.name))),
    h('div.tool-head', h('h1', tp(def.name)), h('p', tp(def.desc)), h('div.privacy-note', ic('shield'), t('Runs entirely in your browser — nothing is uploaded.', 'ทำงานในเบราว์เซอร์ทั้งหมด ไม่มีการอัปโหลดข้อมูล'))), root);
  await mod[spec[1]](root);
}

// ---- command palette -----------------------------------------------------------
function openPalette() {
  const all = [...PDF_TOOLS.map((d) => ({ d, kind: 'pdf' })), ...DEV_TOOLS.map((d) => ({ d, kind: 'dev' })), { d: { id: 'workflows', icon: 'workflow', name: ['Workflows', 'เวิร์กโฟลว์'], desc: ['', ''] }, kind: '' }];
  const list = h('div', { style: { maxHeight: '50vh', overflow: 'auto', marginTop: '10px' } }); let sel = 0; let cur = [];
  const input = h('input', { type: 'search', placeholder: t('Search all tools…', 'ค้นหาเครื่องมือทั้งหมด…'), autocomplete: 'off' });
  const ref = {};
  const href = (x) => (x.kind ? `/${x.kind}/${x.d.id}` : '/workflows');
  const draw = () => {
    const q = input.value.trim().toLowerCase(); cur = all.filter((x) => !q || (tp(x.d.name) + ' ' + x.d.name[0] + ' ' + x.d.id).toLowerCase().includes(q)).slice(0, 30); sel = Math.min(sel, Math.max(0, cur.length - 1));
    clear(list); cur.forEach((x, i) => list.append(h('a.row', { href: href(x), 'data-link': '', style: { justifyContent: 'flex-start', padding: '8px 10px', borderRadius: '8px', color: 'var(--text)', background: i === sel ? 'var(--primary-soft)' : '' }, onclick: () => ref.close && ref.close(null) }, ic(x.d.icon), h('span', tp(x.d.name)), h('span.fix.small.muted', x.kind === 'dev' ? 'dev' : x.kind === 'pdf' ? 'pdf' : ''))));
    if (!cur.length) list.append(h('div.empty', t('Nothing found', 'ไม่พบ')));
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { sel = Math.min(cur.length - 1, sel + 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); } else if (e.key === 'Enter' && cur[sel]) { ref.close(null); go(href(cur[sel])); } });
  draw();
  modal({ body: h('div', input, list), buttons: [{ label: t('Close', 'ปิด'), value: null }], ref });
}

route();
initPWA();
initHaptics();
