// Edit PDF + Sign PDF: click-and-draw annotation editor on top of pdf.js pages.
import { h, ic, field, modal, uid, clamp, toast } from '../ui.js';
import { t } from '../i18n.js';
import { PageScroller } from '../pdfview.js';
import { haptic } from '../haptics.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const FONTS = { sans: '"IBM Plex Sans Thai",sans-serif', serif: 'Georgia,"Noto Serif Thai",serif', mono: 'ui-monospace,Menlo,monospace' };

class Editor {
  constructor(page, mode) {
    this.p = page; this.mode = mode; this.items = []; this.sel = null; this.tool = 'select';
    this.props = { color: mode === 'sign' ? '#1a2a6c' : '#d32f2f', width: 3, size: 16, font: 'sans', opacity: 1, fill: '' , bold: false, italic: false, align: 'left'};
    this.undo = []; this.redo = []; this.images = new Map(); // id -> Blob
    this.recs = new Map();
  }
  snap() { this.undo.push(JSON.stringify(this.items)); if (this.undo.length > 60) this.undo.shift(); this.redo = []; }
  restore(json) { this.items = JSON.parse(json); this.sel = null; this.renderAll(); }
  doUndo() { if (!this.undo.length) return; haptic('select'); this.redo.push(JSON.stringify(this.items)); this.restore(this.undo.pop()); }
  doRedo() { if (!this.redo.length) return; haptic('select'); this.undo.push(JSON.stringify(this.items)); this.restore(this.redo.pop()); }
  S() { return this.sc.S; }

  mount(host, stage) {
    this.toolbar = this.buildToolbar();
    this.viewer = h('div.viewer', { 'data-tool': 'select' });
    stage.append(this.toolbar, this.viewer);
    this.sc = new PageScroller(this.viewer, this.p.files[0].doc, { onPage: (rec) => this.setupPage(rec), onZoom: () => this.renderAll() });
    this.keyHandler = (e) => this.onKey(e);
    document.addEventListener('keydown', this.keyHandler);
    const obs = new MutationObserver(() => { if (!document.contains(stage)) { document.removeEventListener('keydown', this.keyHandler); obs.disconnect(); } });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  buildToolbar() {
    const tb = h('div.vtool');
    this.toolBtns = {};
    const add = (id, icn, title) => { const b = h('button.tb', { title, type: 'button', onclick: () => this.setTool(id) }, ic(icn)); this.toolBtns[id] = b; tb.append(b); };
    add('select', 'cursor', t('Select / move', 'เลือก / ย้าย'));
    if (this.mode === 'sign') {
      tb.append(h('button.btn.sm.primary', { onclick: () => this.addSignature('signature') }, ic('sign'), t('Signature', 'ลายเซ็น')), h('button.btn.sm', { onclick: () => this.addSignature('initials') }, t('Initials', 'อักษรย่อ')),
        h('button.btn.sm', { onclick: () => this.addDate() }, ic('calendar'), t('Date', 'วันที่')));
      add('text', 'type', t('Text', 'ข้อความ'));
    } else {
      add('text', 'type', t('Text', 'ข้อความ')); add('rect', 'square', t('Rectangle', 'สี่เหลี่ยม')); add('ellipse', 'circle', t('Ellipse', 'วงรี'));
      add('line', 'line', t('Line', 'เส้น')); add('arrow', 'arrow', t('Arrow', 'ลูกศร')); add('ink', 'pen', t('Draw', 'วาดอิสระ'));
      add('highlight', 'highlight', t('Highlight', 'ไฮไลต์')); add('whiteout', 'eraser', t('White-out', 'ลบด้วยสีขาว'));
      const inp = h('input', { type: 'file', accept: 'image/*', hidden: true, onchange: (e) => { const f = e.target.files[0]; e.target.value = ''; f && this.addImageFile(f); } });
      tb.append(inp, h('button.tb', { title: t('Insert image', 'แทรกรูปภาพ'), type: 'button', onclick: () => inp.click() }, ic('image')));
    }
    tb.append(h('span.sep'));
    this.colorIn = h('input', { type: 'color', value: this.props.color, title: t('Colour', 'สี'), style: { width: '36px', height: '34px' }, oninput: (e) => this.setProp('color', e.target.value) });
    this.sizeIn = h('input', { type: 'number', min: 1, max: 120, value: this.props.size, title: t('Text size / line width', 'ขนาดตัวอักษร / ความหนาเส้น'), oninput: (e) => this.setProp(this.isTextish() ? 'size' : 'width', +e.target.value || 1) });
    this.fontSel = h('select', { title: t('Font', 'ฟอนต์'), onchange: (e) => this.setProp('font', e.target.value) }, ['sans', 'serif', 'mono'].map((f) => h('option', { value: f }, f)));
    this.opIn = h('input', { type: 'range', min: 0.1, max: 1, step: 0.05, value: 1, style: { width: '80px' }, title: t('Opacity', 'ความโปร่งใส'), oninput: (e) => this.setProp('opacity', +e.target.value) });
    this.boldB = h('button.tb', { type: 'button', title: t('Bold', 'ตัวหนา'), 'aria-label': t('Bold', 'ตัวหนา'), style: { fontWeight: 800 }, onclick: () => this.setProp('bold', !this.props.bold) }, 'B');
    tb.append(this.colorIn, this.sizeIn, this.fontSel, this.boldB, this.opIn, h('span.sep'),
      h('button.tb', { title: t('Undo', 'เลิกทำ'), type: 'button', onclick: () => this.doUndo() }, ic('undo')), h('button.tb', { title: t('Redo', 'ทำซ้ำ'), type: 'button', onclick: () => this.doRedo() }, ic('redo')),
      h('button.tb', { title: t('Delete selected', 'ลบที่เลือก'), type: 'button', onclick: () => this.deleteSel() }, ic('trash')), h('span.sep'),
      h('button.tb', { title: t('Zoom out', 'ย่อ'), type: 'button', onclick: () => this.sc.setZoom(this.sc.zoom - 0.2) }, ic('zoomOut')), h('button.tb', { title: t('Zoom in', 'ขยาย'), type: 'button', onclick: () => this.sc.setZoom(this.sc.zoom + 0.2) }, ic('zoomIn')));
    this.setTool('select', tb);
    return tb;
  }
  isTextish() { const s = this.selItem(); return this.tool === 'text' || (s && s.type === 'text'); }
  setTool(id) { this.tool = id; this.viewer && (this.viewer.dataset.tool = id); Object.entries(this.toolBtns).forEach(([k, b]) => b.classList.toggle('on', k === id)); if (id !== 'select') this.select(null); this.viewer && (this.viewer.style.cursor = id === 'select' ? 'default' : 'crosshair'); this.syncProps(); }
  setProp(k, v) {
    this.props[k] = v;
    const s = this.selItem();
    if (s) { this.snap(); const map = { color: 'color', size: 'size', width: 'width', font: 'font', opacity: 'opacity', bold: 'bold' }; if (map[k] in s || ['color', 'opacity'].includes(k) || (k === 'size' && s.type === 'text') || (k === 'width' && s.type !== 'text') || k === 'font' || k === 'bold') { s[k] = v; this.renderItem(s); } }
    this.syncProps();
  }
  syncProps() {
    const s = this.selItem(); const src = s || this.props;
    this.colorIn.value = src.color || this.props.color; this.opIn.value = src.opacity ?? 1;
    this.sizeIn.value = this.isTextish() ? (src.size || this.props.size) : (src.width || this.props.width);
    this.fontSel.value = src.font || this.props.font; this.boldB.classList.toggle('on', !!(src.bold ?? this.props.bold));
  }

  // -- page overlay & pointer handling -----------------------------------------
  setupPage(rec) {
    this.recs.set(rec.no, rec);
    const ov = rec.ov;
    rec.svg = document.createElementNS(SVGNS, 'svg'); rec.svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none');
    ov.append(rec.svg);
    ov.addEventListener('pointerdown', (e) => this.onDown(e, rec));
  }
  pt(e, rec) { const r = rec.ov.getBoundingClientRect(); return { x: (e.clientX - r.left) / this.S(), y: (e.clientY - r.top) / this.S() }; }

  onDown(e, rec) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const hit = e.target.closest('[data-id]');
    const p0 = this.pt(e, rec);
    if (this.tool === 'select') {
      if (!hit) { this.select(null); return; }
      const it = this.items.find((i) => i.id === hit.dataset.id); if (!it) return;
      this.select(it.id);
      if (hit.contentEditable === 'true') return;
      const resize = e.target.classList.contains('hd');
      const orig = JSON.parse(JSON.stringify(it)); let moved = false;
      const mv = (ev) => {
        const p = this.pt(ev, rec); const dx = p.x - p0.x, dy = p.y - p0.y;
        if (!moved) { this.snap(); moved = true; }
        if (resize && 'w' in it) { it.w = Math.max(8, orig.w + dx); it.h = Math.max(8, orig.h + dy); if (it.type === 'text') { it.w = Math.max(30, orig.w + dx); } }
        else if (it.type === 'ink') it.points = orig.points.map(([x, y]) => [x + dx, y + dy]);
        else if ('x1' in it) { it.x1 = orig.x1 + dx; it.y1 = orig.y1 + dy; it.x2 = orig.x2 + dx; it.y2 = orig.y2 + dy; }
        else { it.x = orig.x + dx; it.y = orig.y + dy; }
        this.renderItem(it);
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      e.preventDefault();
      return;
    }
    e.preventDefault();
    if (this.tool === 'text') {
      this.snap();
      const it = { id: uid(), page: rec.no, type: 'text', x: p0.x, y: p0.y - this.props.size * 0.6, w: 160, h: this.props.size * 1.6, text: '', size: this.props.size, color: this.props.color, font: this.props.font, bold: this.props.bold, italic: false, opacity: 1, align: 'left' };
      this.items.push(it); this.select(it.id); this.renderItem(it); this.editText(it); this.setTool('select'); return;
    }
    // drag-to-draw tools
    const type = this.tool; const pr = this.props;
    const base = { id: uid(), page: rec.no, type, color: pr.color, width: pr.width, opacity: type === 'highlight' ? 0.4 : pr.opacity };
    if (type === 'highlight') base.color = base.color === '#d32f2f' ? '#ffeb3b' : pr.color;
    if (type === 'whiteout') base.color = '#ffffff';
    let it;
    if (['rect', 'ellipse', 'highlight', 'whiteout'].includes(type)) it = { ...base, x: p0.x, y: p0.y, w: 0, h: 0, fill: '' };
    else if (type === 'ink') it = { ...base, points: [[p0.x, p0.y]] };
    else it = { ...base, x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y };
    haptic('tap'); this.snap(); this.items.push(it);
    const mv = (ev) => {
      const p = this.pt(ev, rec);
      if ('w' in it) { it.x = Math.min(p0.x, p.x); it.y = Math.min(p0.y, p.y); it.w = Math.abs(p.x - p0.x); it.h = Math.abs(p.y - p0.y); }
      else if (it.type === 'ink') it.points.push([p.x, p.y]);
      else { it.x2 = p.x; it.y2 = p.y; }
      this.renderItem(it);
    };
    const up = () => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
      const tiny = ('w' in it && (it.w < 3 || it.h < 3)) || ('x1' in it && Math.hypot(it.x2 - it.x1, it.y2 - it.y1) < 3);
      if (tiny) { this.items = this.items.filter((i) => i !== it); this.undo.pop(); this.renderItem(it, true); }
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }

  // -- items rendering -----------------------------------------------------------
  renderAll() { this.recs.forEach((rec) => { [...rec.ov.querySelectorAll('[data-id]')].forEach((n) => n.remove()); rec.svg.replaceChildren(); }); this.items.forEach((i) => this.renderItem(i)); }
  selItem() { return this.items.find((i) => i.id === this.sel); }
  select(id) { this.sel = id; this.recs.forEach((rec) => { rec.ov.querySelectorAll('[data-id]').forEach((n) => n.classList.toggle('sel', n.dataset.id === id)); rec.svg.querySelectorAll('[data-id]').forEach((n) => n.setAttribute('opacity', n.dataset.id === id ? 1 : n.dataset.op)); }); this.toolbar && this.syncProps(); }
  deleteSel() { const s = this.selItem(); if (!s) return; haptic('warn'); this.snap(); this.items = this.items.filter((i) => i !== s); this.renderItem(s, true); this.sel = null; }
  onKey(e) {
    if (!document.contains(this.viewer)) return;
    const typing = document.activeElement && (document.activeElement.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
    if ((e.key === 'Delete' || e.key === 'Backspace') && !typing) { e.preventDefault(); this.deleteSel(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? this.doRedo() : this.doUndo(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); this.doRedo(); }
  }
  renderItem(it, remove = false) {
    const rec = this.recs.get(it.page); if (!rec) return;
    const S = this.S();
    rec.ov.querySelectorAll(`[data-id="${it.id}"]`).forEach((n) => n.remove());
    rec.svg.querySelectorAll(`[data-id="${it.id}"]`).forEach((n) => n.remove());
    if (remove) return;
    const sel = this.sel === it.id;
    const box = (n) => { Object.assign(n.style, { left: it.x * S + 'px', top: it.y * S + 'px', width: it.w * S + 'px', height: it.h * S + 'px' }); n.dataset.id = it.id; if (sel) n.classList.add('sel'); };
    const handle = () => h('i.hd');
    if (it.type === 'text') {
      const n = h('div.it.txt', { style: { fontSize: it.size * S + 'px', color: it.color, fontFamily: FONTS[it.font] || FONTS.sans, fontWeight: it.bold ? 700 : 400, fontStyle: it.italic ? 'italic' : 'normal', opacity: it.opacity, textAlign: it.align || 'left', minHeight: it.size * S * 1.3 + 'px', minWidth: '30px' }, ondblclick: () => this.editText(it) }, it.text);
      box(n); n.style.height = 'auto'; n.append(handle()); rec.ov.append(n);
    } else if (['rect', 'ellipse', 'highlight', 'whiteout'].includes(it.type)) {
      const n = h('div.it'); box(n);
      if (it.type === 'rect' || it.type === 'ellipse') { n.style.border = `${Math.max(1, it.width * S)}px solid ${it.color}`; n.style.opacity = it.opacity; if (it.type === 'ellipse') n.style.borderRadius = '50%'; }
      else if (it.type === 'highlight') { n.style.background = it.color; n.style.opacity = it.opacity; n.style.mixBlendMode = 'multiply'; }
      else { n.style.background = '#fff'; n.style.border = '1px dashed #bbb'; }
      n.append(handle()); rec.ov.append(n);
    } else if (it.type === 'image') {
      const n = h('div.it'); box(n); n.append(h('img', { src: it.url, style: { width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' }, draggable: false }), handle()); rec.ov.append(n);
    } else {
      const g = document.createElementNS(SVGNS, 'g'); g.dataset.id = it.id; g.dataset.op = it.opacity; g.setAttribute('opacity', it.opacity); g.style.pointerEvents = 'stroke'; g.style.cursor = 'move'; g.style.touchAction = 'none';
      const stroke = { stroke: it.color, 'stroke-width': Math.max(1, it.width * S), fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
      const el = (tag, a) => { const n = document.createElementNS(SVGNS, tag); Object.entries({ ...stroke, ...a }).forEach(([k, v]) => n.setAttribute(k, v)); return n; };
      if (it.type === 'ink') g.append(el('polyline', { points: it.points.map(([x, y]) => `${x * S},${y * S}`).join(' ') }));
      else {
        g.append(el('line', { x1: it.x1 * S, y1: it.y1 * S, x2: it.x2 * S, y2: it.y2 * S }));
        if (it.type === 'arrow') { const a = Math.atan2(it.y2 - it.y1, it.x2 - it.x1), L = Math.max(8, it.width * 4.5) * S; const pts = [[it.x2 * S, it.y2 * S], ...[Math.PI - 0.45, Math.PI + 0.45].map((d) => [it.x2 * S + L * Math.cos(a + d), it.y2 * S + L * Math.sin(a + d)])]; g.append(el('polygon', { points: pts.map((q) => q.join(',')).join(' '), fill: it.color })); }
      }
      g.querySelectorAll('*').forEach((n) => { n.style.pointerEvents = 'stroke'; });
      if (sel) g.setAttribute('opacity', 1);
      rec.svg.append(g);
      // wider invisible hit area
      g.addEventListener('pointerdown', (e) => { if (this.tool === 'select') { e.stopPropagation(); this.onDown({ ...e, target: g, clientX: e.clientX, clientY: e.clientY, button: 0, pointerType: e.pointerType, preventDefault: () => e.preventDefault(), closest: null }, rec); } });
    }
  }
  editText(it) {
    const rec = this.recs.get(it.page); const n = rec.ov.querySelector(`[data-id="${it.id}"]`); if (!n) return;
    n.contentEditable = 'true'; n.focus();
    const range = document.createRange(); range.selectNodeContents(n); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    const done = () => {
      n.contentEditable = 'false';
      const txt = n.innerText.replace(/\n$/, '');
      n.removeEventListener('blur', done);
      if (!txt.trim()) { this.items = this.items.filter((i) => i !== it); this.renderItem(it, true); return; }
      if (txt !== it.text) { this.snap(); it.text = txt; }
      it.w = Math.max(it.w, n.offsetWidth / this.S()); it.h = n.offsetHeight / this.S(); this.renderItem(it);
    };
    n.addEventListener('blur', done);
    n.addEventListener('keydown', (e) => { if (e.key === 'Escape') n.blur(); });
  }

  // -- adding assets --------------------------------------------------------------
  visiblePage() {
    const r = this.viewer.getBoundingClientRect(); let best = this.sc.pages[0], bo = -1;
    for (const rec of this.sc.pages) { const b = rec.el.getBoundingClientRect(); const o = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top); if (o > bo) { bo = o; best = rec; } }
    return best;
  }
  placeImage(blob, url, natW, natH, target = 160) {
    const rec = this.visiblePage(); const w = Math.min(target, rec.wpt * 0.6); const h_ = w * natH / natW;
    const it = { id: uid(), page: rec.no, type: 'image', x: (rec.wpt - w) / 2, y: Math.max(20, Math.min(rec.hpt - h_ - 20, rec.hpt / 2)), w, h: h_, url, opacity: 1 };
    haptic('success'); this.images.set(it.id, blob); this.snap(); this.items.push(it); this.renderItem(it); this.select(it.id); this.renderItem(it);
    rec.el.scrollIntoView({ block: 'nearest' });
  }
  async addImageFile(file) {
    const bmp = await createImageBitmap(file).catch(() => null); if (!bmp) { toast(t('Cannot read this image.', 'อ่านรูปนี้ไม่ได้')); return; }
    const sc = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); const c = h('canvas'); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/png')); this.placeImage(blob, URL.createObjectURL(blob), c.width, c.height, 220);
  }
  addDate() {
    const rec = this.visiblePage(); const d = new Date(); const txt = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const it = { id: uid(), page: rec.no, type: 'text', x: rec.wpt * 0.55, y: rec.hpt * 0.8, w: 120, h: 24, text: txt, size: 12, color: '#111111', font: 'sans', bold: false, italic: false, opacity: 1, align: 'left' };
    this.snap(); this.items.push(it); this.renderItem(it); this.select(it.id); this.renderItem(it);
  }
  async addSignature(kind) {
    const r = await signatureModal(kind);
    if (!r) return;
    this.placeImage(r.blob, URL.createObjectURL(r.blob), r.w, r.h, kind === 'initials' ? 90 : 180);
  }

  collect() {
    const ops = []; const files = []; const idx = new Map();
    for (const it of this.items) {
      const o = { page: it.page, type: it.type };
      if (it.type === 'text') Object.assign(o, { x: it.x, y: it.y, w: Math.max(it.w, 20), h: it.h, text: it.text, size: it.size, color: it.color, font: it.font, bold: it.bold, italic: it.italic, align: it.align });
      else if (['rect', 'ellipse'].includes(it.type)) Object.assign(o, { x: it.x, y: it.y, w: it.w, h: it.h, color: it.color, width: it.width, opacity: it.opacity, fill: it.fill || undefined });
      else if (['highlight', 'whiteout'].includes(it.type)) Object.assign(o, { x: it.x, y: it.y, w: it.w, h: it.h, color: it.color, opacity: it.opacity });
      else if (['line', 'arrow'].includes(it.type)) Object.assign(o, { x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2, color: it.color, width: it.width, opacity: it.opacity });
      else if (it.type === 'ink') Object.assign(o, { points: it.points, color: it.color, width: it.width, opacity: it.opacity });
      else if (it.type === 'image') { if (!idx.has(it.id)) { idx.set(it.id, files.length + 1); files.push(new File([this.images.get(it.id)], `img${files.length}.png`, { type: 'image/png' })); } Object.assign(o, { x: it.x, y: it.y, w: it.w, h: it.h, ref: idx.get(it.id) }); }
      ops.push(o);
    }
    return { ops, files };
  }
}

function makeImpl(mode) {
  return {
    accept: ['pdf'], fullWidth: false,
    init(p) { p.opts = {}; p.editor = null; },
    stage(p, stage) { p.editor = new Editor(p, mode); p.editor.mount(p.host, stage); },
    controls(p) { return h('div.small.muted', mode === 'sign' ? t('Create your signature, then drag it into place and resize with the corner handle. Click “Sign PDF” when finished.', 'สร้างลายเซ็น แล้วลากไปวางและย่อ/ขยายด้วยมุมขวาล่าง เสร็จแล้วกด “เซ็น PDF”') : t('Pick a tool, then click or drag on the page. Double-click text to edit. Delete removes the selected item.', 'เลือกเครื่องมือ แล้วคลิกหรือลากบนหน้า ดับเบิลคลิกข้อความเพื่อแก้ไข กด Delete เพื่อลบ')); },
    collect(p) { return { ops: p.editor.collect().ops }; },
    extraFiles(p) { return p.editor.collect().files; },
    validate(p) { if (!p.editor.items.length) return mode === 'sign' ? t('Add your signature first.', 'เพิ่มลายเซ็นก่อน') : t('Add something to the page first.', 'เพิ่มบางอย่างลงในหน้าก่อน'); },
    button: mode === 'sign' ? ['Sign PDF', 'เซ็น PDF'] : ['Save changes', 'บันทึกการแก้ไข'],
    doneTitle: mode === 'sign' ? ['PDF signed!', 'เซ็น PDF แล้ว!'] : ['PDF edited!', 'แก้ไข PDF แล้ว!'],
  };
}
export const edit = { ...makeImpl('edit'), api: 'edit' };
export const sign = { ...makeImpl('sign'), api: 'edit' };

// ---- signature creator modal -----------------------------------------------------
const SAVED_KEY = 'maxpdf.signatures';
function loadSaved() { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; } }
function saveSaved(list) { try { localStorage.setItem(SAVED_KEY, JSON.stringify(list.slice(0, 4))); } catch { /* ignore */ } }

function trim(canvas) {
  const ctx = canvas.getContext('2d'); const { width: w, height: hh } = canvas; const d = ctx.getImageData(0, 0, w, hh).data;
  let x0 = w, y0 = hh, x1 = 0, y1 = 0;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 <= x0 || y1 <= y0) return null;
  const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(hh - 1, y1 + pad);
  const out = h('canvas'); out.width = x1 - x0 + 1; out.height = y1 - y0 + 1; out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

async function signatureModal(kind) {
  let tab = 'draw'; let color = '#1a2a6c'; let result = null;
  const pad = h('canvas.sigpad', { width: 900, height: 300, style: { height: '150px' } });
  const pc = pad.getContext('2d'); pc.lineWidth = 5; pc.lineCap = 'round'; pc.lineJoin = 'round';
  let drawing = false; let drew = false;
  const pos = (e) => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };
  pad.addEventListener('pointerdown', (e) => { drawing = true; drew = true; pad.setPointerCapture(e.pointerId); const [x, y] = pos(e); pc.strokeStyle = color; pc.beginPath(); pc.moveTo(x, y); pc.lineTo(x + 0.1, y); pc.stroke(); });
  pad.addEventListener('pointermove', (e) => { if (!drawing) return; const [x, y] = pos(e); pc.lineTo(x, y); pc.stroke(); });
  pad.addEventListener('pointerup', () => { drawing = false; });
  const typed = h('input', { type: 'text', placeholder: kind === 'initials' ? 'AB' : t('Your name', 'ชื่อของคุณ'), style: { fontFamily: '"Brush Script MT","Segoe Script","Snell Roundhand",cursive', fontSize: '28px' }, oninput: drawType });
  const fontSel = h('select', { onchange: drawType }, [['"Brush Script MT","Segoe Script","Snell Roundhand",cursive', 'Script'], ['italic 1em Georgia,serif', 'Serif italic'], ['"IBM Plex Sans Thai",sans-serif', 'Sans']].map(([v, l]) => h('option', { value: v }, l)));
  const typedCanvas = h('canvas', { width: 900, height: 300, style: { width: '100%', height: '100px', border: '1px dashed var(--border2)', borderRadius: '10px', background: '#fff' } });
  function drawType() { const c = typedCanvas.getContext('2d'); c.clearRect(0, 0, 900, 300); c.fillStyle = color; c.font = `${fontSel.value.startsWith('italic') ? 'italic ' : ''}120px ${fontSel.value.replace('italic 1em ', '')}`; c.textBaseline = 'middle'; c.fillText(typed.value, 30, 150, 840); }
  const upCanvas = h('canvas', { width: 10, height: 10 }); let upLoaded = false; let upTransp = true;
  const upIn = h('input', { type: 'file', accept: 'image/*', onchange: async (e) => { const f = e.target.files[0]; if (!f) return; const b = await createImageBitmap(f); const s = Math.min(1, 900 / b.width); upCanvas.width = b.width * s; upCanvas.height = b.height * s; upCanvas.getContext('2d').drawImage(b, 0, 0, upCanvas.width, upCanvas.height); upLoaded = true; if (upTransp) removeBg(upCanvas); upCanvas.style.cssText = 'max-width:100%;max-height:140px;border:1px dashed var(--border2);border-radius:10px;background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px'; } });
  function removeBg(c) { const x = c.getContext('2d'); const im = x.getImageData(0, 0, c.width, c.height); const d = im.data; for (let i = 0; i < d.length; i += 4) { const lum = (d[i] + d[i + 1] + d[i + 2]) / 3; if (lum > 200) d[i + 3] = 0; else if (lum > 150) d[i + 3] = Math.round((200 - lum) * 5); } x.putImageData(im, 0, 0); }
  const colors = ['#1a2a6c', '#111111', '#0b57d0', '#b3261e'];
  const colorRow = h('div.wrapflex', colors.map((c) => h('button', { type: 'button', style: { width: '28px', height: '28px', borderRadius: '50%', border: '2px solid var(--border2)', background: c, cursor: 'pointer' }, onclick: () => { color = c; pc.strokeStyle = c; drawType(); } })));
  const saved = loadSaved();
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } });
  const panes = { draw: h('div', pad, h('div.row', { style: { marginTop: '8px' } }, colorRow, h('button.btn.sm.fix', { onclick: () => { pc.clearRect(0, 0, 900, 300); drew = false; } }, t('Clear', 'ล้าง')))), type: h('div', typed, h('div', { style: { height: '8px' } }), fontSel, h('div', { style: { height: '8px' } }), typedCanvas, h('div', { style: { height: '8px' } }), colorRow.cloneNode(true)), upload: h('div', upIn, h('div', { style: { height: '8px' } }), upCanvas) };
  panes.type.lastChild.querySelectorAll('button').forEach((b, i) => { b.onclick = () => { color = colors[i]; drawType(); }; });
  const seg = h('div.seg', ['draw', 'type', 'upload'].map((k) => h('button', { type: 'button', 'data-k': k, onclick: () => { tab = k; show(); } }, k === 'draw' ? t('Draw', 'วาด') : k === 'type' ? t('Type', 'พิมพ์') : t('Upload', 'อัปโหลด'))));
  const savedRow = h('div.wrapflex');
  function show() { Object.entries(panes).forEach(([k, n]) => n.classList.toggle('hidden', k !== tab)); [...seg.children].forEach((b) => b.classList.toggle('on', b.dataset.k === tab)); }
  saved.forEach((s) => savedRow.append(h('button', { type: 'button', style: { border: '1px solid var(--border2)', borderRadius: '8px', background: '#fff', padding: '2px', cursor: 'pointer' }, title: t('Use saved', 'ใช้ที่บันทึกไว้'), onclick: async () => { const b = await (await fetch(s)).blob(); const bm = await createImageBitmap(b); result = { blob: b, w: bm.width, h: bm.height }; mref.close && mref.close(true); } }, h('img', { src: s, style: { height: '34px', display: 'block' } }))));
  const mref = {};
  body.append(seg, ...Object.values(panes), saved.length ? h('div', h('div.small.muted', t('Saved on this device', 'ที่บันทึกไว้ในเครื่องนี้')), savedRow) : null);
  show();
  const ok = await modal({ title: kind === 'initials' ? t('Create initials', 'สร้างอักษรย่อ') : t('Create signature', 'สร้างลายเซ็น'), body, buttons: [{ label: t('Cancel', 'ยกเลิก'), value: false }, { label: t('Insert', 'แทรก'), primary: true, value: true }], ref: mref });
  if (result) return result;
  if (!ok) return null;
  const src = tab === 'draw' ? (drew ? pad : null) : tab === 'type' ? (typed.value.trim() ? typedCanvas : null) : (upLoaded ? upCanvas : null);
  if (!src) { toast(t('Nothing to insert.', 'ยังไม่มีลายเซ็น')); return null; }
  const tc = trim(src); if (!tc) return null;
  const blob = await new Promise((r) => tc.toBlob(r, 'image/png'));
  try { const url = tc.toDataURL('image/png'); if (url.length < 120000) saveSaved([url, ...loadSaved().filter((x) => x !== url)]); } catch { /* ignore */ }
  return { blob, w: tc.width, h: tc.height };
}
