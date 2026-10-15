
/* ============================================================
   onEdit completo y actualizado
   Cambios vs. tu versión:
   - Sección 3 (Mensajes) reescrita: soporta pegar/arrastrar varias filas,
     guarda quién validó (columna J) y pasa el correo a Generar/Publicar.
   ============================================================ */
const SHEET_SOL = 'Solicitudes2026';
const SHEET_ACENDES = 'Traspasos';
const COL_A  = 1;   // ID
const COL_C  = 3;   // Fecha solicitud

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();
  const range = e.range;
  const editedColumn = range.getColumn();
  const editedRow = range.getRow();

  // 1️⃣ Insertar fecha al editar columna A en Solicitudes2026
  if (sheetName === SHEET_SOL && editedColumn === COL_A) {
    const dateCell = sheet.getRange(editedRow, COL_C);
    if (!dateCell.getValue()) {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      dateCell.setValue(hoy).setBackground("#ffe100");
    }
    return;
  }

  // 2️⃣ Marcar fecha cuando se edita columna 31 en Solicitudes2026
  if (sheetName === SHEET_SOL && editedColumn === 31 && range.getValue() === true) {
    sheet.getRange(editedRow, 32).setValue(new Date());
    sheet.getRange(editedRow, COL_C).setBackground("white");
    return;
  }

  // 3️⃣ Hoja "Mensajes": Validación (J) · Generar (K, L) · Publicar (O, P)
  if (sheetName === "Mensajes") {
    manejarEdicionMensajes_(e);
    return;
  }

  // 4️⃣ Generar texto Vo.Bo. en hoja "Traspasos"
  if (sheetName === SHEET_ACENDES && editedColumn === 14 && range.getValue() === true) {
    const fecha = sheet.getRange(editedRow, 1).getDisplayValue();   // Col A (fecha)
    const banco = sheet.getRange(editedRow, 9).getValue();          // Col I (banco)
    const monto = sheet.getRange(editedRow, 6).getDisplayValue();   // Col F (monto)
    const letra = sheet.getRange(editedRow, 7).getDisplayValue();   // Col G (monto letra)
    const tipo  = sheet.getRange(editedRow, 13).getValue();         // Col M (tipo: Normal o Extraordinario)

    const horaActual = new Date().getHours();
    let saludo = "Buen día"; // Por defecto (0 a 11 hrs)

    if (horaActual >= 12 && horaActual < 19) {
      saludo = "Buena tarde"; // De 12:00 a 18:59 hrs
    } else if (horaActual >= 19) {
      saludo = "Buena noche"; // De 19:00 a 23:59 hrs
    }
    // ----------------------------------------

    let textoPlano = `${saludo} Danna,\n\n`;

    if (tipo === "Extraordinario") {
      textoPlano += `Doy el Vo.Bo. al traspaso extraordinario para ${banco} de hoy ${fecha} por la cantidad de ${monto} (${letra}) \n\nSaludos`;
    } else {
      textoPlano += `Doy el Vo.Bo. al traspaso para ${banco} de hoy ${fecha} por la cantidad de ${monto} (${letra}) \n\nSaludos`;
    }

    const builder = SpreadsheetApp.newRichTextValue().setText(textoPlano);
    const bold = SpreadsheetApp.newTextStyle().setBold(true).build();

    const idxFecha = textoPlano.indexOf(fecha);
    if (idxFecha >= 0) builder.setTextStyle(idxFecha, idxFecha + fecha.length, bold);

    const idxMonto = textoPlano.indexOf(monto);
    if (idxMonto >= 0) builder.setTextStyle(idxMonto, idxMonto + monto.length, bold);

    const idxLetra = textoPlano.indexOf(letra);
    if (idxLetra >= 0) builder.setTextStyle(idxLetra, idxLetra + letra.length, bold);

    if (tipo !== "Extraordinario") {
      const idxBanco = textoPlano.indexOf(banco);
      if (idxBanco >= 0) builder.setTextStyle(idxBanco, idxBanco + banco.length, bold);
    }

    sheet.getRange(editedRow, 15).setRichTextValue(builder.build()); // Col O
  }
}

/** Sección 3 de onEdit. Recorre TODAS las filas editadas (por si pegan o arrastran varias). */
function manejarEdicionMensajes_(e) {
  try {
    const C = CONFIG_MENSAJES.columns;
    const range = e.range, sheet = range.getSheet();
    const c1 = range.getColumn(), c2 = c1 + range.getNumColumns() - 1;
    const r1 = Math.max(range.getRow(), CONFIG_MENSAJES.dataStartRow), r2 = range.getRow() + range.getNumRows() - 1;
    if (r2 < r1) return;
    const toca = function (col) { return col >= c1 && col <= c2; };
    const correo = msgCorreoDeEvento_(e);

    // FULL = disparador instalable (puede enviar al chat). LIMITED = el onEdit "automático" de Google (NO puede).
    const modo = String(e.authMode || "desconocido");
    const sinPermisoDeEnviar = (modo === "LIMITED" || modo === "NONE");
    msgLog_("onEdit", "modo=" + modo + " filas=" + r1 + "-" + r2 + " cols=" + c1 + "-" + c2);

    // Quién validó: cada vez que cambia J se anota correo y hora en T / U
    if (toca(C.validacion)) {
      for (let r = r1; r <= r2; r++) registrarValidacion(r, correo);
    }

    const acciones = [
      [C.generarDispersion,   false, function (r) { generarMensajes(r, "dispersion", correo); }],
      [C.generarVencimiento,  false, function (r) { generarMensajes(r, "vencimiento", correo); }],
      [C.publicarDispersion,  true,  function (r) { publicarMensajes(r, "dispersion", correo); }],
      [C.publicarVencimiento, true,  function (r) { publicarMensajes(r, "vencimiento", correo); }]
    ];
    acciones.forEach(function (a) {
      if (!toca(a[0])) return;
      for (let r = r1; r <= r2; r++) {
        if (sheet.getRange(r, a[0]).getValue() !== true) continue;
        if (a[1] && sinPermisoDeEnviar) {            // publicar: esta corrida no puede usar UrlFetchApp; que lo haga el disparador instalable
          msgLog_("onEdit", "fila " + r + ": publicar OMITIDO en modo " + modo + " (lo atiende el disparador instalable)");
          continue;
        }
        a[2](r);
      }
    });
  } catch (err) {
    msgLog_("onEdit ERROR", (err && err.message) + " | " + String(err && err.stack).slice(0, 300));
    try { SpreadsheetApp.getActiveSpreadsheet().toast("Error en Mensajes: " + (err && err.message), "onEdit", 10); } catch (x) {}
  }
}
