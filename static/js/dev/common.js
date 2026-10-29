import { h, ic, field, copyText, downloadText, debounce, loadScript } from '../ui.js';
import { t, tp } from '../i18n.js';

export { h, ic, field, copyText, downloadText, debounce, loadScript, t, tp };

/** two-pane tool: input textarea -> output textarea. */
export function ioPane({ inputLabel, outputLabel, placeholder, rows = 14, mono = true, readonlyOut = true }) {
  const input = h('textarea', { placeholder: tp(placeholder || ''), spellcheck: 'false', style: mono ? {} : { font: 'inherit', whiteSpace: 'pre-wrap' } });
  const output = h('textarea', { readonly: readonlyOut, spellcheck: 'false', style: mono ? {} : { font: 'inherit', whiteSpace: 'pre-wrap' } });
  input.rows = rows; output.rows = rows;
  const status = h('div.small', '');
  const el = h('div.split2',
    h('div.col', h('div.hd', h('span', tp(inputLabel || ['Input', 'ข้อมูลเข้า'])), h('span.wrapflex', h('button.btn.sm', { onclick: async () => { try { input.value = await navigator.clipboard.readText(); input.dispatchEvent(new Event('input')); } catch { /* ignore */ } } }, t('Paste', 'วาง')), h('button.btn.sm', { onclick: () => { input.value = ''; input.dispatchEvent(new Event('input')); } }, t('Clear', 'ล้าง')))), input),
    h('div.col', h('div.hd', h('span', tp(outputLabel || ['Output', 'ผลลัพธ์'])), h('span.wrapflex', h('button.btn.sm', { onclick: () => copyText(output.value) }, ic('copy'), t('Copy', 'คัดลอก')), h('button.btn.sm', { onclick: () => input.value = output.value || input.value }, '↑'))), output));
  const setStatus = (msg, ok = true) => { status.textContent = msg || ''; status.style.color = ok ? 'var(--ok)' : 'var(--bad)'; };
  return { el, input, output, status, setStatus };
}
export const bar = (...kids) => h('div.toolbar', ...kids);
export const btn = (label, fn, cls = '') => h('button.btn' + (cls ? '.' + cls : ''), { type: 'button', onclick: fn }, tp(label));
export const sel = (opts, val, fn) => { const s = h('select', { style: { width: 'auto' }, onchange: (e) => fn(e.target.value) }, opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h('option', { value: v, selected: String(v) === String(val) }, tp(l)); })); return s; };
export const num = (val, fn, o = {}) => h('input', { type: 'number', value: val, min: o.min, max: o.max, step: o.step || 1, style: { width: o.w || '90px' }, oninput: (e) => fn(+e.target.value) });
export const chk = (label, val, fn) => h('label.check', { style: { alignItems: 'center' } }, h('input', { type: 'checkbox', checked: val, onchange: (e) => fn(e.target.checked) }), h('span', tp(label)));
export const txt = (val, fn, ph = '', w) => h('input', { type: 'text', value: val, placeholder: ph, style: w ? { width: w } : {}, oninput: (e) => fn(e.target.value) });
export const kv = (label, ...c) => h('div.kv', h('label', tp(label)), ...c);
export const outbox = (c = '') => h('pre.out', c);
export const pad2 = (n) => String(n).padStart(2, '0');
export async function readFileText(f) { return await f.text(); }
export function readFileDataURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
export function fileInput(onfile, accept, multiple = false) { return h('input', { type: 'file', accept, multiple, onchange: (e) => { const fs = [...e.target.files]; if (fs.length) onfile(multiple ? fs : fs[0]); } }); }
export const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
