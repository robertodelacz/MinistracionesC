
/* ============================================================
   onEdit completo y actualizado
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

  // 3️⃣ Hoja "Mensajes": Generar (K, L) y Publicar (Q, R), por separado
  if (sheetName === "Mensajes") {
    if (editedColumn === 11 && range.getValue() === true) { // K - Generar Dispersión
      Logger.log(`📝 Checkbox de Generar Dispersión marcado en fila ${editedRow}`);
      generarMensajes(editedRow, "dispersion");
      return;
    }

    if (editedColumn === 12 && range.getValue() === true) { // L - Generar Vencimiento
      Logger.log(`📝 Checkbox de Generar Vencimiento marcado en fila ${editedRow}`);
      generarMensajes(editedRow, "vencimiento");
      return;
    }

    if (editedColumn === 15 && range.getValue() === true) { // O - Publicar Dispersión
      Logger.log(`📤 Checkbox de Publicar Dispersión marcado en fila ${editedRow}`);
      publicarMensajes(editedRow, "dispersion");
      return;
    }

    if (editedColumn === 16 && range.getValue() === true) { // P - Publicar Vencimiento
      Logger.log(`📤 Checkbox de Publicar Vencimiento marcado en fila ${editedRow}`);
      publicarMensajes(editedRow, "vencimiento");
      return;
}
  }

  // 4️⃣ Generar texto Vo.Bo. en hoja "Acendes"
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
