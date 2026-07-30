// Palafrenero de un ejemplar ya registrado en la Feria. Se llama una vez por
// cada vuelta del loop de palafreneros (que va aparte del loop de ejemplares).
// Encuentra el ejemplar correspondiente por loteId + nombre, y completa su
// misma fila en el Sheet (pestaña + fila que ya quedaron guardadas cuando se
// registró ese ejemplar).
const { collection, query, where, getDocs, doc, updateDoc } = require("firebase/firestore");
const { db } = require("./firebaseClient");
const { organizarPalafrenero } = require("./organizarDatosFeria");
const { escribirPalafrenero } = require("./sheetsFeria");

async function registrarPalafreneroFeria(datos = {}) {
  const { loteId = "", datosPalafreneroTexto = "" } = datos;

  if (!loteId || !loteId.trim() || !datosPalafreneroTexto) {
    const error = new Error("Faltan campos obligatorios: loteId y datosPalafreneroTexto.");
    error.status = 400;
    throw error;
  }

  const q = query(collection(db, "inscripcionesFeriaEjemplares"), where("loteId", "==", loteId.trim()));
  const snap = await getDocs(q);
  if (snap.empty) {
    const error = new Error("No se encontraron ejemplares registrados con ese loteId.");
    error.status = 400;
    throw error;
  }

  const ejemplares = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const nombresReales = [...new Set(ejemplares.map((e) => e.nombreEjemplar))];

  const { nombrePalafrenero, telefonoPalafrenero, nombreEjemplar } = await organizarPalafrenero(
    datosPalafreneroTexto,
    nombresReales
  );

  const ejemplar = ejemplares.find((e) => e.nombreEjemplar === nombreEjemplar);

  await updateDoc(doc(db, "inscripcionesFeriaEjemplares", ejemplar.id), {
    nombrePalafrenero,
    telefonoPalafrenero,
  });

  // Igual que con el ejemplar: Firestore es la fuente de verdad, el Sheet es
  // un espejo best-effort. Si el ejemplar no tiene pestaña/fila guardada (su
  // propia escritura en el Sheet falló en su momento), no hay dónde escribir
  // el palafrenero tampoco — se avisa pero no se pierde el dato.
  let escritoEnSheet = false;
  if (ejemplar.sheetPestana && ejemplar.sheetFila) {
    try {
      await escribirPalafrenero({
        pestana: ejemplar.sheetPestana,
        fila: ejemplar.sheetFila,
        sexo: ejemplar.sexo,
        nombrePalafrenero,
        telefonoPalafrenero,
      });
      escritoEnSheet = true;
    } catch (err) {
      console.error(`Error escribiendo el palafrenero del ejemplar ${ejemplar.id} en el Sheet (sí quedó en Firestore):`, err);
    }
  } else {
    console.warn(`El ejemplar ${ejemplar.id} no tiene ubicación en el Sheet — palafrenero solo quedó en Firestore.`);
  }

  return { id: ejemplar.id, nombreEjemplar, escritoEnSheet };
}

module.exports = { registrarPalafreneroFeria };
