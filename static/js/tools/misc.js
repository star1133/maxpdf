import { h, ic, field, checkbox, segmented, select, clear, fmtBytes, copyText, downloadText, modal, toast } from '../ui.js';
import { t, tp } from '../i18n.js';
import { statRow } from '../toolkit.js';
import { runJob, fetchJobFile, fileUrl, capabilities } from '../api.js';
import { previewStage } from './organize.js';
import { renderToCanvas } from '../pdfview.js';

const lbl = (a, b) => [a, b];

export const compress = {
  init(p) { p.opts = { level: 'recommended', grayscale: false }; },
  schema: [
    { key: 'level', type: 'cards', label: ['Compression level', 'ระดับการบีบอัด'], def: 'recommended', options: [
      ['extreme', ['Extreme compression', 'บีบอัดสูงสุด'], ['Smallest file, lower quality', 'ไฟล์เล็กที่สุด คุณภาพต่ำลง']],
      ['recommended', ['Recommended', 'แนะนำ'], ['Good quality, good compression', 'คุณภาพดี บีบอัดดี']],
      ['low', ['Less compression', 'บีบอัดน้อย'], ['High quality, bigger file', 'คุณภาพสูง ไฟล์ใหญ่กว่า']],
      ['lossless', ['Lossless only', 'ไม่สูญเสียคุณภาพ'], ['Optimize structure, no image changes', 'ปรับโครงสร้างเท่านั้น ไม่แตะรูปภาพ']]] },
    { key: 'grayscale', type: 'check', label: ['Convert to grayscale', 'แปลงเป็นขาวดำ (เทา)'], def: false },
  ],
  summary(p, job) {
    const r = job.data.report || [];
    if (!r.length) return null;
    const before = r.reduce((a, x) => a + x.before, 0), after = r.reduce((a, x) => a + x.after, 0);
    const pct = before ? Math.round((1 - after / before) * 100) : 0;
    return h('div', h('p.sum', `${fmtBytes(before)} → ${fmtBytes(after)}` + (pct > 0 ? ` (−${pct}%)` : '')),
      pct <= 0 && h('div.alert.info', { style: { marginBottom: '12px' } }, ic('info'), t('This file is already well optimized, so it was left unchanged.', 'ไฟล์นี้ถูกบีบอัดมาดีอยู่แล้ว จึงคงไว้ตามเดิม')));
  },
  button: ['Compress PDF', 'บีบอัด PDF'], doneTitle: ['PDF compressed!', 'บีบอัด PDF เรียบร้อย!'],
};

export const repair = {
  summary: (p, job) => h('p.sum', t('Repaired using: ', 'ซ่อมด้วยวิธี: ') + (job.data.method || '') + ` · ${job.data.pages || '?'} ${t('pages', 'หน้า')}`),
  button: ['Repair PDF', 'ซ่อมแซม PDF'], doneTitle: ['PDF repaired!', 'ซ่อมแซม PDF เรียบร้อย!'],
};

export const ocr = {
  multiple: true,
  init(p) { p.opts = { langs: 'tha+eng', mode: 'skip', deskew: false, rotate: false, text: false }; },
  schema(p) {
    const have = p.caps.ocr_langs || [];
    const opts = [];
    if (have.includes('tha') && have.includes('eng')) opts.push(['tha+eng', ['Thai + English', 'ไทย + อังกฤษ']]);
    if (have.includes('eng')) opts.push(['eng', ['English', 'อังกฤษ']]);
    if (have.includes('tha')) opts.push(['tha', ['Thai', 'ไทย']]);
    return [
      { key: 'langs', type: 'select', label: ['Document language', 'ภาษาของเอกสาร'], def: opts[0]?.[0] || 'eng', options: opts },
      { key: 'mode', type: 'select', label: ['If pages already have text', 'ถ้าหน้ามีข้อความอยู่แล้ว'], def: 'skip', options: [['skip', ['Skip those pages', 'ข้ามหน้านั้น']], ['redo', ['Redo OCR on them', 'ทำ OCR ใหม่']], ['force', ['Rasterize and OCR everything', 'แปลงเป็นภาพแล้ว OCR ทั้งหมด']]] },
      { key: 'deskew', type: 'check', label: ['Straighten crooked scans (deskew)', 'ปรับสแกนที่เอียงให้ตรง'], def: false },
      { key: 'rotate', type: 'check', label: ['Auto-rotate pages', 'หมุนหน้าอัตโนมัติ'], def: false },
      { key: 'text', type: 'check', label: ['Also give me a .txt file', 'ขอไฟล์ .txt ด้วย'], def: false },
    ];
  },
  button: ['Run OCR', 'เริ่ม OCR'], doneTitle: ['OCR complete!', 'OCR เสร็จแล้ว!'],
};

export const pdfa = {
  multiple: true,
  schema: [{ key: 'level', type: 'select', label: ['Conformance level', 'ระดับมาตรฐาน'], def: '2b', options: [['1b', 'PDF/A-1b'], ['2b', 'PDF/A-2b'], ['3b', 'PDF/A-3b']] }],
  summary: (p, job) => h('div.small.muted', t('Fonts are embedded and colours converted to sRGB. For strict certification validate with veraPDF.', 'ฝังฟอนต์และแปลงสีเป็น sRGB หากต้องการรับรองอย่างเข้มงวดควรตรวจด้วย veraPDF')),
  button: ['Convert to PDF/A', 'แปลงเป็น PDF/A'], doneTitle: ['Converted to PDF/A!', 'แปลงเป็น PDF/A แล้ว!'],
};

const offices = (btn, doneEn, doneTh) => ({ multiple: true, button: btn, doneTitle: [doneEn, doneTh] });
export const word2pdf = offices(['Convert to PDF', 'แปลงเป็น PDF'], 'Converted!', 'แปลงเรียบร้อย!');
export const ppt2pdf = offices(['Convert to PDF', 'แปลงเป็น PDF'], 'Converted!', 'แปลงเรียบร้อย!');
export const excel2pdf = { ...offices(['Convert to PDF', 'แปลงเป็น PDF'], 'Converted!', 'แปลงเรียบร้อย!'),
  schema: [{ key: 'fit_width', type: 'check', label: ['Fit every sheet to one page wide', 'ย่อทุกชีตให้พอดีความกว้างหน้ากระดาษ'], def: false, help: ['Only for .xlsx; charts and images may be dropped.', 'เฉพาะ .xlsx — กราฟและรูปอาจหาย']}] };

const ocrOpt = { key: 'ocr', type: 'check', label: ['Scanned PDF? Run OCR first', 'เป็น PDF สแกน? ทำ OCR ก่อน'], def: false, help: ['Needed when the file has no selectable text.', 'จำเป็นเมื่อไฟล์ไม่มีข้อความที่เลือกได้']};
const pagesOpt = { key: 'pages', type: 'text', label: ['Pages', 'หน้าที่ต้องการ'], def: 'all', placeholder: 'all, 1-5', help: ['e.g. all, 1-5, 8', 'เช่น all, 1-5, 8'] };
export const pdf2word = { schema: [pagesOpt, ocrOpt], button: ['Convert to Word', 'แปลงเป็น Word'], doneTitle: ['Converted to Word!', 'แปลงเป็น Word แล้ว!'],
  onError(p, e) { if (e.code === 'scanned') p.error(t('This PDF looks scanned. Tick “Run OCR first” and try again.', 'PDF นี้เป็นภาพสแกน ติ๊ก “ทำ OCR ก่อน” แล้วลองอีกครั้ง')); } };
export const pdf2pptx = { schema: [{ key: 'mode', type: 'cards', label: ['Slide content', 'เนื้อหาสไลด์'], def: 'editable', options: [['editable', ['Editable text', 'ข้อความแก้ไขได้'], ['Text boxes over a clean background', 'กล่องข้อความบนพื้นหลังที่ลบข้อความออกแล้ว']], ['image', ['Page images', 'ภาพทั้งหน้า'], ['Pixel-perfect look, not editable', 'หน้าตาเหมือนต้นฉบับ แต่แก้ไขไม่ได้']]] }, pagesOpt], button: ['Convert to PowerPoint', 'แปลงเป็น PowerPoint'], doneTitle: ['Converted to PowerPoint!', 'แปลงเป็น PowerPoint แล้ว!'] };
export const pdf2excel = { schema: [
  { key: 'layout', type: 'select', label: ['Sheets', 'ชีต'], def: 'table', options: [['table', ['One sheet per table', 'หนึ่งตารางต่อหนึ่งชีต']], ['page', ['One sheet per page', 'หนึ่งหน้าต่อหนึ่งชีต']], ['single', ['Everything on one sheet', 'ทั้งหมดในชีตเดียว']]] },
  { key: 'strategy', type: 'select', label: ['Table detection', 'วิธีตรวจจับตาราง'], def: 'lines', options: [['lines', ['Ruled tables (lines)', 'ตารางมีเส้น']], ['text', ['Borderless (by text alignment)', 'ตารางไม่มีเส้น']]] },
  pagesOpt, ocrOpt], summary: (p, job) => h('p.muted', t(`${job.data.tables || 0} tables extracted`, `ดึงตารางได้ ${job.data.tables || 0} ตาราง`)), button: ['Convert to Excel', 'แปลงเป็น Excel'], doneTitle: ['Converted to Excel!', 'แปลงเป็น Excel แล้ว!'] };
export const pdf2md = { schema: [pagesOpt, { key: 'images', type: 'check', label: ['Extract images too (ZIP)', 'ดึงรูปภาพด้วย (ZIP)'], def: false }, ocrOpt], button: ['Convert to Markdown', 'แปลงเป็น Markdown'], doneTitle: ['Converted to Markdown!', 'แปลงเป็น Markdown แล้ว!'] };
export const pdf2txt = { schema: [pagesOpt], button: ['Extract text', 'ดึงข้อความ'], doneTitle: ['Text extracted!', 'ดึงข้อความแล้ว!'] };

export const pdf2jpg = {
  init(p) { p.opts = { mode: 'pages', format: 'jpg', dpi: 150, quality: 88, pages: 'all' }; },
  schema: [
    { key: 'mode', type: 'seg', label: ['Convert', 'แปลง'], def: 'pages', options: [['pages', ['Every page', 'ทุกหน้า']], ['images', ['Extract images', 'ดึงรูปที่ฝัง']]] },
    { key: 'format', type: 'seg', label: ['Format', 'ชนิดไฟล์'], def: 'jpg', options: [['jpg', 'JPG'], ['png', 'PNG']], show: (o) => o.mode === 'pages' },
    { key: 'dpi', type: 'select', label: ['Quality (DPI)', 'ความละเอียด (DPI)'], def: 150, options: [[72, ['72 — web', '72 — เว็บ']], [150, ['150 — standard', '150 — มาตรฐาน']], [220, ['220 — high', '220 — สูง']], [300, ['300 — print', '300 — พิมพ์']]], show: (o) => o.mode === 'pages' },
    { key: 'quality', type: 'range', label: ['JPG quality', 'คุณภาพ JPG'], def: 88, min: 40, max: 100, show: (o) => o.mode === 'pages' && o.format === 'jpg' },
    { key: 'pages', type: 'text', label: ['Pages', 'หน้า'], def: 'all', show: (o) => o.mode === 'pages' },
  ],
  button: ['Convert to image', 'แปลงเป็นรูปภาพ'], doneTitle: ['Converted!', 'แปลงเรียบร้อย!'],
};

export const jpg2pdf = {
  init(p) { p.opts = { orientation: 'auto', page_size: 'fit', margin: 'none', merge: true }; },
  multiple: true,
  schema: [
    { key: 'page_size', type: 'select', label: ['Page size', 'ขนาดกระดาษ'], def: 'fit', options: [['fit', ['Same as image', 'เท่ากับรูปภาพ']], ['a4', 'A4'], ['letter', 'Letter']] },
    { key: 'orientation', type: 'seg', label: ['Orientation', 'แนวหน้ากระดาษ'], def: 'auto', options: [['auto', ['Auto', 'อัตโนมัติ']], ['portrait', ['Portrait', 'แนวตั้ง']], ['landscape', ['Landscape', 'แนวนอน']]], show: (o) => o.page_size !== 'fit' },
    { key: 'margin', type: 'seg', label: ['Margin', 'ขอบ'], def: 'none', options: [['none', ['None', 'ไม่มี']], ['small', ['Small', 'เล็ก']], ['big', ['Big', 'ใหญ่']]] },
    { key: 'merge', type: 'check', label: ['Merge all images into one PDF', 'รวมทุกรูปเป็น PDF เดียว'], def: true },
  ],
  button: ['Convert to PDF', 'แปลงเป็น PDF'], doneTitle: ['Images converted!', 'แปลงรูปเป็น PDF แล้ว!'],
};

// ---- Scan: camera capture + filters
export const scan = {
  multiple: true,
  init(p) { p.opts = { filter: 'enhance', page_size: 'a4', margin: 'none', orientation: 'auto' }; },
  schema: [
    { key: 'filter', type: 'cards', label: ['Scan filter', 'ฟิลเตอร์สแกน'], def: 'enhance', options: [['enhance', ['Enhance document', 'ปรับให้เอกสารคมชัด'], ['Greyscale, contrast, sharpen', 'ขาวดำ ปรับคอนทราสต์ เพิ่มความคม']], ['bw', ['Black & white', 'ขาวดำสนิท'], ['Best for text pages', 'เหมาะกับหน้าข้อความ']], ['gray', ['Grayscale', 'โทนสีเทา']], ['none', ['Original colours', 'สีเดิม']]] },
    { key: 'page_size', type: 'select', label: ['Page size', 'ขนาดกระดาษ'], def: 'a4', options: [['a4', 'A4'], ['letter', 'Letter'], ['fit', ['Same as image', 'เท่ากับรูปภาพ']]] },
  ],
  pickExtra(p) {
    const cam = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { p.addFiles([...e.target.files]); e.target.value = ''; } });
    return h('div', { style: { textAlign: 'center', marginTop: '16px' } }, cam, h('button.btn', { onclick: () => openCamera(p) }, ic('camera'), t('Use camera', 'ใช้กล้องถ่าย')), ' ', h('button.btn', { onclick: () => cam.click() }, ic('image'), t('Take photo (phone)', 'ถ่ายภาพ (มือถือ)')));
  },
  controls(p) {
    const input = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => { p.addFiles([...e.target.files]); e.target.value = ''; } });
    return h('div', input, h('button.btn.sm.block', { onclick: () => openCamera(p) }, ic('camera'), t('Capture another page', 'ถ่ายหน้าถัดไป')));
  },
  button: ['Create PDF', 'สร้าง PDF'], doneTitle: ['Scan saved as PDF!', 'บันทึกสแกนเป็น PDF แล้ว!'],
};
async function openCamera(p) {
  let stream;
  const video = h('video', { autoplay: true, playsinline: true, muted: true, style: { width: '100%', borderRadius: '10px', background: '#000' } });
  try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 2560 } }, audio: false }); }
  catch { toast(t('Camera not available. Use “Take photo” instead.', 'ใช้กล้องไม่ได้ ลองใช้ “ถ่ายภาพ” แทน')); return; }
  video.srcObject = stream;
  let n = 0;
  const shots = h('div.small.muted', '');
  const snap = () => {
    const c = h('canvas'); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext('2d').drawImage(video, 0, 0);
    c.toBlob((b) => { n++; shots.textContent = t(`${n} captured`, `ถ่ายแล้ว ${n} ภาพ`); p.addFiles([new File([b], `scan_${Date.now()}_${n}.jpg`, { type: 'image/jpeg' })]); }, 'image/jpeg', 0.92);
  };
  await modal({ title: t('Camera', 'กล้อง'), body: h('div', video, h('div.row', { style: { marginTop: '10px' } }, h('button.btn.primary.block', { onclick: snap }, ic('camera'), t('Capture', 'ถ่าย')), shots)), buttons: [{ label: t('Done', 'เสร็จ'), primary: true, value: true }] });
  stream.getTracks().forEach((tr) => tr.stop());
}

// ---- Security
export const unlock = {
  multiple: true,
  controls(p) { return h('div.alert.info', ic('info'), t('Only unlock files you own or have permission to open. Encrypted files will ask for their password.', 'ปลดล็อกเฉพาะไฟล์ที่คุณเป็นเจ้าของหรือได้รับอนุญาต ไฟล์ที่เข้ารหัสจะถามรหัสผ่าน')); },
  button: ['Unlock PDF', 'ปลดล็อก PDF'], doneTitle: ['PDF unlocked!', 'ปลดล็อก PDF แล้ว!'],
};
export const protect = {
  multiple: true,
  init(p) { p.opts = { new_password: '', owner_password: '', allow_print: true, allow_copy: false, allow_edit: false, encryption: 'aes256' }; },
  schema: [
    { key: 'new_password', type: 'password', label: ['Password to open', 'รหัสผ่านสำหรับเปิดไฟล์'], def: '' },
    { key: 'confirm', type: 'password', label: ['Repeat password', 'ยืนยันรหัสผ่าน'], def: '' },
    { key: 'allow_print', type: 'check', label: ['Allow printing', 'อนุญาตให้พิมพ์'], def: true },
    { key: 'allow_copy', type: 'check', label: ['Allow copying text', 'อนุญาตให้คัดลอกข้อความ'], def: false },
    { key: 'allow_edit', type: 'check', label: ['Allow editing', 'อนุญาตให้แก้ไข'], def: false },
    { key: 'encryption', type: 'seg', label: ['Encryption', 'การเข้ารหัส'], def: 'aes256', options: [['aes256', 'AES-256'], ['aes128', 'AES-128']] },
  ],
  collect(p) { const o = { ...p.opts }; delete o.confirm; return o; },
  validate(p) { if (!p.opts.new_password) return t('Enter a password.', 'กรอกรหัสผ่าน'); if (p.opts.new_password !== p.opts.confirm) return t('Passwords do not match.', 'รหัสผ่านไม่ตรงกัน'); },
  summary: () => h('div.alert.warn', { style: { textAlign: 'left' } }, ic('warn'), t('Remember your password — it cannot be recovered.', 'จำรหัสผ่านไว้ให้ดี — กู้คืนไม่ได้')),
  button: ['Protect PDF', 'ใส่รหัสผ่าน'], doneTitle: ['PDF protected!', 'ใส่รหัสผ่านแล้ว!'],
};

// ---- Watermark
export const watermark = {
  accept: ['pdf'],
  init(p) { p.opts = { type: 'text', text: 'CONFIDENTIAL', font: 'sans', size: 48, color: '#888888', opacity: 0.3, rotation: 45, position: 'center', layer: 'over', pages: 'all', scale: 40, bold: true }; p.wmImage = null; },
  schema: [
    { key: 'type', type: 'seg', label: ['Type', 'ชนิด'], def: 'text', options: [['text', ['Text', 'ข้อความ']], ['image', ['Image', 'รูปภาพ']]] },
    { key: 'text', type: 'text', label: ['Text', 'ข้อความ'], def: 'CONFIDENTIAL', show: (o) => o.type === 'text' },
    { key: 'font', type: 'seg', label: ['Font', 'ฟอนต์'], def: 'sans', options: [['sans', 'Sans'], ['serif', 'Serif'], ['mono', 'Mono']], show: (o) => o.type === 'text' },
    { key: 'size', type: 'range', label: ['Size', 'ขนาด'], def: 48, min: 12, max: 140, unit: 'pt', show: (o) => o.type === 'text' },
    { key: 'color', type: 'color', label: ['Colour', 'สี'], def: '#888888', show: (o) => o.type === 'text' },
    { key: 'scale', type: 'range', label: ['Image width', 'ความกว้างรูป'], def: 40, min: 5, max: 100, unit: '%', show: (o) => o.type === 'image' },
    { key: 'opacity', type: 'range', label: ['Opacity', 'ความโปร่งใส'], def: 0.3, min: 0.05, max: 1, step: 0.05 },
    { key: 'rotation', type: 'range', label: ['Rotation', 'การหมุน'], def: 45, min: -90, max: 90, unit: '°' },
    { key: 'position', type: 'select', label: ['Position', 'ตำแหน่ง'], def: 'center', options: [['center', ['Centre', 'กึ่งกลาง']], ['tile', ['Tiled (mosaic)', 'ปูทั่วหน้า']], ['top-center', ['Top', 'บน']], ['bottom-center', ['Bottom', 'ล่าง']]] },
    { key: 'layer', type: 'seg', label: ['Layer', 'ชั้น'], def: 'over', options: [['over', ['Over content', 'ทับเนื้อหา']], ['under', ['Under content', 'ใต้เนื้อหา']]] },
    { key: 'pages', type: 'text', label: ['Pages', 'หน้า'], def: 'all' },
  ],
  controls(p) {
    const input = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: (e) => { p.wmImage = e.target.files[0] || null; p.redrawPreview && p.redrawPreview(); } });
    const box = h('div', field(['Watermark image', 'รูปลายน้ำ'], input, ['PNG with transparency works best.', 'แนะนำ PNG พื้นโปร่งใส']));
    const upd = () => box.classList.toggle('hidden', p.opts.type !== 'image');
    p._wmToggle = upd; upd();
    return box;
  },
  onOpts(p) { p._wmToggle && p._wmToggle(); p.redrawPreview && p.redrawPreview(); },
  validate(p) { if (p.opts.type === 'image' && !p.wmImage) return t('Choose a watermark image.', 'เลือกรูปลายน้ำ'); if (p.opts.type === 'text' && !String(p.opts.text).trim()) return t('Enter the watermark text.', 'กรอกข้อความลายน้ำ'); },
  extraFiles(p) { return p.opts.type === 'image' && p.wmImage ? [p.wmImage] : []; },
  stage(p, stage) {
    let img = null;
    previewStage(p, stage, (c, w, hh, S) => {
      const o = p.opts;
      c.save(); c.globalAlpha = o.opacity;
      const place = (cx, cy) => {
        c.save(); c.translate(cx, cy); c.rotate(-o.rotation * Math.PI / 180);
        if (o.type === 'text') { c.font = `${o.bold ? 'bold ' : ''}${o.size * S}px ${o.font === 'serif' ? 'serif' : o.font === 'mono' ? 'monospace' : '"IBM Plex Sans Thai", sans-serif'}`; c.fillStyle = o.color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(o.text, 0, 0); }
        else if (img && img.complete) { const iw = w * o.scale / 100; c.drawImage(img, -iw / 2, -iw * img.height / img.width / 2, iw, iw * img.height / img.width); }
        c.restore();
      };
      if (o.type === 'image' && p.wmImage && (!img || img._f !== p.wmImage)) { img = new Image(); img._f = p.wmImage; img.onload = () => p.redrawPreview(); img.src = URL.createObjectURL(p.wmImage); }
      if (o.position === 'tile') { const gx = (o.type === 'text' ? o.size * S * Math.max(4, String(o.text).length * 0.6) : w * o.scale / 100) * 1.5, gy = (o.type === 'text' ? o.size * S * 3 : w * o.scale / 100) * 1.2; for (let y = gy / 2, r = 0; y < hh + gy; y += gy, r++) for (let x = gx / 2 - (r % 2 ? gx / 2 : 0); x < w + gx; x += gx) place(x, y); }
      else place(w / 2, o.position === 'top-center' ? hh * 0.08 : o.position === 'bottom-center' ? hh * 0.92 : hh / 2);
      c.restore();
    });
  },
  button: ['Add watermark', 'ใส่ลายน้ำ'], doneTitle: ['Watermark added!', 'ใส่ลายน้ำแล้ว!'],
};

// ---- Metadata
export const metadata = {
  init(p) { p.opts = {}; p.meta = {}; p.clear = false; },
  stage(p, stage) {
    const f = p.files[0];
    const form = h('div.panel', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('div.muted', t('Reading properties…', 'กำลังอ่านคุณสมบัติ…')));
    stage.append(form);
    runJob('metadata', [f.file], { action: 'read', password: f.password }, {}).then((job) => {
      const m = job.data.metadata || {};
      clear(form);
      for (const [k, th] of [['title', 'ชื่อเรื่อง'], ['author', 'ผู้เขียน'], ['subject', 'หัวข้อ'], ['keywords', 'คำสำคัญ'], ['creator', 'โปรแกรมสร้าง'], ['producer', 'โปรแกรมแปลง']]) {
        p.meta[k] = m[k] || '';
        form.append(field([k[0].toUpperCase() + k.slice(1), th], h('input', { type: 'text', value: p.meta[k], oninput: (e) => { p.meta[k] = e.target.value; } })));
      }
      form.append(h('div.small.muted', `${job.data.pages} ${t('pages', 'หน้า')}`));
    }).catch((e) => { clear(form); form.append(h('div.alert.err', e.message)); });
  },
  controls(p) { return checkbox(['Remove all metadata', 'ลบข้อมูลเมทาดาตาทั้งหมด'], false, (v) => { p.clear = v; }); },
  collect(p) { return { action: 'write', fields: p.meta, clear: p.clear }; },
  button: ['Save properties', 'บันทึกคุณสมบัติ'], doneTitle: ['Properties saved!', 'บันทึกคุณสมบัติแล้ว!'],
};

// ---- HTML to PDF
export const html2pdf = {
  noFiles: true,
  serverSide: true,
  init(p) { p.opts = { tab: 'url', url: '', html: '', page_size: 'A4', orientation: 'portrait', margin: 10, single_page: false, viewport: 1280, background: true, media: 'print', wait: 0 }; p.htmlFile = null; },
  stage(p, stage) {
    const pane = h('div');
    const draw = () => {
      clear(pane);
      if (p.opts.tab === 'url') pane.append(field(['Web page address', 'ที่อยู่เว็บเพจ'], h('input', { type: 'url', placeholder: 'https://example.com/page', value: p.opts.url, oninput: (e) => { p.opts.url = e.target.value; } }), ['Public websites only.', 'รองรับเฉพาะเว็บไซต์สาธารณะ']));
      else if (p.opts.tab === 'html') pane.append(field(['HTML source', 'โค้ด HTML'], h('textarea', { rows: 14, placeholder: '<h1>Hello</h1>', style: { fontFamily: 'var(--mono)' }, oninput: (e) => { p.opts.html = e.target.value; } }, p.opts.html)));
      else pane.append(field(['HTML file', 'ไฟล์ HTML'], h('input', { type: 'file', accept: '.html,.htm', onchange: (e) => { p.htmlFile = e.target.files[0] || null; } })));
    };
    stage.append(h('div.panel', segmented([['url', 'URL'], ['html', ['Paste HTML', 'วาง HTML']], ['file', ['Upload file', 'อัปโหลดไฟล์']]], p.opts.tab, (v) => { p.opts.tab = v; draw(); }), h('div', { style: { height: '14px' } }), pane));
    draw();
  },
  schema: [
    { key: 'page_size', type: 'select', label: ['Page size', 'ขนาดกระดาษ'], def: 'A4', options: ['A4', 'A3', 'A5', 'Letter', 'Legal'], show: (o) => !o.single_page },
    { key: 'orientation', type: 'seg', label: ['Orientation', 'แนวหน้ากระดาษ'], def: 'portrait', options: [['portrait', ['Portrait', 'แนวตั้ง']], ['landscape', ['Landscape', 'แนวนอน']]], show: (o) => !o.single_page },
    { key: 'margin', type: 'number', label: ['Margin (mm)', 'ขอบ (มม.)'], def: 10, min: 0, max: 50, show: (o) => !o.single_page },
    { key: 'single_page', type: 'check', label: ['One long page (no page breaks)', 'หน้าเดียวยาว (ไม่ตัดหน้า)'], def: false },
    { key: 'media', type: 'seg', label: ['Style', 'สไตล์'], def: 'print', options: [['print', ['Print', 'พิมพ์']], ['screen', ['Screen', 'หน้าจอ']]] },
    { key: 'viewport', type: 'number', label: ['Window width (px)', 'ความกว้างหน้าต่าง (px)'], def: 1280, min: 320, max: 2400 },
    { key: 'wait', type: 'number', label: ['Extra wait (seconds)', 'รอเพิ่ม (วินาที)'], def: 0, min: 0, max: 10 },
    { key: 'background', type: 'check', label: ['Print backgrounds', 'พิมพ์สีพื้นหลัง'], def: true },
  ],
  buildFiles(p) { return p.opts.tab === 'file' && p.htmlFile ? [p.htmlFile] : []; },
  collect(p) { const o = { ...p.opts }; if (o.tab !== 'url') delete o.url; if (o.tab !== 'html') delete o.html; delete o.tab; return o; },
  validate(p) {
    if (p.opts.tab === 'url' && !/^https?:\/\//i.test(p.opts.url.trim())) return t('Enter a full address starting with http:// or https://', 'กรอกที่อยู่เต็ม ขึ้นต้นด้วย http:// หรือ https://');
    if (p.opts.tab === 'html' && !p.opts.html.trim()) return t('Paste some HTML first.', 'วาง HTML ก่อน');
    if (p.opts.tab === 'file' && !p.htmlFile) return t('Choose an HTML file.', 'เลือกไฟล์ HTML');
  },
  button: ['Convert to PDF', 'แปลงเป็น PDF'], doneTitle: ['Page converted!', 'แปลงเพจเรียบร้อย!'],
};

// ---- AI: summarize / translate
const LANGS = ['Thai', 'English', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Vietnamese', 'Indonesian', 'Malay', 'French', 'German', 'Spanish', 'Portuguese', 'Russian', 'Arabic', 'Hindi', 'Italian'];
export const summarize = {
  noFiles: true, accept: ['pdf', 'docx', 'txt', 'md'], multiple: false,
  init(p) { p.opts = { text: '', length: 'medium', style: 'bullets', language: 'auto' }; p.sumFile = null; },
  stage(p, stage) {
    stage.append(h('div.panel', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
      !p.caps.ai && h('div.alert.info', ic('info'), t('AI is not connected on this server yet, so a basic extractive summary is used (works best for English).', 'เซิร์ฟเวอร์ยังไม่ได้เชื่อมต่อ AI จึงใช้การสรุปแบบพื้นฐาน (เหมาะกับภาษาอังกฤษ)')),
      field(['Paste text', 'วางข้อความ'], h('textarea', { rows: 12, placeholder: t('Paste an article, essay or notes…', 'วางบทความ เรียงความ หรือโน้ต…'), oninput: (e) => { p.opts.text = e.target.value; } })),
      field(['…or upload a file', '…หรืออัปโหลดไฟล์'], h('input', { type: 'file', accept: '.pdf,.docx,.txt,.md', onchange: (e) => { p.sumFile = e.target.files[0] || null; } }), ['PDF, DOCX, TXT or MD', 'PDF DOCX TXT หรือ MD'])));
  },
  schema: [
    { key: 'length', type: 'seg', label: ['Length', 'ความยาว'], def: 'medium', options: [['short', ['Short', 'สั้น']], ['medium', ['Medium', 'กลาง']], ['long', ['Long', 'ยาว']]] },
    { key: 'style', type: 'seg', label: ['Style', 'รูปแบบ'], def: 'bullets', options: [['bullets', ['Bullets', 'หัวข้อย่อย']], ['paragraph', ['Paragraph', 'ย่อหน้า']]] },
    { key: 'language', type: 'select', label: ['Summary language', 'ภาษาของสรุป'], def: 'auto', options: [['auto', ['Same as source', 'เหมือนต้นฉบับ']], ...LANGS.map((l) => [l, l])] },
  ],
  buildFiles(p) { return p.sumFile ? [p.sumFile] : []; },
  validate(p) { if (!p.opts.text.trim() && !p.sumFile) return t('Paste text or choose a file.', 'วางข้อความหรือเลือกไฟล์'); },
  onResult(p, job, body) {
    const s = job.data.summary || '';
    body.append(h('div.result', { style: { maxWidth: '760px', textAlign: 'left' } },
      h('h2', { style: { textAlign: 'center' } }, t('Summary', 'สรุป')),
      job.data.mode === 'extractive' && h('div.alert.info', { style: { marginBottom: '12px' } }, ic('info'), t('Basic summary (no AI configured).', 'สรุปแบบพื้นฐาน (ยังไม่ได้เชื่อมต่อ AI)')),
      h('div.outbox', { style: { whiteSpace: 'pre-wrap', fontFamily: 'var(--font)', fontSize: '15px' } }, s),
      h('div.row', { style: { marginTop: '14px', justifyContent: 'center' } }, h('button.btn.primary', { onclick: () => copyText(s) }, ic('copy'), t('Copy', 'คัดลอก')), h('button.btn', { onclick: () => downloadText(s, 'summary.txt') }, ic('download'), '.txt'), h('button.btn', { onclick: () => p.renderAll() }, ic('arrowL'), t('Back', 'กลับ')))));
    return true;
  },
  button: ['Summarize', 'สรุป'],
};

export const translate = {
  init(p) { p.opts = { target: 'Thai', pages: 'all' }; },
  schema: [
    { key: 'target', type: 'select', label: ['Translate into', 'แปลเป็นภาษา'], def: 'Thai', options: LANGS.map((l) => [l, l]) },
    { key: 'pages', type: 'text', label: ['Pages', 'หน้า'], def: 'all', help: ['Up to 60 pages per run.', 'สูงสุด 60 หน้าต่อครั้ง'] },
  ],
  controls(p) { return !p.caps.ai ? h('div.alert.warn', ic('warn'), t('AI translation is not configured on this server yet.', 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า AI สำหรับแปลภาษา')) : null; },
  afterRender(p) { if (!p.caps.ai) p.runBtn.disabled = true; },
  onError(p, e) { if (e.code === 'scanned') p.error(t('No text layer found. Run OCR first, then translate.', 'ไม่พบข้อความในไฟล์ ให้ทำ OCR ก่อนแล้วจึงแปล')); },
  button: ['Translate PDF', 'แปลภาษา PDF'], doneTitle: ['Translated!', 'แปลเรียบร้อย!'],
};

// ---- Compare
export const compare = {
  multiple: true, minFiles: 2,
  sortable: false,
  stage(p, stage) {
    p.defaultStage(stage);
    stage.append(h('div.small.muted', { style: { marginTop: '10px' } }, t('Add exactly two PDFs: the original first, then the changed version.', 'เพิ่ม PDF สองไฟล์: ต้นฉบับก่อน แล้วตามด้วยฉบับที่แก้ไข')));
  },
  validate(p) { if (p.files.length !== 2) return t('Select exactly two PDF files.', 'เลือก PDF สองไฟล์พอดี'); },
  onResult(p, job, body) {
    const d = job.data; const pages = d.pages || [];
    const box = h('div', { style: { maxWidth: '980px', margin: '0 auto' } },
      h('div.result', h('div.done-h', ic('check'), h('h2', d.changed_pages ? t(`${d.changed_pages} page(s) differ`, `พบความแตกต่าง ${d.changed_pages} หน้า`) : t('No differences found', 'ไม่พบความแตกต่าง'))),
        statRow([[d.total_a, t('pages in A', 'หน้าในไฟล์ A')], [d.total_b, t('pages in B', 'หน้าในไฟล์ B')], [d.changed_pages, t('changed', 'ที่เปลี่ยน')]]),
        h('div.result-actions', h('button.btn', { onclick: () => p.renderWork() }, ic('arrowL'), t('Compare other files', 'เทียบไฟล์อื่น')))));
    pages.filter((x) => x.changed).forEach((pg) => {
      const det = h('details.cmp-page', h('summary', h('span', t('Page ', 'หน้า ') + pg.page), !pg.in_a && h('span.badge.red', t('only in B', 'มีเฉพาะใน B')), !pg.in_b && h('span.badge.red', t('only in A', 'มีเฉพาะใน A')), pg.visual > 0 && h('span.badge', pg.visual + '% ' + t('visual', 'ภาพต่าง'))));
      const bodyEl = h('div.cmp-body');
      det.append(bodyEl);
      let built = false;
      det.addEventListener('toggle', () => {
        if (!det.open || built) return; built = true;
        const segs = (pg.text || []).filter((s) => s[0] !== 'eq' || s[1].length < 200);
        if (segs.some((s) => s[0] !== 'eq')) bodyEl.append(h('div.outbox', { style: { fontFamily: 'var(--font)', fontSize: '14px' } }, pg.text.map((s) => s[0] === 'eq' ? s[1] + ' ' : h('span.diff-' + s[0], s[1] + ' '))));
        const imgs = h('div.cmp-imgs');
        const mk = (cap, doc, n) => { const c = h('canvas'); renderToCanvas(doc, n, c, { maxW: 320, maxH: 450, dpr: 1 }).catch(() => {}); return h('figure', h('figcaption', cap), c); };
        if (pg.in_a) imgs.append(mk('A', p.files[0].doc, pg.page));
        if (pg.in_b) imgs.append(mk('B', p.files[1].doc, pg.page));
        if (pg.image != null) imgs.append(h('figure', h('figcaption', t('Differences (red)', 'ส่วนที่ต่าง (สีแดง)')), h('img', { src: fileUrl(job, pg.image, true), alt: '' })));
        bodyEl.append(imgs);
      });
      box.append(det);
    });
    body.append(box);
    return true;
  },
  button: ['Compare', 'เปรียบเทียบ'],
};
