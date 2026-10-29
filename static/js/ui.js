import { icon } from './icons.js';
import { t, tp } from './i18n.js';
import { haptic } from './haptics.js';

/** hyperscript: h('div.class#id', {attrs}, ...children) */
export function h(tag, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(tag) || [];
  const el = document.createElement(m[1] || 'div');
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; });
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs) || attrs.nodeType)) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
    else if (k === 'class') v.split(' ').forEach((c) => c && el.classList.add(c));
    else if (k === 'value') el.value = v;
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'hidden') el[k] = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
export const ic = icon;

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / 1048576).toFixed(n < 10485760 ? 2 : 1) + ' MB';
}
export const uid = () => Math.random().toString(36).slice(2, 9);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function toast(msg, ms = 2600) {
  const root = $('#toast-root');
  const el = h('div.toast', msg);
  root.append(el);
  setTimeout(() => el.remove(), ms);
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); haptic('success'); toast(t('Copied', 'คัดลอกแล้ว')); }
  catch {
    const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); haptic('success'); toast(t('Copied', 'คัดลอกแล้ว')); } catch { toast(t('Copy failed', 'คัดลอกไม่สำเร็จ')); }
    ta.remove();
  }
}

export function downloadBlob(blob, name) {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
export const downloadText = (text, name, mime = 'text/plain') => downloadBlob(new Blob([text], { type: mime + ';charset=utf-8' }), name);

/** modal({title, body, buttons:[{label,primary,value}]}) -> Promise<value> */
export function modal({ title, body, buttons, ref }) {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const close = (v) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const bg = h('div.modal-bg', { onmousedown: (e) => { if (e.target === bg) close(null); } },
      h('div.modal', { role: 'dialog', 'aria-modal': 'true' },
        title && h('h3', title), h('div.mb', body),
        h('div.mf', (buttons || [{ label: 'OK', primary: true, value: true }]).map((b) =>
          h('button.btn' + (b.primary ? '.primary' : ''), { onclick: () => close(typeof b.value === 'function' ? b.value() : b.value) }, b.label)))));
    document.addEventListener('keydown', onKey);
    if (ref) ref.close = close;
    root.append(bg);
    const first = bg.querySelector('input,textarea,select,button.primary');
    first && first.focus();
  });
}

export async function askPassword(name, wrong = false) {
  const inp = h('input', { type: 'password', autocomplete: 'off', placeholder: t('Password', 'รหัสผ่าน') });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.closest('.modal').querySelector('button.primary').click(); });
  const r = await modal({
    title: t('Password required', 'ต้องใช้รหัสผ่าน'),
    body: h('div.field', h('p.muted', { style: { margin: 0 } }, name), wrong && h('div.alert.err', t('Wrong password, try again.', 'รหัสผ่านไม่ถูกต้อง ลองอีกครั้ง')), inp),
    buttons: [{ label: t('Cancel', 'ยกเลิก'), value: null }, { label: t('Unlock', 'ปลดล็อก'), primary: true, value: () => inp.value }],
  });
  return r;
}

// ---- form field builders ---------------------------------------------------
/** field({label, help}, control) */
export function field(label, control, help) {
  return h('div.field', label && h('label.lbl', tp(label)), control, help && h('div.help', tp(help)));
}
export function select(options, value, onchange) {
  const s = h('select', { onchange: (e) => onchange && onchange(e.target.value) },
    options.map((o) => { const [v, lab] = Array.isArray(o) ? o : [o.v ?? o, o.l ?? o]; return h('option', { value: v, selected: String(v) === String(value) }, tp(lab)); }));
  return s;
}
export function checkbox(label, checked, onchange, help) {
  const i = h('input', { type: 'checkbox', checked, onchange: (e) => onchange && onchange(e.target.checked) });
  return h('label.check', i, h('span', tp(label), help && h('div.help', tp(help))));
}
export function segmented(options, value, onchange) {
  const wrap = h('div.seg');
  const set = (v) => { [...wrap.children].forEach((b) => b.classList.toggle('on', b.dataset.v === String(v))); };
  options.forEach(([v, lab]) => wrap.append(h('button', { type: 'button', 'data-v': v, onclick: () => { set(v); onchange(v); } }, tp(lab))));
  set(value);
  return wrap;
}
export function optCards(options, value, onchange) {
  const wrap = h('div.opt-cards');
  const set = (v) => [...wrap.children].forEach((b) => b.classList.toggle('on', b.dataset.v === String(v)));
  options.forEach(([v, lab, desc]) => wrap.append(h('div.opt-card', { 'data-v': v, tabindex: 0, role: 'radio', onclick: () => { set(v); onchange(v); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); set(v); onchange(v); } } }, h('b', tp(lab)), desc && h('span', tp(desc)))));
  set(value);
  return wrap;
}
export function posGrid(value, onchange) {
  const cells = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const wrap = h('div.pos-grid');
  const set = (v) => [...wrap.children].forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  const POS_TH = { 'top-left': 'บนซ้าย', 'top-center': 'บนกลาง', 'top-right': 'บนขวา', 'middle-left': 'กลางซ้าย', 'middle-center': 'กลาง', 'middle-right': 'กลางขวา', 'bottom-left': 'ล่างซ้าย', 'bottom-center': 'ล่างกลาง', 'bottom-right': 'ล่างขวา' };
  cells.forEach((c) => wrap.append(h('button', { type: 'button', 'data-v': c, title: t(c.replace('-', ' '), POS_TH[c]), 'aria-label': t(c.replace('-', ' '), POS_TH[c]), onclick: () => { set(c); onchange(c); } })));
  set(value);
  return wrap;
}

/** Declarative option schema renderer. fields: [{key,type,label,options,def,min,max,step,help,show(opts)}] */
export function renderSchema(fields, opts, onchange) {
  const root = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
  const nodes = [];
  const refresh = () => nodes.forEach(([f, n]) => { n.classList.toggle('hidden', f.show ? !f.show(opts) : false); });
  const changed = () => { refresh(); onchange && onchange(opts); };
  for (const f of fields) {
    if (opts[f.key] === undefined && f.def !== undefined) opts[f.key] = f.def;
    let ctl;
    switch (f.type) {
      case 'select': ctl = field(f.label, select(f.options, opts[f.key], (v) => { opts[f.key] = v; changed(); }), f.help); break;
      case 'seg': ctl = field(f.label, segmented(f.options, opts[f.key], (v) => { opts[f.key] = v; changed(); }), f.help); break;
      case 'cards': ctl = field(f.label, optCards(f.options, opts[f.key], (v) => { opts[f.key] = v; changed(); }), f.help); break;
      case 'check': ctl = checkbox(f.label, !!opts[f.key], (v) => { opts[f.key] = v; changed(); }, f.help); break;
      case 'number': ctl = field(f.label, h('input', { type: 'number', min: f.min, max: f.max, step: f.step || 1, value: opts[f.key], oninput: (e) => { opts[f.key] = e.target.value === '' ? '' : Number(e.target.value); changed(); } }), f.help); break;
      case 'range': {
        const val = h('span.muted.small', String(opts[f.key]));
        ctl = field(f.label, h('div.row', h('input', { type: 'range', min: f.min, max: f.max, step: f.step || 1, value: opts[f.key], oninput: (e) => { opts[f.key] = Number(e.target.value); val.textContent = e.target.value + (f.unit || ''); changed(); } }), h('span.fix', { style: { minWidth: '44px', textAlign: 'right' } }, val)), f.help);
        val.textContent = opts[f.key] + (f.unit || '');
        break;
      }
      case 'color': ctl = field(f.label, h('input', { type: 'color', value: opts[f.key], oninput: (e) => { opts[f.key] = e.target.value; changed(); } }), f.help); break;
      case 'textarea': ctl = field(f.label, h('textarea', { placeholder: tp(f.placeholder || ''), rows: f.rows || 4, oninput: (e) => { opts[f.key] = e.target.value; changed(); } }, opts[f.key] || ''), f.help); break;
      case 'pos': ctl = field(f.label, posGrid(opts[f.key], (v) => { opts[f.key] = v; changed(); }), f.help); break;
      default: ctl = field(f.label, h('input', { type: f.type === 'password' ? 'password' : 'text', autocomplete: 'off', placeholder: tp(f.placeholder || ''), value: opts[f.key] ?? '', oninput: (e) => { opts[f.key] = e.target.value; changed(); } }), f.help);
    }
    nodes.push([f, ctl]);
    root.append(ctl);
  }
  refresh();
  return root;
}

export function debounce(fn, ms = 200) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
export function loadScript(src) {
  loadScript.cache ??= {};
  return (loadScript.cache[src] ??= new Promise((res, rej) => {
    const s = h('script', { src, onload: () => res(), onerror: () => rej(new Error('load ' + src)) });
    document.head.append(s);
  }));
}
export function dragSort(container, itemSel, onReorder) {
  let dragEl = null;
  container.addEventListener('dragstart', (e) => { const it = e.target.closest(itemSel); if (!it) return; dragEl = it; it.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'x'); });
  container.addEventListener('dragend', () => { dragEl && dragEl.classList.remove('dragging'); [...container.querySelectorAll('.dropbefore')].forEach((x) => x.classList.remove('dropbefore')); dragEl = null; });
  container.addEventListener('dragover', (e) => {
    if (!dragEl) return; e.preventDefault();
    const over = e.target.closest(itemSel);
    [...container.querySelectorAll('.dropbefore')].forEach((x) => x.classList.remove('dropbefore'));
    if (over && over !== dragEl) over.classList.add('dropbefore');
  });
  container.addEventListener('drop', (e) => {
    if (!dragEl) return; e.preventDefault();
    const over = e.target.closest(itemSel);
    const items = [...container.querySelectorAll(itemSel)];
    const from = items.indexOf(dragEl);
    let to = over ? items.indexOf(over) : items.length;
    if (from < 0) return;
    if (from < to) to -= 1;
    onReorder(from, Math.max(0, to));
  });
}
