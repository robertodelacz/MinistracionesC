
// ---- Columnas en Solicitudes2026 ----
const COL_LIN = 1;      // A
const COL_FECHA = 3;    // C
const COL_MONTO = 4;    // D
const COL_CLABE = 26;   // Z
const COL_MSG_ID = 34;  // 

// ---- Configuración de búsqueda ----
const DIAS_VENTANA_BUSQUEDA = 3;      // 
const LOTE_BUSQUEDA = 50;             // 
const MAX_THREADS_POR_CORRIDA = 500;  //

function extraerDatosDispersión() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    Logger.log("⏭️ No se pudo obtener lock (otra ejecución en curso).");
    return;
  }

  try {
    const cache = CacheService.getScriptCache();
    const ultimaEjecucion = cache.get('ultimaEjecucion');
    const ahora = new Date().getTime();

    if (ultimaEjecucion && (ahora - parseInt(ultimaEjecucion, 10)) < 120000) {
      Logger.log("⏭️ Salteando ejecución - muy pronto desde la última");
      return;
    }
    cache.put('ultimaEjecucion', ahora.toString(), 600);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const hojaBase = ss.getSheetByName("Solicitudes2026");
    const hojaLog = ss.getSheetByName("Log") || ss.insertSheet("Log");

    if (hojaLog.getLastRow() === 0) {
      hojaLog.appendRow(["Fecha Log", "LIN", "CLABE", "Monto", "Nombre Empresa", "Fecha y hora correo", "ID mensaje", "Estado"]);
    }

    const today = new Date();
    const hoyStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');

    const idSet = construirIdSetDesdeLog_(hojaLog);

    let filaCursor = calcularPrimeraFilaVacia_(hojaBase, COL_LIN);

    const fechaDesde = new Date(today.getTime() - DIAS_VENTANA_BUSQUEDA * 24 * 60 * 60 * 1000);
    const query = `subject:"LIN:" after:${formatGmailDate(fechaDesde)} -in:trash`;
    const threads = buscarThreadsPaginado_(query);
    Logger.log(`🔍 Búsqueda realizada (${DIAS_VENTANA_BUSQUEDA} días): ${threads.length} threads encontrados`);

    if (threads.length === 0) {
      Logger.log("📭 No hay correos para procesar en la ventana de búsqueda");
      return;
    }

    let allMessages = [];
    threads.forEach(thread => {
      allMessages = allMessages.concat(thread.getMessages());
    });
    allMessages.sort((a, b) => a.getDate() - b.getDate());

    let procesados = 0;
    let saltados = 0;
    const idsEnEstaCorrida = new Set();

    allMessages.forEach(msg => {
      try {
        const messageId = msg.getId();
        const subject = msg.getSubject();

        if (idsEnEstaCorrida.has(messageId)) {
          saltados++;
          return;
        }
        idsEnEstaCorrida.add(messageId);

        if (idSet.has(messageId)) {
          saltados++;
          return;
        }

        const fechaHoraCorreo = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss').trim();
        const fechaSoloCorreo = Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), 'dd/MM/yyyy');

        if (subject.includes("Solicitud autorizada")) {
          registrarLog(hojaLog, hoyStr, "N/A", "N/A", "N/A", "N/A", fechaHoraCorreo, messageId, "⏭️ Ignorado: solicitud autorizada");
          idSet.add(messageId);
          saltados++;
          return;
        }

        const empiezaConNumero = /^\d{6}\s*\|/.test(subject);
        if (!empiezaConNumero) {
          registrarLog(hojaLog, hoyStr, "N/A", "N/A", "N/A", "N/A", fechaHoraCorreo, messageId, "⏭️ Ignorado: formato de asunto inválido");
          idSet.add(messageId);
          saltados++;
          return;
        }

        const body = msg.getPlainBody();

        const linAsuntoMatch = subject.match(/LIN:\s*0*([1-9]\d*)/);
        const linAsunto = linAsuntoMatch ? linAsuntoMatch[1] : "";

        const linCuerpoMatch = body.match(/Línea de Crédito:\s*LIN:\s*0*([1-9]\d*)/);
        const linCuerpo = linCuerpoMatch ? linCuerpoMatch[1] : "";

        const empresaMatch = body.match(/Cliente:\s*(.*)/);
        const nombreEmpresa = empresaMatch ? empresaMatch[1].trim() : "No encontrado";

        const montoMatch = body.match(/Monto de la disposición:\s*\$([0-9,.\s]+)/);
        const monto = montoMatch ? montoMatch[1].trim() : "";

        if (!linAsunto || !linCuerpo || linAsunto !== linCuerpo) {
          registrarLog(hojaLog, hoyStr, linAsunto || "N/A", "N/A", monto || "N/A", nombreEmpresa, fechaHoraCorreo, messageId, "❌ Error: LIN no coincide");
          idSet.add(messageId);
          saltados++;
          return;
        }

        const clabeMatch = body.match(/Cuenta CLABE:\s*(\d{18})/);
        const clabe = clabeMatch ? clabeMatch[1] : "";

        if (!clabe) {
          registrarLog(hojaLog, hoyStr, linAsunto, "N/A", monto || "N/A", nombreEmpresa, fechaHoraCorreo, messageId, "❌ Error: CLABE no encontrada");
          idSet.add(messageId);
          saltados++;
          return;
        }

        const filaFinal = filaCursor;
        hojaBase.getRange(filaFinal, COL_LIN).setValue(linAsunto).setBackground("#fb0000");
        hojaBase.getRange(filaFinal, COL_FECHA).setValue(fechaSoloCorreo).setBackground("#ffe100");
        hojaBase.getRange(filaFinal, COL_MONTO).setValue(monto);
        hojaBase.getRange(filaFinal, COL_CLABE).setValue(clabe);
        hojaBase.getRange(filaFinal, COL_MSG_ID).setValue(messageId);
        filaCursor++;

        registrarLog(hojaLog, hoyStr, linAsunto, clabe, monto, nombreEmpresa, fechaHoraCorreo, messageId, "✅ Procesado OK — Insertado en base");
        idSet.add(messageId);

        msg.markRead();
        procesados++;
        Logger.log(`✅ Procesado - LIN: ${linAsunto}, CLABE: ${clabe}, Monto: ${monto}`);

      } catch (errMsg) {
        Logger.log(`💥 Error inesperado procesando mensaje: ${errMsg}`);
        try {
          registrarLog(hojaLog, hoyStr, "N/A", "N/A", "N/A", "N/A", "N/A", msg.getId(), `💥 Error inesperado: ${errMsg}`);
        } catch (errLog) {
          Logger.log(`💥 Además falló el registro en Log: ${errLog}`);
        }
        saltados++;
      }
    });

    Logger.log(`\n📊 RESUMEN: ${procesados} procesados, ${saltados} saltados`);

  } finally {
    lock.releaseLock();
  }
}

function construirIdSetDesdeLog_(hojaLog) {
  const idSet = new Set();
  const lastRow = hojaLog.getLastRow();
  if (lastRow < 2) return idSet; 

  const ids = hojaLog.getRange(2, 7, lastRow - 1, 1).getValues(); // columna "ID mensaje"
  ids.forEach(r => {
    const id = r[0];
    if (id && id.toString().trim() !== "") idSet.add(id.toString().trim());
  });
  return idSet;
}

function calcularPrimeraFilaVacia_(hoja, columna) {
  const valores = hoja.getRange(1, columna, hoja.getMaxRows(), 1).getValues();
  const idx = valores.findIndex(r => !r[0]);
  return idx >= 0 ? idx + 1 : hoja.getLastRow() + 1;
}

function buscarThreadsPaginado_(query) {
  let start = 0;
  let resultados = [];
  while (start < MAX_THREADS_POR_CORRIDA) {
    const lote = GmailApp.search(query, start, LOTE_BUSQUEDA);
    if (lote.length === 0) break;
    resultados = resultados.concat(lote);
    if (lote.length < LOTE_BUSQUEDA) break;
    start += LOTE_BUSQUEDA;
  }
  return resultados;
}

function registrarLog(hojaLog, fechaLog, lin, clabe, monto, empresa, fechaHoraCorreo, idMensaje, estado) {
  hojaLog.appendRow([fechaLog, lin, clabe, monto, empresa, fechaHoraCorreo, idMensaje, estado]);
}

function formatGmailDate(fecha) {
  const year = fecha.getFullYear();
  const month = (fecha.getMonth() + 1).toString().padStart(2, '0');
  const day = fecha.getDate().toString().padStart(2, '0');
  return `${year}/${month}/${day}`;
}
