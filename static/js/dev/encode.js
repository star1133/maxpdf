import { h, ic, field, t, tp, ioPane, bar, btn, sel, num, chk, txt, outbox, loadScript, copyText, kv, hex, fileInput, readFileDataURL } from './common.js';

const enc = new TextEncoder(); const dec = new TextDecoder();
const toB64 = (bytes) => { let s = ''; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); };
const fromB64 = (s) => { const bin = atob(s); const b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; };

export function base64(root) {
  const io = ioPane({ placeholder: 'Hello สวัสดี', outputLabel: ['Result', 'ผลลัพธ์'] });
  let mode = 'enc', urlSafe = false;
  const run = () => {
    const s = io.input.value; if (!s) { io.output.value = ''; io.setStatus(''); return; }
    try {
      if (mode === 'enc') { let o = toB64(enc.encode(s)); if (urlSafe) o = o.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); io.output.value = o; }
      else { let x = s.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, ''); while (x.length % 4) x += '='; io.output.value = dec.decode(fromB64(x)); }
      io.setStatus('');
    } catch { io.output.value = ''; io.setStatus('✗ ' + t('Invalid Base64', 'Base64 ไม่ถูกต้อง'), false); }
  };
  io.input.addEventListener('input', run);
  const fileOut = h('div.small.muted');
  const fileTa = h('textarea', { rows: 4, readonly: true, spellcheck: 'false', style: { font: '12px var(--mono)', marginTop: '8px' } });
  root.append(bar(sel([['enc', ['Encode', 'เข้ารหัส']], ['dec', ['Decode', 'ถอดรหัส']]], mode, (v) => { mode = v; run(); }), chk(['URL-safe', 'URL-safe'], false, (v) => { urlSafe = v; run(); })), io.el, io.status,
    h('div.panel', h('div.sec-title', { style: { marginTop: 0 } }, t('File → Base64', 'ไฟล์ → Base64')),
      bar(fileInput(async (f) => { const u = await readFileDataURL(f); const b = u.split(',')[1] || ''; fileOut.textContent = `${f.name} · ${b.length} chars`; fileTa.value = b; }, '*/*')),
      fileOut, fileTa, btn(['Copy', 'คัดลอก'], () => copyText(fileTa.value))));
}

export function url(root) {
  const io = ioPane({ placeholder: 'https://example.com/path?q=สวัสดี&x=1 2', outputLabel: ['Result', 'ผลลัพธ์'] });
  let mode = 'enc', comp = true;
  const parsed = h('div');
  const run = () => {
    const s = io.input.value;
    try { io.output.value = mode === 'enc' ? (comp ? encodeURIComponent(s) : encodeURI(s)) : (comp ? decodeURIComponent(s.replace(/\+/g, ' ')) : decodeURI(s)); io.setStatus(''); } catch { io.output.value = ''; io.setStatus('✗ ' + t('Malformed URI', 'URI ไม่ถูกต้อง'), false); }
    parsed.replaceChildren();
    try {
      const u = new URL(s.trim());
      parsed.append(h('table.t', [['protocol', u.protocol], ['host', u.host], ['hostname', u.hostname], ['port', u.port || '(default)'], ['pathname', u.pathname], ['search', u.search], ['hash', u.hash], ...[...u.searchParams].map(([k, v], i) => [`param ${k}`, v])].map(([k, v]) => h('tr', h('td.muted', k), h('td.mono', v)))));
    } catch { /* not a URL */ }
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['enc', ['Encode', 'เข้ารหัส']], ['dec', ['Decode', 'ถอดรหัส']]], mode, (v) => { mode = v; run(); }), sel([[true, ['Component (encodeURIComponent)', 'ส่วนประกอบ (encodeURIComponent)']], [false, ['Full URL (encodeURI)', 'URL เต็ม (encodeURI)']]], comp, (v) => { comp = v === 'true'; run(); })), io.el, io.status, parsed);
}

export function htmlEnt(root) {
  const io = ioPane({ placeholder: '<p class="a">Tom & Jerry © 2025</p>', outputLabel: ['Result', 'ผลลัพธ์'] });
  let mode = 'enc', all = false;
  const run = () => {
    const s = io.input.value;
    if (mode === 'enc') io.output.value = s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])).replace(all ? /[^\x00-\x7f]/g : /$^/g, (c) => `&#${c.codePointAt(0)};`);
    else { const ta = document.createElement('textarea'); ta.innerHTML = s; io.output.value = ta.value; }
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['enc', ['Escape', 'แปลงเป็นรหัส (Escape)']], ['dec', ['Unescape', 'ถอดรหัส (Unescape)']]], mode, (v) => { mode = v; run(); }), chk(['Also encode non-ASCII', 'แปลงอักขระที่ไม่ใช่ ASCII ด้วย'], false, (v) => { all = v; run(); })), io.el);
}

export function jwt(root) {
  const input = h('textarea', { rows: 5, placeholder: 'eyJhbGciOiJIUzI1NiIs...', spellcheck: 'false', style: { font: '13px var(--mono)' } });
  const out = h('div');
  const b64u = (s) => { let x = s.replace(/-/g, '+').replace(/_/g, '/'); while (x.length % 4) x += '='; return dec.decode(fromB64(x)); };
  const run = () => {
    out.replaceChildren(); const tok = input.value.trim(); if (!tok) return;
    const parts = tok.split('.');
    if (parts.length < 2) { out.append(h('div.alert.err', ic('warn'), t('Not a JWT.', 'ไม่ใช่ JWT'))); return; }
    try {
      const head = JSON.parse(b64u(parts[0])); const pay = JSON.parse(b64u(parts[1]));
      const now = Date.now() / 1000; const claims = [];
      for (const k of ['iat', 'nbf', 'exp']) if (typeof pay[k] === 'number') claims.push(h('tr', h('td.muted', k), h('td', new Date(pay[k] * 1000).toLocaleString()), h('td', k === 'exp' ? (pay.exp < now ? h('span.badge.red', t('expired', 'หมดอายุแล้ว')) : h('span.badge.green', t('valid', 'ยังไม่หมดอายุ'))) : '')));
      out.append(h('div.split2', h('div.col', h('div.hd', 'Header'), h('pre.out', JSON.stringify(head, null, 2))), h('div.col', h('div.hd', 'Payload'), h('pre.out', JSON.stringify(pay, null, 2)))),
        claims.length ? h('table.t', { style: { marginTop: '10px' } }, claims) : null,
        h('div.small.muted', { style: { marginTop: '10px' } }, t('Signature is not verified here (nothing is sent anywhere).', 'ไม่ได้ตรวจสอบลายเซ็นที่นี่ (ไม่มีข้อมูลถูกส่งออกไปไหน)')));
    } catch { out.append(h('div.alert.err', ic('warn'), t('Could not decode this token.', 'ถอดรหัสโทเค็นนี้ไม่ได้'))); }
  };
  input.addEventListener('input', run);
  root.append(field(['JWT', 'JWT'], input), out);
}

// ---------------------------------------------------------------- Hash
export function hash(root) {
  const input = h('textarea', { rows: 5, placeholder: t('Type or paste text…', 'พิมพ์หรือวางข้อความ…'), spellcheck: 'false' });
  const keyIn = h('input', { type: 'text', placeholder: t('HMAC secret (optional)', 'ความลับ HMAC (ไม่บังคับ)'), oninput: () => run() });
  const outs = {}; const table = h('div');
  const algos = ['MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
  algos.forEach((a) => { outs[a] = h('input', { type: 'text', readonly: true, style: { fontFamily: 'var(--mono)', fontSize: '12.5px' } }); table.append(kv(a, outs[a], h('button.btn.sm', { onclick: () => copyText(outs[a].value) }, ic('copy')))); });
  let upper = false; let fileBuf = null; let fileName = '';
  async function digest(a, bytes) { if (a === 'MD5') { await loadScript('/vendor/lib/md5.min.js'); let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return md5(bin); } return hex(await crypto.subtle.digest(a, bytes)); }
  async function hmac(a, key, bytes) { const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: a }, false, ['sign']); return hex(await crypto.subtle.sign('HMAC', k, bytes)); }
  async function run() {
    const bytes = fileBuf || enc.encode(input.value); const key = keyIn.value;
    for (const a of algos) {
      let v; try { v = key ? (a === 'MD5' ? t('(HMAC-MD5 unsupported)', '(ไม่รองรับ HMAC-MD5)') : await hmac(a, key, bytes)) : await digest(a, bytes); } catch { v = ''; }
      outs[a].value = upper ? v.toUpperCase() : v;
    }
  }
  input.addEventListener('input', () => { fileBuf = null; fileName = ''; fileLbl.textContent = ''; run(); });
  const fileLbl = h('span.small.muted');
  root.append(h('div.dev-wrap', field(['Text', 'ข้อความ'], input),
    bar(fileInput(async (f) => { fileBuf = new Uint8Array(await f.arrayBuffer()); fileName = f.name; fileLbl.textContent = `${f.name} · ${(f.size / 1024).toFixed(1)} KB`; run(); }, '*/*'), fileLbl, chk(['UPPERCASE', 'ตัวพิมพ์ใหญ่'], false, (v) => { upper = v; run(); })),
    field(['HMAC key', 'คีย์ HMAC'], keyIn), table, h('div.small.muted', t('Everything is computed in your browser.', 'คำนวณในเบราว์เซอร์ของคุณทั้งหมด'))));
  run();
}

export function unicode(root) {
  const io = ioPane({ placeholder: 'Hello สวัสดี 😀', outputLabel: ['Result', 'ผลลัพธ์'] });
  let fmt = 'hex';
  const run = () => {
    const s = io.input.value; const b = enc.encode(s);
    const cp = [...s].map((c) => c.codePointAt(0));
    io.output.value = fmt === 'hex' ? [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ')
      : fmt === 'bin' ? [...b].map((x) => x.toString(2).padStart(8, '0')).join(' ')
      : fmt === 'dec' ? [...b].join(' ')
      : fmt === 'u' ? cp.map((c) => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(' ')
      : fmt === 'esc' ? [...s].map((c) => { const k = c.codePointAt(0); return k < 128 && k >= 32 ? c : k > 0xffff ? `\\u{${k.toString(16)}}` : '\\u' + k.toString(16).padStart(4, '0'); }).join('')
      : [...s].map((c) => '&#x' + c.codePointAt(0).toString(16) + ';').join('');
    io.setStatus(`${[...s].length} ${t('characters', 'ตัวอักษร')} · ${b.length} bytes (UTF-8)`);
  };
  io.input.addEventListener('input', run);
  const back = h('input', { type: 'text', placeholder: t('Hex bytes → text, e.g. 48 65 6c 6c 6f', 'Hex → ข้อความ เช่น 48 65 6c 6c 6f'), oninput: (e) => { try { const v = e.target.value.replace(/[^0-9a-fA-F]/g, ''); backOut.textContent = dec.decode(Uint8Array.from(v.match(/../g) || [], (x) => parseInt(x, 16))); } catch { backOut.textContent = ''; } } });
  const backOut = h('div.outbox');
  root.append(bar(sel([['hex', 'Hex (UTF-8)'], ['bin', [ 'Binary (UTF-8)', 'ฐานสอง (UTF-8)']], ['dec', ['Decimal bytes', 'ไบต์ฐานสิบ']], ['u', ['Unicode U+', 'Unicode U+']], ['esc', ['\\u escapes', 'รหัส \\u']], ['ent', 'HTML &#x;']], fmt, (v) => { fmt = v; run(); })), io.el, io.status, h('div.panel', field(['Hex → text', 'Hex → ข้อความ'], back), backOut));
}

export function numbase(root) {
  const fields = {}; const bases = [[t('Binary (2)', 'ฐานสอง (2)'), 2], [t('Octal (8)', 'ฐานแปด (8)'), 8], [t('Decimal (10)', 'ฐานสิบ (10)'), 10], [t('Hex (16)', 'ฐานสิบหก (16)'), 16], [t('Base 32', 'ฐาน 32'), 32], [t('Base 36', 'ฐาน 36'), 36]];
  const wrap = h('div.dev-wrap'); const err = h('div.small', { style: { color: 'var(--bad)' } });
  const upd = (src, base) => {
    err.textContent = ''; const v = fields[src].value.trim().toLowerCase().replace(/[\s_,]/g, '');
    if (!v) { Object.values(fields).forEach((f) => { f.value = ''; }); return; }
    let n; try { const digits = '0123456789abcdefghijklmnopqrstuvwxyz'; let neg = false, s = v; if (s[0] === '-') { neg = true; s = s.slice(1); } n = 0n; for (const c of s) { const d = digits.indexOf(c); if (d < 0 || d >= base) throw 0; n = n * BigInt(base) + BigInt(d); } if (neg) n = -n; } catch { err.textContent = t('Invalid digit for this base.', 'มีหลักที่ไม่ถูกต้องสำหรับฐานนี้'); return; }
    bases.forEach(([, b]) => { if (b !== base) fields[b].value = n.toString(b); });
  };
  bases.forEach(([lab, b]) => { fields[b] = h('input', { type: 'text', style: { fontFamily: 'var(--mono)' }, spellcheck: 'false', oninput: () => upd(b, b) }); wrap.append(kv(lab, fields[b], h('button.btn.sm', { onclick: () => copyText(fields[b].value) }, ic('copy')))); });
  root.append(wrap, err, h('div.small.muted', t('Supports arbitrarily large integers (BigInt).', 'รองรับจำนวนเต็มขนาดใหญ่ (BigInt)')));
}
