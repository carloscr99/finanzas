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

Quien no esté en la lista verá "La cuenta … no está autorizada" al intentar entrar, y las reglas de Firestore le impiden leer o escribir nada aunque se salte la pantalla. Lo único que cuenta es el **ID** del documento: debe coincidir con el correo que muestra ese mensaje (las reglas y la app lo comparan en minúsculas). Fallos típicos: ID automático con el correo como campo, un espacio al final, o la persona ha entrado con otra cuenta de Google. No hay que crear nada en `users`: la app crea el documento de cada persona en su primer acceso.

### Botón oficial de Google (Google Identity Services)

El login con la ventana emergente de Firebase pasa por un dominio intermedio (`finanzas-3effc.firebaseapp.com`) que algunos navegadores aíslan (Safari con "Impedir rastreo entre sitios", navegadores integrados en WhatsApp/Instagram/Teams, modo privado) y entonces la ventana de Google termina con "Unable to process request due to missing initial state". Para evitarlo, la pantalla de acceso usa el botón oficial "Iniciar sesión con Google", que entrega la identidad directamente a la web y esta se la pasa a Firebase (`signInWithCredential`). Requiere:

1. Consola de Firebase → **Authentication → Sign-in method → Google** → desplegar "Configuración del SDK web" → copiar el **ID de cliente web** (termina en `.apps.googleusercontent.com`).
2. [Google Cloud Console → APIs y servicios → Credenciales](https://console.cloud.google.com/apis/credentials) (proyecto `finanzas-3effc`) → abrir ese cliente ("Web client (auto created by Google Service)") → en **Orígenes autorizados de JavaScript** añadir `https://carloscr99.github.io` y, para pruebas, `http://localhost:8000` → Guardar. Los cambios tardan unos minutos en aplicarse.
3. Pegar el ID en `googleClientId` de `firebase-config.js` y publicar.

Con `googleClientId` vacío, o si la librería de Google no carga, la pantalla muestra el botón de la ventana emergente de siempre; con el botón oficial, debajo queda el enlace "¿No se abre? Entrar con la ventana de Google" como reserva.

## 5. Publicar en GitHub Pages

1. Crea un repositorio **público** en GitHub (por ejemplo `finanzas`) y sube estos ficheros. Puedes hacerlo con git o arrastrándolos en la web de GitHub (**Add file → Upload files**).
2. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`. Guardar.
3. En uno o dos minutos la web estará en `https://carloscr99.github.io/finanzas/`.

Cada vez que cambies un fichero y lo subas, Pages se vuelve a publicar solo.

## 6. Cotizaciones automáticas (`prices.json`)

La app lee `prices.json` de este mismo repositorio. Lo actualiza solo un **workflow de GitHub Actions** (`.github/workflows/update-prices.yml`) que corre en los servidores de GitHub dos veces al día, a las 06:00 y a las 18:00 UTC (08:00 y 20:00 en verano, hora de Madrid), con el ordenador apagado. La pasada de la tarde recoge el valor liquidativo del día anterior, que los fondos publican a lo largo del día; la de la mañana es un respaldo. Las fechas de "Cotizaciones" en Patrimonio significan: *sincronizadas* = cuándo tu navegador descargó el fichero, *fichero GitHub* = última vez que el robot encontró un precio nuevo, *cotización más reciente* = fecha de valor del fondo (siempre uno o dos días atrás; Bitcoin es en tiempo real):

1. Ejecuta `scripts/update-prices.mjs`, que para cada clave de `assets` en `prices.json` consulta el valor liquidativo en el Financial Times (fondos, por ISIN; ETF y ETC, por el símbolo de cotización del campo `symbol`, p. ej. `"PPFB:GER:EUR"`) o el precio en CoinGecko (clave `BTC`).
2. Si obtiene un precio válido, actualiza `price`, `priceDate` (fecha real del dato) y `source`. Si una fuente falla, conserva el precio anterior y lo deja anotado en el registro de la ejecución.
3. Si `prices.json` ha cambiado, hace commit y push; GitHub Pages republica la web en un par de minutos.

Para lanzarlo a mano o ver el historial: pestaña **Actions** del repositorio → "Actualizar cotizaciones" → **Run workflow**. Para añadir un fondo: crea el activo en Patrimonio con su ISIN y añade esa misma clave a `prices.json` (nombre, `price: 0`); el siguiente día ya tendrá precio. Para un ETF o ETC, la clave sigue siendo el ISIN pero hay que añadir `symbol` con el código que usa el FT (se encuentra en `https://markets.ft.com/data/searchapi/searchsecurities?query=ISIN`; conviene la cotización en euros, p. ej. Xetra `:GER:EUR`). Si el fondo no aparece en el FT con `ISIN:EUR`, el script lo dirá en el registro y habrá que buscar otra fuente.

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

## Dashboard: tarjetas y gráficos

- **Ahorro acumulado** = ingresos − gastos de todo el histórico. Las inversiones no se restan: no son gasto, es dinero que sigue siendo tuyo en fondos y cuentas de ahorro. **Liquidez restante** (por periodo) sí las resta: es lo que queda en la cuenta corriente ese mes o ese año.
- **Evolución del patrimonio** (en Patrimonio, no en el Dashboard): la app guarda un punto por día (`meta.netWorthHistory`, máximo 730) cada vez que cambia algo: cotizaciones, movimientos, traspasos o actualizaciones manuales. Muestra patrimonio total, valor de los fondos y capital aportado a los fondos, según el periodo elegido. Hasta que no haya dos días con datos no se dibuja.

## Compras de fondos: participaciones estimadas

Cuando un recurrente de Inversión apunta a un fondo con ISIN (por ejemplo "Compra Amundi MSCI World"), la app no sabe cuántas participaciones compró MyInvestor. Las **estima** con la última cotización (importe ÷ precio), las suma al activo y marca el movimiento con «≈ … part. (estimadas)». Cuando llega una cotización con fecha igual o posterior a la compra, recalcula las participaciones con ese precio y las da por definitivas. Si el extracto dice otra cifra, edita el movimiento y escribe las participaciones reales.

Lo mismo vale para las compras que se escriben a mano (formulario de escritorio y hoja rápida del móvil): basta con el importe en euros. Si la casilla "Participaciones / títulos comprados" se deja vacía, se estiman igual y bajo la casilla se ve la estimación en vivo (≈ N part., importe ÷ precio). Si se escribe una cifra, esa es la que se guarda, como definitiva. Si el activo aún no tiene cotización, hay que indicar las participaciones.

## Presupuesto mensual por categoría (sección propia)

La sección **Presupuesto** (sidebar en escritorio; página "Más" en móvil) tiene su propio navegador de meses y muestra: presupuestado, gastado (más lo gastado en categorías sin presupuesto), disponible o excedido, y el **ritmo** (euros al día gastados y cuánto se puede gastar al día en lo que queda de mes). Debajo, una barra por categoría (verde, naranja a partir del 80 %, rojo si se pasa) que lleva a sus movimientos, y la lista de categorías sin presupuesto con gasto ese mes.

En «Ajustar presupuestos» está la tabla con cada categoría de gasto, su tipo, la media y el máximo de los últimos 12 meses completos, la **propuesta** y la casilla editable (vacía = sin presupuesto). La propuesta se calcula así:

- **Fijo (recurrente)**: hay un recurrente de gasto en esa categoría → su importe mensual (semanales × 52/12, anuales / 12), redondeado al euro.
- **Habitual**: gasto en 6 o más de los últimos 12 meses → el mayor entre la media y la mediana de esos 12 meses.
- **Irregular**: gasto en 2 a 5 de los últimos 12 meses → el gasto del año repartido entre 12.
- **Sin datos suficientes**: 1 mes o menos → sin propuesta. Tampoco se propone si sale por debajo de 10 € (salvo fijos).
- Redondeo hacia arriba a 5 € por debajo de 100 € y a 10 € a partir de 100 €.

«Rellenar con la propuesta» aplica la propuesta a todas las categorías que la tienen; «Quitar todos» borra los presupuestos. Se guardan en `budgets` (categoría → €/mes).

## Deudas en el patrimonio

El tipo de activo **Deuda** (préstamo del coche, pago final pendiente…) guarda en «Valor actual» lo que queda por pagar. Resta del **patrimonio neto** (activos − deudas), no cuenta como inversión ni aparece en la distribución. Se actualiza a mano o con un traspaso desde una cuenta hacia la deuda, que la reduce (traspasar desde la deuda la aumenta).

## Categorías

Alta, baja (no deja borrar categorías en uso) y **renombrado** con el lápiz del chip; al renombrar se conserva el identificador, así que movimientos, recurrentes y presupuestos no cambian. Conviene que las categorías digan en qué se va el dinero, no por dónde sale (Bizum o compra online son canales de pago, no motivos de gasto).

## Corregir el histórico: cambiar categoría en bloque

En Movimientos, filtra los apuntes que quieras corregir (texto, tipo, categoría, fechas) y pulsa «Cambiar categoría de los visibles…»: eliges el nuevo tipo y la nueva categoría y se aplican a todos los visibles de una vez. Solo cambia tipo y categoría, así que sirve para reclasificar el histórico sin duplicar importes en las cuentas; los movimientos que tienen una cuenta de ahorro asignada se recalculan en ella con el nuevo tipo. Si el movimiento sale de una categoría de Inversión con participaciones, pierde el enlace con el fondo.

## Patrimonio: cuenta corriente, cuentas de ahorro y traspasos

- **Cuenta de cada movimiento**: al dar de alta un ingreso, gasto o inversión (formulario, hoja rápida del móvil y recurrentes) se elige en qué cuenta entra o de cuál sale el dinero: cualquier cuenta corriente, cuenta de ahorro, efectivo u «otro» del patrimonio, o «Ninguna (fuera del patrimonio)» para dinero que no se controla en la app. El selector viene marcado con la **cuenta por defecto**, que se elige en Patrimonio con el botón «Usar por defecto» de la tarjeta de la cuenta (si no se ha elegido ninguna, es la cuenta corriente más antigua). En una cuenta corriente el movimiento entra en el saldo calculado; en las demás cuentas un ingreso suma al saldo (sin contar como aportado, como unos intereses) y un gasto o una inversión restan del saldo y de lo aportado. Al editar o borrar el movimiento, la cuenta se recalcula. En los listados solo se etiqueta la cuenta cuando no es la cuenta por defecto. Los movimientos anteriores a esta función (sin cuenta guardada) pertenecen a la cuenta corriente original.
- **Cuenta corriente** (tipo de activo; puede haber varias, por ejemplo el banco principal y Revolut): se da de alta con el saldo real de hoy y desde entonces la app lo recalcula sola: saldo de referencia + ingresos − gastos − inversiones registrados en esa cuenta a partir de esa fecha. «Actualizar manualmente» fija el saldo real del banco como nueva referencia y avisa de la diferencia con lo registrado (dinero que ha entrado o salido sin apuntarse).
- **Cuentas de ahorro** (tipo Cuenta): un movimiento de Inversión cuya categoría coincide con el nombre de la cuenta (RenaultBank, Trade Republic…) suma su importe al saldo y al aportado de esa cuenta, también cuando lo genera un recurrente. Las cuentas, depósitos y seguros cuentan en el patrimonio total pero no en «capital invertido» ni en la rentabilidad, que solo miran los fondos con ISIN y cripto.
- **Traspasos entre cuentas** (Patrimonio → «Traspaso entre cuentas»): mueven dinero entre dos cuentas sin contar como ingreso, gasto ni inversión. Sirven para el camino de vuelta (un depósito que vence y vuelve a la cuenta corriente) o entre cuentas de ahorro; quedan listados los últimos. Un traspaso equivocado se deshace registrando el inverso.

## Cómo se publica la web

GitHub Pages está configurado en modo **GitHub Actions**: el workflow `.github/workflows/deploy-pages.yml` empaqueta el repositorio y lo despliega en cada push a `main` (también a mano desde Actions → "Publicar en GitHub Pages" → Run workflow). El workflow de cotizaciones lo llama después de cada commit de `prices.json`, porque los commits hechos con `GITHUB_TOKEN` no disparan otros workflows por sí solos. Se cambió el 14/10/2026 porque el constructor clásico de Pages se quedó colgado varias veces ("in progress deployment"); si volviera a pasar con el workflow, en Actions se puede cancelar el despliegue atascado y relanzar.

## Límites de Firebase y tamaño de los datos

Cada documento de Firestore tiene un **límite de 1 MiB**. Desde el 15/10/2026 los datos van repartidos: el documento principal `users/{uid}` guarda categorías, recurrentes, activos, traspasos, presupuestos y `meta` (unos 7 KB más el histórico de patrimonio), y los movimientos van en un documento por año, `users/{uid}/years/{yyyy}` (`{movements:[…]}`, unos 90 KB por año a 45 movimientos al mes). La web carga el principal y todos los años al abrir y trabaja siempre con la lista completa en memoria, así que búsquedas, comparativas y presupuestos no distinguen años. Al guardar escribe, en un solo lote atómico, solo los documentos que han cambiado (normalmente el principal y el año del movimiento tocado); un año que se queda sin movimientos se borra.

Ajustes muestra "Tamaño de tus datos": el tamaño del principal y del año más grande, medidos como JSON compacto (buena aproximación de lo que mide Firestore). El aviso cambia a naranja a partir del 70 % y a rojo a partir del 90 % del documento mayor; a este ritmo ningún documento se acerca.

**Migración desde el formato antiguo** (todo en el principal, hasta el 14/10/2026): automática. Al abrir la web, si el principal todavía trae `movements`, se reparten por años y se quitan del principal en el mismo lote. Si otra versión antigua de la web escribiera movimientos en el principal, se juntan con los de los años (sin duplicar por `id`) y se vuelven a migrar al guardar. Si las reglas de Firestore aún no permiten los documentos de año, la web lo detecta (aviso en la consola del navegador) y sigue guardando en el formato antiguo hasta que se publiquen: **al actualizar hay que publicar `firestore.rules` en la consola de Firebase**.

Otras cuotas del plan gratuito (Spark): 50.000 lecturas y 20.000 escrituras al día, 1 GiB de almacenamiento; un solo usuario no se acerca. No hay copias de seguridad automáticas: exporta el JSON desde Ajustes de vez en cuando. El estado del proyecto, las decisiones y lo pendiente están en `docs/ESTADO-PROYECTO.md`.

## Seguridad: qué es público y qué no

- Los datos de `firebase-config.js` identifican el proyecto pero no dan acceso a nada: la protección está en `firestore.rules` y en los dominios autorizados.
- Opcional: en Google Cloud Console → **APIs y servicios → Credenciales**, restringe la clave "Browser key" a los referentes `carloscr99.github.io/*` y `localhost/*`.
- `prices.json` es público (solo cotizaciones). Tus movimientos y patrimonio nunca pasan por GitHub.
