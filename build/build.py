#!/usr/bin/env python3
"""Build www-dist from www: lower JS syntax for older WebViews, add CSS fallbacks, inject polyfills."""
import json, re, shutil, subprocess, sys, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "www"); OUT = os.path.join(ROOT, "www-dist")
# esbuild: set ESBUILD=/path/to/esbuild, or have it on PATH (npm i -g esbuild)
ESB = os.environ.get("ESBUILD") or shutil.which("esbuild") or sys.exit("esbuild not found: npm i -g esbuild, or set ESBUILD")
TARGET = "chrome66"
shutil.rmtree(OUT, ignore_errors=True)
shutil.copytree(SRC, OUT)
shutil.copy(os.path.join(os.path.dirname(__file__), "polyfills.js"), os.path.join(OUT, "polyfills.js"))
for js in ["app.js", "books.js", "pager.js", "formats.js", "i18n.js", "i18n-data.js", "zhconv-data.js", "vendor/mobi.js", "vendor/pdf.mjs", "vendor/pdf.worker.mjs"]:
    p = os.path.join(OUT, js)
    r = subprocess.run([ESB, p, f"--target={TARGET}", "--format=esm", "--charset=utf8", "--log-level=warning", f"--outfile={p}", "--allow-overwrite", "--supported:dynamic-import=true", "--supported:import-meta=true", "--minify", "--legal-comments=inline"], capture_output=True, text=True)
    if r.returncode: print(r.stderr); sys.exit(1)
    if r.stderr.strip(): print(js, r.stderr.strip()[:400])

# ── CSS ──
css = open(os.path.join(SRC, "style.css"), encoding="utf-8").read()
def split_top(s):
    out, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(": depth += 1
        if ch == ")": depth -= 1
        if ch == "," and depth == 0: out.append(cur.strip()); cur = ""
        else: cur += ch
    out.append(cur.strip()); return out
def expand_is(sel):
    m = re.search(r":is\(", sel)
    if not m: return [sel]
    i = m.end(); depth = 1; j = i
    while depth:
        if sel[j] == "(": depth += 1
        elif sel[j] == ")": depth -= 1
        j += 1
    inner = sel[i:j-1]; pre = sel[:m.start()]; post = sel[j:]
    res = []
    for alt in split_top(inner):
        res += expand_is(pre + alt + post)
    return res
def fix_rule(sel, body):
    sels = []
    for s in split_top(sel): sels += expand_is(s)
    # selectors using :has() can't share a rule with others on old engines
    plain = [s for s in sels if ":has(" not in s and ":focus-visible" not in s]
    special = [s for s in sels if s not in plain]
    out = ""
    if plain: out += ",\n".join(plain) + " {" + body + "}\n"
    for s in special: out += s + " {" + body + "}\n"
    return out
def fallbacks(body):
    decls = body.split(";"); res = []
    for d in decls:
        if "color-mix(" in d and ":" in d:
            prop = d.split(":", 1)[0]
            first = re.search(r"color-mix\(in srgb,\s*([^,]+?)\s+\d+%", d)
            if first: res.append(prop + ": " + d.split(":",1)[1].replace(re.search(r"color-mix\([^()]*(?:\([^()]*\)[^()]*)*\)", d).group(0), first.group(1)))
        if "dvh" in d and ":" in d: res.append(d.replace("dvh", "vh"))
        if "cqw" in d and ":" in d: res.append(re.sub(r"([\d.]+)cqw", lambda m: f"{float(m.group(1))*1.1:.1f}px", d))
        res.append(d)
    return ";".join(res)
out = []
pos = 0
# walk rules, handling @media/@keyframes blocks by recursion on their content
def process(block):
    res = ""; i = 0
    while i < len(block):
        # comments are copied as they are, never read as part of the next selector
        while i < len(block) and block[i] in " \t\r\n": i += 1
        if i >= len(block): break
        if block.startswith("/*", i):
            j = block.index("*/", i) + 2; res += block[i:j]; i = j; continue
        k = block.find("{", i)
        if k < 0: res += block[i:]; break
        head = block[i:k].strip()
        depth = 1; j = k + 1
        while depth:
            if block[j] == "{": depth += 1
            elif block[j] == "}": depth -= 1
            j += 1
        inner = block[k+1:j-1]
        if head.startswith("@media") or head.startswith("@supports"):
            res += head + " {\n" + process(inner) + "}\n"
        elif head.startswith("@"):
            res += head + " {" + inner + "}\n"
        elif head:
            res += fix_rule(head, fallbacks(inner))
        i = j
    return res
imp = re.match(r'\s*@import[^;]+;', css)
head = imp.group(0) if imp else ""
body = css[len(head):]
css2 = head + "\n" + process(body)
css2 += """
/* engines without aspect-ratio (Chrome < 88) */
@supports not (aspect-ratio: 1) {
  .cover { height: 0; padding-top: 150%; }
  .theme-dot i { height: 0; padding-top: 133%; }
  .week .day i { height: 0; padding-top: 100%; }
}
"""
open(os.path.join(OUT, "style.css"), "w", encoding="utf-8").write(css2)
# ── HTML ──
h = open(os.path.join(OUT, "index.html"), encoding="utf-8").read()
h = h.replace('<script src="./vendor/jszip.min.js" defer></script>', '<script src="./polyfills.js"></script><script src="./vendor/jszip.min.js" defer></script><script nomodule>document.addEventListener("DOMContentLoaded",function(){document.body.innerHTML=\'<div style="padding:48px 24px;font:16px/1.7 sans-serif;color:#333">系统的网页组件（Android System WebView）版本太旧，留白无法运行。<br>请在应用商店搜索「Android System WebView」或「Chrome」并更新后再打开。<br><br>Your Android System WebView is too old for Liubai. Please update “Android System WebView” or “Chrome” from the app store, then open Liubai again.</div>\'})</script>')
open(os.path.join(OUT, "index.html"), "w", encoding="utf-8").write(h)
# ── service worker asset list (web use only; the APK serves assets directly) ──
files = ["./"]
for root, _, names in os.walk(OUT):
    for n in sorted(names):
        rel = os.path.relpath(os.path.join(root, n), OUT).replace(os.sep, "/")
        if rel != "sw.js": files.append("./" + rel)
sw = open(os.path.join(OUT, "sw.js"), encoding="utf-8").read()
sw = re.sub(r"const ASSETS=\[.*?\];", "const ASSETS=" + json.dumps(files, ensure_ascii=False) + ";", sw, count=1, flags=re.S)
open(os.path.join(OUT, "sw.js"), "w", encoding="utf-8").write(sw)
print("built", OUT)
