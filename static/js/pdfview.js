import { h, askPassword, clamp } from './ui.js';
import { t } from './i18n.js';

let pdfjs;
export async function lib() {
  if (!pdfjs) {
    pdfjs = await import('/vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
  }
  return pdfjs;
}

/** Open a File/Blob/ArrayBuffer; returns {doc, numPages, password} or throws {name:'PasswordException'} */
export async function openPdf(src, password) {
  const L = await lib();
  const data = src instanceof ArrayBuffer ? new Uint8Array(src.slice(0)) : new Uint8Array(await src.arrayBuffer());
  const task = L.getDocument({ data, password, cMapUrl: '/vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/vendor/pdfjs/standard_fonts/', isEvalSupported: false, enableXfa: false });
  const doc = await task.promise;
  return { doc, numPages: doc.numPages, password };
}

/** Like openPdf but asks the user for a password when needed. Returns null if cancelled. */
export async function openPdfInteractive(file, name) {
  let pw;
  for (let attempt = 0; ; attempt++) {
    try { return await openPdf(file, pw); }
    catch (e) {
      if (e && e.name === 'PasswordException') {
        pw = await askPassword(name || file.name || '', attempt > 0);
        if (pw == null) return null;
      } else throw e;
    }
  }
}

export async function renderToCanvas(doc, pageNo, canvas, { maxW, maxH, scale, rotation = 0, dpr } = {}) {
  const page = await doc.getPage(pageNo);
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
  let s = scale || 1;
  if (!scale) s = Math.min(maxW ? maxW / base.width : Infinity, maxH ? maxH / base.height : Infinity);
  const ratio = dpr || Math.min(2, window.devicePixelRatio || 1);
  const vp = page.getViewport({ scale: s * ratio, rotation: (page.rotate + rotation) % 360 });
  canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
  canvas.style.width = Math.ceil(vp.width / ratio) + 'px'; canvas.style.height = Math.ceil(vp.height / ratio) + 'px';
  const task = page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport: vp });
  await task.promise;
  return { w: base.width, h: base.height, scale: s };
}

/** Lazy thumbnail renderer: call observe(canvasHost, pageNo) */
export function thumbRenderer(doc, { maxW = 140, maxH = 170 } = {}) {
  const io = new IntersectionObserver((ents) => {
    for (const e of ents) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const { page, rot } = e.target._thumb;
      const c = h('canvas');
      renderToCanvas(doc, page, c, { maxW, maxH, rotation: 0 }).then(() => { e.target.replaceChildren(c); }).catch(() => {});
    }
  }, { rootMargin: '300px' });
  return { observe(host, page) { host._thumb = { page }; io.observe(host); }, stop() { io.disconnect(); } };
}

export async function pageSize(doc, n = 1) {
  const p = await doc.getPage(n); const v = p.getViewport({ scale: 1 });
  return { w: v.width, h: v.height };
}

/**
 * Vertical lazy page viewer. Each page gets a `.vpage` with canvas + overlay.
 * onPage({no, el, ov, wpt, hpt}) is called once per page; setZoom() relayouts and calls onZoom().
 */
export class PageScroller {
  constructor(host, doc, { onPage, onZoom, zoom = 1, fit = true } = {}) {
    this.host = host; this.doc = doc; this.onPage = onPage; this.onZoom = onZoom; this.zoom = zoom; this.fit = fit;
    this.pages = []; this.S = 1;
    this.io = new IntersectionObserver((ents) => ents.forEach((e) => this._vis(e)), { root: host, rootMargin: '700px 0px' });
    this.ready = this._build();
  }
  async _build() {
    const first = await this.doc.getPage(1);
    const v1 = first.getViewport({ scale: 1 });
    const avail = Math.max(280, this.host.clientWidth - 36);
    this.base = this.fit ? Math.min(1.8, avail / v1.width) : 1;
    this.S = this.base * this.zoom;
    for (let n = 1; n <= this.doc.numPages; n++) {
      const pg = await this.doc.getPage(n);
      const v = pg.getViewport({ scale: 1 });
      const rec = { no: n, wpt: v.width, hpt: v.height, rendered: false };
      rec.canvas = h('canvas');
      rec.ov = h('div.ov');
      rec.el = h('div.vpage', { 'data-page': n }, rec.canvas, rec.ov, h('div.pn', String(n)));
      this._size(rec);
      this.host.append(rec.el);
      this.pages.push(rec);
      this.io.observe(rec.el);
      rec.el._rec = rec;
      this.onPage && this.onPage(rec, this);
    }
  }
  _size(rec) {
    rec.el.style.width = Math.round(rec.wpt * this.S) + 'px';
    rec.el.style.height = Math.round(rec.hpt * this.S) + 'px';
  }
  async _vis(e) {
    const rec = e.target._rec;
    if (!rec) return;
    if (e.isIntersecting && !rec.rendered && !rec.busy) {
      rec.busy = true;
      try {
        await renderToCanvas(this.doc, rec.no, rec.canvas, { scale: this.S });
        rec.rendered = true;
      } catch { /* ignore */ }
      rec.busy = false;
    }
  }
  async setZoom(z) {
    this.zoom = clamp(z, 0.4, 3);
    this.S = this.base * this.zoom;
    for (const rec of this.pages) {
      rec.rendered = false; rec.canvas.width = 1; rec.canvas.height = 1;
      this._size(rec);
      this.io.unobserve(rec.el); this.io.observe(rec.el);
    }
    this.onZoom && this.onZoom(this);
  }
  px2pt(v) { return v / this.S; }
  pt2px(v) { return v * this.S; }
  destroy() { this.io.disconnect(); this.host.replaceChildren(); }
}

/** pointer position inside an element in CSS px */
export function localPoint(ev, el) {
  const r = el.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}
export function describePdfError(e) {
  if (e && e.name === 'InvalidPDFException') return t('This file is not a valid PDF.', 'ไฟล์นี้ไม่ใช่ PDF ที่ถูกต้อง');
  return t('Could not read this PDF.', 'ไม่สามารถอ่านไฟล์ PDF นี้ได้');
}

/** Touch devices: choose whether a finger drag on the page scrolls or draws. Returns the toggle node. */
export function drawScrollToggle(viewer, { initial = 'draw', onChange } = {}) {
  const set = (m) => { viewer.dataset.pan = m === 'scroll' ? 'scroll' : 'draw'; [...box.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', b.dataset.m === m)); onChange && onChange(m); };
  const box = h('div.seg.drawmode', { role: 'group' },
    h('button', { type: 'button', 'data-m': 'scroll', onclick: () => set('scroll') }, t('Scroll', 'เลื่อนหน้า')),
    h('button', { type: 'button', 'data-m': 'draw', onclick: () => set('draw') }, t('Draw', 'วาด')));
  set(initial);
  box.set = set;
  return box;
}
