import { h, ic, field, t, tp, bar, btn, sel, num, chk, txt, copyText, kv, loadScript, fileInput, downloadText } from './common.js';

const rnd = (n) => { const a = new Uint32Array(1); const max = Math.floor(0x100000000 / n) * n; let x; do { crypto.getRandomValues(a); x = a[0]; } while (x >= max); return x % n; };

// ---- UUID / ULID
function uuid4() { return crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)); }
function uuid7() { const ts = BigInt(Date.now()); const r = crypto.getRandomValues(new Uint8Array(10)); const b = new Uint8Array(16); for (let i = 0; i < 6; i++) b[i] = Number((ts >> BigInt(8 * (5 - i))) & 0xffn); b.set(r, 6); b[6] = (b[6] & 0x0f) | 0x70; b[8] = (b[8] & 0x3f) | 0x80; const x = [...b].map((v) => v.toString(16).padStart(2, '0')).join(''); return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`; }
const CROCK = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function ulid() { let ts = Date.now(); let s = ''; for (let i = 0; i < 10; i++) { s = CROCK[ts % 32] + s; ts = Math.floor(ts / 32); } for (let i = 0; i < 16; i++) s += CROCK[rnd(32)]; return s; }
export function uuid(root) {
  let kind = 'v4', count = 5, upper = false, nodash = false;
  const out = h('textarea', { rows: 12, readonly: true, spellcheck: 'false', style: { font: '14px var(--mono)' } });
  const run = () => { const f = { v4: uuid4, v7: uuid7, ulid }[kind]; out.value = Array.from({ length: count }, () => { let v = f(); if (nodash) v = v.replace(/-/g, ''); return upper ? v.toUpperCase() : v; }).join('\n'); };
  root.append(bar(sel([['v4', ['UUID v4 (random)', 'UUID v4 (สุ่ม)']], ['v7', ['UUID v7 (time-ordered)', 'UUID v7 (เรียงตามเวลา)']], ['ulid', 'ULID']], kind, (v) => { kind = v; run(); }), h('label.small', t('Count ', 'จำนวน '), num(count, (v) => { count = Math.max(1, Math.min(1000, v || 1)); run(); }, { min: 1, max: 1000, w: '80px' })), chk(['Uppercase', 'ตัวพิมพ์ใหญ่'], false, (v) => { upper = v; run(); }), chk(['No dashes', 'ไม่มีขีด'], false, (v) => { nodash = v; run(); }), btn(['Generate', 'สร้างใหม่'], run, 'primary'), btn(['Copy', 'คัดลอก'], () => copyText(out.value))), out);
  run();
}

// ---- Password
const WORDS = 'able acid aged also area army away baby back ball band bank base bath bear beat been beer bell belt best bill bird blow blue boat body bomb bond bone book boom born boss both bowl bulk burn bush busy cake call calm came camp card care case cash cast cell chat chip city club coal coat code cold come cook cool cope copy core cost crew crop dark data date dawn days dead deal dean dear debt deep deny desk dial diet dirt disc disk does done door dose down draw drew drop drug dual duke dust duty each earn ease east easy edge else even ever evil exit face fact fail fair fall farm fast fate fear feed feel feet fell felt file fill film find fine fire firm fish five flat flow food foot ford form fort four free from fuel full fund gain game gate gave gear gene gift girl give glad goal goes gold golf gone good gray grew grey grow gulf hair half hall hand hang hard harm hate have head hear heat held hell help here hero high hill hire hold hole holy home hope host hour huge hung hunt hurt idea inch into iron item jack jane jean john join jump jury just keen keep kent kept kick kill kind king knee knew know lack lady laid lake land lane last late lead left less life lift like line link list live load loan lock logo long look lord lose loss lost love luck made mail main make male many mark mass matt meal mean meat meet menu mere mike mile milk mill mind mine miss mode mood moon more most move much must name navy near neck need news next nice nick nine none nose note okay once only onto open oral over pace pack page paid pain pair palm park part pass past path peak pick pink pipe plan play plot plug plus poll pool poor port post pull pure push race rail rain rank rare rate read real rear rely rent rest rice rich ride ring rise risk road rock role roll roof room root rose rule rush ruth safe said sake sale salt same sand save seat seed seek seem seen self sell send sent sept ship shop shot show shut sick side sign site size skin slip slow snow soft soil sold sole some song soon sort soul spot star stay step stop such suit sure take tale talk tall tank tape task team tech tell tend term test text than that them then they thin this thus till time tiny told toll tone took tool tour town tree trip true tune turn twin type unit upon used user vary vast very vice view vote wage wait wake walk wall want ward warm wash wave ways weak wear week well went were west what when whom wide wife wild will wind wine wing wire wise wish with wood word wore work yard yeah year your zero zone'.split(' ');
function strength(bits) { return bits < 40 ? [t('Weak', 'อ่อน'), 'var(--bad)'] : bits < 64 ? [t('Fair', 'พอใช้'), 'var(--warn)'] : bits < 100 ? [t('Strong', 'แข็งแรง'), 'var(--ok)'] : [t('Very strong', 'แข็งแรงมาก'), 'var(--ok)']; }
export function password(root) {
  const o = { len: 20, lower: true, upper: true, digit: true, sym: true, noamb: false, mode: 'chars', words: 5, count: 5 };
  const out = h('textarea', { rows: 6, readonly: true, spellcheck: 'false', style: { font: '15px var(--mono)' } }); const meter = h('div.small');
  const run = () => {
    let bits = 0;
    const list = [];
    for (let k = 0; k < o.count; k++) {
      if (o.mode === 'words') { list.push(Array.from({ length: o.words }, () => WORDS[rnd(WORDS.length)]).join('-')); bits = o.words * Math.log2(WORDS.length); }
      else {
        let pool = ''; if (o.lower) pool += 'abcdefghijklmnopqrstuvwxyz'; if (o.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; if (o.digit) pool += '0123456789'; if (o.sym) pool += '!@#$%^&*()-_=+[]{};:,.?/';
        if (o.noamb) pool = pool.replace(/[Il1O0o]/g, ''); if (!pool) { out.value = ''; return; }
        list.push(Array.from({ length: o.len }, () => pool[rnd(pool.length)]).join('')); bits = o.len * Math.log2(pool.length);
      }
    }
    out.value = list.join('\n'); const [lab, col] = strength(bits); meter.textContent = `${lab} · ~${Math.round(bits)} bits`; meter.style.color = col;
  };
  const rowC = h('div.toolbar'); const rowW = h('div.toolbar');
  rowC.append(h('label.small', t('Length ', 'ความยาว '), num(o.len, (v) => { o.len = Math.max(4, Math.min(128, v || 4)); run(); }, { min: 4, max: 128, w: '80px' })), chk(['a-z', 'a-z'], true, (v) => { o.lower = v; run(); }), chk(['A-Z', 'A-Z'], true, (v) => { o.upper = v; run(); }), chk(['0-9', '0-9'], true, (v) => { o.digit = v; run(); }), chk(['Symbols', 'สัญลักษณ์'], true, (v) => { o.sym = v; run(); }), chk(['Avoid look-alikes', 'เลี่ยงตัวที่คล้ายกัน'], false, (v) => { o.noamb = v; run(); }));
  rowW.append(h('label.small', t('Words ', 'จำนวนคำ '), num(o.words, (v) => { o.words = Math.max(3, Math.min(12, v || 3)); run(); }, { min: 3, max: 12, w: '80px' })));
  const swap = () => { rowC.classList.toggle('hidden', o.mode !== 'chars'); rowW.classList.toggle('hidden', o.mode !== 'words'); };
  root.append(bar(sel([['chars', ['Random characters', 'อักขระสุ่ม']], ['words', ['Passphrase (words)', 'วลีรหัส (คำ)']]], o.mode, (v) => { o.mode = v; swap(); run(); }), btn(['Generate', 'สร้างใหม่'], run, 'primary'), btn(['Copy', 'คัดลอก'], () => copyText(out.value))), rowC, rowW, out, meter, h('div.small.muted', t('Generated locally with crypto.getRandomValues — never sent anywhere.', 'สร้างในเครื่องด้วย crypto.getRandomValues ไม่ถูกส่งไปไหน')));
  swap(); run();
}

// ---- Lorem
const LATIN = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
const THAI = 'การศึกษา ความรู้ นักเรียน โรงเรียน ครู ห้องสมุด หนังสือ วิทยาศาสตร์ คณิตศาสตร์ ภาษาไทย ประวัติศาสตร์ เทคโนโลยี คอมพิวเตอร์ อินเทอร์เน็ต โปรแกรม ระบบ ข้อมูล การพัฒนา ความคิด สร้างสรรค์ ทดลอง เรียนรู้ ฝึกฝน ความพยายาม อนาคต ชุมชน สังคม สิ่งแวดล้อม ธรรมชาติ สุขภาพ กีฬา ดนตรี ศิลปะ วัฒนธรรม ประเพณี อาหาร การเดินทาง มิตรภาพ ครอบครัว ความสุข'.split(' ');
export function lorem(root) {
  let lang = 'la', unit = 'p', n = 3, start = true;
  const out = h('textarea', { rows: 14, readonly: true, spellcheck: 'false', style: { font: '14px/1.6 var(--font)', whiteSpace: 'pre-wrap' } });
  const words = () => (lang === 'la' ? LATIN : THAI);
  const word = () => words()[rnd(words().length)];
  const sentence = () => { const len = 8 + rnd(10); const w = Array.from({ length: len }, word); if (lang === 'la') { w[0] = w[0][0].toUpperCase() + w[0].slice(1); return w.join(' ') + '.'; } return w.join('') + ' '; };
  const para = () => Array.from({ length: 3 + rnd(4) }, sentence).join(lang === 'la' ? ' ' : '').trim();
  const run = () => {
    let r;
    if (unit === 'w') r = Array.from({ length: n }, word).join(lang === 'la' ? ' ' : '');
    else if (unit === 's') r = Array.from({ length: n }, sentence).join(lang === 'la' ? ' ' : '');
    else r = Array.from({ length: n }, para).join('\n\n');
    if (start && lang === 'la' && unit !== 'w') r = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.' + r.slice(r.indexOf('.') + 1);
    out.value = r;
  };
  root.append(bar(sel([['la', 'Lorem ipsum'], ['th', 'ภาษาไทย']], lang, (v) => { lang = v; run(); }), sel([['p', ['Paragraphs', 'ย่อหน้า']], ['s', ['Sentences', 'ประโยค']], ['w', ['Words', 'คำ']]], unit, (v) => { unit = v; run(); }), num(n, (v) => { n = Math.max(1, Math.min(200, v || 1)); run(); }, { min: 1, max: 200, w: '80px' }), chk(['Start with “Lorem ipsum”', 'ขึ้นต้นด้วย “Lorem ipsum”'], true, (v) => { start = v; run(); }), btn(['Generate', 'สร้างใหม่'], run, 'primary'), btn(['Copy', 'คัดลอก'], () => copyText(out.value))), out);
  run();
}

// ---- QR
export async function qr(root) {
  await loadScript('/vendor/lib/qrcode.js'); await loadScript('/vendor/lib/jsQR.js');
  let text = 'https://example.com', level = 'M', size = 280, fg = '#000000', bg = '#ffffff';
  const canvas = h('canvas', { style: { maxWidth: '100%', border: '1px solid var(--border)', borderRadius: '10px', background: '#fff' } });
  const draw = () => {
    try {
      const q = qrcode(0, level); q.addData(text || ' ', 'Byte'); q.make(); const n = q.getModuleCount(); const cell = Math.max(2, Math.floor(size / (n + 8))); const dim = cell * (n + 8);
      canvas.width = dim; canvas.height = dim; const c = canvas.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, dim, dim); c.fillStyle = fg;
      for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (q.isDark(r, k)) c.fillRect((k + 4) * cell, (r + 4) * cell, cell, cell);
    } catch { /* too long */ }
  };
  const scanOut = h('div.outbox', t('Choose an image containing a QR code…', 'เลือกรูปที่มี QR Code…'));
  const ta = h('textarea', { rows: 4, oninput: (e) => { text = e.target.value; draw(); } }, text);
  root.append(h('div.split2',
    h('div.col', h('div.hd', t('Generate', 'สร้าง')), ta,
      bar(sel([['L', 'L 7%'], ['M', 'M 15%'], ['Q', 'Q 25%'], ['H', 'H 30%']], level, (v) => { level = v; draw(); }), num(size, (v) => { size = Math.max(100, Math.min(1200, v || 280)); draw(); }, { min: 100, max: 1200, w: '90px' }), h('input', { type: 'color', value: fg, oninput: (e) => { fg = e.target.value; draw(); } }), h('input', { type: 'color', value: bg, oninput: (e) => { bg = e.target.value; draw(); } })),
      canvas, bar(btn(['Download PNG', 'ดาวน์โหลด PNG'], () => { const a = h('a', { href: canvas.toDataURL('image/png'), download: 'qrcode.png' }); a.click(); }, 'primary'))),
    h('div.col', h('div.hd', t('Scan / read', 'สแกน / อ่าน')), fileInput(async (f) => {
      const bmp = await createImageBitmap(f); const c = h('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0); const d = x.getImageData(0, 0, c.width, c.height);
      const r = jsQR(d.data, d.width, d.height); scanOut.textContent = r ? r.data : t('No QR code found.', 'ไม่พบ QR Code');
    }, 'image/*'), scanOut, bar(btn(['Copy', 'คัดลอก'], () => copyText(scanOut.textContent))))));
  draw();
}

// ---- Random
export function random(root) {
  const out = h('div.outbox', { style: { fontSize: '18px', minHeight: '60px' } });
  let min = 1, max = 100, count = 1, uniq = false;
  const nums = () => { const lo = Math.min(min, max), hi = Math.max(min, max); const span = hi - lo + 1; if (uniq && count > span) count = span; const set = []; while (set.length < count) { const v = lo + rnd(span); if (!uniq || !set.includes(v)) set.push(v); } return set; };
  const items = h('textarea', { rows: 5, placeholder: t('One item per line…', 'หนึ่งรายการต่อบรรทัด…') });
  root.append(h('div.dev-wrap',
    h('div.panel', h('div.sec-title', { style: { marginTop: 0 } }, t('Numbers', 'ตัวเลข')), bar(h('label.small', 'Min ', num(min, (v) => { min = v; })), h('label.small', 'Max ', num(max, (v) => { max = v; })), h('label.small', t('Count ', 'จำนวน '), num(count, (v) => { count = Math.max(1, Math.min(1000, v)); }, { w: '80px' })), chk(['Unique', 'ไม่ซ้ำ'], false, (v) => { uniq = v; }), btn(['Roll', 'สุ่ม'], () => { out.textContent = nums().join(', '); }, 'primary'))),
    h('div.panel', h('div.sec-title', { style: { marginTop: 0 } }, t('Quick', 'แบบเร็ว')), bar(btn(['Die d6', 'ลูกเต๋า 6 หน้า'], () => { out.textContent = String(1 + rnd(6)); }), btn(['Die d20', 'ลูกเต๋า 20 หน้า'], () => { out.textContent = String(1 + rnd(20)); }), btn(['Coin flip', 'โยนเหรียญ'], () => { out.textContent = rnd(2) ? t('Heads', 'หัว') : t('Tails', 'ก้อย'); }))),
    h('div.panel', h('div.sec-title', { style: { marginTop: 0 } }, t('Pick from a list', 'สุ่มเลือกจากรายการ')), items, bar(btn(['Pick one', 'เลือกหนึ่งรายการ'], () => { const l = items.value.split('\n').map((s) => s.trim()).filter(Boolean); out.textContent = l.length ? l[rnd(l.length)] : ''; }, 'primary'), btn(['Shuffle', 'สลับลำดับ'], () => { const l = items.value.split('\n').map((s) => s.trim()).filter(Boolean); for (let i = l.length - 1; i > 0; i--) { const j = rnd(i + 1); [l[i], l[j]] = [l[j], l[i]]; } out.textContent = l.join('\n'); }))),
    out));
}
