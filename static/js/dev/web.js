import { h, ic, field, t, tp, bar, btn, sel, num, chk, txt, copyText, kv } from './common.js';

// ---- colour helpers
export const parseColor = (s) => {
  s = s.trim().toLowerCase(); let m;
  if ((m = /^#?([0-9a-f]{3,8})$/.exec(s))) { let x = m[1]; if (x.length === 3 || x.length === 4) x = [...x].map((c) => c + c).join(''); if (x.length === 6 || x.length === 8) return { r: parseInt(x.slice(0, 2), 16), g: parseInt(x.slice(2, 4), 16), b: parseInt(x.slice(4, 6), 16), a: x.length === 8 ? parseInt(x.slice(6), 16) / 255 : 1 }; }
  if ((m = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(s))) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1 };
  if ((m = /^hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%(?:[ ,/]+([\d.]+%?))?\s*\)$/.exec(s))) { const rgb = hsl2rgb(+m[1], +m[2], +m[3]); return { ...rgb, a: m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : +m[4]) : 1 }; }
  const c = document.createElement('canvas').getContext('2d'); c.fillStyle = '#010203'; c.fillStyle = s; const v = c.fillStyle; if (v !== '#010203' || s === '#010203') return parseColor(v);
  return null;
};
export const hex2 = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
export const toHex = ({ r, g, b }) => '#' + hex2(r) + hex2(g) + hex2(b);
export function rgb2hsl({ r, g, b }) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let hh = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hh *= 60; } return { h: hh, s: s * 100, l: l * 100 }; }
export function hsl2rgb(hh, s, l) { s /= 100; l /= 100; const k = (n) => (n + hh / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return { r: 255 * f(0), g: 255 * f(8), b: 255 * f(4) }; }
const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export function color(root) {
  let c = { r: 79, g: 70, b: 229, a: 1 };
  const picker = h('input', { type: 'color', value: toHex(c), style: { width: '70px', height: '48px' }, oninput: (e) => { c = parseColor(e.target.value); render(true); } });
  const main = h('input', { type: 'text', value: toHex(c), spellcheck: 'false', style: { fontFamily: 'var(--mono)', fontSize: '16px' }, oninput: (e) => { const p = parseColor(e.target.value); if (p) { c = p; render(false); main.style.borderColor = ''; } else main.style.borderColor = 'var(--bad)'; } });
  const sw = h('div.swatch'); const outs = h('div'); const pal = h('div.wrapflex');
  const render = (setMain = true) => {
    const hsl = rgb2hsl(c); sw.style.background = `rgba(${c.r},${c.g},${c.b},${c.a})`; picker.value = toHex(c); if (setMain) main.value = toHex(c);
    const fmt = [['HEX', toHex(c) + (c.a < 1 ? hex2(c.a * 255) : '')], ['RGB', `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`], ['RGBA', `rgba(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)}, ${+c.a.toFixed(2)})`], ['HSL', `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`], ['Tailwind-ish', `[${toHex(c)}]`]];
    outs.replaceChildren(...fmt.map(([k, v]) => kv(k, h('input', { type: 'text', readonly: true, value: v, style: { fontFamily: 'var(--mono)' } }), h('button.btn.sm', { onclick: () => copyText(v) }, ic('copy')))));
    pal.replaceChildren(...[-40, -30, -20, -10, 0, 10, 20, 30, 40].map((d) => { const x = toHex(hsl2rgb(hsl.h, hsl.s, Math.max(3, Math.min(97, hsl.l + d)))); return h('button', { title: x, style: { width: '56px', height: '56px', borderRadius: '10px', border: d === 0 ? '3px solid var(--text)' : '1px solid var(--border)', background: x, cursor: 'pointer' }, onclick: () => { c = parseColor(x); render(); } }); }));
    pal.append(...[[180, 'complement'], [30, 'analog +'], [-30, 'analog −'], [120, 'triad +'], [-120, 'triad −']].map(([d, n]) => { const x = toHex(hsl2rgb((hsl.h + d + 360) % 360, hsl.s, hsl.l)); return h('button', { title: n + ' ' + x, style: { width: '56px', height: '56px', borderRadius: '50%', border: '1px solid var(--border)', background: x, cursor: 'pointer' }, onclick: () => { c = parseColor(x); render(); } }); }));
  };
  root.append(h('div.dev-wrap', h('div.row', picker, main), sw, outs, h('div.sec-title', t('Shades & harmonies', 'เฉดสีและสีที่เข้ากัน')), pal, h('div.small.muted', t('Accepts HEX, rgb(), hsl() or CSS names.', 'รองรับ HEX, rgb(), hsl() หรือชื่อสี CSS'))));
  render();
}

export function contrast(root) {
  let fg = '#1f2937', bg = '#ffffff';
  const prev = h('div', { style: { padding: '24px', borderRadius: '14px', border: '1px solid var(--border)' } }, h('div', { style: { fontSize: '28px', fontWeight: 700 } }, t('Large text sample สวัสดี', 'ตัวอย่างข้อความใหญ่ สวัสดี')), h('div', { style: { fontSize: '15px', marginTop: '6px' } }, t('Normal body text sample — the quick brown fox. ตัวอย่างข้อความปกติ', 'ข้อความปกติตัวอย่าง — the quick brown fox. ตัวอย่างข้อความปกติ')));
  const res = h('div.stat-row', { style: { justifyContent: 'flex-start' } });
  const run = () => {
    const a = parseColor(fg), b = parseColor(bg); if (!a || !b) return; prev.style.color = fg; prev.style.background = bg; const r = ratio(a, b);
    const pf = (ok) => h('span.badge' + (ok ? '.green' : '.red'), ok ? t('Pass', 'ผ่าน') : t('Fail', 'ไม่ผ่าน'));
    res.replaceChildren(h('div.stat', h('b', r.toFixed(2) + ' : 1'), h('span', t('contrast ratio', 'อัตราส่วนคอนทราสต์'))), ...[['AA', 'normal', 'ปกติ', r >= 4.5], ['AA', 'large', 'ตัวใหญ่', r >= 3], ['AAA', 'normal', 'ปกติ', r >= 7], ['AAA', 'large', 'ตัวใหญ่', r >= 4.5]].map(([lv, en, th, ok]) => h('div.stat', pf(ok), h('span', `${lv} ${t(en, th)}`))));
  };
  const mk = (lab, val, set) => { const t_ = h('input', { type: 'text', value: val, style: { fontFamily: 'var(--mono)' }, oninput: (e) => { set(e.target.value); const p = parseColor(e.target.value); if (p) pk.value = toHex(p); run(); } }); const pk = h('input', { type: 'color', value: toHex(parseColor(val)), oninput: (e) => { t_.value = e.target.value; set(e.target.value); run(); } }); return field(lab, h('div.row', pk, t_)); };
  root.append(h('div.dev-wrap', h('div.split2', mk(['Text colour', 'สีข้อความ'], fg, (v) => { fg = v; }), mk(['Background', 'สีพื้นหลัง'], bg, (v) => { bg = v; })), prev, res,
    btn(['Swap', 'สลับสี'], () => { [fg, bg] = [bg, fg]; root.replaceChildren(); contrast(root); })));
  run();
}

export function gradient(root) {
  const st = { type: 'linear', angle: 135, stops: [['#4f46e5', 0], ['#ec4899', 100]] };
  const prev = h('div', { style: { height: '200px', borderRadius: '14px', border: '1px solid var(--border)' } }); const css = h('input', { type: 'text', readonly: true, style: { fontFamily: 'var(--mono)' } }); const stopsEl = h('div');
  const run = () => {
    const stops = st.stops.map(([c, p]) => `${c} ${p}%`).join(', ');
    const v = st.type === 'linear' ? `linear-gradient(${st.angle}deg, ${stops})` : st.type === 'radial' ? `radial-gradient(circle, ${stops})` : `conic-gradient(from ${st.angle}deg, ${stops})`;
    prev.style.background = v; css.value = `background: ${v};`;
    stopsEl.replaceChildren(...st.stops.map((s, i) => h('div.row', { style: { marginBottom: '8px' } }, h('input.fix', { type: 'color', value: s[0], oninput: (e) => { s[0] = e.target.value; run(); } }), h('input', { type: 'range', min: 0, max: 100, value: s[1], oninput: (e) => { s[1] = +e.target.value; run(); } }), h('span.fix.small.muted', { style: { width: '40px' } }, s[1] + '%'), st.stops.length > 2 ? h('button.btn.sm.fix', { onclick: () => { st.stops.splice(i, 1); run(); } }, '×') : null)));
  };
  root.append(h('div.dev-wrap', prev, bar(sel([['linear', 'Linear'], ['radial', 'Radial'], ['conic', 'Conic']], st.type, (v) => { st.type = v; run(); }), h('label.small', t('Angle ', 'มุม '), num(st.angle, (v) => { st.angle = v; run(); }, { min: 0, max: 360, w: '80px' })), btn(['+ Stop', '+ จุดสี'], () => { st.stops.push(['#22c55e', 50]); run(); })), stopsEl, h('div.row', css, h('button.btn.fix', { onclick: () => copyText(css.value) }, ic('copy'), t('Copy', 'คัดลอก')))));
  run();
}

export function shadow(root) {
  const st = { x: 0, y: 10, blur: 30, spread: -5, color: '#1e1b4b', op: 0.25, inset: false };
  const prev = h('div', { style: { height: '200px', display: 'grid', placeItems: 'center', background: 'var(--surface2)', borderRadius: '14px' } }); const box = h('div', { style: { width: '140px', height: '100px', borderRadius: '14px', background: 'var(--surface)' } }); prev.append(box);
  const css = h('input', { type: 'text', readonly: true, style: { fontFamily: 'var(--mono)' } });
  const run = () => { const c = parseColor(st.color); const v = `${st.inset ? 'inset ' : ''}${st.x}px ${st.y}px ${st.blur}px ${st.spread}px rgba(${c.r}, ${c.g}, ${c.b}, ${st.op})`; box.style.boxShadow = v; css.value = `box-shadow: ${v};`; };
  const sl = (lab, k, min, max, step = 1) => kv(lab, h('input', { type: 'range', min, max, step, value: st[k], oninput: (e) => { st[k] = +e.target.value; run(); } }), h('span.small.muted', ''));
  root.append(h('div.dev-wrap', prev, sl(['X offset', 'ระยะแนวนอน (X)'], 'x', -80, 80), sl(['Y offset', 'ระยะแนวตั้ง (Y)'], 'y', -80, 80), sl(['Blur', 'ความเบลอ'], 'blur', 0, 120), sl(['Spread', 'ขยายขอบเงา'], 'spread', -60, 60), sl(['Opacity', 'ความโปร่งใส'], 'op', 0, 1, 0.01), bar(h('input', { type: 'color', value: st.color, oninput: (e) => { st.color = e.target.value; run(); } }), chk(['Inset', 'ด้านใน'], false, (v) => { st.inset = v; run(); })), h('div.row', css, h('button.btn.fix', { onclick: () => copyText(css.value) }, ic('copy'), t('Copy', 'คัดลอก')))));
  run();
}

const HTTP = [[100, 'Continue', 'The server received the request headers; continue sending the body.', 'ดำเนินการต่อ', 'เซิร์ฟเวอร์ได้รับส่วนหัวคำขอแล้ว ให้ส่งส่วนเนื้อหาต่อ'], [101, 'Switching Protocols', 'Upgrading to another protocol (e.g. WebSocket).', 'เปลี่ยนโปรโตคอล', 'กำลังอัปเกรดไปใช้โปรโตคอลอื่น (เช่น WebSocket)'], [200, 'OK', 'The request succeeded.', 'สำเร็จ', 'คำขอสำเร็จ'], [201, 'Created', 'A new resource was created.', 'สร้างแล้ว', 'สร้างทรัพยากรใหม่สำเร็จ'], [202, 'Accepted', 'Accepted for processing, not yet completed.', 'รับคำขอแล้ว', 'รับไว้ประมวลผลแล้ว แต่ยังไม่เสร็จ'], [204, 'No Content', 'Success with no response body.', 'ไม่มีเนื้อหา', 'สำเร็จ แต่ไม่มีเนื้อหาตอบกลับ'], [206, 'Partial Content', 'Range request fulfilled.', 'ส่งบางส่วน', 'ตอบคำขอแบบช่วง (Range) แล้ว'], [301, 'Moved Permanently', 'Resource has a new permanent URL.', 'ย้ายถาวร', 'ทรัพยากรมี URL ใหม่ถาวร'], [302, 'Found', 'Temporary redirect.', 'พบที่อื่น (ชั่วคราว)', 'เปลี่ยนเส้นทางชั่วคราว'], [303, 'See Other', 'Fetch the result with GET at another URL.', 'ดูที่อื่น', 'ให้ใช้ GET ไปที่ URL อื่นเพื่อดูผลลัพธ์'], [304, 'Not Modified', 'Cached version is still valid.', 'ไม่มีการแก้ไข', 'ข้อมูลในแคชยังใช้ได้'], [307, 'Temporary Redirect', 'Redirect keeping the HTTP method.', 'เปลี่ยนเส้นทางชั่วคราว', 'เปลี่ยนเส้นทางโดยคงเมธอด HTTP เดิม'], [308, 'Permanent Redirect', 'Permanent redirect keeping the method.', 'เปลี่ยนเส้นทางถาวร', 'เปลี่ยนเส้นทางถาวรโดยคงเมธอดเดิม'], [400, 'Bad Request', 'Malformed request.', 'คำขอไม่ถูกต้อง', 'รูปแบบคำขอผิด'], [401, 'Unauthorized', 'Authentication required or failed.', 'ไม่ได้รับอนุญาต', 'ต้องยืนยันตัวตน หรือยืนยันตัวตนไม่สำเร็จ'], [403, 'Forbidden', 'Authenticated but not allowed.', 'ถูกห้าม', 'ยืนยันตัวตนแล้ว แต่ไม่มีสิทธิ์'], [404, 'Not Found', 'Resource does not exist.', 'ไม่พบ', 'ไม่มีทรัพยากรนี้'], [405, 'Method Not Allowed', 'HTTP method not supported for this resource.', 'ไม่รองรับเมธอดนี้', 'ทรัพยากรนี้ไม่รองรับเมธอด HTTP ที่ใช้'], [406, 'Not Acceptable', 'No representation matches Accept headers.', 'ไม่ยอมรับรูปแบบนี้', 'ไม่มีรูปแบบข้อมูลที่ตรงกับส่วนหัว Accept'], [408, 'Request Timeout', 'Client took too long to send the request.', 'คำขอหมดเวลา', 'ไคลเอนต์ส่งคำขอช้าเกินไป'], [409, 'Conflict', 'Conflicts with current resource state.', 'ขัดแย้ง', 'ขัดแย้งกับสถานะปัจจุบันของทรัพยากร'], [410, 'Gone', 'Resource permanently removed.', 'ถูกลบถาวร', 'ทรัพยากรถูกลบออกถาวรแล้ว'], [413, 'Payload Too Large', 'Request body exceeds server limit.', 'เนื้อหาใหญ่เกินไป', 'เนื้อหาคำขอเกินขีดจำกัดของเซิร์ฟเวอร์'], [415, 'Unsupported Media Type', 'Content type not supported.', 'ไม่รองรับชนิดสื่อ', 'ไม่รองรับ Content-Type นี้'], [418, "I'm a teapot", 'April Fools’ joke status (RFC 2324).', 'ฉันเป็นกาน้ำชา', 'สถานะมุกวันโกหก (RFC 2324)'], [422, 'Unprocessable Content', 'Well-formed but semantically invalid.', 'ประมวลผลเนื้อหาไม่ได้', 'รูปแบบถูกต้อง แต่ความหมายไม่ถูกต้อง'], [429, 'Too Many Requests', 'Rate limit exceeded.', 'คำขอมากเกินไป', 'เกินขีดจำกัดอัตราการเรียกใช้'], [451, 'Unavailable For Legal Reasons', 'Blocked for legal reasons.', 'ไม่พร้อมใช้งานด้วยเหตุผลทางกฎหมาย', 'ถูกบล็อกด้วยเหตุผลทางกฎหมาย'], [500, 'Internal Server Error', 'Generic server failure.', 'ข้อผิดพลาดภายในเซิร์ฟเวอร์', 'เซิร์ฟเวอร์ล้มเหลวทั่วไป'], [501, 'Not Implemented', 'Server lacks the functionality.', 'ยังไม่รองรับ', 'เซิร์ฟเวอร์ไม่มีฟังก์ชันนี้'], [502, 'Bad Gateway', 'Invalid response from upstream server.', 'เกตเวย์ไม่ถูกต้อง', 'ได้รับการตอบกลับไม่ถูกต้องจากเซิร์ฟเวอร์ต้นทาง'], [503, 'Service Unavailable', 'Server overloaded or down for maintenance.', 'บริการไม่พร้อมใช้งาน', 'เซิร์ฟเวอร์รับภาระไม่ไหวหรือกำลังปิดปรับปรุง'], [504, 'Gateway Timeout', 'Upstream server timed out.', 'เกตเวย์หมดเวลา', 'เซิร์ฟเวอร์ต้นทางตอบช้าเกินไป']];
export function http(root) {
  const list = h('table.t'); const q = h('input', { type: 'search', placeholder: t('Search code or text…', 'ค้นหารหัสหรือข้อความ…'), oninput: () => run() });
  const run = () => { const s = q.value.toLowerCase(); list.replaceChildren(...HTTP.filter(([c, n, d, tn, td]) => !s || String(c).includes(s) || (n + ' ' + d + ' ' + tn + ' ' + td).toLowerCase().includes(s)).map(([c, n, d, tn, td]) => h('tr', h('td', h('span.badge' + (c < 300 ? '.green' : c >= 400 ? '.red' : ''), String(c))), h('td', { style: { fontWeight: 600 } }, t(n, tn)), h('td.muted', t(d, td))))); };
  root.append(h('div.dev-wrap', q, list)); run();
}

export function useragent(root) {
  const input = h('input', { type: 'text', value: navigator.userAgent, spellcheck: 'false', style: { fontFamily: 'var(--mono)', fontSize: '12.5px' }, oninput: () => run() }); const out = h('table.t');
  const run = () => {
    const ua = input.value;
    const pick = (list) => { for (const [re, name] of list) { const m = re.exec(ua); if (m) return `${name}${m[1] ? ' ' + m[1].replace(/_/g, '.') : ''}`; } return '—'; };
    const browser = pick([[/Edg\/([\d.]+)/, 'Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'], [/Firefox\/([\d.]+)/, 'Firefox'], [/(?:Chrome|CriOS)\/([\d.]+)/, 'Chrome'], [/Version\/([\d.]+).*Safari/, 'Safari'], [/MSIE ([\d.]+)/, 'IE']]);
    const os = pick([[/Windows NT ([\d.]+)/, 'Windows NT'], [/Android ([\d.]+)/, 'Android'], [/(?:iPhone|iPad).*OS ([\d_]+)/, 'iOS'], [/Mac OS X ([\d_.]+)/, 'macOS'], [/CrOS/, 'ChromeOS'], [/Linux/, 'Linux']]);
    const engine = pick([[/Gecko\/\d+.*Firefox/, 'Gecko'], [/AppleWebKit\/([\d.]+)/, 'WebKit/Blink']]);
    const device = /iPad|Tablet/.test(ua) ? t('Tablet', 'แท็บเล็ต') : /Mobi|iPhone|Android.*Mobile/.test(ua) ? t('Mobile', 'มือถือ') : t('Desktop', 'คอมพิวเตอร์');
    out.replaceChildren(...[[t('Browser', 'เบราว์เซอร์'), browser], [t('OS', 'ระบบปฏิบัติการ'), os], [t('Engine', 'เอนจิน'), engine], [t('Device type', 'ชนิดอุปกรณ์'), device], [t('Bot?', 'เป็นบอทหรือไม่'), /bot|crawl|spider|slurp/i.test(ua) ? t('Yes', 'ใช่') : t('No', 'ไม่ใช่')]].map(([k, v]) => h('tr', h('td.muted', k), h('td', v))));
  };
  root.append(h('div.dev-wrap', field(['User-Agent string', 'สตริง User-Agent'], input), out, h('div.small.muted', t('Pre-filled with your current browser.', 'ใส่ค่าของเบราว์เซอร์ปัจจุบันให้แล้ว')))); run();
}
