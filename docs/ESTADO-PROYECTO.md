<!-- Copia técnica del documento de traspaso. La versión completa, con datos personales, está fuera del repositorio (Descargas de Carlos). Este repositorio es público. -->

# Mis Finanzas — resumen del proyecto (estado al cierre del 14/10/2026, último commit `776c792`)

Documento de traspaso: qué es la aplicación, cómo está hecha, dónde está cada cosa, cómo se trabaja con ella y qué queda pendiente. Sustituye a la versión del 13/10/2026.

En Ajustes de la app se ve el tamaño actual de los datos frente al límite de 1 MiB de Firestore (ver README, sección "Límites de Firebase"). Una copia técnica de este documento, sin datos personales, está en el repositorio en `docs/ESTADO-PROYECTO.md`.

---

## 1. Objetivo de la aplicación

Aplicación web personal de control de finanzas: ingresos, gastos, ahorro e inversiones, con dashboard, movimientos, categorías, recurrentes y patrimonio (cuenta corriente, cuentas de ahorro, depósitos, seguro de ahorro y fondos). Sustituye a los Excel anuales (`Gastos 2024.xlsx`, `Gastos 2025.xlsx`, `Gastos 2026.xlsx`) y al HTML original `mis_finanzas_web_v17.html`.

Requisitos fijados al principio y que se mantienen:

- Accesible online desde cualquier dispositivo, sin pagar alojamiento → **GitHub Pages**.
- Login con cuenta de Google y que cada usuario vea solo lo suyo → **Firebase Authentication (Google) + Cloud Firestore** con reglas de seguridad y colección `allowlist`.
- **JavaScript puro con módulos ES, sin build. Un solo `index.html`.** No se usa React ni ningún framework: el PC no tiene Node y la app (unas 1.650 líneas) no lo necesita.

---

## 2. Dónde está todo

| Qué | Dónde |
|---|---|
| Web publicada | https://carloscr99.github.io/finanzas/ |
| Repositorio (público) | https://github.com/carloscr99/finanzas |
| Copia local del repositorio | `C:\Users\Carlos\repos\finanzas` |
| Proyecto Firebase | `finanzas-3effc` → https://console.firebase.google.com |
| Cuenta GitHub | `carloscr99` (GitHub CLI `gh` autenticado en este PC) |
| Fichero de importación original (NO está en git) | `mis-finanzas-importacion-excel.json` en la copia local (ya importado el 13/10; los datos vivos están en Firestore) |
| Excel de origen | `C:\Users\Carlos\Downloads\Gastos 2024.xlsx`, `Gastos 2025.xlsx`, `Gastos 2026.xlsx` |
| Órdenes de MyInvestor (CSV) | `C:\Users\Carlos\Downloads\Órdenes 1227294.csv` |

### Ficheros del repositorio

| Fichero | Para qué |
|---|---|
| `index.html` | Toda la aplicación (HTML, CSS, JS). ~1.650 líneas. |
| `sw.js` | Service worker: cachea la app, iconos y librerías de CDN (app-shell). Red primero para `index.html`, caché primero para CDN. Constante `CACHE` (hoy `finanzas-v2`): subirla al cambiar librerías. |
| `firebase-config.js` | Identificadores del proyecto Firebase (no son secretos). |
| `firestore.rules` | Reglas de seguridad (copia versionada; las vigentes están en la consola). |
| `prices.json` | Cotizaciones por ISIN (y `BTC`): `price`, `priceDate`, `source`, `updatedAt`. Lo reescribe el robot. |
| `scripts/update-prices.mjs` | Script Node que lee el NAV de cada fondo en el Financial Times y BTC en CoinGecko. |
| `.github/workflows/update-prices.yml` | GitHub Action, dos pasadas al día (06:00 y 18:00 UTC) y a mano; tras un commit de precios llama al workflow de publicación. |
| `.github/workflows/deploy-pages.yml` | Publica la web en Pages (modo "GitHub Actions") en cada push a `main`, a mano o desde el workflow de cotizaciones. |
| `manifest.webmanifest`, `icon-192.png`, `icon-512.png` | Instalación como app (id, standalone, portrait, categoría finance). |
| `README.md` | Guía completa: Firebase, Pages, cotizaciones, móvil, Patrimonio, cambio en bloque, Dashboard, recurrentes de fondos. |
| `.nojekyll`, `.gitignore` | Pages sin Jekyll; ignora `.claude/` y `mis-finanzas-*.json`. |

### Carpeta `.claude/` (local, ignorada por git)

| Fichero | Para qué |
|---|---|
| `serve.ps1` + `launch.json` | Servidor estático PowerShell en http://localhost:8000 para el navegador integrado de Claude. |
| `test.html` | Copia de `index.html` con Firebase sustituido por un simulador que carga el JSON de importación. Permite probar sin login. Se regenera a partir de `index.html` (ver §7). |
| `design-system.md` | Salida del buscador de la skill ui-ux-pro-max para este proyecto. |
| `dump-xlsx.ps1`, `parse-months.ps1`, `build-import.ps1`, `xlsx/` | Herramientas de la importación de los Excel (ya hecha). |

### Herramientas en el PC (instaladas el 14/10)

- **Python 3.12** (winget, perfil de usuario): `C:\Users\Carlos\AppData\Local\Programs\Python\Python312\python.exe`.
- **Skill ui-ux-pro-max** copiada en `C:\Users\Carlos\.claude\skills\ui-ux-pro-max\` (SKILL.md, data, references, scripts). Buscador: `python scripts\search.py "<consulta>" --domain ux|icons|color|typography|style` o `--design-system -p "Mis Finanzas"`.
- Siguen instalados Git y GitHub CLI. No hay Node.

---

## 3. Arquitectura y funcionamiento

```
GitHub Pages (estático)                     Firebase (plan gratuito Spark)
┌──────────────────────────┐                ┌──────────────────────────────┐
│ index.html + sw.js       │  popup Google  │ Authentication (Google)      │
│ firebase-config.js       │◄──────────────►│                              │
│ prices.json              │  SDK web 12.19 │ Firestore                    │
│ (robot 2 veces al día)   │◄──────────────►│   users/{uid}  ← estado sin  │
└──────────────────────────┘                │        movimientos (+meta)   │
                                            │   users/{uid}/years/{yyyy}   │
                                            │        ← movimientos del año │
                                            │   allowlist/{email}          │
                                            └──────────────────────────────┘
```

- **Datos** (desde el 15/10/2026): documento principal `users/{uid}` con `{categories, recurring, assets, transfers, budgets, meta, schema:2}` (~7 KB) y un documento por año `users/{uid}/years/{yyyy}` con `{movements:[…]}` (~90 KB/año). Límite 1 MiB por documento. `meta.netWorthHistory` guarda hasta 730 puntos diarios de patrimonio. Al abrir se cargan todos y se juntan en memoria (`assembleState`); la app siempre trabaja con la lista completa.
- **Guardado**: 300 ms después de cada cambio, `writeBatch` atómico con solo los documentos cuyo JSON ha cambiado respecto a lo último leído o escrito (`written`); un año sin movimientos se borra. `onSnapshot` del principal y de la colección de años sincroniza entre dispositivos (se comparan firmas independientes del orden). Caché persistente de Firestore → funciona sin conexión.
- **Migración**: si el principal aún trae `movements` (formato anterior al 15/10/2026), se reparten por años en el primer guardado. Si las reglas no permiten leer los años (`permission-denied`), `legacyWrites=true` y se guarda todo en el principal como antes, con aviso en consola: publicar `firestore.rules` en la consola de Firebase.
- **Sesión**: Firebase la guarda en IndexedDB. Al abrir se muestra "Comprobando sesión…" (sin botón) hasta que se restaura. Solo se cierra sesión si la cuenta no está en `allowlist`; un fallo de red muestra "Reintentar" y conserva la sesión (veredicto cacheado en `localStorage` como `allow:<uid>`). El login es solo por ventana emergente: el flujo de redirección no funciona en github.io porque `authDomain` es otro dominio.
- **Librerías CDN (versiones fijadas)**: Firebase 12.19.0 (gstatic), Chart.js 4.5.1 y SweetAlert2 11.14.5 (cdnjs), Inter (Google Fonts, con fallback al sistema).
- **Temas**: claro por defecto y oscuro automático con `prefers-color-scheme`; todos los colores son tokens de `:root`, y Chart.js los lee con `tok()`.

### Secciones de la web

- **Dashboard**: periodo (mes / año / todo), tarjetas (ingresos, gastos, inversiones, liquidez restante, rentabilidad de los fondos, patrimonio actual con nota de la cuenta corriente, ahorro acumulado), gráficos (evolución mensual, ahorro acumulado, por categoría, distribución del patrimonio, rentabilidad anualizada por activo) y tabla resumen por categoría. Clic en barras y filas lleva a Movimientos filtrado.
- **Movimientos**: alta (formulario en escritorio, hoja rápida con "+" en móvil), búsqueda y filtros, tabla o lista por días, y **cambio de tipo y categoría en bloque** de los movimientos visibles (no toca saldos del patrimonio).
- **Presupuesto** (sección propia, no en el Dashboard): navegador de meses, tarjetas (presupuestado, gastado, disponible, ritmo diario), barras por categoría y tabla «Ajustar presupuestos» con propuesta calculada (fijo por recurrente / habitual: máx(media, mediana) de 12 meses / irregular: anual entre 12 / sin propuesta con poco histórico). Se guardan en `budgets`.
- **Categorías** (alta, baja y renombrar conservando el id), **Recurrentes** (se generan al abrir la web; pausar/borrar), **Ajustes** (cuenta, exportar/importar JSON, borrar todo, tamaño de los datos).
- **Patrimonio**: activos de tipo Cuenta, **Cuenta corriente**, Fondo, Cripto, Oro, Efectivo, Otro. Sincronizar cotizaciones lee `prices.json`. Panel **Traspaso entre cuentas** con historial y gráfico de **evolución del patrimonio** (todo el histórico).
- **Móvil**: barra inferior de 5 destinos (Inicio, Movimientos, +, Patrimonio, Más) con iconos SVG y píldora activa; página "Más" con cuenta, categorías, recurrentes, ajustes y cerrar sesión; hoja rápida con asa y cierre deslizando.

### Modelo de patrimonio (decidido el 14/10)

- **Patrimonio neto** = suma del valor de los activos (cuentas, depósitos, SIALP y fondos) − deudas (tipo de activo "Deuda": lo pendiente de pagar, se actualiza a mano o con un traspaso hacia la deuda).
- **Capital invertido, ganancia/pérdida y rentabilidad** solo miran los activos con cotización (fondos con ISIN y Bitcoin). Cuentas, depósitos y seguros cuentan en el total pero no en la ganancia.
- **Cuenta corriente** (solo puede haber una): valor = saldo de referencia + ingresos − gastos − inversiones registrados desde la fecha de referencia (campos `refBalance`, `refDate`, `refDayNet`). "Actualizar manualmente" fija el saldo real del banco como nueva referencia y muestra la diferencia con lo registrado.
- **Cuentas de ahorro**: un movimiento de Inversión cuya categoría coincide con el nombre de la cuenta (RenaultBank, Trade Republic, SIALP Santander…) suma su importe al saldo y al aportado de esa cuenta, también cuando lo genera un recurrente. Los movimientos históricos importados no están enlazados y no se enlazan al editarlos (su importe ya está en el saldo).
- **Traspasos** entre cuentas: restan en origen y suman en destino sin contar como ingreso, gasto ni inversión. Para el camino de vuelta (depósito que vence) o entre cuentas de ahorro.
- **Rentabilidad anualizada (XIRR)** por activo: en cuentas solo se calcula si las aportaciones registradas cuadran con el aportado; si no, muestra guion con explicación.
- **Recurrentes de fondos**: las participaciones se estiman con la última cotización (`unitsEstimated`), se marcan con "≈" y se recalculan al llegar la cotización del día de compra; se pueden corregir a mano.

### Cálculos clave

- Ahorro acumulado = ingresos − gastos de todo el histórico (las inversiones no se restan).
- Liquidez restante (por periodo) = ingresos − gastos − inversiones. La tarjeta "Liquidez acumulada" se añadió y se quitó el mismo día por confusa.

---

## 4. Cronología

### 13/10/2026
Conversión del HTML original a módulo ES con Firebase; instalación de Git y gh; repo y Pages; proyecto Firebase y reglas; importación de los 36 meses de Excel (1.370 movimientos, 40 categorías, 10 recurrentes, 3 fondos) cuadrada al céntimo; cotizaciones por ISIN con robot diario; dashboard con Chart.js; primera versión móvil. Commits `75f9724` → `755a44b`.

### 14/10/2026
1. **Rediseño móvil** con la skill ui-ux-pro-max (instalada junto con Python por petición de Carlos): tokens, Inter, sprite SVG sin emojis, barra inferior nueva, lista de movimientos, hoja rápida, página Más (`c8c40ce`). El buscador de la skill proponía Glassmorphism oscuro y fuentes Caveat/Quicksand; se eligió tema claro Minimal/Flat.
2. **Arranque sin parpadeo de login**, sin cerrar sesión por fallos de red, sin fallback a redirect; **service worker** y manifest ampliado (`c8c40ce`).
3. **Cron doble** del robot (06:00 y 18:00 UTC) y README (`e68413a`, `40ea54c`). El robot se ejecutó solo por primera vez a las 13:23 (hora de Madrid).
4. **Modo oscuro** automático (`716cc01`).
5. Rentabilidad anualizada solo con aportaciones completas (`0639830`); puntos de miles en todos los importes (`f118c50`); capital invertido y ganancia solo sobre fondos con ISIN (`d16aba7`).
6. **Cuenta corriente calculada, inversiones enlazadas a cuentas de ahorro y traspasos** (`394cea7`).
7. **Cambio de categoría en bloque** (`ad17856`): con ella se reclasificó en un minuto una cuota mensual que estaba como gasto y era ahorro (seguro de ahorro SIALP).
8. **SweetAlert2** en todos los diálogos (`c3ab4af`).
9. **Gráfico de evolución del patrimonio y participaciones estimadas** en recurrentes de fondos (`6288236`); la tarjeta "Liquidez acumulada" se quitó después por confusa.

### Datos cargados por Carlos en la web el 14/10
- Importación definitiva confirmada; activos de patrimonio, recurrentes y reclasificación del SIALP hechos por Carlos (detalle en el resumen privado, fuera del repositorio).

---

## 5. Importación de datos (hecha; referencia)

Las reglas de mapeo de las 36 hojas de Excel, las anomalías resueltas y el cuadre con la hoja "Gràfic" están en la versión anterior de este documento y en `.claude/xlsx/import-report.txt`. Resumen: 1.370 movimientos (ene-2024 a oct-2026), 40 categorías, 10 recurrentes desde noviembre de 2026, órdenes reales de MyInvestor de los tres fondos (XIRR por fondo funciona), fondos monetarios vendidos como "MyInvestor".

Clasificaciones dudosas que se pueden revisar con el cambio en bloque: "Mas i mas" (Ocio), "Llibre"/"Llibre Dani" (Otros gastos), "Movil mare + hub usb" 269,98 (Compras online), "Sprinter Raul" (Ropa).

---

## 6. Cotizaciones automáticas

- **Fuente fondos**: Financial Times `https://markets.ft.com/data/funds/tearsheet/summary?s=ISIN:EUR` (regex sobre `mod-ui-data-list__value`; fecha "as of"). **Bitcoin**: CoinGecko.
- **Horario**: cron `0 6 * * *` y `0 18 * * *` (08:00 y 20:00 en verano, hora de Madrid). GitHub ejecuta el cron "cuando puede": el 14/10 la pasada de las 08:00 llegó a las 13:23. Ejecución manual: pestaña Actions → "Actualizar cotizaciones" → Run workflow, o `gh workflow run update-prices.yml --repo carloscr99/finanzas`.
- **Las tres fechas de Patrimonio**: *sincronizadas* = cuándo el navegador descargó `prices.json`; *fichero GitHub* = última vez que el robot encontró un precio nuevo (`updatedAt`); *cotización más reciente* = fecha de valor liquidativo del fondo (uno o dos días atrás; la pasada de la tarde recoge el del día anterior). Bitcoin es en tiempo real.
- **Si falla una fuente**: conserva el precio anterior y lo anota en el registro.
- **Añadir un fondo**: activo con ISIN en Patrimonio + clave en `prices.json` (`price: 0`).

---

## 7. Cómo trabajar con el proyecto

### Publicar un cambio
En `C:\Users\Carlos\repos\finanzas`: `git pull` (el robot hace commits propios), editar, `git add -A`, `git commit -m "…"`, `git push`. El workflow "Publicar en GitHub Pages" la republica en 1-2 minutos (Pages está en modo GitHub Actions desde el 14/10/2026, porque el constructor clásico se colgaba). En la consola de Claude puede hacer falta recargar el PATH: `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`.

### Probar en local sin login
`powershell -NoProfile -ExecutionPolicy Bypass -File .claude\serve.ps1` y abrir http://localhost:8000/.claude/test.html (datos del JSON de importación; "guardar" no persiste). Claude lo hace con el navegador integrado (`preview_start`, configuración "finanzas").

**Regenerar `test.html` tras cambiar `index.html`**: copiar `index.html`, quitar las tres líneas `import … "https://www.gstatic.com/…"`, sustituir `import { firebaseConfig } from "./firebase-config.js";` por el bloque "SIMULADOR DE FIREBASE" (está en el propio `test.html`), quitar la línea `navigator.serviceWorker.register(…)` y cambiar las rutas `icon-192.png`, `manifest.webmanifest` y `./prices.json` por `../…`. El script que lo hace está en `.claude/regen_test.py` (ejecutar desde la raíz del repo: `python .claude/regen_test.py`). El simulador sirve el JSON de importación repartido por años; con `?legacy=1` lo sirve en el formato antiguo (prueba la migración) y con `?legacy=1&denied=1` simula además las reglas antiguas. Los guardados se ven en la consola del navegador como `batch simulado` / `setDoc simulado`.

La web real (`index.html` en http://localhost:8000/) también funciona en local con login, porque `localhost` está autorizado en Firebase.

### Dar acceso a otra persona
Firestore → colección `allowlist` → documento con ID = su Gmail en minúsculas, campo `enabled: true`.

### Diseño
Antes de tocar la interfaz, consultar la skill (`search.py … --domain ux|icons|color|typography`) y mantener los tokens de `:root` (claro y oscuro) y el sprite SVG de `index.html`. Nada de emojis como iconos.

---

## 8. Situación actual y pendientes

### Hecho y verificado (14/10)
- Todo lo de la cronología publicado y probado en el navegador integrado a 375 px y 1280 px, en claro y oscuro, con los datos reales de la copia local, sin errores de consola.
- Carlos ha cargado los datos de Patrimonio, el recurrente de Trade Republic, el SIALP como inversión, y ha probado la app instalada en Firefox Android e iPad.

### Pendiente
1. **Fechas marcadas** (detalle en el resumen privado): traspasos de cuentas de ahorro a la corriente para un pago grande y vencimiento de un depósito, en 2027.
2. **Día 4 de cada mes**: las compras de fondos se generan con participaciones estimadas; comprobar contra el extracto de MyInvestor y corregir si hace falta (editar el movimiento).
3. **Cuenta corriente**: cuando se mire el banco, "Actualizar manualmente" con el saldo real; la diferencia que muestre es dinero no registrado.
4. Revisar las clasificaciones dudosas de la importación (§5) con el cambio en bloque, si se quiere.
5. Tamaño de Firestore: resuelto el 15/10/2026 con un documento por año; ningún documento se acerca al límite. El histórico de patrimonio está limitado a 730 puntos (~50 KB en el principal).
6. Opcional: restringir la clave de Firebase por referrer `carloscr99.github.io/*` en Google Cloud Console → Credenciales.
7. Opcional: el recurrente de Revolut (50 €) sigue como Inversión; si se prefiere como provisión del seguro, cambiarlo a Gasto › Seguros.
8. Seguir vigilando que el cron del robot dispare las dos pasadas (ver Actions).
9. Limpieza de categorías (criterio: la categoría dice el motivo, no el canal de pago): renombrar "Bizum recibido" a "Reembolsos", repartir y borrar "Bizums" (gasto) y, opcionalmente, "Compras online". Revisar los presupuestos propuestos (sección Presupuesto → Ajustar presupuestos).
10. Ideas pendientes del análisis de competencia (14/10): objetivos de ahorro ligados a cuentas, importación del extracto del banco en CSV con reglas de categoría, comparativa año contra año y "mes típico", tasa de ahorro, recordatorio de copia de seguridad, atajos del manifest ("Añadir gasto"), etiquetas en movimientos. Descartado: conexión bancaria, multiusuario, fotos de tickets, notificaciones.

### Limitaciones conocidas
- Sin servidor propio: los recurrentes se generan al abrir la web (con la fecha correcta aunque se abra días después).
- Último guardado gana si se edita a la vez en dos dispositivos.
- El FT podría cambiar el formato de su página; el script avisaría y conservaría el último precio.
- Sin conexión y sin caché: la app abre gracias al service worker, pero sin cotizaciones nuevas; los diálogos caen a los nativos del navegador si SweetAlert2 no está cacheado.
- En Firefox para iOS el acceso directo puede abrirse dentro del navegador en lugar de a pantalla completa (usar Safari para instalar).

---

## 9. Entorno del PC

Windows 11, PowerShell 5.1. Instalado: Git 2.55, GitHub CLI 2.102, Python 3.12.10 (perfil de usuario). No hay Node ni LibreOffice. Carlos usa Firefox en Android, Firefox en iPad y Firefox/Edge/Chrome en Windows. Claude Code trabaja en `C:\Users\Carlos\repos\finanzas` y guarda memoria del proyecto (dispositivos, decisiones de diseño, cuentas y modelo de patrimonio) para la próxima sesión.
