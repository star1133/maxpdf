// Tiny i18n: every string is a pair (en, th).
let lang = 'th';
try {
  lang = localStorage.getItem('maxpdf.lang') || ((navigator.language || '').toLowerCase().startsWith('th') ? 'th' : 'en');
} catch { /* storage may be blocked */ }
export const getLang = () => lang;
export function setLang(l) {
  lang = l;
  try { localStorage.setItem('maxpdf.lang', l); } catch { /* ignore */ }
  document.documentElement.lang = l;
}
export const t = (en, th) => (lang === 'th' && th ? th : en);
// helper for [en, th] pairs
export const tp = (p) => (Array.isArray(p) ? t(p[0], p[1]) : p);
document.documentElement.lang = lang;
