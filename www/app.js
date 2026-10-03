import { BookPager } from "./pager.js";
import {
  escapeHTML as E,
  uid,
  store,
  saveBook,
  deleteBook,
  initialState,
  hash,
  parseEpub,
  parseTxt,
  parseHtml,
  demoBook,
  loadContent,
  thumbnail,
  epubNav,
  inferDepth, asBuffer, packImages } from "./books.js";
import { parseMobi, parseFb2, parseCbz, comicPages, comicPageURL } from "./formats.js";
import { tr, lang, cjkUI, locale, author, isPlaceholderAuthor, localizeDom, dateText, timeText, dateTimeText, LANGS, LANG_NAMES, langChoice, setLangChoice } from "./i18n.js";
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const VERSION = "2.2.0";
// the glyph that previews a theme or font
const SAMPLE = cjkUI ? "文" : "Aa";
const pageLabel = (n) => tr("第 {n} 页", { n });
const chapterLabel = (n) => tr("第 {n} 章", { n });
const sectionLabel = (n) => tr("第 {n} 节", { n });
const CONTACT = { email: "f5864131477@gmail.com", wechat: "f5864131477" };
const paths = {
  library: "M3 4h4v16H3z M10 4h4v16h-4z M17 4l4 1-3 15-4-1",
  book: "M3 4h6a3 3 0 013 3v14a4 4 0 00-4-2H3z M12 7a3 3 0 013-3h6v15h-5a4 4 0 00-4 2",
  check: "M5 12l4 4L19 6",
  archive: "M4 8h16v13H4z M2 3h20v5H2z M9 12h6",
  person: "M16 7a4 4 0 11-8 0 4 4 0 018 0 M4 21v-2a7 7 0 0116 0v2",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 11-20 0 10 10 0 0120 0",
  moon: "M20 15A9 9 0 019 3a9 9 0 1011 12",
  plus: "M12 5v14 M5 12h14",
  search: "M21 21l-5-5 M18 10a8 8 0 11-16 0 8 8 0 0116 0",
  back: "M19 12H5 M11 6l-6 6 6 6",
  list: "M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01",
  bookmark: "M6 3h12v18l-6-4-6 4z",
  type: "M3 20L10 3l7 17 M5 15h10 M17 10h6 M20 10v10",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  close: "M6 6l12 12 M18 6L6 18",
  highlight: "M15 3l6 6-10 10-6-6z M5 13l-2 7 7-2 M3 23h18",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  download: "M12 3v12 M7 10l5 5 5-5 M3 15v6h18v-6",
  sun: "M12 7a5 5 0 110 10 5 5 0 010-10 M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  grid: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  timer: "M12 8v5l3 2 M9 2h6 M12 4a9 9 0 100 18 9 9 0 000-18",
  minus: "M5 12h14",
  sort: "M7 10l5 5 5-5",
  sortby: "M4 7h16 M7 12h10 M10 17h4",
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
}
function icons(root = document) {
  root
    .querySelectorAll("[data-icon]")
    .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
}
icons();
localizeDom();
document.title = tr("留白");
window.LiubaiAndroid?.setLanguage?.(lang);
let books = [],
  states = {},
  settings = {
    theme: "light",
    font: "serif",
    size: 19,
    leading: 1.85,
    width: 720,
    margin: 24,
    mode: "page",
    readerEngine: 2,
    fullscreen: false,
    focusPreferenceVersion: 2,
    followSystem: false,
    pureBlack: false,
    brightnessMode: "system",
    fadeEdges: true,
    paragraph: 0.6,
    animation: "slide",
    brightness: -1,
    indent: true,
    tapMode: "split",
    volumeKeys: true,
    keepAwake: true,
    statusBar: true,
    letter: 0,
    autoSeconds: 30,
    scrollSpeed: 40,
    libraryView: "grid",
    librarySort: "recent",
    lightTheme: "light",
    cpm: 450,
    cpmLatin: 1200,
    statusMode: "chapter",
    origFmt: true,
    zh: "",
    orientation: "auto",
  },
  current = null,
  state = null,
  filter = "all",
  panelType = "",
  selected = null,
  pdf = null,
  pdfLib = null,
  pdfRender = null,
  pdfZoom = 1,
  comic = null,
  pdfOutline = null,
  renderTicket = 0,
  saveTimer = null,
  toastTimer = null,
  searchTicket = 0,
  isBusy = false;
// 布面颜色：靛、黛绿、藕荷、秋香、石青、玄
const colors = ["#2c4766", "#3e5a50", "#7d6b78", "#837a52", "#4d6876", "#34322f"];
const scroll = $("#reading-scroll"),
  article = $("#reading-content");
const pager = new BookPager(scroll, article);
let turning = false,
  gesture = null,
  suppressTapUntil = 0,
  neighborDirection = 0;
let nativeAppearance = {};
let settingsAnchor = null,
  viewportAnchor = null,
  viewportAnchorTimer = null,
  dragFrame = 0;
const isFixedType = (b) => !!b && (b.type === "pdf" || b.type === "cbz");
const isPaged = () =>
  !!current && !isFixedType(current) && settings.mode === "page";
function toast(msg, action) {
  const t = $("#toast");
  t.textContent = msg;
  if (action) {
    // one quick follow-up instead of a dialog, e.g. "已放上书架 · 阅读"
    const b = document.createElement("button");
    b.className = "toast-action";
    b.textContent = action.text;
    b.onclick = () => {
      t.hidden = true;
      action.run();
    };
    t.append(b);
  }
  t.classList.toggle("with-action", !!action);
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 6000 : 4200);
}
function busy(on, msg = tr("正在整理书籍…")) {
  isBusy = on;
  $("#busy").hidden = !on;
  $("#busy-text").textContent = msg;
}
function error(err) {
  console.error(err);
  toast(err?.message || tr("操作未完成，请重试"));
}
function applySettings() {
  document.body.dataset.theme = settings.followSystem
    ? matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light"
    : settings.theme;
  document.body.classList.toggle("pure-black", settings.pureBlack);
  const r = document.documentElement.style;
  r.setProperty("--body-size", settings.size + "px");
  r.setProperty("--leading", settings.leading);
  r.setProperty("--measure", settings.width + "px");
  r.setProperty("--reading-margin", settings.margin + "px");
  r.setProperty("--paragraph-gap", settings.paragraph + "em");
  r.setProperty("--reader-font", readerFont());
  r.setProperty("--letter", settings.letter + "em");
  document.body.classList.toggle("indent-on", !!settings.indent);
  document.body.classList.toggle("orig-fmt", settings.origFmt !== false);
  document.querySelector("meta[name=theme-color]").content = getComputedStyle(
    document.body,
  )
    .getPropertyValue(current ? "--reader" : "--bg")
    .trim();
  const night = document.body.dataset.theme === "dark";
  $("#night-toggle").innerHTML = `${icon(night ? "sun" : "moon")}<span id="night-label">${night ? tr("日间") : tr("夜间")}</span>`;
  syncNativeAppearance();
  syncReadingView();
}
const FONT_STACKS = {
  serif: '"LB Song","Noto Serif CJK SC","Source Han Serif SC","Songti SC",Georgia,serif',
  sans: '-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Microsoft YaHei",sans-serif',
  kai: '"LB WenKai","Kaiti SC","STKaiti","KaiTi",serif',
  custom: '"LiubaiCustom","LB Song",serif',
};
// Western books put Latin type first, so curly quotes and apostrophes keep their narrow shapes
// instead of the full-width ones in CJK fonts. ("Georgia" maps to Noto Serif on Android.)
const LATIN_STACKS = {
  serif: 'Georgia,"Noto Serif",serif,"LB Song","Noto Serif CJK SC"',
  sans: '-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif,"Noto Sans CJK SC"',
  kai: FONT_STACKS.kai,
  custom: '"LiubaiCustom",Georgia,serif,"LB Song"',
};
const latinBook = () => current?.script === "latin";
function readerFont() {
  const stacks = latinBook() ? LATIN_STACKS : FONT_STACKS;
  return stacks[settings.font] || stacks.serif;
}
// Mostly Latin letters → a Western book. Sampled from the text, since EPUB language tags are often wrong.
function bookScript(b) {
  let cjk = 0,
    latin = 0,
    seen = 0;
  for (const c of b.chapters || []) {
    const t = (c.text || "").slice(0, 6000);
    for (let i = 0; i < t.length; i++) {
      const x = t.charCodeAt(i);
      if ((x >= 0x3400 && x <= 0x9fff) || (x >= 0x3040 && x <= 0x30ff) || (x >= 0xac00 && x <= 0xd7af)) cjk++;
      else if ((x >= 0x41 && x <= 0x5a) || (x >= 0x61 && x <= 0x7a) || (x >= 0xc0 && x <= 0x24f) || (x >= 0x400 && x <= 0x4ff)) latin++;
    }
    if (++seen >= 12 || cjk + latin > 40000) break;
  }
  return latin > cjk * 4 ? "latin" : "cjk";
}
// The book's language drives hyphenation (Western books) and the Chinese glyph forms of fallback fonts.
function applyBookFace() {
  const tag = String(current.lang || "").trim();
  const known = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i.test(tag) && !/^(und|mul|zxx)/i.test(tag);
  const cjkTag = /^(zh|ja|ko)/i.test(tag);
  let l = "";
  if (current.script === "latin") l = known && !cjkTag ? tag : "";
  else l = known && cjkTag ? tag : cjkUI ? "" : "zh";
  if (l) article.setAttribute("lang", l);
  else article.removeAttribute("lang");
  document.documentElement.style.setProperty("--reader-font", readerFont());
}
function syncNativeAppearance() {
  const bridge = window.LiubaiAndroid;
  if (!bridge) return;
  const color = getComputedStyle(document.body)
    .getPropertyValue(current ? "--reader" : "--bg")
    .trim();
  const dark = document.body.dataset.theme === "dark",
    brightness = current
      ? settings.brightnessMode === "auto"
        ? -2
        : settings.brightnessMode === "manual"
          ? Math.max(2, settings.brightness)
          : -1
      : -1;
  if (nativeAppearance.color !== color || nativeAppearance.dark !== dark) {
    bridge.setAppearance?.(color, dark);
    nativeAppearance.color = color;
    nativeAppearance.dark = dark;
  }
  if (
    nativeAppearance.brightness !== brightness ||
    nativeAppearance.brightnessNight !== dark
  ) {
    if (bridge.setBrightnessMode) bridge.setBrightnessMode(brightness, dark);
    else bridge.setBrightness?.(brightness);
    nativeAppearance.brightness = brightness;
    nativeAppearance.brightnessNight = dark;
  }
}
function syncReadingView() {
  $("#reader").classList.toggle(
    "scroll-fade",
    !!current &&
      !isFixedType(current) &&
      settings.mode === "scroll" &&
      settings.fadeEdges,
  );
  pager.animate = settings.animation !== "none";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (settings.followSystem) applySettings();
});
window.liubaiBrightnessUnavailable = () => {
  settings.brightnessMode = "system";
  saveSettings();
  nativeAppearance.brightness = -1;
  $$("[data-brightness-mode]").forEach((x) => {
    x.classList.toggle("selected", x.dataset.brightnessMode === "system");
    x.setAttribute(
      "aria-pressed",
      String(x.dataset.brightnessMode === "system"),
    );
  });
  toast(tr("设备不支持自动亮度，已跟随系统"));
};
function saveSettings() {
  store("settings", "put", settings, "preferences").catch(error);
}
function getState(id) {
  return states[id] || (states[id] = initialState(id));
}
function persist() {
  if (state) store("states", "put", structuredClone(state)).catch(error);
}
function cover(b) {
  if (b.cover) return `<img src="${E(b.cover)}" alt="">`;
  const t = String(b.title || "").trim();
  const cjk = /[㐀-鿿]/.test(t);
  return `<span class="slip${cjk ? "" : " h"}"><span class="slip-title">${E(cjk ? t.slice(0, 12) : t)}</span></span><span class="stitch"></span>`;
}
const coverColor = (b) => {
  let h = 2166136261;
  for (const c of String(b.title || "") + String(b.id || "").slice(0, 6)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return colors[(h >>> 0) % colors.length];
};
let selecting = false,
  picked = new Set();
const fmtDuration = (sec) => {
  sec = Math.round(sec || 0);
  if (sec < 60) return sec ? tr("不到 1 分钟") : tr("0 分钟");
  const h = Math.floor(sec / 3600),
    m = Math.round((sec % 3600) / 60);
  return h ? (m ? tr("{h} 小时 {m} 分", { h, m }) : tr("{h} 小时", { h })) : tr("{m} 分钟", { m });
};
function bookStatus(b, s) {
  return s.finished
    ? tr("已读完")
    : s.lastRead
      ? `${Math.max(1, Math.round(s.percent || 0))}%`
      : tr("未读");
}
function renderLibrary() {
  const q = $("#library-search").value.trim().toLowerCase();
  let list = books.filter((b) => {
    const s = getState(b.id);
    return (
      (!q ||
        (b.title + " " + b.author + " " + (b.filename || ""))
          .toLowerCase()
          .includes(q)) &&
      (filter === "all" ||
        (filter === "reading" && s.lastRead && !s.finished) ||
        (filter === "favorite" && s.favorite) ||
        (filter === "finished" && s.finished))
    );
  });
  const sort = settings.librarySort;
  list.sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title, locale)
      : sort === "author"
        ? a.author.localeCompare(b.author, locale) ||
          a.title.localeCompare(b.title, locale)
        : sort === "added"
          ? b.added - a.added
          : sort === "progress"
            ? (getState(b.id).percent || 0) - (getState(a.id).percent || 0)
            : (getState(b.id).lastRead || b.added) -
              (getState(a.id).lastRead || a.added),
  );
  if (selecting) {
    const visible = new Set(list.map((b) => b.id));
    for (const id of [...picked]) if (!visible.has(id)) picked.delete(id);
  }
  const listView = settings.libraryView === "list";
  $("#book-grid").classList.toggle("list-view", listView);
  // small shelves stay bare: filters, sorting and search appear once they help
  const roomy = books.length >= 6;
  $("#sort-label").textContent = SORTS.find(([k]) => k === settings.librarySort)?.[1] || tr("最近阅读");
  $(".shelf-bar").hidden = !books.length || selecting || (!roomy && filter === "all");
  $("#search-toggle").hidden = !roomy && $("#lib-search").hidden;
  $("#shelf-tip").hidden = !books.length || selecting || !shelfTipOpen();
  $("#empty").hidden = !!list.length;
  $("#empty p").hidden = !!books.length;
  $("#import-empty").hidden = !!books.length;
  $("#empty h3").textContent = books.length
    ? q
      ? tr("没有找到匹配的书")
      : { reading: tr("还没有在读的书"), favorite: tr("还没有收藏"), finished: tr("还没有读完的书") }[filter] || tr("这里还没有书")
    : tr("把第一本书放进来");
  $("#book-grid").classList.toggle("selecting", selecting);
  $("#book-grid").innerHTML =
    list
      .map((b) => {
        const s = getState(b.id),
          color = coverColor(b),
          on = picked.has(b.id);
        return `<div class="book-card${on ? " picked" : ""}"><button class="cover-button" data-open="${E(b.id)}" aria-label="${selecting ? tr("选择") : tr("阅读")} ${E(b.title)}" aria-pressed="${on}"><div class="cover" style="--cover:${color}">${cover(b)}${s.lastRead && !s.finished ? `<i class="cover-progress" style="--p:${Math.round(s.percent || 0)}%"></i>` : ""}</div>${selecting ? `<span class="pick-mark">${on ? icon("check") : ""}</span>` : ""}</button><div class="book-info"><h3>${E(b.title)}</h3><p>${E(author(b.author))}</p><div class="book-status"><span>${bookStatus(b, s)}</span><span>${b.type === "demo" ? tr("使用指南") : (b.format || b.type).toUpperCase()}</span></div></div>${selecting ? "" : `<button class="icon-btn book-more" data-more="${E(b.id)}" aria-label="${tr("管理")} ${E(b.title)}">${icon("more")}</button>`}</div>`;
      })
      .join("") +
    "";
  $$("[data-open]").forEach(
    (el) =>
      (el.onclick = () => {
        if (!selecting) return openBook(el.dataset.open);
        const id = el.dataset.open;
        picked.has(id) ? picked.delete(id) : picked.add(id);
        renderLibrary();
      }),
  );
  $$("[data-more]").forEach(
    (el) => (el.onclick = () => manageBook(el.dataset.more)),
  );
  $$("[data-open]").forEach((el) =>
    el.addEventListener("contextmenu", (e) => {
      if (selecting) return;
      e.preventDefault();
      manageBook(el.dataset.open);
    }),
  );
  $("#batch-bar").hidden = !selecting;
  $("#batch-count").textContent = tr("已选 {n}", { n: picked.size });
  for (const id of ["batch-favorite", "batch-finish", "batch-delete"])
    $("#" + id).disabled = !picked.size;
  const recent = [...books]
    .filter((b) => getState(b.id).lastRead && !getState(b.id).finished)
    .sort((a, b) => getState(b.id).lastRead - getState(a.id).lastRead)[0];
  $("#continue-card").hidden = !recent || selecting;
  if (recent) {
    const s = getState(recent.id);
    $("#continue-card").innerHTML =
      `<div class="cover mini-cover" style="--cover:${coverColor(recent)}">${cover(recent)}</div><div class="continue-info"><span class="eyebrow">${tr("上次读到")}</span><h3>${E(recent.title)}</h3><p>${E(isFixedType(recent) ? pageLabel((s.chapter || 0) + 1) : s.chapterTitle || author(recent.author))}</p><div class="bar"><i style="--p:${Math.max(1, Math.round(s.percent || 0))}%"></i><span>${Math.round(s.percent || 0)}%</span></div></div>`;
    $("#continue-card").onclick = () => openBook(recent.id);
  }
}
function setSelecting(on) {
  selecting = on;
  picked.clear();
  renderLibrary();
}
async function batchUpdate(fn) {
  for (const id of picked) {
    const s = getState(id);
    fn(s);
    await store("states", "put", structuredClone(s));
  }
  setSelecting(false);
}
function chooseFiles() {
  $("#file-input").click();
}
const IMPORT_TYPES = {
  epub: "epub",
  txt: "txt",
  text: "txt",
  md: "md",
  markdown: "md",
  pdf: "pdf",
  html: "html",
  htm: "html",
  xhtml: "html",
  mobi: "mobi",
  azw3: "mobi",
  azw: "mobi",
  prc: "mobi",
  fb2: "fb2",
  cbz: "cbz",
  zip: "zip",
};
// a .zip may hold an FB2 book or comic pages
async function sniffZip(bytes) {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const names = Object.keys(zip.files);
    if (names.some((n) => /\.fb2$/i.test(n))) return "fb2";
    if (names.includes("META-INF/container.xml")) return "epub";
    if (names.some((n) => /\.(jpe?g|png|webp|gif)$/i.test(n))) return "cbz";
  } catch {}
  throw new Error(tr("无法识别压缩包里的内容（支持 FB2、EPUB、漫画图片）"));
}
async function pdfCover(doc) {
  try {
    const page = await doc.getPage(1),
      v1 = page.getViewport({ scale: 1 }),
      viewport = page.getViewport({ scale: 360 / v1.width });
    const c = document.createElement("canvas");
    c.width = Math.round(viewport.width);
    c.height = Math.round(viewport.height);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return c.toDataURL("image/jpeg", 0.8);
  } catch {
    return "";
  }
}
async function parseFile(bytes, name, kind, progress = () => {}) {
  if (kind === "zip") kind = await sniffZip(bytes);
  if (kind === "epub") return { ...(await parseEpub(bytes, name, progress)), kind };
  if (kind === "mobi") return { ...(await parseMobi(bytes, name, progress)), kind };
  if (kind === "fb2") return { ...(await parseFb2(bytes, name)), kind };
  if (kind === "cbz") return { ...(await parseCbz(bytes, name)), kind };
  if (kind === "txt") return parseTxt(bytes, name);
  if (kind === "md") return parseTxt(bytes, name, { markdown: true });
  if (kind === "html") return parseHtml(bytes, name);
  if (kind === "pdf") {
    await loadPdfLib();
    const doc = await pdfLib.getDocument({ data: bytes.slice(0), ...pdfOptions() })
      .promise;
    try {
      const m = await doc.getMetadata().catch(() => ({ info: {} }));
      const t = String(m.info?.Title || "").trim();
      return {
        title:
          t && !/^(untitled|无标题|microsoft word - )/i.test(t)
            ? t
            : name.replace(/\.pdf$/i, ""),
        author: String(m.info?.Author || "").trim() || "本地 PDF",
        pages: doc.numPages,
        cover: await pdfCover(doc),
        chapters: [],
        nav: [],
      };
    } finally {
      await doc.destroy();
    }
  }
  throw new Error(tr("不支持的格式"));
}
async function importFiles(files, { open = false } = {}) {
  files = [...(files || [])];
  if (isBusy || !files.length) return;
  busy(true);
  await finishRemoval();
  let dupId = null;
  let imported = 0,
    duplicates = 0,
    failed = [],
    lastId = null;
  try {
    for (const [i, f] of files.entries()) {
      try {
        if (f.size > 300 * 1024 * 1024)
          throw new Error(tr("文件超过 300 MB，请先压缩或拆分"));
        const ext = f.name.split(".").pop().toLowerCase(),
          kind = IMPORT_TYPES[ext];
        if (!kind) throw new Error(tr("仅支持 EPUB、MOBI、AZW3、FB2、TXT、PDF、CBZ、Markdown、HTML"));
        const prefix = files.length > 1 ? `(${i + 1}/${files.length}) ` : "";
        $("#busy-text").textContent = prefix + tr("正在导入 {name}", { name: f.name });
        const bytes = await f.arrayBuffer(),
          id = await hash(bytes);
        if (books.some((b) => b.id === id)) {
          duplicates++;
          dupId = id;
          continue;
        }
        const data = await parseFile(
          bytes,
          f.name,
          kind,
          (msg) => ($("#busy-text").textContent = prefix + msg),
        );
        const real = data.kind || kind;
        delete data.kind;
        const type = real === "md" || real === "html" ? "txt" : real;
        const b = {
          ...data,
          id,
          type,
          format: real,
          added: Date.now(),
          filename: f.name,
          size: f.size,
          bytes,
        };
        const s = initialState(id);
        const meta = await saveBook(b, s);
        books.push(meta);
        states[id] = s;
        imported++;
        lastId = id;
      } catch (err) {
        console.error(err);
        failed.push(`${f.name}${cjkUI ? "：" : ": "}${err.message}`);
      }
    }
    renderLibrary();
    navigator.storage?.persist?.().catch(() => {});
    if (failed.length)
      showDialog(
        tr("导入结果"),
        `<p>${tr("已导入 {n} 本，跳过 {d} 本重复书籍。", { n: imported, d: duplicates })}</p><p>${failed.map(E).join("<br>")}</p>`,
        [{ text: tr("知道了") }],
      );
    else if (files.length === 1 && (lastId || dupId)) {
      const id = lastId || dupId;
      busy(false);
      // a file opened from another app is meant to be read now
      if (open) setTimeout(() => openBook(id), 0);
      else toast(lastId ? tr("《{title}》已放上书架", { title: books.find((b) => b.id === id)?.title }) : tr("这本书已经在书架上了"), { text: tr("阅读"), run: () => openBook(id) });
    } else
      toast(
        imported
          ? (duplicates ? tr("已导入 {n} 本，跳过 {d} 本重复书籍", { n: imported, d: duplicates }) : tr("已导入 {n} 本", { n: imported }))
          : duplicates
            ? tr("这些书已经在书架上了")
            : tr("没有导入任何书"),
      );
  } finally {
    busy(false);
    $("#file-input").value = "";
  }
}
function showDialog(title, html, actions = []) {
  const d = $("#dialog");
  if (d.open) d.close();
  $("#dialog-title").textContent = title;
  $("#dialog-body").innerHTML = html;
  $("#dialog-actions").innerHTML = "";
  actions.forEach((a, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = a.danger
      ? "secondary danger"
      : i === actions.length - 1
        ? "primary"
        : "secondary";
    b.textContent = a.text;
    b.onclick = async () => {
      try {
        if (a.run) {
          const v = await a.run();
          if (v === false) return;
        }
        d.close();
      } catch (e) {
        error(e);
      }
    };
    $("#dialog-actions").append(b);
  });
  d.showModal();
  // don't land the focus ring on the close button; fields that want focus say so
  const auto = d.querySelector("[autofocus]");
  if (auto) auto.focus();
  else d.focus();
}
function manageBook(id) {
  const b = books.find((x) => x.id === id),
    s = getState(id);
  if (!b) return;
  shelfTipDone();
  const marks = s.notes.length + s.bookmarks.length,
    txt = b.type === "txt" && (b.format || "txt") === "txt";
  const rows = [
    ["favorite-action", s.favorite ? tr("取消收藏") : tr("加入收藏")],
    ["finish-action", s.finished ? tr("重新读") : tr("标记为读完")],
    ["edit-action", tr("编辑信息")],
    ["export-action", marks ? tr("导出…") : tr("导出原文件")],
    ...(txt ? [["resplit-action", tr("调整分章")]] : []),
    ["select-action", tr("多选")],
  ];
  const progress = s.finished ? tr("已读完") : s.lastRead ? tr("读到 {p}%", { p: Math.round(s.percent || 0) }) : tr("未读");
  showDialog(
    b.title,
    `<div class="dialog-actions-stack">${rows.map(([k, l]) => `<button type="button" class="secondary" id="${k}">${l}</button>`).join("")}<button type="button" class="secondary danger" id="delete-action">${tr("移出书架")}</button></div><p class="book-facts">${E(author(b.author))} · ${(b.format || b.type).toUpperCase()}${b.size ? ` · ${b.size < 1048576 ? `${Math.max(1, Math.round(b.size / 1024))} KB` : `${(b.size / 1048576).toFixed(1)} MB`}` : ""}<br>${progress}${s.notes.length ? " · " + tr("{n} 条笔记", { n: s.notes.length }) : ""}${s.bookmarks.length ? " · " + tr("{n} 个书签", { n: s.bookmarks.length }) : ""} · ${tr("{date} 加入", { date: dateText(b.added) })}</p>`,
    [],
  );
  const saveState = async () => {
    await store("states", "put", structuredClone(s));
    $("#dialog").close();
    renderLibrary();
  };
  $("#favorite-action").onclick = () => {
    s.favorite = !s.favorite;
    saveState().catch(error);
  };
  $("#finish-action").onclick = () => {
    if (s.finished) {
      // read it again from the start; notes and bookmarks stay
      Object.assign(s, { finished: false, chapter: 0, ratio: 0, offset: null, percent: 0, lastRead: Date.now() });
    } else {
      s.finished = true;
      s.finishedAt = Date.now();
    }
    saveState().catch(error);
  };
  $("#edit-action").onclick = () => editBook(b);
  $("#select-action").onclick = () => {
    $("#dialog").close();
    selecting = true;
    picked.clear();
    picked.add(id);
    renderLibrary();
  };
  const exportOriginal = async () => {
    try {
      const c = await loadContent(id);
      download(c?.bytes ? new Blob([c.bytes]) : new Blob([(c?.chapters || []).map((x) => x.text).join("\n\n")]), b.filename);
    } catch (e) {
      error(e);
    }
  };
  $("#export-action").onclick = () => {
    $("#dialog").close();
    if (!marks) return exportOriginal();
    sheet(tr("导出"), [
      { text: tr("原文件"), value: (b.format || b.type).toUpperCase(), run: exportOriginal },
      { text: tr("本书笔记"), value: "Markdown", run: () => exportNotes([b]) },
    ]);
  };
  if ($("#resplit-action")) $("#resplit-action").onclick = () => resplitBook(b).catch(error);
  $("#delete-action").onclick = () => {
    $("#dialog").close();
    removeBooks([id]);
  };
}
// Title, author and cover in one place.
function editBook(b) {
  let pendingCover = null;
  showDialog(
    tr("编辑信息"),
    `<div class="edit-book"><button type="button" class="cover edit-cover" id="edit-cover" style="--cover:${coverColor(b)}" aria-label="${tr("更换封面")}">${cover(b)}<span class="edit-cover-hint">${tr("换封面")}</span></button><div class="edit-fields"><label class="field-label" for="new-title">${tr("书名")}</label><input id="new-title" type="text" maxlength="200" value="${E(b.title)}"><label class="field-label" for="new-author">${tr("作者")}</label><input id="new-author" type="text" maxlength="200" value="${isPlaceholderAuthor(b.author) ? "" : E(b.author)}" placeholder="${E(author(b.author))}"></div></div>`,
    [
      { text: tr("取消") },
      {
        text: tr("保存"),
        run: async () => {
          const title = $("#new-title").value.trim();
          if (!title) return false;
          b.title = title;
          b.author = $("#new-author").value.trim() || (isPlaceholderAuthor(b.author) && b.author) || "未知作者";
          if (pendingCover) b.cover = pendingCover;
          await store("books", "put", b);
          renderLibrary();
        },
      },
    ],
  );
  $("#edit-cover").onclick = () => {
    const input = $("#cover-input");
    input.onchange = async () => {
      const f = input.files[0];
      input.value = "";
      if (!f) return;
      try {
        pendingCover = await thumbnail(f);
        if (!pendingCover) throw new Error(tr("无法读取这张图片"));
        $("#edit-cover").innerHTML = `<img src="${E(pendingCover)}" alt=""><span class="edit-cover-hint">${tr("换封面")}</span>`;
      } catch (e) {
        error(e);
      }
    };
    input.click();
  };
}
// Removing is instant, with a few seconds to undo, instead of a confirmation dialog.
let trash = null;
function removeBooks(ids) {
  finishRemoval();
  const gone = books.filter((b) => ids.includes(b.id));
  if (!gone.length) return;
  books = books.filter((b) => !ids.includes(b.id));
  if (selecting) setSelecting(false);
  else renderLibrary();
  trash = { gone, timer: setTimeout(finishRemoval, 6000) };
  toast(gone.length === 1 ? tr("已移出《{title}》", { title: gone[0].title }) : tr("已移出 {n} 本书", { n: gone.length }), {
    text: tr("撤销"),
    run: () => {
      if (!trash) return;
      clearTimeout(trash.timer);
      books.push(...trash.gone);
      trash = null;
      renderLibrary();
    },
  });
}
async function finishRemoval() {
  if (!trash) return;
  const { gone, timer } = trash;
  clearTimeout(timer);
  trash = null;
  for (const b of gone) {
    delete states[b.id];
    for (const k of searchCache.keys()) if (k.startsWith(b.id + ":")) searchCache.delete(k);
    await deleteBook(b.id).catch(error);
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) finishRemoval();
});
async function loadPdfLib() {
  if (!pdfLib) {
    pdfLib = await import("./vendor/pdf.mjs");
    pdfLib.GlobalWorkerOptions.workerSrc = new URL(
      "./vendor/pdf.worker.mjs",
      import.meta.url,
    ).href;
  }
}
const pdfOptions = () => ({
  cMapUrl: new URL("./vendor/cmaps/", import.meta.url).href,
  cMapPacked: true,
  standardFontDataUrl: new URL("./vendor/standard_fonts/", import.meta.url)
    .href,
  wasmUrl: new URL("./vendor/wasm/", import.meta.url).href,
  isEvalSupported: false,
});
async function openBook(id) {
  if (isBusy) return;
  clearTimeout(toastTimer);
  $("#toast").hidden = true;
  busy(true, tr("正在打开书籍…"));
  try {
    await flushState();
    const meta = books.find((b) => b.id === id);
    if (!meta) throw new Error(tr("找不到这本书"));
    const content = await loadContent(id);
    if (!content || (isFixedType(meta) ? !content.bytes : !content.chapters?.length))
      throw new Error(tr("这本书的内容已损坏，请移出后重新导入"));
    releaseImages();
    if (isFixedType(meta)) content.bytes = await asBuffer(content.bytes);
    current = { ...meta, ...content, nav: content.nav || [] };
    if (settings.zh) await loadZh();
    noteDocs.clear();
    measureBook();
    current.script = isFixedType(current) ? "cjk" : bookScript(current);
    applyBookFace();
    state = getState(id);
    pdfZoom = 1;
    $("#reader").classList.remove("pdf-zoomed");
    state.lastRead = Date.now();
    $("#library").hidden = true;
    $("#personal").hidden = true;
    $("#reader").hidden = false;
    document.body.classList.add("reading");
    document.body.classList.toggle("focus", settings.fullscreen);
    $("#reader").classList.add("chrome-hidden");
    syncNativeAppearance();
    setSystemFullscreen(settings.fullscreen);
    $("#reader-title").textContent = zhT(current.title);
    $("#reader").classList.toggle("pdf-mode", isFixedType(current));
    article.hidden = isFixedType(current);
    $("#pdf-view").hidden = !isFixedType(current);
    if (current.type === "pdf") {
      await loadPdfLib();
      pdf = await pdfLib.getDocument({
        data: current.bytes.slice(0),
        ...pdfOptions(),
      }).promise;
    }
    $("#pdf-view").classList.toggle("comic", current.type === "cbz");
    if (current.type === "cbz") comic = { ...(await comicPages(current.bytes)), urls: new Map() };
    await renderChapter(
      state.chapter,
      state.ratio,
      Number.isInteger(state.offset) ? { offset: state.offset } : null,
    );
    persist();
    readerSession(true);
    saveSession(id);
    setTimeout(() => repackStorage(current).catch(() => {}), 2500);
    history.replaceState(null, "", "#reading");
  } catch (err) {
    error(err);
    await backToLibrary();
  } finally {
    busy(false);
  }
}
async function renderChapter(index, ratio = 0, target = null) {
  if (fx.dir && !fx.busy) fxCleanup(false);
  const ticket = ++renderTicket;
  pager.cancelMotion();
  const count =
    isFixedType(current) ? current.pages : current.chapters.length;
  index = Math.max(0, Math.min(count - 1, index));
  state.chapter = index;
  state.ratio = ratio;
  state.offset = null;
  syncReadingView();
  $("#reader").classList.toggle("paged", isPaged());
  if (!isPaged()) pager.deactivate();
  hideNeighbor();
  $("#chapter-title").textContent =
    isFixedType(current)
      ? tr("第 {n} / {total} 页", { n: index + 1, total: count })
      : zhT(current.chapters[index].title);
  $("#selection-menu").hidden = true;
  selected = null;
  state.chapterTitle = $("#chapter-title").textContent;
  $("#pdf-zoom").hidden = !isFixedType(current);
  $("#pdf-zoom-fit").textContent =
    pdfZoom === 1 ? tr("适应宽度") : `${Math.round(pdfZoom * 100)}%`;
  if (current.type === "cbz") {
    const url = await comicPageURL(comic, index);
    if (ticket !== renderTicket) return;
    const img = $("#comic-img");
    await new Promise((resolve) => {
      img.onload = img.onerror = resolve;
      img.src = url;
      if (img.complete) resolve();
    });
    if (ticket !== renderTicket) return;
    const fitW = Math.min(scroll.clientWidth - 16, Math.max(settings.width + 80, 900)),
      fitH = scroll.clientHeight - 24,
      ratio = img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 0.7,
      base = Math.min(fitW, fitH * ratio),
      w = Math.max(120, base * pdfZoom);
    img.style.width = w + "px";
    img.style.height = w / ratio + "px";
    $("#pdf-view").style.width = w + "px";
    comicPageURL(comic, index + 1).catch(() => {});
  } else if (isFixedType(current)) {
    if (pdfRender) {
      pdfRender.cancel();
      try {
        await pdfRender.promise;
      } catch {}
    }
    const page = await pdf.getPage(index + 1);
    if (ticket !== renderTicket) return;
    const original = page.getViewport({ scale: 1 }),
      fit = Math.min(scroll.clientWidth - 32, Math.max(settings.width + 80, 900)),
      width = Math.max(120, fit * pdfZoom),
      scale = width / original.width,
      viewport = page.getViewport({ scale });
    const dpr = Math.min(devicePixelRatio || 1, 2),
      canvas = $("#pdf-canvas");
    canvas.width = Math.round(viewport.width * dpr);
    canvas.height = Math.round(viewport.height * dpr);
    canvas.style.width = viewport.width + "px";
    canvas.style.height = viewport.height + "px";
    $("#pdf-view").style.width = viewport.width + "px";
    $("#pdf-text").innerHTML = "";
    $("#pdf-text").className = "textLayer";
    $("#pdf-text").style.setProperty("--scale-factor", scale);
    $("#pdf-text").style.setProperty("--total-scale-factor", scale);
    pdfRender = page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null,
    });
    try {
      await pdfRender.promise;
    } catch (e) {
      if (e.name !== "RenderingCancelledException") throw e;
    }
    if (ticket !== renderTicket) return;
    const textContent = await page.getTextContent();
    if (ticket !== renderTicket) return;
    const layer = new pdfLib.TextLayer({
      textContentSource: textContent,
      container: $("#pdf-text"),
      viewport,
    });
    await layer.render();
    if (ticket !== renderTicket || !current) return;
    renderHighlights();
  } else {
    article.innerHTML = chapterHTML(index);
    if (settings.zh) zhNode(article);
    article.classList.toggle(
      "raw-indent",
      current.type === "txt" &&
        !current.txtVersion &&
        /<p>[\u3000 \u00a0]{2}/.test(current.chapters[index].html.slice(0, 4000)),
    );
    renderHighlights();
    $("#next-chapter").innerHTML =
      index === count - 1
        ? tr("标记读完 ") + icon("check")
        : tr("下一章 ") + icon("right");
    await Promise.all(
      [...article.querySelectorAll("img")].map((img) =>
        img.complete
          ? Promise.resolve()
          : Promise.race([
              new Promise((resolve) => {
                img.onload = img.onerror = resolve;
              }),
              new Promise((resolve) => setTimeout(resolve, 2000)),
            ]),
      ),
    );
  }
  if (ticket !== renderTicket) return;
  if (isPaged()) pager.layout(settings, { ratio, offset: target?.offset });
  else
    scroll.scrollTop =
      ratio * Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  if (target?.anchor) {
    const el = [...article.querySelectorAll("[data-anchor]")].find(
      (n) => n.dataset.anchor === decodeURIComponent(target.anchor),
    );
    if (el) {
      if (isPaged()) {
        const r = document.createRange();
        r.selectNodeContents(el);
        pager.page = pager.pageOf(r);
        pager.paint();
      } else el.scrollIntoView({ block: "start" });
    }
  }
  if (Number.isInteger(target?.offset) && !isPaged() && !isFixedType(current))
    restoreTextAnchor(target.offset);
  updateProgress();
  persist();
}
function updateProgress() {
  if (!state || !current) return;
  const paged = isPaged(),
    max = Math.max(0, scroll.scrollHeight - scroll.clientHeight),
    count = isFixedType(current) ? current.pages : current.chapters.length;
  if (paged) {
    state.ratio = pager.count > 1 ? pager.page / (pager.count - 1) : 0;
    state.offset = pager.anchor();
    state.positionVersion = 2;
    state.percent =
      ((state.chapter + (pager.page + 1) / pager.count) / count) * 100;
  } else {
    state.ratio =
      max > 0 ? Math.max(0, Math.min(1, scroll.scrollTop / max)) : 0;
    state.offset = null;
    state.percent = Math.min(
      100,
      ((state.chapter + (max > 0 ? state.ratio : 1)) / count) * 100,
    );
  }
  $("#progress-label").textContent =
    isFixedType(current)
      ? `${state.chapter + 1} / ${count}`
      : paged
        ? tr("本章 {page}/{count} · 全书 {p}%", { page: pager.page + 1, count: pager.count, p: state.percent.toFixed(1) })
        : tr("全书 {p}%", { p: state.percent.toFixed(1) });
  $("#progress").value =
    isFixedType(current)
      ? count === 1
        ? 0
        : (state.chapter / (count - 1)) * 1000
      : Math.round(state.percent * 10);
  const exists = !!bookmarkHere();
  $("#page-ribbon").hidden = !exists;
  $("#bookmark").style.color = exists ? "var(--accent)" : "";
  $("#bookmark").title = exists ? tr("此位置已添加书签") : tr("添加书签");
  $("#prev-chapter").disabled = state.chapter === 0;
  $("#next-chapter-btn").disabled = state.chapter >= count - 1;
  $("#prev-chapter").setAttribute("aria-label", isFixedType(current) ? tr("首页") : tr("上一章"));
  $("#next-chapter-btn").setAttribute("aria-label", isFixedType(current) ? tr("末页") : tr("下一章"));
  fillRange($("#progress"));
  sampleSpeed();
  const [pl, pr] = progressText();
  $("#progress-label").innerHTML = `<span>${E(pl)}</span><span>${E(pr)}</span>`;
  updateStatusLine();
}
function bookmarkHere() {
  if (!state) return null;
  return state.bookmarks.find((b) => {
    if (b.noteId || b.chapter !== state.chapter) return false;
    if (isFixedType(current)) return true;
    if (isPaged() && Number.isInteger(b.offset) && Number.isInteger(state.offset)) {
      return pager.pageOf(pager.range(b.offset)) === pager.page;
    }
    return Math.abs(b.ratio - state.ratio) < 0.03;
  });
}
scroll.addEventListener(
  "scroll",
  () => {
    if (!current || isPaged()) return;
    positionSelectionMenu();
    updateProgress();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 350);
  },
  { passive: true },
);
async function flushState() {
  clearTimeout(saveTimer);
  if (state) await store("states", "put", structuredClone(state));
}
let imageURLs = new Map();
function imgURL(n) {
  let u = imageURLs.get(n);
  if (!u) {
    const b = current?.images?.[n];
    if (!b) return "";
    u = URL.createObjectURL(b);
    imageURLs.set(n, u);
  }
  return u;
}
function chapterHTML(i) {
  const h = current.chapters[i].html || "";
  return h.indexOf("liubai-img:") < 0 ? h : h.replace(/liubai-img:(\d+)/g, (m, n) => imgURL(+n));
}
function releaseImages() {
  for (const u of imageURLs.values()) URL.revokeObjectURL(u);
  imageURLs.clear();
}
// Books imported by older versions keep pictures as base64 and the file as an
// ArrayBuffer; rewrite them once, quietly, so later opens are light.
async function repackStorage(book) {
  if (!book || book !== current || isFixedType(book)) return;
  const raw = await loadContent(book.id);
  if (!raw || (raw.bytes instanceof Blob && (raw.images || !raw.chapters?.some((c) => c.html?.includes("data:image/"))))) return;
  const images = raw.images || packImages(raw.chapters);
  const next = { id: book.id, bytes: raw.bytes instanceof Blob ? raw.bytes : new Blob([raw.bytes]), chapters: raw.chapters, nav: raw.nav };
  if (images.length) next.images = images;
  await store("contents", "put", next);
}
async function backToLibrary() {
  fxCleanup(false);
  scheduleSync(800);
  saveSession(null);
  stopAuto();
  closePanel();
  $("#dialog").close();
  $("#selection-menu").hidden = true;
  document.body.classList.remove("focus");
  setSystemFullscreen(false);
  clearTimeout(viewportAnchorTimer);
  viewportAnchor = null;
  $("#reader").classList.remove("chrome-hidden", "paged", "pdf-zoomed");
  pdfZoom = 1;
  pager.deactivate();
  hideNeighbor();
  await flushState();
  ++renderTicket;
  if (pdf) {
    await pdf.destroy();
    pdf = null;
  }
  if (comic) {
    for (const u of comic.urls.values()) URL.revokeObjectURL(u);
    comic = null;
    pdfOutline = null;
  }
  current = null;
  state = null;
  releaseImages();
  readerSession(false);
  jumpFrom = null;
  $("#back-pill").hidden = true;
  document.body.classList.remove("reading");
  syncNativeAppearance();
  $("#reader").hidden = true;
  setTab("shelf");
  $("#library").hidden = false;
  renderLibrary();
  history.replaceState(null, "", location.pathname + location.search);
}
async function step(direction, velocity = 0) {
  lastActivity = Date.now();
  if (!current || turning || isBusy) return;
  if (backPillTurns && --backPillTurns === 0) $("#back-pill").hidden = true;
  turning = true;
  const ticket = renderTicket;
  try {
    if (isFixedType(current)) {
      const next = state.chapter + direction;
      if (next < 0) return;
      if (next >= current.pages) return reachedEnd();
      await renderChapter(next);
      return;
    }
    if (fxOn()) {
      if (!fxPrepare(direction)) {
        fxCleanup(true);
        if (direction > 0) reachedEnd();
        else toast(tr("已到第一页"));
        return;
      }
      await fxFinish(true, velocity);
      return;
    }
    if (isPaged()) {
      if (pager.page + direction >= 0 && pager.page + direction < pager.count) {
        hideNeighbor();
        await pager.settle(
          pager.page + direction,
          0,
          pager.motionFor(pager.page + direction, 0, velocity),
        );
        if (ticket !== renderTicket || !current) return;
        updateProgress();
        persist();
      } else if (
        state.chapter + direction >= 0 &&
        state.chapter + direction < current.chapters.length
      ) {
        prepareNeighbor(direction);
        const motion = pager.motionFor(
          pager.page,
          -direction * pager.pitch,
          velocity,
        );
        animateNeighbor(0, motion);
        await pager.settle(pager.page, -direction * pager.pitch, motion);
        if (ticket !== renderTicket || !current) return;
        await renderChapter(state.chapter + direction, direction < 0 ? 1 : 0);
      } else {
        await pager.settle(pager.page);
        hideNeighbor();
        if (direction > 0) reachedEnd();
        else toast(tr("已到第一页"));
      }
      return;
    }
    const max = scroll.scrollHeight - scroll.clientHeight;
    if (direction > 0 && scroll.scrollTop >= max - 3) {
      if (state.chapter < current.chapters.length - 1)
        await renderChapter(state.chapter + 1);
      else reachedEnd();
    } else if (direction < 0 && scroll.scrollTop <= 3) {
      if (state.chapter > 0) await renderChapter(state.chapter - 1, 1);
    } else
      scroll.scrollBy({
        top: direction * (scroll.clientHeight - 50),
        behavior: "smooth",
      });
  } finally {
    turning = false;
    article.style.userSelect = "";
  }
}
function reachedEnd() {
  stopAuto();
  if (state.finished) return toast(tr("已到全书末尾"));
  showDialog(tr("读完了"), `<p>${tr("《{title}》已到最后一页。", { title: E(current.title) })}</p>`, [
    { text: tr("继续停留") },
    {
      text: tr("标记为读完"),
      run: () => {
        state.finished = true;
        state.finishedAt = Date.now();
        persist();
        toast(tr("这本书已标记为读完"));
      },
    },
  ]);
}
function openPanel(title, type, html) {
  panelType = type;
  $("#panel-title").textContent = title;
  $("#panel-back").hidden = type !== "settings-more";
  $("#panel-body").innerHTML = html;
  const compact = type === "settings" || type === "settings-more";
  $("#panel").classList.toggle("settings-sheet", compact);
  $("#panel").classList.toggle("toc-drawer", type === "toc");
  $("#panel-shade").classList.toggle("settings-shade", compact);
  $("#panel").hidden = false;
  $("#panel-shade").hidden = false;
  $("#selection-menu").hidden = true;
  icons($("#panel"));
  $$("#panel input[type=range]").forEach(fillRange);
}
function closePanel() {
  ++searchTicket;
  $("#panel").hidden = true;
  $("#panel-shade").hidden = true;
  $("#panel").classList.remove("settings-sheet", "toc-drawer");
  $("#panel-shade").classList.remove("settings-shade");
  panelType = "";
  settingsAnchor = null;
}

async function loadPdfOutline() {
  if (pdfOutline || !pdf) return pdfOutline || [];
  const out = [];
  try {
    const walk = async (items, depth) => {
      for (const it of items || []) {
        if (out.length > 3000) return;
        let page = -1;
        try {
          let dest = it.dest;
          if (typeof dest === "string") dest = await pdf.getDestination(dest);
          if (Array.isArray(dest) && dest[0])
            page =
              typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
        } catch {}
        if (page >= 0) out.push({ title: it.title || pageLabel(page + 1), chapter: page, depth: Math.min(depth, 4) });
        await walk(it.items, depth + 1);
      }
    };
    await walk(await pdf.getOutline(), 0);
  } catch {}
  pdfOutline = out;
  return out;
}
// Books imported before 1.1 stored a flat TOC; rebuild it once from the original file.
async function upgradeNav() {
  if (current.type !== "epub" || !current.bytes || current.navChecked) return;
  if (current.nav.some((n) => Number.isInteger(n.depth))) return;
  current.navChecked = true;
  try {
    const raw = await epubNav(await asBuffer(current.bytes));
    const nav = raw
      .map((n) => ({ ...n, chapter: current.chapters.findIndex((c) => c.path === n.path) }))
      .filter((n) => n.chapter >= 0);
    if (!nav.length) return;
    current.nav = nav;
    await store("contents", "put", { id: current.id, bytes: current.bytes, chapters: current.chapters, nav, ...(current.images ? { images: current.images } : {}) });
  } catch (e) {
    console.warn("toc upgrade failed", e);
  }
}
let drawerTab = "toc";
const drawerTabs = () =>
  `<div class="panel-tabs drawer-tabs">${[
    ["toc", isFixedType(current) ? tr("目录") : tr("目录")],
    ["notes", tr("笔记")],
    ["marks", tr("书签")],
  ]
    .map(([k, l]) => `<button data-drawer-tab="${k}" class="${drawerTab === k ? "selected" : ""}">${l}</button>`)
    .join("")}</div>`;
function wireDrawerTabs() {
  $$("[data-drawer-tab]").forEach((b) => (b.onclick = () => showContents(b.dataset.drawerTab)));
}
function showContents(tab = drawerTab) {
  drawerTab = tab;
  if (tab === "toc") return showToc().catch(error);
  annotationList = { all: false, tab };
  const { html, items } = notesHTML(false, tab, true);
  openPanel(current.title, "toc", drawerTabs() + html);
  wireNotes($("#panel-body"), false, tab, items);
  wireDrawerTabs();
}
async function showToc() {
  if (!current) return;
  drawerTab = "toc";
  let items;
  if (isFixedType(current)) {
    const outline = await loadPdfOutline();
    items = outline.length
      ? outline
      : Array.from({ length: current.pages }, (_, i) => ({ title: pageLabel(i + 1), chapter: i }));
  } else {
    await upgradeNav();
    items = inferDepth(
      current.nav.length
        ? current.nav
        : current.chapters.map((c, i) => ({ title: c.title, chapter: i, depth: 0 })),
    );
  }
  // the active row is the last entry at or before the current chapter
  let active = -1;
  items.forEach((n, i) => {
    if (n.chapter <= state.chapter && (active < 0 || n.chapter >= items[active].chapter)) active = i;
  });
  const jump =
    isFixedType(current)
      ? `<form class="page-jump" id="page-jump"><label for="page-jump-input">${tr("跳到页码")}</label><input id="page-jump-input" type="number" inputmode="numeric" min="1" max="${current.pages}" placeholder="1–${current.pages}"><button class="secondary" type="submit">${tr("前往")}</button></form>`
      : "";
  openPanel(
    current.title,
    "toc",
    drawerTabs() +
      jump +
      `<p class="panel-note toc-summary">${isFixedType(current) ? tr("共 {n} 页，读到 {p}%", { n: current.pages, p: Math.round(state.percent || 0) }) : tr("共 {n} 章，读到 {p}%", { n: current.chapters.length, p: Math.round(state.percent || 0) })}</p>` +
      items
        .map(
          (n, i) =>
            `<button class="toc-item depth-${n.depth || 0}${(items[i + 1]?.depth || 0) > (n.depth || 0) ? " has-children" : ""}${i === active ? " active" : n.chapter < state.chapter ? " read" : ""}" data-toc="${i}"><span>${E(zhT(n.title || tr("未命名")))}</span>${isFixedType(current) && items !== undefined && n.title !== pageLabel(n.chapter + 1) ? `<small>${n.chapter + 1}</small>` : ""}</button>`,
        )
        .join(""),
  );
  $$("[data-toc]").forEach(
    (el) =>
      (el.onclick = () => {
        const n = items[+el.dataset.toc];
        closePanel();
        markJump();
        renderChapter(n.chapter, 0, n).then(showBackPill).catch(error);
      }),
  );
  $("#page-jump")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = Math.round(+$("#page-jump-input").value);
    if (!v || v < 1 || v > current.pages) return toast(tr("请输入 1–{n}", { n: current.pages }));
    closePanel();
    markJump();
    renderChapter(v - 1).then(showBackPill).catch(error);
  });
  wireDrawerTabs();
  $(".toc-item.active")?.scrollIntoView({ block: "center" });
}
const THEMES = [
  ["light", tr("素白"), "#faf8f3", "#2a2926", false],
  ["sepia", tr("纸页"), "#f3ebdc", "#43392b", false],
  ["green", tr("竹青"), "#e7ede3", "#2f3a2e", false],
  ["dark", tr("夜读"), "#171716", "#bdb8ae", false],
  ["black", tr("纯黑"), "#000000", "#a9a59d", true],
];
const currentThemeKey = () =>
  settings.theme === "dark" && settings.pureBlack ? "black" : settings.theme;
function applyThemeKey(key) {
  settings.followSystem = false;
  if (key === "black") {
    settings.pureBlack = true;
    key = "dark";
  } else if (key === "dark") settings.pureBlack = false;
  if (key !== "dark") settings.lightTheme = key;
  changeReadingSetting("theme", key);
}
function showSettings(view = "main") {
  if (!settingsAnchor) settingsAnchor = captureTextPosition();
  const fixed = isFixedType(current);
  const group = (label, body) => (body ? `<div class="ap-section"><p class="ap-label">${label}</p>${body}</div>` : "");
  const slider = (id, label, min, max, st, val, fmt) =>
    `<div class="slider-row"><label for="${id}">${label}</label><input id="${id}" type="range" min="${min}" max="${max}" step="${st}" value="${val}"><output data-for="${id}">${fmt(val)}</output></div>`;
  const seg = (attr, items, value) =>
    `<div class="segments">${items.map(([v, l]) => `<button data-${attr}="${v}" class="${value === v ? "selected" : ""}">${l}</button>`).join("")}</div>`;
  const sw = (id, label, on) =>
    `<label class="switch-row"><span>${label}</span><input id="${id}" type="checkbox" ${on ? "checked" : ""}></label>`;
  const line = (label, body) => `<div class="compact-setting"><span>${label}</span>${body}</div>`;
  const fonts = [
    ["serif", tr("宋体"), SAMPLE],
    ["sans", tr("黑体"), SAMPLE],
    ["kai", tr("文楷"), SAMPLE],
    ...(customFontName ? [["custom", customFontName.slice(0, 8), SAMPLE]] : []),
  ];
  // one control for how pages move: four animations for paging, or scrolling
  const turn = settings.mode === "scroll" ? "scroll" : settings.animation;
  let html;
  if (view === "more") {
    html =
      group(
        tr("排版"),
        fixed
          ? ""
          : slider("leading-setting", tr("行距"), 1.3, 2.6, 0.05, settings.leading, (v) => (+v).toFixed(2)) +
              slider("paragraph-setting", tr("段距"), 0, 1.5, 0.1, settings.paragraph, (v) => (+v).toFixed(1)) +
              slider("margin-setting", tr("边距"), 8, 48, 2, settings.margin, (v) => v) +
              slider("letter-setting", tr("字距"), 0, 0.2, 0.01, settings.letter, (v) => (+v).toFixed(2)) +
              (innerWidth >= 700 ? slider("width-setting", tr("版心"), 480, 1040, 20, settings.width, (v) => v) : "") +
              sw("indent-setting", tr("首行缩进"), settings.indent) +
              sw("orig-setting", tr("原书格式"), settings.origFmt !== false) +
              line(tr("繁简"), seg("zh", [["", tr("原文")], ["s", tr("简体")], ["t", tr("繁体")]], settings.zh)),
      ) +
      group(
        tr("操作"),
        line(tr("点按翻页"), seg("tap", [["split", tr("左右")], ["forward", tr("单手")], ["off", tr("关")]], settings.tapMode)) +
          (window.LiubaiAndroid?.setVolumeKeys ? sw("volume-setting", tr("音量键翻页"), settings.volumeKeys) : "") +
          `<button class="switch-row link-row" id="auto-start"><span>${autoTimer ? tr("停止自动翻页") : fixed || settings.mode === "page" ? tr("自动翻页") : tr("自动滚动")}</span>${icon("right")}</button>`,
      ) +
      group(
        tr("显示"),
        sw("focus-setting", tr("沉浸全屏"), document.body.classList.contains("focus")) +
          sw("status-setting", tr("底部显示进度与时间"), settings.statusBar) +
          (!fixed && settings.mode === "scroll" ? sw("fade-setting", tr("边缘渐隐"), settings.fadeEdges) : "") +
          sw("awake-setting", tr("屏幕常亮"), settings.keepAwake) +
          (window.LiubaiAndroid?.setOrientation
            ? line(tr("屏幕方向"), seg("orientation", [["auto", tr("自动")], ["portrait", tr("竖屏")], ["landscape", tr("横屏")]], settings.orientation))
            : "") +
          sw("system-theme", tr("深色跟随系统"), settings.followSystem) +
          (window.LiubaiAndroid?.setBrightness
            ? line(
                tr("亮度"),
                seg(
                  "brightness-mode",
                  [["auto", tr("自动")], ["system", tr("系统")], ["manual", tr("手动")]].filter(([k]) => k !== "auto" || window.LiubaiAndroid.setBrightnessMode),
                  settings.brightnessMode,
                ),
              ) +
              `<input id="brightness-setting" type="range" min="2" max="100" value="${settings.brightness < 0 ? 50 : settings.brightness}" aria-label="${tr("屏幕亮度")}" ${settings.brightnessMode !== "manual" ? "hidden" : ""}>`
            : ""),
      );
  } else {
    html =
      (fixed
        ? ""
        : `<div class="ap-section"><div class="size-row"><button id="font-smaller" aria-label="${tr("减小字号")}">A</button><div class="size-mid"><input id="font-size-range" type="range" aria-label="${tr("字号")}" min="14" max="34" step="1" value="${settings.size}"><output id="font-size-value">${settings.size}</output></div><button id="font-larger" aria-label="${tr("增大字号")}">A</button></div></div>`) +
      `<div class="ap-section"><div class="theme-row">${THEMES.map(
        ([k, l, bg, fg]) =>
          `<button class="theme-dot ${!settings.followSystem && currentThemeKey() === k ? "selected" : ""}" data-theme-key="${k}"><i style="background:${bg};color:${fg}">${SAMPLE}</i>${l}</button>`,
      ).join("")}</div></div>` +
      (fixed
        ? ""
        : `<div class="ap-section"><div class="font-row">${fonts
            .map(
              ([k, l, g]) =>
                `<button class="font-chip ${settings.font === k ? "selected" : ""}" data-font="${k}"><b style="font-family:${FONT_STACKS[k].replace(/"/g, "'")}">${g}</b>${E(l)}</button>`,
            )
            .join("")}<button class="font-chip add" id="font-import"><b>＋</b>${customFontName ? tr("更换") : tr("导入")}</button></div></div>` +
          `<div class="ap-section">${seg("turn", [["flip", tr("仿真")], ["cover", tr("覆盖")], ["slide", tr("平移")], ["none", tr("无")], ["scroll", tr("滚动")]], turn)}</div>`) +
      `<div class="ap-section"><button class="more-toggle" id="settings-more"><span>${tr("更多设置")}</span>${icon("right")}</button></div>`;
  }
  openPanel(view === "more" ? tr("更多设置") : tr("外观"), view === "more" ? "settings-more" : "settings", html);
  const root = $("#panel-body");
  $("#panel-back").onclick = () => showSettings();
  $("#settings-more")?.addEventListener("click", () => showSettings("more"));
  const size = (v) => {
    v = Math.max(14, Math.min(34, v));
    changeReadingSetting("size", v);
    $("#font-size-range").value = v;
    fillRange($("#font-size-range"));
    $("#font-size-value").textContent = v;
    $("#font-smaller").disabled = v === 14;
    $("#font-larger").disabled = v === 34;
  };
  if ($("#font-size-range")) {
    $("#font-size-range").oninput = (e) => size(+e.target.value);
    $("#font-smaller").onclick = () => size(settings.size - 1);
    $("#font-larger").onclick = () => size(settings.size + 1);
  }
  const bindSlider = (id, key) => {
    const el = $("#" + id);
    if (!el) return;
    el.oninput = () => {
      changeReadingSetting(key, +el.value);
      const out = root.querySelector(`output[data-for="${id}"]`);
      if (out) out.textContent = key === "leading" ? (+el.value).toFixed(2) : key === "margin" || key === "width" ? el.value : (+el.value).toFixed(key === "letter" ? 2 : 1);
    };
  };
  bindSlider("leading-setting", "leading");
  bindSlider("paragraph-setting", "paragraph");
  bindSlider("margin-setting", "margin");
  bindSlider("letter-setting", "letter");
  bindSlider("width-setting", "width");
  const bindSeg = (attr, fn) =>
    root.querySelectorAll(`[data-${attr}]`).forEach(
      (b) =>
        (b.onclick = () => {
          fn(b.getAttribute(`data-${attr}`));
          root.querySelectorAll(`[data-${attr}]`).forEach((x) => x.classList.toggle("selected", x === b));
        }),
    );
  bindSeg("theme-key", (k) => {
    applyThemeKey(k);
    if ($("#system-theme")) $("#system-theme").checked = false;
  });
  bindSeg("font", (k) => changeReadingSetting("font", k));
  bindSeg("turn", (v) => {
    if (v === "scroll") {
      if (settings.mode !== "scroll") changeReadingSetting("mode", "scroll");
      return;
    }
    settings.animation = v;
    if (settings.mode !== "page") changeReadingSetting("mode", "page");
    else changeReadingSetting("animation", v);
  });
  bindSeg("tap", (v) => {
    settings.tapMode = v;
    saveSettings();
  });
  bindSeg("brightness-mode", (v) => {
    changeReadingSetting("brightnessMode", v);
    if (v === "manual" && settings.brightness < 0) changeReadingSetting("brightness", 50);
    $("#brightness-setting").hidden = v !== "manual";
    fillRange($("#brightness-setting"));
  });
  $("#brightness-setting")?.addEventListener("input", (e) => changeReadingSetting("brightness", +e.target.value));
  $("#indent-setting")?.addEventListener("change", (e) => changeReadingSetting("indent", e.target.checked));
  $("#orig-setting")?.addEventListener("change", (e) => changeReadingSetting("origFmt", e.target.checked));
  bindSeg("zh", (v) => setZh(v).catch(error));
  bindSeg("orientation", (v) => {
    settings.orientation = v;
    saveSettings();
    readerSession(true);
  });
  $("#fade-setting")?.addEventListener("change", (e) => changeReadingSetting("fadeEdges", e.target.checked));
  $("#font-import")?.addEventListener("click", () => $("#font-input").click());
  $("#volume-setting")?.addEventListener("change", (e) => {
    settings.volumeKeys = e.target.checked;
    saveSettings();
    readerSession(true);
  });
  if ($("#awake-setting")) $("#awake-setting").onchange = (e) => {
    settings.keepAwake = e.target.checked;
    saveSettings();
    readerSession(true);
  };
  $("#status-setting")?.addEventListener("change", (e) => changeReadingSetting("statusBar", e.target.checked));
  $("#focus-setting")?.addEventListener("change", () => focusMode());
  if ($("#system-theme")) $("#system-theme").onchange = (e) => {
    changeReadingSetting("followSystem", e.target.checked);
    root.querySelectorAll("[data-theme-key]").forEach((x) =>
      x.classList.toggle("selected", !settings.followSystem && x.dataset.themeKey === currentThemeKey()),
    );
  };
  if ($("#auto-start")) $("#auto-start").onclick = () => {
    closePanel();
    autoTimer ? stopAuto() : startAuto();
  };
}
function setSystemFullscreen(enabled) {
  if (window.LiubaiAndroid?.setImmersive) {
    window.LiubaiAndroid.setImmersive(enabled);
    return;
  }
  if (enabled && !document.fullscreenElement)
    document.documentElement
      .requestFullscreen?.({ navigationUI: "hide" })
      .catch(() => {});
  else if (!enabled && document.fullscreenElement)
    document.exitFullscreen?.().catch(() => {});
}
function focusMode() {
  if (!current) return;
  const position = captureTextPosition(),
    enabled = !document.body.classList.contains("focus");
  viewportAnchor = position;
  clearTimeout(viewportAnchorTimer);
  viewportAnchorTimer = setTimeout(() => (viewportAnchor = null), 700);
  document.body.classList.toggle("focus", enabled);
  $("#reader").classList.toggle("chrome-hidden", enabled);
  settings.fullscreen = enabled;
  saveSettings();
  setSystemFullscreen(enabled);
  reflowReader(position);
}
function reflowReader(
  position = { offset: state?.offset, ratio: state?.ratio },
) {
  if (!current) return;
  hideNeighbor();
  if (isPaged()) pager.layout(settings, position);
  else if (Number.isInteger(position.offset))
    restoreTextAnchor(position.offset);
  if (isFixedType(current))
    renderChapter(state.chapter, state.ratio).catch(error);
  else {
    updateProgress();
    persist();
  }
}
window.liubaiSafeArea = (top, bottom) => {
  document.documentElement.style.setProperty(
    "--safe-top",
    Math.max(0, Number(top) || 0) + "px",
  );
  document.documentElement.style.setProperty(
    "--safe-bottom",
    Math.max(0, Number(bottom) || 0) + "px",
  );
  if (current) scheduleReflow();
};

function bookmark() {
  if (!state) return;
  updateProgress();
  const existing = bookmarkHere();
  if (existing) {
    state.bookmarks = keepRecords(state, state.bookmarks, (b) => b !== existing);
    persist();
    updateProgress();
    toast(tr("已移除此处书签"));
    return;
  }
  state.bookmarks.push({
    id: uid(),
    chapter: state.chapter,
    ratio: state.ratio,
    offset: isPaged() ? pager.anchor() : captureTextPosition().offset ?? null,
    quote: bookmarkSnippet(),
    title:
      isFixedType(current)
        ? pageLabel(state.chapter + 1)
        : current.chapters[state.chapter].title,
    date: Date.now(),
  });
  persist();
  updateProgress();
  toast(tr("已添加书签"));
}
function bookmarkSnippet() {
  if (!current || isFixedType(current)) return "";
  const off = isPaged() ? pager.anchor() : captureTextPosition().offset;
  if (!Number.isInteger(off)) return "";
  return (article.textContent || "").slice(off, off + 60).replace(/\s+/g, " ").trim();
}
function rangeAt(start, end) {
  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let pos = 0,
    first = null,
    last = null;
  while (walker.nextNode()) {
    const n = walker.currentNode,
      len = n.textContent.length;
    if (!first && start < pos + len) first = [n, Math.max(0, start - pos)];
    if (end <= pos + len && first) {
      last = [n, Math.max(0, end - pos)];
      break;
    }
    pos += len;
  }
  if (!first || !last) return null;
  const r = document.createRange();
  r.setStart(...first);
  r.setEnd(...last);
  return r;
}
const noteColors = {
  yellow: tr("黄色"),
  green: tr("绿色"),
  blue: tr("蓝色"),
  pink: tr("粉色"),
};
const noteColor = (value) =>
  Object.hasOwn(noteColors, value) ? value : "yellow";
const noteTime = (value) =>
  new Date(value || Date.now()).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function colorButtons(value, attr = "data-note-color") {
  return Object.entries(noteColors)
    .map(
      ([c, label]) =>
        `<button type="button" class="note-color ${noteColor(value) === c ? "selected" : ""}" ${attr}="${c}" aria-label="${tr("{color}划线", { color: label })}" aria-pressed="${noteColor(value) === c}"></button>`,
    )
    .join("");
}
function renderHighlights() {
  const host = isFixedType(current) ? $("#pdf-text") : article;
  for (const m of [...host.querySelectorAll("mark[data-note]")])
    m.replaceWith(...m.childNodes);
  host.normalize();
  for (const n of state.notes
    .filter((n) => n.chapter === state.chapter && Number.isInteger(n.start))
    .sort((a, b) => b.start - a.start)) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT),
      entries = [];
    let pos = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode,
        len = node.length;
      if (pos < n.end && pos + len > n.start)
        entries.push({
          node,
          start: Math.max(0, n.start - pos),
          end: Math.min(len, n.end - pos),
        });
      pos += len;
    }
    for (const x of entries.reverse()) {
      const r = document.createRange();
      r.setStart(x.node, x.start);
      r.setEnd(x.node, x.end);
      const mark = document.createElement("mark");
      mark.dataset.note = n.id;
      mark.dataset.color = noteColor(n.color);
      mark.title = n.note || tr("写笔记");
      r.surroundContents(mark);
    }
  }
  if (pager.active) pager.indexText();
}
document.addEventListener("selectionchange", () => {
  if (!current || !$("#panel").hidden || $("#dialog").open) return;
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) {
    $("#selection-menu").hidden = true;
    selected = null;
    return;
  }
  const r = sel.getRangeAt(0),
    host = isFixedType(current) ? $("#pdf-text") : article;
  if (!host.contains(r.commonAncestorContainer)) return;
  const quote = sel.toString();
  if (!quote.trim() || quote.length > 10000) return;
  const before = document.createRange();
  before.selectNodeContents(host);
  before.setEnd(r.startContainer, r.startOffset);
  const start = before.toString().length;
  before.setEnd(r.endContainer, r.endOffset);
  const end = before.toString().length;
  selected = {
    quote,
    start,
    end,
    chapter: state.chapter,
    chapterTitle: state.chapterTitle,
    ratio: state.ratio,
    offset: start,
  };
  $("#selection-menu").hidden = false;
  lastSelRange = r.cloneRange();
  positionSelectionMenu();
});
async function saveExcerpt(action = "highlight", color = "yellow") {
  if (!current || !selected?.quote) return null;
  const book = current,
    s = state,
    selection = { ...selected };
  let n = s.notes.find(
    (n) =>
      n.chapter === selection.chapter &&
      n.start === selection.start &&
      n.end === selection.end &&
      n.quote === selection.quote,
  );
  if (!n) {
    n = {
      ...selection,
      id: uid(),
      date: Date.now(),
      updatedAt: Date.now(),
      note: "",
      color: noteColor(color),
      favorite: false,
    };
    s.notes.push(n);
  }
  if (action === "highlight") n.color = noteColor(color);
  if (action === "favorite") n.favorite = true;
  if (action === "bookmark" && !s.bookmarks.some((b) => b.noteId === n.id))
    s.bookmarks.push({
      id: uid(),
      noteId: n.id,
      chapter: n.chapter,
      ratio: n.ratio,
      offset: n.start,
      quote: n.quote,
      title:
        isFixedType(book)
          ? pageLabel(n.chapter + 1)
          : book.chapters[n.chapter]?.title || "",
      date: Date.now(),
    });
  n.updatedAt = Date.now();
  await store("states", "put", structuredClone(s));
  getSelection()?.removeAllRanges();
  selected = null;
  $("#selection-menu").hidden = true;
  if (current?.id === book.id) renderHighlights();
  updateProgress();
  if (action === "note") openAnnotation(book.id, n.id);
  return n;
}
function addNote(withText = false) {
  if (selected?.quote) {
    saveExcerpt(withText ? "note" : "highlight").catch(error);
    return;
  }
  if (!current) return;
  const s = state,
    book = current,
    n = {
      id: uid(),
      chapter: state.chapter,
      ratio: state.ratio,
      offset: state.offset,
      quote: "",
      start: null,
      end: null,
      note: "",
      color: "yellow",
      favorite: false,
      date: Date.now(),
    };
  showDialog(
    tr("写笔记"),
    `<textarea id="note-text" placeholder="${tr("记下你的想法")}" aria-label="${tr("笔记内容")}" maxlength="20000"></textarea>`,
    [
      { text: tr("取消") },
      {
        text: tr("保存"),
        run: async () => {
          n.note = $("#note-text").value.trim();
          if (!n.note) return false;
          n.updatedAt = Date.now();
          s.notes.push(n);
          await store("states", "put", structuredClone(s));
          refreshAnnotationList(book.id);
        },
      },
    ],
  );
}
let annotationList = null;
function refreshAnnotationList(bookId) {
  if (current?.id === bookId) renderHighlights();
  if (!$("#personal").hidden) personalView === "me" && showPersonal(annotationList?.tab || "notes");
  else if (panelType === "toc" && drawerTab !== "toc") showContents(drawerTab);
}
function openAnnotation(bookId, noteId) {
  const book = books.find((b) => b.id === bookId),
    s = getState(bookId),
    n = s.notes.find((n) => n.id === noteId);
  if (!book || !n) return;
  let color = noteColor(n.color),
    favorite = !!n.favorite,
    bookmarked = s.bookmarks.some((b) => b.noteId === n.id);
  showDialog(
    n.note ? tr("我的笔记") : tr("写笔记"),
    `<div class="annotation-quote" data-color="${color}">${E(n.quote || tr("当前位置"))}</div><div class="annotation-time">${E(noteTime(n.date))}${n.updatedAt > n.date + 60000 ? tr("，更新于 {time}", { time: E(noteTime(n.updatedAt)) }) : ""}</div><textarea id="note-text" aria-label="${tr("笔记内容")}" placeholder="${tr("记下你的想法")}" maxlength="20000">${E(n.note || "")}</textarea><div class="annotation-options"><div class="note-palette">${colorButtons(color)}</div><button type="button" id="annotation-bookmark" aria-pressed="${bookmarked}">${icon("bookmark")}${tr("书签")}</button></div>`,
    [
      {
        text: tr("删除"),
        danger: true,
        run: () => {
          showDialog(tr("删除这条记录？"), `<p>${tr("关联的段落书签也会移除。")}</p>`, [
            {
              text: tr("取消"),
              run: () => {
                openAnnotation(bookId, noteId);
                return false;
              },
            },
            {
              text: tr("删除"),
              danger: true,
              run: async () => {
                s.notes = keepRecords(s, s.notes, (x) => x.id !== noteId);
                s.bookmarks = keepRecords(s, s.bookmarks, (x) => x.noteId !== noteId);
                await store("states", "put", structuredClone(s));
                refreshAnnotationList(bookId);
              },
            },
          ]);
          return false;
        },
      },
      {
        text: tr("保存"),
        run: async () => {
          n.note = $("#note-text").value.trim();
          n.color = color;
          n.favorite = favorite;
          n.updatedAt = Date.now();
          if (bookmarked && !s.bookmarks.some((b) => b.noteId === n.id))
            s.bookmarks.push({
              id: uid(),
              noteId: n.id,
              chapter: n.chapter,
              ratio: n.ratio,
              offset: n.start ?? n.offset,
              quote: n.quote,
              title:
                isFixedType(book)
                  ? pageLabel(n.chapter + 1)
                  : book.chapters?.[n.chapter]?.title || book.chapterTitles?.[n.chapter] || n.chapterTitle || "",
              date: Date.now(),
            });
          if (!bookmarked)
            s.bookmarks = keepRecords(s, s.bookmarks, (b) => b.noteId !== n.id);
          await store("states", "put", structuredClone(s));
          refreshAnnotationList(bookId);
          if (state === s) updateProgress();
        },
      },
    ],
  );
  $$("[data-note-color]").forEach(
    (b) =>
      (b.onclick = () => {
        color = b.dataset.noteColor;
        $$("[data-note-color]").forEach((x) => {
          x.classList.toggle("selected", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        $(".annotation-quote").dataset.color = color;
      }),
  );
  $("#annotation-bookmark").onclick = (e) => {
    bookmarked = !bookmarked;
    e.currentTarget.setAttribute("aria-pressed", String(bookmarked));
  };
}
function notesHTML(all, tab, bare = false) {
  const bookList = all ? books : [current],
    items = bookList
      .flatMap((book) =>
        (tab === "marks"
          ? getState(book.id).bookmarks
          : getState(book.id).notes
        ).map((n) => ({ ...n, book })),
      )
      .sort((a, b) => (b.updatedAt || b.date) - (a.updatedAt || a.date));
  const tabs = `<div class="panel-tabs">${[
    ["notes", tr("笔记")],
    ["marks", tr("书签")],
  ]
    .map(
      ([key, label]) =>
        `<button data-record-tab="${key}" class="${key === tab ? "selected" : ""}" aria-pressed="${key === tab}">${label}</button>`,
    )
    .join("")}</div>`;
  const html =
    (bare ? "" : tabs) +
    (items.length
      ? items
          .map(
            (n) =>
              `<article class="note-card"><button class="record-open" data-record-book="${E(n.book.id)}" data-record-open="${E(n.id)}"><div class="note-quote" data-color="${noteColor(n.color)}">${E(n.quote || n.title || tr("当前位置"))}</div>${n.note ? `<p>${E(n.note)}</p>` : ""}<div class="record-meta">${all ? `《${E(n.book.title)}》` : ""}${E(isFixedType(n.book) ? pageLabel(n.chapter + 1) : n.book.chapters?.[n.chapter]?.title || n.book.chapterTitles?.[n.chapter] || n.chapterTitle || n.title || "")}<br><time>${E(noteTime(n.date))}</time></div></button><div class="record-actions"><button data-record-locate="${E(n.id)}" data-record-book="${E(n.book.id)}">${tr("回到原文")}</button>${tab === "marks" ? `<button class="danger" data-record-delete="${E(n.id)}" data-record-book="${E(n.book.id)}">${tr("删除")}</button>` : ""}</div></article>`,
          )
          .join("")
      : `<p class="empty-records">${tab === "marks" ? tr("还没有书签。点右上角的书签图标，可以标记当前页。") : tr("还没有笔记。长按文字，选择颜色划线或写笔记。")}</p>`);
  return {
    html:
      html +
      (!all ? `<button class="secondary note-add">${tr("写笔记")}</button>` : "") +
      (items.length
        ? `<button class="secondary export-notes">${tr("导出笔记")}</button>`
        : ""),
    items,
  };
}
function wireNotes(root, all, tab, items) {
  root.querySelector(".note-add")?.addEventListener("click", () => {
    selected = null;
    addNote(true);
  });
  root.querySelector(".export-notes")?.addEventListener("click", () => {
    exportNotes(all ? books : [books.find((b) => b.id === current.id) || current]);
  });
  root
    .querySelectorAll("[data-record-tab]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          all
            ? showPersonal(b.dataset.recordTab)
            : showNotes(false, b.dataset.recordTab)),
    );
  const find = (b) =>
    items.find(
      (n) =>
        n.id ===
          (b.dataset.recordOpen ||
            b.dataset.recordLocate ||
            b.dataset.recordDelete) && n.book.id === b.dataset.recordBook,
    );
  const locate = async (n) => {
    const lastStateBeforeLocate = current && current.id === n.book.id;
    closePanel();
    $("#personal").hidden = true;
    if (!current || current.id !== n.book.id) await openBook(n.book.id);
    if (current?.id !== n.book.id) return;
    const same = !!lastStateBeforeLocate;
    markJump();
    await renderChapter(n.chapter, n.ratio, {
      offset: Number.isInteger(n.start) ? n.start : n.offset,
    });
    if (same) showBackPill();
  };
  root.querySelectorAll("[data-record-open]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = find(b);
        if (tab !== "marks") openAnnotation(n.book.id, n.id);
        else if (n.noteId) openAnnotation(n.book.id, n.noteId);
        else locate(n).catch(error);
      }),
  );
  root
    .querySelectorAll("[data-record-locate]")
    .forEach((b) => (b.onclick = () => locate(find(b)).catch(error)));
  root.querySelectorAll("[data-record-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        const n = find(b);
        showDialog(tr("删除这个书签？"), "", [
          { text: tr("取消") },
          {
            text: tr("删除"),
            danger: true,
            run: async () => {
              const s = getState(n.book.id);
              s.bookmarks = keepRecords(s, s.bookmarks, (x) => x.id !== n.id);
              await store("states", "put", structuredClone(s));
              all ? showPersonal(tab) : showNotes(false, tab);
            },
          },
        ]);
      }),
  );
}
function showNotes(all = false, tab = "notes") {
  if (all) return showPersonal(tab);
  showContents(tab === "marks" ? "marks" : "notes");
}
function themeName() {
  if (settings.followSystem) return tr("跟随系统");
  return settings.theme === "dark" ? (settings.pureBlack ? tr("纯黑") : tr("夜读")) : { light: tr("素白"), sepia: tr("纸页"), green: tr("竹青") }[settings.theme] || tr("素白");
}
let personalView = "me";
function showPersonal(tab = "notes") {
  if (tab !== "marks") tab = "notes";
  personalView = "me";
  $("#personal").classList.remove("about-view");
  $("#personal-title").textContent = tr("我的");
  $("#personal-back").setAttribute("aria-label", tr("返回书架"));
  closePanel();
  annotationList = { all: true, tab };
  // on wide screens the sidebar stays; "我的" slides over the shelf area
  $("#library").hidden = !matchMedia("(min-width: 900px)").matches;
  $("#personal").hidden = false;
  setTab("me");
  const { html, items } = notesHTML(true, tab);
  $("#personal-records").innerHTML =
    `<div class="me-list"><button class="me-row" id="me-theme">${icon("moon")}<span class="me-label">${tr("外观")}</span><span class="me-value">${themeName()}</span><span class="chev">${icon("right")}</span></button><button class="me-row" id="me-lang"><span class="me-label">${tr("语言")}</span><span class="me-value">${langChoice() ? LANG_NAMES[lang] : tr("跟随系统")}</span><span class="chev">${icon("right")}</span></button><button class="me-row" id="me-stats"><span class="me-label">${tr("阅读记录")}</span><span class="me-value">${statsLabel()}</span><span class="chev">${icon("right")}</span></button><button class="me-row" id="me-sync">${icon("archive")}<span class="me-label">${tr("同步与备份")}</span><span class="me-value">${syncLabel()}</span><span class="chev">${icon("right")}</span></button><button class="me-row" id="me-about">${icon("info")}<span class="me-label">${tr("关于留白")}</span><span class="me-value">${VERSION}</span><span class="chev">${icon("right")}</span></button></div>` +
    html;
  wireNotes($("#personal-records"), true, tab, items);
  $("#me-theme").onclick = chooseTheme;
  $("#me-lang").onclick = chooseLang;
  $("#me-sync").onclick = showData;
  $("#me-stats").onclick = showStats;
  $("#me-about").onclick = showAbout;
}
// 关于留白: what the app stands for, and how to reach me.
function showAbout() {
  personalView = "about";
  $("#personal").classList.add("about-view");
  $("#personal-title").textContent = tr("关于留白");
  $("#personal-back").setAttribute("aria-label", tr("返回我的"));
  const tenets = [
    [tr("极简"), tr("只留下读书需要的东西。界面上没有多余的按钮，不常用的功能，等你需要时才出现。")],
    [tr("高效"), tr("少一步是一步。打开就接着上次读，导入就能读，常用的操作一两下完成。")],
    [tr("完整"), tr("该有的都有：常见电子书格式、目录与笔记、全文搜索、繁简转换、同步与备份。")],
    [tr("安静"), tr("免费，没有广告、账号和信息流。书和笔记只留在你自己的设备上。")],
  ];
  $("#personal-records").innerHTML = `<div class="about">
    <div class="about-brand"><span class="about-seal">留</span><h2>${tr("留白")}</h2><p>${tr("给阅读留一点空间")}</p><small>${tr("版本 {v}", { v: VERSION })}</small></div>
    <section class="about-sec"><h3>${tr("设计理念")}</h3><dl class="about-tenets">${tenets.map(([t, d]) => `<div><dt>${t}</dt><dd>${d}</dd></div>`).join("")}</dl></section>
    <section class="about-sec"><h3>${tr("联系我")}</h3>
      <div class="contact-row"><button class="contact-main" id="contact-email"><span class="contact-k">${tr("邮箱")}</span><span class="contact-v">${CONTACT.email}</span></button><button class="text-btn contact-copy" data-copy="email">${tr("复制")}</button></div>
      <div class="contact-row"><button class="contact-main" id="contact-wechat"><span class="contact-k">${tr("微信")}</span><span class="contact-v">${CONTACT.wechat}</span></button><button class="text-btn contact-copy" data-copy="wechat">${tr("复制")}</button></div>
      <p class="about-note">${tr("欢迎反馈和建议，也欢迎聊聊在读的书。")}</p>
    </section>
    <p class="about-credits">${tr("开源组件：pdf.js、foliate-js、JSZip、OpenCC、core-js；字体：霞鹜文楷、思源宋体（Noto Serif CJK）。感谢它们的作者。")}</p>
  </div>`;
  $("#personal").scrollTop = 0;
  scrollTo(0, 0);
  const copy = async (text, label) => {
    try {
      if (bridge()?.copyText) bridge().copyText(text);
      else await navigator.clipboard.writeText(text);
      return true;
    } catch {
      toast(tr("请手动记下{label}：{text}", { label, text }));
      return false;
    }
  };
  $$("[data-copy]").forEach(
    (b) =>
      (b.onclick = async () => {
        const email = b.dataset.copy === "email";
        if (await copy(email ? CONTACT.email : CONTACT.wechat, email ? tr("邮箱") : tr("微信号"))) toast(email ? tr("邮箱已复制") : tr("微信号已复制"));
      }),
  );
  $("#contact-email").onclick = () => {
    const subject = tr("留白反馈（{v}）", { v: VERSION });
    if (bridge()?.email) {
      if (!bridge().email(CONTACT.email, subject)) copy(CONTACT.email, tr("邮箱")).then((ok) => ok && toast(tr("没有找到邮件应用，邮箱已复制")));
    } else location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}`;
  };
  // WeChat can't be opened on a profile by ID, so copy it and offer to jump over
  $("#contact-wechat").onclick = async () => {
    if (!(await copy(CONTACT.wechat, tr("微信号")))) return;
    const app = bridge();
    toast(
      tr("微信号已复制，在微信里搜索添加"),
      app?.openWeChat ? { text: tr("打开微信"), run: () => app.openWeChat() || toast(tr("没有找到微信")) } : undefined,
    );
  };
}
function closePersonal() {
  personalView = "me";
  $("#personal").classList.remove("about-view");
  $("#personal-title").textContent = tr("我的");
  $("#personal").hidden = true;
  $("#library").hidden = false;
  setTab("shelf");
  annotationList = null;
  renderLibrary();
}

function showSearch() {
  if (current?.type === "cbz") return toast(tr("漫画没有可以搜索的文字"));
  openPanel(
    tr("全文搜索"),
    "search",
    `<input id="full-search" class="search-full" type="search" enterkeyhint="search" placeholder="${tr("搜索全书")}" aria-label="${tr("全文搜索关键词")}"><div id="search-results"></div>`,
  );
  const input = $("#full-search");
  input.value = lastQuery;
  input.focus();
  input.select();
  let timer = 0;
  // results follow the typing; Enter searches right away
  input.oninput = () => {
    clearTimeout(timer);
    const v = input.value.trim();
    if (!v) {
      ++searchTicket;
      $("#search-results").innerHTML = "";
      return;
    }
    timer = setTimeout(() => runSearch(v).catch(error), v.length > 1 ? 280 : 600);
  };
  input.onkeydown = (e) => {
    if (e.key !== "Enter") return;
    clearTimeout(timer);
    input.blur();
    runSearch(input.value.trim()).catch(error);
  };
  if (lastQuery) runSearch(lastQuery).catch(error);
}
const BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,dt,dd,td,th,figcaption,div,section,article,aside";
async function chapterText(book, i) {
  const key = `${book.id}:${settings.zh || ""}`;
  let cache = searchCache.get(key);
  if (!cache) searchCache.set(key, (cache = []));
  if (cache[i]) return cache[i];
  let text = "",
    breaks = [0];
  if (isFixedType(book)) {
    const p = await pdf.getPage(i + 1);
    for (const x of (await p.getTextContent()).items) {
      text += x.str + (x.hasEOL ? " " : "");
      if (x.hasEOL) breaks.push(text.length);
    }
  } else {
    // same text as the rendered chapter, plus where each paragraph or heading starts
    const body = new DOMParser().parseFromString(book.chapters[i].html, "text/html").body;
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
    let block = null;
    while (walker.nextNode()) {
      const n = walker.currentNode,
        owner = n.parentElement?.closest(BLOCKS) || null;
      if (owner !== block) {
        block = owner;
        if (text.length && breaks[breaks.length - 1] !== text.length) breaks.push(text.length);
      }
      text += n.data;
    }
  }
  if (settings.zh) text = zhText(text);
  // match simplified against traditional too (char-for-char, so offsets hold)
  const fold = (t) => {
    const m = zhMaps?.s;
    t = t.toLowerCase();
    if (!m) return t;
    let out = "";
    for (const ch of t) out += m.get(ch) || ch;
    return out.length === t.length ? out : t;
  };
  return (cache[i] = { text, breaks, folded: fold(text), fold });
}
// A snippet stays inside its paragraph and starts at a clause when it can.
function snippet(text, breaks, at, len) {
  let lo = 0,
    hi = breaks.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (breaks[mid] <= at) lo = mid;
    else hi = mid - 1;
  }
  const paraStart = breaks[lo],
    paraEnd = lo + 1 < breaks.length ? breaks[lo + 1] : text.length;
  let start = Math.max(paraStart, at - 28);
  if (start > paraStart) {
    const head = text.slice(start, at);
    const cut = head.search(/[。．！？；，、.!?;,\s][^。．！？；，、.!?;,\s]*$/);
    if (cut >= 0 && at - (start + cut + 1) >= 4) start += cut + 1;
  }
  let end = Math.min(paraEnd, at + len + 64);
  if (end < paraEnd) {
    const tail = text.slice(at + len, end);
    const stop = tail.search(/[。．！？.!?](?![^。．！？.!?]*[。．！？.!?])/);
    if (stop >= 12) end = at + len + stop + 1;
  }
  const clean = (t) => t.replace(/\s+/g, " ");
  return {
    before: (start > paraStart ? "…" : "") + clean(text.slice(start, at)).replace(/^\s+/, ""),
    hit: text.slice(at, at + len),
    after: clean(text.slice(at + len, end)).replace(/\s+$/, "") + (end < paraEnd ? "…" : ""),
  };
}
let lastQuery = "";
async function runSearch(query) {
  if (!query) return;
  lastQuery = query;
  const ticket = ++searchTicket,
    book = current;
  const results = [];
  const count = isFixedType(book) ? book.pages : book.chapters.length;
  await loadZh().catch(() => null);
  let q = null,
    started = Date.now();
  const box = () => $("#search-results");
  for (let i = 0; i < count; i++) {
    if (ticket !== searchTicket || book !== current || !box()) return;
    if (Date.now() - started > 40) {
      // keep typing and scrolling smooth on slow phones
      box().innerHTML = `<p class="panel-note">${tr("正在搜索… {p}%", { p: Math.round((i / count) * 100) })}</p>`;
      await new Promise((r) => setTimeout(r, 0));
      started = Date.now();
    }
    const c = await chapterText(book, i);
    if (q == null) q = c.fold(query);
    let at = 0,
      found;
    while ((found = c.folded.indexOf(q, at)) >= 0 && results.length < 300) {
      results.push({
        chapter: i,
        offset: found,
        length: query.length,
        ...snippet(c.text, c.breaks, found, query.length),
      });
      at = found + Math.max(1, q.length);
    }
    if (results.length >= 300) break;
  }
  if (ticket !== searchTicket || !box()) return;
  const title = (i) => (isFixedType(book) ? pageLabel(i + 1) : zhT(book.chapters[i].title || chapterLabel(i + 1)));
  let last = -1;
  box().innerHTML =
    `<p class="panel-note search-count">${results.length >= 300 ? tr("300+ 处，显示前 300 处") : results.length ? tr("{n} 处", { n: results.length }) : tr("没有找到")}</p>` +
    results
      .map((r, i) => {
        const head = r.chapter !== last ? `<p class="result-chapter">${E(title(r.chapter))}</p>` : "";
        last = r.chapter;
        return `${head}<button class="result" data-result="${i}"><p>${E(r.before)}<mark>${E(r.hit)}</mark>${E(r.after)}</p></button>`;
      })
      .join("");
  $$("[data-result]").forEach(
    (el) =>
      (el.onclick = async () => {
        const r = results[+el.dataset.result];
        closePanel();
        markJump();
        await renderChapter(r.chapter, 0, isFixedType(book) ? null : r);
        showBackPill();
        if (!isFixedType(book)) {
          const range = rangeAt(r.offset, r.offset + r.length);
          if (range) {
            const sel = getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
        }
      }),
  );
}
function download(blob, name) {
  if (window.LiubaiAndroid) {
    nativeDownload(blob, name).catch(error);
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function showData() {
  sheet(tr("同步与备份"), [
    { icon: "archive", text: tr("WebDAV 同步"), value: syncLabel(), run: showSync },
    { icon: "download", text: tr("导出备份"), run: () => exportBackup().catch(error) },
    { icon: "archive", text: tr("导入备份"), run: () => $("#backup-input").click() },
  ]);
}
async function exportBackup() {
  busy(true, tr("正在打包书库备份…"));
  try {
    await flushState();
    const zip = new JSZip();
    const meta = {
      app: "liubai-reader",
      version: 1,
      date: Date.now(),
      settings,
      books: [],
      states: await store("states", "getAll"),
    };
    meta.stats = stats;
    for (const [i, b] of books.entries()) {
      $("#busy-text").textContent = tr("正在打包 {n} / {total}", { n: i + 1, total: books.length });
      const c = await loadContent(b.id);
      meta.books.push({ ...b });
      if (c?.bytes) zip.file(`books/${b.id}.${b.type}`, c.bytes);
    }
    zip.file("manifest.json", JSON.stringify(meta));
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "STORE",
    });
    download(blob, tr("留白书库备份-{date}.zip", { date: new Date().toISOString().slice(0, 10) }));
    toast(tr("备份已导出，请保存到自己的文件夹"));
  } finally {
    busy(false);
  }
}
async function restoreBackup(file) {
  if (!file) return;
  $("#dialog").close();
  await finishRemoval();
  busy(true, tr("正在检查备份…"));
  try {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const mf = zip.file("manifest.json");
    if (!mf) throw new Error(tr("不是留白书库备份"));
    const meta = JSON.parse(await mf.async("string"));
    if (
      meta.app !== "liubai-reader" ||
      meta.version !== 1 ||
      !Array.isArray(meta.books) ||
      !Array.isArray(meta.states) ||
      meta.books.length > 10000
    )
      throw new Error(tr("备份格式不兼容"));
    const prepared = [],
      skipped = [];
    for (const b of meta.books) {
      if (b?.id === "liubai-welcome-v1" && b?.type === "demo") continue;
      if (
        !b ||
        typeof b.id !== "string" ||
        typeof b.title !== "string" ||
        !["epub", "txt", "pdf", "demo", "mobi", "fb2", "cbz"].includes(b.type)
      )
        throw new Error(tr("备份中的书籍信息不完整"));
      let book = books.find((x) => x.id === b.id);
      if (!book) {
        if (b.type === "demo") book = { ...demoBook(), title: b.title };
        else {
          const f = zip.file(`books/${b.id}.${b.type}`);
          if (!f) {
            skipped.push(b.title);
            continue;
          }
          const bytes = await f.async("arraybuffer");
          if ((await hash(bytes)) !== b.id)
            throw new Error(tr("原书校验失败：{title}", { title: b.title }));
          const kind = IMPORT_TYPES[b.format] ? b.format : b.type;
          $("#busy-text").textContent = tr("正在恢复《{title}》", { title: b.title });
          const data = await parseFile(
            bytes,
            String(b.filename || b.title + "." + b.type),
            kind,
            (msg) => ($("#busy-text").textContent = msg),
          );
          book = {
            ...data,
            ...(typeof b.cover === "string" && b.cover.startsWith("data:image/") ? { cover: b.cover } : {}),
            format: kind,
            size: Number(b.size) || bytes.byteLength,
            id: b.id,
            title: b.title,
            author: String(b.author || ""),
            type: b.type,
            added: Number(b.added) || Date.now(),
            filename: String(b.filename || b.title + "." + b.type),
            bytes,
          };
        }
      }
      const raw = meta.states.find((s) => s.id === b.id) || initialState(b.id),
        old = states[b.id],
        count = Math.max(1, isFixedType(book) ? book.pages : book.chapterCount || book.chapters?.length || 1);
      const incoming = {
        ...initialState(b.id),
        chapter: Math.max(0, Math.min(count - 1, Number(raw.chapter) || 0)),
        ratio: Math.max(0, Math.min(1, Number(raw.ratio) || 0)),
        offset:
          Number.isInteger(raw.offset) && raw.offset >= 0 ? raw.offset : null,
        positionVersion: 2,
        percent: Math.max(0, Math.min(100, Number(raw.percent) || 0)),
        lastRead: Number(raw.lastRead) || 0,
        favorite: !!raw.favorite,
        finished: !!raw.finished,
        seconds: Math.max(0, Number(raw.seconds) || 0),
        tomb: raw.tomb && typeof raw.tomb === "object" ? raw.tomb : {},
        notes: validateRecords(raw.notes, count, true),
        bookmarks: validateRecords(raw.bookmarks, count, false),
      };
      let merged = incoming;
      if (old) {
        merged = {
          ...(old.lastRead > incoming.lastRead ? old : incoming),
          id: b.id,
          notes: mergeRecords(old.notes, incoming.notes),
          bookmarks: mergeRecords(old.bookmarks, incoming.bookmarks),
          seconds: Math.max(old.seconds || 0, incoming.seconds || 0),
        };
      }
      prepared.push({ book, state: merged });
    }
    for (const p of prepared) {
      if (books.some((b) => b.id === p.book.id)) await store("states", "put", p.state);
      else books.push(await saveBook(p.book, p.state));
      states[p.book.id] = p.state;
    }
    if (meta.stats && typeof meta.stats === "object") mergeStats(meta.stats);
    if (meta.settings) {
      settings = validSettings(meta.settings);
      if (settings.font === "custom" && !customFontName) settings.font = "serif";
      applySettings();
      saveSettings();
    }
    renderLibrary();
    if (skipped.length)
      showDialog(tr("恢复完成"), `<p>${tr("已恢复 {n} 本书，相同书籍的笔记已合并。", { n: prepared.length })}</p><p>${tr("以下书籍在备份中没有原文件，已跳过：")}<br>${skipped.map(E).join("<br>")}</p>`, [{ text: tr("知道了") }]);
    else toast(tr("已恢复 {n} 本书；相同书籍的笔记已合并", { n: prepared.length }));
  } catch (e) {
    error(e);
  } finally {
    busy(false);
    $("#backup-input").value = "";
  }
}
function validateRecords(records, count, notes) {
  return (Array.isArray(records) ? records : [])
    .filter(
      (n) =>
        n &&
        typeof n.id === "string" &&
        Number.isInteger(n.chapter) &&
        n.chapter >= 0 &&
        n.chapter < count,
    )
    .map((n) => ({
      id: n.id,
      chapter: n.chapter,
      ratio: Math.max(0, Math.min(1, Number(n.ratio) || 0)),
      offset: Number.isInteger(n.offset) && n.offset >= 0 ? n.offset : null,
      date: Number(n.date) || 0,
      updatedAt: Number(n.updatedAt) || Number(n.date) || 0,
      title: String(n.title || ""),
      quote: String(n.quote || ""),
      ...(notes
        ? {
            color: noteColor(n.color),
            favorite: !!n.favorite,
            note: String(n.note || ""),
            start: Number.isInteger(n.start) && n.start >= 0 ? n.start : null,
            end: Number.isInteger(n.end) && n.end > n.start ? n.end : null,
          }
        : { noteId: typeof n.noteId === "string" ? n.noteId : null }),
    }));
}
function mergeRecords(a, b) {
  const records = new Map();
  for (const n of [...b, ...a]) {
    const old = records.get(n.id);
    if (
      !old ||
      (n.updatedAt || n.date || 0) >= (old.updatedAt || old.date || 0)
    )
      records.set(n.id, n);
  }
  return [...records.values()];
}
function validSettings(s) {
  return {
    theme: ["light", "dark", "sepia", "green"].includes(s.theme)
      ? s.theme
      : "light",
    size: Math.max(14, Math.min(34, +s.size || 19)),
    leading: Math.max(1.3, Math.min(2.7, +s.leading || 1.85)),
    width: Math.max(420, Math.min(1040, +s.width || 720)),
    margin: Math.max(8, Math.min(48, +s.margin || 24)),
    mode: s.readerEngine === 2 && s.mode === "scroll" ? "scroll" : "page",
    readerEngine: 2,
    fullscreen: s.focusPreferenceVersion === 2 && s.fullscreen === true,
    focusPreferenceVersion: 2,
    followSystem: !!s.followSystem,
    pureBlack: !!s.pureBlack,
    brightnessMode: ["auto", "manual", "system"].includes(s.brightnessMode)
      ? s.brightnessMode
      : s.brightness >= 0
        ? "manual"
        : "system",
    fadeEdges: s.fadeEdges !== false,
    paragraph: Number.isFinite(+s.paragraph)
      ? Math.max(0, Math.min(1.5, +s.paragraph))
      : 0.7,
    animation: ["slide", "cover", "flip", "none"].includes(s.animation) ? s.animation : "slide",
    brightness:
      Number.isFinite(s.brightness) && s.brightness >= 0
        ? Math.max(2, Math.min(100, s.brightness))
        : -1,
    font: ["serif", "sans", "kai", "custom"].includes(s.font) ? s.font : "serif",
    indent: s.indent !== false,
    tapMode: ["split", "forward", "off"].includes(s.tapMode) ? s.tapMode : "split",
    volumeKeys: s.volumeKeys !== false,
    keepAwake: s.keepAwake !== false,
    statusBar: s.statusBar !== false,
    letter: Number.isFinite(+s.letter) ? Math.max(0, Math.min(0.2, +s.letter)) : 0,
    autoSeconds: Math.max(3, Math.min(180, Math.round(+s.autoSeconds) || 30)),
    scrollSpeed: Math.max(5, Math.min(300, Math.round(+s.scrollSpeed) || 40)),
    libraryView: s.libraryView === "list" ? "list" : "grid",
    librarySort: ["recent", "added", "title", "author", "progress"].includes(s.librarySort) ? s.librarySort : "recent",
    lightTheme: ["light", "sepia", "green"].includes(s.lightTheme) ? s.lightTheme : "light",
    cpm: Math.max(100, Math.min(2500, Math.round(+s.cpm) || 450)),
    cpmLatin: Math.max(200, Math.min(6000, Math.round(+s.cpmLatin) || 1200)),
    statusMode: ["chapter", "book", "page", "percent"].includes(s.statusMode) ? s.statusMode : "chapter",
    origFmt: s.origFmt !== false,
    zh: s.zh === "s" || s.zh === "t" ? s.zh : "",
    orientation: ["auto", "portrait", "landscape"].includes(s.orientation) ? s.orientation : "auto",
  };
}
$("#import-top").onclick = $("#import-empty").onclick = chooseFiles;
$("#file-input").onchange = (e) => importFiles(e.target.files).catch(error);
$("#backup-input").onchange = (e) => restoreBackup(e.target.files[0]);
$("#library-search").oninput = renderLibrary;
$$("[data-filter]").forEach(
  (el) =>
    (el.onclick = () => {
      filter = el.dataset.filter;
      $$("[data-filter]").forEach((b) =>
        b.classList.toggle("active", b === el),
      );
      renderLibrary();
    }),
);
$("#personal-back").onclick = () => (personalView === "about" ? showPersonal(annotationList?.tab) : closePersonal());
$("#back").onclick = () => backToLibrary().catch(error);
$("#toc-open").onclick = () => showContents("toc");
$("#search-open").onclick = showSearch;
$("#settings-open").onclick = () => showSettings();
$("#bookmark").onclick = bookmark;
$("#panel-close").onclick = $("#panel-shade").onclick = closePanel;
$("#next-chapter").onclick = () => {
  if (state.chapter < current.chapters.length - 1)
    renderChapter(state.chapter + 1).catch(error);
  else {
    state.finished = true;
    persist();
    toast(tr("这本书已标记为读完"));
  }
};
$("#progress").onchange = (e) => {
  $("#scrub-tip").hidden = true;
  markJump();
  setTimeout(showBackPill, 0);
  const v = +e.target.value / 1000,
    count = isFixedType(current) ? current.pages : current.chapters.length;
  if (isFixedType(current))
    renderChapter(Math.round(v * (count - 1))).catch(error);
  else {
    const pos = v * count,
      index = Math.min(count - 1, Math.floor(pos));
    renderChapter(index, Math.min(1, pos - index)).catch(error);
  }
};
$("#selection-menu").onpointerdown = (e) => e.preventDefault();
$$("[data-highlight-color]").forEach(
  (b) =>
    (b.onclick = () =>
      saveExcerpt("highlight", b.dataset.highlightColor).catch(error)),
);
$("#note-selection").onclick = () => addNote(true);
$("#copy-selection").onclick = async () => {
  if (!selected?.quote) return;
  const text = selected.quote;
  try {
    if (bridge()?.copyText) bridge().copyText(text);
    else await navigator.clipboard.writeText(text);
    toast(tr("已复制"));
  } catch {
    toast(tr("复制没有成功，请再试一次"));
  }
  getSelection()?.removeAllRanges();
  $("#selection-menu").hidden = true;
};
article.onclick = (e) => {
  if (Date.now() < suppressTapUntil) {
    e.preventDefault();
    return;
  }
  const a = e.target.closest("a[data-target]");
  if (a) {
    e.preventDefault();
    const [path, anchor] = a.dataset.target.split("#"),
      index = resolveTarget(path, anchor);
    if (index < 0) return;
    if (anchor && footnote(a, index, anchor)) return;
    markJump();
    renderChapter(index, 0, { anchor }).then(showBackPill).catch(error);
    return;
  }
};
function handleReadingTap(e) {
  if (
    !current ||
    Date.now() < suppressTapUntil ||
    !$("#panel").hidden ||
    $("#dialog").open ||
    !getSelection()?.isCollapsed ||
    e.target.closest("a[href],button")
  )
    return;
  const pic = e.target.closest?.("#reading-content img");
  if (pic && pic.naturalWidth > 0 && !bigPicture(pic)) {
    openImage(pic.src);
    return;
  }
  const mark = e.target.closest("mark[data-note]");
  if (mark) {
    openAnnotation(current.id, mark.dataset.note);
    return;
  }
  if (autoTimer) {
    stopAuto();
    toast(tr("已停止自动翻页"));
    return;
  }
  if (
    settings.statusBar &&
    $("#reader").classList.contains("chrome-hidden") &&
    e.clientY > scroll.getBoundingClientRect().bottom - 34
  ) {
    cycleStatus();
    return;
  }
  const rect = scroll.getBoundingClientRect(),
    x = (e.clientX - rect.left) / rect.width,
    pageable = (isPaged() || isFixedType(current)) && settings.tapMode !== "off";
  if (pageable && x < 0.3) step(settings.tapMode === "forward" ? 1 : -1).catch(error);
  else if (pageable && x > 0.7) step(1).catch(error);
  else $("#reader").classList.toggle("chrome-hidden");
}
scroll.addEventListener("click", handleReadingTap);
// Full-page pictures (covers, plates) keep the normal tap zones so pages still
// turn and the menu still opens; a long press zooms them instead.
function bigPicture(pic) {
  const r = pic.getBoundingClientRect();
  return r.height > innerHeight * 0.4 || r.width > innerWidth * 0.6;
}
scroll.addEventListener("contextmenu", (e) => {
  const pic = e.target.closest?.("#reading-content img");
  if (!pic || !pic.naturalWidth) return;
  e.preventDefault();
  suppressTapUntil = Date.now() + 500;
  openImage(pic.src);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("#dialog").open) return;
    closePanel();
    if (document.body.classList.contains("focus")) focusMode();
    return;
  }
  if (
    !current ||
    !$("#panel").hidden ||
    $("#dialog").open ||
    /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)
  )
    return;
  const pageable = isPaged() || isFixedType(current);
  if (
    ["ArrowRight", "PageDown"].includes(e.key) ||
    (e.key === "Enter" && !/BUTTON|A/.test(e.target.tagName)) ||
    (pageable && (e.key === "ArrowDown" || (e.key === " " && !e.shiftKey)))
  ) {
    e.preventDefault();
    step(1).catch(error);
  }
  if (
    ["ArrowLeft", "PageUp"].includes(e.key) ||
    (pageable && (e.key === "ArrowUp" || (e.key === " " && e.shiftKey)))
  ) {
    e.preventDefault();
    step(-1).catch(error);
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});
window.addEventListener("pagehide", persist);
let dragDepth = 0;
document.addEventListener("dragenter", (e) => {
  if (!e.dataTransfer?.types.includes("Files")) return;
  e.preventDefault();
  dragDepth++;
  $("#drop-overlay").hidden = false;
});
document.addEventListener("dragleave", () => {
  dragDepth--;
  if (dragDepth <= 0) $("#drop-overlay").hidden = true;
});
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  $("#drop-overlay").hidden = true;
  if (current) await backToLibrary();
  importFiles(e.dataTransfer.files).catch(error);
});
let markReady;
const appReady = new Promise((r) => (markReady = r));
async function init() {
  try {
    const prefs = await store("settings", "get", "preferences");
    if (prefs) settings = validSettings(prefs);
    stats = (await store("settings", "get", "stats").catch(() => null)) || {};
    const font = await store("settings", "get", "customFont").catch(() => null);
    if (font) await applyCustomFont(font).catch(() => {});
    if (settings.font === "custom" && !customFontName) settings.font = "serif";
    applySettings();
    saveSettings();
    books = await store("books", "getAll");
    states = Object.fromEntries(
      (await store("states", "getAll")).map((s) => [s.id, s]),
    );
    const sample = books.find(
      (b) => b.id === "liubai-welcome-v1" && b.type === "demo",
    );
    if (sample) {
      await deleteBook(sample.id);
      books = books.filter((b) => b.id !== sample.id);
      delete states[sample.id];
    }
    await store("settings", "put", true, "seeded");
    renderLibrary();
    markReady();
    const last = await store("settings", "get", "session").catch(() => null);
    let reopenMe = false;
    try {
      reopenMe = sessionStorage.getItem("liubai-reopen-me") === "1";
      sessionStorage.removeItem("liubai-reopen-me");
    } catch {}
    // after switching language, come back to 我的 so the change is visible at once
    if (reopenMe) showPersonal();
    else if (last && books.some((b) => b.id === last) && !location.hash.includes("library")) openBook(last);
    shrinkLegacyCovers().catch(() => {});
    takeIncoming().catch(error);
    if (!window.LiubaiAndroid && "serviceWorker" in navigator)
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    history.replaceState(null, "", location.pathname + location.search);
  } catch (e) {
    showDialog(
      tr("无法使用本地存储"),
      `<p>${tr("浏览器未允许保存书籍，请在普通浏览模式中打开本站，并允许网站存储。")}</p><p>${E(e.message)}</p>`,
      [{ text: tr("知道了") }],
    );
  }
}
init();

// Books imported by 1.0.x kept full‑size covers; shrink them once in the background.
async function shrinkLegacyCovers() {
  for (const b of books) {
    if (!b.cover || b.cover.length < 120000) continue;
    const small = await thumbnail(b.cover);
    if (small && small.length < b.cover.length) {
      b.cover = small;
      await store("books", "put", b);
    }
  }
  renderLibrary();
}
async function nativeDownload(blob, name) {
  const bridge = window.LiubaiAndroid;
  const token = bridge.beginExport(
    name,
    blob.type || "application/octet-stream",
  );
  if (!token) throw new Error(tr("请先完成上一次文件保存"));
  try {
    for (let offset = 0; offset < blob.size; offset += 524288) {
      const part = blob.slice(offset, offset + 524288);
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result.split(",")[1]);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(part);
      });
      if (!bridge.appendExport(token, data))
        throw new Error(tr("文件准备失败，请重试"));
    }
    if (!bridge.finishExport(token)) throw new Error(tr("无法打开保存窗口"));
    toast(tr("请选择文件保存位置"));
  } catch (e) {
    bridge.cancelExport(token);
    throw e;
  }
}
window.liubaiExportResult = (message) => toast(message);
window.liubaiBack = () => {
  if ($("#img-viewer")) {
    $("#img-viewer").remove();
    return true;
  }
  if (selecting && !$("#library").hidden && !$("#dialog").open) {
    setSelecting(false);
    return true;
  }
  if (autoTimer && current && !$("#dialog").open) {
    stopAuto();
    return true;
  }
  if (!$("#personal").hidden && !$("#dialog").open) {
    if (personalView === "about") showPersonal(annotationList?.tab);
    else closePersonal();
    return true;
  }
  if ($("#dialog").open) {
    $("#dialog").close();
    return true;
  }
  if (!$("#panel").hidden) {
    if (panelType === "settings-more") showSettings();
    else closePanel();
    return true;
  }
  if (document.body.classList.contains("focus")) {
    focusMode();
    return true;
  }
  if (current) {
    backToLibrary().catch(error);
    return true;
  }
  return false;
};
document.addEventListener("liubai-save", persist);

function captureTextPosition() {
  if (!current || isFixedType(current)) return { ratio: state?.ratio || 0 };
  if (isPaged()) return { offset: pager.anchor(), ratio: state.ratio };
  const bounds = scroll.getBoundingClientRect(),
    walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  let total = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode,
      r = document.createRange();
    r.selectNodeContents(node);
    const rects = r.getClientRects?.();
    if (
      rects &&
      [...rects].some(
        (x) => x.bottom > bounds.top + 20 && x.top < bounds.bottom,
      )
    ) {
      let lo = 0,
        hi = Math.max(0, node.length - 1);
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        r.setStart(node, mid);
        r.setEnd(node, Math.min(node.length, mid + 1));
        if (r.getBoundingClientRect().bottom < bounds.top + 20) lo = mid + 1;
        else hi = mid;
      }
      return { offset: total + lo, ratio: state.ratio };
    }
    total += node.length;
  }
  return { ratio: state.ratio };
}
function restoreTextAnchor(offset) {
  const r = rangeAt(offset, offset + 1),
    rect = r?.getBoundingClientRect?.();
  if (rect)
    scroll.scrollTop += rect.top - scroll.getBoundingClientRect().top - 20;
}
function changeReadingSetting(key, value) {
  const position =
    panelType === "settings" && settingsAnchor
      ? settingsAnchor
      : captureTextPosition();
  if (key === "mode" && autoTimer) stopAuto();
  settings[key] = value;
  settings.readerEngine = 2;
  applySettings();
  if (
    [
      "brightness",
      "brightnessMode",
      "theme",
      "followSystem",
      "pureBlack",
      "fadeEdges",
      "animation",
    ].includes(key)
  ) {
    saveSettings();
    return;
  }
  $("#reader").classList.toggle("paged", isPaged());
  hideNeighbor();
  if (isPaged()) pager.layout(settings, position);
  else {
    pager.deactivate();
    if (Number.isInteger(position.offset)) restoreTextAnchor(position.offset);
    else
      scroll.scrollTop =
        (position.ratio || 0) *
        Math.max(0, scroll.scrollHeight - scroll.clientHeight);
  }
  updateProgress();
  persist();
  saveSettings();
}
function hideNeighbor() {
  const n = $("#page-neighbor");
  if (n.hidden && !neighborDirection) return;
  n.hidden = true;
  n.replaceChildren();
  n.style.transition = "none";
  neighborDirection = 0;
}
function prepareNeighbor(direction) {
  if (!isPaged()) return;
  const index = state.chapter + direction;
  if (index < 0 || index >= current.chapters.length) {
    hideNeighbor();
    return;
  }
  if (neighborDirection === direction) return;
  const n = $("#page-neighbor");
  n.hidden = false;
  n.replaceChildren();
  n.style.transition = "none";
  n.style.transform = `translate3d(${direction * pager.pitch}px,0,0)`;
  const clone = article.cloneNode(false);
  clone.removeAttribute("id");
  clone.className = "neighbor-content";
  clone.innerHTML = chapterHTML(index);
  if (settings.zh) zhNode(clone);
  clone.style.transition = "none";
  clone.style.transform = "none";
  n.append(clone);
  if (direction < 0) {
    const pages = Math.max(
      1,
      Math.round((clone.scrollWidth + pager.gap) / pager.pitch),
    );
    clone.style.transform = `translate3d(${-(pages - 1) * pager.pitch}px,0,0)`;
  }
  neighborDirection = direction;
}
function animateNeighbor(offset, motion = pager.motionFor(pager.page)) {
  const n = $("#page-neighbor");
  if (n.hidden) return;
  void n.offsetWidth;
  n.style.transition = motion.duration
    ? `transform ${motion.duration}ms ${motion.easing}`
    : "none";
  n.style.transform = `translate3d(${offset}px,0,0)`;
}
function dragPaint(delta) {
  if (fxOn()) {
    if (!delta) return;
    if (!fxPrepare(delta < 0 ? 1 : -1)) {
      pager.paint(delta * 0.22);
      return;
    }
    if (fxKind() === "flip" && fx.dir > 0 && gesture) {
      const r = scroll.getBoundingClientRect();
      curlFinger(gesture.cx - r.left, gesture.cy - r.top, gesture.y - r.top);
    } else fxSet(Math.min(1, Math.abs(delta) / pager.pitch));
    return;
  }
  if (isPaged()) {
    const direction = delta < 0 ? 1 : -1,
      beyond =
        direction > 0 ? pager.page === pager.count - 1 : pager.page === 0;
    if (
      beyond &&
      state.chapter + direction >= 0 &&
      state.chapter + direction < current.chapters.length
    )
      prepareNeighbor(direction);
    else hideNeighbor();
    const edge =
      beyond &&
      (state.chapter + direction < 0 ||
        state.chapter + direction >= current.chapters.length);
    const dx = edge ? delta * 0.22 : delta;
    pager.paint(dx);
    if (neighborDirection) {
      $("#page-neighbor").style.transition = "none";
      $("#page-neighbor").style.transform =
        `translate3d(${neighborDirection * pager.pitch + dx}px,0,0)`;
    }
  } else $("#pdf-view").style.transform = `translate3d(${delta * 0.65}px,0,0)`;
}
scroll.addEventListener("pointerdown", (e) => {
  suppressTapUntil = 0;
  if (
    !current ||
    turning ||
    isBusy ||
    !$("#panel").hidden ||
    $("#dialog").open ||
    !e.isPrimary ||
    e.button > 0 ||
    e.target.closest("a[href],button") ||
    !getSelection()?.isCollapsed
  )
    return;
  viewportAnchor = null;
  clearTimeout(viewportAnchorTimer);
  gesture = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    time: performance.now(),
    lastX: e.clientX,
    lastTime: performance.now(),
    dx: 0,
    velocity: 0,
    locked: false,
  };
});
scroll.addEventListener(
  "pointermove",
  (e) => {
    const g = gesture;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x,
      dy = e.clientY - g.y,
      now = performance.now();
    if ((!isPaged() && !isFixedType(current)) || (isFixedType(current) && pdfZoom > 1)) {
      if (Math.abs(dx) > 9 || Math.abs(dy) > 9) gesture = null;
      return;
    }
    if (!g.locked) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
        gesture = null;
        return;
      }
      if (now - g.time > 360 || !getSelection()?.isCollapsed) {
        gesture = null;
        return;
      }
      if (Math.abs(dx) < 9 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
      g.locked = true;
      try {
        scroll.setPointerCapture?.(e.pointerId);
      } catch {}
      article.style.userSelect = "none";
      $("#selection-menu").hidden = true;
    }
    e.preventDefault();
    g.velocity = (e.clientX - g.lastX) / Math.max(1, now - g.lastTime);
    g.lastX = e.clientX;
    g.cx = e.clientX;
    g.cy = e.clientY;
    g.lastTime = now;
    g.dx = Math.max(-scroll.clientWidth, Math.min(scroll.clientWidth, dx));
    if (!dragFrame)
      dragFrame = requestAnimationFrame(() => {
        dragFrame = 0;
        if (gesture?.locked) dragPaint(gesture.dx);
      });
  },
  { passive: false },
);
async function finishGesture(e, cancelled = false) {
  const g = gesture;
  if (!g || g.id !== e.pointerId) return;
  if (dragFrame) {
    cancelAnimationFrame(dragFrame);
    dragFrame = 0;
  }
  if (g.locked) dragPaint(g.dx);
  gesture = null;
  article.style.userSelect = "";
  if (!g.locked) {
    if (
      !cancelled &&
      e.pointerType === "touch" &&
      performance.now() - g.time < 320 &&
      Math.abs(e.clientX - g.x) < 9 &&
      Math.abs(e.clientY - g.y) < 9
    ) {
      handleReadingTap(e);
      suppressTapUntil = Date.now() + 450;
      e.preventDefault();
    }
    return;
  }
  suppressTapUntil = Date.now() + 450;
  const threshold = Math.min(90, Math.max(35, scroll.clientWidth * 0.18)),
    elapsed = performance.now() - g.time;
  const speed =
    performance.now() - g.lastTime < 100
      ? g.velocity
      : g.dx / Math.max(1, elapsed);
  const commit =
    !cancelled &&
    (Math.abs(g.dx) > threshold ||
      (Math.abs(g.dx) > 20 &&
        Math.abs(speed) > 0.45 &&
        Math.sign(speed) === Math.sign(g.dx)));
  if (commit) {
    await step(g.dx < 0 ? 1 : -1, speed);
  } else if (fxOn()) {
    turning = true;
    try {
      if (fx.dir) await fxFinish(false, speed);
      else pager.paint();
    } finally {
      turning = false;
    }
  } else if (isPaged()) {
    turning = true;
    try {
      const motion = pager.motionFor(pager.page, 0, speed);
      animateNeighbor(neighborDirection * pager.pitch, motion);
      await pager.settle(pager.page, 0, motion);
      hideNeighbor();
    } finally {
      turning = false;
    }
  }
  if (isFixedType(current)) {
    $("#pdf-view").style.transition = "transform 160ms ease-out";
    $("#pdf-view").style.transform = "none";
    setTimeout(() => ($("#pdf-view").style.transition = ""), 180);
  }
}
scroll.addEventListener("pointerup", (e) => finishGesture(e).catch(error));
scroll.addEventListener("pointercancel", (e) =>
  finishGesture(e, true).catch(error),
);
let resizeTimer;
function scheduleReflow() {
  if (!current) return;
  clearTimeout(resizeTimer);
  // Rotating or folding back and forth must not creep backwards: while the
  // reader stays on the page a resize produced, keep reusing the original anchor.
  const here = `${current.id}:${state.chapter}:${isPaged() ? pager.page : Math.round(scroll.scrollTop)}`;
  if (resizeHome?.key !== here) resizeHome = null;
  const position = viewportAnchor ||
    settingsAnchor ||
    (resizeHome && { offset: resizeHome.offset, ratio: state.ratio }) || {
      offset: state.offset,
      ratio: state.ratio,
    };
  const origin = Number.isInteger(position.offset) ? position.offset : null;
  resizeTimer = setTimeout(() => {
    reflowReader(position);
    if (!current || isFixedType(current) || origin == null) return;
    resizeHome = {
      offset: origin,
      key: `${current.id}:${state.chapter}:${isPaged() ? pager.page : Math.round(scroll.scrollTop)}`,
    };
  }, 100);
}
let resizeHome = null;
window.addEventListener("resize", scheduleReflow);

/* ───────────── session & status line ───────────── */
let batteryLevel = null,
  batteryAt = 0;
let customFontName = "",
  wakeLock = null,
  _unused = null;
const searchCache = new Map();
const bridge = () => window.LiubaiAndroid;
const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
async function requestWakeLock() {
  try {
    if (!wakeLock && navigator.wakeLock && !document.hidden)
      wakeLock = await navigator.wakeLock.request("screen");
    wakeLock?.addEventListener?.("release", () => (wakeLock = null));
  } catch {
    wakeLock = null;
  }
}
function readerSession(on) {
  const awake = on && settings.keepAwake;
  const b = bridge();
  if (b?.setKeepScreenOn) b.setKeepScreenOn(awake);
  else if (awake) requestWakeLock();
  else {
    wakeLock?.release?.().catch(() => {});
    wakeLock = null;
  }
  b?.setVolumeKeys?.(on && settings.volumeKeys);
  // rotation lock applies while reading; the shelf always follows the phone
  b?.setOrientation?.(on ? { portrait: 1, landscape: 2 }[settings.orientation] || 0 : 0);
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && current) readerSession(true);
});
window.liubaiVolumeKey = (dir) => {
  if (!current || $("#dialog").open || !$("#panel").hidden) return false;
  step(dir > 0 ? 1 : -1).catch(error);
  return true;
};
function updateStatusLine() {
  const line = $("#status-line");
  if (!line) return;
  line.hidden = !current || !settings.statusBar;
  if (line.hidden) return;
  const t = new Date().toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", hour12: false });
  if (batteryLevel === null || Date.now() - batteryAt > 60000) {
    batteryAt = Date.now();
    try {
      batteryLevel = bridge()?.battery?.() ?? -1;
    } catch {
      batteryLevel = -1;
    }
  }
  const battery = batteryLevel >= 0 ? "  " + tr("电量 {p}%", { p: batteryLevel }) : "";
  $("#status-chapter").textContent =
    isFixedType(current) ? current.title : $("#chapter-title").textContent;
  $("#status-right").textContent = `${statusText()}  ${t}${battery}`;
}
setInterval(() => current && updateStatusLine(), 30000);

/* ───────────── custom font ───────────── */
async function applyCustomFont(rec) {
  if (!rec?.data) return;
  const face = new FontFace("LiubaiCustom", rec.data);
  await face.load();
  for (const f of [...document.fonts]) if (f.family.replace(/"/g, "") === "LiubaiCustom") document.fonts.delete(f);
  document.fonts.add(face);
  customFontName = rec.name;
}
$("#font-input").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  if (f.size > 40 * 1024 * 1024) return toast(tr("字体文件过大（上限 40 MB）"));
  busy(true, tr("正在载入字体…"));
  try {
    const rec = { name: f.name.replace(/\.(ttf|otf|woff2?)$/i, ""), data: await f.arrayBuffer() };
    await applyCustomFont(rec);
    await store("settings", "put", rec, "customFont");
    busy(false);
    changeReadingSetting("font", "custom");
    if (panelType === "settings") showSettings();
    toast(tr("已使用字体：{name}", { name: rec.name }));
  } catch (err) {
    console.error(err);
    toast(tr("无法识别这个字体文件"));
  } finally {
    busy(false);
  }
};

/* ───────────── auto page turning ───────────── */
let autoTimer = null,
  autoFrame = 0,
  autoRendering = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden && autoTimer) stopAuto();
});
function autoLabel() {
  $("#auto-label").textContent = isPaged() || isFixedType(current)
    ? tr("每页 {n} 秒", { n: settings.autoSeconds })
    : tr("滚动速度 {n}", { n: settings.scrollSpeed });
}
function startAuto() {
  if (!current) return;
  stopAuto();
  $("#auto-pill").hidden = false;
  $("#reader").classList.add("chrome-hidden");
  autoLabel();
  if (isPaged() || isFixedType(current)) {
    const tick = () => {
      autoTimer = setTimeout(async () => {
        if (!current) return stopAuto();
        if ($("#dialog").open || !$("#panel").hidden) return tick();
        await step(1).catch(error);
        if (autoTimer) tick();
      }, settings.autoSeconds * 1000);
    };
    tick();
  } else {
    let last = performance.now(),
      carry = 0;
    autoTimer = true;
    const frame = (now) => {
      if (!autoTimer || !current) return;
      const dt = Math.min(100, now - last);
      last = now;
      if (autoRendering || $("#dialog").open || !$("#panel").hidden) {
        autoFrame = requestAnimationFrame(frame);
        return;
      }
      carry += (settings.scrollSpeed * dt) / 1000;
      const px = Math.floor(carry);
      if (px >= 1) {
        carry -= px;
        const max = scroll.scrollHeight - scroll.clientHeight;
        if (scroll.scrollTop >= max - 1) {
          if (state.chapter >= current.chapters.length - 1) return reachedEnd();
          autoRendering = true;
          renderChapter(state.chapter + 1)
            .catch(error)
            .finally(() => {
              autoRendering = false;
              last = performance.now();
            });
        } else scroll.scrollTop += px;
      }
      autoFrame = requestAnimationFrame(frame);
    };
    autoFrame = requestAnimationFrame(frame);
  }
}
function stopAuto() {
  if (autoTimer && autoTimer !== true) clearTimeout(autoTimer);
  cancelAnimationFrame(autoFrame);
  autoTimer = null;
  $("#auto-pill").hidden = true;
}
function autoSpeed(dir) {
  if (isPaged() || isFixedType(current))
    settings.autoSeconds = Math.max(3, Math.min(180, settings.autoSeconds - dir * (settings.autoSeconds > 20 ? 5 : 1)));
  else settings.scrollSpeed = Math.max(5, Math.min(300, settings.scrollSpeed + dir * 5));
  saveSettings();
  autoLabel();
  if (isPaged() || isFixedType(current)) startAuto();
}
$("#auto-stop").onclick = stopAuto;
$("#auto-faster").onclick = () => autoSpeed(1);
$("#auto-slower").onclick = () => autoSpeed(-1);

/* ───────────── selection extras ───────────── */
function openExternal(url) {
  if (bridge()?.openExternal) bridge().openExternal(url);
  else window.open(url, "_blank", "noopener");
}
// 查词 hands the words to the phone's own dictionary / translation apps (offline
// ones included); without any, it falls back to an online dictionary.
$("#lookup-selection").onclick = () => {
  if (!selected?.quote) return;
  const q = selected.quote.trim().slice(0, 300);
  if (bridge()?.processText && bridge().processText(q)) return;
  const word = encodeURIComponent(q.slice(0, 80));
  openExternal(cjkUI ? `https://cn.bing.com/dict/search?q=${word}` : `https://${lang}.wiktionary.org/w/index.php?search=${word}`);
};
$("#share-selection").onclick = async () => {
  if (!selected?.quote) return;
  const q = selected.quote.trim(),
    by = isPlaceholderAuthor(current.author) ? "" : current.author;
  const text = cjkUI
    ? `「${q}」\n——《${current.title}》${by ? " " + by : ""}`
    : lang === "fr"
      ? `«\u00a0${q}\u00a0»\n— ${current.title}${by ? ", " + by : ""}`
      : `“${q}”\n— ${current.title}${by ? ", " + by : ""}`;
  if (bridge()?.shareText) return bridge().shareText(text);
  try {
    if (navigator.share) return await navigator.share({ text });
    await navigator.clipboard.writeText(text);
    toast(tr("已复制摘录，可粘贴分享"));
  } catch {}
};
/* ───────────── library controls ───────────── */
$("#batch-cancel").onclick = () => setSelecting(false);
$("#batch-all").onclick = () => {
  const ids = $$("[data-open]").map((x) => x.dataset.open);
  const all = ids.every((id) => picked.has(id));
  ids.forEach((id) => (all ? picked.delete(id) : picked.add(id)));
  renderLibrary();
};
$("#batch-favorite").onclick = () => batchUpdate((s) => (s.favorite = true)).catch(error);
$("#batch-finish").onclick = () =>
  batchUpdate((s) => {
    s.finished = true;
    s.finishedAt = Date.now();
  }).catch(error);
$("#batch-delete").onclick = () => removeBooks([...picked]);
/* ───────────── reader controls ───────────── */
$("#prev-chapter").onclick = () => {
  if (!current) return;
  renderChapter(isFixedType(current) ? 0 : state.chapter - 1).catch(error);
};
$("#next-chapter-btn").onclick = () => {
  if (!current) return;
  renderChapter(isFixedType(current) ? current.pages - 1 : state.chapter + 1).catch(error);
};
function setPdfZoom(z) {
  pdfZoom = Math.max(1, Math.min(4, Math.round(z * 4) / 4));
  $("#reader").classList.toggle("pdf-zoomed", pdfZoom > 1);
  renderChapter(state.chapter, 0).catch(error);
}
$("#pdf-zoom-in").onclick = () => setPdfZoom(pdfZoom + 0.25);
$("#pdf-zoom-out").onclick = () => setPdfZoom(pdfZoom - 0.25);
$("#pdf-zoom-fit").onclick = () => setPdfZoom(1);
let wheelLock = 0;
scroll.addEventListener(
  "wheel",
  (e) => {
    if (!current || !(isPaged() || (isFixedType(current) && pdfZoom === 1))) return;
    if (isFixedType(current) && scroll.scrollHeight > scroll.clientHeight + 4) {
      const atEnd = scroll.scrollTop >= scroll.scrollHeight - scroll.clientHeight - 2;
      const atTop = scroll.scrollTop <= 1;
      if (!(e.deltaY > 0 && atEnd) && !(e.deltaY < 0 && atTop)) return;
    }
    e.preventDefault();
    const now = Date.now();
    if (now < wheelLock || Math.abs(e.deltaY) < 8) return;
    wheelLock = now + 350;
    step(e.deltaY > 0 ? 1 : -1).catch(error);
  },
  { passive: false },
);

/* ───────────── files opened from other apps (Android) ───────────── */
async function takeIncoming() {
  const b = bridge();
  if (!b?.takeIncoming) return;
  await appReady;
  while (isBusy || turning) await new Promise((r) => setTimeout(r, 400));
  let list = [];
  try {
    list = JSON.parse(b.takeIncoming() || "[]");
  } catch {}
  if (!list.length) return;
  busy(true, tr("正在接收文件…"));
  const files = [];
  try {
    for (const it of list) {
      try {
        const r = await fetch(it.url);
        if (!r.ok) throw new Error();
        files.push(new File([await r.blob()], it.name || "book"));
      } catch {
        toast(tr("无法读取 {name}", { name: it.name || tr("文件") }));
      }
    }
  } finally {
    busy(false);
  }
  if (!files.length) return;
  if (current) await backToLibrary();
  await importFiles(files, { open: true });
}
window.liubaiIncoming = () => takeIncoming().catch(error);

/* ───────────── notes export ───────────── */
function exportNotes(bookList) {
  const parts = [];
  for (const b of bookList) {
    const s = getState(b.id);
    if (!s.notes.length && !s.bookmarks.length) continue;
    const chapterName = (n) =>
      isFixedType(b) ? pageLabel(n.chapter + 1) : b.chapterTitles?.[n.chapter] || n.title || sectionLabel(n.chapter + 1);
    let md = `# ${cjkUI ? `《${b.title}》` : b.title}\n\n${author(b.author)}${s.finished ? tr(" · 已读完") : ""} · ${tr("笔记 {n} 条", { n: s.notes.length })} · ${tr("书签 {n} 个", { n: s.bookmarks.length })}\n`;
    const notes = [...s.notes].sort((x, y) => x.chapter - y.chapter || (x.start ?? 0) - (y.start ?? 0));
    let last = null;
    for (const n of notes) {
      const ch = n.chapter;
      if (ch !== last) {
        md += `\n## ${chapterName(n)}\n`;
        last = ch;
      }
      if (n.quote) md += `\n> ${n.quote.replace(/\n+/g, "\n> ")}\n`;
      if (n.note) md += `\n${n.note}\n`;
      md += `\n<sub>${noteTime(n.date)}${n.favorite ? " · ★" : ""}</sub>\n`;
    }
    const marks = s.bookmarks.filter((m) => !m.noteId);
    if (marks.length) {
      md += `\n## ${tr("书签")}\n\n`;
      for (const m of marks.sort((x, y) => x.chapter - y.chapter))
        md += cjkUI
          ? `- ${chapterName(m)}${m.quote ? `：${m.quote}` : ""}（${noteTime(m.date)}）\n`
          : `- ${chapterName(m)}${m.quote ? `: ${m.quote}` : ""} (${noteTime(m.date)})\n`;
    }
    parts.push(md);
  }
  if (!parts.length) return toast(tr("还没有可导出的笔记"));
  download(
    new Blob([parts.join("\n\n---\n\n")], { type: "text/markdown;charset=utf-8" }),
    bookList.length === 1 ? tr("{title}-笔记.md", { title: bookList[0].title }) : tr("留白阅读笔记.md"),
  );
}

/* ───────────── 1.2: progress estimates, chrome, library sheets ───────────── */
let speedSample = null,
  lastSelRange = null,
  lazySave = 0;
function fillRange(el) {
  if (!el) return;
  const min = +el.min || 0,
    max = +el.max || 100;
  el.style.setProperty("--fill", `${((+el.value - min) / (max - min || 1)) * 100}%`);
}
document.addEventListener("input", (e) => e.target.type === "range" && fillRange(e.target), true);
function measureBook() {
  if (!current || isFixedType(current)) return;
  const lens = current.chapters.map((c) => Math.max(1, (c.text || "").length || Math.round((c.html || "").length / 3)));
  const starts = [];
  let t = 0;
  for (const l of lens) {
    starts.push(t);
    t += l;
  }
  current.lens = lens;
  current.starts = starts;
  current.totalChars = t;
}
const bookPos = () =>
  current.starts[state.chapter] + (state.ratio || 0) * current.lens[state.chapter];
function sampleSpeed() {
  if (!current || isFixedType(current) || !current.lens || document.hidden || autoTimer) {
    speedSample = null;
    return;
  }
  const pos = bookPos(),
    now = Date.now();
  if (!speedSample || speedSample.book !== current.id) return void (speedSample = { book: current.id, pos, t: now });
  const dp = pos - speedSample.pos,
    dt = now - speedSample.t;
  if (dp < 0 || dp > 8000 || dt > 300000) return void (speedSample = { book: current.id, pos, t: now });
  if (dt < 5000 || dp < 40) return;
  const cpm = (dp / dt) * 60000,
    key = latinBook() ? "cpmLatin" : "cpm";
  if (cpm > 60 && cpm < (key === "cpm" ? 2500 : 6000)) {
    settings[key] = Math.round(settings[key] * 0.85 + cpm * 0.15);
    clearTimeout(lazySave);
    lazySave = setTimeout(saveSettings, 4000);
  }
  speedSample = { book: current.id, pos, t: now };
}
function fmtLeft(chars) {
  // Western text runs about three times as many characters per minute as Chinese
  const min = chars / Math.max(60, (latinBook() ? settings.cpmLatin : settings.cpm) || 450);
  if (min < 1) return tr("不到 1 分钟");
  if (min < 60) return tr("{m} 分钟", { m: Math.round(min) });
  const h = Math.floor(min / 60),
    m = Math.round(min % 60);
  return (m ? tr("{h} 小时 {m} 分", { h, m }) : tr("{h} 小时", { h }));
}
const chapterLeft = () => fmtLeft(current.lens[state.chapter] * (1 - (state.ratio || 0)));
const bookLeft = () => fmtLeft(current.totalChars - bookPos());
function progressText() {
  const pct = `${(state.percent || 0).toFixed(1)}%`;
  if (isFixedType(current)) return [tr("第 {n} 页，共 {total} 页", { n: state.chapter + 1, total: current.pages }), pct];
  // the footer stays quiet: where you are in the chapter, and in the book
  const left = isPaged() ? tr("本章 {page} / {count}", { page: pager.page + 1, count: pager.count }) : current.lens ? tr("本章还剩 {t}", { t: chapterLeft() }) : "";
  return [left, pct];
}
const STATUS_MODES = [
  ["chapter", tr("本章剩余时间")],
  ["book", tr("全书剩余时间")],
  ["page", tr("本章页码")],
  ["percent", tr("全书进度")],
];
function statusText() {
  if (isFixedType(current)) return `${state.chapter + 1} / ${current.pages}`;
  const mode = settings.statusMode;
  if (mode === "chapter" && current.lens) return tr("本章还剩 {t}", { t: chapterLeft() });
  if (mode === "book" && current.lens) return tr("全书还剩 {t}", { t: bookLeft() });
  if (mode === "page" && isPaged()) return `${pager.page + 1} / ${pager.count}`;
  return `${(state.percent || 0).toFixed(1)}%`;
}
function cycleStatus() {
  const i = STATUS_MODES.findIndex(([k]) => k === settings.statusMode);
  let next = STATUS_MODES[(i + 1) % STATUS_MODES.length];
  if (next[0] === "page" && !isPaged()) next = STATUS_MODES[(i + 2) % STATUS_MODES.length];
  settings.statusMode = next[0];
  saveSettings();
  updateStatusLine();
  toast(next[1]);
}
function positionSelectionMenu() {
  const m = $("#selection-menu");
  if (m.hidden || !lastSelRange) return;
  const rects = [...lastSelRange.getClientRects()].filter((x) => x.width || x.height);
  if (!rects.length) return;
  const first = rects[0],
    last = rects[rects.length - 1],
    vw = innerWidth,
    vh = innerHeight;
  m.style.visibility = "hidden";
  m.style.top = "0px";
  const h = m.offsetHeight,
    w = m.offsetWidth;
  // In the app this is the only selection menu, so it sits above the words like the
  // system one would; in a browser the browser's own menu takes the top, so go below.
  const above = first.top - h - 14,
    below = last.bottom + 14;
  let top = bridge() ? (above >= 14 ? above : below) : below + h > vh - 14 ? above : below;
  if (top < 14 || top + h > vh - 14) top = Math.max(14, (vh - h) / 2);
  const cx = (Math.min(first.left, last.left) + Math.max(first.right, last.right)) / 2;
  m.style.left = `${Math.max(w / 2 + 10, Math.min(vw - w / 2 - 10, cx))}px`;
  m.style.top = `${top}px`;
  m.style.visibility = "";
}
$("#night-toggle").onclick = () => {
  const night = document.body.dataset.theme === "dark";
  if (night) applyThemeKey(settings.lightTheme || "light");
  else {
    if (!settings.followSystem && settings.theme !== "dark") settings.lightTheme = settings.theme;
    applyThemeKey(settings.pureBlack ? "black" : "dark");
  }
};
function setTab(name) {
  $$(".sidebar [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
}
$$(".sidebar [data-view]").forEach(
  (b) =>
    (b.onclick = () => {
      const v = b.dataset.view;
      if (v === "me") showPersonal(annotationList?.tab || "notes");
      else if (!$("#personal").hidden) closePersonal();
      else scrollTo({ top: 0, behavior: "smooth" });
    }),
);
$("#search-toggle").onclick = () => {
  $("#lib-search").hidden = false;
  $("#library-search").focus();
};
$("#search-cancel").onclick = () => {
  $("#library-search").value = "";
  $("#lib-search").hidden = true;
  renderLibrary();
};
const SORTS = [
  ["recent", tr("最近阅读")],
  ["added", tr("最近加入")],
  ["title", tr("书名")],
  ["author", tr("作者")],
  ["progress", tr("阅读进度")],
];
function sheet(title, rows) {
  showDialog(
    title,
    `<div class="dialog-actions-stack">${rows
      .map((r, i) => `<button type="button" data-row="${i}" class="${r.selected ? "selected" : ""} ${r.danger ? "danger" : ""} ${r.divider ? "divided" : ""}">${r.icon ? icon(r.icon) : ""}<span>${E(r.text)}</span>${r.value ? `<span class="me-value" style="margin-left:auto">${E(r.value)}</span>` : ""}</button>`)
      .join("")}</div>`,
    [],
  );
  $$("#dialog [data-row]").forEach(
    (b) =>
      (b.onclick = () => {
        const r = rows[+b.dataset.row];
        $("#dialog").close();
        r.run?.();
      }),
  );
}
$("#me-open").onclick = () => showPersonal(annotationList?.tab || "notes");
$("#sort-open").onclick = () => chooseSort();
// A one-line tip under the shelf until the first long press (or a few launches).
function shelfTipOpen() {
  try {
    return !localStorage.getItem("liubai-hint-manage") && +(localStorage.getItem("liubai-launches") || 0) < 8;
  } catch {
    return false;
  }
}
function shelfTipDone() {
  try {
    localStorage.setItem("liubai-hint-manage", "1");
  } catch {}
  const t = $("#shelf-tip");
  if (t) t.hidden = true;
}
try {
  localStorage.setItem("liubai-launches", String(+(localStorage.getItem("liubai-launches") || 0) + 1));
} catch {}
function chooseSort() {
  const rows = SORTS.map(([k, l]) => ({
    text: l,
    selected: settings.librarySort === k,
    run: () => {
      settings.librarySort = k;
      saveSettings();
      renderLibrary();
    },
  }));
  rows.push({
    text: settings.libraryView === "list" ? tr("以网格显示") : tr("以列表显示"),
    divider: true,
    run: () => {
      settings.libraryView = settings.libraryView === "list" ? "grid" : "list";
      saveSettings();
      renderLibrary();
    },
  });
  sheet(tr("排序"), rows);
}
// Language: follow the phone, or pick one. Switching reloads the page so every
// string, date and number is redone in the new language.
function chooseLang() {
  const choice = langChoice();
  sheet(tr("语言"), [
    { text: tr("跟随系统"), selected: !choice, run: () => switchLang("") },
    ...LANGS.map((l) => ({ text: LANG_NAMES[l], selected: choice === l, run: () => switchLang(l) })),
  ]);
}
function switchLang(v) {
  if (v === langChoice()) return;
  setLangChoice(v);
  persist();
  try {
    sessionStorage.setItem("liubai-reopen-me", "1");
  } catch {}
  setTimeout(() => location.reload(), 60);
}
function chooseTheme() {
  const rows = THEMES.map(([k, l]) => ({
    text: l,
    selected: !settings.followSystem && currentThemeKey() === k,
    run: () => {
      applyThemeKey(k);
      if (!$("#personal").hidden && personalView === "me") showPersonal(annotationList?.tab);
    },
  }));
  rows.push({
    text: tr("跟随系统"),
    selected: settings.followSystem,
    run: () => {
      changeReadingSetting("followSystem", true);
      if (!$("#personal").hidden && personalView === "me") showPersonal(annotationList?.tab);
    },
  });
  sheet(tr("外观"), rows);
}

/* ───────────── 1.4: back-to-place, scrub preview, footnotes ───────────── */
let jumpFrom = null,
  backPillTurns = 0;
function markJump() {
  if (!current || !state) return;
  updateProgress();
  jumpFrom = {
    book: current.id,
    chapter: state.chapter,
    ratio: state.ratio,
    offset: captureTextPosition().offset ?? state.offset,
    label: isFixedType(current) ? pageLabel(state.chapter + 1) : current.chapters[state.chapter]?.title || "",
  };
}
function showBackPill() {
  if (!jumpFrom || !current || jumpFrom.book !== current.id) return;
  if (jumpFrom.chapter === state.chapter && Math.abs((jumpFrom.ratio || 0) - (state.ratio || 0)) < 0.02) return;
  const pill = $("#back-pill");
  pill.querySelector("span").textContent = tr("回到 {place}", { place: jumpFrom.label || tr("原处") });
  pill.hidden = false;
  backPillTurns = 6;
}
$("#back-pill").onclick = () => {
  const j = jumpFrom;
  $("#back-pill").hidden = true;
  backPillTurns = 0;
  if (!j || !current || j.book !== current.id) return;
  markJump();
  renderChapter(j.chapter, j.ratio, Number.isInteger(j.offset) ? { offset: j.offset } : null)
    .then(showBackPill)
    .catch(error);
};
$("#progress").addEventListener("input", (e) => {
  if (!current) return;
  const v = +e.target.value / 1000,
    tip = $("#scrub-tip");
  let label;
  if (isFixedType(current)) label = pageLabel(Math.round(v * (current.pages - 1)) + 1);
  else {
    const i = Math.min(current.chapters.length - 1, Math.floor(v * current.chapters.length));
    label = current.chapters[i]?.title || chapterLabel(i + 1);
  }
  tip.innerHTML = `<b>${E(label)}</b><span>${(v * 100).toFixed(1)}%</span>`;
  tip.hidden = false;
});
$("#progress").addEventListener("pointerup", () => setTimeout(() => ($("#scrub-tip").hidden = true), 600));
const noteDocs = new Map();
// Footnote links: show the note in place instead of leaving the page.
// chapters split at import share a base path ("file.html::2")
function resolveTarget(path, anchor) {
  const parts = [];
  current.chapters.forEach((c, i) => {
    if (c.path === path || c.path.startsWith(path + "::")) parts.push(i);
  });
  if (!parts.length) return -1;
  if (anchor) {
    const id = decodeURIComponent(anchor);
    const hit = parts.find((i) => current.chapters[i].html.includes(`data-anchor="${id}"`));
    if (hit != null) return hit;
  }
  return parts[0];
}
function footnote(a, index, anchor) {
  const text = a.textContent.trim();
  const looksLikeRef = text.length <= 6 || a.closest("sup") || /^[\[［(（]?\s*(注|\d|[①-⑳]|[*＊†])/.test(text);
  if (!looksLikeRef) return false;
  let host;
  if (index === state.chapter) host = article;
  else {
    if (!noteDocs.has(index)) {
      const d = document.createElement("div");
      d.innerHTML = chapterHTML(index);
      noteDocs.set(index, d);
    }
    host = noteDocs.get(index);
  }
  const id = decodeURIComponent(anchor);
  const el = [...host.querySelectorAll("[data-anchor]")].find((n) => n.dataset.anchor === id);
  if (!el) return false;
  const block = el.matches("p,li,div,blockquote,dd,td") ? el : el.closest("p,li,div,blockquote,dd,td") || el;
  if (block === host || /^H[1-6]$/.test(block.tagName)) return false;
  const body = block.textContent.replace(/\s+/g, " ").trim();
  if (!body || body.length > 800) return false;
  showDialog(tr("注释"), `<p class="footnote-text">${E(body)}</p>`, [
    {
      text: tr("跳到注释处"),
      run: () => {
        markJump();
        renderChapter(index, 0, { anchor }).then(showBackPill).catch(error);
      },
    },
    { text: tr("好") },
  ]);
  return true;
}

/* ───────────── 1.5: page-turn effects (覆盖 / 翻书) & resume ───────────── */
const fx = { dir: 0, t: 0, layer: null, boundary: false, busy: false, frame: 0 };
const fxKind = () => (pager.spread ? "cover" : settings.animation);
function fxOn() {
  return (
    isPaged() &&
    (settings.animation === "cover" || settings.animation === "flip") &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
function snapshotLayer(page) {
  const layer = document.createElement("div");
  layer.className = `turn-layer fx-${fxKind()}`;
  const c = article.cloneNode(true);
  c.removeAttribute("id");
  c.className = "neighbor-content" + (article.classList.contains("raw-indent") ? " raw-indent" : "");
  c.style.transition = "none";
  c.style.transform = `translate3d(${-page * pager.pitch}px,0,0)`;
  const shade = document.createElement("i");
  shade.className = "turn-shade";
  layer.append(c, shade);
  scroll.append(layer);
  return layer;
}
/* Low-end phones: if page turns keep dropping below ~30 fps, switch to a lighter
   rendering (no mirrored text on the back of the leaf, fewer shadows). Phones with
   very little memory start in the light mode. */
const fxMeter = { last: 0, sum: 0, n: 0, slow: 0 };
function meterFrame(now) {
  if (fxMeter.last) {
    const d = now - fxMeter.last;
    if (d < 250) {
      fxMeter.sum += d;
      fxMeter.n++;
    }
  }
  fxMeter.last = now;
}
function meterDone() {
  if (fxMeter.n >= 5 && !document.hidden) {
    fxMeter.slow = fxMeter.sum / fxMeter.n > 30 ? fxMeter.slow + 1 : 0;
    if (fxMeter.slow >= 2) setFxLite(true);
  }
  fxMeter.last = fxMeter.sum = fxMeter.n = 0;
}
function setFxLite(on) {
  document.body.classList.toggle("fx-lite", on);
  try {
    if (on) localStorage.setItem("liubai-fx-lite", "1");
  } catch {}
}
try {
  if (localStorage.getItem("liubai-fx-lite") || (navigator.deviceMemory && navigator.deviceMemory <= 2)) document.body.classList.add("fx-lite");
} catch {}
function fxPrepare(dir) {
  if (fx.dir === dir && fx.layer) return true;
  fxCleanup(true);
  const atEdge = dir > 0 ? pager.page >= pager.count - 1 : pager.page <= 0;
  const target = state.chapter + dir;
  if (atEdge && (target < 0 || target >= current.chapters.length)) return false;
  fx.dir = dir;
  fx.t = 0;
  fx.boundary = atEdge;
  article.style.userSelect = "none";
  if (!atEdge) {
    if (dir > 0) {
      fx.layer = snapshotLayer(pager.page);
      pager.paint(-pager.pitch); // the page underneath is already the next one
    } else fx.layer = snapshotLayer(pager.page - 1);
  } else {
    prepareNeighbor(dir);
    const n = $("#page-neighbor");
    n.style.transition = "none";
    if (dir > 0) {
      n.style.transform = "translate3d(0,0,0)";
      fx.layer = snapshotLayer(pager.page);
    } else {
      n.classList.add("turn-layer", `fx-${fxKind()}`);
      const shade = document.createElement("i");
      shade.className = "turn-shade";
      n.append(shade);
      fx.layer = n;
    }
  }
  if (fxKind() === "flip") curlSetup();
  fxSet(0);
  return true;
}
function fxSet(t) {
  fx.t = t;
  const L = fx.layer;
  if (!L) return;
  const p = fx.dir > 0 ? t : 1 - t, // how far the moving page has left the screen
    W = pager.pitch;
  L.style.transition = "none";
  if (fxKind() === "flip") return curlRender(curlPath(p));
  L.style.transform = `translate3d(${(-p * W).toFixed(1)}px,0,0)`;
  L.style.setProperty("--p", p.toFixed(3));
}
function fxAnimate(to, velocity = 0) {
  cancelAnimationFrame(fx.frame);
  if (fxKind() === "flip" && fx.P) return curlAnimate(to, velocity);
  const from = fx.t,
    dist = Math.abs(to - from);
  if (!dist || settings.animation === "none") {
    fxSet(to);
    return Promise.resolve();
  }
  let duration = Math.max(140, (fxKind() === "flip" ? 420 : 320) * dist);
  if (Math.abs(velocity) > 0.3) duration = Math.max(120, Math.min(duration, ((dist * pager.pitch) / Math.abs(velocity)) * 1.3));
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration),
        e = 1 - Math.pow(1 - k, 3);
      fxSet(from + (to - from) * e);
      meterFrame(now);
      if (k < 1) fx.frame = requestAnimationFrame(tick);
      else {
        meterDone();
        resolve();
      }
    };
    fx.frame = requestAnimationFrame(tick);
  });
}
async function fxFinish(commit, velocity = 0) {
  const dir = fx.dir;
  if (!dir) return;
  const ticket = renderTicket;
  await fxAnimate(commit ? 1 : 0, velocity);
  if (ticket !== renderTicket || !current) return fxCleanup(false);
  if (!commit) {
    pager.paint();
    return fxCleanup(false);
  }
  if (!fx.boundary) {
    pager.page += dir;
    pager.paint();
    fxCleanup(false);
    updateProgress();
    persist();
    return;
  }
  fx.busy = true;
  try {
    await renderChapter(state.chapter + dir, dir < 0 ? 1 : 0);
  } finally {
    fx.busy = false;
    fxCleanup(false);
  }
}
function fxCleanup(restore) {
  cancelAnimationFrame(fx.frame);
  for (const el of fx.parts || []) el.remove();
  fx.parts = null;
  fx.P = null;
  fx.C = null;
  fx.dragC = false;
  if (fx.layer) {
    fx.layer.style.clipPath = "";
    fx.layer.style.transform = "";
  }
  const L = fx.layer;
  if (L) {
    if (L.id === "page-neighbor") {
      L.classList.remove("turn-layer", "fx-cover", "fx-flip");
      L.style.removeProperty("--p");
    } else L.remove();
  }
  if (fx.boundary || L?.id === "page-neighbor") hideNeighbor();
  if (restore && fx.dir && current && isPaged()) pager.paint();
  fx.dir = 0;
  fx.t = 0;
  fx.layer = null;
  fx.boundary = false;
  article.style.userSelect = "";
}
function saveSession(id) {
  store("settings", id ? "put" : "delete", ...(id ? [id, "session"] : ["session"])).catch(() => {});
}

/* ── 仿真翻页：纸张从页角掀起，沿折线翻折 ── */
function clipHalf(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i],
      B = pts[(i + 1) % pts.length],
      fa = f(A),
      fb = f(B);
    if (fa >= 0) out.push(A);
    if (fa >= 0 !== fb >= 0) {
      const k = fa / (fa - fb);
      out.push({ x: A.x + (B.x - A.x) * k, y: A.y + (B.y - A.y) * k });
    }
  }
  return out;
}
const polyCss = (pts) =>
  pts.length < 3 ? "polygon(0 0,0 0,0 0)" : `polygon(${pts.map((p) => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(",")})`;
function curlSetup() {
  const W = scroll.clientWidth,
    H = scroll.clientHeight,
    F = fx.layer;
  fx.W = W;
  fx.H = H;
  fx.C = fx.C || { x: W, y: H };
  // back of the leaf: paper with the page's text faintly showing through
  const back = document.createElement("div");
  back.className = "turn-back";
  const ghost = document.body.classList.contains("fx-lite") ? null : F.querySelector(".neighbor-content")?.cloneNode(true);
  if (ghost) back.append(ghost);
  const backShade = document.createElement("i");
  backShade.className = "curl-strip back-shade";
  back.append(backShade);
  const cast = document.createElement("i");
  cast.className = "curl-strip cast-shade";
  const bend = document.createElement("i");
  bend.className = "curl-strip bend-shade";
  F.append(bend);
  scroll.append(cast, back);
  fx.parts = [back, cast, bend];
  Object.assign(fx, { back, backShade, cast, bend });
}
function curlPath(u) {
  // corner lifts first, travels up a little, then sweeps to the spine
  const W = fx.W,
    C = fx.C;
  const lift = Math.sin(Math.PI * Math.min(1, u * 1.15)) * fx.H * (C.y > fx.H / 2 ? -0.1 : C.y < fx.H / 2 ? 0.1 : 0);
  return { x: W - u * 2 * W, y: C.y + lift };
}
function placeStrip(el, M, n, len, thick, towardC) {
  // strip lying along the fold line, on the C side (towardC) or the page side
  const ang = Math.atan2(n.x, -n.y) * (180 / Math.PI); // local +y = -n
  const sign = towardC ? -1 : 1;
  const cx = M.x + sign * n.x * (thick / 2),
    cy = M.y + sign * n.y * (thick / 2);
  el.style.width = `${len}px`;
  el.style.height = `${thick}px`;
  el.style.transform = `translate(${(cx - len / 2).toFixed(1)}px,${(cy - thick / 2).toFixed(1)}px) rotate(${(towardC ? ang : ang + 180).toFixed(2)}deg)`;
}
function curlRender(P) {
  const W = fx.W,
    H = fx.H,
    C = fx.C,
    F = fx.layer;
  if (!F || !C) return;
  // keep the leaf attached at the spine
  const S = { x: 0, y: C.y },
    maxR = Math.hypot(C.x - S.x, C.y - S.y),
    dS = Math.hypot(P.x - S.x, P.y - S.y);
  if (dS > maxR) P = { x: S.x + ((P.x - S.x) * maxR) / dS, y: S.y + ((P.y - S.y) * maxR) / dS };
  fx.P = P;
  const dx = P.x - C.x,
    dy = P.y - C.y,
    len = Math.hypot(dx, dy);
  if (len < 0.5) {
    F.style.clipPath = "";
    fx.back.style.visibility = "hidden";
    fx.cast.style.opacity = 0;
    fx.bend.style.opacity = 0;
    return;
  }
  const n = { x: dx / len, y: dy / len },
    M = { x: (P.x + C.x) / 2, y: (P.y + C.y) / 2 },
    s = (X) => (X.x - M.x) * n.x + (X.y - M.y) * n.y;
  const rect = [
    { x: 0, y: 0 },
    { x: W, y: 0 },
    { x: W, y: H },
    { x: 0, y: H },
  ];
  F.style.clipPath = polyCss(clipHalf(rect, s));
  const flap = clipHalf(rect, (X) => -s(X));
  const a = 1 - 2 * n.x * n.x,
    b = -2 * n.x * n.y,
    d = 1 - 2 * n.y * n.y,
    k = 2 * (M.x * n.x + M.y * n.y);
  fx.back.style.visibility = "visible";
  fx.back.style.clipPath = polyCss(flap);
  fx.back.style.transform = `matrix(${a},${b},${b},${d},${k * n.x},${k * n.y})`;
  const diag = Math.hypot(W, H) * 2,
    lift = Math.min(1, len / (W * 0.6));
  placeStrip(fx.cast, M, n, diag, Math.min(60, 12 + len * 0.18), true);
  fx.cast.style.opacity = (0.35 + 0.65 * lift).toFixed(3);
  placeStrip(fx.backShade, M, n, diag, Math.min(len / 2, 140), true);
  placeStrip(fx.bend, M, n, diag, Math.min(36, 8 + len * 0.1), false);
  fx.bend.style.opacity = lift.toFixed(3);
  fx.t = fx.dir > 0 ? Math.min(1, Math.max(0, (W - P.x) / (2 * W))) : 1 - Math.min(1, Math.max(0, (W - P.x) / (2 * W)));
}
function curlFinger(x, y, startY) {
  if (!fx.dragC) {
    const H = fx.H;
    fx.C = { x: fx.W, y: startY > H * 0.62 ? H : startY < H * 0.38 ? 0 : startY };
    fx.dragC = true;
  }
  if (fx.C.y !== 0 && fx.C.y !== fx.H) y = fx.C.y; // grabbed mid-edge: a straight fold
  curlRender({ x: Math.min(fx.W, x), y });
}
function curlAnimate(to, velocity = 0) {
  const flatOnTop = fx.dir > 0 ? to === 0 : to === 1; // the leaf ends flat over the page
  const P0 = { ...fx.P },
    E = flatOnTop ? { x: fx.C.x, y: fx.C.y } : { x: -fx.W, y: fx.C.y };
  const dist = Math.hypot(E.x - P0.x, E.y - P0.y) / (2 * fx.W);
  let duration = Math.max(160, 520 * dist);
  if (Math.abs(velocity) > 0.3) duration = Math.max(150, Math.min(duration, ((dist * 2 * fx.W) / Math.abs(velocity)) * 1.2));
  if (settings.animation === "none") duration = 0;
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const k = duration ? Math.min(1, (now - start) / duration) : 1,
        e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2,
        arc = flatOnTop ? 0 : Math.sin(Math.PI * e) * fx.H * 0.04 * (fx.C.y >= fx.H / 2 ? -1 : 1);
      curlRender({ x: P0.x + (E.x - P0.x) * e, y: P0.y + (E.y - P0.y) * e + arc });
      meterFrame(now);
      if (k < 1) fx.frame = requestAnimationFrame(tick);
      else {
        meterDone();
        fx.t = to;
        resolve();
      }
    };
    fx.frame = requestAnimationFrame(tick);
  });
}

/* ───────────── 1.6: 繁简转换 · 看图 · 调整分章 ───────────── */
let zhMaps = null;
async function loadZh() {
  if (zhMaps) return zhMaps;
  const { T2S, S2T } = await import("./zhconv-data.js");
  const build = ([k, v]) => {
    const a = Array.from(k),
      b = Array.from(v),
      m = new Map();
    a.forEach((c, i) => m.set(c, b[i]));
    return m;
  };
  zhMaps = { s: build(T2S), t: build(S2T) };
  return zhMaps;
}
// character-for-character, so note and highlight positions never shift
function zhText(str) {
  const m = zhMaps?.[settings.zh];
  if (!m || !str) return str;
  let out = "";
  for (const ch of str) out += m.get(ch) || ch;
  return out;
}
const zhT = (s) => (settings.zh && zhMaps ? zhText(s) : s);
function zhNode(root) {
  if (!zhMaps?.[settings.zh]) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode,
      t = zhText(n.data);
    if (t !== n.data) n.data = t;
  }
}
async function setZh(v) {
  if (v) await loadZh();
  settings.zh = v;
  saveSettings();
  searchCache.clear();
  if (current && !isFixedType(current)) {
    const pos = captureTextPosition();
    await renderChapter(state.chapter, pos.ratio || 0, Number.isInteger(pos.offset) ? { offset: pos.offset } : null);
  }
}

function openImage(src) {
  $("#img-viewer")?.remove();
  const v = document.createElement("div");
  v.id = "img-viewer";
  v.innerHTML = `<img alt=""><button class="icon-btn iv-close" aria-label="${tr("关闭")}">${icon("close")}</button><p class="iv-hint">${tr("双指缩放，双击放大，轻点关闭")}</p>`;
  document.body.append(v);
  const img = v.querySelector("img");
  let s = 1,
    x = 0,
    y = 0,
    base = 1;
  const pts = new Map();
  let pinch = null,
    pan = null,
    moved = false,
    lastTap = 0;
  const fit = () => {
    const vw = innerWidth,
      vh = innerHeight,
      r = Math.min(vw / img.naturalWidth, vh / img.naturalHeight, 1.6);
    base = r;
    img.style.maxWidth = img.style.maxHeight = "none";
    img.style.width = img.naturalWidth * r + "px";
    img.style.height = img.naturalHeight * r + "px";
    s = 1;
    x = (vw - img.naturalWidth * r) / 2;
    y = (vh - img.naturalHeight * r) / 2;
    paint();
  };
  const clamp = () => {
    const w = img.naturalWidth * base * s,
      h = img.naturalHeight * base * s,
      vw = innerWidth,
      vh = innerHeight;
    x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, x));
    y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, y));
  };
  const paint = () => (img.style.transform = `translate(${x}px,${y}px) scale(${s})`);
  img.style.left = img.style.top = "0";
  img.onload = fit;
  img.src = src;
  const zoomAt = (cx, cy, ns) => {
    ns = Math.max(1, Math.min(6, ns));
    x = cx - ((cx - x) * ns) / s;
    y = cy - ((cy - y) * ns) / s;
    s = ns;
    clamp();
    paint();
  };
  v.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".iv-close")) return;
    v.setPointerCapture?.(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false;
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      pan = null;
    } else pan = { x: e.clientX, y: e.clientY, ox: x, oy: y };
  });
  v.addEventListener("pointermove", (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      moved = true;
      img.style.transition = "none";
      zoomAt(pinch.cx, pinch.cy, (pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d);
    } else if (pan) {
      const dx = e.clientX - pan.x,
        dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) moved = true;
      x = pan.ox + dx;
      y = pan.oy + dy;
      clamp();
      paint();
    }
  });
  const up = (e) => {
    pts.delete(e.pointerId);
    if (pts.size < 2) pinch = null;
    if (pts.size) return;
    pan = null;
    if (moved) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      lastTap = 0;
      clearTimeout(v._t);
      img.style.transition = "transform .2s ease";
      zoomAt(e.clientX, e.clientY, s > 1.2 ? 1 : 2.5);
      setTimeout(() => (img.style.transition = ""), 220);
    } else {
      lastTap = now;
      v._t = setTimeout(() => v.remove(), 300);
    }
  };
  v.addEventListener("pointerup", up);
  v.addEventListener("pointercancel", up);
  v.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    },
    { passive: false },
  );
  v.querySelector(".iv-close").onclick = () => v.remove();
  addEventListener("resize", () => document.body.contains(v) && fit(), { once: true });
}

const SPLIT_RULES = [
  ["auto", tr("自动识别"), null],
  ["zhang", tr("第×章 / 第×回"), /^第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章回].{0,40}$/],
  ["juan", tr("第×卷 + 第×章"), /^(第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[卷章回部].{0,40}|卷\s*[零〇一二三四五六七八九十百千\d]+.{0,30})$/],
  ["num", tr("数字开头（1. / 001 / 一、）"), /^(\d{1,4}[.、．\s]|[一二三四五六七八九十百]+、).{0,40}$/],
  ["en", "Chapter / Part", /^(chapter|part)\s+[\divxlc]+\b.{0,50}$/i],
  ["size", tr("不按标题，每 1 万字一段"), /^￿$/],
  ["custom", tr("自定义（正则表达式）"), null],
];
async function resplitBook(b) {
  const content = await loadContent(b.id);
  if (!content?.bytes) return toast(tr("找不到这本书的原文件"));
  const source = await asBuffer(content.bytes);
  const s = getState(b.id);
  showDialog(
    tr("调整分章"),
    `<div class="dialog-actions-stack split-rules">${SPLIT_RULES.map(([k, l]) => `<button type="button" data-rule="${k}">${l}</button>`).join("")}</div><input id="rule-custom" type="text" placeholder="${tr("例如：^第.+[章节]")}" hidden><p class="panel-note" id="rule-preview">${tr("选一种规则，下面会预览分出的章节。")}</p>${s.notes.length || s.bookmarks.length ? `<p class="panel-note">${tr("已有的笔记和书签会保留，但位置可能对不上新的章节。")}</p>` : ""}`,
    [{ text: tr("取消") }, { text: tr("应用"), run: () => apply() }],
  );
  let rule = null,
    key = "auto",
    result = null;
  const preview = () => {
    try {
      const opts = { heading: rule };
      if (key === "size") opts.chunk = 10000;
      result = parseTxt(source, b.filename || b.title + ".txt", opts);
      const titles = result.chapters.slice(0, 6).map((c) => E(c.title));
      $("#rule-preview").innerHTML = tr("分出 {n} 章：{titles}", { n: result.chapters.length, titles: titles.join(tr("，")) + (result.chapters.length > 6 ? "……" : "") });
    } catch (e) {
      result = null;
      $("#rule-preview").textContent = e.message;
    }
  };
  $$("[data-rule]").forEach(
    (btn) =>
      (btn.onclick = () => {
        key = btn.dataset.rule;
        $$("[data-rule]").forEach((x) => x.classList.toggle("selected", x === btn));
        $("#rule-custom").hidden = key !== "custom";
        if (key === "custom") {
          $("#rule-custom").focus();
          return;
        }
        rule = SPLIT_RULES.find(([k]) => k === key)[2];
        preview();
      }),
  );
  $("#rule-custom").oninput = (e) => {
    try {
      rule = e.target.value.trim() ? new RegExp(e.target.value.trim(), "i") : null;
      preview();
    } catch {
      $("#rule-preview").textContent = tr("这个正则表达式写得不对");
    }
  };
  async function apply() {
    if (!result) return false;
    const pct = (s.percent || 0) / 100;
    await store("contents", "put", { id: b.id, bytes: content.bytes, chapters: result.chapters, nav: result.nav });
    b.chapterCount = result.chapters.length;
    b.chapterTitles = result.chapters.map((c) => c.title.slice(0, 120));
    await store("books", "put", b);
    s.chapter = Math.min(result.chapters.length - 1, Math.floor(pct * result.chapters.length));
    s.ratio = 0;
    s.offset = null;
    await store("states", "put", structuredClone(s));
    for (const k of searchCache.keys()) if (k.startsWith(b.id + ":")) searchCache.delete(k);
    toast(tr("已重新分为 {n} 章", { n: result.chapters.length }));
  }
}

/* ───────────── WebDAV 同步（进度、笔记、书签、收藏/读完） ───────────── */
// deleted notes/bookmarks leave a tombstone so another device can't bring them back
function keepRecords(s, list, keep) {
  const out = [];
  for (const r of list) {
    if (keep(r)) out.push(r);
    else (s.tomb || (s.tomb = {}))[r.id] = Date.now();
  }
  return out;
}
let syncConf = null,
  syncing = null,
  syncTimer = 0;
const httpWaits = new Map();
window.liubaiHttp = (id, status, body) => {
  const w = httpWaits.get(id);
  if (!w) return;
  httpWaits.delete(id);
  w({ status, body });
};
function davRequest(method, url, body = "") {
  const auth = "Basic " + btoa(unescape(encodeURIComponent(`${syncConf.user}:${syncConf.pass}`)));
  const headers = { Authorization: auth, "Content-Type": "application/json; charset=utf-8" };
  if (bridge()?.http) {
    const id = uid();
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        httpWaits.delete(id);
        resolve({ status: -1, body: "timeout" });
      }, 45000);
      httpWaits.set(id, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      bridge().http(id, method, url, JSON.stringify(headers), body);
    });
  }
  return fetch(url, { method, headers, body: method === "GET" ? undefined : body })
    .then(async (r) => ({ status: r.status, body: await r.text() }))
    .catch((e) => ({ status: -1, body: String(e) }));
}
const syncURL = () => syncConf.url.replace(/\/?$/, "/") + "liubai-sync.json";
function mergeState(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = (a.lastRead || 0) >= (b.lastRead || 0) ? a : b;
  const tomb = { ...(b.tomb || {}), ...(a.tomb || {}) };
  const cutoff = Date.now() - 180 * 86400000;
  for (const k in tomb) if (tomb[k] < cutoff) delete tomb[k];
  const live = (r) => !(tomb[r.id] && tomb[r.id] >= (r.updatedAt || r.date || 0));
  return {
    ...newer,
    favorite: newer.favorite,
    finished: !!newer.finished,
    seconds: Math.max(a.seconds || 0, b.seconds || 0),
    notes: mergeRecords(a.notes || [], b.notes || []).filter(live),
    bookmarks: mergeRecords(a.bookmarks || [], b.bookmarks || []).filter(live),
    tomb,
  };
}
async function syncNow({ quiet = false } = {}) {
  if (!syncConf?.url || !syncConf.user) return;
  if (syncing) return syncing;
  syncing = (async () => {
    if (current) await flushState();
    const got = await davRequest("GET", syncURL());
    if (got.status === 401 || got.status === 403) throw new Error(tr("同步失败：账号或应用密码不对"));
    if (got.status < 0) throw new Error(tr("同步失败：连不上服务器，请检查网络和地址"));
    let remote = { version: 1, books: {}, states: {} };
    if (got.status >= 200 && got.status < 300 && got.body) {
      try {
        remote = JSON.parse(got.body);
      } catch {
        throw new Error(tr("同步失败：服务器上的同步文件已损坏"));
      }
    } else if (got.status !== 404) throw new Error(tr("同步失败：服务器返回 {code}", { code: got.status }));
    if (remote.stats) mergeStats(remote.stats);
    const out = { version: 1, updated: Date.now(), books: { ...(remote.books || {}) }, states: { ...(remote.states || {}) }, stats };
    let changed = 0;
    for (const b of books) {
      out.books[b.id] = { title: b.title, author: b.author, format: b.format || b.type, size: b.size || 0 };
      const local = getState(b.id),
        merged = mergeState(local, remote.states?.[b.id]);
      out.states[b.id] = merged;
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        const keepOpen = state && state.id === b.id;
        Object.assign(local, merged);
        await store("states", "put", structuredClone(local));
        if (keepOpen) changed++;
        else changed += 0;
      }
    }
    const put = await davRequest("PUT", syncURL(), JSON.stringify(out));
    if (put.status === 404 || put.status === 409) throw new Error(tr("同步失败：服务器上找不到这个文件夹，请先在网盘里建好它"));
    if (put.status < 200 || put.status >= 300) throw new Error(tr("同步失败：保存时服务器返回 {code}", { code: put.status }));
    syncConf.last = Date.now();
    syncConf.error = "";
    await store("settings", "put", syncConf, "sync");
    if (!current) renderLibrary();
    if (!quiet) toast(tr("已同步"));
  })()
    .catch(async (e) => {
      syncConf.error = e.message;
      await store("settings", "put", syncConf, "sync").catch(() => {});
      if (!quiet) toast(e.message);
    })
    .finally(() => (syncing = null));
  return syncing;
}
function scheduleSync(delay = 1500) {
  if (!syncConf?.url) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow({ quiet: true }), delay);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) scheduleSync(0);
  else scheduleSync(2000);
});
appReady.then(async () => {
  syncConf = (await store("settings", "get", "sync").catch(() => null)) || null;
  scheduleSync(3000);
});
const syncLabel = () =>
  !syncConf?.url ? tr("未开启") : syncConf.error ? tr("出错了") : syncConf.last ? tr("{time} 已同步", { time: dateTimeText(syncConf.last, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) }) : tr("已开启");
function showSync() {
  // Jianguoyun is the usual WebDAV host for Chinese readers; elsewhere start empty
  const c = syncConf || { url: cjkUI ? "https://dav.jianguoyun.com/dav/我的坚果云/" : "", user: "", pass: "" };
  showDialog(
    tr("同步"),
    `<p>${tr("用 WebDAV 在几台设备间同步进度、笔记和书签。书本身不上传，每台设备各自导入。")}</p>
     <label class="field-label" for="dav-url">${tr("文件夹地址")}</label><input id="dav-url" type="url" value="${E(c.url)}" placeholder="https://example.com/dav/" autocomplete="off" autocapitalize="off" spellcheck="false">
     <label class="field-label" for="dav-user">${tr("账号")}</label><input id="dav-user" type="text" value="${E(c.user)}" autocomplete="username">
     <label class="field-label" for="dav-pass">${tr("应用密码")}</label><input id="dav-pass" type="password" value="${E(c.pass)}" autocomplete="current-password">
     <p class="panel-note">${tr("坚果云：在网页版「账户信息 → 安全选项」里添加应用，生成第三方应用密码。")}${syncConf?.error ? `<br><span class="danger">${E(syncConf.error)}</span>` : syncConf?.last ? "<br>" + tr("上次同步：{time}", { time: E(syncLabel()) }) : ""}</p>`,
    [
      ...(syncConf?.url
        ? [
            {
              text: tr("关闭同步"),
              danger: true,
              run: async () => {
                syncConf = null;
                await store("settings", "delete", "sync");
                toast(tr("已关闭同步"));
                if (!$("#personal").hidden && personalView === "me") showPersonal(annotationList?.tab);
              },
            },
          ]
        : [{ text: tr("取消") }]),
      {
        text: tr("保存并同步"),
        run: async () => {
          const url = $("#dav-url").value.trim(),
            user = $("#dav-user").value.trim(),
            pass = $("#dav-pass").value;
          if (!/^https?:\/\//i.test(url) || !user || !pass) {
            toast(tr("请填写完整的地址、账号和密码"));
            return false;
          }
          syncConf = { url, user, pass, last: 0, error: "" };
          await store("settings", "put", syncConf, "sync");
          busy(true, tr("正在同步…"));
          try {
            await syncNow();
          } finally {
            busy(false);
          }
          if (!$("#personal").hidden && personalView === "me") showPersonal(annotationList?.tab);
        },
      },
    ],
  );
}

/* ───────────── 阅读记录（只在「我的 → 阅读记录」里出现） ───────────── */
let stats = {},
  statsSave = 0,
  lastActivity = Date.now();
const dayKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
["pointerdown", "keydown", "wheel"].forEach((t) => addEventListener(t, () => (lastActivity = Date.now()), { passive: true, capture: true }));
scroll.addEventListener("scroll", () => (lastActivity = Date.now()), { passive: true });
// count only time with the book open, on screen, and touched within the last few minutes
setInterval(() => {
  if (!current || document.hidden || isBusy || $("#reader").hidden) return;
  if (Date.now() - lastActivity > (autoTimer ? 30 * 60000 : 4 * 60000)) return;
  state.seconds = (state.seconds || 0) + 10;
  const k = dayKey();
  stats[k] = (stats[k] || 0) + 10;
  clearTimeout(statsSave);
  statsSave = setTimeout(() => {
    store("settings", "put", stats, "stats").catch(() => {});
    persist();
  }, 2000);
}, 10000);
function mergeStats(other) {
  for (const [k, v] of Object.entries(other || {}))
    if (/^\d{4}-\d\d-\d\d$/.test(k) && Number.isFinite(+v)) stats[k] = Math.max(stats[k] || 0, +v);
  store("settings", "put", stats, "stats").catch(() => {});
}
function statsLabel() {
  const t = stats[dayKey()] || 0;
  return t >= 60 ? tr("今天 {t}", { t: fmtDuration(t) }) : "";
}
function showStats() {
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    days.push({ d, sec: stats[dayKey(d)] || 0 });
  }
  let streak = 0;
  for (let i = 0; i < 3650; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    if ((stats[dayKey(d)] || 0) >= 60) streak++;
    else if (i > 0) break;
  }
  const week = days.reduce((a, x) => a + x.sec, 0),
    total = Object.values(states).reduce((a, s) => a + (s.seconds || 0), 0),
    finished = books.filter((b) => getState(b.id).finished).length,
    today = days[6].sec;
  const wk = (d) => (cjkUI ? "日一二三四五六"[d.getDay()] : d.toLocaleDateString(locale, { weekday: "narrow" }));
  const top = books
    .map((b) => ({ b, sec: getState(b.id).seconds || 0 }))
    .filter((x) => x.sec >= 60)
    .sort((a, b) => b.sec - a.sec)
    .slice(0, 5);
  const bits = [];
  if (week >= 60) bits.push(tr("近 7 天 {t}", { t: fmtDuration(week) }));
  if (total >= 60) bits.push(tr("累计 {t}", { t: fmtDuration(total) }));
  if (finished) bits.push(tr("读完 {n} 本", { n: finished }));
  if (streak > 1) bits.push(tr("连续 {n} 天", { n: streak }));
  showDialog(
    tr("阅读记录"),
    `<p class="stats-line">${today >= 60 ? tr("今天读了 {t}。", { t: fmtDuration(today) }) : tr("今天还没有翻开书。")}</p>${bits.length ? `<p class="stats-sub">${bits.join(tr("，"))}${tr("。")}</p>` : ""}
     <div class="week" role="img" aria-label="${tr("近 7 天每天的阅读时长")}">${days
       .map((x, i) => {
         const lv = x.sec >= 1800 ? 3 : x.sec >= 600 ? 2 : x.sec >= 60 ? 1 : 0;
         return `<div class="day l${lv}${i === 6 ? " today" : ""}" title="${fmtDuration(x.sec)}"><i></i>${i === 6 ? tr("今") : wk(x.d)}</div>`;
       })
       .join("")}</div>
     ${top.length ? `<div class="stats-books">${top.map((x) => `<div><span>${E(x.b.title)}</span><span>${fmtDuration(x.sec)}</span></div>`).join("")}</div>` : ""}
     <p class="panel-note">${tr("只统计书打开、屏幕亮着、并且几分钟内有翻页的时间。")}</p>`,
    [{ text: tr("好") }],
  );
}
