// Pruebas de la lógica de avisos, sin enviar notificaciones ni tocar Firestore.
// Se ejecutan con: npm test (o node scripts/test-notifications.mjs)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addDaysISO,
  alreadySent,
  buildExpenseNotification,
  buildInvestmentNotification,
  hourInZone,
  isMarketAsset,
  isSubscriptionGone,
  isoDateInZone,
  marketAssetForTexts,
  planNotifications
} from "./notify-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "notifications.json");
let checks = 0;

function test(name, fn) {
  fn();
  checks++;
  console.log(`ok ${checks} - ${name}`);
}

function fixture() {
  return JSON.parse(readFileSync(fixturePath, "utf8"));
}

test("suma días cruzando meses, años y bisiestos", () => {
  assert.equal(addDaysISO("2026-11-30", 1), "2026-12-01");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2024-02-28", 1), "2024-02-29");
  assert.equal(addDaysISO("2026-11-03", -1), "2026-11-02");
});

test("calcula el día de Madrid aunque el servidor esté en UTC", () => {
  assert.equal(isoDateInZone(new Date("2026-11-03T23:30:00Z")), "2026-11-04");
  assert.equal(isoDateInZone(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
  assert.equal(isoDateInZone(new Date("2026-11-03T10:00:00Z")), "2026-11-03");
});

test("calcula la hora de Madrid para no enviar antes de las 10:00", () => {
  // Invierno (UTC+1) y verano (UTC+2): la misma hora UTC cambia de hora local.
  assert.equal(hourInZone(new Date("2026-11-03T09:00:00Z")), 10);
  assert.equal(hourInZone(new Date("2026-11-03T08:00:00Z")), 9);
  assert.equal(hourInZone(new Date("2026-07-01T08:00:00Z")), 10);
  assert.equal(hourInZone(new Date("2026-07-01T07:00:00Z")), 9);
});

test("reconoce fondos con ISIN y Bitcoin, pero no cuentas de ahorro", () => {
  assert.equal(isMarketAsset({ name: "Amundi Index MSCI World", isin: "LU0996182563" }), true);
  assert.equal(isMarketAsset({ name: "Bitcoin", type: "Cripto" }), true);
  assert.equal(isMarketAsset({ name: "RenaultBank", type: "Cuenta" }), false);
});

test("relaciona el recurrente con el activo por nombre o ISIN", () => {
  const assets = fixture().users[0].main.assets;
  assert.equal(marketAssetForTexts(["Fondos", "Compra Amundi MSCI World"], assets)?.id, "asset-world");
  assert.equal(marketAssetForTexts(["Cripto", "Compra Bitcoin"], assets)?.id, "asset-btc");
  assert.equal(marketAssetForTexts(["RenaultBank", "Aportación RenaultBank"], assets), null);
});

test("planifica gastos para mañana e inversiones para hoy", () => {
  const { main } = fixture().users[0];
  const plan = planNotifications({ ...main, today: "2026-11-03" });
  assert.equal(plan.expenses.length, 2, "dos gastos vencen mañana");
  assert.equal(plan.investments.length, 2, "dos inversiones son hoy y tienen activo cotizable");
  assert.deepEqual(plan.expenses.map(item => item.description), ["Alquiler", "Teléfono"]);
  assert.deepEqual(plan.investments.map(item => item.description), ["Compra Amundi MSCI World", "Compra Bitcoin"]);
  assert.equal(plan.expenses[0].date, "2026-11-04");
  assert.equal(plan.investments[0].date, "2026-11-03");
});

test("no avisa de gastos de hoy, pausados, importe cero ni inversiones sin activo", () => {
  const { main } = fixture().users[0];
  const plan = planNotifications({ ...main, today: "2026-11-03" });
  const ids = [...plan.expenses, ...plan.investments].map(item => item.id);
  assert.ok(!ids.includes("r-food"), "el gasto de hoy no se avisa el día antes");
  assert.ok(!ids.includes("r-paused"), "un recurrente pausado no avisa");
  assert.ok(!ids.includes("r-zero"), "un importe cero no avisa");
  assert.ok(!ids.includes("r-savings"), "una cuenta de ahorro no pide participaciones");
  assert.ok(!ids.includes("r-fund-tomorrow"), "la inversión de mañana no se avisa hoy");
});

test("avisa de una inversión ya generada con participaciones estimadas", () => {
  const user = fixture().users.find(item => item.uid === "usuario-inversion-generada");
  const plan = planNotifications({ ...user.main, movements: user.movements, today: "2026-11-03" });
  assert.equal(plan.investments.length, 1);
  assert.equal(plan.investments[0].source, "movement");
  assert.equal(plan.investments[0].asset, "Amundi Index MSCI World AE-C");
  assert.equal(plan.investments[0].amount, 300);
});

test("no repite la inversión si el recurrente y el movimiento son el mismo", () => {
  const plan = planNotifications({
    recurring: [{ id: "r1", type: "Inversión", description: "Amundi Index MSCI World", amount: 300, nextDate: "2026-11-03", active: true }],
    assets: [{ id: "a1", name: "Amundi Index MSCI World AE-C", isin: "LU0996182563" }],
    movements: [{ id: "m1", type: "Inversión", date: "2026-11-03", description: "Amundi Index MSCI World", amount: 300, assetId: "a1", unitsEstimated: true, recurringId: "r1" }],
    today: "2026-11-03"
  });
  assert.equal(plan.investments.length, 1);
  assert.equal(plan.investments[0].source, "recurring");
});

test("respeta las preferencias de cada dispositivo", () => {
  const { main } = fixture().users[0];
  const soloGastos = planNotifications({ ...main, today: "2026-11-03", prefs: { expenses: true, investments: false } });
  assert.equal(soloGastos.expenses.length, 2);
  assert.equal(soloGastos.investments.length, 0);

  const soloInversiones = planNotifications({ ...main, today: "2026-11-03", prefs: { expenses: false, investments: true } });
  assert.equal(soloInversiones.expenses.length, 0);
  assert.equal(soloInversiones.investments.length, 2);
});

test("construye mensajes claros, con importe y página de destino", () => {
  const { main } = fixture().users[0];
  const plan = planNotifications({ ...main, today: "2026-11-03" });
  const expense = buildExpenseNotification(plan.expenses);
  const investment = buildInvestmentNotification(plan.investments);
  assert.match(expense.title, /Mañana vencen 2 pagos/);
  assert.match(expense.body, /Alquiler · 900,00/);
  assert.match(expense.body, /Teléfono · 25,50/);
  assert.equal(expense.url, "./?page=recurring");
  assert.match(investment.title, /Aportaciones de hoy/);
  assert.match(investment.body, /Compra Amundi MSCI World · 300,00/);
  assert.match(investment.body, /participaciones coinciden con tu bróker/);
  assert.equal(investment.url, "./?page=assets");
});

test("no repite el mismo aviso el mismo día", () => {
  const subscription = { lastSent: { expenses: "2026-11-03" } };
  assert.equal(alreadySent(subscription, "expenses", "2026-11-03"), true);
  assert.equal(alreadySent(subscription, "expenses", "2026-11-04"), false);
  assert.equal(alreadySent(subscription, "investments", "2026-11-03"), false);
});

test("detecta suscripciones caducadas para borrarlas", () => {
  assert.equal(isSubscriptionGone({ statusCode: 404 }), true);
  assert.equal(isSubscriptionGone({ statusCode: 410 }), true);
  assert.equal(isSubscriptionGone({ statusCode: 500 }), false);
  assert.equal(isSubscriptionGone(new Error("sin conexión")), false);
});

test("el emisor en seco agrupa por usuario, dispositivo y preferencias", () => {
  const run = spawnSync(process.execPath, [join(here, "send-notifications.mjs"), "--dry-run", "--fixture", fixturePath], {
    encoding: "utf8"
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.dryRun, true);
  assert.match(result.today, /^\d{4}-\d{2}-\d{2}$/);

  const user = result.users.find(item => item.uid === "usuario-prueba");
  const completo = user.devices.find(item => item.id === "dispositivo-completo");
  const soloGastos = user.devices.find(item => item.id === "dispositivo-solo-gastos");
  assert.deepEqual(completo.messages.map(item => item.kind), ["expenses", "investments"]);
  assert.deepEqual(soloGastos.messages.map(item => item.kind), ["expenses"]);

  const yaAvisado = result.users.find(item => item.uid === "usuario-ya-avisado");
  assert.equal(yaAvisado.devices[0].messages.length, 0);
  assert.equal(yaAvisado.devices[0].skipped, 1);

  const generada = result.users.find(item => item.uid === "usuario-inversion-generada");
  assert.deepEqual(generada.devices[0].messages.map(item => item.kind), ["investments"]);
});

console.log(`\n${checks} comprobaciones correctas.`);
