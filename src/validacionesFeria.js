// Validaciones de formato para los datos de la Feria. A propósito NO son
// estrictas al extremo: la idea es atrapar errores obvios (un teléfono con
// letras, un correo sin @, un nombre que en realidad es un número) sin
// rechazar casos reales que no calcen perfecto con un patrón rígido.

function limpiar(v) {
  return (v || "").toString().trim();
}

// Nombre: no vacío, mínimo 3 caracteres, no solo números, y debe parecer
// nombre + apellido (al menos dos palabras) — pero sin exigir un formato
// exacto, solo que haya más de una palabra con letras.
function validarNombre(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  if (val.length < 3) return { valido: false, motivo: "muy corto" };
  if (/^[0-9\s]+$/.test(val)) return { valido: false, motivo: "no puede ser solo números" };
  const palabras = val.split(/\s+/).filter((p) => /[a-zA-ZÀ-ÿ]/.test(p));
  if (palabras.length < 2) return { valido: false, motivo: "debe incluir nombre y apellido" };
  return { valido: true, valor: val };
}

// Documento: se acepta con o sin prefijo de tipo (CC, CE, TI, NIT, PP, RC),
// y con un guion si es NIT (dígito de verificación) — el número en sí debe
// tener entre 6 y 15 dígitos. Si no encuentra un número en ese rango, lo
// marca inválido en vez de exigir un formato exacto.
function validarDocumento(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  const soloNumeros = val.replace(/^(cc|ce|ti|nit|pp|rc)\.?\s*/i, "").replace(/[^0-9-]/g, "");
  const digitos = soloNumeros.replace(/-/g, "");
  if (digitos.length < 6 || digitos.length > 15) {
    return { valido: false, motivo: "el número de documento no parece válido" };
  }
  return { valido: true, valor: val };
}

// Teléfono: se le quita automáticamente cualquier cosa que no sea número
// (espacios, guiones, +57, paréntesis...) y se valida el largo resultante.
function validarTelefono(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  const soloDigitos = val.replace(/[^0-9]/g, "");
  if (soloDigitos.length < 7 || soloDigitos.length > 13) {
    return { valido: false, motivo: "el teléfono no parece válido" };
  }
  return { valido: true, valor: soloDigitos };
}

// Correo: solo se exige que tenga @ y un punto después — no se valida
// contra una lista de dominios ni nada más estricto que eso.
function validarCorreo(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
    return { valido: false, motivo: "no parece un correo válido" };
  }
  return { valido: true, valor: val };
}

// Municipio: no vacío, solo letras/espacios/tildes — no se compara contra
// un listado real de municipios de Colombia (se deja para más adelante).
function validarMunicipio(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  if (!/^[a-zA-ZÀ-ÿ\s.]+$/.test(val)) {
    return { valido: false, motivo: "no parece un nombre de municipio válido" };
  }
  return { valido: true, valor: val };
}

// Registro del ejemplar: no se exige un formato fijo, solo que contenga
// al menos un número (para atrapar el caso de que venga vacío o sea texto
// que claramente no es un número de registro).
function validarRegistro(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  if (!/[0-9]/.test(val)) return { valido: false, motivo: "debe incluir números" };
  return { valido: true, valor: val };
}

// Criadero/nombre del ejemplar: solo se exige que no esté vacío y tenga un
// mínimo de contenido real — no se le pide una forma en particular.
function validarTextoLibre(v) {
  const val = limpiar(v);
  if (!val) return { valido: false, motivo: "no puede estar vacío" };
  if (val.length < 2) return { valido: false, motivo: "muy corto" };
  return { valido: true, valor: val };
}

module.exports = {
  validarNombre,
  validarDocumento,
  validarTelefono,
  validarCorreo,
  validarMunicipio,
  validarRegistro,
  validarTextoLibre,
};
