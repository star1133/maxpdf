import { h, ic, field, t, tp, bar, btn, sel, num, chk, copyText, fileInput, readFileDataURL, loadScript, downloadText } from './common.js';
import { fmtBytes, downloadBlob } from '../ui.js';

const toBlob = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));

export function imgCompress(root) {
  let items = []; let o = { fmt: 'image/webp', q: 80, maxW: 1600, keepSize: false };
  const list = h('div.filelist'); const info = h('div.small.muted');
  const process = async (f) => {
    const bmp = await createImageBitmap(f); let w = bmp.width, hh = bmp.height;
    if (!o.keepSize && o.maxW && w > o.maxW) { hh = Math.round(hh * o.maxW / w); w = o.maxW; }
    const c = h('canvas'); c.width = w; c.height = hh; const x = c.getContext('2d'); if (o.fmt === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, w, hh); } x.drawImage(bmp, 0, 0, w, hh);
    const blob = await toBlob(c, o.fmt, o.fmt === 'image/png' ? undefined : o.q / 100); return { blob, w, h: hh };
  };
  const render = async () => {
    list.replaceChildren(); for (const it of items) { it.res = await process(it.file); const ext = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }[o.fmt]; const name = it.file.name.replace(/\.[^.]+$/, '') + '.' + ext; it.name = name; const url = URL.createObjectURL(it.res.blob);
      list.append(h('div.fcard', { style: { cursor: 'default' } }, h('img.pv', { src: url, alt: '' }), h('div.nm', name), h('div.sz', `${it.res.w}×${it.res.h} · ${fmtBytes(it.file.size)} → ${fmtBytes(it.res.blob.size)} (${Math.round((1 - it.res.blob.size / it.file.size) * 100)}%)`), h('a.btn.sm', { href: url, download: name, style: { marginTop: '6px' } }, ic('download')))); }
    info.textContent = items.length ? t(`${items.length} image(s)`, `${items.length} รูป`) : '';
  };
  const dz = h('div.drop', { style: { padding: '30px' }, ondragover: (e) => { e.preventDefault(); dz.classList.add('over'); }, ondragleave: () => dz.classList.remove('over'), ondrop: (e) => { e.preventDefault(); dz.classList.remove('over'); add([...e.dataTransfer.files]); }, onclick: () => inp.click() }, h('div.dz-ico', ic('image')), h('h2', t('Drop images here', 'ลากรูปมาวางที่นี่')), h('p', t('PNG, JPG, WebP, GIF, BMP — processed in your browser', 'PNG JPG WebP GIF BMP — ประมวลผลในเบราว์เซอร์ของคุณ')));
  const inp = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true, onchange: (e) => add([...e.target.files]) });
  const add = (fs) => { items.push(...fs.filter((f) => f.type.startsWith('image/')).map((file) => ({ file }))); render(); };
  root.append(h('div.dev-wrap', dz, inp, bar(sel([['image/webp', 'WebP'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG']], o.fmt, (v) => { o.fmt = v; render(); }), h('label.small', t('Quality ', 'คุณภาพ '), h('input', { type: 'range', min: 30, max: 100, value: o.q, style: { width: '120px' }, oninput: (e) => { o.q = +e.target.value; } , onchange: () => render() })), h('label.small', t('Max width ', 'กว้างสูงสุด '), num(o.maxW, (v) => { o.maxW = v; }, { min: 16, max: 8000, w: '90px' }), h('button.btn.sm', { onclick: () => render() }, t('Apply', 'ใช้'))), chk(['Keep original size', 'คงขนาดเดิม'], false, (v) => { o.keepSize = v; render(); }), btn(['Clear', 'ล้าง'], () => { items = []; render(); })), info, list));
}

export function imgBase64(root) {
  const out = h('textarea', { rows: 8, readonly: true, spellcheck: 'false', style: { font: '12px var(--mono)' } }); const prev = h('img', { style: { maxWidth: '100%', maxHeight: '260px', border: '1px solid var(--border)', borderRadius: '10px', background: 'repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px' } }); const info = h('div.small.muted');
  let raw = false; let dataUrl = '';
  const show = () => { out.value = raw ? dataUrl.split(',')[1] || '' : dataUrl; };
  const rev = h('textarea', { rows: 5, placeholder: 'data:image/png;base64,iVBORw0KGgo...', spellcheck: 'false', style: { font: '12px var(--mono)' }, oninput: () => { let v = rev.value.trim(); if (v && !v.startsWith('data:')) v = 'data:image/png;base64,' + v; if (/^data:image\/[\w.+-]+;base64,[A-Za-z0-9+/=\s]{8,}$/.test(v)) prev2.src = v; else prev2.removeAttribute('src'); } }); const prev2 = h('img', { style: { maxWidth: '100%', maxHeight: '260px', marginTop: '8px' } });
  root.append(h('div.split2', h('div.col', h('div.hd', t('Image → Base64', 'รูป → Base64')), fileInput(async (f) => { dataUrl = await readFileDataURL(f); prev.src = dataUrl; info.textContent = `${f.name} · ${fmtBytes(f.size)} → ${fmtBytes(dataUrl.length)}`; show(); }, 'image/*'), prev, info, chk(['Raw Base64 only (no data: prefix)', 'เฉพาะ Base64 (ไม่มี data:)'], false, (v) => { raw = v; show(); }), out, bar(btn(['Copy', 'คัดลอก'], () => copyText(out.value)), btn(['Copy as CSS url()', 'คัดลอกเป็น CSS url()'], () => copyText(`url("${dataUrl}")`)))),
    h('div.col', h('div.hd', t('Base64 → Image', 'Base64 → รูป')), rev, prev2, bar(btn(['Download', 'ดาวน์โหลด'], () => { if (prev2.src) { const a = h('a', { href: prev2.src, download: 'image' }); a.click(); } })))));
}

export async function favicon(root) {
  await loadScript('/vendor/lib/jszip.min.js');
  const sizes = [16, 32, 48, 64, 128, 180, 192, 256, 512]; let bmp = null; let bgc = 'transparent'; let round = 0;
  const grid = h('div.wrapflex', { style: { alignItems: 'flex-end' } });
  const draw = (s) => { const c = h('canvas'); c.width = c.height = s; const x = c.getContext('2d'); if (round) { x.beginPath(); x.roundRect(0, 0, s, s, s * round / 100); x.clip(); } if (bgc !== 'transparent') { x.fillStyle = bgc; x.fillRect(0, 0, s, s); } const k = Math.min(s / bmp.width, s / bmp.height); x.drawImage(bmp, (s - bmp.width * k) / 2, (s - bmp.height * k) / 2, bmp.width * k, bmp.height * k); return c; };
  const render = () => { grid.replaceChildren(); if (!bmp) return; sizes.forEach((s) => { const c = draw(s); c.style.cssText = `width:${Math.min(s, 96)}px;height:${Math.min(s, 96)}px;border:1px solid var(--border);background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/10px 10px`; grid.append(h('div', { style: { textAlign: 'center' } }, c, h('div.small.muted', s + 'px'))); }); };
  const zip = async () => { const z = new JSZip(); for (const s of sizes) z.file(`favicon-${s}x${s}.png`, await toBlob(draw(s), 'image/png')); z.file('snippet.html', `<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" href="/favicon-180x180.png">\n`); downloadBlob(await z.generateAsync({ type: 'blob' }), 'favicons.zip'); };
  root.append(h('div.dev-wrap', fileInput(async (f) => { bmp = await createImageBitmap(f); render(); }, 'image/*'), bar(h('label.small', t('Background ', 'พื้นหลัง '), h('input', { type: 'color', value: '#ffffff', oninput: (e) => { bgc = e.target.value; render(); } })), btn(['Transparent', 'โปร่งใส'], () => { bgc = 'transparent'; render(); }), h('label.small', t('Corner radius ', 'มุมโค้ง '), h('input', { type: 'range', min: 0, max: 50, value: 0, oninput: (e) => { round = +e.target.value; render(); } })), btn(['Download ZIP', 'ดาวน์โหลด ZIP'], zip, 'primary')), grid));
}
