import { h, ic, field, t, tp, ioPane, bar, btn, sel, num, chk, txt, copyText, kv, loadScript } from './common.js';

export async function diff(root) {
  await loadScript('/vendor/lib/diff.min.js');
  const a = h('textarea', { rows: 12, spellcheck: 'false', placeholder: t('Original…', 'ต้นฉบับ…') });
  const b = h('textarea', { rows: 12, spellcheck: 'false', placeholder: t('Changed…', 'ฉบับแก้ไข…') });
  const out = h('div.outbox', { style: { whiteSpace: 'pre-wrap', fontSize: '13px' } }); const stat = h('div.small.muted');
  let mode = 'lines', ws = false;
  const run = () => {
    const A = a.value, B = b.value; out.replaceChildren();
    const fn = { lines: Diff.diffLines, words: Diff.diffWordsWithSpace, chars: Diff.diffChars }[mode];
    const parts = mode === 'lines' && ws ? Diff.diffTrimmedLines(A, B) : fn(A, B);
    let add = 0, del = 0;
    parts.forEach((p) => { const n = p.count || 0; if (p.added) add += n; else if (p.removed) del += n; out.append(p.added ? h('span.diff-add', p.value) : p.removed ? h('span.diff-del', p.value) : p.value); });
    stat.textContent = `+${add} / −${del} ${mode === 'lines' ? t('lines', 'บรรทัด') : mode === 'words' ? t('tokens', 'โทเคน') : t('chars', 'ตัวอักษร')}`;
  };
  a.addEventListener('input', run); b.addEventListener('input', run);
  root.append(bar(sel([['lines', ['By line', 'ทีละบรรทัด']], ['words', ['By word', 'ทีละคำ']], ['chars', ['By character', 'ทีละตัวอักษร']]], mode, (v) => { mode = v; run(); }), chk(['Ignore whitespace (lines)', 'ไม่สนช่องว่าง (บรรทัด)'], false, (v) => { ws = v; run(); }), stat),
    h('div.split2', h('div.col', h('div.hd', t('Original', 'ต้นฉบับ')), a), h('div.col', h('div.hd', t('Changed', 'ฉบับแก้ไข')), b)), h('div.col', h('div.hd', t('Difference', 'ความแตกต่าง')), out));
}

const words = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z0-9฀-๿]+/).filter(Boolean);
const CASES = [
  [['UPPER CASE', 'ตัวพิมพ์ใหญ่ทั้งหมด (UPPER CASE)'], (s) => s.toUpperCase()], [['lower case', 'ตัวพิมพ์เล็กทั้งหมด (lower case)'], (s) => s.toLowerCase()],
  [['Title Case', 'ขึ้นต้นทุกคำด้วยตัวใหญ่ (Title Case)'], (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, a, c) => a + c.toUpperCase())],
  [['Sentence case', 'ขึ้นต้นประโยคด้วยตัวใหญ่ (Sentence case)'], (s) => s.toLowerCase().replace(/(^\s*|[.!?]\s+)(\S)/g, (_, a, c) => a + c.toUpperCase())],
  ['camelCase', (s) => words(s).map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('')],
  ['PascalCase', (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join('')],
  ['snake_case', (s) => words(s).map((w) => w.toLowerCase()).join('_')],
  ['CONSTANT_CASE', (s) => words(s).map((w) => w.toUpperCase()).join('_')],
  ['kebab-case', (s) => words(s).map((w) => w.toLowerCase()).join('-')],
  ['dot.case', (s) => words(s).map((w) => w.toLowerCase()).join('.')],
  ['path/case', (s) => words(s).map((w) => w.toLowerCase()).join('/')],
  ['aLtErNaTe', (s) => [...s].map((c, i) => (i % 2 ? c.toUpperCase() : c.toLowerCase())).join('')],
];
export function caseConv(root) {
  const input = h('textarea', { rows: 4, placeholder: 'hello world example text', spellcheck: 'false' }); const list = h('div');
  const run = () => { list.replaceChildren(); CASES.forEach(([n, f]) => { const v = f(input.value); list.append(kv(n, h('input', { type: 'text', readonly: true, value: v, style: { fontFamily: 'var(--mono)', fontSize: '13px' } }), h('button.btn.sm', { onclick: () => copyText(v) }, ic('copy')))); }); };
  input.addEventListener('input', run); root.append(field(['Text', 'ข้อความ'], input), h('div', { style: { height: '12px' } }), list); run();
}

export function counter(root) {
  const input = h('textarea', { rows: 14, placeholder: t('Type or paste text…', 'พิมพ์หรือวางข้อความ…') }); const stats = h('div.stat-row', { style: { justifyContent: 'flex-start' } });
  const seg = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
  const run = () => {
    const s = input.value; const chars = [...s].length; const noSp = [...s.replace(/\s/g, '')].length;
    let w = 0; if (seg) { for (const x of seg.segment(s)) if (x.isWordLike) w++; } else w = (s.trim().match(/\S+/g) || []).length;
    const lines = s ? s.split('\n').length : 0; const paras = (s.split(/\n\s*\n/).filter((p) => p.trim()) || []).length; const sent = (s.match(/[^.!?。]+[.!?。]+/g) || []).length;
    const bytes = new TextEncoder().encode(s).length; const read = Math.max(0, Math.ceil(w / 200));
    stats.replaceChildren(...[[w, t('words', 'คำ')], [chars, t('characters', 'ตัวอักษร')], [noSp, t('no spaces', 'ไม่รวมช่องว่าง')], [lines, t('lines', 'บรรทัด')], [paras, t('paragraphs', 'ย่อหน้า')], [sent, t('sentences', 'ประโยค')], [bytes, 'bytes'], [read + ' ' + t('min', 'นาที'), t('reading time', 'เวลาอ่าน')]].map(([v, l]) => h('div.stat', h('b', String(v)), h('span', l))));
  };
  input.addEventListener('input', run); root.append(stats, input); run();
}

export function lines(root) {
  const io = ioPane({ placeholder: 'banana\napple\ncherry\napple', outputLabel: ['Result', 'ผลลัพธ์'] });
  const act = (name, fn) => btn(name, () => { const l = io.input.value.split('\n'); io.output.value = fn(l).join('\n'); io.setStatus(`${io.input.value ? io.input.value.split('\n').length : 0} → ${io.output.value ? io.output.value.split('\n').length : 0} ${t('lines', 'บรรทัด')}`); });
  const coll = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  root.append(bar(act(['Sort A→Z', 'เรียง A→Z'], (l) => [...l].sort(coll.compare)), act(['Sort Z→A', 'เรียง Z→A'], (l) => [...l].sort(coll.compare).reverse()), act(['By length', 'ตามความยาว'], (l) => [...l].sort((a, b) => a.length - b.length)), act(['Reverse', 'กลับลำดับ'], (l) => [...l].reverse()), act(['Shuffle', 'สลับสุ่ม'], (l) => { const a = [...l]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })),
    bar(act(['Remove duplicates', 'ลบบรรทัดซ้ำ'], (l) => [...new Set(l)]), act(['Remove empty', 'ลบบรรทัดว่าง'], (l) => l.filter((x) => x.trim())), act(['Trim', 'ตัดช่องว่างหัวท้าย'], (l) => l.map((x) => x.trim())), act(['Number lines', 'ใส่เลขบรรทัด'], (l) => l.map((x, i) => `${i + 1}. ${x}`)), act(['Duplicates only', 'เฉพาะที่ซ้ำ'], (l) => l.filter((x, i) => l.indexOf(x) !== l.lastIndexOf(x) && l.indexOf(x) === i))), io.el, io.status);
}

export function slug(root) {
  const io = ioPane({ placeholder: 'Hello World! สวัสดีชาวโลก — 2025', outputLabel: ['Slug', 'Slug'], rows: 6 });
  let sep = '-', keepThai = true, lower = true;
  const run = () => {
    let s = io.input.value.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    s = s.replace(keepThai ? /[^A-Za-z0-9฀-๿]+/g : /[^A-Za-z0-9]+/g, sep).replace(new RegExp(`^${sep === '.' ? '\\.' : sep}+|${sep === '.' ? '\\.' : sep}+$`, 'g'), '');
    io.output.value = lower ? s.toLowerCase() : s;
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['-', 'kebab (-)'], ['_', 'snake (_)'], ['.', 'dot (.)']], sep, (v) => { sep = v; run(); }), chk(['Keep Thai characters', 'คงอักษรไทย'], true, (v) => { keepThai = v; run(); }), chk(['lowercase', 'ตัวพิมพ์เล็ก'], true, (v) => { lower = v; run(); })), io.el);
}

export function regex(root) {
  let pat = '(\\w+)@(\\w+\\.\\w+)', flags = 'gi', repl = '<$1 at $2>';
  const text = h('textarea', { rows: 8, spellcheck: 'false', style: { font: '13px var(--mono)' } }, 'Contact: bob@example.com, alice@test.org');
  const hl = h('div.outbox', { style: { whiteSpace: 'pre-wrap' } }); const info = h('div.small'); const list = h('div'); const rep = h('div.outbox');
  const run = () => {
    hl.replaceChildren(); list.replaceChildren(); rep.textContent = '';
    let rx; try { rx = new RegExp(pat, flags); } catch (e) { info.textContent = '✗ ' + e.message; info.style.color = 'var(--bad)'; hl.textContent = text.value; return; }
    info.style.color = 'var(--ok)'; const s = text.value; let last = 0, n = 0; const ms = [];
    if (!flags.includes('g')) { const m = rx.exec(s); if (m) ms.push(m); } else { for (const m of s.matchAll(rx)) { ms.push(m); if (m[0] === '') rx.lastIndex++; if (ms.length > 2000) break; } }
    ms.forEach((m) => { hl.append(s.slice(last, m.index), h('mark', { style: { background: 'color-mix(in srgb,var(--primary) 30%,transparent)', color: 'inherit', borderRadius: '3px' } }, m[0])); last = m.index + m[0].length; n++; });
    hl.append(s.slice(last));
    info.textContent = `✓ ${n} ${t('match(es)', 'รายการที่ตรง')}`;
    ms.slice(0, 50).forEach((m, i) => list.append(h('tr', h('td.muted', '#' + (i + 1)), h('td.mono', m[0]), h('td.small.muted', m.slice(1).map((g, j) => `$${j + 1}=${g ?? ''}`).join('  ')), h('td.small.muted', '@' + m.index))));
    try { rep.textContent = s.replace(rx, repl); } catch { /* ignore */ }
  };
  const flagBox = ['g', 'i', 'm', 's', 'u'].map((f) => h('label.check', { style: { alignItems: 'center' } }, h('input', { type: 'checkbox', checked: flags.includes(f), onchange: (e) => { flags = e.target.checked ? flags + f : flags.replace(f, ''); run(); } }), f));
  root.append(h('div.dev-wrap', h('div.row', h('span.fix.mono', '/'), h('input', { type: 'text', value: pat, spellcheck: 'false', style: { fontFamily: 'var(--mono)' }, oninput: (e) => { pat = e.target.value; run(); } }), h('span.fix.mono', '/'), h('div.fix.wrapflex', flagBox)), info,
    field(['Test string', 'ข้อความทดสอบ'], text), field(['Matches', 'ผลที่ตรง'], hl), h('table.t', list),
    field(['Replace with', 'แทนที่ด้วย'], h('input', { type: 'text', value: repl, style: { fontFamily: 'var(--mono)' }, oninput: (e) => { repl = e.target.value; run(); } })), rep));
  text.addEventListener('input', run); run();
}

// ---- Thai baht text
const TD = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']; const TP = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function readInt(s) {
  if (s === '' || /^0+$/.test(s)) return 'ศูนย์';
  if (s.length > 6) { const hi = s.slice(0, -6), lo = s.slice(-6); return readInt(hi) + 'ล้าน' + (/^0+$/.test(lo) ? '' : readInt(lo)); }
  let r = ''; const n = s.length;
  for (let i = 0; i < n; i++) {
    const d = +s[i], pos = n - i - 1; if (!d) continue;
    if (pos === 1 && d === 1) r += 'สิบ'; else if (pos === 1 && d === 2) r += 'ยี่สิบ'; else if (pos === 0 && d === 1 && n > 1 && s[n - 2] !== '0') r += 'เอ็ด'; else r += TD[d] + TP[pos];
  }
  return r;
}
export function thaiBaht(v) {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(String(v).replace(/,/g, '').trim()); if (!m) return '';
  let [, neg, ip, fp = ''] = m; fp = (fp + '00').slice(0, 2); const sat = +fp;
  let out = (neg ? 'ลบ' : '') + readInt(ip.replace(/^0+(?=\d)/, '')) + 'บาท';
  out += sat ? readInt(fp.replace(/^0+(?=\d)/, '')) + 'สตางค์' : 'ถ้วน';
  return out;
}
export function baht(root) {
  const out = h('div.outbox', { style: { fontSize: '20px', minHeight: '56px', fontFamily: 'var(--font)' } });
  const inp = h('input', { type: 'text', inputmode: 'decimal', placeholder: '1234.50', style: { fontSize: '20px' }, oninput: () => { out.textContent = thaiBaht(inp.value); } });
  root.append(h('div.dev-wrap', field(['Amount (THB)', 'จำนวนเงิน (บาท)'], inp), out, bar(btn(['Copy', 'คัดลอก'], () => copyText(out.textContent))), h('div.small.muted', t('Example: 1234.50 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์', 'ตัวอย่าง: 1234.50 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์'))));
}
