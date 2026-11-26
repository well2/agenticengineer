import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../js/consent.js", import.meta.url), "utf8");
const KEY = "ae-analytics-consent";

function button(dataset = {}) {
  const handlers = [];
  return {
    dataset, hidden: true, focused: false,
    addEventListener: (name, handler) => handlers.push(handler),
    focus() { this.focused = true; },
    click() { handlers.forEach((handler) => handler()); },
  };
}

function createPage(stored) {
  const storage = new Map(stored ? [[KEY, stored]] : []);
  const appended = [];
  const deny = button({ consent: "denied" });
  const allow = button({ consent: "granted" });
  const opener = button();
  const banner = {
    hidden: true,
    contains: () => false,
    querySelector: () => deny,
    querySelectorAll: () => [deny, allow],
  };
  const document = {
    activeElement: null,
    head: { append: (node) => appended.push(node) },
    getElementById: (id) => (id === "consent" ? banner : null),
    querySelectorAll: () => [opener],
    createElement: () => ({}),
  };
  const window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  runInNewContext(source, { window, document });
  const calls = () => JSON.parse(JSON.stringify((window.clarity?.q ?? []).map((args) => [...args])));
  return { window, banner, deny, allow, opener, storage, appended, calls };
}

test("asks first and loads nothing until the visitor allows analytics", () => {
  const page = createPage();
  assert.equal(page.banner.hidden, false);
  assert.equal(page.opener.hidden, false);
  assert.equal(page.window.clarity, undefined);
  assert.equal(page.appended.length, 0);

  page.allow.click();
  assert.equal(page.storage.get(KEY), "granted");
  assert.equal(page.banner.hidden, true);
  assert.match(page.appended[0].src, /^https:\/\/www\.clarity\.ms\/tag\/[a-z0-9]+$/);
  assert.deepEqual(page.calls(), [["consentv2", { ad_Storage: "denied", analytics_Storage: "granted" }]]);
});

test("a stored decline keeps Clarity off and the banner closed", () => {
  const page = createPage("denied");
  assert.equal(page.banner.hidden, true);
  assert.equal(page.window.clarity, undefined);
});

test("withdrawing consent erases Clarity cookies", () => {
  const page = createPage("granted");
  assert.equal(page.banner.hidden, true);
  page.opener.click();
  assert.equal(page.banner.hidden, false);
  page.deny.click();
  assert.equal(page.storage.get(KEY), "denied");
  assert.deepEqual(page.calls().slice(-1), [["consent", false]]);
});
