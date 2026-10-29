import { h, ic, field, checkbox, segmented, select, renderSchema, clear } from '../ui.js';
import { t, tp } from '../i18n.js';
import { PageGrid, rangesToString, parseRanges } from '../pagegrid.js';
import { PageScroller, renderToCanvas, drawScrollToggle } from '../pdfview.js';

export const merge = {
  schema: [{ key: 'bookmarks', type: 'check', label: ['Add a bookmark for each file', 'เพิ่มบุ๊กมาร์กของแต่ละไฟล์'], def: false }],
  button: ['Merge PDF', 'รวม PDF'],
  doneTitle: ['PDFs merged!', 'รวม PDF เรียบร้อย!'],
};

export const split = {
  fullWidth: false,
  init(p) { p.opts = { mode: 'ranges', ranges: '', n: 1, merge_ranges: false }; },
  stage(p, stage) {
    const f = p.files[0];
    p.grid = new PageGrid({ docs: [f.doc], select: true, onChange: (g) => { if (p.opts.mode === 'ranges') { p.opts.ranges = rangesToString(g.items.filter((i) => i.sel).map((i) => i.p)); if (p.rangeInput) p.rangeInput.value = p.opts.ranges; } } }).load([0]);
    stage.append(h('div.panel', h('div.small.muted', { style: { marginBottom: '10px' } }, f.name + ` · ${f.numPages} ${t('pages', 'หน้า')} — ` + t('click pages to select', 'คลิกหน้าเพื่อเลือก')), p.grid.el));
  },
  controls(p) {
    const wrap = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    const sub = h('div');
    const draw = () => {
      clear(sub);
      if (p.opts.mode === 'ranges') {
        p.rangeInput = h('input', { type: 'text', placeholder: '1-3, 5, 8-', value: p.opts.ranges, oninput: (e) => { p.opts.ranges = e.target.value; const s = parseRanges(e.target.value, p.files[0].numPages); p.grid.items.forEach((i) => { i.sel = s.has(i.p); }); p.grid.render(); } });
        sub.append(field(['Page ranges', 'ช่วงหน้า'], p.rangeInput, ['Separate with commas. Each range becomes its own file.', 'คั่นด้วยจุลภาค แต่ละช่วงจะเป็นไฟล์แยก']),
          checkbox(['Merge all selected into one PDF', 'รวมหน้าที่เลือกทั้งหมดเป็น PDF เดียว'], p.opts.merge_ranges, (v) => { p.opts.merge_ranges = v; }));
      } else if (p.opts.mode === 'every') {
        sub.append(field(['Pages per file', 'จำนวนหน้าต่อไฟล์'], h('input', { type: 'number', min: 1, value: p.opts.n, oninput: (e) => { p.opts.n = +e.target.value || 1; } })));
      } else sub.append(h('div.alert.info', ic('info'), t('Every page becomes a separate PDF.', 'ทุกหน้าจะถูกแยกเป็น PDF เดี่ยว')));
    };
    wrap.append(field(['Split mode', 'วิธีแยก'], segmented([['ranges', ['Ranges', 'ช่วง']], ['every', ['Every N', 'ทุก N']], ['pages', ['All pages', 'ทุกหน้า']]], p.opts.mode, (v) => { p.opts.mode = v; draw(); })), sub);
    draw();
    return wrap;
  },
  validate(p) { if (p.opts.mode === 'ranges' && !String(p.opts.ranges).trim()) return t('Select pages or enter a range.', 'เลือกหน้าหรือกรอกช่วงหน้า'); },
  button: ['Split PDF', 'แยก PDF'],
  doneTitle: ['PDF split!', 'แยก PDF เรียบร้อย!'],
};

export const rotate = {
  init(p) { p.opts = { angle: 0 }; },
  stage(p, stage) {
    if (p.files.length > 1) { p.defaultStage(stage); return; }
    p.grid = new PageGrid({ docs: [p.files[0].doc], rotate: true }).load([0]);
    stage.append(h('div.panel', p.grid.el));
  },
  controls(p) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      field(['Rotate all pages', 'หมุนทุกหน้า'], segmented([[0, '0°'], [90, '90° ⟳'], [180, '180°'], [270, '90° ⟲']], p.opts.angle, (v) => { p.opts.angle = +v; })),
      h('div.help.small.muted', p.files.length === 1 ? t('Or rotate single pages with the buttons on each thumbnail.', 'หรือหมุนทีละหน้าด้วยปุ่มบนภาพย่อ') : t('The same rotation is applied to every file.', 'ใช้การหมุนเดียวกันกับทุกไฟล์')));
  },
  collect(p) {
    const o = { angle: p.opts.angle };
    if (p.grid) { const per = {}; p.grid.items.forEach((i, idx) => { if (i.rot) per[idx + 1] = i.rot; }); o.per_page = per; }
    return o;
  },
  validate(p) { const per = p.grid && p.grid.items.some((i) => i.rot); if (!p.opts.angle && !per) return t('Choose a rotation first.', 'เลือกการหมุนก่อน'); },
  button: ['Rotate PDF', 'หมุน PDF'],
  doneTitle: ['PDF rotated!', 'หมุน PDF เรียบร้อย!'],
};

export const organize = {
  multiple: true,
  init(p) { p.opts = {}; },
  stage(p, stage) {
    p.grid && p.grid.destroy();
    const docs = p.files.map((f) => f.doc);
    p.grid = new PageGrid({ docs, rotate: true, remove: true, reorder: true, onChange: () => { cnt.textContent = `${p.grid.live.length} ${t('pages', 'หน้า')}`; } });
    const input = h('input', { type: 'file', hidden: true, accept: '.pdf', multiple: true, onchange: (e) => { p.addFiles([...e.target.files]); e.target.value = ''; } });
    const cnt = h('span.muted.small', '');
    if (!p._organizeLoaded || p._organizeFiles !== p.files.length) {
      const prev = p.grid; p.grid.load(p.files.map((_, i) => i)); p._organizeLoaded = true; p._organizeFiles = p.files.length;
    }
    cnt.textContent = `${p.grid.live.length} ${t('pages', 'หน้า')}`;
    stage.append(h('div.panel',
      h('div.row', { style: { marginBottom: '12px', justifyContent: 'flex-start', flexWrap: 'wrap' } },
        h('button.btn.sm', { onclick: () => input.click() }, ic('plus'), t('Add PDF', 'เพิ่ม PDF')), h('button.btn.sm', { onclick: () => p.grid.addBlank() }, ic('file'), t('Blank page', 'หน้าว่าง')),
        h('span.small.muted', t('Drag to reorder', 'ลากเพื่อจัดเรียง')), cnt, input),
      p.grid.el));
  },
  onFiles(p) { p._organizeLoaded = false; },
  collect(p) { return { items: p.grid.live.map((i) => (i.blank ? { blank: true, size: 'a4' } : { f: i.f, p: i.p - 1, r: i.rot })) }; },
  validate(p) { if (!p.grid.live.length) return t('No pages left to save.', 'ไม่มีหน้าเหลือให้บันทึก'); },
  button: ['Save PDF', 'บันทึก PDF'],
  doneTitle: ['PDF organized!', 'จัดเรียง PDF เรียบร้อย!'],
};

// ---- Crop: draw a rectangle on page 1; applied as relative box to chosen pages
export const crop = {
  fullWidth: false,
  init(p) { p.opts = { mode: 'box', pages: 'all', unit: 'mm', margins: { top: 0, right: 0, bottom: 0, left: 0 } }; p.box = null; },
  stage(p, stage) {
    const host = h('div.viewer');
    stage.append(drawScrollToggle(host), host, h('div.small.muted', { style: { marginTop: '8px' } }, t('Drag on the page to select the area to keep.', 'ลากบนหน้าเพื่อเลือกพื้นที่ที่จะเก็บไว้')));
    const sc = new PageScroller(host, p.files[0].doc, {
      onPage(rec) {
        if (rec.no !== 1) { rec.ov.style.display = 'none'; return; }
        let start = null; let rect = null;
        const draw = () => { if (!p.box) { rect && rect.remove(); rect = null; return; } if (!rect) { rect = h('div.box-draw'); rec.ov.append(rect); } Object.assign(rect.style, { left: p.box.x0 * 100 + '%', top: p.box.y0 * 100 + '%', width: (p.box.x1 - p.box.x0) * 100 + '%', height: (p.box.y1 - p.box.y0) * 100 + '%' }); };
        rec.ov.style.cursor = 'crosshair';
        rec.ov.addEventListener('pointerdown', (e) => { const r = rec.ov.getBoundingClientRect(); start = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; rec.ov.setPointerCapture(e.pointerId); });
        rec.ov.addEventListener('pointermove', (e) => { if (!start) return; const r = rec.ov.getBoundingClientRect(); const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)); p.box = { x0: Math.min(start.x, x), y0: Math.min(start.y, y), x1: Math.max(start.x, x), y1: Math.max(start.y, y) }; draw(); });
        rec.ov.addEventListener('pointerup', () => { start = null; if (p.box && (p.box.x1 - p.box.x0 < 0.02 || p.box.y1 - p.box.y0 < 0.02)) { p.box = null; draw(); } });
      },
    });
    p.scroller = sc;
  },
  controls(p) {
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      field(['Apply to pages', 'ใช้กับหน้า'], h('input', { type: 'text', value: 'all', placeholder: 'all, 1-3, 5', oninput: (e) => { p.opts.pages = e.target.value || 'all'; } })),
      h('button.btn.sm', { onclick: () => { p.box = null; p.stageEl.querySelectorAll('.box-draw').forEach((x) => x.remove()); } }, ic('x'), t('Clear selection', 'ล้างพื้นที่ที่เลือก')),
      h('div.small.muted', t('The selected area is applied proportionally to every chosen page.', 'พื้นที่ที่เลือกจะถูกใช้เป็นสัดส่วนกับทุกหน้าที่เลือก')));
  },
  collect(p) { return { pages: p.opts.pages || 'all', box: p.box }; },
  validate(p) { if (!p.box) return t('Draw the area to keep on the first page.', 'ลากเลือกพื้นที่ที่ต้องการเก็บบนหน้าแรกก่อน'); },
  button: ['Crop PDF', 'ตัดขอบ PDF'],
  doneTitle: ['PDF cropped!', 'ตัดขอบ PDF เรียบร้อย!'],
};

// ---- Page numbers with live preview
export const pagenumbers = {
  init(p) { p.opts = { position: 'bottom-center', format: '{n}', style: 'arabic', first_number: 1, size: 12, margin: 28, color: '#222222', font: 'sans', pages: 'all', skip_first: false, facing: false }; },
  schema: [
    { key: 'position', type: 'pos', label: ['Position', 'ตำแหน่ง'], def: 'bottom-center' },
    { key: 'format', type: 'select', label: ['Format', 'รูปแบบ'], def: '{n}', options: [['{n}', '1, 2, 3'], ['Page {n}', 'Page 1'], ['{n} / {total}', '1 / 10'], ['Page {n} of {total}', 'Page 1 of 10'], ['หน้า {n}', 'หน้า 1'], ['หน้า {n} จาก {total}', 'หน้า 1 จาก 10'], ['- {n} -', '- 1 -']] },
    { key: 'style', type: 'select', label: ['Numerals', 'ชนิดตัวเลข'], def: 'arabic', options: [['arabic', '1 2 3'], ['thai', '๑ ๒ ๓'], ['roman', 'i ii iii'], ['ROMAN', 'I II III']] },
    { key: 'first_number', type: 'number', label: ['First number', 'เริ่มนับที่'], def: 1, min: 0 },
    { key: 'size', type: 'range', label: ['Font size', 'ขนาดตัวอักษร'], def: 12, min: 7, max: 28, unit: 'pt' },
    { key: 'color', type: 'color', label: ['Colour', 'สี'], def: '#222222' },
    { key: 'pages', type: 'text', label: ['Pages', 'หน้าที่ใส่'], def: 'all', help: ['e.g. all, 2-10', 'เช่น all, 2-10'] },
    { key: 'skip_first', type: 'check', label: ['Skip the first page (cover)', 'ข้ามหน้าแรก (ปก)'], def: false },
  ],
  stage(p, stage) { previewStage(p, stage, (ctx, w, h_, S) => {
    const o = p.opts; const txt = String(o.format || '{n}').replace('{n}', fmtNum(Number(o.first_number) || 1, o.style)).replace('{total}', fmtNum(p.files[0].numPages, o.style));
    const [v, hz] = String(o.position).split('-');
    ctx.font = `${(o.size || 12) * S}px 'IBM Plex Sans Thai', sans-serif`; ctx.fillStyle = o.color; ctx.textAlign = hz === 'left' ? 'left' : hz === 'right' ? 'right' : 'center';
    const m = (o.margin || 28) * S; const x = hz === 'left' ? m : hz === 'right' ? w - m : w / 2; const y = v === 'top' ? m + (o.size || 12) * S * 0.8 : h_ - m;
    ctx.fillText(txt, x, y);
  }); },
  onOpts(p) { p.redrawPreview && p.redrawPreview(); },
  button: ['Add page numbers', 'ใส่เลขหน้า'],
  doneTitle: ['Page numbers added!', 'ใส่เลขหน้าเรียบร้อย!'],
};
function fmtNum(n, style) {
  if (style === 'thai') return String(n).replace(/\d/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[d]);
  if (style === 'roman' || style === 'ROMAN') { let r = ''; [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']].forEach(([v, s]) => { while (n >= v) { r += s; n -= v; } }); return style === 'ROMAN' ? r.toUpperCase() : r; }
  return String(n);
}

/** Shared first-page preview with a drawing callback (canvas 2D, scale S = px per pt). */
export function previewStage(p, stage, draw, { width = 520 } = {}) {
  const f = p.files[0];
  const base = h('canvas'); const over = h('canvas', { style: { position: 'absolute', inset: 0 } });
  const wrap = h('div', { style: { position: 'relative', width: 'fit-content', margin: '0 auto', boxShadow: '0 2px 12px rgba(0,0,0,.25)', background: '#fff' } }, base, over);
  stage.append(h('div.panel', { style: { textAlign: 'center' } }, h('div.small.muted', { style: { marginBottom: '10px' } }, f.name + ' — ' + t('preview of the first page', 'ตัวอย่างหน้าแรก')), wrap));
  renderToCanvas(f.doc, 1, base, { maxW: Math.max(220, Math.min(width, (stage.clientWidth || window.innerWidth) - 40)), maxH: 700, dpr: 1 }).then((info) => {
    over.width = base.width; over.height = base.height; over.style.width = base.style.width; over.style.height = base.style.height;
    const S = base.width / info.w;
    p.redrawPreview = () => { const c = over.getContext('2d'); c.clearRect(0, 0, over.width, over.height); draw(c, over.width, over.height, S); };
    p.redrawPreview();
  });
}
