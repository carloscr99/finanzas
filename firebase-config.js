// Configuración del proyecto de Firebase "finanzas-3effc".
// Copiada desde: Consola de Firebase → Configuración del proyecto → Tus apps → App web.
// Estos valores NO son secretos: identifican el proyecto. La seguridad la dan las reglas de Firestore
// (firestore.rules) y los dominios autorizados en Authentication.
export const firebaseConfig = {
  apiKey: "AIzaSyDB3Fy1TUbFMOHv85BRicPHT-Tps8-ihFI",
  authDomain: "finanzas-3effc.firebaseapp.com",
  projectId: "finanzas-3effc",
  storageBucket: "finanzas-3effc.firebasestorage.app",
  messagingSenderId: "1013184297447",
  appId: "1:1013184297447:web:96d14183dcab79e368e542",
  // Id del cliente OAuth web para el botón oficial "Iniciar sesión con Google" (Google Identity Services).
  // Se copia de: Consola de Firebase → Authentication → Sign-in method → Google → "Configuración del SDK web" → ID de cliente web.
  // En Google Cloud → APIs y servicios → Credenciales → ese cliente, hay que añadir en "Orígenes autorizados de JavaScript"
  // https://carloscr99.github.io (y http://localhost:8000 para pruebas). Vacío = se usa la ventana emergente de Firebase.
  googleClientId: ""
};
