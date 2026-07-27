// Mismo proyecto Firestore que usan palco-reservas y palcos-cliente ("feria-2025").
// Las reglas actuales del proyecto permiten lectura pública, así que esto funciona
// sin necesitar una cuenta de servicio.
const { initializeApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyDxjJQxbIgQOp7V8ZOzHMEdQiS48sR8fNQ",
  authDomain: "feria-2025.firebaseapp.com",
  projectId: "feria-2025",
  storageBucket: "feria-2025.firebasestorage.app",
  messagingSenderId: "606697537967",
  appId: "1:606697537967:web:55c7b45f15438ff723ef5a",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db };
