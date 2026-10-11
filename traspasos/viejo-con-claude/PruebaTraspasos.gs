/* ==========================================================================
   PRUEBA DE TRASPASOS EN UNA HOJA APARTE  (no toca tu hoja "Traspasos")
   Procesa los correos desde una fecha hasta hoy con las mismas reglas y el
   mismo motor (Claude + respaldo Drive) y los deja en "PRUEBA TRASPASOS".
   El detalle de cada correo (procesado, omitido, error) queda en "PRUEBA LOG".
   ========================================================================== */
const PRUEBA_HOJA = 'PRUEBA TRASPASOS';
const PRUEBA_LOG  = 'PRUEBA LOG';

/** Atajo: del 8 de octubre de 2026 hasta hoy. */
function probarDesde8deOctubre() { probarTraspasosDesde('08/10/2026'); }

/** Si la prueba se quedó sin tiempo, corre esto para que continúe donde se quedó. */
function continuarPruebaTraspasos() { probarTraspasosDesde(PropertiesService.getScriptProperties().getProperty('PRUEBA_DESDE') || '08/10/2026', true); }

/**
 * fechaTxt: '08/10/2026' o '2026-10-08'.  continuar=true no borra lo ya procesado.
 */
function probarTraspasosDesde(fechaTxt, continuar) {
  const m1 = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(String(fechaTxt).trim());
  const m2 = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(fechaTxt).trim());
  if (!m1 && !m2) throw new Error('Fecha no válida. Usa 08/10/2026 o 2026-10-08.');
  const desde = m1 ? new Date(+m1[3], +m1[2] - 1, +m1[1]) : new Date(+m2[1], +m2[2] - 1, +m2[3]);
  PropertiesService.getScriptProperties().setProperty('PRUEBA_DESDE', Utilities.formatDate(desde, TZ_MX, 'dd/MM/yyyy'));

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const real = ss.getSheetByName(HOJA_DATOS);
  if (!continuar) {
    [PRUEBA_HOJA, PRUEBA_LOG].forEach(function (n) { const h = ss.getSheetByName(n); if (h) ss.deleteSheet(h); });
    const nueva = ss.insertSheet(PRUEBA_HOJA);
    if (real && real.getLastColumn() >= 13) {                 // mismo encabezado y misma fórmula de "Monto en letra" que tu hoja
      nueva.getRange(1, 1, 1, 13).setValues(real.getRange(1, 1, 1, 13).getValues());
      try { const f = real.getRange('G2').getFormulaR1C1(); if (f) nueva.getRange('G2').setFormulaR1C1(f); } catch (e) {}
    }
  }
  const antes = (function () { const h = ss.getSheetByName(PRUEBA_HOJA); return h ? h.getLastRow() : 0; })();
  const t0 = Date.now();
  revisarTraspasos({ hojaDatos: PRUEBA_HOJA, hojaLog: PRUEBA_LOG, desde: desde, tiempoMax: t0 + 5 * 60 * 1000 });

  const hoja = ss.getSheetByName(PRUEBA_HOJA), log = ss.getSheetByName(PRUEBA_LOG);
  const filas = hoja ? Math.max(hoja.getLastRow() - 1, 0) : 0;
  let pendientes = 0, errores = 0;
  if (log && log.getLastRow() >= 2) {
    log.getRange(2, 4, log.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0] === 'Pendiente') pendientes++; if (r[0] === 'Error') errores++; });
  }
  const msg = 'Prueba desde ' + Utilities.formatDate(desde, TZ_MX, 'dd/MM/yyyy') + ': ' + filas + ' fila(s) en "' + PRUEBA_HOJA + '"' +
    (errores ? ' · ' + errores + ' con error' : '') +
    (pendientes ? ' · ' + pendientes + ' pendientes por tiempo: corre continuarPruebaTraspasos()' : '') +
    '. Revisa "' + PRUEBA_LOG + '" (qué se procesó y qué se omitió).';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
}
