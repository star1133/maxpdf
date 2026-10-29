// Haptic feedback. Android (Chrome/Firefox): Vibration API. iPhone/iPad (Safari 17.4+): the native
// <input switch> toggle fires a system tap when clicked inside a user gesture. Desktop: no-op.
const KEY = 'maxpdf.haptics';
let on = true;
try { on = localStorage.getItem(KEY) !== '0'; } catch { /* storage blocked */ }

const canVibrate = typeof navigator.vibrate === 'function';
const isApple = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const hapticsSupported = () => (canVibrate || isApple) && matchMedia('(pointer:coarse)').matches;
export const hapticsEnabled = () => on;
export function setHaptics(v) { on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } if (on) haptic('success'); }

const PATTERNS = { tap: [8], select: [12], success: [12, 50, 22], warn: [25, 60, 25], error: [45, 40, 45, 40, 70], heavy: [30] };

let sw;
function appleTick() {
  if (!sw) {
    sw = document.createElement('label');
    sw.setAttribute('aria-hidden', 'true');
    sw.style.cssText = 'position:fixed;left:-200px;top:-200px;width:1px;height:1px;opacity:0;pointer-events:none';
    const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
    sw.append(i); document.body.append(sw);
  }
  sw.click();
}

export function haptic(kind = 'tap') {
  if (!on) return;
  const p = PATTERNS[kind] || PATTERNS.tap;
  try {
    if (canVibrate) navigator.vibrate(p);
    else if (isApple) { appleTick(); if (p.length > 1) setTimeout(appleTick, p[0] + p[1] + 20); }
  } catch { /* ignore */ }
}

const TAP_SEL = '.btn,.tab,.seg button,.opt-card,.pos-grid button,.tb,.iconbtn,a.tool,.mainnav a,.preset,.next-tools a,.promo,.pg,.drop,.check';
export function initHaptics() {
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = e.target.closest && e.target.closest(TAP_SEL);
    if (el && !el.disabled) haptic('tap');
  }, { passive: true });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('input[type=checkbox],input[type=range],select')) haptic('select');
  }, { passive: true });
}
