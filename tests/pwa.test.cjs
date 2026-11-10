const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const vm = require("node:vm");

test("the manifest launches a standalone app within root or GitHub Pages project paths", () => {
  const manifest = JSON.parse(readFileSync(require.resolve("../manifest.webmanifest"), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);
  for (const scope of ["https://example.com/", "https://example.com/harmonies-crescendo/"]) {
    const manifestUrl = new URL("manifest.webmanifest", scope);
    assert.equal(new URL(manifest.scope, manifestUrl).href, scope);
    assert.equal(new URL(manifest.id, manifestUrl).href, scope);
    assert.equal(new URL(manifest.start_url, manifestUrl).href, `${scope}index.html`);
    for (const icon of manifest.icons) assert.ok(new URL(icon.src, manifestUrl).href.startsWith(scope));
  }
});

test("manifest and Apple icons are PNGs with the required dimensions", () => {
  const manifest = JSON.parse(readFileSync(require.resolve("../manifest.webmanifest"), "utf8"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512"));
  const icons = [...manifest.icons, { src: "icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }];
  for (const icon of icons) {
    const data = readFileSync(resolve(__dirname, "..", icon.src));
    assert.equal(icon.type, "image/png");
    assert.equal(data.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
});

function worker(scope = "https://example.com/harmonies-crescendo/") {
  const handlers = {};
  const stored = new Map();
  const state = { online: true, claimed: false, installFailure: false };
  const caches = {
    open: async (name) => {
      if (!stored.has(name)) stored.set(name, new Map());
      return {
        addAll: async (urls) => {
          if (state.installFailure) throw new Error("Download failed");
          urls.forEach((url) => stored.get(name).set(url, new Response(`cached: ${url}`)));
        }
      };
    },
    keys: async () => [...stored.keys()],
    delete: async (name) => stored.delete(name),
    match: async (request, options) => {
      const url = new URL(request.url);
      if (options.ignoreSearch) url.search = "";
      return stored.get(options.cacheName)?.get(url.href)?.clone();
    }
  };
  const context = {
    URL, Response, caches,
    fetch: async () => {
      if (!state.online) throw new Error("Offline");
      return new Response("network");
    },
    self: {
      registration: { scope },
      clients: { claim: async () => { state.claimed = true; } },
      addEventListener: (type, handler) => { handlers[type] = handler; }
    }
  };
  vm.runInNewContext(readFileSync(require.resolve("../sw.js"), "utf8"), context);
  return {
    state, stored,
    lifecycle: (type) => new Promise((resolve, reject) => handlers[type]({ waitUntil: (promise) => promise.then(resolve, reject) })),
    request: (path, method = "GET") => {
      let response;
      handlers.fetch({ request: new Request(new URL(path, scope), { method }), respondWith: (promise) => { response = promise; } });
      return response;
    }
  };
}

test("the service worker caches both pages and icons within the project scope", async () => {
  const app = worker();
  await app.lifecycle("install");
  const files = [...app.stored.values()][0];
  for (const file of ["", "index.html", "leaderboard.html", "styles.css", "records.js", "script.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"]) {
    assert.ok(files.has(`https://example.com/harmonies-crescendo/${file}`), file);
  }
});

test("online requests use fresh responses and offline requests fall back to the app cache", async () => {
  const app = worker();
  await app.lifecycle("install");
  assert.equal(await (await app.request("index.html")).text(), "network");
  app.state.online = false;
  for (const path of ["./", "index.html", "leaderboard.html", "script.js", "styles.css", "manifest.webmanifest", "index.html?from=home"]) {
    assert.match(await (await app.request(path)).text(), /^cached:/);
  }
  assert.equal(app.request("https://other.example/index.html"), undefined);
  assert.equal(app.request("/another-app/index.html"), undefined);
  assert.equal(app.request("index.html", "POST"), undefined);
});

test("activation removes only obsolete caches owned by this app scope", async () => {
  const app = worker();
  const old = "harmonies-app-https://example.com/harmonies-crescendo/-v0";
  const other = "harmonies-app-https://example.com/another-app/-v0";
  app.stored.set(old, new Map());
  app.stored.set(other, new Map());
  app.stored.set("unrelated-cache", new Map());
  await app.lifecycle("install");
  await app.lifecycle("activate");
  assert.equal(app.stored.has(old), false);
  assert.equal(app.stored.has(other), true);
  assert.equal(app.stored.has("unrelated-cache"), true);
  assert.equal(app.state.claimed, true);
});

test("an incomplete download fails installation without deleting the previous cache", async () => {
  const app = worker();
  const old = "harmonies-app-https://example.com/harmonies-crescendo/-v0";
  app.stored.set(old, new Map());
  app.state.installFailure = true;
  await assert.rejects(app.lifecycle("install"), /Download failed/);
  assert.equal(app.stored.has(old), true);
});