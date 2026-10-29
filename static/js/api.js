import { t, getLang } from './i18n.js';

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function upload(url, fd, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.responseType = 'json';
    x.setRequestHeader('X-Lang', getLang());
    x.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
    x.onload = () => {
      const r = x.response;
      if (x.status >= 200 && x.status < 300 && r && r.id) resolve(r);
      else reject(new ApiError(r?.error?.code || 'http_' + x.status, r?.error?.message || t('Upload failed.', 'อัปโหลดไม่สำเร็จ')));
    };
    x.onerror = () => reject(new ApiError('network', t('Network error. Please check your connection.', 'เครือข่ายขัดข้อง กรุณาตรวจสอบการเชื่อมต่อ')));
    x.onabort = () => reject(new ApiError('aborted', 'aborted'));
    if (signal) signal.addEventListener('abort', () => x.abort());
    x.send(fd);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Upload files, wait for the worker, resolve with the finished job view. */
export async function runJob(tool, files, options, { onUpload, onStatus, signal } = {}) {
  const fd = new FormData();
  for (const f of files) fd.append('files', f.blob || f, f.name || f.blob?.name);
  fd.append('options', JSON.stringify(options || {}));
  const { id } = await upload('/api/jobs/' + tool, fd, onUpload, signal);
  let delay = 400;
  for (;;) {
    if (signal?.aborted) { fetch('/api/jobs/' + id, { method: 'DELETE' }).catch(() => {}); throw new ApiError('aborted', 'aborted'); }
    let r;
    try { r = await fetch('/api/jobs/' + id, { cache: 'no-store', headers: { 'X-Lang': getLang() } }); } catch { await sleep(1500); continue; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) throw new ApiError('expired', j.error?.message || t('This job has expired.', 'งานนี้หมดอายุแล้ว'));
    onStatus && onStatus(j);
    if (j.status === 'done') return j;
    if (j.status === 'error') throw new ApiError(j.error?.code || 'error', j.error?.message || t('Processing failed.', 'ประมวลผลไม่สำเร็จ'));
    await sleep(delay);
    delay = Math.min(1200, delay + 100);
  }
}

export const fileUrl = (job, i, inline = false) => `/api/jobs/${job.id}/files/${i}${inline ? '?inline=1' : ''}`;
export const zipUrl = (job) => `/api/jobs/${job.id}/zip`;
export async function fetchJobFile(job, i) {
  const r = await fetch(fileUrl(job, i, true));
  if (!r.ok) throw new ApiError('gone', t('File expired.', 'ไฟล์หมดอายุแล้ว'));
  return r.blob();
}

let caps;
export async function capabilities() {
  if (!caps) { try { caps = await (await fetch('/api/capabilities')).json(); } catch { caps = { tools: {}, ai: false, ocr_langs: [], office: false, max_upload_mb: 100 }; } }
  return caps;
}
