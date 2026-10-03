// Small API shims so older Android System WebView builds (Chrome 66+) can run 留白.
(function () {
  var g = typeof globalThis !== "undefined" ? globalThis : self;
  if (!g.globalThis) g.globalThis = g;
  if (!g.structuredClone)
    g.structuredClone = function (v) {
      return v === undefined ? v : JSON.parse(JSON.stringify(v));
    };
  if (g.crypto && !g.crypto.randomUUID)
    g.crypto.randomUUID = function () {
      var b = new Uint8Array(16);
      g.crypto.getRandomValues(b);
      b[6] = (b[6] & 15) | 64;
      b[8] = (b[8] & 63) | 128;
      var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join("");
      return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
    };
  if (!Object.hasOwn) Object.hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };
  if (!Object.fromEntries)
    Object.fromEntries = function (it) {
      var o = {};
      for (var e of it) o[e[0]] = e[1];
      return o;
    };
  if (!Array.prototype.flat)
    Object.defineProperty(Array.prototype, "flat", { configurable: true, writable: true, value: function (d) {
      d = d === undefined ? 1 : d;
      return d < 1 ? this.slice() : this.reduce(function (a, v) { return a.concat(Array.isArray(v) ? v.flat(d - 1) : v); }, []);
    } });
  if (!Array.prototype.flatMap)
    Object.defineProperty(Array.prototype, "flatMap", { configurable: true, writable: true, value: function (f, t) { return this.map(f, t).flat(1); } });
  if (!Array.prototype.at)
    Object.defineProperty(Array.prototype, "at", { configurable: true, writable: true, value: function (i) { i = Math.trunc(i) || 0; if (i < 0) i += this.length; return this[i]; } });
  if (!String.prototype.replaceAll)
    Object.defineProperty(String.prototype, "replaceAll", { configurable: true, writable: true, value: function (s, r) {
      if (s instanceof RegExp) return this.replace(s, r);
      return this.split(s).join(r);
    } });
  if (!String.prototype.matchAll)
    Object.defineProperty(String.prototype, "matchAll", { configurable: true, writable: true, value: function (re) {
      var flags = re.flags.indexOf("g") < 0 ? re.flags + "g" : re.flags, r = new RegExp(re.source, flags), s = String(this), out = [], m;
      while ((m = r.exec(s))) { out.push(m); if (m[0] === "") r.lastIndex++; }
      return out[Symbol.iterator]();
    } });
  if (g.Blob && !Blob.prototype.arrayBuffer)
    Blob.prototype.arrayBuffer = function () {
      var b = this;
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsArrayBuffer(b); });
    };
  if (g.Blob && !Blob.prototype.text)
    Blob.prototype.text = function () {
      var b = this;
      return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsText(b); });
    };
  if (g.Element && !Element.prototype.replaceChildren)
    Element.prototype.replaceChildren = function () {
      while (this.firstChild) this.removeChild(this.firstChild);
      this.append.apply(this, arguments);
    };
  if (g.Promise && !Promise.prototype.finally)
    Promise.prototype.finally = function (f) {
      return this.then(function (v) { return Promise.resolve(f()).then(function () { return v; }); }, function (e) { return Promise.resolve(f()).then(function () { throw e; }); });
    };
})();
