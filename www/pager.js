// Reflowable chapters laid out as horizontal CSS columns, one column per page.
export class BookPager {
  constructor(viewport, content) {
    this.viewport = viewport;
    this.content = content;
    this.page = 0;
    this.count = 1;
    this.pitch = 1;
    this.active = false;
    this.entries = [];
    this.length = 0;
    this.motion = null;
    this.x = 0;
    this.animate = true;
  }
  indexText() {
    const walker = document.createTreeWalker(
      this.content,
      NodeFilter.SHOW_TEXT,
    );
    this.entries = [];
    this.length = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.length) {
        this.entries.push({
          node,
          start: this.length,
          end: this.length + node.length,
        });
        this.length += node.length;
      }
    }
  }
  range(offset) {
    if (!this.entries.length) return null;
    offset = Math.max(0, Math.min(this.length - 1, offset));
    let lo = 0,
      hi = this.entries.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.entries[mid].end <= offset) lo = mid + 1;
      else hi = mid;
    }
    const e = this.entries[lo],
      r = document.createRange();
    r.setStart(e.node, offset - e.start);
    r.setEnd(e.node, Math.min(e.node.length, offset - e.start + 1));
    return r;
  }
  pageOf(range) {
    const rect = range?.getBoundingClientRect?.();
    if (!rect) return this.page;
    return Math.max(
      0,
      Math.min(
        this.count - 1,
        Math.floor(
          (rect.left -
            this.viewport.getBoundingClientRect().left +
            this.page * this.pitch -
            this.margin +
            2) /
            this.pitch,
        ),
      ),
    );
  }
  anchor() {
    if (!this.active) return null;
    if (!this.entries.length || !this.entries[0].node.isConnected)
      this.indexText();
    if (!this.page || !this.length) return 0;
    let lo = 0,
      hi = this.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pageOf(this.range(mid)) < this.page) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  layout(settings, position = {}) {
    this.active = true;
    this.cancelMotion();
    this.pitch = Math.max(1, this.viewport.clientWidth || window.innerWidth);
    const height =
      this.viewport.clientHeight || Math.max(200, window.innerHeight - 138);
    // Wide landscape screens show two pages side by side, like an open book.
    this.spread = this.pitch >= 960 && this.pitch > height * 1.2;
    let width;
    if (this.spread) {
      width = Math.min(Math.max(320, settings.width * 0.78), (this.pitch - 6 * settings.margin) / 2);
      this.gap = this.pitch / 2 - width;
      this.margin = this.gap / 2;
    } else {
      width = Math.min(this.pitch - 2 * settings.margin, settings.width);
      this.margin = Math.max(settings.margin, (this.pitch - width) / 2);
      this.gap = this.margin * 2;
    }
    this.viewport.closest("#reader")?.classList.toggle("spread", this.spread);
    this.content.style.setProperty("--page-width", `${Math.max(100, width)}px`);
    const focused = document.body.classList.contains("focus");
    const safe = focused ? getComputedStyle(document.documentElement) : null;
    const top = focused
      ? Math.max(16, parseFloat(safe.getPropertyValue("--safe-top")) + 8 || 0)
      : 16;
    const bottom = focused
      ? Math.max(
          16,
          parseFloat(safe.getPropertyValue("--safe-bottom")) + 8 || 0,
        )
      : 16;
    const statusSpace = settings.statusBar ? 22 : 0;
    this.content.style.setProperty("--page-top", `${top}px`);
    this.content.style.setProperty(
      "--page-height",
      `${Math.max(80, height - top - bottom - statusSpace)}px`,
    );
    this.content.style.setProperty("--page-gap", `${this.gap}px`);
    this.content.style.setProperty("--page-margin", `${this.margin}px`);
    this.page = 0;
    this.paint();
    this.viewport.scrollLeft = 0;
    this.viewport.scrollTop = 0;
    this.count = Math.max(
      1,
      Math.round((this.content.scrollWidth + this.gap) / this.pitch),
    );
    this.indexText();
    if (Number.isInteger(position.offset))
      this.page = this.pageOf(this.range(position.offset));
    else
      this.page = Math.max(
        0,
        Math.min(
          this.count - 1,
          Math.round((position.ratio || 0) * (this.count - 1)),
        ),
      );
    this.paint();
  }
  paint(delta = 0) {
    this.x = -this.page * this.pitch + delta;
    this.content.style.transform = `translate3d(${this.x}px,0,0)`;
  }
  cancelMotion() {
    if (this.motion) {
      this.motion.finish();
      this.motion = null;
    }
    this.content.style.transition = "none";
  }
  motionFor(page, delta = 0, velocity = 0) {
    const distance = Math.abs(-page * this.pitch + delta - this.x);
    let duration = Math.max(130, Math.min(280, 100 + distance * 0.42));
    if (Math.abs(velocity) > 0.15)
      duration = Math.min(
        duration,
        Math.max(120, (distance / Math.abs(velocity)) * 1.4),
      );
    const slope =
      distance > 0 && Math.abs(velocity) > 0.15
        ? Math.min(
            0.85,
            Math.max(0.22, ((Math.abs(velocity) * duration) / distance) * 0.2),
          )
        : 0.65;
    if (
      !this.animate ||
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    )
      duration = 0;
    return {
      duration: Math.round(duration),
      easing: `cubic-bezier(.2,${slope.toFixed(3)},.3,1)`,
    };
  }
  async settle(page, delta = 0, motion = this.motionFor(page, delta)) {
    this.cancelMotion();
    const destination = -page * this.pitch + delta;
    if (!motion.duration || Math.abs(destination - this.x) < 0.5) {
      this.page = page;
      this.paint(delta);
      return;
    }
    await new Promise((resolve) => {
      let done = false,
        timer;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        this.content.removeEventListener("transitionend", onEnd);
        this.content.style.transition = "none";
        this.page = page;
        this.x = destination;
        this.motion = null;
        resolve();
      };
      const onEnd = (e) => {
        if (e.target === this.content && e.propertyName === "transform")
          finish();
      };
      this.motion = { finish };
      // Commit the drag transform before transitioning to the page boundary.
      void this.content.offsetWidth;
      this.content.style.transition = `transform ${motion.duration}ms ${motion.easing}`;
      this.content.addEventListener("transitionend", onEnd);
      this.content.style.transform = `translate3d(${destination}px,0,0)`;
      timer = setTimeout(finish, motion.duration + 60);
    });
  }
  deactivate() {
    this.cancelMotion();
    this.active = false;
    this.viewport.closest("#reader")?.classList.remove("spread");
    this.content.style.transform = "";
    for (const prop of [
      "--page-width",
      "--page-height",
      "--page-gap",
      "--page-margin",
      "--page-top",
    ])
      this.content.style.removeProperty(prop);
  }
}
