// Extra book formats: MOBI / AZW3 (via foliate-js), FB2, CBZ comics.
import { tr } from "./i18n.js";
import { escapeHTML, cleanChapter, thumbnail, decodeText, inferDepth, splitLarge } from "./books.js";

async function unzlib(data) {
  if (typeof DecompressionStream === "undefined") return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const IMG_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" };
// Turn a MOBI resource into a stored picture; returns the marker the reader resolves.
async function blobImage(src, images, seen) {
  if (!/^blob:/i.test(src)) return "";
  if (seen.has(src)) return seen.get(src);
  const token = await blobType(await (await fetch(src)).blob()).then((b) => (b ? `liubai-img:${images.push(b) - 1}` : ""));
  seen.set(src, token);
  return token;
}
async function blobType(blob) {
  if (!/^image\/(png|jpe?g|gif|webp|bmp)/.test(blob.type)) {
    // sniff the bytes: MOBI resources carry no type
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    const type =
      head[0] === 0xff && head[1] === 0xd8 ? "image/jpeg"
      : head[0] === 0x89 && head[1] === 0x50 ? "image/png"
      : head[0] === 0x47 && head[1] === 0x49 ? "image/gif"
      : head[8] === 0x57 && head[9] === 0x45 ? "image/webp"
      : "";
    if (!type) return null;
    return new Blob([blob], { type });
  }
  return blob;
}

// The MOBI reader asks for thousands of small records. Serving them straight from
// memory is much cheaper than Blob.slice().arrayBuffer() round trips.
function memoryFile(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const slice = (start = 0, end = u8.length) => ({
    arrayBuffer: () => Promise.resolve(u8.slice(Math.max(0, start), Math.min(u8.length, end)).buffer),
  });
  return { size: u8.length, slice };
}
export async function parseMobi(bytes, filename, onProgress = () => {}) {
  const { MOBI } = await import("./vendor/mobi.js");
  onProgress(tr("正在读取 Kindle 格式"));
  let book;
  try {
    book = await new MOBI({ unzlib }).open(memoryFile(bytes));
  } catch (e) {
    throw new Error(/DRM|encrypt/i.test(String(e)) ? tr("这本书有 DRM 加密，无法导入") : tr("无法识别这个 MOBI/AZW3 文件"));
  }
  if (book.mobi?.headers?.palmdoc?.encryption) throw new Error(tr("这本书有 DRM 加密，无法导入"));
  const sections = book.sections.filter((s) => s.load && s.linear !== "no");
  if (!sections.length) throw new Error(tr("这本书没有可阅读的内容"));
  // which section does each TOC entry point to
  const nav = [];
  const walk = (items, depth) => {
    for (const it of items || []) {
      let index = -1;
      try {
        index = book.splitTOCHref(it.href)?.[0];
      } catch {}
      nav.push({ title: String(it.label || "").trim(), section: index, depth: Math.min(depth, 3) });
      walk(it.subitems, depth + 1);
    }
  };
  walk(book.toc, 0);
  const chapters = [],
    images = [],
    seen = new Map();
  const sectionToChapter = new Map();
  for (let i = 0; i < sections.length; i++) {
    onProgress(tr("正在整理章节 {n} / {total}", { n: i + 1, total: sections.length }));
    const source = sections[i].html ? await sections[i].html() : await (await fetch(await sections[i].load())).text();
    let css = "";
    for (const m of source.matchAll(/<link[^>]+href=["'](blob:[^"']+)["'][^>]*>/gi))
      if (/stylesheet|text\/css/i.test(m[0])) css += (await (await fetch(m[1])).text().catch(() => "")) + "\n";
    for (const m of source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) css += m[1] + "\n";
    const c = await cleanChapter(source, `mobi-${i}`, null, [], { resolveImage: (src) => blobImage(src, images, seen), css });
    if (!c.text.trim() && !/<img/i.test(c.html)) continue;
    sectionToChapter.set(book.sections.indexOf(sections[i]), chapters.length);
    chapters.push({ path: `mobi-${i}`, title: c.title || tr("第 {n} 节", { n: chapters.length + 1 }), untitled: !c.title, html: c.html, text: c.text });
  }
  book.destroy?.();
  if (!chapters.length) throw new Error(tr("这本书没有可阅读的内容"));
  const mapped = nav
    .map((n) => ({ title: n.title, chapter: sectionToChapter.get(n.section) ?? -1, depth: n.depth, anchor: "" }))
    .filter((n) => n.chapter >= 0 && n.title);
  for (const n of mapped) if (chapters[n.chapter].untitled) chapters[n.chapter].title = n.title;
  for (const c of chapters) delete c.untitled;
  let cover = "";
  try {
    const blob = await book.getCover?.();
    if (blob) cover = await thumbnail(new Blob([blob], { type: "image/jpeg" }));
  } catch {}
  const meta = book.metadata || {};
  const split = splitLarge(chapters, mapped);
  return {
    title: String(meta.title || "").trim() || filename.replace(/\.(mobi|azw3?|prc)$/i, ""),
    author: [].concat(meta.author || []).filter(Boolean).join(" / ") || "未知作者",
    lang: String([].concat(meta.language || [])[0] || "").trim().slice(0, 35),
    chapters: split.chapters,
    nav: split.nav.length ? split.nav : split.chapters.map((c, i) => ({ title: c.title, chapter: i, depth: 0 })),
    cover,
    ...(images.length ? { images } : {}),
  };
}

// ── FB2 ──
export async function parseFb2(bytes, filename) {
  let u8 = new Uint8Array(bytes);
  if (u8[0] === 0x50 && u8[1] === 0x4b) {
    const zip = await JSZip.loadAsync(bytes);
    const f = Object.values(zip.files).find((x) => /\.fb2$/i.test(x.name));
    if (!f) throw new Error(tr("压缩包里没有 FB2 文件"));
    u8 = await f.async("uint8array");
  }
  let text = decodeText(u8);
  const enc = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(text.slice(0, 200))?.[1];
  if (enc && !/utf-?8/i.test(enc)) {
    try {
      text = new TextDecoder(enc).decode(u8);
    } catch {}
  }
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error(tr("FB2 文件结构有误"));
  const q = (root, name) => [...root.getElementsByTagNameNS("*", name)];
  const first = (root, name) => q(root, name)[0];
  const href = (el) => el.getAttribute("l:href") || el.getAttributeNS("http://www.w3.org/1999/xlink", "href") || el.getAttribute("xlink:href") || el.getAttribute("href") || "";
  const binaries = new Map(q(doc, "binary").map((b) => [b.getAttribute("id"), `data:${b.getAttribute("content-type") || "image/jpeg"};base64,${b.textContent.replace(/\s+/g, "")}`]));
  const info = first(doc, "title-info") || doc;
  const title = first(info, "book-title")?.textContent.trim() || filename.replace(/\.fb2(\.zip)?$/i, "");
  const author = q(info, "author")
    .map((a) => ["first-name", "middle-name", "last-name"].map((k) => first(a, k)?.textContent.trim()).filter(Boolean).join(" ") || first(a, "nickname")?.textContent.trim())
    .filter(Boolean)
    .join(" / ") || "未知作者";
  const coverImg = first(first(info, "coverpage") || doc.createElement("x"), "image");
  const coverData = coverImg ? binaries.get(href(coverImg).replace(/^#/, "")) : "";
  const bodies = q(doc, "body");
  const main = bodies.find((b) => !b.getAttribute("name")) || bodies[0];
  const notes = bodies.filter((b) => b !== main);
  const render = (node, depth) => {
    let out = "";
    for (const el of node.childNodes) {
      if (el.nodeType === 3) {
        out += escapeHTML(el.textContent);
        continue;
      }
      if (el.nodeType !== 1) continue;
      const name = el.localName,
        id = el.getAttribute("id") ? ` id="${escapeHTML(el.getAttribute("id"))}"` : "";
      const inner = () => render(el, depth);
      if (name === "p") out += `<p${id}>${inner()}</p>`;
      else if (name === "title") out += `<h${Math.min(3, depth + 1)}${id}>${q(el, "p").map((p) => render(p, depth)).join(" ") || inner()}</h${Math.min(3, depth + 1)}>`;
      else if (name === "subtitle") out += `<h4${id}>${inner()}</h4>`;
      else if (name === "epigraph" || name === "cite" || name === "annotation") out += `<blockquote${id}>${inner()}</blockquote>`;
      else if (name === "poem" || name === "stanza") out += `<div${id}>${inner()}</div>`;
      else if (name === "v") out += `<p${id}>${inner()}</p>`;
      else if (name === "text-author") out += `<p${id}><em>${inner()}</em></p>`;
      else if (name === "empty-line") out += "<br>";
      else if (name === "emphasis") out += `<em>${inner()}</em>`;
      else if (name === "strong") out += `<strong>${inner()}</strong>`;
      else if (name === "strikethrough") out += `<s>${inner()}</s>`;
      else if (name === "sub" || name === "sup" || name === "code") out += `<${name}>${inner()}</${name}>`;
      else if (name === "a") out += `<a href="${escapeHTML(href(el))}">${inner()}</a>`;
      else if (name === "image") {
        const src = binaries.get(href(el).replace(/^#/, ""));
        if (src) out += `<img src="${src}" alt="">`;
      } else if (name === "section") out += `<div${id}>${render(el, depth + 1)}</div>`;
      else if (name === "table") out += `<table>${inner()}</table>`;
      else if (name === "tr" || name === "td" || name === "th") out += `<${name}>${inner()}</${name}>`;
      else out += inner();
    }
    return out;
  };
  const chapters = [],
    nav = [];
  const notesPath = "fb2-notes";
  const fix = (html) => html.replace(/href="#([^"]+)"/g, (m, id) => `href="${noteIds.has(id) ? notesPath : "fb2-main"}#${id}"`);
  const noteIds = new Set(notes.flatMap((b) => q(b, "section").map((s) => s.getAttribute("id")).filter(Boolean)));
  const tops = [...main.childNodes].filter((n) => n.nodeType === 1 && n.localName === "section");
  const pushChapter = async (html, t) => {
    const c = await cleanChapter(`<html><body>${fix(html)}</body></html>`, chapters.length ? `fb2-${chapters.length}` : "fb2-main", null, []);
    chapters.push({ path: chapters.length ? `fb2-${chapters.length}` : "fb2-main", title: t || c.title || tr("第 {n} 章", { n: chapters.length + 1 }), html: c.html, text: c.text });
  };
  const intro = [...main.childNodes].filter((n) => n.nodeType === 1 && n.localName !== "section");
  if (intro.some((n) => n.textContent.trim() || n.localName === "image")) {
    const wrap = doc.createElement("x");
    intro.forEach((n) => wrap.append(n.cloneNode(true)));
    await pushChapter(render(wrap, 0), title);
    nav.push({ title, chapter: 0, depth: 0 });
  }
  for (const sec of tops.length ? tops : [main]) {
    const t = first(sec, "title")?.textContent.replace(/\s+/g, " ").trim();
    await pushChapter(render(sec, 0), t);
    nav.push({ title: chapters[chapters.length - 1].title, chapter: chapters.length - 1, depth: 0 });
    for (const sub of [...sec.childNodes].filter((n) => n.nodeType === 1 && n.localName === "section")) {
      const st = first(sub, "title")?.textContent.replace(/\s+/g, " ").trim();
      if (st) nav.push({ title: st, chapter: chapters.length - 1, depth: 1, anchor: sub.getAttribute("id") || "" });
    }
  }
  if (notes.length) {
    const html = notes.map((b) => render(b, 0)).join("");
    const c = await cleanChapter(`<html><body>${html}</body></html>`, notesPath, null, []);
    chapters.push({ path: notesPath, title: tr("注释"), html: c.html, text: c.text });
    nav.push({ title: tr("注释"), chapter: chapters.length - 1, depth: 0 });
  }
  if (!chapters.length) throw new Error(tr("FB2 文件没有正文"));
  // first chapter path must match internal links to the main body
  return {
    title,
    author,
    lang: (first(info, "lang")?.textContent || "").trim().slice(0, 35),
    chapters,
    nav: inferDepth(nav),
    cover: coverData ? await thumbnail(coverData) : "",
  };
}

// ── CBZ comics: pages stay in the original archive and are decoded on demand ──
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
export async function comicPages(bytes) {
  const zip = await JSZip.loadAsync(bytes);
  const pages = Object.values(zip.files)
    .filter((f) => !f.dir && IMG_MIME[f.name.split(".").pop().toLowerCase()] && !/(^|\/)(__MACOSX|\.)/.test(f.name))
    .sort((a, b) => natural(a.name, b.name));
  return { zip, pages };
}
export async function parseCbz(bytes, filename) {
  const { pages } = await comicPages(bytes);
  if (!pages.length) throw new Error(tr("压缩包里没有图片"));
  const firstPage = new Blob([await pages[0].async("uint8array")], { type: IMG_MIME[pages[0].name.split(".").pop().toLowerCase()] });
  return {
    title: filename.replace(/\.(cbz|zip)$/i, ""),
    author: "漫画",
    pages: pages.length,
    chapters: [],
    nav: [],
    cover: await thumbnail(firstPage),
  };
}
export async function comicPageURL(comic, index) {
  const f = comic.pages[index];
  if (!f) return "";
  if (comic.urls.has(index)) return comic.urls.get(index);
  const blob = new Blob([await f.async("uint8array")], { type: IMG_MIME[f.name.split(".").pop().toLowerCase()] });
  const url = URL.createObjectURL(blob);
  comic.urls.set(index, url);
  // keep a small window of decoded pages
  for (const k of comic.urls.keys())
    if (Math.abs(k - index) > 4) {
      URL.revokeObjectURL(comic.urls.get(k));
      comic.urls.delete(k);
    }
  return url;
}
