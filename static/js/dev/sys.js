import { h, ic, field, t, tp, bar, btn, sel, num, chk, txt, copyText, kv, loadScript, pad2 } from './common.js';

export function timestamp(root) {
  const now = h('div.stat-row', { style: { justifyContent: 'flex-start' } });
  const tick = () => { const n = Date.now(); now.replaceChildren(h('div.stat', h('b.mono', String(Math.floor(n / 1000))), h('span', t('now (seconds)', 'ตอนนี้ (วินาที)'))), h('div.stat', h('b.mono', String(n)), h('span', t('now (ms)', 'ตอนนี้ (มิลลิวินาที)')))); };
  tick(); const iv = setInterval(() => { if (!document.contains(now)) clearInterval(iv); else tick(); }, 1000);
  const zones = ['local', 'UTC', 'Asia/Bangkok', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Sydney'];
  let zone = 'local'; const tsIn = h('input', { type: 'text', placeholder: '1700000000', style: { fontFamily: 'var(--mono)' }, oninput: () => fromTs() }); const out = h('table.t');
  const fmtIn = (d, tz) => { const o = { dateStyle: 'full', timeStyle: 'long' }; if (tz !== 'local') o.timeZone = tz; try { return new Intl.DateTimeFormat(undefined, o).format(d); } catch { return '—'; } };
  const fromTs = () => {
    const v = tsIn.value.trim(); out.replaceChildren(); if (!/^-?\d+(\.\d+)?$/.test(v)) return;
    let n = Number(v); const ms = Math.abs(n) > 1e11 ? n : n * 1000; const d = new Date(ms); if (isNaN(d)) return;
    const rel = (() => { const s = Math.round((Date.now() - ms) / 1000), a = Math.abs(s), u = a < 60 ? [a, 's'] : a < 3600 ? [Math.round(a / 60), 'min'] : a < 86400 ? [Math.round(a / 3600), 'h'] : [Math.round(a / 86400), 'd']; return `${u[0]} ${u[1]} ${s >= 0 ? t('ago', 'ที่แล้ว') : t('from now', 'จากนี้')}`; })();
    out.append(...[['ISO 8601', d.toISOString()], ['RFC 2822', d.toUTCString()], [t('Relative', 'เทียบกับตอนนี้'), rel], ...zones.map((z) => [z === 'local' ? t('Local', 'เครื่องนี้') : z, fmtIn(d, z)])].map(([k, v]) => h('tr', h('td.muted', k), h('td.mono', v))));
  };
  const dtIn = h('input', { type: 'datetime-local', step: 1, oninput: () => { const d = new Date(dtIn.value + (zone === 'UTC' ? 'Z' : '')); res.textContent = isNaN(d) ? '' : `${Math.floor(d / 1000)}  (${d.getTime()} ms)`; } });
  const res = h('div.outbox.mono');
  root.append(h('div.dev-wrap', now, h('div.panel', field(['Unix timestamp → date', 'Unix timestamp → วันที่'], tsIn), out, btn(['Use now', 'ใช้ตอนนี้'], () => { tsIn.value = String(Math.floor(Date.now() / 1000)); fromTs(); })),
    h('div.panel', field(['Date → Unix timestamp', 'วันที่ → Unix timestamp'], h('div.row', dtIn, sel([['local', ['Local time', 'เวลาเครื่องนี้']], ['UTC', 'UTC']], zone, (v) => { zone = v; dtIn.dispatchEvent(new Event('input')); }))), res)));
}

export async function cron(root) {
  await loadScript('/vendor/lib/cronstrue.min.js');
  const input = h('input', { type: 'text', value: '*/15 9-17 * * 1-5', spellcheck: 'false', style: { fontFamily: 'var(--mono)', fontSize: '18px' }, oninput: () => run() });
  const out = h('div.outbox', { style: { fontSize: '17px', fontFamily: 'var(--font)' } }); const nextEl = h('div');
  const field5 = (s, min, max, names) => {
    const set = new Set();
    for (const part of s.split(',')) {
      const m = /^(\*|\d+|[A-Za-z]{3})(?:-(\d+|[A-Za-z]{3}))?(?:\/(\d+))?$/.exec(part); if (!m) return null;
      const cv = (x) => (/^[A-Za-z]/.test(x) ? names.indexOf(x.toUpperCase()) + (names.length === 12 ? 1 : 0) : +x);
      let a = m[1] === '*' ? min : cv(m[1]); let b = m[2] ? cv(m[2]) : (m[1] === '*' ? max : (m[3] ? max : a)); const step = m[3] ? +m[3] : 1;
      if (isNaN(a) || isNaN(b) || a < min || b > max) return null; for (let i = a; i <= b; i += step) set.add(i);
    }
    return set;
  };
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']; const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const run = () => {
    out.textContent = ''; nextEl.replaceChildren(); const parts = input.value.trim().split(/\s+/);
    try { out.textContent = cronstrue.toString(input.value.trim(), { use24HourTimeFormat: true }); out.style.color = ''; } catch (e) { out.textContent = '✗ ' + (e.message || e); out.style.color = 'var(--bad)'; return; }
    if (parts.length !== 5) return;
    const f = [field5(parts[0], 0, 59, []), field5(parts[1], 0, 23, []), field5(parts[2], 1, 31, []), field5(parts[3], 1, 12, MON), field5(parts[4].replace(/7/g, '0'), 0, 6, DOW)]; if (f.some((x) => !x)) return;
    const domStar = parts[2] === '*', dowStar = parts[4] === '*'; const d = new Date(); d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1); const res = [];
    for (let i = 0; i < 525600 && res.length < 8; i++, d.setMinutes(d.getMinutes() + 1)) {
      if (!f[0].has(d.getMinutes()) || !f[1].has(d.getHours()) || !f[3].has(d.getMonth() + 1)) continue;
      const domOk = f[2].has(d.getDate()), dowOk = f[4].has(d.getDay()); const dayOk = domStar && dowStar ? true : domStar ? dowOk : dowStar ? domOk : (domOk || dowOk); if (dayOk) res.push(new Date(d));
    }
    nextEl.append(h('div.sec-title', t('Next runs (your local time)', 'รอบถัดไป (เวลาเครื่องนี้)')), h('table.t', res.map((x) => h('tr', h('td.mono', `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())} ${pad2(x.getHours())}:${pad2(x.getMinutes())}`), h('td.muted', x.toLocaleDateString(undefined, { weekday: 'long' }))))));
  };
  const presets = [['*/5 * * * *', t('Every 5 min', 'ทุก 5 นาที')], ['0 * * * *', t('Hourly', 'ทุกชั่วโมง')], ['0 0 * * *', t('Daily midnight', 'ทุกเที่ยงคืน')], ['0 9 * * 1-5', t('Weekdays 9:00', 'วันทำงาน 9:00')], ['0 0 1 * *', t('Monthly', 'ทุกเดือน')], ['0 0 * * 0', t('Weekly (Sun)', 'ทุกอาทิตย์')]];
  root.append(h('div.dev-wrap', input, h('div.small.muted.mono', 'minute  hour  day-of-month  month  day-of-week'), out, h('div.wrapflex', presets.map(([c, l]) => h('button.btn.sm', { onclick: () => { input.value = c; run(); } }, l))), nextEl));
  run();
}

export function chmod(root) {
  const bits = { u: { r: 1, w: 1, x: 1 }, g: { r: 1, w: 0, x: 1 }, o: { r: 1, w: 0, x: 1 } }; let special = { suid: 0, sgid: 0, sticky: 0 };
  const num_ = h('input', { type: 'text', value: '755', maxlength: 4, style: { fontFamily: 'var(--mono)', fontSize: '22px', width: '120px' }, oninput: (e) => { const v = e.target.value.replace(/[^0-7]/g, ''); if (v.length >= 3) { const d = v.slice(-3); ['u', 'g', 'o'].forEach((k, i) => { const n = +d[i]; bits[k] = { r: n & 4 ? 1 : 0, w: n & 2 ? 1 : 0, x: n & 1 ? 1 : 0 }; }); const sp = v.length === 4 ? +v[0] : 0; special = { suid: sp & 4 ? 1 : 0, sgid: sp & 2 ? 1 : 0, sticky: sp & 1 ? 1 : 0 }; render(false); } } });
  const sym = h('div.mono', { style: { fontSize: '22px' } }); const cmd = h('div.outbox.mono'); const grid = h('table.t');
  const render = (setNum = true) => {
    const d = ['u', 'g', 'o'].map((k) => bits[k].r * 4 + bits[k].w * 2 + bits[k].x); const sp = special.suid * 4 + special.sgid * 2 + special.sticky; const n = (sp ? String(sp) : '') + d.join('');
    if (setNum) num_.value = n;
    const sy = ['u', 'g', 'o'].map((k, i) => { let s = (bits[k].r ? 'r' : '-') + (bits[k].w ? 'w' : '-'); const x = bits[k].x; const spc = i === 0 ? special.suid : i === 1 ? special.sgid : special.sticky; s += spc ? (x ? (i === 2 ? 't' : 's') : (i === 2 ? 'T' : 'S')) : (x ? 'x' : '-'); return s; }).join('');
    sym.textContent = sy; cmd.textContent = `chmod ${n} file\nchmod ${['u', 'g', 'o'].map((k) => k + '=' + ['r', 'w', 'x'].filter((b) => bits[k][b]).join('')).join(',')} file`;
    grid.replaceChildren(h('tr', h('th', ''), h('th', t('Read (4)', 'อ่าน (4)')), h('th', t('Write (2)', 'เขียน (2)')), h('th', t('Execute (1)', 'รัน (1)'))), ...[['u', t('Owner', 'เจ้าของ')], ['g', t('Group', 'กลุ่ม')], ['o', t('Others', 'คนอื่น')]].map(([k, l]) => h('tr', h('td', l), ...['r', 'w', 'x'].map((b) => h('td', h('input', { type: 'checkbox', checked: !!bits[k][b], onchange: (e) => { bits[k][b] = e.target.checked ? 1 : 0; render(); } }))))),
      h('tr', h('td', t('Special', 'พิเศษ')), ...[['suid', 'setuid'], ['sgid', 'setgid'], ['sticky', 'sticky']].map(([k, l]) => h('td', h('label.check', { style: { alignItems: 'center' } }, h('input', { type: 'checkbox', checked: !!special[k], onchange: (e) => { special[k] = e.target.checked ? 1 : 0; render(); } }), l)))));
  };
  root.append(h('div.dev-wrap', h('div.row', num_, sym), grid, cmd, h('div.row', btn(['Copy command', 'คัดลอกคำสั่ง'], () => copyText(cmd.textContent.split('\n')[0]), 'fix'))));
  render();
}

export function cidr(root) {
  const input = h('input', { type: 'text', value: '192.168.1.37/24', style: { fontFamily: 'var(--mono)', fontSize: '18px' }, oninput: () => run() }); const out = h('table.t'); const err = h('div.small', { style: { color: 'var(--bad)' } });
  const ip2n = (s) => { const p = s.split('.'); if (p.length !== 4 || p.some((x) => !/^\d+$/.test(x) || +x > 255)) return null; return ((+p[0] << 24) >>> 0) + (+p[1] << 16) + (+p[2] << 8) + +p[3]; };
  const n2ip = (n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  const run = () => {
    out.replaceChildren(); err.textContent = ''; const m = /^\s*([\d.]+)\s*(?:\/\s*(\d{1,2}))?\s*$/.exec(input.value); const ip = m && ip2n(m[1]); const bits = m && m[2] !== undefined ? +m[2] : 32;
    if (!m || ip === null || bits > 32) { err.textContent = t('Enter an IPv4 address like 10.0.0.5/16', 'กรอก IPv4 เช่น 10.0.0.5/16'); return; }
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0; const net = (ip & mask) >>> 0; const bc = (net | (~mask >>> 0)) >>> 0; const hosts = bits >= 31 ? (bits === 32 ? 1 : 2) : Math.pow(2, 32 - bits) - 2;
    const cls = ip >>> 24 < 128 ? 'A' : ip >>> 24 < 192 ? 'B' : ip >>> 24 < 224 ? 'C' : ip >>> 24 < 240 ? 'D (multicast)' : 'E';
    const priv = (ip >>> 24 === 10) || ((ip >>> 20) === 0xac1) || ((ip >>> 16) === 0xc0a8) ? t('Private', 'ส่วนตัว (private)') : (ip >>> 24 === 127 ? 'Loopback' : t('Public', 'สาธารณะ'));
    out.append(...[[t('Network', 'เครือข่าย'), n2ip(net)], [t('Netmask', 'เน็ตมาสก์'), n2ip(mask)], [t('Wildcard', 'ไวลด์การ์ด'), n2ip(~mask >>> 0)], [t('Broadcast', 'บรอดแคสต์'), n2ip(bc)], [t('First host', 'โฮสต์แรก'), n2ip(bits >= 31 ? net : net + 1)], [t('Last host', 'โฮสต์สุดท้าย'), n2ip(bits >= 31 ? bc : bc - 1)], [t('Usable hosts', 'จำนวนโฮสต์'), hosts.toLocaleString()], ['CIDR', `${n2ip(net)}/${bits}`], [t('Class', 'คลาส'), cls], [t('Type', 'ชนิด'), priv], [t('Binary mask', 'มาสก์ฐานสอง'), n2ip(mask).split('.').map((x) => (+x).toString(2).padStart(8, '0')).join('.')]].map(([k, v]) => h('tr', h('td.muted', k), h('td.mono', v))));
  };
  root.append(h('div.dev-wrap', input, err, out)); run();
}
