// Conexión al proyecto de Firebase del concierto ("concierto-tenjo-2026") —
// deliberadamente en su propio módulo, con su propia app de Firebase Admin,
// sin ningún punto de contacto con firebaseClient.js (el de la feria/
// cabalgata, proyecto "feria-2025"). Dos proyectos, dos módulos, dos
// credenciales — así no hay forma de que un bug de código cruce datos entre
// el concierto y la feria.
//
// A diferencia de la feria (reglas de Firestore abiertas, alcanza con el SDK
// de cliente), las reglas del concierto exigen usuario autenticado para
// cualquier lectura o escritura — por eso aquí se usa el SDK de Admin con una
// cuenta de servicio, que no pasa por esas reglas en absoluto.
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = initializeApp(
  {
    credential: cert({
      projectId: process.env.CONCIERTO_FIREBASE_PROJECT_ID,
      clientEmail: process.env.CONCIERTO_FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.CONCIERTO_FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  },
  "concierto"
);

const dbConcierto = getFirestore(app);

module.exports = { dbConcierto };
