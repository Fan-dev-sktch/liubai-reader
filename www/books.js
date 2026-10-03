import { tr } from "./i18n.js";
export const escapeHTML = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const uid = () => crypto.randomUUID();
let database;
const DB_VERSION = 2;
const CONTENT_KEYS = ["bytes", "chapters", "nav", "images"];
// v2 keeps the shelf light: metadata in "books", heavy payloads in "contents".
// Pictures leave the chapter markup and are kept as Blobs: base64 inside HTML costs a
// third more space and sits in memory for the whole book while reading.
const IMG_RE = /src="data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)"/gi;
export function packImages(chapters, images = []) {
  const seen = new Map();
  for (const c of chapters || []) {
    if (!c.html || c.html.indexOf("data:image/") < 0) continue;
    c.html = c.html.replace(IMG_RE, (m, type, b64) => {
      let n = seen.get(b64);
      if (n == null) {
        try {
          const bin = atob(b64),
            u8 = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
          n = images.push(new Blob([u8], { type })) - 1;
          seen.set(b64, n);
        } catch {
          return m;
        }
      }
      return `src="liubai-img:${n}"`;
    });
  }
  return images;
}
// The original file is kept as a Blob too, so opening a book doesn't load it.
export const asBuffer = async (x) => (x instanceof Blob ? await x.arrayBuffer() : x);
export function packBook(book) {
  if (Array.isArray(book.chapters) && !book.images) {
    const images = packImages(book.chapters);
    if (images.length) book.images = images;
  }
  if (book.bytes && !(book.bytes instanceof Blob)) book.bytes = new Blob([book.bytes]);
  return book;
}
// Markup built during import lives in an inert document, so pictures aren't
// fetched and decoded while chapters are being cleaned.
let inertDoc = null;
const inert = () => (inertDoc ||= document.implementation.createHTMLDocument(""));
export function splitBook(book) {
  const meta = { ...book },
    content = { id: book.id };
  for (const k of CONTENT_KEYS) {
    if (k in meta) content[k] = meta[k];
    delete meta[k];
  }
  if (Array.isArray(book.chapters)) {
    meta.chapterCount = book.chapters.length;
    meta.chapterTitles = book.chapters.map((c) => String(c.title || "").slice(0, 120));
  }
  return { meta, content };
}
export async function db() {
  if (database) return database;
  database = await new Promise((resolve, reject) => {
    const r = indexedDB.open("liubai-reader", DB_VERSION);
    r.onupgradeneeded = (e) => {
      const d = r.result,
        tx = r.transaction;
      if (!d.objectStoreNames.contains("books"))
        d.createObjectStore("books", { keyPath: "id" });
      if (!d.objectStoreNames.contains("states"))
        d.createObjectStore("states", { keyPath: "id" });
      if (!d.objectStoreNames.contains("settings"))
        d.createObjectStore("settings");
      if (!d.objectStoreNames.contains("contents"))
        d.createObjectStore("contents", { keyPath: "id" });
      if (e.oldVersion >= 1 && e.oldVersion < 2) {
        const books = tx.objectStore("books"),
          contents = tx.objectStore("contents");
        books.openCursor().onsuccess = (ev) => {
          const c = ev.target.result;
          if (!c) return;
          const { meta, content } = splitBook(c.value);
          contents.put(content);
          c.update(meta);
          c.continue();
        };
      }
    };
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error(tr("请关闭其他打开留白的窗口后重试")));
  });
  return database;
}
export async function store(name, action, ...args) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(
      name,
      action === "get" || action === "getAll" || action === "getAllKeys"
        ? "readonly"
        : "readwrite",
    );
    const r = t.objectStore(name)[action](...args);
    let result;
    r.onsuccess = () => {
      result = r.result;
    };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error(tr("保存失败，设备空间可能不足")));
  });
}
export async function saveBook(book, state) {
  const d = await db(),
    { meta, content } = splitBook(packBook(book));
  return new Promise((resolve, reject) => {
    const t = d.transaction(["books", "states", "contents"], "readwrite");
    t.objectStore("books").put(meta);
    t.objectStore("contents").put(content);
    if (state) t.objectStore("states").put(state);
    t.oncomplete = () => resolve(meta);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error(tr("保存失败，设备空间可能不足")));
  });
}
export const loadContent = (id) => store("contents", "get", id);
export async function deleteBook(id) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(["books", "states", "contents"], "readwrite");
    t.objectStore("books").delete(id);
    t.objectStore("states").delete(id);
    t.objectStore("contents").delete(id);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
  });
}
// Downscale covers so the shelf never holds multi‑megabyte images in memory.
export async function thumbnail(source, max = 360) {
  try {
    let bmp;
    if (source instanceof Blob) bmp = await createImageBitmap(source);
    else {
      // data: URLs can't be fetched under the CSP; decode through <img> instead
      const img = new Image();
      img.src = source;
      await img.decode();
      bmp = img;
    }
    const scale = Math.min(1, max / bmp.width),
      w = Math.max(1, Math.round(bmp.width * scale)),
      h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    return c.toDataURL("image/jpeg", 0.82);
  } catch {
    return typeof source === "string" ? source : "";
  }
}
export const initialState = (id) => ({
  id,
  chapter: 0,
  ratio: 0,
  percent: 0,
  lastRead: 0,
  favorite: false,
  finished: false,
  notes: [],
  bookmarks: [],
  seconds: 0,
});
export async function hash(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function xml(text) {
  const d = new DOMParser().parseFromString(text, "application/xml");
  if (d.getElementsByTagName("parsererror").length)
    throw new Error(tr("EPUB 内的 XML 结构有误"));
  return d;
}
const els = (root, name) => [...root.getElementsByTagNameNS("*", name)];
function pathAt(base, ref) {
  let s = decodeURIComponent(ref.split("#")[0].split("?")[0]);
  if (/^[a-z]+:/i.test(s) || s.startsWith("//")) return "";
  const parts = (base.slice(0, base.lastIndexOf("/") + 1) + s).split("/");
  const out = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}
const mimeFor = (p) =>
  ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
  })[p.split(".").pop().toLowerCase()];
const permitted = new Set(
  "p div span section article h1 h2 h3 h4 h5 h6 blockquote pre code ul ol li dl dt dd br hr strong b em i u s sub sup small ruby rt rp table tbody thead tfoot tr th td caption figure figcaption a img".split(
    " ",
  ),
);
// Rebuild chapter markup from a strict allowlist. Book scripts, styles, forms and remote resources never enter the page.
// EPUB chapters are XHTML, where <a id="x"/> is an empty element. The HTML parser reads it as an
// open tag that swallows the rest of the chapter, so spell such tags out before parsing.
const VOID_TAGS = /^(area|base|br|col|embed|hr|img|image|input|link|meta|param|source|track|wbr)$/i;
const openSelfClosing = (src) =>
  src.replace(/<([a-zA-Z][\w:.-]*)(\s[^<>]*?)?\s*\/>/g, (m, tag, attrs = "") => (VOID_TAGS.test(tag) ? m : `<${tag}${attrs}></${tag}>`));
export async function cleanChapter(source, path, zip, manifest, opts = {}) {
  const doc = new DOMParser().parseFromString(openSelfClosing(source), "text/html");
  const jobs = [];
  const root = inert().createElement("div");
  const fmt = bookFormatting(doc, opts.css || "");
  function visit(node, parent) {
    if (node.nodeType === 3) {
      parent.append(inert().createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== 1) return;
    let tag = node.localName?.toLowerCase();
    if (
      [
        "script",
        "style",
        "iframe",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "video",
        "audio",
        "link",
        "meta",
        "noscript",
      ].includes(tag)
    )
      return;
    if (tag === "image") {
      tag = "img";
    }
    if (tag === "aside" || tag === "section" || tag === "article") tag = "div";
    if (!permitted.has(tag)) {
      for (const c of node.childNodes) visit(c, parent);
      return;
    }
    const e = inert().createElement(tag);
    if (node.id) e.dataset.anchor = node.id;
    const f = fmt(node);
    if (f) for (const k in f) e.dataset[k] = f[k];
    for (const a of ["colspan", "rowspan"]) {
      if (node.hasAttribute(a) && /^\d{1,2}$/.test(node.getAttribute(a)))
        e.setAttribute(a, node.getAttribute(a));
    }
    if (tag === "a") {
      const href = node.getAttribute("href") || "";
      if (href.startsWith("#")) e.dataset.target = path + href;
      else if (!/^[a-z]+:/i.test(href) && !href.startsWith("//"))
        e.dataset.target =
          pathAt(path, href) +
          (href.includes("#") ? "#" + href.split("#")[1] : "");
      else if (/^https?:/i.test(href)) {
        e.href = href;
        e.target = "_blank";
        e.rel = "noopener noreferrer";
      }
      if (e.dataset.target) e.href = "#";
    }
    if (tag === "img") {
      const src =
        node.getAttribute("src") ||
        node.getAttribute("xlink:href") ||
        node.getAttribute("href") ||
        "";
      const p = pathAt(path, src),
        f = zip?.file(p),
        mime = mimeFor(p);
      e.alt = node.getAttribute("alt") || tr("书中插图");
      if (!f && /^data:image\/(png|jpe?g|gif|webp|avif|bmp);base64,/i.test(src))
        e.src = src;
      else if (!f && opts.resolveImage)
        jobs.push(
          opts.resolveImage(src).then((url) => {
            if (url) e.src = url;
          }).catch(() => {}),
        );
      if (f && mime && opts.images) {
        // shared registry: each picture stored once as a Blob, referenced by marker
        const known = opts.images.seen.get(p);
        if (known) e.src = known;
        else {
          const token = `liubai-img:${opts.images.list.length}`;
          opts.images.list.push(null);
          opts.images.seen.set(p, token);
          e.src = token;
          const n = opts.images.list.length - 1;
          jobs.push(f.async("uint8array").then((u8) => (opts.images.list[n] = new Blob([u8], { type: mime }))));
        }
      } else if (f && mime)
        jobs.push(
          f.async("base64").then((data) => {
            e.src = `data:${mime};base64,${data}`;
          }),
        );
    }
    parent.append(e);
    for (const c of node.childNodes) visit(c, e);
  }
  for (const n of doc.body.childNodes) visit(n, root);
  await Promise.all(jobs);
  return {
    html: root.innerHTML,
    text: root.textContent,
    title: root.querySelector("h1,h2,h3")?.textContent?.trim(),
  };
}
// Table of contents with nesting depth, from EPUB3 nav or EPUB2 NCX.
async function readNav(zip, items) {
  const nav = [];
  const navItem = items.find((i) => i.props.split(/\s+/).includes("nav"));
  if (navItem && zip.file(navItem.path)) {
    const d = new DOMParser().parseFromString(
      await zip.file(navItem.path).async("string"),
      "text/html",
    );
    const n =
      [...d.querySelectorAll("nav")].find((n) =>
        (n.getAttribute("epub:type") || "").includes("toc"),
      ) || d.querySelector("nav");
    for (const a of n?.querySelectorAll("a") || []) {
      const href = a.getAttribute("href") || "";
      let depth = 0;
      for (let p = a.parentElement; p && p !== n; p = p.parentElement)
        if (p.localName === "ol" || p.localName === "ul") depth++;
      nav.push({
        title: a.textContent.replace(/\s+/g, " ").trim(),
        path: pathAt(navItem.path, href),
        anchor: href.split("#")[1] || "",
        depth: Math.max(0, Math.min(4, depth - 1)),
      });
    }
  }
  if (!nav.length) {
    const ncx = items.find((i) => i.type === "application/x-dtbncx+xml");
    if (ncx && zip.file(ncx.path)) {
      const d = xml(await zip.file(ncx.path).async("string"));
      for (const p of els(d, "navPoint")) {
        const src = els(p, "content")[0]?.getAttribute("src") || "";
        let depth = 0;
        for (let q = p.parentNode; q && q.localName === "navPoint"; q = q.parentNode)
          depth++;
        nav.push({
          title: (els(p, "text")[0]?.textContent || "").trim(),
          path: pathAt(ncx.path, src),
          anchor: src.split("#")[1] || "",
          depth: Math.min(4, depth),
        });
      }
    }
  }
  return nav;
}
// Re-read the TOC of an already imported EPUB (books from older versions lack depth).
export async function epubNav(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file("META-INF/container.xml");
  if (!container) return [];
  const opfPath = els(xml(await container.async("string")), "rootfile")[0]?.getAttribute("full-path");
  const opfFile = zip.file(opfPath || "");
  if (!opfFile) return [];
  const opf = xml(await opfFile.async("string"));
  const items = els(opf, "item").map((e) => ({
    id: e.getAttribute("id"),
    path: pathAt(opfPath, e.getAttribute("href") || ""),
    type: e.getAttribute("media-type"),
    props: e.getAttribute("properties") || "",
  }));
  return readNav(zip, items);
}
// Many books ship a flat TOC; recover the visible hierarchy from the titles themselves.
const PART = /^(第\s*[零〇一二两三四五六七八九十百千\d]+\s*[部卷编篇集]|卷[零〇一二三四五六七八九十百千\d]+|上[卷部篇编]|中[卷部篇编]|下[卷部篇编]|(part|book|volume)\s+[\divxlc]+\b)/i;
const CHAPTER = /^(第\s*[零〇一二两三四五六七八九十百千\d]+\s*[章回]|chapter\s+[\divxlc]+\b)/i;
const SECTION = /^(第\s*[零〇一二两三四五六七八九十百千\d]+\s*节|[一二三四五六七八九十]+、|\d+\.\d+)/;
export function inferDepth(nav) {
  if (!nav.length || nav.some((n) => n.depth > 0)) return nav;
  const BACK = /^(序|序言|前言|引言|导言|导论|楔子|后记|结语|结束语|尾声|附录|参考文献|参考书目|致谢|索引|注释|译后记|跋|总目录|目录|版权)/;
  const kind = (t) => (BACK.test(t) ? 9 : PART.test(t) ? 0 : CHAPTER.test(t) ? 1 : SECTION.test(t) ? 2 : -1);
  const kinds = nav.map((n) => kind(String(n.title || "").trim()));
  const hasPart = kinds.includes(0),
    hasChap = kinds.includes(1),
    hasSec = kinds.includes(2);
  if (!hasPart && !(hasChap && hasSec)) return nav;
  let inPart = false,
    inChap = false;
  return nav.map((n, i) => {
    const k = kinds[i];
    let depth = 0;
    if (k === 9) {
      inPart = false;
      inChap = false;
    } else if (k === 0) {
      inPart = true;
      inChap = false;
    } else if (k === 1) {
      depth = hasPart && inPart ? 1 : 0;
      inChap = true;
    } else if (k === 2) depth = (hasPart && inPart ? 1 : 0) + (hasChap && inChap ? 1 : 0);
    else if (hasPart && inPart) depth = 1 + (hasChap && inChap ? 1 : 0);
    return { ...n, depth: Math.min(depth, 3) };
  });
}
export async function parseEpub(bytes, filename, onProgress = () => {}) {
  const zip = await JSZip.loadAsync(bytes);
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error(tr("不是有效的 EPUB：缺少 container.xml"));
  if (zip.file("META-INF/encryption.xml")) {
    const enc = xml(await zip.file("META-INF/encryption.xml").async("string"));
    const methods = els(enc, "EncryptionMethod");
    if (
      methods.some(
        (m) =>
          ![
            "http://www.idpf.org/2008/embedding",
            "http://ns.adobe.com/pdf/enc#RC",
          ].includes(m.getAttribute("Algorithm")),
      )
    )
      throw new Error(tr("这本 EPUB 有 DRM 加密，无法导入"));
  }
  const opfPath = els(
    xml(await container.async("string")),
    "rootfile",
  )[0]?.getAttribute("full-path");
  const opfFile = zip.file(opfPath || "");
  if (!opfFile) throw new Error(tr("EPUB 缺少书籍清单"));
  const opf = xml(await opfFile.async("string"));
  const items = els(opf, "item").map((e) => ({
    id: e.getAttribute("id"),
    path: pathAt(opfPath, e.getAttribute("href") || ""),
    type: e.getAttribute("media-type"),
    props: e.getAttribute("properties") || "",
  }));
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const spine = els(opf, "itemref")
    .filter((e) => e.getAttribute("linear") !== "no")
    .map((e) => byId[e.getAttribute("idref")])
    .filter(Boolean);
  if (!spine.length) throw new Error(tr("EPUB 没有可阅读的章节"));
  const nav = await readNav(zip, items);
  const chapters = [];
  let total = 0;
  const pics = { list: [], seen: new Map() };
  for (let i = 0; i < spine.length; i++) {
    onProgress(tr("正在整理章节 {n} / {total}", { n: i + 1, total: spine.length }));
    const item = spine[i],
      f = zip.file(item.path);
    if (!f) throw new Error(tr("EPUB 缺少章节：{path}", { path: item.path }));
    const str = await f.async("string");
    total += str.length;
    if (total > 80000000) throw new Error(tr("解压后的正文过大，请拆分书籍后导入"));
    const c = await cleanChapter(str, item.path, zip, items, { css: await chapterCss(str, item.path, zip), images: pics });
    chapters.push({
      path: item.path,
      title:
        nav.find((n) => n.path === item.path)?.title ||
        c.title ||
        tr("第 {n} 节", { n: i + 1 }),
      html: c.html,
      text: c.text,
    });
  }
  let cover = "";
  const coverId = els(opf, "meta")
    .find((m) => m.getAttribute("name") === "cover")
    ?.getAttribute("content");
  const ci =
    items.find((i) => i.props.split(/\s+/).includes("cover-image")) ||
    byId[coverId] ||
    items.find(
      (i) => /cover/i.test(i.id + " " + i.path) && mimeFor(i.path),
    ) ||
    items.find((i) => mimeFor(i.path) && zip.file(i.path));
  if (ci && mimeFor(ci.path) && zip.file(ci.path)) {
    onProgress(tr("正在生成封面"));
    const blob = new Blob([await zip.file(ci.path).async("uint8array")], {
      type: mimeFor(ci.path),
    });
    cover = await thumbnail(blob);
  }
  const navMapped = nav
    .map((n) => ({ ...n, chapter: chapters.findIndex((c) => c.path === n.path) }))
    .filter((n) => n.chapter >= 0);
  const split = splitLarge(chapters, navMapped);
  return {
    title:
      els(opf, "title")[0]?.textContent?.trim() ||
      filename.replace(/\.epub$/i, ""),
    author:
      els(opf, "creator")
        .map((e) => e.textContent.trim())
        .join(" / ") || "未知作者",
    lang: (els(opf, "language")[0]?.textContent || "").trim().slice(0, 35),
    chapters: split.chapters,
    nav: split.nav,
    cover,
    ...(pics.list.length ? { images: pics.list.map((b) => b || new Blob([])) } : {}),
  };
}
const COMMON =
  "的一是了不在人有我他这个们中来上大为和国地到以说时要就出会可也你对生能而子那得于着下自之年过发后作里用道行所然家种事成方多经么去法学如都同现当没动面起看定天分还进好小部其些主样理心她本前开但因只从想实日者意无力它与长把机十民第公此已工使情明性知全三又关点正业外将两高间由问很最重并物手应向头文体相见被利什二等产或新己制身果加月话合回特代内信表化老给世位次度门任常先海通教儿原东声提立及比员解水名真论处走义各入几口认条平系气题活更别打女变四神总何电数安少报才结反受目太量再感建务做接必场件计管期市直资命山金指许统区保至队形社便空决治展马科司五基眼书非则听白却界达光放强即像难且权思王象完设式色路记南品住告类求据程北边死张该交规万取拉格望觉术领共确传师观清今切院让识候带导争运笑飞风步改收根干造言联持组每济车亲极林服快办议往元英士证近失转夫令准布始怎呢存未远叫台单影具罗字爱击流备兵连调深商算质团集百需价花党华城石级整府离况亚请技际约示复病息究线似官火断精满支视消越器容照须九增研写称企八功吗包片史委乎查轻易早曾除农找装广显吧阿李标谈吃图念六引历首医局突专费号";
function cjkScore(t) {
  const sample = t.slice(0, 60000);
  let good = 0,
    bad = 0;
  for (const ch of sample) {
    if (ch === "�") bad += 4;
    else if (COMMON.includes(ch)) good++;
  }
  return good - bad;
}
// Pick the most plausible encoding: BOMs first, strict UTF‑8, then GB18030 vs Big5 by common‑character score.
export function decodeText(bytes) {
  const u8 = new Uint8Array(bytes);
  if (u8[0] === 0xff && u8[1] === 0xfe) return new TextDecoder("utf-16le").decode(u8);
  if (u8[0] === 0xfe && u8[1] === 0xff) return new TextDecoder("utf-16be").decode(u8);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {}
  const options = ["gb18030", "big5", "utf-8"]
    .map((enc) => {
      try {
        const text = new TextDecoder(enc).decode(u8);
        return { text, score: cjkScore(text) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);
  return options[0].text;
}
export const TXT_HEADING =
  /^(第\s*[零〇一二两三四五六七八九十百千万\d]+\s*[章节卷回部篇集幕].{0,40}|卷\s*[零〇一二三四五六七八九十百千\d]+.{0,30}|(chapter|part)\s+[\divxlc]+\b.{0,50}|序言|序章|序|前言|楔子|引子|引言|后记|尾声|终章|番外.{0,30}|内容简介|简介)$/i;
// A heading is short and is not a sentence: "第四回中既將…已表明，此回則…．" is body text.
export const looksLikeHeading = (t, re = TXT_HEADING) =>
  t.length <= 50 && re.test(t) && !/[。．！？；…]/.test(t.slice(2)) && (t.match(/[，,]/g) || []).length < 2;
export function parseTxt(bytes, filename, { markdown = false, heading = null, chunk = 30000 } = {}) {
  let text = decodeText(bytes);
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const title = filename.replace(/\.(txt|md|markdown)$/i, "");
  const chapters = [];
  let current = { title, lines: [] };
  let chunkLength = 0,
    part = 1;
  function flush() {
    if (!current.lines.length) return;
    const pars = current.lines.map((s) => `<p>${escapeHTML(s)}</p>`).join("");
    chapters.push({
      title: current.title,
      path: `txt-${chapters.length}`,
      html: `<h1>${escapeHTML(current.title)}</h1>${pars}`,
      text: current.title + "\n" + current.lines.join("\n"),
    });
  }
  for (const raw of lines) {
    const l = raw.replace(/^[\s　 ]+|[\s　 ]+$/g, "");
    if (!l) continue;
    const md = markdown && /^#{1,3}\s+\S/.test(l);
    if (md || looksLikeHeading(l, heading || TXT_HEADING)) {
      flush();
      current = { title: md ? l.replace(/^#+\s+/, "") : l, lines: [] };
      chunkLength = 0;
    } else {
      current.lines.push(markdown ? l.replace(/^#{4,6}\s+|[*_`]{1,3}/g, "") : l);
      chunkLength += l.length;
      if (chunkLength > chunk) {
        flush();
        current = { title: `${title} · ${++part}`, lines: [] };
        chunkLength = 0;
      }
    }
  }
  flush();
  if (!chapters.length) throw new Error(tr("文件没有正文"));
  return {
    title,
    author: "本地文本",
    chapters,
    nav: chapters.map((c, i) => ({ title: c.title, chapter: i, depth: 0 })),
    cover: "",
    txtVersion: 2,
  };
}
export async function parseHtml(bytes, filename) {
  const source = decodeText(bytes);
  const c = await cleanChapter(source, "index.html", null, []);
  const docTitle =
    new DOMParser().parseFromString(source, "text/html").title?.trim() || "";
  const title = docTitle || filename.replace(/\.x?html?$/i, "");
  // split very long pages on h1/h2 boundaries for faster paging
  const holder = inert().createElement("div");
  holder.innerHTML = c.html;
  const chapters = [];
  let cur = inert().createElement("div"),
    curTitle = title;
  const push = () => {
    if (!cur.textContent.trim() && !cur.querySelector("img")) return;
    chapters.push({
      path: `html-${chapters.length}`,
      title: curTitle,
      html: cur.innerHTML,
      text: cur.textContent,
    });
  };
  for (const node of [...holder.childNodes]) {
    if (node.nodeType === 1 && /^h[12]$/i.test(node.localName) && cur.textContent.length > 2000) {
      push();
      cur = inert().createElement("div");
      curTitle = node.textContent.trim() || title;
    }
    cur.append(node);
  }
  push();
  if (!chapters.length) throw new Error(tr("网页没有正文"));
  return {
    title,
    author: "本地网页",
    chapters,
    nav: chapters.map((c, i) => ({ title: c.title, chapter: i, depth: 0 })),
    cover: "",
  };
}
export function demoBook() {
  const sections = [
    [
      "欢迎来到留白",
      "给阅读留一点空间",
      "有时候，我们缺少的不是一本好书，而是一小段不被打扰的时间。",
      "留白是一个安静的本地阅读器。没有信息流，没有广告，也没有需要解锁的会员功能。你可以把自己的 EPUB、TXT 和 PDF 放进来，在手机、平板和电脑上打开。",
      "这本小册子是内置的功能示例。试着选择这段文字，给它划线，再写下一点想法。读到哪里，进度就会留在哪里。",
      "一本书，一段自己的时间。",
    ],
    [
      "从一本书开始",
      "让自己的书架慢慢长出来",
      "回到书架，点击“导入书籍”，或者把文件拖到窗口里。你可以一次选择多本书。书籍在浏览器本地解析和保存，不会上传给别人。",
      "EPUB 会按章节阅读，保留常见的标题、段落、插图与表格。TXT 支持常见中文编码，并根据“第几章”这样的标题整理目录。PDF 保持原来的页面版式。",
      "每一本书都有自己的阅读进度、收藏状态、书签和笔记。书架上的更多菜单可以重命名、标记读完，也可以导出原文件。",
      "书架没有数量收费限制，实际容量取决于设备和浏览器可用空间。",
    ],
    [
      "找到舒服的节奏",
      "把排版调成你喜欢的样子",
      "在阅读页右上角打开排版设置，选择字体、字号、行距和正文宽度。暖白、纸张、护眼绿和深色四种配色，对应不同的光线与心情。",
      "正文可以连续滚动，也可以用底部的按钮逐屏阅读。在电脑上，左右方向键可以翻屏；Esc 可以关闭面板或离开专注模式。",
      "需要重新找一句话时，用全文搜索。想记住某个位置，就加一枚书签。划线和笔记保存在本地，你也可以把它们导出为 Markdown 文件。",
      "慢一点，并不会错过什么。",
    ],
    [
      "把书和想法带走",
      "本地保存，也记得备份",
      "每个浏览器都有独立的书架。在另一台设备上登录同一个账号，不会自动带走本地书籍。你可以在“备份与迁移”中导出整个书库，再到另一台设备上导入。",
      "备份包括原书文件、阅读进度、书签、笔记和排版偏好。恢复时保留已有书籍，遇到相同书籍会合并笔记并采用较新的阅读进度。",
      "清理网站数据、使用无痕模式或更换浏览器，可能让本地书架消失。请定期把备份留到自己的文件夹中。",
      "当页面已缓存后，可以离线打开阅读。添加到主屏幕的方式由浏览器决定；如果当前浏览器不提供安装入口，仍可直接使用网页。",
      "愿下一页，值得你停留。",
    ],
  ];
  const chapters = sections.map((s, i) => ({
    path: `demo-${i}`,
    title: s[0],
    html: `<h1>${s[1]}</h1>${s
      .slice(2)
      .map((t, j) =>
        j === s.length - 3 ? `<blockquote>${t}</blockquote>` : `<p>${t}</p>`,
      )
      .join("")}`,
    text: s.slice(1).join("\n"),
  }));
  return {
    id: "liubai-welcome-v1",
    title: "把时间留给阅读",
    author: "留白 · 使用小册",
    type: "demo",
    added: Date.now(),
    cover: "",
    chapters,
    nav: chapters.map((c, i) => ({ title: c.title, chapter: i })),
    filename: "留白使用小册.txt",
  };
}

// Very long chapters (whole-book files, Kindle sections) are split at headings
// so paging stays fast and the TOC becomes useful.
export function splitLarge(chapters, nav, limit = 24000) {
  if (!chapters.some((c) => (c.text || "").length > limit)) return { chapters, nav };
  const out = [],
    remap = new Map();
  chapters.forEach((c, ci) => {
    if ((c.text || "").length <= limit) {
      remap.set(ci, out.length);
      out.push(c);
      return;
    }
    const holder = inert().createElement("div");
    holder.innerHTML = c.html;
    // flatten wrapper blocks that contain headings, so headings become split points
    const nodes = [];
    const push = (n) => {
      if (n.nodeType === 1 && /^(div|section|article|blockquote)$/i.test(n.localName) && n.querySelector("h1,h2,h3"))
        [...n.childNodes].forEach(push);
      else nodes.push(n);
    };
    [...holder.childNodes].forEach(push);
    // hard-wrapped plain text (common in TXT→Kindle conversions): rebuild paragraphs and headings
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.nodeType === 1 && n.textContent.length > 4000 && (n.textContent.match(/\n/g) || []).length > 40 && !n.querySelector("p,h1,h2,h3")) {
        nodes.splice(i, 1, ...reflowLines(n.textContent));
        i--;
      }
    }
    let part = inert().createElement("div"),
      size = 0,
      title = c.title,
      k = 0;
    const flush = () => {
      if (!part.textContent.trim() && !part.querySelector("img")) return;
      out.push({ path: k ? `${c.path}::${k}` : c.path, title, html: part.innerHTML, text: part.textContent });
      k++;
    };
    remap.set(ci, out.length);
    for (const n of nodes) {
      const isHead =
        n.nodeType === 1 &&
        (/^h[1-3]$/i.test(n.localName) || (n.localName === "p" && looksLikeHeading(n.textContent.trim())));
      const len = n.textContent.length;
      if ((isHead && size > 1500) || size + len > limit * 1.5) {
        flush();
        part = inert().createElement("div");
        size = 0;
        title = isHead ? n.textContent.replace(/\s+/g, " ").trim() || c.title : `${c.title} · ${k + 1}`;
      } else if (isHead && size < 200) title = n.textContent.replace(/\s+/g, " ").trim() || title;
      part.append(n);
      size += len;
    }
    flush();
  });
  const sparse = nav.length < out.length / 2;
  const newNav = sparse
    ? inferDepth(out.map((c, i) => ({ title: c.title, chapter: i, depth: 0, path: c.path })))
    : nav.map((n) => {
        let chapter = remap.get(n.chapter) ?? n.chapter;
        if (n.anchor) {
          const end = remap.get(n.chapter + 1) ?? out.length;
          for (let i = chapter; i < end; i++)
            if (out[i].html.includes(`data-anchor="${n.anchor}"`)) {
              chapter = i;
              break;
            }
        }
        return { ...n, chapter };
      });
  return { chapters: out, nav: newNav };
}

function reflowLines(text) {
  const lines = text.split(/\r?\n/);
  const lens = lines.map((l) => l.trim().length).filter((n) => n > 8).sort((a, b) => a - b);
  const typical = lens[Math.floor(lens.length * 0.7)] || 40;
  const out = [];
  let buf = "";
  const emit = (tag, t) => {
    const el = inert().createElement(tag);
    el.textContent = t;
    out.push(el);
  };
  const flush = () => {
    if (buf.trim()) emit("p", buf.trim());
    buf = "";
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i],
      t = raw.trim();
    if (!t || /^[-—_=*·]{6,}$/.test(t)) {
      flush();
      continue;
    }
    if (looksLikeHeading(t)) {
      flush();
      emit("h2", t);
      continue;
    }
    if (/^[\s\u3000]{2,}/.test(raw)) flush();
    buf += t;
    if (/[。！？…”」』.!?：:]$/.test(t) && t.length < typical * 0.9) flush();
  }
  flush();
  return out;
}

// ── Keep the meaning of the publisher's formatting (centred lines, bold, italics,
// small print, unindented paragraphs) without importing the book's stylesheet. ──
const cssCache = new WeakMap();
async function chapterCss(source, path, zip) {
  let cache = cssCache.get(zip);
  if (!cache) cssCache.set(zip, (cache = new Map()));
  let css = "";
  for (const m of source.matchAll(/<link[^>]+>/gi)) {
    if (!/stylesheet/i.test(m[0])) continue;
    const href = /href=["']([^"']+)["']/i.exec(m[0])?.[1];
    if (!href) continue;
    const p = pathAt(path, href);
    if (!cache.has(p)) cache.set(p, zip.file(p) ? (await zip.file(p).async("string")).slice(0, 400000) : "");
    css += cache.get(p) + "\n";
  }
  for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1] + "\n";
  return css;
}
function readDecls(text, out = {}) {
  for (const d of text.split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const k = d.slice(0, i).trim().toLowerCase(),
      v = d.slice(i + 1).replace(/!important/i, "").trim().toLowerCase();
    if (k === "text-align") {
      if (/center/.test(v)) out.a = "c";
      else if (/right|end/.test(v)) out.a = "r";
      else if (/left|start|justify/.test(v)) delete out.a;
    } else if (k === "font-weight") {
      if (/bold|[6-9]00/.test(v)) out.b = "1";
      else if (/normal|[1-4]00/.test(v)) delete out.b;
    } else if (k === "font-style") {
      if (/italic|oblique/.test(v)) out.i = "1";
      else if (/normal/.test(v)) delete out.i;
    } else if (k === "text-indent") {
      if (/^(0|-)/.test(v)) out.ni = "1";
      else if (/^[1-9.]/.test(v)) delete out.ni;
    } else if (k === "font-size") {
      const n = parseFloat(v);
      if (/smaller|x-small|xx-small|^small/.test(v) || (/(em|rem)$/.test(v) && n < 0.9) || (/%$/.test(v) && n < 90)) out.s = "s";
      else if (/larger|large/.test(v) || (/(em|rem)$/.test(v) && n >= 1.2) || (/%$/.test(v) && n >= 120)) out.s = "l";
    }
  }
  return out;
}
const FMT_PROPS = /text-align|font-weight|font-style|text-indent|font-size/i;
function bookFormatting(doc, css) {
  const stamped = new Map();
  if (css) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@(media|supports|font-face|page|keyframes)[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/gi, "");
    for (const m of clean.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
      if (!FMT_PROPS.test(m[2])) continue;
      for (let sel of m[1].split(",")) {
        sel = sel.trim();
        if (!sel || /::?(hover|before|after|first|last|nth|not|focus|active|link|visited)/i.test(sel) || sel.length > 120) continue;
        let els;
        try {
          els = doc.querySelectorAll(sel);
        } catch {
          continue;
        }
        if (!els.length || els.length > 20000) continue;
        for (const el of els) readDecls(m[2], stamped.get(el) || stamped.set(el, {}).get(el));
      }
    }
  }
  return (node) => {
    let f = stamped.get(node);
    const inline = node.getAttribute?.("style");
    if (inline && FMT_PROPS.test(inline)) f = readDecls(inline, { ...(f || {}) });
    const align = node.getAttribute?.("align");
    if (align && /center|right/i.test(align)) f = { ...(f || {}), a: /center/i.test(align) ? "c" : "r" };
    if (!f) return null;
    const keys = Object.keys(f);
    return keys.length ? f : null;
  };
}
