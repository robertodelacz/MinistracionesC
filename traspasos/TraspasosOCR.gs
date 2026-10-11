/* ==========================================================================
   TRASPASOS V2  ·  Lectura de capturas
   --------------------------------------------------------------------------
   Motor 1 (principal): Claude con visión. Ve la imagen completa, así que no
           pierde la relación entre etiqueta y valor (lo que sí le pasa al OCR).
           Requiere la clave en Propiedades del script: ANTHROPIC_API_KEY
           (menú Traspasos → Guardar clave de Claude).
   Motor 2 (respaldo): OCR de Drive + analizador de texto. Se usa si no hay
           clave o si Claude falla.

   IMPORTANTE (privacidad): con el motor Claude, la imagen de la captura
   bancaria sale de Google hacia la API de Anthropic. Si eso no es aceptable
   para la empresa, deja TRAS.MOTOR = 'DRIVE'.
   ========================================================================== */

const TRAS_PROMPT_SISTEMA =
  'Eres un transcriptor de comprobantes bancarios mexicanos (capturas de pantalla de portales como BBVA, Inbursa, ' +
  'Bancrea, Acendes, Tesocualli, etc.). Tu trabajo es copiar fielmente lo que se ve, nunca interpretar ni corregir.\n' +
  'Reglas:\n' +
  '1. Cada bloque/renglón de operación distinto es UNA operación, aunque otra tenga exactamente los mismos datos e importe. ' +
  'Si la imagen muestra tres operaciones iguales, devuelve tres.\n' +
  '2. Copia los números de cuenta dígito por dígito, sin espacios. NUNCA agregues, quites ni "arregles" dígitos para que ' +
  'parezcan una cuenta conocida. Si un dígito es dudoso, sustitúyelo por "?" y agrégalo en "ilegible".\n' +
  '3. Si un dato no aparece o está tapado, usa null y agrega el nombre del campo en "ilegible" solo si se alcanza a ver que existe.\n' +
  '4. El importe se copia como aparece (por ejemplo "5,000,000.00"). Las fechas como aparecen (dd/mm/aaaa).\n' +
  '5. "cuenta_cargo" es la cuenta de la que sale el dinero (cuenta origen / cuenta de retiro / cuenta cargo). ' +
  '"cuenta_beneficiaria" es la cuenta que recibe (cuenta destino / cuenta de depósito / cuenta beneficiario).\n' +
  '6. Si la imagen no es un comprobante o solicitud de traspaso (logo, firma de correo, foto), devuelve es_comprobante=false y operaciones vacías.\n' +
  '7. En "confianza" usa "alta" si todo se ve nítido, "media" si hubo algo dudoso, "baja" si hay que verificar a mano.';

const TRAS_ESQUEMA_HERRAMIENTA = {
  name: 'registrar_operaciones',
  description: 'Registra las operaciones de traspaso visibles en la captura.',
  input_schema: {
    type: 'object',
    properties: {
      es_comprobante: { type: 'boolean' },
      operaciones: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            descripcion: { type: ['string', 'null'] },
            fecha_aplicacion: { type: ['string', 'null'], description: 'Fecha de aplicación o fecha de la operación, tal como se ve' },
            fecha_creacion: { type: ['string', 'null'] },
            cuenta_cargo: { type: ['string', 'null'] },
            cuenta_beneficiaria: { type: ['string', 'null'] },
            importe: { type: ['string', 'null'] },
            divisa: { type: ['string', 'null'] },
            banco_destino: { type: ['string', 'null'] },
            alias_destino: { type: ['string', 'null'] },
            referencia: { type: ['string', 'null'] },
            ilegible: { type: 'array', items: { type: 'string' } },
            confianza: { type: 'string', enum: ['alta', 'media', 'baja'] },
            notas: { type: ['string', 'null'] }
          },
          required: ['cuenta_cargo', 'cuenta_beneficiaria', 'importe', 'confianza']
        }
      }
    },
    required: ['es_comprobante', 'operaciones']
  }
};

/* ======================================================================
   ENTRADA: lee una imagen y devuelve
   { ok, motor, operaciones:[{fechaApp, cuentaCargo, cuentaBenef, monto, divisa, confianza, ilegible[], notas[]}],
     esComprobante, crudo, error, transitorio }
   ====================================================================== */
function trasLeerImagen_(blob, ctx) {
  const claveClaude = trasClaveClaude_();
  let usarClaude = false;
  const modo = (ctx && ctx.o && ctx.o.motor) || TRAS.MOTOR;
  if (modo === 'CLAUDE') usarClaude = true;
  else if (modo === 'AUTO') usarClaude = !!claveClaude && !trasClaudeApagado_();

  let errorClaude = '';
  if (usarClaude) {
    if (!claveClaude) return { ok: false, motor: 'CLAUDE', error: 'No hay clave de Claude guardada.', transitorio: false };
    const r = trasLeerConClaude_(blob, claveClaude, ctx);
    if (r.ok) return r;
    errorClaude = r.error || 'falló Claude';
    if (modo === 'CLAUDE') return r;
  }
  const d = trasLeerConDrive_(blob);
  if (usarClaude && d.ok) { d.motor = 'DRIVE (respaldo)'; d.operaciones.forEach(function (op) { op.notas = (op.notas || []).concat(['ℹ Claude no pudo leerla (' + errorClaude + '); se usó el OCR de Drive.']); }); }
  if (usarClaude && !d.ok) { d.error = 'Claude: ' + errorClaude + ' · Drive: ' + (d.error || ''); }
  return d;
}

function trasClaveClaude_() {
  try { return PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY') || ''; } catch (e) { return ''; }
}
/** Si la clave dio 401/403 en esta ejecución se apaga Claude para no repetir llamadas inútiles. */
let TRAS_CLAUDE_APAGADO = false;
function trasClaudeApagado_() { return TRAS_CLAUDE_APAGADO; }

/* ======================================================================
   MOTOR 1 · CLAUDE (visión)
   ====================================================================== */
function trasLeerConClaude_(blob, clave, ctx) {
  const bytes = blob.getBytes();
  if (bytes.length > TRAS.CLAUDE_MAX_BYTES) return { ok: false, motor: 'CLAUDE', error: 'la imagen pesa demasiado para Claude', transitorio: false };
  const cuerpo = {
    model: TRAS.CLAUDE_MODELO,
    max_tokens: 3000,
    system: TRAS_PROMPT_SISTEMA,
    tools: [TRAS_ESQUEMA_HERRAMIENTA],
    // Sin tool_choice forzado: algunos modelos nuevos responden HTTP 400 ("tool_choice type tool/any not supported").
    // Se pide la herramienta en el texto y, si aun así contestara texto, se lee el JSON de ahí.
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: trasContentType_(blob), data: Utilities.base64Encode(bytes) } },
        { type: 'text', text: 'Transcribe las operaciones de esta captura y entrega el resultado SIEMPRE llamando a la herramienta registrar_operaciones (no respondas en texto). Asunto del correo (solo contexto, no lo uses para llenar datos): ' + String((ctx && ctx.asunto) || '').slice(0, 200) }
      ]
    }]
  };
  const opciones = {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(cuerpo)
  };
  let ultimo = '';
  for (let intento = 0; intento < 3; intento++) {
    let resp;
    try { resp = UrlFetchApp.fetch(TRAS.CLAUDE_URL, opciones); }
    catch (e) { ultimo = 'sin conexión: ' + e; Utilities.sleep(1500 * (intento + 1)); continue; }
    const codigo = resp.getResponseCode(); const texto = resp.getContentText();
    if (codigo === 200) return trasInterpretarClaude_(texto);
    ultimo = 'HTTP ' + codigo + ' ' + String(texto).slice(0, 200);
    if (codigo === 401 || codigo === 403) { TRAS_CLAUDE_APAGADO = true; return { ok: false, motor: 'CLAUDE', error: 'la clave de Claude no es válida (' + codigo + ')', transitorio: false }; }
    if (codigo === 400 || codigo === 404) return { ok: false, motor: 'CLAUDE', error: ultimo, transitorio: false };
    Utilities.sleep(2000 * (intento + 1));                      // 429 / 5xx / 529: reintentar
  }
  return { ok: false, motor: 'CLAUDE', error: ultimo, transitorio: true };
}

function trasInterpretarClaude_(textoRespuesta) {
  let j;
  try { j = JSON.parse(textoRespuesta); } catch (e) { return { ok: false, motor: 'CLAUDE', error: 'respuesta no legible', transitorio: true }; }
  const contenido = j.content || [];
  const bloque = contenido.filter(function (b) { return b.type === 'tool_use' && b.name === 'registrar_operaciones'; })[0];
  let inp = bloque && bloque.input ? bloque.input : null;
  if (!inp) {                                                    // respaldo: JSON dentro del texto
    const txt = contenido.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
    const m = /\{[\s\S]*\}/.exec(txt);
    if (m) { try { const o = JSON.parse(m[0]); if (o && (o.operaciones || o.es_comprobante !== undefined)) inp = o; } catch (e) {} }
  }
  if (!inp) return { ok: false, motor: 'CLAUDE', error: 'Claude no devolvió operaciones', transitorio: true };
  const ops = (inp.operaciones || []).map(function (o) {
    const notas = [];
    if (o.notas) notas.push('ℹ Nota de lectura: ' + String(o.notas).slice(0, 200));
    return {
      fechaApp: trasFechaTexto_(o.fecha_aplicacion) || trasFechaTexto_(o.fecha_creacion) || '',
      cuentaCargo: trasLimpiarCuenta_(o.cuenta_cargo),
      cuentaBenef: trasLimpiarCuenta_(o.cuenta_beneficiaria),
      monto: trasMonto_(o.importe),
      divisa: o.divisa || '',
      confianza: o.confianza || 'media',
      ilegible: (o.ilegible || []).map(String),
      notas: notas,
      bancoDestino: o.banco_destino || '', alias: o.alias_destino || ''
    };
  });
  // Cuentas con "?" (dígito dudoso) → quedan tal cual para que la validación las marque
  return { ok: true, motor: 'CLAUDE', operaciones: ops, esComprobante: inp.es_comprobante !== false, crudo: JSON.stringify(inp).slice(0, 4000) };
}

/** Deja solo dígitos y "?" (dígito dudoso). Devuelve '' si no hay nada. */
function trasLimpiarCuenta_(s) {
  if (s == null) return '';
  return String(s).replace(/[^0-9?]/g, '');
}

/* ======================================================================
   MOTOR 2 · OCR DE DRIVE + ANALIZADOR
   ====================================================================== */
function trasOcrDrive_(blob) {
  let ultimo = '';
  for (let intento = 0; intento < 3; intento++) {
    let id = null;
    try {
      const recurso = { name: 'OCR_' + Date.now(), mimeType: 'application/vnd.google-apps.document' };
      const f = Drive.Files.create(recurso, blob, { ocr: true, ocrLanguage: TRAS.OCR_IDIOMA });
      id = f.id;
      let texto = '';
      for (let k = 0; k < 4 && !texto; k++) {
        try { texto = DocumentApp.openById(id).getBody().getText() || ''; } catch (e) { ultimo = String(e); }
        if (!texto) Utilities.sleep(900 * (k + 1));
      }
      if (texto) return { ok: true, texto: texto };
      ultimo = ultimo || 'OCR vacío';
    } catch (e) {
      ultimo = String(e && e.message ? e.message : e);
      Utilities.sleep(1200 * (intento + 1));
    } finally {
      if (id) { try { Drive.Files.remove(id); } catch (e) {} }
    }
  }
  return { ok: false, error: ultimo };
}

function trasLeerConDrive_(blob) {
  const o = trasOcrDrive_(blob);
  if (!o.ok) return { ok: false, motor: 'DRIVE', error: 'OCR de Drive: ' + o.error, transitorio: true };
  const p = trasParsearTexto_(o.texto);
  if (!p.operaciones.length) {
    const hayDatos = /\d{9,}/.test(o.texto) || /importe|cuenta|benefici/i.test(o.texto);
    return { ok: !!(!hayDatos), motor: 'DRIVE', operaciones: [], esComprobante: hayDatos ? true : false,
      error: hayDatos ? 'el texto de la captura no se pudo interpretar' : '', crudo: o.texto.slice(0, 4000), transitorio: false };
  }
  return { ok: true, motor: 'DRIVE', operaciones: p.operaciones, esComprobante: true, crudo: o.texto.slice(0, 4000) };
}

/**
 * Analizador de texto OCR. NO usa catálogo ni "corrige" cuentas: solo separa lo que ve.
 * Cuando algo es ambiguo lo avisa en notas con ⚠.
 *
 * Reconoce los formatos vistos en los correos:
 *  A) Portal con bloques "Descripción: … Cuenta de retiro … Cuenta de depósito … Importe … Fecha de aplicación"
 *  B) Tabla "Fecha Aplicación / Cuenta Cargo / … / Importe" (Acendes), una o varias filas
 *  C) "Cuenta Origen / Cuenta Beneficiario / Importe" (BBVA anterior), sin fecha
 */
function trasParsearTexto_(textoCrudo) {
  const texto = String(textoCrudo || '').replace(/\r/g, '');
  const lineas = texto.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
  const notasGlobal = [];

  // --- Bloques (portal) ---
  const idxDesc = []; lineas.forEach(function (l, i) { if (/^descripci[oó]n\s*:?/i.test(l)) idxDesc.push(i); });
  const idxFirmas = []; lineas.forEach(function (l, i) { if (/su operaci[oó]n se encuentra/i.test(l)) idxFirmas.push(i); });
  let bloques;
  if (idxFirmas.length > 1) {
    bloques = idxFirmas.map(function (ini, k) { return lineas.slice(ini, idxFirmas[k + 1] != null ? idxFirmas[k + 1] : lineas.length); });
  } else if (idxDesc.length > 1) {
    bloques = idxDesc.map(function (ini, k) { return lineas.slice(ini, idxDesc[k + 1] != null ? idxDesc[k + 1] : lineas.length); });
  } else {
    bloques = [lineas];
  }

  const operaciones = [];
  bloques.forEach(function (b) {
    const r = trasParsearBloque_(b);
    r.forEach(function (op) { operaciones.push(op); });
  });
  return { operaciones: operaciones, notas: notasGlobal };
}

/** Un bloque de texto → 1..n operaciones (n>1 solo en formato tabla con varias filas). */
function trasParsearBloque_(lineas) {
  const notas = [];
  const cargos = [], benefs = [], fechas = [], montos = [];
  let fechaAplicacion = '', fechaCreacion = '';

  lineas.forEach(function (l, i) {
    // ---- fechas ----
    const rf = /(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/g; let mf;
    while ((mf = rf.exec(l))) {
      const iso = trasISO_(mf[3], mf[2], mf[1]);
      if (!iso) continue;
      if (/aplicaci/i.test(l)) fechaAplicacion = iso;
      else if (/creaci/i.test(l)) fechaCreacion = iso;
      else fechas.push(iso);
    }
    // ---- cuentas (corridas de dígitos) ----
    const rc = /\d{9,}/g; let mc;
    const sinFechas = l.replace(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/g, ' ');
    while ((mc = rc.exec(sinFechas))) {
      let d = mc[0];
      // año pegado delante de la cuenta (p. ej. 202621003720010 = 2026 + 21003720010)
      if (d.length >= 14 && d.length <= 15 && /^20[2-3]\d/.test(d) && (d.length - 4 === 10 || d.length - 4 === 11)) {
        notas.push('⚠ El OCR pegó el año "' + d.slice(0, 4) + '" a la cuenta de cargo; se separó.');
        d = d.slice(4);
      }
      if (d.length === 28 || d.length === 29) {          // cargo + beneficiaria pegadas
        const cut = d.length - 18; notas.push('⚠ El OCR pegó dos cuentas; se separaron.');
        cargos.push(d.slice(0, cut)); benefs.push(d.slice(cut)); continue;
      }
      if (d.length === 18) benefs.push(d);
      else if (d.length >= 10 && d.length <= 11) cargos.push(d);
      else if (d.length === 19 || d.length === 17 || d.length === 16) benefs.push(d);       // CLABE mal leída: la validación la marcará
      else cargos.push(d);
    }
    // ---- importes ----
    const sinCuentas = sinFechas.replace(/\d{9,}/g, ' ');
    const ri = /\$?\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})(?!\d)/g; let mi;
    while ((mi = ri.exec(sinCuentas))) {
      const n = trasMonto_(mi[1]); if (n != null && n > 0) montos.push(n);
    }
  });

  // ---- elegir fecha ----
  let fecha = fechaAplicacion || '';
  if (!fecha) {
    const unicas = fechas.filter(function (f, i) { return fechas.indexOf(f) === i; });
    if (unicas.length === 1) fecha = unicas[0];
    else if (fechaCreacion) fecha = fechaCreacion;
    else if (unicas.length > 1) { fecha = unicas[0]; notas.push('⚠ Hay varias fechas en la captura (' + unicas.map(trasISOaDDMMYYYY_).join(', ') + '); revisa cuál es la de aplicación.'); }
  }

  // ---- cuántas operaciones ----
  const n = Math.max(cargos.length, benefs.length, 0);
  if (n === 0 && montos.length === 0) return [];
  const ops = [];

  // Importes: duplicados adyacentes (500000.00 y $500,000.00 son lo mismo)
  let imps = montos.slice();
  if (n > 0 && imps.length !== n) {
    if (imps.length === 2 * n && imps.every(function (x, i) { return i % 2 === 1 || x === imps[i + 1]; })) imps = imps.filter(function (x, i) { return i % 2 === 0; });
    else {
      const comprimido = imps.filter(function (x, i) { return !(i > 0 && imps[i - 1] === x); });
      if (comprimido.length === n) imps = comprimido;
      else if (imps.length > n && imps.every(function (x) { return x === imps[0]; })) imps = [imps[0]];
    }
  }
  const ambiguo = [];
  if (n > 0 && cargos.length !== n) ambiguo.push('cuentas de cargo (' + cargos.length + ' de ' + n + ')');
  if (n > 0 && benefs.length !== n) ambiguo.push('cuentas beneficiarias (' + benefs.length + ' de ' + n + ')');
  if (n > 0 && imps.length !== n && !(imps.length === 1)) ambiguo.push('importes (' + imps.length + ' de ' + n + ')');

  const total = Math.max(n, 1);
  for (let i = 0; i < total; i++) {
    const misNotas = notas.slice();
    if (ambiguo.length) misNotas.push('⚠ El OCR no dejó claro el emparejamiento de ' + ambiguo.join(', ') + '. Compara con la captura.');
    let monto = imps.length === total ? imps[i] : (imps.length === 1 ? imps[0] : null);
    if (imps.length === 1 && total > 1) misNotas.push('⚠ Solo se leyó un importe para ' + total + ' operaciones: se repitió; confirma en la captura.');
    ops.push({
      fechaApp: fecha,
      cuentaCargo: cargos.length === total ? cargos[i] : (cargos.length === 1 ? cargos[0] : (cargos[i] || '')),
      cuentaBenef: benefs.length === total ? benefs[i] : (benefs.length === 1 ? benefs[0] : (benefs[i] || '')),
      monto: monto,
      divisa: '', confianza: ambiguo.length ? 'baja' : 'media', ilegible: [], notas: misNotas
    });
  }
  return ops;
}
