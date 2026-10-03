// Collect every tr("…") key from the JS sources and every fixed CJK string from index.html.
const fs = require("fs"), path = require("path"), acorn = require(process.env.ACORN || "acorn"), walk = require(process.env.ACORN_WALK || "acorn-walk");
const dir = process.argv[2];
const keys = new Map();
for (const f of ["app.js", "books.js", "formats.js", "i18n.js"]) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  const ast = acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  walk.simple(ast, {
    CallExpression(n) {
      if (n.callee.type === "Identifier" && n.callee.name === "tr") {
        const a = n.arguments[0];
        if (a && a.type === "Literal" && typeof a.value === "string") keys.has(a.value) || keys.set(a.value, `${f}:${a.loc.start.line}`);
        else if (a) console.error("non-literal tr() at", f, n.loc.start.line);
      }
    },
  });
}
const html = fs.readFileSync(path.join(dir, "index.html"), "utf8").replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
const cjk = /[一-鿿]/;
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = m[1].trim(); if (t && cjk.test(t) && !keys.has(t)) keys.set(t, "index.html"); }
for (const m of html.matchAll(/data-i18n="([^"]*)"/g)) { const t = m[1].trim(); if (t && !keys.has(t)) keys.set(t, "index.html@i18n"); }
for (const m of html.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]*)"/g)) { const t = m[1].trim(); if (t && cjk.test(t) && !keys.has(t)) keys.set(t, "index.html@attr"); }
fs.writeFileSync(process.argv[3], JSON.stringify([...keys].map(([k, w]) => ({ k, w })), null, 1));
console.log("keys", keys.size);
