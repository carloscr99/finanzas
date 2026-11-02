// Clave pública VAPID para las notificaciones push de la app.
// La clave pública no es secreta: viaja al navegador para suscribirse. La privada se guarda solo en el secreto
// VAPID_PRIVATE_KEY de GitHub Actions (nunca en el repositorio).
// Si algún día se regeneran las claves, cambia también el secreto de GitHub y vuelve a activar los avisos en cada dispositivo.
export const VAPID_PUBLIC_KEY = "BFSxjW7fv-KM8ZnMTb7vSQiMWGN2KuMLmF_WyMX0vs3OiOPBCtTwbfBE3gnPKV0VS_eQFDQ8EBEB9hNO1brBxFY";
