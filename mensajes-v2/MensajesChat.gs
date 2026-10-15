/* ============================================================
   MENSAJES AL CHAT  ·  Generar y Publicar en dos pasos

   Hoja "Mensajes" (una fila por solicitud):
     A Fecha · B Cliente · C No. Línea · D Vencimiento LC · E Fecha Vencimiento
     F Estatus/Saldo · G Monto · H Moneda · I Comentarios · J Validación
     K [ ] Generar Dispersión   -> arma el texto en M (no envía nada)
     L [ ] Generar Vencimiento  -> arma el texto en N (no envía nada)
     M Mensaje de Dispersión    N Mensaje de Vencimiento
     O [ ] Publicar Dispersión  -> envía M al chat por webhook
     P [ ] Publicar Vencimiento -> envía N al chat por webhook
     Q Enviado (Dispersión)     R Enviado (Vencimiento)
     S1 / S2  claves de hilo del chat (Dispersión / Vencimiento)
     T Validado por (correo)    U Fecha y hora de la validación      <- NUEVAS

   QUIÉN VALIDÓ: el chat lo publica un bot, así que el mensaje no dice quién fue.
   Ahora, cuando alguien cambia J a "Validado" o "Rechazado", el On Edit guarda su
   correo en T y la hora en U (registrarValidacion). El mensaje agrega la línea
   "✅ Validado por: <nombre>" con esos datos.
   Si T está vacía (filas anteriores), se usa quien marcó "Generar" y se anota en U.

   WEBHOOK: la URL NO va en el código. Se guarda una sola vez con configurarWebhook()
   (o en Configuración del proyecto > Propiedades del script > WEBHOOK_URL).
   ============================================================ */

const CONFIG_MENSAJES = {
  sheetName: "Mensajes",
  hojaSolicitudes: "Solicitudes2026",
  dataStartRow: 2,
  dateFormat: "dd/MM/yy",
  zonaHorariaRespaldo: "America/Mexico_City",
  columns: {
    fecha: 1,                 // A
    nombreCliente: 2,         // B
    noLinea: 3,               // C
    vencimientoLC: 4,         // D
    fechaVencimiento: 5,      // E
    estadoSaldo: 6,           // F
    monto: 7,                 // G
    moneda: 8,                // H
    comentarios: 9,           // I
    validacion: 10,           // J
    generarDispersion: 11,    // K
    generarVencimiento: 12,   // L
    mensajeDispersion: 13,    // M
    mensajeVencimiento: 14,   // N
    publicarDispersion: 15,   // O
    publicarVencimiento: 16,  // P
    enviadoD: 17,             // Q
    enviadoV: 18,             // R
    validadoPor: 20,          // T  (confirma que T y U estén libres en tu hoja)
    fechaValidacion: 21       // U
  },
  validacionValores: { validado: "Validado", rechazado: "Rechazado" },
  webhook: { threadKeyCellDispersion: "S1", threadKeyCellVencimiento: "S2" },

  // Cómo se muestra cada correo en el chat. Si no está aquí, se arma con el correo
  // (juan.perez@cualli.mx -> "Juan Perez"). Agrega a tu gente para que salga bien escrito.
  nombresUsuarios: {
    "robertodelacruz@cualli.mx": "Roberto De la Cruz"
  },

  emojis: {
    notification: "🔔", alert: "🚨", date: "🗓️", client: "🧑‍💼", status: "🎯", money: "💲",
    comments: "📝", check: "✅", reject: "❌", line: "#️⃣", dueDate: "⏰", lc: "🚥", user: "👤"
  }
};

/* ============================================================
   UTILIDADES
   ============================================================ */
function msgTz_() {
  try { const z = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); if (z) return z; } catch (e) {}
  try { const z = Session.getScriptTimeZone(); if (z) return z; } catch (e) {}
  return CONFIG_MENSAJES.zonaHorariaRespaldo;
}

/** Aviso visible en la hoja (toast) y, además, queda escrito en la hoja "LogMensajes". Nunca lanza error. */
function msgAviso_(texto, titulo) {
  try { SpreadsheetApp.getActiveSpreadsheet().toast(String(texto), titulo || "Mensajes", 8); } catch (e) {}
  msgLog_(titulo || "Aviso", texto);
}

/**
 * Bitácora para ver qué pasó realmente (y en qué orden) cuando algo no cuadra.
 * Crea la hoja "LogMensajes" sola; guarda máximo ~400 renglones.
 */
function msgLog_(origen, detalle) {
  try { Logger.log(origen + ": " + detalle); } catch (e) {}
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let h = ss.getSheetByName("LogMensajes");
    if (!h) {
      h = ss.insertSheet("LogMensajes");
      h.appendRow(["Fecha y hora", "Origen", "Detalle"]);
    }
    h.appendRow([Utilities.formatDate(new Date(), msgTz_(), "dd/MM/yy HH:mm:ss"), String(origen), String(detalle)]);
    const n = h.getLastRow();
    if (n > 450) h.deleteRows(2, n - 400);
  } catch (e) {}
}

/** "$1,234.50", "1234.5 MX", 1234.5  ->  1234.5   (NaN si no se puede) */
function msgNum_(v) {
  if (typeof v === "number") return v;
  const s = String(v == null ? "" : v).replace(/[^0-9.\-]/g, "");
  if (s === "" || s === "-" || s === ".") return NaN;
  return Number(s);
}

/** 550000 -> "550,000.00"  (no depende de toLocaleString) */
function msgFmtMonto_(n) {
  const partes = Math.abs(n).toFixed(2).split(".");
  return (n < 0 ? "-" : "") + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + partes[1];
}

/** Date | número de serie de Sheets | "dd/mm/aa(aa)" | "aaaa-mm-dd"  ->  Date válida o null */
function msgFecha_(v) {
  if (Object.prototype.toString.call(v) === "[object Date]") return isNaN(v.getTime()) ? null : v;
  const aFecha = function (y, m, d) {                  // mediodía UTC: no se corre de día en ninguna zona de México
    const f = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    return (f.getUTCMonth() === m - 1 && f.getUTCDate() === d) ? f : null;
  };
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const f = new Date(Math.round((v - 25569) * 86400 * 1000));
    return aFecha(f.getUTCFullYear(), f.getUTCMonth() + 1, f.getUTCDate());
  }
  if (typeof v === "string") {
    let m = v.trim().match(/^(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})$/);
    if (m) { let y = +m[3]; if (y < 100) y += 2000; return aFecha(y, +m[2], +m[1]); }
    m = v.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return aFecha(+m[1], +m[2], +m[3]);
  }
  return null;
}
function msgFmtFecha_(f) { return Utilities.formatDate(f, msgTz_(), CONFIG_MENSAJES.dateFormat); }
function msgDia_(f) { return Utilities.formatDate(f, msgTz_(), "yyyyMMdd"); }

function msgNombreUsuario_(email) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) return "No identificado";
  const mapa = CONFIG_MENSAJES.nombresUsuarios || {};
  if (mapa[e]) return mapa[e];
  if (e.indexOf("@") < 0) return String(email).trim();          // ya es un nombre (p. ej. "No identificado")
  return e.split("@")[0].replace(/[._\-]+/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

/** Correo de quien hizo la edición. SOLO se confía en el evento; nunca en quien ejecuta el disparador. */
function msgCorreoDeEvento_(e) {
  try { if (e && e.user && e.user.getEmail && e.user.getEmail()) return String(e.user.getEmail()).toLowerCase(); } catch (x) {}
  try { if (!e) { const c = Session.getActiveUser().getEmail(); if (c) return String(c).toLowerCase(); } } catch (x) {}   // ejecución manual
  return "";
}

/* ============================================================
   WEBHOOK
   ============================================================ */
/** Guarda la URL del webhook (se queda en propiedades privadas del script). */
function configurarWebhook() {
  const ui = SpreadsheetApp.getUi();
  const r = ui.prompt("Webhook de Google Chat", "Pega la URL completa del webhook (empieza con https://chat.googleapis.com/). Vacía = borrarla.", ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const url = String(r.getResponseText() || "").trim();
  const props = PropertiesService.getScriptProperties();
  if (!url) { props.deleteProperty("WEBHOOK_URL"); ui.alert("Webhook eliminado."); return; }
  if (!/^https:\/\/chat\.googleapis\.com\/v1\/spaces\/[^/]+\/messages\?/.test(url)) {
    ui.alert("Esa URL no parece un webhook de Google Chat. No se guardó.");
    return;
  }
  props.setProperty("WEBHOOK_URL", url);
  ui.alert("Webhook guardado. Puedes probarlo con probarWebhook().");
}

/** Manda un mensaje de prueba al hilo de Dispersión (S1). */
function probarWebhook() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_MENSAJES.sheetName);
  const clave = sheet ? sheet.getRange(CONFIG_MENSAJES.webhook.threadKeyCellDispersion).getValue() : "";
  const ok = enviarMensajeWebhook_("🧪 Prueba de conexión del bot (" + msgNombreUsuario_(msgCorreoDeEvento_(null)) + ")", clave || "prueba");
  msgAviso_(ok ? "Webhook OK: revisa el chat." : "El webhook falló: revisa la URL (configurarWebhook) y el registro de ejecución.", "Webhook");
  return ok;
}

/**
 * Envía un texto al webhook de Google Chat, a un hilo.
 * claveHilo "spaces/.../threads/..." = hilo existente; cualquier otro texto = threadKey libre.
 * Reintenta ante 429 / 5xx. Devuelve true/false.
 */
function enviarMensajeWebhook_(texto, claveHilo) {
  const webhookUrl = PropertiesService.getScriptProperties().getProperty("WEBHOOK_URL");
  if (!webhookUrl) { msgAviso_("No hay URL de webhook guardada. Corre configurarWebhook().", "Webhook"); return false; }
  if (!claveHilo) { msgAviso_("Falta la clave de hilo en S1 (Dispersión) o S2 (Vencimiento). No se envió.", "Webhook"); return false; }

  const valor = claveHilo.toString().trim();
  const esHiloReal = valor.indexOf("spaces/") === 0 && valor.indexOf("/threads/") > 0;
  const opciones = {
    method: "post",
    contentType: "application/json; charset=UTF-8",
    payload: JSON.stringify({ text: texto, thread: esHiloReal ? { name: valor } : { threadKey: valor } }),
    muteHttpExceptions: true
  };
  const url = webhookUrl + (webhookUrl.indexOf("?") >= 0 ? "&" : "?") + "messageReplyOption=REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD";

  for (let intento = 0; intento < 3; intento++) {
    try {
      const resp = UrlFetchApp.fetch(url, opciones);
      const codigo = resp.getResponseCode();
      if (codigo === 200) return true;
      Logger.log("Webhook código " + codigo + ": " + String(resp.getContentText()).slice(0, 300));
      if (codigo !== 429 && codigo < 500) return false;          // 4xx (URL mala, hilo inexistente...): reintentar no ayuda
    } catch (err) {
      Logger.log("Excepción en webhook: " + err.message);
    }
    Utilities.sleep(1500 * (intento + 1));
  }
  return false;
}

/* ============================================================
   QUIÉN VALIDÓ  (lo llama el On Edit cuando se edita la columna J)
   ============================================================ */
function registrarValidacion(fila, correo) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_MENSAJES.sheetName);
  if (!sheet || fila < CONFIG_MENSAJES.dataStartRow) return;
  const C = CONFIG_MENSAJES.columns;
  const estatus = sheet.getRange(fila, C.validacion).getValue();
  const celdaQuien = sheet.getRange(fila, C.validadoPor), celdaCuando = sheet.getRange(fila, C.fechaValidacion);

  [[C.validadoPor, "VALIDADO POR"], [C.fechaValidacion, "FECHA/HORA VALIDACIÓN"]].forEach(function (h) {
    const c = sheet.getRange(1, h[0]); if (!c.getValue()) c.setValue(h[1]);
  });

  if (estatus === CONFIG_MENSAJES.validacionValores.validado || estatus === CONFIG_MENSAJES.validacionValores.rechazado) {
    celdaQuien.setValue(correo || "No identificado");
    celdaCuando.setNumberFormat("dd/MM/yy HH:mm").setValue(new Date());
    if (!correo) msgAviso_("No se pudo identificar quién validó la fila " + fila + ". Quedó como 'No identificado'.", "Validación");
    else if (sheet.getRange(fila, C.mensajeDispersion).getValue() && String(sheet.getRange(fila, C.enviadoD).getValue() || "").indexOf("Enviado") !== 0)
      msgAviso_("Fila " + fila + ": ya había un mensaje generado. Vuelve a marcar Generar (K) para que lleve al nuevo validador.", "Validación");
  } else {
    celdaQuien.setValue(""); celdaCuando.setValue("");      // si regresa a pendiente, se borra el rastro
  }
}

/* ============================================================
   TEXTO DE LOS MENSAJES
   ============================================================ */
function msgTextoDispersion_(d) {
  const E = CONFIG_MENSAJES.emojis;
  const esValidado = d.estatus === CONFIG_MENSAJES.validacionValores.validado;
  const titulo = esValidado ? "NUEVA SOLICITUD" : "SOLICITUD RECHAZADA";
  const icono = esValidado ? E.notification : "🚫";
  // Una sola línea: el estatus y quién lo dio (antes eran dos y se repetía "Validado")
  const lineaEstatus = (esValidado ? E.check + " Validado por" : E.reject + " Rechazado por") + ": *" + msgNombreUsuario_(d.quien) + "*";
  return (icono + " *" + titulo + "*\n\n" +
    E.date + " Fecha: *" + msgFmtFecha_(d.fecha) + "*\n" +
    E.client + " Cliente: *" + d.cliente + "*\n" +
    E.line + " No. Línea: *" + d.linea + "*\n" +
    E.status + " Estatus: *" + d.estadoSaldo + "*\n" +
    E.money + " Solicitud por: *$" + msgFmtMonto_(d.monto) + "* - *" + d.moneda + "*\n" +
    E.comments + " Comentarios: *" + d.comentarios + "*\n\n" +
    lineaEstatus).trim();
}

function msgTextoVencimiento_(d) {
  const E = CONFIG_MENSAJES.emojis;
  return (E.alert + " *PROXIMO VENCIMIENTO*\n\n" +
    E.date + " Fecha: *" + msgFmtFecha_(d.fecha) + "*\n" +
    E.client + " Cliente: *" + d.cliente + "*\n" +
    E.line + " No. Línea: *" + d.linea + "*\n" +
    E.lc + " Vencimiento LC: *" + d.vencimientoLC + "*\n" +
    E.dueDate + " Fecha Vencimiento: *" + msgFmtFecha_(d.fechaVenc) + "*").trim();
}

/* ============================================================
   GENERAR: arma el texto en M / N. NO envía nada.
   filaEspecifica: solo esa fila (lo que hace onEdit); sin ella, toda la hoja.
   tipo: "dispersion" | "vencimiento" | (vacío = ambos)
   correoUsuario: quien marcó el checkbox (respaldo si T está vacía)
   ============================================================ */
function generarMensajes(filaEspecifica, tipo, correoUsuario) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_MENSAJES.sheetName);
    if (!sheet) throw new Error('No se encontró la hoja "' + CONFIG_MENSAJES.sheetName + '".');
    const C = CONFIG_MENSAJES.columns;
    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG_MENSAJES.dataStartRow) return;
    if (filaEspecifica && filaEspecifica > lastRow) return;

    const filaInicio = filaEspecifica || CONFIG_MENSAJES.dataStartRow;
    const numFilas = filaEspecifica ? 1 : (lastRow - CONFIG_MENSAJES.dataStartRow + 1);
    const datos = sheet.getRange(filaInicio, 1, numFilas, C.fechaValidacion).getValues();
    const v = function (row, k) { return row[C[k] - 1]; };

    let genD = 0, genV = 0, pendientes = 0;
    datos.forEach(function (row, i) {
      const fila = filaInicio + i;
      try {
        // ---------- Dispersión ----------
        if ((tipo === "dispersion" || !tipo) && v(row, "generarDispersion") === true) {
          const estatus = v(row, "validacion");
          const monto = msgNum_(v(row, "monto"));
          const fecha = msgFecha_(v(row, "fecha"));
          const cliente = String(v(row, "nombreCliente") || "").split(",")[0].trim();

          if (!cliente || !v(row, "noLinea") || !v(row, "estadoSaldo") || !v(row, "moneda")) {
            msgAviso_("Fila " + fila + ": faltan datos (cliente, línea, estatus o moneda). No se generó.", "Dispersión");
          } else if (isNaN(monto)) {
            msgAviso_("Fila " + fila + ": el monto no es un número válido. No se generó.", "Dispersión");
          } else if (!fecha) {
            msgAviso_("Fila " + fila + ": la fecha (A) no es válida. No se generó.", "Dispersión");
          } else if (estatus !== CONFIG_MENSAJES.validacionValores.validado && estatus !== CONFIG_MENSAJES.validacionValores.rechazado) {
            msgAviso_("Fila " + fila + ": primero marca Validado o Rechazado en J.", "Dispersión");
            pendientes++;
          } else {
            let quien = String(v(row, "validadoPor") || "").trim();
            if (!quien) {                                   // fila sin rastro de J: se usa a quien generó y se anota
              quien = String(correoUsuario || "").trim().toLowerCase();
              if (quien) {
                sheet.getRange(fila, C.validadoPor).setValue(quien);
                sheet.getRange(fila, C.fechaValidacion).setValue("registrado al generar " + Utilities.formatDate(new Date(), msgTz_(), "dd/MM/yy HH:mm"));
              }
            }
            const comentarios = v(row, "comentarios");
            const texto = msgTextoDispersion_({
              estatus: estatus, quien: quien, fecha: fecha, cliente: cliente, linea: v(row, "noLinea"),
              estadoSaldo: v(row, "estadoSaldo"), monto: monto, moneda: v(row, "moneda"),
              comentarios: (comentarios !== "" && comentarios != null) ? String(comentarios).trim() : "Ninguno"
            });
            sheet.getRange(fila, C.mensajeDispersion).setValue(texto);
            genD++;
          }
        }

        // ---------- Vencimiento ----------
        if ((tipo === "vencimiento" || !tipo) && v(row, "generarVencimiento") === true) {
          const fecha = msgFecha_(v(row, "fecha"));
          const fechaVenc = msgFecha_(v(row, "fechaVencimiento"));
          if (!v(row, "noLinea") || !v(row, "vencimientoLC")) {
            msgAviso_("Fila " + fila + ": faltan No. Línea o Vencimiento LC. No se generó.", "Vencimiento");
          } else if (!fecha) {
            msgAviso_("Fila " + fila + ": la fecha (A) no es válida. No se generó.", "Vencimiento");
          } else if (!fechaVenc) {
            msgAviso_("Fila " + fila + ": la fecha de vencimiento (E) está vacía o no es válida. No se generó.", "Vencimiento");
          } else {
            const cliente = String(v(row, "nombreCliente") || "").split(",")[0].trim() || "Sin nombre";
            sheet.getRange(fila, C.mensajeVencimiento).setValue(msgTextoVencimiento_({
              fecha: fecha, cliente: cliente, linea: v(row, "noLinea"), vencimientoLC: v(row, "vencimientoLC"), fechaVenc: fechaVenc
            }));
            genV++;
          }
        }
      } catch (errFila) {
        msgAviso_("Fila " + fila + ": " + errFila.message, "Error al generar");
      }
    });
    Logger.log("Generación: Dispersión " + genD + ", Vencimiento " + genV + ", pendientes de validación " + pendientes);
  } catch (error) {
    msgAviso_("Error al generar: " + error.message, "Error");
    throw error;
  }
}

/* ============================================================
   PUBLICAR: envía al chat lo que ya esté en M / N.
   Si la fila ya dice "Enviado" en Q / R NO se vuelve a mandar
   (para reenviar a propósito, borra esa celda de Enviado).
   correoUsuario: quien marcó el checkbox (queda anotado en Enviado)
   ============================================================ */
function publicarMensajes(filaEspecifica, tipo, correoUsuario) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) { msgAviso_("Hay otra publicación en curso. Espera unos segundos y vuelve a marcar.", "Publicar"); return; }
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG_MENSAJES.sheetName);
    if (!sheet) throw new Error('No se encontró la hoja "' + CONFIG_MENSAJES.sheetName + '".');
    const C = CONFIG_MENSAJES.columns;
    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG_MENSAJES.dataStartRow) return;
    if (filaEspecifica && filaEspecifica > lastRow) return;

    const claveD = sheet.getRange(CONFIG_MENSAJES.webhook.threadKeyCellDispersion).getValue();
    const claveV = sheet.getRange(CONFIG_MENSAJES.webhook.threadKeyCellVencimiento).getValue();
    const filaInicio = filaEspecifica || CONFIG_MENSAJES.dataStartRow;
    const numFilas = filaEspecifica ? 1 : (lastRow - CONFIG_MENSAJES.dataStartRow + 1);
    const datos = sheet.getRange(filaInicio, 1, numFilas, C.enviadoV).getValues();
    const v = function (row, k) { return row[C[k] - 1]; };
    const quien = msgNombreUsuario_(correoUsuario);
    const sello = function () { return "Enviado ✅ " + Utilities.formatDate(new Date(), msgTz_(), "dd/MM/yy HH:mm") + " · " + quien; };

    let pubD = 0, pubV = 0;
    datos.forEach(function (row, i) {
      const fila = filaInicio + i;
      try {
        // ---------- Dispersión ----------
        if ((tipo === "dispersion" || !tipo) && v(row, "publicarDispersion") === true) {
          if (String(v(row, "enviadoD") || "").indexOf("Enviado") === 0) {
            msgAviso_("Fila " + fila + ": la Dispersión ya se había enviado. Para reenviarla borra la celda 'Enviado' (Q).", "Publicar");
          } else if (!v(row, "mensajeDispersion")) {
            msgAviso_("Fila " + fila + ": no hay mensaje de Dispersión. Marca primero Generar (K).", "Publicar");
          } else if (enviarMensajeWebhook_(v(row, "mensajeDispersion"), claveD)) {
            sheet.getRange(fila, C.enviadoD).setValue(sello());
            pubD++;
            quitarRojoSolicitud_(ss, v(row, "noLinea"), v(row, "fecha"), v(row, "monto"));
          } else {
            msgAviso_("Fila " + fila + ": no se pudo enviar la Dispersión al chat. No se marcó como Enviado.", "Publicar");
          }
        }

        // ---------- Vencimiento ----------
        if ((tipo === "vencimiento" || !tipo) && v(row, "publicarVencimiento") === true) {
          if (String(v(row, "enviadoV") || "").indexOf("Enviado") === 0) {
            msgAviso_("Fila " + fila + ": el Vencimiento ya se había enviado. Para reenviarlo borra la celda 'Enviado' (R).", "Publicar");
          } else if (!v(row, "mensajeVencimiento")) {
            msgAviso_("Fila " + fila + ": no hay mensaje de Vencimiento. Marca primero Generar (L).", "Publicar");
          } else if (enviarMensajeWebhook_(v(row, "mensajeVencimiento"), claveV)) {
            sheet.getRange(fila, C.enviadoV).setValue(sello());
            pubV++;
          } else {
            msgAviso_("Fila " + fila + ": no se pudo enviar el Vencimiento al chat. No se marcó como Enviado.", "Publicar");
          }
        }
      } catch (errFila) {
        msgAviso_("Fila " + fila + ": " + errFila.message, "Error al publicar");
      }
    });
    if (pubD || pubV) msgAviso_("Publicado en el chat: " + pubD + " Dispersión, " + pubV + " Vencimiento.", "Publicar");
  } catch (error) {
    msgAviso_("Error al publicar: " + error.message, "Error");
    throw error;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** Quita el rojo de la solicitud en Solicitudes2026 (coincide No. Línea + Fecha + Monto). */
function quitarRojoSolicitud_(ss, noLinea, fecha, monto) {
  try {
    const lin = String(noLinea == null ? "" : noLinea).trim();
    const f = msgFecha_(fecha), m = msgNum_(monto);
    if (!lin || !f || isNaN(m)) return;
    const hoja = ss.getSheetByName(CONFIG_MENSAJES.hojaSolicitudes);
    if (!hoja || hoja.getLastRow() < 2) return;
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, 4).getValues();
    const dia = msgDia_(f);
    const idx = datos.findIndex(function (r) {
      const fr = msgFecha_(r[2]), mr = msgNum_(r[3]);
      return String(r[0]).trim() === lin && fr && msgDia_(fr) === dia && !isNaN(mr) && Math.abs(mr - m) < 0.005;
    });
    if (idx >= 0) hoja.getRange(idx + 2, 1).setBackground(null);
    else Logger.log("Sin coincidencia (Línea+Fecha+Monto) en " + CONFIG_MENSAJES.hojaSolicitudes);
  } catch (e) { Logger.log("quitarRojoSolicitud_: " + e.message); }
}
