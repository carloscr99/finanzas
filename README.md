# Mis Finanzas (online)

App de finanzas personales publicada en **GitHub Pages** (gratis), con **inicio de sesión con Google** y datos guardados por usuario en **Cloud Firestore** (plan gratuito Spark de Firebase). Cada usuario solo ve sus propios datos; solo pueden entrar las cuentas que tú apuntes en una lista.

Ficheros:

| Fichero | Para qué sirve |
|---|---|
| `index.html` | La aplicación completa (HTML, CSS y JavaScript) |
| `firebase-config.js` | Identificadores de tu proyecto de Firebase (se rellenan una vez) |
| `firestore.rules` | Reglas de seguridad de Firestore (se pegan en la consola de Firebase) |
| `prices.json` | Cotizaciones de BTC, fondos y oro (lo actualiza una tarea automática) |
| `.nojekyll` | Le dice a GitHub Pages que publique los ficheros tal cual |

## 1. Crear el proyecto de Firebase

1. Entra en https://console.firebase.google.com con tu cuenta de Google y pulsa **Crear un proyecto**. Ponle un nombre (por ejemplo `mis-finanzas`). Desactiva Google Analytics (no hace falta).
2. En la página principal del proyecto pulsa el icono **Web** (`</>`) para añadir una app web. Ponle un apodo cualquiera. **No** marques Firebase Hosting.
3. Firebase te enseñará un bloque `const firebaseConfig = { ... }`. Copia los valores en `firebase-config.js` de este repositorio (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).

## 2. Activar el inicio de sesión con Google

1. Menú **Compilación → Authentication → Comenzar**.
2. Pestaña **Sign-in method** → **Google** → Habilitar. Indica el correo de asistencia del proyecto y guarda.
3. Pestaña **Settings → Dominios autorizados** → **Añadir dominio** → escribe `carloscr99.github.io` (tu usuario de GitHub en minúsculas). `localhost` ya está añadido para pruebas.

## 3. Crear la base de datos Firestore

1. Menú **Compilación → Firestore Database → Crear base de datos**.
2. Ubicación: `eur3 (europe-west)`. Modo: **producción**. Crear.
3. Pestaña **Reglas**: borra lo que haya, pega el contenido completo de `firestore.rules` y pulsa **Publicar**.

## 4. Decir quién puede entrar (lista de permitidos)

1. Pestaña **Datos** → **Iniciar colección** → ID de colección: `allowlist`.
2. ID del documento: tu correo de Gmail **en minúsculas** (por ejemplo `nombre@gmail.com`). Añade un campo `enabled` de tipo boolean con valor `true`. Guardar.
3. Repite con cada persona que deba tener acceso. Para quitar a alguien, borra su documento.

Quien no esté en la lista verá "Tu cuenta no está autorizada" al intentar entrar, y las reglas de Firestore le impiden leer o escribir nada aunque se salte la pantalla.

## 5. Publicar en GitHub Pages

1. Crea un repositorio **público** en GitHub (por ejemplo `finanzas`) y sube estos ficheros. Puedes hacerlo con git o arrastrándolos en la web de GitHub (**Add file → Upload files**).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardar.
3. En uno o dos minutos la web estará en `https://carloscr99.github.io/finanzas/`.

Cada vez que cambies un fichero y lo subas, Pages se vuelve a publicar solo.

## 6. Cotizaciones automáticas (`prices.json`)

La app lee `prices.json` de este mismo repositorio. Lo actualiza solo un **workflow de GitHub Actions** (`.github/workflows/update-prices.yml`) que corre en los servidores de GitHub dos veces al día, a las 06:00 y a las 18:00 UTC (08:00 y 20:00 en verano, hora de Madrid), con el ordenador apagado. La pasada de la tarde recoge el valor liquidativo del día anterior, que los fondos publican a lo largo del día; la de la mañana es un respaldo. Las fechas de "Cotizaciones" en Patrimonio significan: *sincronizadas* = cuándo tu navegador descargó el fichero, *fichero GitHub* = última vez que el robot encontró un precio nuevo, *cotización más reciente* = fecha de valor del fondo (siempre uno o dos días atrás; Bitcoin es en tiempo real):

1. Ejecuta `scripts/update-prices.mjs`, que para cada clave de `assets` en `prices.json` consulta el valor liquidativo en el Financial Times (fondos, por ISIN) o el precio en CoinGecko (clave `BTC`).
2. Si obtiene un precio válido, actualiza `price`, `priceDate` (fecha real del dato) y `source`. Si una fuente falla, conserva el precio anterior y lo deja anotado en el registro de la ejecución.
3. Si `prices.json` ha cambiado, hace commit y push; GitHub Pages republica la web en un par de minutos.

Para lanzarlo a mano o ver el historial: pestaña **Actions** del repositorio → "Actualizar cotizaciones" → **Run workflow**. Para añadir un fondo: crea el activo en Patrimonio con su ISIN y añade esa misma clave a `prices.json` (nombre, `price: 0`); el siguiente día ya tendrá precio. Si el fondo no aparece en el FT con `ISIN:EUR`, el script lo dirá en el registro y habrá que buscar otra fuente.

**Cómo casa la app cada activo con su cotización**: por el campo ISIN del activo en Patrimonio, que debe ser exactamente la clave usada en `prices.json`. Bitcoin se reconoce por el nombre ("Bitcoin" o "BTC") y usa la clave `BTC`. Para añadir otro fondo o ETF basta con crear el activo con su ISIN y añadir esa misma clave a `prices.json` (y a la tarea de ChatGPT).

**Cómo enlaza un movimiento de inversión con su activo**: al elegir una categoría de Inversión cuyo nombre coincide con el de un activo cotizable (por ejemplo categoría "Amundi MSCI World" y activo "Amundi Index MSCI World AE-C"), el formulario pide el activo y las participaciones compradas; el importe suma al capital aportado y las participaciones al activo, y así se calcula la rentabilidad anualizada (XIRR) por activo.

## 7. Primer uso

1. **Antes de nada**, en la versión antigua (`mis_finanzas_web_v17.html`) ve a **Ajustes → Exportar datos** y guarda el `.json`.
2. Abre la URL de GitHub Pages y pulsa **Entrar con Google**.
3. Ve a **Ajustes → Importar datos** y elige el `.json` exportado. Desde ese momento todo se guarda en Firestore y se sincroniza entre dispositivos.
4. Sigue disponible **Ajustes → Exportar datos** como copia de seguridad periódica.

Si abres la nueva `index.html` en el mismo navegador y la misma dirección donde usabas la antigua, la app detecta los datos guardados y te ofrece subirlos directamente; pero lo normal es que la dirección cambie, así que el camino fiable es exportar e importar.

## Usar en el móvil

La web está pensada para usarse también desde el teléfono. Para tenerla como una app con su icono y a pantalla completa:

- **Android (Chrome o Firefox)**: abre la URL, menú ⋮ → "Instalar" o "Añadir a pantalla de inicio".
- **iPhone / iPad (Safari)**: abre la URL, botón Compartir → "Añadir a pantalla de inicio". Desde Firefox para iOS el acceso directo puede abrirse dentro del navegador en lugar de a pantalla completa.

La sesión de Google queda guardada en el dispositivo: al abrir la app verás "Comprobando sesión…" un instante y entrarás sin volver a pulsar nada. Solo se cierra la sesión si la cuenta deja de estar en la lista de permitidos o si pulsas "Cerrar sesión"; un fallo de red no la cierra. El fichero `sw.js` (service worker) guarda la app, los iconos y las librerías en el dispositivo, así que abre al instante y también sin conexión (los datos ya los guarda Firestore). Si alguna vez cambias las librerías de CDN, sube la versión `CACHE` que hay al principio de `sw.js`.

En el móvil, el botón **+** de la barra inferior abre la hoja de alta rápida: importe, tipo, categoría (las más usadas primero), concepto con sugerencias y fecha. La hoja se cierra con la × o deslizándola hacia abajo. Tocar un movimiento de la lista lo abre para editar o borrar. Los gráficos horizontales se muestran como listas de barras tocables, y la evolución mensual enseña seis meses (botón "Ver 12 meses" para el año completo). Al tocar una barra aparece su valor y el botón "Ver movimientos". La página "Más" reúne la cuenta, las categorías, los recurrentes, los ajustes y el cierre de sesión.

## Probar en local

Sirve la carpeta con cualquier servidor estático y abre `http://localhost:8000`. No funciona abriendo `index.html` directamente como fichero, porque los módulos JavaScript y el login de Google necesitan `http://`.

Opciones sin instalar nada:

- Extensión **Live Server** de Visual Studio Code (botón "Go Live").
- Si tienes Python: `python -m http.server 8000`.
- Si tienes Node: `npx serve -l 8000 .`.

## Patrimonio: cuenta corriente, cuentas de ahorro y traspasos

- **Cuenta corriente** (tipo de activo, solo puede haber una): se da de alta con el saldo real de hoy y desde entonces la app lo recalcula sola: saldo de referencia + ingresos − gastos − inversiones registrados a partir de esa fecha. «Actualizar manualmente» fija el saldo real del banco como nueva referencia y avisa de la diferencia con lo registrado (dinero que ha entrado o salido sin apuntarse).
- **Cuentas de ahorro** (tipo Cuenta): un movimiento de Inversión cuya categoría coincide con el nombre de la cuenta (RenaultBank, Trade Republic…) suma su importe al saldo y al aportado de esa cuenta, también cuando lo genera un recurrente. Las cuentas, depósitos y seguros cuentan en el patrimonio total pero no en «capital invertido» ni en la rentabilidad, que solo miran los fondos con ISIN y cripto.
- **Traspasos entre cuentas** (Patrimonio → «Traspaso entre cuentas»): mueven dinero entre dos cuentas sin contar como ingreso, gasto ni inversión. Sirven para el camino de vuelta (un depósito que vence y vuelve a la cuenta corriente) o entre cuentas de ahorro; quedan listados los últimos. Un traspaso equivocado se deshace registrando el inverso.

## Seguridad: qué es público y qué no

- Los datos de `firebase-config.js` identifican el proyecto pero no dan acceso a nada: la protección está en `firestore.rules` y en los dominios autorizados.
- Opcional: en Google Cloud Console → **APIs y servicios → Credenciales**, restringe la clave "Browser key" a los referentes `carloscr99.github.io/*` y `localhost/*`.
- `prices.json` es público (solo cotizaciones). Tus movimientos y patrimonio nunca pasan por GitHub.
