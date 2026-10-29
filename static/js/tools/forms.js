import { h, ic, field, checkbox, segmented, modal, uid, clear } from '../ui.js';
import { t } from '../i18n.js';
import { PageScroller, drawScrollToggle } from '../pdfview.js';
import { runJob } from '../api.js';

export const forms = {
  init(p) { p.opts = {}; p.mode = 'fill'; p.fields = []; p.values = {}; p.created = []; p.flatten = false; },
  stage(p, stage) {
    const f = p.files[0];
    const info = h('div.panel', h('div.muted', t('Detecting form fields…', 'กำลังตรวจจับช่องฟอร์ม…')));
    stage.append(info);
    runJob('forms', [f.file], { action: 'detect', password: f.password }, {}).then((job) => {
      p.fields = job.data.fields || [];
      info.remove();
      p.fields.forEach((fl) => { if (fl.value && fl.value !== 'Off') p.values[fl.name] = fl.value; });
      build(p, stage);
    }).catch((e) => { clear(info); info.append(h('div.alert.err', e.message)); });
  },
  controls(p) {
    const box = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    box.append(field(['Mode', 'โหมด'], segmented([['fill', ['Fill', 'กรอก']], ['create', ['Create fields', 'สร้างช่อง']]], 'fill', (v) => { p.mode = v; const vw = p.stageEl && p.stageEl.querySelector('.viewer'); if (vw) vw.dataset.pan = v === 'create' ? 'draw' : 'scroll'; p.hint && (p.hint.textContent = hintText(v)); })));
    p.hint = h('div.small.muted', hintText('fill'));
    box.append(p.hint, checkbox(['Flatten (make fields non-editable)', 'ทำให้แบน (แก้ไขช่องไม่ได้อีก)'], false, (v) => { p.flatten = v; }));
    return box;
  },
  collect(p) { return { action: 'apply', values: p.values, create: p.created, flatten: p.flatten }; },
  validate(p) { if (!Object.keys(p.values).length && !p.created.length) return t('Fill a field or create one first.', 'กรอกช่องหรือสร้างช่องก่อน'); },
  summary: (p, job) => h('p.muted', t(`${job.data.filled || 0} filled · ${job.data.created || 0} created`, `กรอก ${job.data.filled || 0} · สร้าง ${job.data.created || 0}`)),
  button: ['Save form', 'บันทึกฟอร์ม'], doneTitle: ['Form saved!', 'บันทึกฟอร์มแล้ว!'],
};
const hintText = (m) => (m === 'fill' ? t('Click the highlighted fields on the page and type.', 'คลิกช่องที่ไฮไลต์บนหน้าแล้วพิมพ์') : t('Drag on the page to draw a new field.', 'ลากบนหน้าเพื่อวาดช่องใหม่'));

function build(p, stage) {
  const host = h('div.viewer', { 'data-pan': 'scroll' });
  const count = p.fields.length;
  stage.append(h('div.small.muted', { style: { marginBottom: '8px' } }, count ? t(`${count} form field(s) found`, `พบช่องฟอร์ม ${count} ช่อง`) : t('No form fields found. Switch to “Create fields” to add some.', 'ไม่พบช่องฟอร์ม เปลี่ยนเป็น “สร้างช่อง” เพื่อเพิ่ม')), host);
  p.scroller = new PageScroller(host, p.files[0].doc, {
    onZoom: (sc) => sc.pages.forEach((r) => draw(r)),
    onPage(rec) {
      draw(rec);
      let start = null; let tmp = null;
      rec.ov.addEventListener('pointerdown', (e) => { if (p.mode !== 'create' || e.target !== rec.ov) return; const r = rec.ov.getBoundingClientRect(); start = { x: e.clientX - r.left, y: e.clientY - r.top }; tmp = h('div.box-draw'); rec.ov.append(tmp); rec.ov.setPointerCapture(e.pointerId); });
      rec.ov.addEventListener('pointermove', (e) => { if (!start) return; const r = rec.ov.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; Object.assign(tmp.style, { left: Math.min(start.x, x) + 'px', top: Math.min(start.y, y) + 'px', width: Math.abs(x - start.x) + 'px', height: Math.abs(y - start.y) + 'px' }); });
      rec.ov.addEventListener('pointerup', async (e) => {
        if (!start) return; const r = rec.ov.getBoundingClientRect(); const S = p.scroller.S; const x = e.clientX - r.left, y = e.clientY - r.top;
        const rect = { x0: Math.min(start.x, x) / S, y0: Math.min(start.y, y) / S, x1: Math.max(start.x, x) / S, y1: Math.max(start.y, y) / S };
        start = null; tmp.remove(); tmp = null;
        if (rect.x1 - rect.x0 < 8 || rect.y1 - rect.y0 < 8) return;
        const spec = await fieldDialog(p, rec.no, rect);
        if (spec) { p.created.push(spec); draw(rec); }
      });
    },
  });
  function draw(rec) {
    const S = p.scroller.S;
    [...rec.ov.querySelectorAll('.fld')].forEach((n) => n.remove());
    p.fields.filter((f) => f.page === rec.no).forEach((f) => rec.ov.append(fieldEl(p, f, S)));
    p.created.filter((c) => c.page === rec.no).forEach((c) => {
      rec.ov.append(h('div.fld', { style: { position: 'absolute', left: c.x0 * S + 'px', top: c.y0 * S + 'px', width: (c.x1 - c.x0) * S + 'px', height: (c.y1 - c.y0) * S + 'px', border: '1.5px dashed #db2777', background: 'rgba(219,39,119,.1)', fontSize: '11px', color: '#9d174d', overflow: 'hidden' } },
        h('span', c.name + ' · ' + c.type), h('button', { style: { position: 'absolute', right: 0, top: 0, border: 0, background: '#db2777', color: '#fff', cursor: 'pointer', fontSize: '11px', lineHeight: 1 }, onpointerdown: (e) => e.stopPropagation(), onclick: () => { p.created = p.created.filter((x) => x !== c); draw(rec); } }, '×')));
    });
  }
}

function fieldEl(p, f, S) {
  const [x0, y0, x1, y1] = f.rect;
  const st = { position: 'absolute', left: x0 * S + 'px', top: y0 * S + 'px', width: (x1 - x0) * S + 'px', height: (y1 - y0) * S + 'px' };
  let inner;
  const ty = (f.type || '').toLowerCase();
  if (f.readonly) inner = h('div.field-ov', { style: { ...st, background: 'rgba(0,0,0,.05)', borderColor: '#aaa' } });
  else if (ty.includes('check') || ty.includes('radio')) {
    const on = p.values[f.name] === true || (p.values[f.name] && p.values[f.name] !== 'Off');
    inner = h('input', { type: 'checkbox', checked: !!on, style: { ...st, margin: 0, accentColor: '#4f46e5' }, onchange: (e) => { p.values[f.name] = e.target.checked; } });
  } else if (ty.includes('combo') || ty.includes('list')) {
    inner = h('select.field-ov', { style: { ...st, minHeight: 0, padding: 0 }, onchange: (e) => { p.values[f.name] = e.target.value; } }, h('option', { value: '' }, ''), (f.choices || []).map((c) => { const v = Array.isArray(c) ? c[0] : c; return h('option', { value: v, selected: p.values[f.name] === v }, Array.isArray(c) ? c[1] || c[0] : c); }));
  } else if (ty.includes('text')) {
    const multi = f.multiline;
    inner = h(multi ? 'textarea.field-ov' : 'input.field-ov', { type: multi ? undefined : 'text', style: { ...st, minHeight: 0, padding: '0 3px', fontSize: Math.max(9, Math.min(16, (y1 - y0) * S * 0.6)) + 'px', resize: 'none' }, value: p.values[f.name] || '', oninput: (e) => { p.values[f.name] = e.target.value; } });
    if (multi) inner.textContent = p.values[f.name] || '';
  } else inner = h('div.field-ov', { style: st, title: f.type });
  inner.classList.add('fld'); inner.title = f.name;
  return inner;
}

async function fieldDialog(p, page, rect) {
  const spec = { page, ...rect, type: 'text', name: 'field_' + (p.created.length + 1 + p.fields.length), required: false, choices: [] };
  const choices = h('textarea', { rows: 3, placeholder: t('One option per line', 'หนึ่งตัวเลือกต่อบรรทัด'), oninput: (e) => { spec.choices = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean); } });
  const cWrap = h('div.hidden', field(['Options', 'ตัวเลือก'], choices));
  const sel = h('select', { onchange: (e) => { spec.type = e.target.value; cWrap.classList.toggle('hidden', !['combo', 'list'].includes(spec.type)); } }, [['text', t('Text field', 'ช่องข้อความ')], ['checkbox', t('Checkbox', 'ช่องติ๊ก')], ['radio', t('Radio button', 'ปุ่มเลือก')], ['combo', t('Dropdown', 'เมนูเลื่อนลง')], ['list', t('List box', 'กล่องรายการ')], ['signature', t('Signature field', 'ช่องลายเซ็น')]].map(([v, l]) => h('option', { value: v }, l)));
  const ok = await modal({ title: t('New form field', 'ช่องฟอร์มใหม่'), body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, field(['Type', 'ชนิด'], sel), field(['Name', 'ชื่อ'], h('input', { type: 'text', value: spec.name, oninput: (e) => { spec.name = e.target.value.trim().replace(/\s+/g, '_') || spec.name; } })), cWrap, checkbox(['Required', 'จำเป็นต้องกรอก'], false, (v) => { spec.required = v; })), buttons: [{ label: t('Cancel', 'ยกเลิก'), value: false }, { label: t('Add field', 'เพิ่มช่อง'), primary: true, value: true }] });
  return ok ? spec : null;
}
