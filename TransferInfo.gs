function valDispersionC() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const hojaOrigen = ss.getActiveSheet();
  const nombreHoja = hojaOrigen.getName();

  if (!['VALIDACION_1', 'VALIDACION_2'].includes(nombreHoja)) {
    ui.alert('Sitúate en VALIDACION_1 o VALIDACION_2 antes de guardar el registro.');
    return;
  }

  const hojaDestino = ss.getSheetByName('REGISTRO DISPERSION');
  if (!hojaDestino) {
    ui.alert('No se encontró la hoja "REGISTRO DISPERSION"');
    return;
  }

  const COLOR_A = '#f8d1b1';
  const COLOR_B = '#c0bdba';

  function obtenerUltimoColorAlternado(hoja, desdeFila) {
    if (desdeFila <= 3) return COLOR_B;
    const colores = hoja.getRange(desdeFila - 1, 1, 1, 1).getBackgrounds();
    const ultimoColor = colores[0][0];
    return (ultimoColor === COLOR_A) ? COLOR_B : COLOR_A;
  }

  // ── 1. DATOS PRINCIPALES (mapeo v3.1 · antes → ahora) ────────────────────────────────
  const datosPrincipales = [
    hojaOrigen.getRange('B4').getValue(),   // LINEA            (antes B2)  → ID Oportunidad
    hojaOrigen.getRange('D4').getValue(),   // ACREDITADO       (antes B4)
    hojaOrigen.getRange('G4').getValue(),   // PRODUCTO         (antes B8)
    hojaOrigen.getRange('B4').getValue(),   // ID OPORTUNIDAD   (antes B6)  → misma celda que LINEA
    hojaOrigen.getRange('I4').getValue(),   // TIPO CREDITO     (antes B10)
    hojaOrigen.getRange('C15').getValue(),  // REGIMEN          (antes D10)
    hojaOrigen.getRange('C14').getValue(),  // FORMALIZACION    (antes D8)
    hojaOrigen.getRange('B7').getValue(),   // MONTO LC         (antes B12)
    hojaOrigen.getRange('C16').getValue(),  // TASA             (antes B14)
    hojaOrigen.getRange('F13').getValue(),  // COMISION         (antes D12) → % Comisión
    hojaOrigen.getRange('C13').getValue(),  // GRAVAMEN         (antes D4)
    hojaOrigen.getRange('C18').getValue(),  // FECHA FIRMA      (antes B16)
    hojaOrigen.getRange('C17').getValue(),  // PLAZO            (antes D14)
    hojaOrigen.getRange('C19').getValue()   // FECHA VENCIMIENTO(antes D16)
  ];

  const linea = datosPrincipales[0];
  const idOportunidad = datosPrincipales[3];
  const fechaFirma = datosPrincipales[11];

  if (!linea) {
    ui.alert('No se puede agregar datos', 'El ID Oportunidad está vacío.', ui.ButtonSet.OK);
    return;
  }

  // ── CONFIRMACIÓN DE FECHA DE FIRMA ──────────────────────────────────────────────────
  const fechaFormateada = fechaFirma instanceof Date
    ? Utilities.formatDate(fechaFirma, Session.getScriptTimeZone(), 'dd/MM/yyyy')
    : fechaFirma;

  const respuestaConfirmacion = ui.alert(
    'Confirmar registro',
    `¿Deseas guardar el registro del ID ${idOportunidad} (${nombreHoja}) con la fecha de firma ${fechaFormateada}?`,
    ui.ButtonSet.YES_NO
  );
  if (respuestaConfirmacion === ui.Button.NO) return;

  // ── 2. COMENTARIOS — panel "Comentarios de Mesa de Control" (B46) ──────────────────
  const comentarios = String(hojaOrigen.getRange('B46').getValue() || '').trim();

  // ── 3. DETALLE DE DISPERSIÓN — antes libre desde fila 24, ahora bloque fijo 28–42 ───
  const filasDetalle = hojaOrigen.getRange(28, 2, 15, 8).getValues(); // B..I = 8 columnas
  const detalleFiltrado = filasDetalle.filter(row => row.join('').trim() !== '');

  const hojaDatos = hojaDestino;
  const totalFilasDestino = hojaDatos.getLastRow();
  let datosDestino = [];

  if (totalFilasDestino >= 3) {
    datosDestino = hojaDatos.getRange(3, 1, totalFilasDestino - 2, 1).getValues().flat();
  }

  const indiceExistente = datosDestino.indexOf(linea);
  let filaInicio;

  if (indiceExistente !== -1) {
    const respuesta = ui.alert(
      'Información existente',
      `Ya existe información con el ID ${linea}. ¿Deseas reemplazarla?`,
      ui.ButtonSet.YES_NO
    );
    if (respuesta === ui.Button.NO) return;

    filaInicio = indiceExistente + 3;
    hojaDatos.deleteRows(filaInicio, detalleFiltrado.length > 0 ? detalleFiltrado.length : 1);
  } else {
    filaInicio = (totalFilasDestino < 3) ? 3 : totalFilasDestino + 1;
  }

  // ── 4. PEGAR DATOS PRINCIPALES EN A–N ───────────────────────────────────────────────
  hojaDatos.getRange(filaInicio, 1, 1, 14).setValues([datosPrincipales]);

  // ── 5. PEGAR DETALLE EN O–V ──────────────────────────────────────────────────────────
  let totalFilas = 1;
  if (detalleFiltrado.length > 0) {
    hojaDatos.getRange(filaInicio, 15, detalleFiltrado.length, 8).setValues(detalleFiltrado);

    const filasAdicionales = detalleFiltrado.length - 1;
    if (filasAdicionales > 0) {
      const filasGuiones = Array(filasAdicionales).fill(null).map(() => {
        const fila = Array(14).fill('–');
        fila[0] = linea;
        return fila;
      });
      hojaDatos.getRange(filaInicio + 1, 1, filasAdicionales, 14).setValues(filasGuiones);
      totalFilas += filasAdicionales;
    }
  }

  // ── 6. PEGAR COMENTARIOS EN W ────────────────────────────────────────────────────────
  hojaDatos.getRange(filaInicio, 23).setValue(comentarios);

  // ── 7. COLOR ALTERNADO EN TODO EL BLOQUE (A–W) ──────────────────────────────────────
  const colorAlternado = obtenerUltimoColorAlternado(hojaDatos, filaInicio);
  hojaDatos.getRange(filaInicio, 1, totalFilas, 23).setBackground(colorAlternado);

  ss.toast('✅ Registro capturado con éxito desde ' + nombreHoja, 'Completado', 4);
}
