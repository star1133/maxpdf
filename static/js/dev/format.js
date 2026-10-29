import { h, ic, field, t, tp, ioPane, bar, btn, sel, num, chk, txt, outbox, loadScript, downloadText, copyText } from './common.js';

const lib = (f) => loadScript('/vendor/lib/' + f);

// ---------------------------------------------------------------- JSON
function sortKeys(v) { if (Array.isArray(v)) return v.map(sortKeys); if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])); return v; }
function jsonErrorPos(src, e) {
  const m = /position (\d+)/.exec(e.message); if (!m) return e.message;
  const pos = +m[1]; const upto = src.slice(0, pos); const line = upto.split('\n').length; const col = pos - upto.lastIndexOf('\n');
  return `${e.message.replace(/ in JSON at position \d+.*/, '')} — line ${line}, column ${col}`;
}
export function json(root) {
  const io = ioPane({ placeholder: '{"hello":"world"}', outputLabel: ['Result', 'ผลลัพธ์'] });
  let indent = '2', sort = false;
  const run = (mode) => {
    const src = io.input.value; if (!src.trim()) { io.output.value = ''; io.setStatus(''); return; }
    try {
      let v = JSON.parse(src); if (sort) v = sortKeys(v);
      io.output.value = mode === 'min' ? JSON.stringify(v) : JSON.stringify(v, null, indent === 'tab' ? '\t' : +indent);
      io.setStatus('✓ ' + t('Valid JSON', 'JSON ถูกต้อง') + ` · ${src.length} → ${io.output.value.length} ${t('chars', 'ตัวอักษร')}`);
    } catch (e) { io.output.value = ''; io.setStatus('✗ ' + jsonErrorPos(src, e), false); }
  };
  io.input.addEventListener('input', () => run('fmt'));
  root.append(bar(btn(['Format', 'จัดรูปแบบ'], () => run('fmt'), 'primary'), btn(['Minify', 'ย่อ'], () => run('min')), sel([['2', ['2 spaces', '2 เว้นวรรค']], ['4', ['4 spaces', '4 เว้นวรรค']], ['tab', 'Tab']], indent, (v) => { indent = v; run('fmt'); }), chk(['Sort keys', 'เรียงคีย์'], false, (v) => { sort = v; run('fmt'); })), io.el, io.status);
}

// ---------------------------------------------------------------- JSON -> TypeScript
export function jsonTs(root) {
  const io = ioPane({ placeholder: '{"id":1,"name":"Max","tags":["a"],"profile":{"age":17}}', outputLabel: ['TypeScript', 'TypeScript'] });
  let rootName = 'Root', useType = false, optional = false;
  const cap = (s) => s.replace(/(^|[^a-zA-Z0-9]+)(.)/g, (_, __, c) => c.toUpperCase()).replace(/[^a-zA-Z0-9]/g, '') || 'Item';
  function gen() {
    let v; try { v = JSON.parse(io.input.value); } catch (e) { io.output.value = ''; io.setStatus('✗ ' + e.message, false); return; }
    io.setStatus('');
    const defs = [];
    const kw = useType ? 'type' : 'interface';
    const typeOf = (val, name) => {
      if (val === null) return 'null';
      if (Array.isArray(val)) { if (!val.length) return 'unknown[]'; const ts = [...new Set(val.map((x) => typeOf(x, name)))]; return (ts.length > 1 ? `(${ts.join(' | ')})` : ts[0]) + '[]'; }
      if (typeof val === 'object') { const n = cap(name); const lines = Object.entries(val).map(([k, x]) => `  ${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}${optional ? '?' : ''}: ${typeOf(x, k)};`); defs.push(useType ? `type ${n} = {\n${lines.join('\n')}\n};` : `interface ${n} {\n${lines.join('\n')}\n}`); return n; }
      return typeof val;
    };
    const top = typeOf(v, rootName);
    io.output.value = defs.length ? defs.join('\n\n') : `type ${cap(rootName)} = ${top};`;
  }
  io.input.addEventListener('input', gen);
  root.append(bar(txt(rootName, (v) => { rootName = v || 'Root'; gen(); }, t('Root name', 'ชื่อ root'), '150px'), chk(['Use type aliases', 'ใช้ type แทน interface'], false, (v) => { useType = v; gen(); }), chk(['Optional fields', 'ทุกฟิลด์เป็น optional'], false, (v) => { optional = v; gen(); })), io.el, io.status);
}

// ---------------------------------------------------------------- YAML
export function yaml(root) {
  const io = ioPane({ placeholder: 'name: Max\nitems:\n  - a\n  - b', outputLabel: ['Result', 'ผลลัพธ์'] });
  let dir = 'y2j';
  const run = async () => {
    await lib('js-yaml.min.js');
    const src = io.input.value; if (!src.trim()) { io.output.value = ''; return; }
    try { io.output.value = dir === 'y2j' ? JSON.stringify(jsyaml.load(src), null, 2) : jsyaml.dump(JSON.parse(src), { indent: 2, lineWidth: 120 }); io.setStatus('✓ ' + t('Converted', 'แปลงแล้ว')); }
    catch (e) { io.output.value = ''; io.setStatus('✗ ' + String(e.message).split('\n')[0], false); }
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['y2j', 'YAML → JSON'], ['j2y', 'JSON → YAML']], dir, (v) => { dir = v; run(); })), io.el, io.status);
}

// ---------------------------------------------------------------- CSV
function parseCSV(text, delim) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
export function csv(root) {
  const io = ioPane({ placeholder: 'name,age\nMax,17', outputLabel: ['Result', 'ผลลัพธ์'] });
  let dir = 'c2j', delim = ',', header = true;
  const run = () => {
    const src = io.input.value; if (!src.trim()) { io.output.value = ''; return; }
    try {
      if (dir === 'c2j') {
        const rows = parseCSV(src, delim === 'tab' ? '\t' : delim).filter((r) => r.length > 1 || r[0] !== '');
        const conv = (v) => (v !== '' && !isNaN(v) && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : v);
        const out = header ? rows.slice(1).map((r) => Object.fromEntries(rows[0].map((k, i) => [k, conv(r[i] ?? '')]))) : rows.map((r) => r.map(conv));
        io.output.value = JSON.stringify(out, null, 2);
      } else {
        const data = JSON.parse(src); const arr = Array.isArray(data) ? data : [data];
        const d = delim === 'tab' ? '\t' : delim; const esc = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /["\n\r]/.test(s) || s.includes(d) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const keys = [...new Set(arr.flatMap((o) => (o && typeof o === 'object' ? Object.keys(o) : [])))];
        io.output.value = (keys.length ? [keys.map(esc).join(d), ...arr.map((o) => keys.map((k) => esc(o[k])).join(d))] : arr.map((r) => (Array.isArray(r) ? r.map(esc).join(d) : esc(r)))).join('\n');
      }
      io.setStatus('✓ ' + t('Converted', 'แปลงแล้ว'));
    } catch (e) { io.output.value = ''; io.setStatus('✗ ' + e.message, false); }
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['c2j', 'CSV → JSON'], ['j2c', 'JSON → CSV']], dir, (v) => { dir = v; run(); }), sel([[',', [', comma', ', จุลภาค']], [';', ['; semicolon', '; อัฒภาค']], ['tab', 'Tab'], ['|', ['| pipe', '| ขีดตั้ง']]], delim, (v) => { delim = v; run(); }), chk(['First row is header', 'แถวแรกเป็นหัวตาราง'], true, (v) => { header = v; run(); })), io.el, io.status);
}

// ---------------------------------------------------------------- Beautifier
export function beautify(root) {
  const io = ioPane({ placeholder: '<div><p>Hello</p></div>', outputLabel: ['Result', 'ผลลัพธ์'] });
  let lang = 'html', indent = 2;
  const minify = (src) => {
    if (lang === 'css') return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').replace(/;}/g, '}').trim();
    if (lang === 'html') return src.replace(/<!--[\s\S]*?-->/g, '').replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
  };
  const run = async (mode) => {
    await Promise.all(['beautify.js', 'beautify-css.js', 'beautify-html.js'].map(lib));
    const src = io.input.value; if (!src.trim()) { io.output.value = ''; return; }
    const o = { indent_size: indent, wrap_line_length: 100, preserve_newlines: true, max_preserve_newlines: 2 };
    try {
      io.output.value = mode === 'min' ? minify(src) : lang === 'css' ? css_beautify(src, o) : lang === 'js' ? js_beautify(src, o) : html_beautify(src, o);
      io.setStatus(`${src.length} → ${io.output.value.length} ${t('chars', 'ตัวอักษร')}`);
    } catch (e) { io.setStatus('✗ ' + e.message, false); }
  };
  io.input.addEventListener('input', () => run('fmt'));
  root.append(bar(sel([['html', 'HTML'], ['css', 'CSS'], ['js', 'JavaScript']], lang, (v) => { lang = v; run('fmt'); }), sel([[2, ['2 spaces', '2 เว้นวรรค']], [4, ['4 spaces', '4 เว้นวรรค']]], indent, (v) => { indent = +v; run('fmt'); }), btn(['Beautify', 'จัดรูปแบบ'], () => run('fmt'), 'primary'), btn(['Minify (basic)', 'ย่อ (เบื้องต้น)'], () => run('min'))), io.el, io.status);
}

// ---------------------------------------------------------------- SQL
export function sql(root) {
  const io = ioPane({ placeholder: 'select id,name from users where age>18 order by name', outputLabel: ['Formatted', 'จัดรูปแบบแล้ว'] });
  let dialect = 'sql', upper = true;
  const run = async () => {
    await lib('sql-formatter.min.js');
    const src = io.input.value; if (!src.trim()) { io.output.value = ''; return; }
    try { io.output.value = sqlFormatter.format(src, { language: dialect, keywordCase: upper ? 'upper' : 'preserve', tabWidth: 2 }); io.setStatus(''); } catch (e) { io.setStatus('✗ ' + e.message.split('\n')[0], false); }
  };
  io.input.addEventListener('input', run);
  root.append(bar(sel([['sql', 'Standard SQL'], ['mysql', 'MySQL'], ['postgresql', 'PostgreSQL'], ['sqlite', 'SQLite'], ['transactsql', 'T-SQL'], ['mariadb', 'MariaDB'], ['bigquery', 'BigQuery']], dialect, (v) => { dialect = v; run(); }), chk(['UPPERCASE keywords', 'คีย์เวิร์ดตัวพิมพ์ใหญ่'], true, (v) => { upper = v; run(); })), io.el, io.status);
}

// ---------------------------------------------------------------- XML
export function xml(root) {
  const io = ioPane({ placeholder: '<root><a>1</a><b>2</b></root>', outputLabel: ['Formatted', 'จัดรูปแบบแล้ว'] });
  const fmt = (src, ind) => {
    const doc = new DOMParser().parseFromString(src, 'application/xml'); const err = doc.querySelector('parsererror'); if (err) throw new Error(err.textContent.split('\n')[0]);
    const out = []; const pad = (n) => ' '.repeat(n * ind);
    const walk = (n, d) => {
      if (n.nodeType === 3) { const s = n.nodeValue.trim(); if (s) out.push(pad(d) + s.replace(/&/g, '&amp;').replace(/</g, '&lt;')); return; }
      if (n.nodeType === 4) { out.push(pad(d) + `<![CDATA[${n.nodeValue}]]>`); return; }
      if (n.nodeType === 8) { out.push(pad(d) + `<!--${n.nodeValue}-->`); return; }
      if (n.nodeType !== 1) return;
      const attrs = [...n.attributes].map((a) => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`).join('');
      const kids = [...n.childNodes].filter((c) => c.nodeType !== 3 || c.nodeValue.trim());
      if (!kids.length) out.push(`${pad(d)}<${n.nodeName}${attrs}/>`);
      else if (kids.length === 1 && kids[0].nodeType === 3) out.push(`${pad(d)}<${n.nodeName}${attrs}>${kids[0].nodeValue.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;')}</${n.nodeName}>`);
      else { out.push(`${pad(d)}<${n.nodeName}${attrs}>`); kids.forEach((c) => walk(c, d + 1)); out.push(`${pad(d)}</${n.nodeName}>`); }
    };
    const decl = /^\s*<\?xml[^>]*\?>/.exec(src); if (decl) out.push(decl[0].trim());
    walk(doc.documentElement, 0); return out.join('\n');
  };
  let ind = 2;
  const run = () => { const s = io.input.value; if (!s.trim()) { io.output.value = ''; return; } try { io.output.value = fmt(s, ind); io.setStatus('✓ ' + t('Well-formed XML', 'XML ถูกต้อง')); } catch (e) { io.output.value = ''; io.setStatus('✗ ' + e.message, false); } };
  io.input.addEventListener('input', run);
  root.append(bar(sel([[2, ['2 spaces', '2 เว้นวรรค']], [4, ['4 spaces', '4 เว้นวรรค']]], ind, (v) => { ind = +v; run(); })), io.el, io.status);
}

// ---------------------------------------------------------------- Markdown
export function markdown(root) {
  const input = h('textarea', { rows: 20, spellcheck: 'false', style: { minHeight: '420px', font: '13px/1.5 var(--mono)' } }, '# สวัสดี Markdown\n\nWrite **bold**, *italic*, `code`, and lists:\n\n- item one\n- item two\n\n> quote\n\n```js\nconsole.log("hi");\n```\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
  const prev = h('div.outbox', { style: { fontFamily: 'var(--font)', minHeight: '420px', whiteSpace: 'normal', fontSize: '15px', lineHeight: 1.6 } });
  const css = h('style', '.md-prev h1,.md-prev h2,.md-prev h3{margin:.8em 0 .4em}.md-prev pre{background:var(--surface);border:1px solid var(--border);padding:10px;border-radius:8px;overflow:auto}.md-prev code{background:var(--surface);padding:1px 5px;border-radius:4px;font-family:var(--mono)}.md-prev pre code{padding:0;background:none}.md-prev blockquote{margin:0;padding-left:14px;border-left:3px solid var(--border2);color:var(--muted)}.md-prev table{border-collapse:collapse}.md-prev td,.md-prev th{border:1px solid var(--border2);padding:4px 10px}.md-prev img{max-width:100%}');
  prev.classList.add('md-prev');
  const run = async () => { await Promise.all([lib('marked.min.js'), lib('purify.min.js')]); prev.innerHTML = DOMPurify.sanitize(marked.parse(input.value, { gfm: true, breaks: false })); };
  input.addEventListener('input', run); run();
  root.append(css, bar(btn(['Copy HTML', 'คัดลอก HTML'], async () => { await run(); copyText(prev.innerHTML); }), btn(['Download .md', 'ดาวน์โหลด .md'], () => downloadText(input.value, 'document.md', 'text/markdown'))),
    h('div.split2', h('div.col', h('div.hd', 'Markdown'), input), h('div.col', h('div.hd', t('Preview', 'พรีวิว')), prev)));
}
