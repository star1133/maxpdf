import { h, ic, field, checkbox, uid } from '../ui.js';
import { t } from '../i18n.js';
import { PageScroller, drawScrollToggle } from '../pdfview.js';

export const redact = {
  fullWidth: false,
  init(p) { p.opts = { terms: '', regex: false, case: false, sanitize: true }; p.boxes = []; },
  stage(p, stage) {
    const host = h('div.viewer');
    const info = h('div.small.muted', { style: { marginBottom: '8px' } }, t('Drag on a page to cover the area you want to remove permanently.', 'ลากบนหน้าเพื่อคลุมพื้นที่ที่ต้องการลบอย่างถาวร'));
    stage.append(info, drawScrollToggle(host), host);
    const draws = new Map();
    const redraw = (rec) => {
      const S = p.scroller.S; const ov = rec.ov;
      [...ov.querySelectorAll('.redbox')].forEach((n) => n.remove());
      p.boxes.filter((b) => b.page === rec.no).forEach((b) => {
        const n = h('div.redbox', { style: { left: b.x0 * S + 'px', top: b.y0 * S + 'px', width: (b.x1 - b.x0) * S + 'px', height: (b.y1 - b.y0) * S + 'px' } },
          h('button', { title: t('Remove', 'เอาออก'), onpointerdown: (e) => e.stopPropagation(), onclick: () => { p.boxes = p.boxes.filter((x) => x !== b); redraw(rec); count(); } }, '×'));
        ov.append(n);
      });
    };
    const count = () => { p.cnt && (p.cnt.textContent = String(p.boxes.length)); };
    p.scroller = new PageScroller(host, p.files[0].doc, {
      onZoom: (sc) => sc.pages.forEach(redraw),
      onPage(rec) {
        rec.ov.style.cursor = 'crosshair';
        let start = null; let tmp = null;
        rec.ov.addEventListener('pointerdown', (e) => { if (e.target.closest('.redbox')) return; const r = rec.ov.getBoundingClientRect(); start = { x: e.clientX - r.left, y: e.clientY - r.top }; tmp = h('div.box-draw'); rec.ov.append(tmp); rec.ov.setPointerCapture(e.pointerId); });
        rec.ov.addEventListener('pointermove', (e) => { if (!start) return; const r = rec.ov.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; Object.assign(tmp.style, { left: Math.min(start.x, x) + 'px', top: Math.min(start.y, y) + 'px', width: Math.abs(x - start.x) + 'px', height: Math.abs(y - start.y) + 'px' }); });
        rec.ov.addEventListener('pointerup', (e) => {
          if (!start) return; const r = rec.ov.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top; const S = p.scroller.S;
          const b = { page: rec.no, x0: Math.min(start.x, x) / S, y0: Math.min(start.y, y) / S, x1: Math.max(start.x, x) / S, y1: Math.max(start.y, y) / S };
          start = null; tmp.remove(); tmp = null;
          if (b.x1 - b.x0 > 3 && b.y1 - b.y0 > 3) { p.boxes.push(b); redraw(rec); count(); }
        });
      },
    });
  },
  controls(p) {
    p.cnt = h('b', '0');
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div.small', t('Boxes drawn: ', 'กล่องที่วาด: '), p.cnt),
      field(['Find & redact text', 'ค้นหาและลบข้อความ'], h('textarea', { rows: 4, placeholder: t('One word or phrase per line', 'หนึ่งคำหรือวลีต่อบรรทัด'), oninput: (e) => { p.opts.terms = e.target.value; } }), ['Every match in the document is removed.', 'ทุกจุดที่พบในเอกสารจะถูกลบ']),
      checkbox(['Treat as regular expressions', 'ใช้เป็น Regular Expression'], false, (v) => { p.opts.regex = v; }),
      checkbox(['Match case', 'แยกตัวพิมพ์ใหญ่/เล็ก'], false, (v) => { p.opts.case = v; }),
      checkbox(['Also scrub metadata, thumbnails and attachments', 'ล้างเมทาดาตา ภาพย่อ และไฟล์แนบด้วย'], true, (v) => { p.opts.sanitize = v; }));
  },
  collect(p) { return { rects: p.boxes, terms: p.opts.terms.split('\n').map((s) => s.trim()).filter(Boolean), regex: p.opts.regex, case: p.opts.case, sanitize: p.opts.sanitize }; },
  validate(p) { if (!p.boxes.length && !p.opts.terms.trim()) return t('Draw boxes or enter text to redact.', 'วาดกล่องหรือกรอกข้อความที่จะลบ'); },
  summary(p, job) { return h('div', h('p.muted', t(`${job.data.redactions} area(s) permanently removed.`, `ลบแล้วอย่างถาวร ${job.data.redactions} จุด`)), job.data.leaked ? h('div.alert.warn', { style: { textAlign: 'left' } }, t('Some text may still be present in the text layer — please review.', 'อาจยังมีข้อความหลงเหลือในชั้นข้อความ กรุณาตรวจสอบ')) : null); },
  button: ['Redact PDF', 'ปกปิดข้อมูล PDF'], doneTitle: ['Redaction applied!', 'ปกปิดข้อมูลเรียบร้อย!'],
};
