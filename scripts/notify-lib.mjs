// Lógica compartida (sin dependencias) para decidir qué avisos push toca enviar.
// La usa el emisor de scripts/send-notifications.mjs y las pruebas de scripts/test-notifications.mjs.
// Reglas:
//  - Gastos recurrentes: aviso el día anterior al vencimiento (nextDate = mañana).
//  - Inversiones recurrentes: aviso el mismo día de la aportación, solo si se puede relacionar con un activo
//    con cotización (fondo con ISIN o Bitcoin), para recordar revisar las participaciones.

export const DEFAULT_TIME_ZONE = "Europe/Madrid";

const TEXT_STOP = new Set([
  "fund", "fondo", "fondos", "index", "class", "clase", "eur", "usd", "acc", "dist",
  "aportacion", "aportaciones", "inversion", "etf", "the", "and", "los", "las", "del", "con"
]);

export function normalizeText(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function textTokens(value) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/)
    .filter(token => token.length >= 3 && !TEXT_STOP.has(token));
}

// Fecha ISO (YYYY-MM-DD) en una zona horaria. El cron de GitHub va en UTC, pero los vencimientos son de Madrid.
export function isoDateInZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function hourInZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(date));
}

export function addDaysISO(iso, days) {
  const [year, month, day] = String(iso).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Mismo criterio que assetMarketConfig() de la app: ISIN o Bitcoin.
export function isMarketAsset(asset) {
  if (String(asset?.isin || "").trim()) return true;
  const name = normalizeText(asset?.previousNames?.[0] ?? asset?.name);
  const type = normalizeText(asset?.type);
  return name.includes("bitcoin") || name === "btc" || (type === "cripto" && name.includes("btc"));
}

export function marketAssetForTexts(texts, assets = []) {
  const haystack = normalizeText(texts.filter(Boolean).join(" "));
  if (!haystack) return null;
  const hayTokens = new Set(textTokens(haystack));
  let best = null;
  let bestScore = 0;
  for (const asset of assets) {
    if (!isMarketAsset(asset)) continue;
    const isin = normalizeText(asset?.isin).trim();
    if (isin && haystack.includes(isin)) return asset;
    const score = [asset?.name, ...(asset?.previousNames || [])].reduce((best, name) => {
      const tokens = textTokens(name);
      const common = tokens.filter(token => hayTokens.has(token)).length;
      return common >= Math.min(2, tokens.length) ? Math.max(best, common) : best;
    }, 0);
    if (score > bestScore) {
      best = asset;
      bestScore = score;
    }
  }
  return best;
}

export function formatEuro(value) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

/**
 * Devuelve los avisos que corresponden a un usuario para una fecha.
 * @param {object} options
 * @param {Array} options.recurring Recurrentes del documento principal de Firestore.
 * @param {Array} options.assets Activos del documento principal.
 * @param {Array} options.categories Categorías del documento principal.
 * @param {string} options.today Fecha de hoy en la zona del usuario (YYYY-MM-DD).
 * @param {{expenses?:boolean,investments?:boolean}} [options.prefs]
 */
export function planNotifications({ recurring = [], assets = [], categories = [], movements = [], today, prefs = {} } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ""))) throw new Error("planNotifications necesita una fecha ISO válida");
  const wantExpenses = prefs.expenses !== false;
  const wantInvestments = prefs.investments !== false;
  const categoriesById = new Map((categories || []).map(category => [category.id, category]));
  const expenseDate = addDaysISO(today, 1);
  const expenses = [];
  const investments = [];
  const plannedRecurring = new Set();

  for (const recurringItem of recurring || []) {
    if (!recurringItem || recurringItem.active === false || !recurringItem.nextDate) continue;
    const category = categoriesById.get(recurringItem.categoryId)?.name || "";
    const description = String(recurringItem.description || category || "Pago").trim();
    const amount = Number(recurringItem.amount);

    if (wantExpenses && recurringItem.type === "Gasto" && recurringItem.nextDate === expenseDate && amount > 0) {
      expenses.push({
        id: recurringItem.id,
        description,
        category,
        amount,
        date: recurringItem.nextDate,
        frequency: recurringItem.frequency || "monthly"
      });
    }

    if (wantInvestments && recurringItem.type === "Inversión" && recurringItem.nextDate === today) {
      const linkedAsset = recurringItem.assetId
        ? (assets || []).find(asset => asset.id === recurringItem.assetId)
        : marketAssetForTexts([category, description], assets);
      if (!linkedAsset || !isMarketAsset(linkedAsset)) continue;
      investments.push({
        id: recurringItem.id,
        description,
        category,
        amount,
        date: recurringItem.nextDate,
        asset: linkedAsset.name || "tu fondo",
        isin: linkedAsset.isin || "",
        frequency: recurringItem.frequency || "monthly",
        source: "recurring"
      });
      plannedRecurring.add(recurringItem.id);
    }
  }

  // Si la app ya generó la aportación de hoy (por ejemplo, al abrirla por la mañana), el recurrente ya avanzó a la
  // próxima fecha. En ese caso el aviso sale del movimiento, para recordar revisar las participaciones estimadas.
  if (wantInvestments) {
    for (const movement of movements || []) {
      if (!movement || movement.type !== "Inversión" || movement.date !== today || !movement.unitsEstimated) continue;
      // Si el recurrente aún no se ha generado, el aviso ya sale de arriba: no se repite por el movimiento.
      if (movement.recurringId && plannedRecurring.has(movement.recurringId)) continue;
      const category = categoriesById.get(movement.categoryId)?.name || "";
      const linkedAsset = movement.assetId
        ? (assets || []).find(asset => asset.id === movement.assetId)
        : marketAssetForTexts([category, movement.description], assets);
      if (!linkedAsset || !isMarketAsset(linkedAsset)) continue;
      investments.push({
        id: movement.id,
        description: String(movement.description || category || "Aportación").trim(),
        category,
        amount: Number(movement.amount),
        date: movement.date,
        asset: linkedAsset.name || "tu fondo",
        isin: linkedAsset.isin || "",
        frequency: "movement",
        source: "movement"
      });
    }
  }

  return { expenses, investments };
}

export function buildExpenseNotification(items) {
  if (!items?.length) return null;
  const shown = items.slice(0, 4);
  const lines = shown.map(item => `${item.description} · ${formatEuro(item.amount)}`);
  if (items.length > shown.length) lines.push(`y ${items.length - shown.length} más`);
  return {
    kind: "expenses",
    title: items.length === 1 ? "Mañana vence un pago" : `Mañana vencen ${items.length} pagos`,
    body: lines.join("\n"),
    tag: `finanzas-gastos-${items[0].date}`,
    url: "./?page=recurring",
    items
  };
}

export function buildInvestmentNotification(items) {
  if (!items?.length) return null;
  const shown = items.slice(0, 4);
  const lines = shown.map(item => `${item.description} · ${formatEuro(item.amount)}`);
  if (items.length > shown.length) lines.push(`y ${items.length - shown.length} más`);
  lines.push("Comprueba que las participaciones coinciden con tu bróker.");
  return {
    kind: "investments",
    title: items.length === 1 ? "Revisa las participaciones" : "Aportaciones de hoy",
    body: lines.join("\n"),
    tag: `finanzas-inversiones-${items[0].date}`,
    url: "./?page=assets",
    items
  };
}

export function buildNotifications(plan) {
  return [
    buildExpenseNotification(plan?.expenses),
    buildInvestmentNotification(plan?.investments)
  ].filter(Boolean);
}

// Cada dispositivo guarda en su documento push la última fecha en la que recibió cada tipo de aviso.
export function alreadySent(subscription, kind, today) {
  return subscription?.lastSent?.[kind] === today;
}

export function isSubscriptionGone(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}
