import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");

function createPage(options = {}) {
  const events = new Map();
  const frames = [];
  const elements = new Map();
  const links = [];
  const window = {
    scrollY: options.scrollY ?? 0,
    innerHeight: options.innerHeight ?? 1000,
    innerWidth: options.innerWidth ?? 1440,
    matchMedia: () => ({ get matches() { return window.innerWidth >= 1100; } }),
    addEventListener(name, handler) {
      const handlers = events.get(name) || [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    requestAnimationFrame(callback) {
      frames.push(callback);
      return frames.length;
    },
  };

  function element(id, top = 0, height = 0) {
    const classes = new Set();
    const attributes = new Map();
    const item = {
      id, top, height, style: {}, textContent: "",
      classList: {
        contains: (name) => classes.has(name),
        toggle(name, enabled) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
      setAttribute: (name, value) => attributes.set(name, value),
      removeAttribute: (name) => attributes.delete(name),
      getAttribute: (name) => attributes.get(name) ?? null,
      getBoundingClientRect: () => ({ top: item.top - window.scrollY, height: item.height }),
    };
    elements.set(id, item);
    return item;
  }

  element("siteHead", 0, options.headerHeight ?? 64);
  element("depthReadout").textContent = "initial";
  element("railBucket");
  element("year");
  element("top");
  const positions = options.sections ?? { kovarna: 1000, pribeh: 2000, firmy: 3000, dno: 4300 };
  for (const [id, top] of Object.entries(positions)) element(id, top);
  for (const id of options.navigation ?? Object.keys(positions)) {
    const link = element(`link-${id}`);
    link.hash = `#${id}`;
    links.push(link);
  }
  for (const id of options.missing ?? []) elements.delete(id);

  const document = {
    documentElement: { lang: options.lang ?? "cs", scrollHeight: options.scrollHeight ?? 5000 },
    getElementById: (id) => elements.get(id) ?? null,
    querySelectorAll(selector) {
      assert.equal(selector, ".nav a[href^='#']");
      return links;
    },
  };
  runInNewContext(source, { window, document, Date });

  return {
    window, document, elements, links, frames,
    emit(name) {
      for (const handler of events.get(name) || []) handler();
    },
    flush() {
      for (const callback of frames.splice(0)) callback();
    },
    scrollTo(position) {
      window.scrollY = position;
      this.emit("scroll");
      this.flush();
    },
    current() {
      return links.filter((link) => link.classList.contains("active")).map((link) => link.hash);
    },
  };
}

test("initial header is expanded and the hero has no active section", () => {
  const page = createPage();
  assert.equal(page.elements.get("siteHead").classList.contains("scrolled"), false);
  assert.deepEqual(page.current(), []);
  assert.ok(page.links.every((link) => link.getAttribute("aria-current") === null));
});

test("header condenses only after the 30 pixel threshold", () => {
  const page = createPage();
  page.scrollTo(30);
  assert.equal(page.elements.get("siteHead").classList.contains("scrolled"), false);
  page.scrollTo(31);
  assert.equal(page.elements.get("siteHead").classList.contains("scrolled"), true);
});

test("header expands again during negative browser overscroll", () => {
  const page = createPage({ scrollY: 500 });
  page.scrollTo(-100);
  assert.equal(page.elements.get("siteHead").classList.contains("scrolled"), false);
});

test("a missing header does not prevent navigation and depth updates", () => {
  const page = createPage({ missing: ["siteHead"] });
  page.scrollTo(1000);
  assert.deepEqual(page.current(), ["#kovarna"]);
  assert.equal(page.elements.get("depthReadout").textContent, "−10,5 m");
});

test("halfway down the page displays Czech depth and moves the rail bucket", () => {
  const page = createPage();
  page.scrollTo(2000);
  assert.equal(page.elements.get("depthReadout").textContent, "−21,0 m");
  assert.equal(page.elements.get("railBucket").style.transform, "translate(-50%, 420px)");
});

test("English depth uses a decimal point", () => {
  const page = createPage({ lang: "en", scrollY: 1000 });
  assert.equal(page.elements.get("depthReadout").textContent, "−10.5 m");
});

test("depth clamps overscroll at both ends of the page", () => {
  const page = createPage();
  page.scrollTo(-200);
  assert.equal(page.elements.get("depthReadout").textContent, "−0,0 m");
  assert.equal(page.elements.get("railBucket").style.transform, "translate(-50%, 0px)");
  page.scrollTo(7000);
  assert.equal(page.elements.get("depthReadout").textContent, "−42,0 m");
  assert.equal(page.elements.get("railBucket").style.transform, "translate(-50%, 840px)");
});

test("a page with no scroll range has a finite zero depth", () => {
  for (const scrollHeight of [0, 800, 1000]) {
    const page = createPage({ scrollHeight });
    assert.equal(page.elements.get("depthReadout").textContent, "−0,0 m");
    assert.equal(page.elements.get("railBucket").style.transform, "translate(-50%, 0px)");
    assert.deepEqual(page.current(), []);
  }
});

test("the hidden rail skips updates and catches up when the viewport widens", () => {
  const page = createPage({ innerWidth: 1099, scrollY: 2000 });
  assert.equal(page.elements.get("depthReadout").textContent, "initial");
  assert.equal(page.elements.get("railBucket").style.transform, undefined);
  page.window.innerWidth = 1100;
  page.emit("resize");
  page.flush();
  assert.equal(page.elements.get("depthReadout").textContent, "−21,0 m");
});

test("missing optional rail elements do not break the page", () => {
  for (const missing of [["depthReadout"], ["railBucket"], ["depthReadout", "railBucket"]]) {
    const page = createPage({ missing });
    page.scrollTo(2100);
    assert.deepEqual(page.current(), ["#pribeh"]);
    assert.equal(page.elements.get("year").textContent, String(new Date().getFullYear()));
  }
});

test("navigation follows section position and maintains one accessible current link", () => {
  const page = createPage({ navigation: ["dno", "firmy", "kovarna", "pribeh"] });
  page.scrollTo(2000);
  assert.deepEqual(page.current(), ["#pribeh"]);
  assert.equal(page.elements.get("link-pribeh").getAttribute("aria-current"), "location");
  assert.equal(page.elements.get("link-kovarna").getAttribute("aria-current"), null);
  page.scrollTo(3000);
  assert.deepEqual(page.current(), ["#firmy"]);
  assert.equal(page.elements.get("link-pribeh").getAttribute("aria-current"), null);
});

test("returning to the hero clears the active link and aria-current", () => {
  const page = createPage({ navigation: ["top", "kovarna", "pribeh", "firmy", "dno"] });
  page.scrollTo(2000);
  page.scrollTo(0);
  assert.deepEqual(page.current(), []);
  assert.ok(page.links.every((link) => link.getAttribute("aria-current") === null));
});

test("the last section is current at the bottom even when it cannot reach the header", () => {
  const page = createPage();
  page.scrollTo(3998);
  assert.deepEqual(page.current(), ["#firmy"]);
  page.scrollTo(4000);
  assert.deepEqual(page.current(), ["#dno"]);
});

test("navigation tracking includes a taller mobile header", () => {
  const page = createPage({ headerHeight: 100, innerWidth: 390 });
  page.scrollTo(850);
  assert.deepEqual(page.current(), []);
  page.scrollTo(870);
  assert.deepEqual(page.current(), ["#kovarna"]);
});

test("broken or empty navigation targets are ignored without throwing", () => {
  const page = createPage({ navigation: ["", "missing", "kovarna", "pribeh"] });
  page.scrollTo(2100);
  assert.deepEqual(page.current(), ["#pribeh"]);
});

test("a document missing all optional elements still handles scroll and resize", () => {
  const page = createPage({
    sections: {}, navigation: [],
    missing: ["siteHead", "depthReadout", "railBucket", "year", "top"],
  });
  assert.doesNotThrow(() => {
    page.scrollTo(2000);
    page.emit("resize");
    page.flush();
  });
});

test("scroll and resize events share one animation frame and use the latest position", () => {
  const page = createPage();
  page.window.scrollY = 1000;
  page.emit("scroll");
  page.window.scrollY = 2000;
  page.emit("scroll");
  page.emit("resize");
  assert.equal(page.frames.length, 1);
  assert.equal(page.elements.get("depthReadout").textContent, "−0,0 m");
  page.flush();
  assert.equal(page.elements.get("depthReadout").textContent, "−21,0 m");
  page.emit("scroll");
  assert.equal(page.frames.length, 1);
});

test("page load and browser history restoration refresh layout-dependent state", () => {
  const page = createPage();
  page.document.documentElement.scrollHeight = 9000;
  page.window.scrollY = 4000;
  page.emit("load");
  page.emit("pageshow");
  assert.equal(page.frames.length, 1);
  page.flush();
  assert.equal(page.elements.get("depthReadout").textContent, "−21,0 m");
});

test("the footer year reflects the current calendar year", () => {
  const page = createPage();
  assert.equal(page.elements.get("year").textContent, String(new Date().getFullYear()));
});

test("a missing year element does not prevent the remaining enhancements", () => {
  const page = createPage({ missing: ["year"], scrollY: 2000 });
  assert.equal(page.elements.get("depthReadout").textContent, "−21,0 m");
  assert.deepEqual(page.current(), ["#pribeh"]);
});
