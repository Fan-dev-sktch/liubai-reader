// UI language. The source strings are Simplified Chinese; the table in i18n-data.js
// maps each of them to Traditional Chinese, English and French.
import { STRINGS } from "./i18n-data.js";

export const LANGS = ["zh-CN", "zh-TW", "en", "fr"];
export const LANG_NAMES = { "zh-CN": "简体中文", "zh-TW": "繁體中文", en: "English", fr: "Français" };
const COLUMN = { "zh-TW": 1, en: 2, fr: 3 };

function detect() {
  let pref = "";
  try {
    pref = localStorage.getItem("liubai-lang") || "";
  } catch {}
  if (LANGS.includes(pref)) return pref;
  const sys = String((navigator.languages && navigator.languages[0]) || navigator.language || "zh-CN").toLowerCase();
  if (sys.startsWith("zh")) return /tw|hk|mo|hant/.test(sys) ? "zh-TW" : "zh-CN";
  if (sys.startsWith("fr")) return "fr";
  return sys.startsWith("en") ? "en" : "en";
}

export const lang = detect();
// the language the user picked ("" = follow the phone)
export function langChoice() {
  try {
    const v = localStorage.getItem("liubai-lang") || "";
    return LANGS.includes(v) ? v : "";
  } catch {
    return "";
  }
}
export function setLangChoice(v) {
  try {
    if (v) localStorage.setItem("liubai-lang", v);
    else localStorage.removeItem("liubai-lang");
  } catch {}
}
export const cjkUI = lang.startsWith("zh");
export const locale = lang;

const table = new Map();
if (COLUMN[lang]) for (const row of STRINGS) if (row[COLUMN[lang]]) table.set(row[0], row[COLUMN[lang]]);

// one|other plural forms, picked by {n}
function plural(text, n) {
  if (!text.includes("|") || typeof n !== "number") return text;
  const [one, other] = text.split("|");
  const single = lang === "fr" ? Math.abs(n) < 2 : n === 1;
  return single ? one : other;
}

export function tr(source, vars) {
  let out = table.get(source) || source;
  if (vars) {
    out = plural(out, vars.n);
    out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? m : String(vars[k])));
  }
  return out;
}

// Placeholder authors stay Chinese in storage (so libraries and backups don't depend on the
// UI language) and are translated only when shown.
const placeholders = () => ({
  未知作者: tr("未知作者"),
  本地文本: tr("本地文本"),
  本地网页: tr("本地网页"),
  "本地 PDF": tr("本地 PDF"),
  漫画: tr("漫画"),
});
export const isPlaceholderAuthor = (a) => !a || Object.prototype.hasOwnProperty.call(placeholders(), a);
export const author = (a) => (isPlaceholderAuthor(a) ? placeholders()[a || "未知作者"] : a);

// Translate the fixed text that index.html ships with.
export function localizeDom(root = document.body) {
  document.documentElement.lang = lang;
  if (lang === "zh-CN") return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.data,
      key = raw.trim();
    if (key && table.has(key)) n.data = raw.replace(key, table.get(key));
  }
  // the same Chinese word can need different translations; data-i18n names which one
  for (const el of root.querySelectorAll("[data-i18n]")) if (table.has(el.dataset.i18n)) el.textContent = table.get(el.dataset.i18n);
  for (const el of root.querySelectorAll("[aria-label],[placeholder],[title],[alt]"))
    for (const a of ["aria-label", "placeholder", "title", "alt"]) {
      const v = el.getAttribute(a);
      if (v && table.has(v)) el.setAttribute(a, table.get(v));
    }
}

export const dateText = (d, opts) => new Date(d).toLocaleDateString(locale, opts);
export const timeText = (d, opts) => new Date(d).toLocaleTimeString(locale, opts);
export const dateTimeText = (d, opts) => new Date(d).toLocaleString(locale, opts);
