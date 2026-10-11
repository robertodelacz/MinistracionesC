/* ==========================================================================
   OCR CON CLAUDE (HAIKU) PARA TU Traspasos.gs DE SIEMPRE
   --------------------------------------------------------------------------
   Este archivo NO reemplaza nada: solo agrega un motor de lectura mejor.
   Tu código viejo sigue haciendo todo lo demás (buscar correos, comparar
   fecha / cuenta cargo / cuenta beneficiaria, pintar, etc.).

   Cómo trabaja: Claude "ve" la captura y devuelve las filas ya separadas
   (fecha, cuenta cargo, cuenta beneficiaria, importe), con el mismo formato
   que antes entregaba parsearMultiples_(). Si Claude falla o no hay clave,
   tu código sigue con el OCR de Drive de siempre (respaldo automático).

   PRIVACIDAD: con este motor la imagen de la captura sale de Google hacia la
   API de Anthropic. Si eso no es aceptable, no guardes la clave.
   ========================================================================== */

const OCRC_MODELO = 'claude-haiku-5-5';
const OCRC_URL    = 'https://api.anthropic.com/v1/messages';
const OCRC_MAX_BYTES = 4.5 * 1024 * 1024;     // la API acepta imágenes de hasta ~5 MB
var MOTOR_OCR_ULTIMO = '';                    // 'CLAUDE' o 'DRIVE' (para el log)
var OCRC_APAGADO = false;                     // si la clave da 401/403 no se reintenta en esta corrida

const OCRC_PROMPT =
  'Eres un transcriptor de comprobantes bancarios mexicanos (capturas de portales como BBVA, Inbursa, Bancrea, Acendes, ' +
  'Tesocualli, etc.). Copia fielmente lo que se ve; nunca interpretes ni corrijas.\n' +
  'Reglas:\n' +
  '1. Cada bloque o renglón de operación distinto es UNA operación, aunque otra tenga exactamente los mismos datos. ' +
  'Si la imagen muestra tres operaciones iguales, devuelve tres.\n' +
  '2. Copia las cuentas dígito por dígito, sin espacios. NUNCA agregues, quites ni "arregles" dígitos. ' +
  'Si un dígito es dudoso, ponle "?" en su lugar.\n' +
  '3. "cuenta_cargo" = cuenta de la que sale el dinero (origen / retiro / cargo). ' +
  '"cuenta_beneficiaria" = cuenta que recibe (destino / depósito / beneficiario).\n' +
  '4. El importe tal como aparece (ej. "5,000,000.00"). Las fechas como aparecen (dd/mm/aaaa). Si no hay fecha, null.\n' +
  '5. Si la imagen no es un comprobante o solicitud de traspaso (logo, firma, foto), es_comprobante=false y operaciones vacías.\n' +
  'Entrega SIEMPRE el resultado llamando a la herramienta registrar_operaciones.';

const OCRC_HERRAMIENTA = {
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
            fecha_aplicacion: { type: ['string', 'null'], description: 'Fecha de aplicación u operación, como se ve' },
            cuenta_cargo: { type: ['string', 'null'] },
            cuenta_beneficiaria: { type: ['string', 'null'] },
            importe: { type: ['string', 'null'] }
          },
          required: ['cuenta_cargo', 'cuenta_beneficiaria', 'importe']
        }
      }
    },
    required: ['es_comprobante', 'operaciones']
  }
};

/**
 * Lee la captura con Claude. Devuelve [] si no hay clave o algo falla (entonces tu código usa el OCR de Drive).
 * Cada fila: { fechaAplicacion:'dd/mm/yyyy' | '', cuentaCargo, cuentaBeneficiario, importe }
 */
function ocrClaudeFilas_(blob, asunto) {
  MOTOR_OCR_ULTIMO = 'DRIVE';
  const clave = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!clave || OCRC_APAGADO) return [];
  try {
    const bytes = blob.getBytes();
    if (bytes.length > OCRC_MAX_BYTES) { Logger.log('Claude: imagen muy pesada, se usa Drive'); return []; }
    let tipo = String(blob.getContentType() || '').toLowerCase();
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(tipo)) tipo = /\.jpe?g$/i.test(blob.getName() || '') ? 'image/jpeg' : 'image/png';
    const cuerpo = {
      model: OCRC_MODELO,
      max_tokens: 3000,
      system: OCRC_PROMPT,
      tools: [OCRC_HERRAMIENTA],      // sin tool_choice forzado: algunos modelos lo rechazan con HTTP 400
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: tipo, data: Utilities.base64Encode(bytes) } },
        { type: 'text', text: 'Transcribe las operaciones de esta captura llamando a registrar_operaciones. Asunto del correo (solo contexto): ' + String(asunto || '').slice(0, 200) }
      ] }]
    };
    const opciones = { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': clave, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(cuerpo) };
    for (let i = 0; i < 3; i++) {
      let r;
      try { r = UrlFetchApp.fetch(OCRC_URL, opciones); } catch (e) { Utilities.sleep(1500 * (i + 1)); continue; }
      const cod = r.getResponseCode(), txt = r.getContentText();
      if (cod === 200) {
        const filas = ocrcInterpretar_(txt);
        if (filas.length) MOTOR_OCR_ULTIMO = 'CLAUDE';
        return filas;
      }
      Logger.log('Claude HTTP ' + cod + ' ' + String(txt).slice(0, 300));
      if (cod === 401 || cod === 403) { OCRC_APAGADO = true; return []; }
      if (cod === 400 || cod === 404) return [];
      Utilities.sleep(2000 * (i + 1));
    }
  } catch (e) { Logger.log('ocrClaudeFilas_: ' + e); }
  return [];
}

function ocrcInterpretar_(txtRespuesta) {
  let j; try { j = JSON.parse(txtRespuesta); } catch (e) { return []; }
  const cont = j.content || [];
  const bloque = cont.filter(function (b) { return b.type === 'tool_use' && b.name === 'registrar_operaciones'; })[0];
  let inp = bloque && bloque.input ? bloque.input : null;
  if (!inp) {                                  // respaldo: JSON dentro de texto
    const t = cont.filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n');
    const m = /\{[\s\S]*\}/.exec(t);
    if (m) { try { inp = JSON.parse(m[0]); } catch (e) {} }
  }
  if (!inp || inp.es_comprobante === false) return [];
  return (inp.operaciones || []).map(function (o) {
    return {
      fechaAplicacion: ocrcFecha_(o.fecha_aplicacion),
      cuentaCargo: String(o.cuenta_cargo == null ? '' : o.cuenta_cargo).replace(/[^0-9?]/g, ''),
      cuentaBeneficiario: String(o.cuenta_beneficiaria == null ? '' : o.cuenta_beneficiaria).replace(/[^0-9?]/g, ''),
      importe: ocrcImporte_(o.importe)
    };
  }).filter(function (f) { return f.cuentaCargo || f.cuentaBeneficiario || f.importe; });
}

function ocrcFecha_(s) {
  const t = String(s == null ? '' : s);
  let m = t.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + (m[3].length === 2 ? '20' + m[3] : m[3]);
  m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1] : '';
}
function ocrcImporte_(s) {
  const n = Number(String(s == null ? '' : s).replace(/,/g, '').replace(/[^0-9.]/g, ''));
  return isFinite(n) && n > 0 ? n : '';
}

/** Menú o editor: guarda la clave de Claude (se queda en propiedades privadas del script). */
function guardarClaveClaude() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt('Clave de Claude (API)', 'Pega tu clave. Vacía = quitarla (se usa solo el OCR de Drive).', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = String(r.getResponseText() || '').trim();
  const p = PropertiesService.getScriptProperties();
  if (!k) { p.deleteProperty('ANTHROPIC_API_KEY'); ui.alert('Clave eliminada.'); return; }
  p.setProperty('ANTHROPIC_API_KEY', k); ui.alert('Clave guardada.');
}

/** Prueba rápida de un correo: muestra qué leyó Claude, sin escribir nada en la hoja. */
function probarClaudeConCorreo(messageId) {
  const msg = GmailApp.getMessageById(messageId);
  if (!msg) { Logger.log('Mensaje no encontrado'); return; }
  const att = seleccionarImagenAdjunta_(msg.getAttachments());
  if (!att) { Logger.log('Ese correo no trae una imagen válida: ' + (msg.getAttachments() || []).map(function (a) { return a.getName() + ' [' + a.getContentType() + ']'; }).join('; ')); return; }
  const filas = ocrClaudeFilas_(att, msg.getSubject());
  Logger.log('Motor: ' + MOTOR_OCR_ULTIMO + ' · filas: ' + filas.length + '\n' + JSON.stringify(filas, null, 1));
}
