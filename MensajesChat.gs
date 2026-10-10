/* ============================================================
   NUEVO DISEÑO: Generar vs Publicar, en dos pasos separados.

   K = Generar Dispersión   -> solo arma el texto en O, no envía nada
   L = Generar Vencimiento  -> solo arma el texto en P, no envía nada
   Q = Publicar Dispersión  -> envía por webhook lo que ya esté en O
   R = Publicar Vencimiento -> envía por webhook lo que ya esté en P

   Las claves de hilo se mudan de R1/R2 a S1/S2 (R ahora es una
   columna de datos por fila, ya no sirve para guardar config).

   Ventajas:
   - Si el webhook falla, el texto ya generado en O/P sigue ahí
     para copiar y pegar a mano.
   - Puedes revisar el mensaje en O/P antes de decidir publicarlo.
   - Marcar K o L nunca manda nada al webhook, así que no hay
     riesgo de envíos accidentales al generar/corregir.
   ============================================================ */

const CONFIG_MENSAJES = {
  sheetName: "Mensajes",
  dataStartRow: 2,
  dateFormat: "dd/MM/yy",
  locale: "es-MX",
  currencyOptions: {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  },
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
    enviadoD: 17,             // S
    enviadoV: 18,             // T
    mensajeDispersion: 13,    // M
    mensajeVencimiento: 14,   // N
    publicarDispersion: 15,   // Q 
    publicarVencimiento: 16   // R 
  },
  validacionValores: {
    validado: "Validado",
    rechazado: "Rechazado"
  },
  webhook: {
    threadKeyCellDispersion: "S1",
    threadKeyCellVencimiento: "S2"
  },
  timeZone: Session.getScriptTimeZone(),
  emojis: {
    notification: "🔔",
    alert: "🚨",
    date: "🗓️",
    client: "🧑‍💼",
    status: "🎯",
    money: "💲",
    comments: "📝",
    check: "✅",
    reject: "❌",
    line: "#️⃣",
    dueDate: "⏰",
    lc: "🚥"
  }
};



/* ============================================================
   GENERAR: arma el texto del mensaje en O/P. NO envía nada.
   filaEspecifica: opcional. Si se pasa, solo procesa esa fila
   (lo que hace onEdit). Si se omite, procesa toda la hoja.
   ============================================================ */
function generarMensajes(filaEspecifica, tipo) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(CONFIG_MENSAJES.sheetName);
    if (!sheet) throw new Error(`No se encontró la hoja "${CONFIG_MENSAJES.sheetName}".`);

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG_MENSAJES.dataStartRow) {
      Logger.log("ℹ️ No hay datos para procesar.");
      return;
    }
    if (filaEspecifica && filaEspecifica > lastRow) return;

    const ancho = CONFIG_MENSAJES.columns.mensajeVencimiento - CONFIG_MENSAJES.columns.fecha + 1;
    const filaInicio = filaEspecifica || CONFIG_MENSAJES.dataStartRow;
    const numFilas = filaEspecifica ? 1 : (lastRow - CONFIG_MENSAJES.dataStartRow + 1);

    const dataValues = sheet.getRange(filaInicio, CONFIG_MENSAJES.columns.fecha, numFilas, ancho).getValues();

    let generadosDispersion = 0;
    let generadosVencimiento = 0;
    let pendientesValidacion = 0;

    dataValues.forEach((row, index) => {
      const rowNumber = filaInicio + index;

      const [
        fecha, nombreCliente, noLinea, vencimientoLC, fechaVencimiento,
        estadoSaldo, monto, moneda, comentarios, estatusValidacion,
        generarDispersion, generarVencimiento
      ] = row;

      try {
        // --- Generar mensaje de Dispersión ---
        if ((tipo === "dispersion" || !tipo) && generarDispersion === true) {
          if (!nombreCliente || !noLinea || !estadoSaldo || monto === undefined || !moneda) {
            Logger.log(`⚠️ Fila ${rowNumber}: datos incompletos para Dispersión. Se omite.`);

          } else if (estatusValidacion !== CONFIG_MENSAJES.validacionValores.validado &&
                     estatusValidacion !== CONFIG_MENSAJES.validacionValores.rechazado) {
            Logger.log(`⏳ Fila ${rowNumber}: pendiente de validación (J). Se omite por ahora.`);
            pendientesValidacion++;

          } else {
            const esValidado = estatusValidacion === CONFIG_MENSAJES.validacionValores.validado;
            const shortName = nombreCliente.split(",")[0].trim();
            const formattedDate = Utilities.formatDate(new Date(fecha), CONFIG_MENSAJES.timeZone, CONFIG_MENSAJES.dateFormat);
            const formattedAmount = Number(monto).toLocaleString(CONFIG_MENSAJES.locale, CONFIG_MENSAJES.currencyOptions);
            const cleanComments = comentarios ? comentarios.toString().trim() : "Ninguno";

            const tituloMensaje = esValidado ? "NUEVA SOLICITUD" : "SOLICITUD RECHAZADA";
            const iconoTitulo = esValidado ? CONFIG_MENSAJES.emojis.notification : "🚫";
            const lineaEstatus = esValidado
              ? `${CONFIG_MENSAJES.emojis.check} *Validado*`
              : `${CONFIG_MENSAJES.emojis.reject} *Rechazado*`;

            const messageDispersion = `${iconoTitulo} *${tituloMensaje}*

${CONFIG_MENSAJES.emojis.date} Fecha: *${formattedDate}*
${CONFIG_MENSAJES.emojis.client} Cliente: *${shortName}*
${CONFIG_MENSAJES.emojis.line} No. Línea: *${noLinea}*
${CONFIG_MENSAJES.emojis.status} Estatus: *${estadoSaldo}*
${CONFIG_MENSAJES.emojis.money} Solicitud por: *$${formattedAmount}* - *${moneda}*
${CONFIG_MENSAJES.emojis.comments} Comentarios: *${cleanComments}*

${lineaEstatus}`.trim();

            sheet.getRange(rowNumber, CONFIG_MENSAJES.columns.mensajeDispersion).setValue(messageDispersion);
            Logger.log(`📝 Mensaje de Dispersión generado para fila ${rowNumber} (${estatusValidacion}).`);
            generadosDispersion++;
          }
        }

        // --- Generar mensaje de Vencimiento ---
        if ((tipo === "vencimiento" || !tipo) && generarVencimiento === true) {
          if (!noLinea || !vencimientoLC || !fechaVencimiento) {
            Logger.log(`⚠️ Fila ${rowNumber}: datos incompletos para Vencimiento. Se omite.`);
          } else {
            const formattedDate = Utilities.formatDate(new Date(fecha), CONFIG_MENSAJES.timeZone, CONFIG_MENSAJES.dateFormat);

            let fechaVenc;
            if (fechaVencimiento instanceof Date) {
              fechaVenc = fechaVencimiento;
            } else if (typeof fechaVencimiento === 'number') {
              fechaVenc = new Date(Math.round((fechaVencimiento - 25569) * 86400 * 1000));
            } else if (typeof fechaVencimiento === 'string' && fechaVencimiento.trim() !== "") {
              const partes = fechaVencimiento.split("/");
              if (partes.length === 3) {
                const dia = parseInt(partes[0], 10);
                const mes = parseInt(partes[1], 10) - 1;
                let anio = parseInt(partes[2], 10);
                if (anio < 100) anio += 2000;
                fechaVenc = new Date(anio, mes, dia);
              } else {
                throw new Error(`Formato de fecha de vencimiento no reconocido en fila ${rowNumber}.`);
              }
            } else {
              throw new Error(`Fecha de vencimiento inválida o vacía en fila ${rowNumber}.`);
            }

            if (isNaN(fechaVenc.getTime())) {
              throw new Error(`No se pudo convertir la fecha de vencimiento en fila ${rowNumber}.`);
            }

            const shortName = nombreCliente ? nombreCliente.split(",")[0].trim() : "Sin nombre";
            const formattedFechaVencimiento = Utilities.formatDate(fechaVenc, CONFIG_MENSAJES.timeZone, CONFIG_MENSAJES.dateFormat);

            const messageVencimiento = `${CONFIG_MENSAJES.emojis.alert} *PROXIMO VENCIMIENTO*

${CONFIG_MENSAJES.emojis.date} Fecha: *${formattedDate}*
${CONFIG_MENSAJES.emojis.client} Cliente: *${shortName}*
${CONFIG_MENSAJES.emojis.line} No. Línea: *${noLinea}*
${CONFIG_MENSAJES.emojis.lc} Vencimiento LC: *${vencimientoLC}*
${CONFIG_MENSAJES.emojis.dueDate} Fecha Vencimiento: *${formattedFechaVencimiento}*`.trim();

            sheet.getRange(rowNumber, CONFIG_MENSAJES.columns.mensajeVencimiento).setValue(messageVencimiento);
            Logger.log(`📝 Mensaje de Vencimiento generado para fila ${rowNumber}.`);
            generadosVencimiento++;
          }
        }

      } catch (rowError) {
        Logger.log(`❌ Error procesando fila ${rowNumber}: ${rowError.message}`);
      }
    });

    Logger.log(`🏁 Generación completada. Dispersión: ${generadosDispersion}, Vencimiento: ${generadosVencimiento}, Pendientes de validación: ${pendientesValidacion}`);

  } catch (error) {
    Logger.log(`🛑 ERROR CRÍTICO: ${error.message}`);
    SpreadsheetApp.getUi().alert('Error en el Proceso', `Ocurrió un error: ${error.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
    throw error;
  }
}


/* ============================================================
   PUBLICAR: envía por webhook lo que ya esté escrito en O/P.
   filaEspecifica: opcional, igual que en generarMensajes().
   ============================================================ */
function publicarMensajes(filaEspecifica, tipo) {
  try {
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = spreadsheet.getSheetByName(CONFIG_MENSAJES.sheetName);
    if (!sheet) throw new Error(`No se encontró la hoja "${CONFIG_MENSAJES.sheetName}".`);

    const threadKeyDispersion = sheet.getRange(CONFIG_MENSAJES.webhook.threadKeyCellDispersion).getValue();
    const threadKeyVencimiento = sheet.getRange(CONFIG_MENSAJES.webhook.threadKeyCellVencimiento).getValue();

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG_MENSAJES.dataStartRow) return;
    if (filaEspecifica && filaEspecifica > lastRow) return;

    const ancho = CONFIG_MENSAJES.columns.publicarVencimiento - CONFIG_MENSAJES.columns.fecha + 1;
    const filaInicio = filaEspecifica || CONFIG_MENSAJES.dataStartRow;
    const numFilas = filaEspecifica ? 1 : (lastRow - CONFIG_MENSAJES.dataStartRow + 1);

    const dataValues = sheet.getRange(filaInicio, CONFIG_MENSAJES.columns.fecha, numFilas, ancho).getValues();

    let publicadosDispersion = 0;
    let publicadosVencimiento = 0;

    dataValues.forEach((row, index) => {
      const rowNumber = filaInicio + index;
      const offset = CONFIG_MENSAJES.columns.fecha;

      const mensajeDispersion = row[CONFIG_MENSAJES.columns.mensajeDispersion - offset];
      const mensajeVencimiento = row[CONFIG_MENSAJES.columns.mensajeVencimiento - offset];
      const publicarDispersion = row[CONFIG_MENSAJES.columns.publicarDispersion - offset];
      const publicarVencimiento = row[CONFIG_MENSAJES.columns.publicarVencimiento - offset];

      // --- Publicar Dispersión ---
      if ((tipo === "dispersion" || !tipo) && publicarDispersion === true) {
        if (!mensajeDispersion) {
          Logger.log(`⚠️ Fila ${rowNumber}: no hay mensaje de Dispersión generado. Marca primero K.`);
        } else {
          const ok = enviarMensajeWebhook_(mensajeDispersion, threadKeyDispersion);
          if (ok) {
            sheet.getRange(rowNumber, CONFIG_MENSAJES.columns.enviadoD).setValue("Enviado ✅");
            publicadosDispersion++;
            Logger.log(`✉️ Fila ${rowNumber}: Dispersión publicada.`);

            // ✅ Quitar rojo en Solicitudes2026 — una sola lectura, triple match
            const linBuscar   = row[CONFIG_MENSAJES.columns.noLinea - offset].toString().trim();
            const fechaBuscar = row[CONFIG_MENSAJES.columns.fecha - offset];
            const montoBuscar = row[CONFIG_MENSAJES.columns.monto - offset].toString().trim();

            if (linBuscar && fechaBuscar && montoBuscar) {
              const hojaSol = spreadsheet.getSheetByName("Solicitudes2026");
              if (hojaSol) {
                const lastRowSol = hojaSol.getLastRow();
                const datosSol = hojaSol.getRange(2, 1, lastRowSol - 1, 4).getValues();

                const filaMatch = datosSol.findIndex(r => {
                  const linOk   = r[0].toString().trim() === linBuscar;
                  const montoOk = r[3].toString().trim() === montoBuscar;
                  const fechaOk = r[2] instanceof Date &&
                                  fechaBuscar instanceof Date &&
                                  r[2].toDateString() === fechaBuscar.toDateString();
                  return linOk && montoOk && fechaOk;
                });

                if (filaMatch >= 0) {
                  hojaSol.getRange(filaMatch + 2, 1).setBackground(null);
                  Logger.log(`🎨 Rojo quitado — Solicitudes2026 fila ${filaMatch + 2} (LIN: ${linBuscar})`);
                } else {
                  Logger.log(`⚠️ Sin coincidencia triple (LIN+Fecha+Monto) en Solicitudes2026.`);
                }
              }
            }

          } else {
            Logger.log(`⚠️ Fila ${rowNumber}: falló el envío. No se marcó como Enviado.`);
          }
        }
      }

      // --- Publicar Vencimiento ---
      if ((tipo === "vencimiento" || !tipo) && publicarVencimiento === true) {
        if (!mensajeVencimiento) {
          Logger.log(`⚠️ Fila ${rowNumber}: no hay mensaje de Vencimiento generado. Marca primero el checkbox de Generar (L).`);
        } else {
          const ok = enviarMensajeWebhook_(mensajeVencimiento, threadKeyVencimiento);
          if (ok) {
            sheet.getRange(rowNumber, CONFIG_MENSAJES.columns.enviadoV).setValue("Enviado ✅");
            Logger.log(`✉️ Fila ${rowNumber}: mensaje de Vencimiento publicado.`);
            publicadosVencimiento++;
          } else {
            Logger.log(`⚠️ Fila ${rowNumber}: falló el envío de Vencimiento por webhook. No se marcó como Enviado.`);
          }
        }
      }
    });

    Logger.log(`🏁 Publicación completada. Dispersión: ${publicadosDispersion}, Vencimiento: ${publicadosVencimiento}`);

  } catch (error) {
    Logger.log(`🛑 ERROR CRÍTICO en publicarMensajes: ${error.message}`);
    throw error;
  }
}

function configurarWebhook() {
  PropertiesService.getScriptProperties().setProperty(
    "WEBHOOK_URL",
    "https://chat.googleapis.com/v1/spaces/AAAA1LKc69o/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=kYKNESpH4I8666E4G5igj0rNiyx2qDxnCvjuJMEodfw"
  );
  Logger.log("✅ Webhook guardado correctamente.");
}

