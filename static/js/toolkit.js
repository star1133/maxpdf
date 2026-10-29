// Generic PDF-tool page: dropzone -> workspace (stage + options) -> progress -> result
import { h, ic, clear, fmtBytes, uid, toast, dragSort, renderSchema, downloadBlob } from './ui.js';
import { t, tp } from './i18n.js';
import { runJob, fileUrl, zipUrl, fetchJobFile, capabilities, ApiError } from './api.js';
import { openPdfInteractive, renderToCanvas, thumbRenderer, describePdfError } from './pdfview.js';
import { PDF_TOOLS, byId } from './registry.js';
import { haptic } from './haptics.js';

/** Files passed from a finished tool to the next one ("Continue with…"). */
export const handoff = { files: null };

const CAT_COLOR = { organize: 'organize', optimize: 'optimize', to: 'convert', from: 'convert', edit: 'edit', security: 'security', intel: 'intel' };
const NEXT_BY_CAT = ['compress', 'protect', 'watermark', 'pagenumbers', 'sign', 'merge', 'split', 'pdf2jpg'];

export class ToolPage {
  constructor(host, def, impl) {
    this.host = host; this.def = def; this.impl = impl;
    this.color = `var(--c-${CAT_COLOR[def.cat] || 'dev'})`;
    this.files = []; this.opts = {}; this.state = 'pick'; this.busy = false; this.abort = null;
    this.cap = null;
    this.api = impl.api || def.api || def.id;
    host.style.setProperty('--c', this.color);
  }

  async start() {
    this.caps = await capabilities();
    this.cap = this.caps.tools[this.api] || { accept: ['pdf'], multi: false, max_files: 1 };
    this.accept = this.impl.accept || this.cap.accept;
    this.multi = this.impl.multiple ?? this.cap.multi;
    this.impl.init && this.impl.init(this);
    this.renderAll();
    if (handoff.files && !this.impl.noFiles) {
      const f = handoff.files; handoff.files = null;
      await this.addFiles(f);
    }
    this._bindDrop();
  }

  // -- layout ---------------------------------------------------------------
  renderAll() {
    clear(this.host);
    const d = this.def;
    this.host.append(
      h('div.crumbs', h('a', { href: '/', 'data-link': '' }, t('All tools', 'เครื่องมือทั้งหมด')), ic('chevR'), h('span', tp(d.name))),
      h('div.tool-head', h('h1', tp(d.name)), h('p', tp(d.desc)),
        this.impl.serverSide === false ? null : h('div.privacy-note', ic('shield', ''), t('Files are processed securely and deleted automatically.', 'ไฟล์ถูกประมวลผลอย่างปลอดภัยและลบอัตโนมัติ'))));
    this.alertBox = h('div');
    this.body = h('div');
    this.host.append(this.alertBox, this.body);
    if (this.impl.noFiles || this.files.length) this.renderWork(); else this.renderPick();
  }

  error(msg, kind = 'err') {
    clear(this.alertBox);
    if (msg) this.alertBox.append(h('div.alert.' + kind, { style: { marginBottom: '16px' } }, ic(kind === 'err' ? 'warn' : 'info'), h('div', msg)));
  }

  renderPick() {
    this.state = 'pick';
    clear(this.body);
    const input = h('input', { type: 'file', hidden: true, multiple: this.multi, accept: this.accept.map((e) => '.' + e).join(','), onchange: (e) => { this.addFiles([...e.target.files]); e.target.value = ''; } });
    const label = this.impl.pickLabel || (this.multi ? [`Select ${this.accept.length === 1 ? this.accept[0].toUpperCase() : ''} files`.replace('  ', ' '), 'เลือกไฟล์'] : ['Select file', 'เลือกไฟล์']);
    this.dropEl = h('div.drop', { tabindex: 0, role: 'button', onclick: () => input.click(), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } } },
      h('div.dz-ico', ic(this.def.icon)),
      h('h2', tp(label)),
      h('p', t('or drop files here', 'หรือลากไฟล์มาวางที่นี่')),
      h('p.small', { style: { marginTop: '10px' } }, this.accept.map((e) => '.' + e).join('  ')),
      h('div', { style: { marginTop: '18px' } }, h('button.btn.primary.big', { type: 'button' }, ic('upload'), tp(label))),
      input);
    this.body.append(this.dropEl);
    this.impl.pickExtra && this.body.append(this.impl.pickExtra(this));
  }

  _bindDrop() {
    const over = (e) => { e.preventDefault(); this.dropEl && this.dropEl.classList.add('over'); };
    const leave = () => this.dropEl && this.dropEl.classList.remove('over');
    this.host.addEventListener('dragover', (e) => { if (e.dataTransfer?.types?.includes('Files')) over(e); });
    this.host.addEventListener('dragleave', (e) => { if (e.target === this.dropEl || !this.host.contains(e.relatedTarget)) leave(); });
    this.host.addEventListener('drop', (e) => {
      if (!e.dataTransfer?.files?.length) return;
      e.preventDefault(); leave();
      if (this.state === 'pick' || this.state === 'work') this.addFiles([...e.dataTransfer.files]);
    });
  }

  // -- files ----------------------------------------------------------------
  async addFiles(list) {
    if (this.busy) return;
    this.error('');
    const ok = [];
    for (const f of list) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!this.accept.includes(ext)) { this.error(t(`“${f.name}” is not supported here (${this.accept.join(', ')}).`, `ไม่รองรับไฟล์ “${f.name}” (รองรับ ${this.accept.join(', ')})`)); continue; }
      ok.push(f);
    }
    if (!ok.length) return;
    const room = this.multi ? Math.max(0, (this.cap.max_files || 50) - this.files.length) : 1;
    if (!this.multi) this.files = [];
    for (const f of ok.slice(0, room || 1)) {
      const rec = { id: uid(), file: f, name: f.name, size: f.size, ext: (f.name.split('.').pop() || '').toLowerCase() };
      if (rec.ext === 'pdf') {
        try {
          const r = await openPdfInteractive(f, f.name);
          if (!r) continue;
          rec.doc = r.doc; rec.numPages = r.numPages; rec.password = r.password;
        } catch (e) { this.error(`${f.name}: ${describePdfError(e)}` + (this.def.id === 'repair' ? '' : '')); if (this.def.id !== 'repair') continue; }
      }
      this.files.push(rec);
    }
    if (ok.length > room && this.multi) this.error(t(`Only ${this.cap.max_files} files are allowed.`, `รองรับสูงสุด ${this.cap.max_files} ไฟล์`), 'warn');
    if (!this.files.length) { if (this.state !== 'pick') this.renderPick(); return; }
    this.impl.onFiles && this.impl.onFiles(this);
    this.renderWork();
  }
  removeFile(id) {
    this.files = this.files.filter((f) => f.id !== id);
    this.impl.onFiles && this.impl.onFiles(this);
    if (!this.files.length && !this.impl.noFiles) { this.renderPick(); } else this.renderWork();
  }
  get totalBytes() { return this.files.reduce((a, f) => a + f.size, 0); }

  // -- workspace ------------------------------------------------------------
  renderWork() {
    this.state = 'work';
    clear(this.body);
    const stage = h('div.stage');
    this.stageEl = stage;
    this.optsRoot = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } });
    if (this.impl.schema) this.optsRoot.append(renderSchema(typeof this.impl.schema === 'function' ? this.impl.schema(this) : this.impl.schema, this.opts, () => this.impl.onOpts && this.impl.onOpts(this)));
    if (this.impl.controls) { const c = this.impl.controls(this); c && this.optsRoot.append(c); }
    this.runBtn = h('button.btn.primary.big.block', { type: 'button', onclick: () => this.run() }, tp(this.impl.button || [this.def.name[0], this.def.name[1]]), ic('arrowR'));
    const side = h('aside.side', h('h3', t('Options', 'ตัวเลือก')), h('div.body', this.optsRoot), h('div.foot', this.runBtn));
    this.sideEl = side;
    const wide = this.impl.fullWidth;
    this.body.append(wide ? h('div', stage, side) : h('div.layout', stage, side));
    if (wide) { side.style.position = 'static'; side.style.marginTop = '18px'; }
    if (this.impl.stage) this.impl.stage(this, stage); else this.defaultStage(stage);
    this.impl.afterRender && this.impl.afterRender(this);
  }

  defaultStage(stage) {
    if (this.impl.noFiles && !this.files.length) return;
    const list = h('div.filelist');
    const thumbs = this.files.some((f) => f.doc) ? thumbRenderer(this.files.find((f) => f.doc).doc) : null;
    this.files.forEach((f, i) => {
      const pv = h('div', { style: { minHeight: '120px', display: 'grid', placeItems: 'center', marginBottom: '8px' } });
      if (f.doc) { const c = h('canvas'); pv.append(c); renderToCanvas(f.doc, 1, c, { maxW: 150, maxH: 170 }).catch(() => {}); }
      else if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(f.ext)) { pv.append(h('img.pv', { src: URL.createObjectURL(f.file), alt: '' })); }
      else pv.append(h('div', { style: { color: this.color } }, ic(this.def.icon, ''), h('div.small.muted', '.' + f.ext)));
      list.append(h('div.fcard', { draggable: this.files.length > 1, 'data-id': f.id },
        this.files.length > 1 && h('span.ord', String(i + 1)),
        h('button.x', { title: t('Remove', 'เอาออก'), onclick: () => this.removeFile(f.id) }, ic('x')),
        f.password && h('span.lock', ic('lock')),
        pv, h('div.nm', f.name), h('div.sz', fmtBytes(f.size) + (f.numPages ? ` · ${f.numPages} ${t('pages', 'หน้า')}` : '')),
        this.files.length > 1 && this.impl.sortable !== false && h('div.mv',
          h('button', { type: 'button', 'aria-label': t('Move earlier', 'เลื่อนไปก่อนหน้า'), disabled: i === 0, onclick: () => { haptic('select'); this.moveFile(i, i - 1); } }, ic('chevL')),
          h('button', { type: 'button', 'aria-label': t('Move later', 'เลื่อนไปหลัง'), disabled: i === this.files.length - 1, onclick: () => { haptic('select'); this.moveFile(i, i + 1); } }, ic('chevR')))));
    });
    if (this.multi) {
      const input = h('input', { type: 'file', hidden: true, multiple: true, accept: this.accept.map((e) => '.' + e).join(','), onchange: (e) => { this.addFiles([...e.target.files]); e.target.value = ''; } });
      list.append(h('div.fcard', { style: { display: 'grid', placeItems: 'center', cursor: 'pointer', minHeight: '190px', borderStyle: 'dashed' }, onclick: () => input.click() },
        h('div', { style: { color: this.color } }, ic('plus'), h('div', { style: { fontWeight: 600, marginTop: '4px' } }, t('Add more', 'เพิ่มไฟล์')), input)));
    }
    dragSort(list, '.fcard[data-id]', (from, to) => { haptic('select'); this.moveFile(from, to); });
    stage.append(list);
    if (this.files.length > 1 && this.impl.sortable !== false) {
      stage.append(h('div.row', { style: { marginTop: '12px', justifyContent: 'flex-start' } },
        h('button.btn.sm', { onclick: () => { this.files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); this.renderWork(); } }, ic('sort'), 'A → Z'),
        h('span.small.muted.fix', t('Drag to reorder', 'ลากเพื่อสลับลำดับ'))));
    }
    thumbs && thumbs.stop();
  }

  moveFile(from, to) { if (to < 0 || to >= this.files.length) return; const [m] = this.files.splice(from, 1); this.files.splice(to, 0, m); this.renderWork(); }

  setBusyOptions(on) { this.runBtn && (this.runBtn.disabled = on); }

  // -- run ------------------------------------------------------------------
  collectOptions() {
    const o = { ...(this.impl.collect ? this.impl.collect(this) : this.opts) };
    const pw = {};
    this.files.forEach((f, i) => { if (f.password) pw[i] = f.password; });
    if (Object.keys(pw).length) { o.passwords = pw; if (this.files.length === 1) o.password = this.files[0].password; }
    return o;
  }

  async run() {
    if (this.busy) return;
    this.error('');
    if (this.files.length < (this.impl.minFiles ?? this.cap.min_files ?? 1) && !this.impl.noFiles) { this.error(t(`Add at least ${this.cap.min_files} files.`, `เพิ่มไฟล์อย่างน้อย ${this.cap.min_files} ไฟล์`)); return; }
    const bad = this.impl.validate && (await this.impl.validate(this));
    if (bad) { this.error(bad); return; }
    const limit = (this.caps.max_upload_mb || 100) * 1048576;
    if (this.totalBytes > limit) { this.error(t(`Files are larger than ${this.caps.max_upload_mb} MB in total.`, `ไฟล์รวมกันใหญ่เกิน ${this.caps.max_upload_mb} MB`)); return; }
    this.busy = true;
    const options = this.collectOptions();
    let upFiles = this.impl.buildFiles ? await this.impl.buildFiles(this) : this.files.map((f) => f.file);
    const extra = this.impl.extraFiles ? await this.impl.extraFiles(this) : [];
    upFiles = [...upFiles, ...extra];
    this.abort = new AbortController();
    const view = h('div.center-box.panel', { style: { textAlign: 'center' } });
    const title = h('h2', { style: { fontSize: '22px' } }, t('Uploading…', 'กำลังอัปโหลด…'));
    const sub = h('div.muted.small', '');
    const bar = h('div.bar', h('i'));
    view.append(h('div', { style: { color: this.color } }, ic(this.def.icon, '')), title, bar, sub,
      h('button.btn.sm.ghost', { style: { marginTop: '12px' }, onclick: () => this.abort.abort() }, t('Cancel', 'ยกเลิก')));
    clear(this.body); this.body.append(view);
    this.state = 'busy';
    const setBar = (p) => { bar.firstChild.style.width = Math.round(p * 100) + '%'; };
    try {
      const job = await runJob(this.api, upFiles, options, {
        signal: this.abort.signal,
        onUpload: (p) => { setBar(p * 0.5); sub.textContent = Math.round(p * 100) + '%'; if (p >= 1) { title.textContent = t('Processing…', 'กำลังประมวลผล…'); bar.classList.add('indet'); } },
        onStatus: (j) => {
          if (j.status === 'queued') { title.textContent = t('Waiting in queue…', 'รอคิวประมวลผล…'); sub.textContent = t(`Position ${j.position}`, `ลำดับที่ ${j.position}`); }
          else if (j.status === 'running') { title.textContent = t('Processing…', 'กำลังประมวลผล…'); const p = j.progress || {}; sub.textContent = p.msg || ''; if (p.p > 0) { bar.classList.remove('indet'); setBar(0.5 + p.p * 0.5); } }
        },
      });
      await this.showResult(job);
    } catch (e) {
      this.busy = false;
      if (e instanceof ApiError && e.code === 'aborted') { this.renderWork(); return; }
      haptic('error');
      this.renderWork();
      this.error(e.message || String(e));
      this.impl.onError && this.impl.onError(this, e);
    }
    this.busy = false;
  }

  // -- result ---------------------------------------------------------------
  async showResult(job) {
    this.state = 'result';
    this.job = job;
    clear(this.body);
    if (this.impl.onResult) { const done = await this.impl.onResult(this, job, this.body); if (done) return; }
    haptic('success');
    const mains = (job.outputs || []).filter((o) => o.role === 'main');
    const box = h('div.result');
    box.append(h('div.done-h', ic('check'), h('h2', tp(this.impl.doneTitle || ['Done', 'เสร็จแล้ว']))));
    if (this.impl.summary) { const s = this.impl.summary(this, job); s && box.append(s); }
    mains.forEach((o) => box.append(h('div.outfile', ic('file'), h('div.nm', h('b', o.name), h('span', fmtBytes(o.size))),
      h('a.btn' + (mains.length === 1 ? '.primary' : ''), { href: fileUrl(job, o.index), download: o.name, onclick: () => haptic('tap') }, ic('download'), t('Download', 'ดาวน์โหลด')))));
    const actions = h('div.result-actions');
    if (mains.length > 1) actions.append(h('a.btn.primary', { href: zipUrl(job), download: 'maxpdf_files.zip' }, ic('download'), t('Download all (ZIP)', 'ดาวน์โหลดทั้งหมด (ZIP)')));
    actions.append(h('button.btn', { onclick: () => { this.files = []; this.opts = {}; this.impl.init && this.impl.init(this); this.renderAll(); } }, ic('arrowL'), t('Start over', 'เริ่มใหม่')));
    box.append(actions, h('p.small.muted', { style: { marginTop: '14px' } }, t('Files are deleted from the server automatically after a short time.', 'ไฟล์จะถูกลบออกจากเซิร์ฟเวอร์อัตโนมัติหลังจากนี้ไม่นาน')));
    // preview + continue chips for single PDF output
    const pdfOut = mains.length === 1 && mains[0].name.toLowerCase().endsWith('.pdf') ? mains[0] : null;
    if (pdfOut) {
      const pv = h('div.preview-wrap');
      box.append(pv);
      fetchJobFile(job, pdfOut.index).then(async (blob) => {
        const f = new File([blob], pdfOut.name, { type: 'application/pdf' });
        this.resultFile = f;
        const r = await openPdfInteractive(f, f.name).catch(() => null);
        if (r) { const c = h('canvas'); pv.append(c); await renderToCanvas(r.doc, 1, c, { maxW: 260, maxH: 340 }); }
        this.nextChips(box);
      }).catch(() => {});
    }
    this.body.append(box);
  }

  nextChips(box) {
    const chips = NEXT_BY_CAT.filter((id) => id !== this.def.id).slice(0, 7).map((id) => byId(id, PDF_TOOLS)).filter(Boolean);
    box.append(h('div.next-tools', h('h2.sec-title', { style: { margin: '0 0 10px' } }, t('Continue with', 'ทำต่อด้วย')),
      h('div.wrapflex', chips.map((c) => h('a', { href: '/pdf/' + c.id, 'data-link': '', onclick: () => { handoff.files = [this.resultFile]; } }, ic(c.icon), tp(c.name))))));
  }
}

/** Standard summary block helper: stats chips */
export function statRow(items) {
  return h('div.stat-row', items.map(([v, l]) => h('div.stat', h('b', String(v)), h('span', l))));
}
export { renderToCanvas };
