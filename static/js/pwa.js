// PWA: service worker, install button, update + offline notices
import { h, ic, $, modal, toast, clear } from './ui.js';
import { t } from './i18n.js';

let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// The install action lives in the footer (not the top bar, where a download-style icon read as a file download).
export function paintInstall() {
  const b = $('#btn-install'); if (!b) return;
  clear(b); b.append(ic('install'), h('span', t('Install as an app', 'ติดตั้งเป็นแอป')));
  b.classList.toggle('hidden', standalone());
}

async function onInstallClick() {
  if (deferred) {
    deferred.prompt();
    const r = await deferred.userChoice.catch(() => null);
    deferred = null;
    if (r && r.outcome === 'accepted') toast(t('Installing…', 'กำลังติดตั้ง…'));
    return;
  }
  const steps = isIOS()
    ? [t('Tap the Share button in Safari', 'แตะปุ่มแชร์ใน Safari'), t('Choose “Add to Home Screen”', 'เลือก “เพิ่มไปยังหน้าจอโฮม”'), t('Tap “Add”', 'แตะ “เพิ่ม”')]
    : [t('Open your browser menu (⋮)', 'เปิดเมนูของเบราว์เซอร์ (⋮)'), t('Choose “Install app” or “Add to Home screen”', 'เลือก “ติดตั้งแอป” หรือ “เพิ่มไปยังหน้าจอหลัก”'), t('Confirm', 'ยืนยัน')];
  await modal({ title: t('Install MaxPDF', 'ติดตั้ง MaxPDF'), body: h('div', h('p.muted', { style: { marginTop: 0 } }, t('It works like an app: its own window, home-screen icon and offline dev tools.', 'ใช้งานได้เหมือนแอป: มีหน้าต่างของตัวเอง ไอคอนบนหน้าจอ และเครื่องมือ Dev ใช้ออฟไลน์ได้')), h('ol', steps.map((s) => h('li', { style: { margin: '6px 0' } }, s)))), buttons: [{ label: 'OK', primary: true, value: true }] });
}

export function initPWA() {
  paintInstall();
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('#btn-install')) onInstallClick(); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; paintInstall(); });
  window.addEventListener('appinstalled', () => { deferred = null; paintInstall(); toast(t('Installed!', 'ติดตั้งแล้ว!')); });
  matchMedia('(display-mode: standalone)').addEventListener?.('change', paintInstall);
  window.addEventListener('offline', () => toast(t('You are offline — dev tools still work.', 'ออฟไลน์อยู่ — เครื่องมือ Dev ยังใช้ได้'), 4000));
  window.addEventListener('online', () => toast(t('Back online', 'กลับมาออนไลน์แล้ว')));
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).then((reg) => {
    const announce = (sw) => {
      if (!sw) return;
      sw.addEventListener('statechange', () => {
        if (sw.state === 'installed' && navigator.serviceWorker.controller) {
          const bar = h('div.toast', { style: { pointerEvents: 'auto', display: 'flex', gap: '12px', alignItems: 'center' } }, t('A new version is available.', 'มีเวอร์ชันใหม่'), h('button.btn.sm', { onclick: () => { sw.postMessage('skipWaiting'); } }, t('Update', 'อัปเดต')));
          $('#toast-root').append(bar);
        }
      });
    };
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);
    reg.addEventListener('updatefound', () => announce(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 3600_000);
  }).catch(() => {});
  // Reload only when an *update* takes over, never on first install (no previous controller).
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!hadController || reloaded) return; reloaded = true; location.reload(); });
}
