// Pruebas del service worker: eventos push y notificationclick, sin navegador real.
// Se ejecutan con: npm test (o node scripts/test-service-worker.mjs)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "sw.js"), "utf8");
const scope = "https://carloscr99.github.io/finanzas/";

const handlers = {};
const notifications = [];
const focused = [];
const navigated = [];
const opened = [];

const selfStub = {
  addEventListener(type, handler) { handlers[type] = handler; },
  skipWaiting() {},
  clients: {
    claim() {},
    matchAll: async () => [{ url: `${scope}index.html`, focus: async () => focused.push(true), navigate: async url => navigated.push(url) }],
    openWindow: async url => opened.push(url)
  },
  registration: {
    scope,
    showNotification: async (title, options) => notifications.push({ title, options })
  },
  location: { href: `${scope}sw.js`, origin: new URL(scope).origin }
};

const context = vm.createContext({
  self: selfStub,
  caches: {
    open: async () => ({ add: async () => null, put: async () => null }),
    keys: async () => [],
    delete: async () => null,
    match: async () => null
  },
  fetch: async () => ({ ok: true, clone() { return this; } }),
  URL,
  Promise,
  console,
  setTimeout,
  clearTimeout
});

vm.runInContext(source, context, { filename: "sw.js" });

function dispatch(type, event) {
  let pending;
  event.waitUntil = value => { pending = value; };
  handlers[type](event);
  return pending;
}

let checks = 0;
async function test(name, fn) {
  await fn();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}

await test("registra los eventos push y notificationclick", () => {
  assert.equal(typeof handlers.push, "function");
  assert.equal(typeof handlers.notificationclick, "function");
});

await test("muestra la notificación con título, cuerpo, icono y destino", async () => {
  notifications.length = 0;
  await dispatch("push", {
    data: {
      json: () => ({
        title: "Mañana vence un pago",
        body: "Alquiler · 900,00 €",
        tag: "finanzas-gastos-2026-11-04",
        url: "./?page=recurring"
      })
    }
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Mañana vence un pago");
  assert.equal(notifications[0].options.body, "Alquiler · 900,00 €");
  assert.equal(notifications[0].options.icon, `${scope}icon-192.png`);
  assert.equal(notifications[0].options.badge, `${scope}badge-96.png`);
  assert.equal(notifications[0].options.tag, "finanzas-gastos-2026-11-04");
  assert.equal(notifications[0].options.data.url, "./?page=recurring");
});

await test("si el payload no es JSON, muestra el texto recibido", async () => {
  notifications.length = 0;
  await dispatch("push", {
    data: {
      json: () => { throw new Error("no es JSON"); },
      text: () => "Aviso de prueba"
    }
  });
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].title, "Mis Finanzas");
  assert.equal(notifications[0].options.body, "Aviso de prueba");
});

await test("al tocar la notificación enfoca la app y abre la página indicada", async () => {
  focused.length = 0;
  navigated.length = 0;
  opened.length = 0;
  let closed = false;
  await dispatch("notificationclick", {
    notification: {
      close() { closed = true; },
      data: { url: "./?page=recurring" }
    }
  });
  assert.equal(closed, true);
  assert.equal(focused.length, 1);
  assert.deepEqual(navigated, [`${scope}?page=recurring`]);
  assert.equal(opened.length, 0);
});

await test("si no hay ventanas abiertas, abre una nueva en el destino", async () => {
  selfStub.clients.matchAll = async () => [];
  focused.length = 0;
  navigated.length = 0;
  opened.length = 0;
  await dispatch("notificationclick", {
    notification: {
      close() {},
      data: { url: "./?page=assets" }
    }
  });
  assert.equal(focused.length, 0);
  assert.equal(opened.length, 1);
  assert.equal(opened[0], `${scope}?page=assets`);
});

console.log(`\n${checks} comprobaciones correctas.`);
