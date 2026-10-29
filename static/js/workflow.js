import { h, ic, field, renderSchema, uid, toast, fmtBytes, clear, select, modal } from './ui.js';
import { t, tp } from './i18n.js';
import { runJob, fileUrl, zipUrl, capabilities, ApiError } from './api.js';
import * as MISC from './tools/misc.js';
import * as ORG from './tools/organize.js';
import { PDF_TOOLS, byId } from './registry.js';

const pagesF = { key: 'pages', type: 'text', label: ['Pages', 'หน้า'], def: 'all' };
const SCHEMAS = {
  merge: [{ key: 'bookmarks', type: 'check', label: ['Bookmark each file', 'บุ๊กมาร์กแต่ละไฟล์'], def: false }],
  split: [{ key: 'mode', type: 'select', label: ['Mode', 'วิธี'], def: 'pages', options: [['pages', ['Each page', 'ทุกหน้า']], ['every', ['Every N pages', 'ทุก N หน้า']]] }, { key: 'n', type: 'number', label: ['N', 'N'], def: 1, min: 1, show: (o) => o.mode === 'every' }],
  rotate: [{ key: 'angle', type: 'seg', label: ['Angle', 'มุม'], def: 90, options: [[90, '90°'], [180, '180°'], [270, '270°']] }, pagesF],
  crop: [{ key: 'unit', type: 'select', label: ['Unit', 'หน่วย'], def: 'mm', options: ['mm', 'cm', 'pt', '%'] }, { key: 'top', type: 'number', label: ['Top', 'บน'], def: 10 }, { key: 'right', type: 'number', label: ['Right', 'ขวา'], def: 10 }, { key: 'bottom', type: 'number', label: ['Bottom', 'ล่าง'], def: 10 }, { key: 'left', type: 'number', label: ['Left', 'ซ้าย'], def: 10 }],
  pagenumbers: ORG.pagenumbers.schema,
  watermark: MISC.watermark.schema.filter((f) => !['type', 'scale'].includes(f.key)),
  compress: MISC.compress.schema, repair: [], pdfa: MISC.pdfa.schema,
  ocr: [{ key: 'langs', type: 'select', label: ['Language', 'ภาษา'], def: 'tha+eng', options: [['tha+eng', 'ไทย + English'], ['eng', 'English'], ['tha', 'ไทย']] }, { key: 'deskew', type: 'check', label: ['Deskew', 'ปรับเอียง'], def: false }],
  protect: MISC.protect.schema.filter((f) => f.key !== 'confirm'), unlock: [],
  metadata: [{ key: 'clear', type: 'check', label: ['Remove all metadata', 'ลบเมทาดาตาทั้งหมด'], def: true }],
  redact: [{ key: 'terms', type: 'textarea', label: ['Text to redact (one per line)', 'ข้อความที่จะลบ (บรรทัดละคำ)'], def: '' }],
  pdf2jpg: MISC.pdf2jpg.schema, pdf2word: [], pdf2pptx: MISC.pdf2pptx.schema, pdf2excel: MISC.pdf2excel.schema.filter((f) => f.key !== 'ocr'), pdf2md: [], pdf2txt: [],
};
const COLLECT = {
  crop: (o) => ({ unit: o.unit, margins: { top: o.top, right: o.right, bottom: o.bottom, left: o.left } }),
  metadata: (o) => ({ action: 'write', clear: !!o.clear, fields: {} }),
  redact: (o) => ({ terms: String(o.terms || '').split('\n').map((s) => s.trim()).filter(Boolean) }),
  protect: (o) => ({ ...o }),
};
const ORDER = ['merge', 'split', 'rotate', 'crop', 'pagenumbers', 'watermark', 'redact', 'ocr', 'repair', 'compress', 'pdfa', 'protect', 'unlock', 'metadata', 'pdf2jpg', 'pdf2word', 'pdf2pptx', 'pdf2excel', 'pdf2md', 'pdf2txt'];
const TERMINAL = new Set(['pdf2jpg', 'pdf2word', 'pdf2pptx', 'pdf2excel', 'pdf2md', 'pdf2txt']);

const PRESETS = [
  { name: ['Scan cleanup', 'ทำความสะอาดเอกสารสแกน'], desc: ['OCR then compress', 'OCR แล้วบีบอัด'], steps: [{ tool: 'ocr', opts: { langs: 'tha+eng' } }, { tool: 'compress', opts: { level: 'recommended' } }] },
  { name: ['Secure share', 'แชร์อย่างปลอดภัย'], desc: ['Watermark then password-protect', 'ใส่ลายน้ำแล้วใส่รหัสผ่าน'], steps: [{ tool: 'watermark', opts: { text: 'CONFIDENTIAL', opacity: 0.25, rotation: 45, size: 48, color: '#888888', font: 'sans', position: 'center', layer: 'over', pages: 'all' } }, { tool: 'protect', opts: { new_password: '', allow_print: true } }] },
  { name: ['Archive ready', 'พร้อมเก็บถาวร'], desc: ['Repair, compress, convert to PDF/A', 'ซ่อม บีบอัด แปลงเป็น PDF/A'], steps: [{ tool: 'repair', opts: {} }, { tool: 'compress', opts: { level: 'low' } }, { tool: 'pdfa', opts: { level: '2b' } }] },
  { name: ['Merge & number', 'รวมและใส่เลขหน้า'], desc: ['Merge files then add page numbers', 'รวมไฟล์แล้วใส่เลขหน้า'], steps: [{ tool: 'merge', opts: {} }, { tool: 'pagenumbers', opts: { position: 'bottom-center', format: 'หน้า {n} จาก {total}', style: 'thai', size: 11, color: '#222222', pages: 'all', first_number: 1 } }] },
  { name: ['Web-ready', 'พร้อมขึ้นเว็บ'], desc: ['Strong compression, no metadata', 'บีบอัดสูง ไม่มีเมทาดาตา'], steps: [{ tool: 'compress', opts: { level: 'extreme' } }, { tool: 'metadata', opts: { clear: true } }] },
];

const KEY = 'maxpdf.workflows';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
const save = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { toast(t('Could not save (storage blocked).', 'บันทึกไม่ได้ (ถูกบล็อกพื้นที่เก็บข้อมูล)')); } };

export async function mountWorkflows(host) {
  const caps = await capabilities();
  host.style.setProperty('--c', 'var(--c-flow)');
  let steps = []; let files = []; let name = '';
  const stepsEl = h('div'); const filesEl = h('div'); const saved = h('div.wrapflex'); const result = h('div');
  const addSel = h('select', { style: { width: 'auto' } }, h('option', { value: '' }, t('+ Add a step…', '+ เพิ่มขั้นตอน…')), ORDER.map((id) => { const d = byId(id, PDF_TOOLS); return h('option', { value: id }, tp(d.name)); }));
  addSel.addEventListener('change', () => { if (addSel.value) { steps.push({ id: uid(), tool: addSel.value, opts: {} }); addSel.value = ''; drawSteps(); } });
  function drawSteps() {
    clear(stepsEl);
    if (!steps.length) stepsEl.append(h('div.empty', t('No steps yet — pick a preset above or add a step.', 'ยังไม่มีขั้นตอน — เลือกชุดสำเร็จรูปด้านบนหรือเพิ่มขั้นตอน')));
    steps.forEach((s, i) => {
      const d = byId(s.tool, PDF_TOOLS); const sc = SCHEMAS[s.tool] || [];
      const last = i === steps.length - 1;
      stepsEl.append(h('div.wf-step', h('div.n', String(i + 1)), h('div.bd', h('div.row', { style: { justifyContent: 'flex-start' } }, h('span', { style: { color: 'var(--c-flow)' } }, ic(d.icon)), h('b', tp(d.name)), TERMINAL.has(s.tool) && !last ? h('span.badge.red', t('must be last', 'ต้องเป็นขั้นสุดท้าย')) : null), sc.length ? renderSchema(sc, s.opts, null) : h('div.small.muted', t('No options', 'ไม่มีตัวเลือก'))),
        h('div.wrapflex', { style: { flex: 'none' } }, h('button.btn.sm', { disabled: i === 0, onclick: () => { [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]]; drawSteps(); } }, '↑'), h('button.btn.sm', { disabled: last, onclick: () => { [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]]; drawSteps(); } }, '↓'), h('button.btn.sm.danger', { onclick: () => { steps.splice(i, 1); drawSteps(); } }, ic('trash')))));
    });
  }
  function drawSaved() {
    clear(saved); const l = load();
    l.forEach((w, i) => saved.append(h('span', { style: { display: 'inline-flex', gap: '2px' } }, h('button.btn.sm', { onclick: () => { steps = JSON.parse(JSON.stringify(w.steps)).map((s) => ({ ...s, id: uid() })); name = w.name; nameIn.value = name; drawSteps(); } }, ic('workflow'), w.name), h('button.btn.sm.ghost', { title: t('Delete', 'ลบ'), onclick: () => { l.splice(i, 1); save(l); drawSaved(); } }, '×'))));
    if (!l.length) saved.append(h('span.small.muted', t('Nothing saved yet.', 'ยังไม่มีที่บันทึกไว้')));
  }
  const nameIn = h('input', { type: 'text', placeholder: t('Workflow name', 'ชื่อเวิร์กโฟลว์'), oninput: (e) => { name = e.target.value; } });
  const input = h('input', { type: 'file', multiple: true, accept: '.pdf', hidden: true, onchange: (e) => { files = [...files, ...e.target.files]; e.target.value = ''; drawFiles(); } });
  function drawFiles() { clear(filesEl); files.forEach((f, i) => filesEl.append(h('div.row', { style: { justifyContent: 'flex-start', marginBottom: '4px' } }, ic('pdf'), h('span', f.name), h('span.muted.small.fix', fmtBytes(f.size)), h('button.btn.sm.ghost.fix', { onclick: () => { files.splice(i, 1); drawFiles(); } }, '×')))); }
  async function run() {
    clear(result);
    if (!steps.length) { toast(t('Add at least one step.', 'เพิ่มอย่างน้อยหนึ่งขั้นตอน')); return; }
    if (!files.length) { toast(t('Add PDF files first.', 'เพิ่มไฟล์ PDF ก่อน')); return; }
    for (let i = 0; i < steps.length - 1; i++) if (TERMINAL.has(steps[i].tool)) { toast(t('Conversion steps must be last.', 'ขั้นตอนแปลงไฟล์ต้องอยู่ท้ายสุด')); return; }
    for (const s of steps) if (s.tool === 'protect' && !s.opts.new_password) { toast(t('Set a password in the Protect step.', 'ตั้งรหัสผ่านในขั้นตอนใส่รหัสผ่าน')); return; }
    const payload = steps.map((s) => ({ tool: s.tool, opts: COLLECT[s.tool] ? COLLECT[s.tool](s.opts) : { ...s.opts } }));
    const bar = h('div.bar.indet', h('i')); const msg = h('div.muted.small');
    result.append(h('div.panel.center-box', h('b', t('Running workflow…', 'กำลังรันเวิร์กโฟลว์…')), bar, msg));
    runBtn.disabled = true;
    try {
      const job = await runJob('workflow', files, { steps: payload }, { onUpload: (p) => { msg.textContent = t('Uploading ', 'กำลังอัปโหลด ') + Math.round(p * 100) + '%'; }, onStatus: (j) => { msg.textContent = j.status === 'queued' ? t(`Queue position ${j.position}`, `ลำดับคิว ${j.position}`) : (j.progress?.msg || ''); } });
      clear(result); const mains = job.outputs.filter((o) => o.role === 'main');
      result.append(h('div.result', h('div.done-h', ic('check'), h('h2', t('Workflow complete', 'เวิร์กโฟลว์เสร็จแล้ว'))),
        mains.map((o) => h('div.outfile', ic('file'), h('div.nm', h('b', o.name), h('span', fmtBytes(o.size))), h('a.btn' + (mains.length === 1 ? '.primary' : ''), { href: fileUrl(job, o.index), download: o.name }, ic('download'), t('Download', 'ดาวน์โหลด')))),
        mains.length > 1 ? h('div.result-actions', h('a.btn.primary', { href: zipUrl(job), download: 'workflow_results.zip' }, ic('download'), t('Download all (ZIP)', 'ดาวน์โหลดทั้งหมด (ZIP)'))) : null,
        h('p.small.muted', t('Files are deleted automatically after a short time.', 'ไฟล์จะถูกลบอัตโนมัติหลังจากนี้ไม่นาน'))));
    } catch (e) { clear(result); result.append(h('div.alert.err', ic('warn'), e.message || String(e))); }
    runBtn.disabled = false;
  }
  const runBtn = h('button.btn.primary.big', { onclick: run }, ic('play'), t('Run workflow', 'รันเวิร์กโฟลว์'));
  host.append(
    h('div.tool-head', h('h1', t('Workflows', 'เวิร์กโฟลว์')), h('p', t('Chain tools together, save the recipe, and run it on any files in one go.', 'ต่อเครื่องมือเป็นสายงาน บันทึกสูตร แล้วรันกับไฟล์ใดก็ได้ในครั้งเดียว'))),
    h('div.sec-title', t('Start from a preset', 'เริ่มจากชุดสำเร็จรูป')),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: '10px' } }, PRESETS.map((p) => h('button.preset', { onclick: () => { steps = JSON.parse(JSON.stringify(p.steps)).map((s) => ({ ...s, id: uid() })); name = tp(p.name); nameIn.value = name; drawSteps(); stepsEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }, h('b', tp(p.name)), h('span.d', tp(p.desc)), h('div.flow', p.steps.map((s) => tp(byId(s.tool, PDF_TOOLS).name)).join(' → '))))),
    h('div.sec-title', t('Your workflow', 'เวิร์กโฟลว์ของคุณ')), stepsEl,
    h('div.row', { style: { margin: '6px 0 18px' } }, addSel, nameIn, h('button.btn.fix', { onclick: () => { if (!steps.length) return; const l = load(); const nm = (name || t('My workflow', 'เวิร์กโฟลว์ของฉัน')).slice(0, 40); const clean = steps.map(({ tool, opts }) => ({ tool, opts: tool === 'protect' ? { ...opts, new_password: '', confirm: '' } : opts })); const ix = l.findIndex((w) => w.name === nm); if (ix >= 0) l[ix] = { name: nm, steps: clean }; else l.unshift({ name: nm, steps: clean }); save(l); drawSaved(); toast(t('Saved on this device', 'บันทึกในเครื่องนี้แล้ว')); } }, ic('save'), t('Save', 'บันทึก'))),
    h('div.small.muted', t('Saved workflows (this device)', 'ที่บันทึกไว้ (ในเครื่องนี้)')), saved,
    h('div.sec-title', t('Files', 'ไฟล์')), h('div.panel', filesEl, input, h('button.btn', { onclick: () => input.click() }, ic('plus'), t('Add PDF files', 'เพิ่มไฟล์ PDF'))),
    h('div', { style: { margin: '18px 0', textAlign: 'center' } }, runBtn), result);
  drawSteps(); drawSaved();
}
