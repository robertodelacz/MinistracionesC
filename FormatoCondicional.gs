function aplicarFormatoCondicional() {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Solicitudes2026");
  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return; // No hay datos.

  const rango = hoja.getRange("L2:L" + ultimaFila);
  const valores = rango.getValues();

  // Preparamos matriz de colores.
  const colores = valores.map(fila => {
    const texto = fila[0] ? fila[0].toString().trim() : "";
    let color = null;

    if (texto.startsWith("Vencido")) {
      color = "#E1C4FF";
    } else if (/^\d+\s+día(?:s)?$/.test(texto)) {
      const dias = parseInt(texto.split(" ")[0]);
      if (dias >= 1 && dias <= 30) {
        color = "#FF7F7F"; // Rojo.
      }
    } else if (/^\d+\s+mes(?:es)?(?:\s+y\s+\d+\s+día(?:s)?)?$/.test(texto)) {
      const partes = texto.split(" ");
      const meses = parseInt(partes[0]);
      const idxY = partes.indexOf("y");
      const dias = idxY !== -1 ? parseInt(partes[idxY + 1]) : 0;

      if ((meses === 1 && dias >= 1) || (meses > 1 && meses <= 3)) {
        color = "#FFB27F";
      } else if ((meses === 3 && dias >= 1) || (meses > 3 && meses <= 4)) {
        color = "#FFD97F";
      } else if ((meses === 4 && dias >= 1) || (meses > 4 && meses <= 6)) {
        color = "#D9FF7F";
      } else if (meses >= 6) {
        color = "#A3FF7F";
      }
    } else if (/^\d+\s+año(?:s)?/.test(texto)) {
      color = "#A3FF7F";
    }

    return [color];
  });

  // Limpiar primero.
  rango.setBackgrounds(colores.map(() => [null]));

  // Aplicar colores calculados.
  rango.setBackgrounds(colores);
}
