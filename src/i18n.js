// Idioma de la interfaz del editor (no el del juego, que va en el proyecto).
// Los textos se escriben en castellano en el código y t() los traduce con el
// diccionario de i18n-en.js. Las variables van entre llaves: «Quedan {n} bytes».
import { EN } from './i18n-en.js';

const KEY = 'rocinante.idioma';
let lang = detect();

function detect() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch { /* sin almacenamiento */ }
  if (typeof document === 'undefined') return 'es';      // fuera del navegador (pruebas)
  const nav = navigator.languages?.[0] || navigator.language || 'en';
  return /^(es|ca|gl|eu)\b/i.test(nav) ? 'es' : 'en';
}

export const getLang = () => lang;
export function setLang(l) {
  lang = l === 'es' ? 'es' : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* nada */ }
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export function t(s, vars) {
  let r = lang === 'en' ? (EN[s] ?? s) : s;
  if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return r;
}

// Texto que depende del idioma del juego (plantillas, página publicada...)
export const L = (gameLang, es, en) => (gameLang === 'en' ? en : es);
