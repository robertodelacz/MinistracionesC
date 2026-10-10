// ==== Constantes globales ====
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];
const DECENAS  = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const UNIDADES = ["", "UN", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const ESPECIALES = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const VEINTI = ["VEINTE", "VEINTIUN", "VEINTIDOS", "VEINTITRES", "VEINTICUATRO", "VEINTICINCO", "VEINTISÉIS", "VEINTISIETE", "VEINTIOCHO", "VEINTINUEVE"];

// === Versión por rango (rápida) ===
function NUM_TEXTO_FAST(numeros) {
  const isRange = Array.isArray(numeros);
  const rows = isRange ? numeros.length : 1;
  const cols = isRange ? numeros[0].length : 1;
  const out = [];
  
  for (let r = 0; r < rows; r++) {
    const rowOut = [];
    for (let c = 0; c < cols; c++) {
      const n = isRange ? numeros[r][c] : numeros;
      rowOut.push(_numTextoCached(n));
    }
    out.push(rowOut);
  }
  return out;
}

// === Versión 1 celda (compatible con tu fórmula) ===
function NUM_TEXTO(numero) {
  return _numTextoCached(numero);
}

// === Con caché para acelerar recalculados ===
function _numTextoCached(numero) {
  const cache = CacheService.getScriptCache();
  const key = "NT:" + numero;
  const cached = cache.get(key);
  if (cached) return cached;
  
  const res = _numTextoCore(numero);
  cache.put(key, res, 21600); // 6 horas
  return res;
}

// === Núcleo (simplificado solo para pesos) ===
function _numTextoCore(numero) {
  // Validación mejorada
  if (numero === null || numero === undefined || numero === "") {
    throw new Error("Celda vacía");
  }
  
  // Convertir a número
  const num = Number(numero);
  
  // Validar que sea un número válido
  if (isNaN(num)) {
    throw new Error("No es un número válido");
  }
  
  // Validar que no sea negativo
  if (num < 0) {
    throw new Error("No se permiten números negativos");
  }

  const parteEntera = Math.trunc(num);

  // Caso especial: cero
  if (parteEntera === 0) return "CERO PESOS";

  // Convertir número a texto
  let cadena = convertirParteEntera(parteEntera);
  
  // Determinar si es millón exacto
  const esMillon = parteEntera >= 1000000;
  const esMillonExacto = esMillon && (parteEntera % 1000000 === 0);

  // Agregar moneda
  if (esMillonExacto) {
    cadena += " DE PESOS";
  } else if (parteEntera === 1) {
    cadena += " PESO";
  } else {
    cadena += " PESOS";
  }

  return cadena;
}

function convertirParteEntera(n) {
  if (n === 0) return "";
  
  const millones = Math.floor(n / 1000000);
  const restoMillones = n % 1000000;
  const miles = Math.floor(restoMillones / 1000);
  const cientos = restoMillones % 1000;

  let s = "";
  
  if (millones > 0) {
    s += convierteCifra(millones, true) + (millones === 1 ? " MILLÓN" : " MILLONES");
  }
  
  if (miles > 0) {
    if (s) s += " ";
    const milTexto = convierteCifra(miles, true);
    s += (milTexto === "UN" && miles === 1) ? "MIL" : (milTexto + " MIL");
  }
  
  if (cientos > 0) {
    if (s) s += " ";
    s += convierteCifra(cientos, false);
  }
  
  return s;
}

function convierteCifra(n, esMayor) {
  if (n === 0) return "";
  if (n === 100) return "CIEN";

  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const decena = Math.floor(resto / 10);
  const unidad = resto % 10;

  let partes = [];
  
  if (centena > 0) {
    partes.push(CENTENAS[centena]);
  }

  if (resto > 0) {
    if (decena === 1) {
      partes.push(ESPECIALES[unidad]);
    } else if (decena === 2 && unidad > 0) {
      partes.push(VEINTI[unidad]);
    } else {
      if (decena > 1) partes.push(DECENAS[decena]);
      if (unidad > 0) {
        if (decena > 2) partes.push("Y");
        partes.push(UNIDADES[unidad]);
      }
    }
  }
  
  return partes.join(" ");
}
