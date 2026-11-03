#!/usr/bin/env node
// Envía los avisos push de Mis Finanzas. Se ejecuta desde GitHub Actions (o a mano) con una cuenta de servicio de
// Firebase y las claves VAPID en variables de entorno. No guarda nada en el repositorio.
//
// Uso normal:
//   FIREBASE_SERVICE_ACCOUNT='{...}' VAPID_PRIVATE_KEY='...' node scripts/send-notifications.mjs
//
// Prueba local sin enviar nada ni tocar Firestore:
//   node scripts/send-notifications.mjs --dry-run --fixture scripts/fixtures/notifications.json
//
// Variables:
//   FIREBASE_SERVICE_ACCOUNT  JSON de la cuenta de servicio (o su base64).
//   VAPID_PRIVATE_KEY         Clave privada VAPID (secreto de GitHub).
//   VAPID_PUBLIC_KEY          Opcional: si falta, se usa la de push-config.js.
//   VAPID_SUBJECT             Contacto del emisor: mailto:... o https://... (opcional).
//   DRY_RUN=1                 Equivale a --dry-run.
//   FORCE_RUN=1               Ignora la puerta de las 10:00 de Madrid (para pruebas manuales).

import fs from "node:fs";
import admin from "firebase-admin";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY as CONFIG_VAPID_PUBLIC_KEY } from "../push-config.js";
import {
  alreadySent,
  buildNotifications,
  hourInZone,
  isSubscriptionGone,
  isoDateInZone,
  planNotifications
} from "./notify-lib.mjs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || process.env.DRY_RUN === "1";
const force = args.includes("--force") || process.env.FORCE_RUN === "1";
const fixtureIndex = args.indexOf("--fixture");
const fixturePath = fixtureIndex >= 0 ? args[fixtureIndex + 1] : "";
const today = isoDateInZone();
const madridHour = hourInZone();
const defaultSubject = "https://carloscr99.github.io/finanzas/";

function readEnv(name, required = true) {
  const value = String(process.env[name] || "").trim();
  if (!value && required) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function parseServiceAccount(raw) {
  if (!raw) throw new Error("Falta FIREBASE_SERVICE_ACCOUNT");
  const text = raw.trim();
  if (text.startsWith("{")) return JSON.parse(text);
  return JSON.parse(Buffer.from(text, "base64").toString("utf8"));
}

function subscriptionData(doc) {
  return typeof doc.data === "function" ? doc.data() : (doc.data || {});
}

function subscriptionId(doc) {
  return doc.id || doc.deviceId || "dispositivo";
}

function publicSubscription(doc) {
  const data = subscriptionData(doc);
  return { endpoint: data.endpoint, keys: data.keys };
}

function messagePayload(message) {
  return JSON.stringify({
    title: message.title,
    body: message.body,
    tag: message.tag,
    url: message.url,
    kind: message.kind
  });
}

async function loadFixture(path) {
  const fixture = JSON.parse(fs.readFileSync(path, "utf8"));
  return (fixture.users || []).map(user => ({
    uid: user.uid || "usuario-de-prueba",
    main: user.main || {},
    movements: user.movements || [],
    date: fixture.today || today,
    subscriptions: (user.subscriptions || []).map(subscription => ({
      id: subscription.id || "dispositivo-de-prueba",
      data: subscription.data || {},
      ref: null
    }))
  }));
}

async function loadFromFirestore() {
  const serviceAccount = parseServiceAccount(readEnv("FIREBASE_SERVICE_ACCOUNT"));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();
  const usersSnap = await db.collection("users").get();
  const currentYear = today.slice(0, 4);
  const users = [];
  for (const userDoc of usersSnap.docs) {
    const subscriptionsSnap = await userDoc.ref.collection("push").get();
    // Los movimientos viven en users/{uid}/years/{yyyy}. Solo hace falta el año en curso para ver las aportaciones
    // de hoy con participaciones estimadas. Si el documento principal aún trae movimientos (formato antiguo), se
    // añaden los que falten, igual que hace la app.
    const yearSnap = await userDoc.ref.collection("years").doc(currentYear).get();
    const mainData = userDoc.data() || {};
    // En el SDK de administración `exists` es una propiedad booleana, no una función (a diferencia del SDK web modular).
    const yearMovements = yearSnap.exists && Array.isArray(yearSnap.data().movements) ? yearSnap.data().movements : [];
    const movements = [...yearMovements];
    const seen = new Set(yearMovements.map(movement => movement?.id).filter(Boolean));
    for (const movement of Array.isArray(mainData.movements) ? mainData.movements : []) {
      if (movement?.id && seen.has(movement.id)) continue;
      movements.push(movement);
    }
    users.push({
      uid: userDoc.id,
      main: mainData,
      movements,
      date: today,
      subscriptions: subscriptionsSnap.docs.map(subscriptionDoc => ({
        id: subscriptionDoc.id,
        data: subscriptionDoc.data() || {},
        ref: subscriptionDoc.ref
      }))
    });
  }
  return users;
}

async function main() {
  if (dryRun && !fixturePath) throw new Error("--dry-run necesita --fixture para no tocar Firestore");
  if (!dryRun && !force && madridHour < 10) {
    console.log(`Aún no son las 10:00 en Madrid (${String(madridHour).padStart(2, "0")}:00). Se omite esta pasada.`);
    return;
  }
  const vapidSubject = readEnv("VAPID_SUBJECT", false) || defaultSubject;
  if (!dryRun) {
    webpush.setVapidDetails(
      vapidSubject,
      readEnv("VAPID_PUBLIC_KEY", false) || CONFIG_VAPID_PUBLIC_KEY,
      readEnv("VAPID_PRIVATE_KEY")
    );
  }

  const users = fixturePath ? await loadFixture(fixturePath) : await loadFromFirestore();
  const result = [];
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let removed = 0;
  let planned = 0;

  for (const user of users) {
    const devices = [];
    for (const subscription of user.subscriptions) {
      const prefs = subscription.data.prefs || {};
      const plan = planNotifications({
        recurring: user.main.recurring || [],
        assets: user.main.assets || [],
        categories: user.main.categories || [],
        movements: user.movements || [],
        today: user.date || today,
        prefs
      });
      const messages = buildNotifications(plan);
      planned += messages.length;
      const toSend = messages.filter(message => !alreadySent(subscription.data, message.kind, user.date || today));
      skipped += messages.length - toSend.length;

      const deviceResult = { id: subscription.id, messages: [], skipped: messages.length - toSend.length };
      for (const message of toSend) {
        deviceResult.messages.push({ kind: message.kind, title: message.title, body: message.body });
        if (dryRun) continue;
        try {
          await webpush.sendNotification(publicSubscription(subscription), messagePayload(message), {
            TTL: 24 * 60 * 60,
            urgency: "normal"
          });
          const lastSent = { ...(subscription.data.lastSent || {}), [message.kind]: user.date || today };
          await subscription.ref.set({
            lastSent,
            lastSentAt: admin.firestore.FieldValue.serverTimestamp()
          }, { merge: true });
          subscription.data.lastSent = lastSent;
          sent++;
        } catch (error) {
          if (isSubscriptionGone(error)) {
            await subscription.ref.delete().catch(() => null);
            removed++;
            deviceResult.messages[deviceResult.messages.length - 1].removed = true;
          } else {
            failed++;
            console.error(`No se pudo enviar a ${user.uid}/${subscription.id}: ${error?.statusCode || ""} ${error?.message || error}`);
          }
        }
      }
      devices.push(deviceResult);
    }
    result.push({ uid: user.uid, devices });
  }

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, today, users: result }, null, 2));
  } else {
    const devices = users.reduce((total, user) => total + user.subscriptions.length, 0);
    console.log(`Usuarios: ${users.length}, dispositivos: ${devices}, avisos previstos: ${planned}.`);
    console.log(`Avisos: ${sent} enviados, ${skipped} ya enviados, ${removed} suscripciones caducadas, ${failed} fallos.`);
  }
  if (failed) process.exitCode = 1;
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
