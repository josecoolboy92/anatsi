// Language support. The app is written in English; in Amharic every text on the screen is swapped
// for its translation as it appears (whole sentences, and sentences with numbers by pattern).
export const LANGS = { en: 'English', am: 'አማርኛ' };
export function getLang() {
  try { return localStorage.getItem('anatsi.lang') || ''; } catch { return ''; }
}
export function setLang(l) {
  try { localStorage.setItem('anatsi.lang', l); } catch { /* ignore */ }
  location.reload();
}

let exact = null;
let patterns = null;
const cache = new Map();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function compile(list) {
  exact = new Map();
  patterns = [];
  for (const [en, am] of list) {
    if (!en.includes('{}')) { exact.set(en, am); exact.set(en.trim(), am.trim()); continue; }
    const k = en.trim();
    const re = new RegExp('^' + k.split('{}').map(esc).join('([\\s\\S]*?)') + '$');
    // literal text decides how specific a pattern is: generic joins like "{} · {}" go last
    patterns.push({ re, am: am.trim(), len: k.replace(/\{\}/g, '').length });
  }
  patterns.sort((a, b) => b.len - a.len);
}

// fill an Amharic pattern: {} takes the next value, {n} takes value n
function fill(am, vals) {
  let k = 0;
  return am.replace(/\{(\d*)\}/g, (_, d) => {
    const v = d === '' ? vals[k++] : vals[Number(d)];
    return v === undefined ? '' : v;
  });
}

export function tr(s) {
  if (!exact || !s) return s;
  if (cache.has(s)) return cache.get(s);
  let out = s;
  const t = s.trim();
  if (exact.has(t)) out = s.replace(t, exact.get(t));
  else if (t.length > 2 && /[A-Za-z]{2}/.test(t)) {
    // among matching patterns, keep the one that leaves the fewest English words behind
    let best = null;
    for (const p of patterns) {
      const m = p.re.exec(t);
      if (!m) continue;
      let left = 0;
      const vals = m.slice(1).map((v) => {
        if (!v || !/[A-Za-z]{2}/.test(v)) return v;
        const x = tr(v);
        if (x === v) left++;
        return x;
      });
      if (!best || left < best.left) best = { left, text: fill(p.am, vals) };
      if (left === 0) break;
    }
    if (best) out = s.replace(t, best.text);
  }
  if (cache.size > 5000) cache.clear();
  cache.set(s, out);
  return out;
}

function translateTree(root) {
  if (root.nodeType === 3) {
    const v = root.nodeValue;
    const n = tr(v);
    if (n !== v) root.nodeValue = n;
    return;
  }
  if (root.nodeType !== 1) return;
  if (root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.tagName === 'TEXTAREA') return;
  for (const a of ['placeholder', 'aria-label', 'title']) {
    const v = root.getAttribute && root.getAttribute(a);
    if (v) { const n = tr(v); if (n !== v) root.setAttribute(a, n); }
  }
  for (const c of root.childNodes) translateTree(c);
}

export async function startI18n() {
  const lang = getLang();
  document.documentElement.lang = lang || 'en';
  if (lang !== 'am') return;
  const list = (await import('./i18n-am.js')).default;
  compile(list);
  document.title = tr(document.title);
  translateTree(document.body);
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'characterData') translateTree(m.target);
      else for (const n of m.addedNodes) translateTree(n);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true, characterData: true });
}
