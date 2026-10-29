import { h, ic, dragSort, clear } from './ui.js';
import { t } from './i18n.js';
import { renderToCanvas } from './pdfview.js';
import { haptic } from './haptics.js';

export function rangesToString(nums) {
  const a = [...new Set(nums)].sort((x, y) => x - y);
  const out = []; let i = 0;
  while (i < a.length) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? `${a[i]}-${a[j]}` : `${a[i]}`); i = j + 1; }
  return out.join(',');
}
export function parseRanges(s, total) {
  const out = new Set();
  for (const part of String(s || '').split(/[,\s;]+/)) {
    if (!part) continue;
    const m = /^(\d*)-(\d*)$/.exec(part);
    if (m) { const a = m[1] ? +m[1] : 1, b = m[2] ? +m[2] : total; for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= total) out.add(i); }
    else if (/^\d+$/.test(part) && +part >= 1 && +part <= total) out.add(+part);
  }
  return out;
}

/**
 * Thumbnail grid of pages.
 * opts: {docs:[pdfDoc], select, reorder, rotate, remove, onChange}
 */
export class PageGrid {
  constructor(opts) {
    Object.assign(this, { select: false, reorder: false, rotate: false, remove: false }, opts);
    this.items = [];
    this.el = h('div.pgrid');
    this.io = new IntersectionObserver((ents) => ents.forEach((e) => {
      if (!e.isIntersecting) return;
      this.io.unobserve(e.target);
      const it = e.target._item;
      if (!it || it.blank) return;
      const c = h('canvas');
      renderToCanvas(this.docs[it.f], it.p, c, { maxW: 130, maxH: 150 }).then(() => { e.target.replaceChildren(c); this.applyRot(e.target, it); }).catch(() => {});
    }), { rootMargin: '400px' });
    if (this.reorder) dragSort(this.el, '.pg[data-k]', (from, to) => this.move(from, to));
  }
  load(fileIdxs = [0]) {
    this.items = [];
    fileIdxs.forEach((f) => { for (let p = 1; p <= this.docs[f].numPages; p++) this.items.push({ k: `${f}:${p}:${Math.random().toString(36).slice(2, 6)}`, f, p, rot: 0, del: false, sel: false }); });
    this.render();
    return this;
  }
  move(from, to) { if (to < 0 || to >= this.items.length) return; haptic('select'); const [m] = this.items.splice(from, 1); this.items.splice(to, 0, m); this.render(); this.changed(); }
  addBlank() { this.items.push({ k: 'b' + Math.random().toString(36).slice(2, 7), blank: true, rot: 0, del: false, sel: false }); this.render(); this.changed(); }
  addDoc(f) { for (let p = 1; p <= this.docs[f].numPages; p++) this.items.push({ k: `${f}:${p}:${Math.random().toString(36).slice(2, 6)}`, f, p, rot: 0, del: false, sel: false }); this.render(); this.changed(); }
  changed() { this.onChange && this.onChange(this); }
  applyRot(host, it) { const c = host.firstChild; if (c && c.style) { const sw = it.rot % 180 !== 0; c.style.transform = `rotate(${it.rot}deg)` + (sw ? ' scale(.72)' : ''); } }
  render() {
    clear(this.el);
    this.items.forEach((it, i) => {
      const thumb = h('div.thumb', it.blank ? h('div', { style: { width: '90px', height: '120px', background: '#fff', border: '1px solid var(--border2)', display: 'grid', placeItems: 'center', color: '#aaa', fontSize: '11px' } }, t('blank', 'ว่าง')) : null);
      thumb._item = it;
      const card = h('div.pg' + (it.sel ? '.sel' : '') + (it.del ? '.del' : ''), { 'data-k': it.k, draggable: this.reorder, onclick: (e) => { if (e.target.closest('.acts')) return; if (this.select) { haptic('tap'); it.sel = !it.sel; card.classList.toggle('sel', it.sel); this.changed(); } } },
        thumb,
        h('div.num', it.blank ? '—' : (it.f > 0 || this.docs.length > 1 ? `${it.f + 1}·${it.p}` : String(it.p))),
        (this.rotate || this.remove || this.reorder) && h('div.acts',
          this.reorder && h('button', { title: t('Move earlier', 'เลื่อนไปก่อนหน้า'), 'aria-label': t('Move earlier', 'เลื่อนไปก่อนหน้า'), disabled: i === 0, onclick: () => this.move(i, i - 1) }, ic('chevL')),
          this.reorder && h('button', { title: t('Move later', 'เลื่อนไปหลัง'), 'aria-label': t('Move later', 'เลื่อนไปหลัง'), disabled: i === this.items.length - 1, onclick: () => this.move(i, i + 1) }, ic('chevR')),
          this.rotate && h('button', { title: t('Rotate left', 'หมุนซ้าย'), 'aria-label': t('Rotate left', 'หมุนซ้าย'), onclick: () => { haptic('select'); it.rot = (it.rot + 270) % 360; this.applyRot(thumb, it); this.changed(); } }, ic('undo')),
          this.rotate && h('button', { title: t('Rotate right', 'หมุนขวา'), 'aria-label': t('Rotate right', 'หมุนขวา'), onclick: () => { haptic('select'); it.rot = (it.rot + 90) % 360; this.applyRot(thumb, it); this.changed(); } }, ic('redo')),
          this.remove && h('button', { title: t('Delete', 'ลบ'), 'aria-label': t('Delete', 'ลบ'), onclick: () => { haptic('warn'); it.del = !it.del; card.classList.toggle('del', it.del); this.changed(); } }, ic('trash'))));
      this.el.append(card);
      if (!it.blank) this.io.observe(thumb);
    });
  }
  get live() { return this.items.filter((i) => !i.del); }
  destroy() { this.io.disconnect(); }
}
