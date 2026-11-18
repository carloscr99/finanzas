import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../index.html", import.meta.url), "utf8");
function section(start, end) {
  const from = source.indexOf(start);
  assert.ok(from >= 0, start);
  const to = source.indexOf(end, from);
  assert.ok(to > from, end);
  return source.slice(from, to);
}

function app() {
  const timers = new Map();
  const operations = [];
  const alerts = [];
  const handlers = new Map();
  const toast = { textContent: "", hidden: true };
  let timerId = 0;
  function operation(writes) {
    let resolve, reject;
    const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
    operations.push({ resolve, reject, writes });
    return promise;
  }
  const context = vm.createContext({
    state: { assets: [], movements: [], meta: {} },
    db: {},
    navigator: { onLine: true },
    window: { addEventListener: (event, handler) => handlers.set(event, handler) },
    console: { error() {} },
    el: () => toast,
    uiAlert: message => alerts.push(message),
    doc: (_, id) => ({ id }),
    setDoc: (ref, data) => operation([{ ref, data }]),
    writeBatch() {
      const writes = [];
      return {
        set: (ref, data) => writes.push({ ref, data }),
        delete: ref => writes.push({ ref, deleted: true }),
        commit: () => operation(writes)
      };
    },
    setTimeout(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(
    section("let currentUser=null", "function readLegacyLocalState()") +
    "\nlet toastTimer=null;\n" +
    section("function toast(msg,", "function parseAmount(") +
    section('for(const event of ["online","offline"])', 'window.addEventListener("pagehide"') +
    "\nuserDocRef={id:'account'};yearsColRef={id:'years'};",
    context
  );
  function run(code) { return vm.runInContext(code, context); }
  function flush() {
    const timer = [...timers.entries()].find(([, value]) => value.delay === 300);
    assert.ok(timer, "Hay un guardado programado");
    timers.delete(timer[0]);
    timer[1].fn();
  }
  return { context, operations, timers, alerts, toast, handlers, run, flush };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
let checks = 0;
async function test(name, fn) {
  await fn();
  console.log(`ok ${++checks} - ${name}`);
}

await test("Los guardados automáticos al abrir no muestran avisos", async () => {
  const a = app();
  a.run("saveState()");
  assert.equal(a.toast.hidden, true);
  a.flush();
  assert.equal(a.toast.hidden, true);
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.hidden, true);
});

await test("Un movimiento durante un guardado automático activa el aviso", async () => {
  const a = app();
  a.run("saveState()");
  a.flush();
  a.context.state.meta.changed = 1;
  a.run("saveState({notify:true})");
  assert.equal(a.toast.textContent, "Guardando…");
  a.flush();
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardando…");
  a.operations[1].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
  a.context.state.meta.changed = 2;
  a.run("saveState()");
  a.flush();
  a.operations[2].resolve();
  await settle();
  a.run('toast("Otra acción")');
  assert.equal(a.toast.textContent, "Otra acción");
});

await test("Guardado espera la confirmación y sustituye los avisos prematuros", async () => {
  const a = app();
  a.run('saveState({notify:true});toast("Movimiento guardado");');
  assert.equal(a.toast.textContent, "Guardando…");
  a.flush();
  assert.equal(a.toast.textContent, "Guardando…");
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
  assert.ok([...a.timers.values()].some(t => t.delay === 2200));
});

await test("Dos confirmaciones en orden inverso no adelantan Guardado", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.context.state.meta.changed = 1;
  a.run("saveState({notify:true})");
  a.flush();
  a.operations[1].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardando…");
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("Una confirmación con cambios aún por enviar sigue mostrando Guardando", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.context.state.meta.changed = 2;
  a.run("saveState({notify:true})");
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardando…");
  a.flush();
  a.operations[1].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("Sin conexión el aviso persiste y vuelve a Guardando al reconectar", async () => {
  const a = app();
  a.context.navigator.onLine = false;
  a.run("saveState({notify:true})");
  a.flush();
  assert.equal(a.toast.textContent, "Pendiente de conexión");
  assert.ok(![...a.timers.values()].some(t => t.delay === 2200));
  a.context.navigator.onLine = true;
  a.handlers.get("online")();
  assert.equal(a.toast.textContent, "Guardando…");
  a.context.navigator.onLine = false;
  a.handlers.get("offline")();
  assert.equal(a.toast.textContent, "Pendiente de conexión");
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("Un error se muestra y el siguiente guardado puede recuperarse", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.operations[0].reject({ code: "permission-denied" });
  await settle();
  assert.equal(a.toast.textContent, "Error al guardar");
  assert.equal(a.alerts.length, 1);
  a.run("saveState({notify:true})");
  a.flush();
  a.operations[1].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("El fallo de un envío antiguo no permite un éxito engañoso", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.context.state.meta.changed = 3;
  a.run("saveState({notify:true})");
  a.flush();
  a.operations[0].reject({ code: "unavailable" });
  await settle();
  a.operations[1].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Error al guardar");
  a.run("saveState({notify:true})");
  a.flush();
  assert.ok(a.operations[2].writes.length > 0);
  a.operations[2].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("El formato antiguo también espera la confirmación", async () => {
  const a = app();
  a.run("legacyWrites=true;saveState({notify:true})");
  a.flush();
  assert.equal(a.toast.textContent, "Guardando…");
  a.operations[0].resolve();
  await settle();
  assert.equal(a.toast.textContent, "Guardado");
});

await test("Sin cambios reales no queda bloqueado en Guardando", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.operations[0].resolve();
  await settle();
  a.run("saveState({notify:true})");
  a.flush();
  assert.equal(a.operations.length, 1);
  assert.equal(a.toast.textContent, "Guardado");
});

await test("La respuesta de otra sesión no muestra mensajes ni errores", async () => {
  const a = app();
  a.run("saveState({notify:true})");
  a.flush();
  a.run('pendingRemoteSaves.clear();userDocRef={id:"other"};');
  a.operations[0].reject({ code: "permission-denied" });
  await settle();
  assert.equal(a.alerts.length, 0);
  assert.equal(a.toast.textContent, "Guardando…");
});

console.log(`${checks} comprobaciones correctas.`);
