function recalcularPagos_Bulk() {
  const SHEET_SOL = "Solicitudes2026";
  const COL_A  = 1;   // Columna de referencia (debe tener datos para procesar)
  const COL_C  = 3;   // Fecha solicitud
  const COL_O  = 16;  // Tipo de producto
  const COL_S  = 20;  // Fecha de corte ("DD c/m" o fecha)
  const COL_U  = 22;  // Fecha de vencimiento
  const COL_V  = 23;  // Plazo (texto)
  const COL_AI = 36;  // Primer pago
  const COL_AJ = 37;  // Último pago

  const DIAS_MINIMOS_PRIMER_PAGO = 10; // Threshold para calcular siguiente mes
  
  // ⚠️ AJUSTA ESTA FILA SEGÚN TUS DATOS
  const START_ROW = 2; // Cambiar según tu hoja (2 si hay encabezados en fila 1)

  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_SOL);
    if (!sh) {
      throw new Error("No existe la hoja 'Solicitudes2026'.");
    }

    // ============ AJUSTE: Detectar última fila con datos SOLO en columna A ============
    const lastRowTotal = sh.getLastRow();
    
    Logger.log(`Última fila según getLastRow(): ${lastRowTotal}`);
    
    if (lastRowTotal < START_ROW) {
      SpreadsheetApp.getActive().toast(
        `No hay filas con datos. La última fila es ${lastRowTotal} y la fila de inicio es ${START_ROW}.`, 
        'Sin datos', 
        5
      );
      return;
    }

    // Leer solo la columna A para detectar última fila con datos reales
    const colAData = sh.getRange(START_ROW, COL_A, lastRowTotal - START_ROW + 1, 1).getValues();
    
    // Buscar última fila con datos en columna A (de abajo hacia arriba)
    let lastRowWithData = 0;
    for (let i = colAData.length - 1; i >= 0; i--) {
      const val = colAData[i][0];
      // Verificar que tenga datos y no sea solo guiones o "N/A"
      if (val != null && String(val).trim() !== '' && 
          String(val).trim() !== '-' && 
          String(val).trim().toUpperCase() !== 'N/A') {
        lastRowWithData = START_ROW + i;
        break;
      }
    }

    if (lastRowWithData === 0) {
      SpreadsheetApp.getActive().toast(
        'No hay filas con datos válidos en columna A.', 
        'Sin datos', 
        5
      );
      return;
    }

    Logger.log(`Última fila con datos reales en columna A: ${lastRowWithData}`);
    
    const numRowsAll = lastRowWithData - START_ROW + 1;
    Logger.log(`Leyendo ${numRowsAll} filas desde la fila ${START_ROW} hasta ${lastRowWithData}`);

    // Ahora leer solo hasta la última fila con datos
    const width = Math.max(COL_AJ, COL_AI);
    const data = sh.getRange(START_ROW, 1, numRowsAll, width).getValues();

    // Helpers de fecha
    const ultimoDiaMes = (y, mIdx) => new Date(y, mIdx + 1, 0).getDate();
    const cap = (y, mIdx, d) => new Date(y, mIdx, Math.min(d, ultimoDiaMes(y, mIdx)));
    const addMonthsKeepDOM = (d, months, diaOriginal) => {
    const diaAMantener = diaOriginal !== undefined ? diaOriginal : d.getDate();
    return cap(d.getFullYear(), d.getMonth() + months, diaAMantener);
    };
    const addDays = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const t = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());

    // Parsing de fechas con múltiples formatos
    function parseDMYString(s) {
      if (!s) return null;
      const str = String(s).trim().toLowerCase();
      
      // Formato DD/MM/YYYY o DD-MM-YYYY
      let m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (m) return new Date(+m[3], +m[2]-1, +m[1]);
      
      // Formato DD-mes-YYYY (ej: 15-ene-2024)
      const meses = { 
        ene:0, feb:1, mar:2, abr:3, may:4, jun:5, 
        jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 
      };
      m = str.match(/^(\d{1,2})[-\s](ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[-\s](\d{4})$/);
      if (m) return new Date(+m[3], meses[m[2]], +m[1]);
      
      // Intento de conversión directa
      const d = new Date(s);
      return isNaN(d) ? null : d;
    }

    const toDateOnly = (val) => {
      const d = (val instanceof Date && !isNaN(val)) ? val : parseDMYString(val);
      return d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;
    };

    // Verificar si es adelanto
    function esAdelanto(plazoRaw) {
      if (!plazoRaw) return false;
      const txt = String(plazoRaw).toLowerCase().trim();
      const normalizado = txt.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return /\badelanto\b/.test(normalizado) || /\badt\b/.test(normalizado);
    }

    // Parsing mejorado de plazo
    function parsePlazo(plazoRaw) {
      const base = String(plazoRaw || '').toLowerCase();
      const txt = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      // Caso especial: adelanto (ADT, Adelanto, etc.)
      if (esAdelanto(plazoRaw)) return { type: 'adelanto', months: 0, days: 0 };

      let months = 0, days = 0;
      
      // ============ REGLA 1: "XX pagos" → XX meses ============
      const pagosMatch = txt.match(/(\d+)\s*pagos/);
      if (pagosMatch) {
        months = parseInt(pagosMatch[1], 10);
        Logger.log(`  → Detectado "${pagosMatch[0]}" = ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 2: Detectar DÍAS primero ============
      const diasMatch = txt.match(/(?:en\s+|a\s+)?(\d+)\s*d[ií]as?\b/);
      if (diasMatch) {
        days = parseInt(diasMatch[1], 10);
        Logger.log(`  → Detectado ${days} días`);
        return { type: 'normal', months: 0, days };
      }
      
      // ============ REGLA 3: "12 meses, capital cada 6 meses" → 6 meses ============
      const mesesCapitalCadaMatch = txt.match(/(\d+)\s*mes[^\d]*capital\s*cada\s*(\d+)\s*mes/);
      if (mesesCapitalCadaMatch) {
        const primerNumero = parseInt(mesesCapitalCadaMatch[1], 10);
        const segundoNumero = parseInt(mesesCapitalCadaMatch[2], 10);
        months = segundoNumero; // Usar siempre el segundo número (capital cada X meses)
        Logger.log(`  → Detectado "${mesesCapitalCadaMatch[0]}": ${primerNumero} meses total, capital cada ${months} meses → último pago a ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 4: "XX meses, pagos mensuales a capital cada YY meses" → YY meses ============
      const pagosMensualesCapitalMatch = txt.match(/(\d+)\s*mes.*pagos\s*mensuales.*capital\s*cada\s*(\d+)\s*mes/);
      if (pagosMensualesCapitalMatch) {
        months = parseInt(pagosMensualesCapitalMatch[2], 10);
        Logger.log(`  → Detectado pagos mensuales a capital cada ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 5: "Vencimiento de capital cada XX meses" → XX meses ============
      const vencCapitalMatch = txt.match(/vencimiento\s*de\s*capital\s*cada\s*(\d+)\s*mes/);
      if (vencCapitalMatch) {
        months = parseInt(vencCapitalMatch[1], 10);
        Logger.log(`  → Detectado vencimiento de capital cada ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 6: "Capital cada XX meses" (sin número previo) → XX meses ============
      const capitalSimpleMatch = txt.match(/capital\s*cada\s*(\d+)\s*mes/);
      if (capitalSimpleMatch) {
        months = parseInt(capitalSimpleMatch[1], 10);
        Logger.log(`  → Detectado capital cada ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 7: "Cada XX meses" (genérico) → XX meses ============
      const cadaMesesMatch = txt.match(/cada\s*(\d+)\s*mes/);
      if (cadaMesesMatch) {
        months = parseInt(cadaMesesMatch[1], 10);
        Logger.log(`  → Detectado cada ${months} meses`);
        return { type: 'normal', months, days };
      }
      
      // ============ REGLA 8: "XX meses" (número simple) → XX meses ============
      const mesesSimpleMatch = txt.match(/(\d+)\s*mes/);
      if (mesesSimpleMatch) {
        months = parseInt(mesesSimpleMatch[1], 10);
        Logger.log(`  → Detectado ${months} meses (patrón simple)`);
        return { type: 'normal', months, days };
      }

      // Si no se reconoció nada → no reconocido
      Logger.log(`  → Plazo no reconocido: "${plazoRaw}"`);
      return { type: 'no_reconocido', months: 0, days: 0 };
    }

    // Extraer día de corte desde columna S
      function getDiaCorteDesdeS(sVal) {
      if (sVal instanceof Date) return null;
      if (typeof sVal === 'number' && sVal >= 1 && sVal <= 31) return Math.floor(sVal);
      
      const sTxt = String(sVal || '').trim().toLowerCase().replace(/\s+/g, ' ');
      const m = sTxt.match(/^(\d{1,2})\s*c\/m$/i);
      if (!m) return null;
      
      const d = parseInt(m[1], 10);
      return (d >= 1 && d <= 31) ? d : null;
    }

    // Helper para verificar si columna A tiene datos válidos
    function colAValida(val) {
      if (val == null || String(val).trim() === '') return false;
      const valStr = String(val).trim();
      // Excluir guiones y N/A
      if (valStr === '-' || valStr.toUpperCase() === 'N/A') return false;
      return true;
    }

    const effectiveLen = numRowsAll;
    Logger.log(`Filas efectivas a procesar: ${effectiveLen}`);

    const outPrimer = new Array(effectiveLen);
    const outUltimo = new Array(effectiveLen);
    let cntPrimer = 0, cntUltimo = 0, cntAdelantos = 0, cntDias = 0, cntSkipped = 0;
    let debugCounter = 0;

    // Procesar cada fila
    for (let i = 0; i < effectiveLen; i++) {
      const fila = data[i];
      const filaActual = START_ROW + i;
      const colAVal = fila[COL_A - 1];

      // ============ CONDICIÓN PRINCIPAL: Si columna A no tiene datos válidos, NO calcular ============
      if (!colAValida(colAVal)) {
        outPrimer[i] = [''];
        outUltimo[i] = [''];
        cntSkipped++;
        if (debugCounter < 10) {
          Logger.log(`\n=== Fila ${filaActual} OMITIDA (Col A vacía o inválida) ===`);
          debugCounter++;
        }
        continue;
      }

      const fechaSol = toDateOnly(fila[COL_C - 1]);
      const producto = String(fila[COL_O - 1] || '').trim().toLowerCase();
      const sVal     = fila[COL_S - 1];
      const venc     = toDateOnly(fila[COL_U - 1]);
      const plazoRaw = fila[COL_V - 1];
      const aiActual = fila[COL_AI - 1];
      const ajActual = fila[COL_AJ - 1];

      // Debug las primeras 10 filas
      if (debugCounter < 10) {
        Logger.log(`\n=== Fila ${filaActual} ===`);
        Logger.log(`Col A: "${colAVal}"`);
        Logger.log(`Fecha Sol (Col C): ${fechaSol}`);
        Logger.log(`Producto (Col O): "${producto}"`);
        Logger.log(`S Val (Col S): ${sVal}`);
        Logger.log(`Vencimiento (Col U): ${venc}`);
        Logger.log(`Plazo Raw (Col V): "${plazoRaw}"`);
        Logger.log(`AI Actual (Col AI): ${aiActual} (tipo: ${typeof aiActual})`);
        Logger.log(`AJ Actual (Col AJ): ${ajActual} (tipo: ${typeof ajActual})`);
        debugCounter++;
      }

      // Si ya hay AI y AJ válidos → no recalcular
      if (aiActual instanceof Date && !isNaN(aiActual) && 
          ajActual instanceof Date && !isNaN(ajActual)) {
        outPrimer[i] = [aiActual];
        outUltimo[i] = [ajActual];
        if (debugCounter <= 10) Logger.log(`Fila ${filaActual}: Ya tiene AI y AJ, se preservan`);
        continue;
      }

      // ============ VERIFICAR SI ES ADELANTO ============
      const plazoInfo = parsePlazo(plazoRaw);
      const esUnAdelanto = plazoInfo.type === 'adelanto';

      if (debugCounter <= 10) {
        Logger.log(`Plazo Info: ${JSON.stringify(plazoInfo)}`);
        Logger.log(`Es adelanto: ${esUnAdelanto}`);
      }

      let diaCorteOriginal = getDiaCorteDesdeS(sVal);
      
      if (debugCounter <= 10 && diaCorteOriginal) {
        Logger.log(`Día de corte original detectado desde columna S: ${diaCorteOriginal}`);
      }

      // ============ CÁLCULO DE PRIMER PAGO (AI) ============
      let primerPago = null;

      if (aiActual instanceof Date && !isNaN(aiActual)) {
        primerPago = toDateOnly(aiActual);

        if (!diaCorteOriginal) {
          diaCorteOriginal = primerPago.getDate();
        }
        if (debugCounter <= 10) Logger.log(`Usando AI existente: ${primerPago}`);
      } 
      else if (esUnAdelanto) {
        if (venc instanceof Date) {
          primerPago = venc;
          cntAdelantos++;
          if (debugCounter <= 10) Logger.log(`Es adelanto - Primer pago = Vencimiento: ${primerPago}`);
        } else {
          if (debugCounter <= 10) Logger.log(`Es adelanto pero NO hay vencimiento válido`);
        }
      }
      else if (plazoInfo.days > 0 && fechaSol instanceof Date) {
        primerPago = addDays(fechaSol, plazoInfo.days);
        if (debugCounter <= 10) Logger.log(`Plazo en días - Primer pago = Fecha Sol + ${plazoInfo.days} días: ${primerPago}`);
      }
      else if (fechaSol instanceof Date && 
               (producto === 'oportuno' || producto === 'inmediato')) {
        
        if (debugCounter <= 10) Logger.log(`Producto ${producto} - calculando primer pago`);
        
        if (!(sVal instanceof Date)) {
          const sTxt = typeof sVal === 'string' ? sVal.trim() : String(sVal || '').trim();
          const esFechaCompleta = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.test(sTxt);
          
          if (!esFechaCompleta) {
            const mm = sTxt.toLowerCase().replace(/\s+/g, ' ').match(/^(\d{1,2})\s*c\/m$/i);
            
            if (mm) {
              const diaCorte = parseInt(mm[1], 10);
              
              if (diaCorte >= 1 && diaCorte <= 31) {
                const anio = fechaSol.getFullYear();
                const mes  = fechaSol.getMonth();
                const diaSol = fechaSol.getDate();
                
                let proximoCorte = (diaCorte >= diaSol) 
                  ? cap(anio, mes, diaCorte) 
                  : cap(anio, mes + 1, diaCorte);
                
                const diff = Math.round((t(proximoCorte) - t(fechaSol)) / 86400000);
                primerPago = (diff <= DIAS_MINIMOS_PRIMER_PAGO) 
                  ? cap(proximoCorte.getFullYear(), proximoCorte.getMonth() + 1, diaCorte)
                  : proximoCorte;
                
                if (debugCounter <= 10) Logger.log(`Calculado primer pago: ${primerPago} (diff: ${diff} días)`);
              }
            }
          }
        }
      }

      // ⚠️ Si no se detectó día de corte y hay primer pago, usar el día del primer pago como fallback
      if (!diaCorteOriginal && primerPago instanceof Date) {
        diaCorteOriginal = primerPago.getDate();
        if (debugCounter <= 10) Logger.log(`Usando día del primer pago como día de corte: ${diaCorteOriginal}`);
      }

      // Guardar primer pago
      if (aiActual instanceof Date && !isNaN(aiActual)) {
        outPrimer[i] = [aiActual];
      } else {
        outPrimer[i] = [primerPago instanceof Date ? primerPago : ''];
        if (primerPago instanceof Date && !esUnAdelanto) {
          if (plazoInfo.days > 0) {
            cntDias++;
          } else {
            cntPrimer++;
          }
        }
      }

      if (debugCounter <= 10) Logger.log(`Primer pago final para fila ${filaActual}: ${outPrimer[i][0]}`);

      // ============ CÁLCULO DE ÚLTIMO PAGO (AJ) ============
      let ultimoPago = '';

      if (ajActual instanceof Date && !isNaN(ajActual)) {
        ultimoPago = ajActual;
        if (debugCounter <= 10) Logger.log(`Usando AJ existente: ${ultimoPago}`);
      } 
      else if (esUnAdelanto) {
        if (venc instanceof Date) {
          ultimoPago = venc;
          if (debugCounter <= 10) Logger.log(`Es adelanto - Último pago = Vencimiento: ${ultimoPago}`);
        } else {
          ultimoPago = '';
          if (debugCounter <= 10) Logger.log(`Es adelanto pero NO hay vencimiento - dejando vacío`);
        }
      }
      else if (primerPago instanceof Date) {
        const { type, months, days } = plazoInfo;
        
        if (debugCounter <= 10) Logger.log(`Calculando último pago - Type: ${type}, Months: ${months}, Days: ${days}`);
        
        if (type === 'no_reconocido') {
          ultimoPago = 'N/A';
          if (debugCounter <= 10) Logger.log(`Plazo no reconocido - N/A`);
        } 
        else if (days > 0) {
          ultimoPago = primerPago;
          if (debugCounter <= 10) Logger.log(`Plazo en días - Último pago = Primer pago: ${ultimoPago}`);
        }
        else if (months > 0) {
 let programado = addMonthsKeepDOM(primerPago, months - 1, diaCorteOriginal);
          
          if (debugCounter <= 10) {
            Logger.log(`Último pago programado con día de corte ${diaCorteOriginal}: ${programado}`);
          }
          
          if (venc instanceof Date && t(programado) > t(venc)) {
            let corteEnMesVenc = cap(venc.getFullYear(), venc.getMonth(), diaCorteOriginal);
            
            programado = (t(corteEnMesVenc) <= t(venc))
              ? corteEnMesVenc
              : cap(venc.getFullYear(), venc.getMonth() - 1, diaCorteOriginal);
            
            if (debugCounter <= 10) {
              Logger.log(`Ajustado por vencimiento: ${programado}`);
            }
          }
          
          ultimoPago = programado;
          cntUltimo++;
          if (debugCounter <= 10) Logger.log(`Último pago calculado (meses): ${ultimoPago} con día corte ${diaCorteOriginal}`);
        } 
        else {
          ultimoPago = 'N/A';
          if (debugCounter <= 10) Logger.log(`Sin meses ni días - N/A`);
        }
      } else {
        if (debugCounter <= 10) Logger.log(`No hay primer pago, dejando último pago vacío`);
      }

      outUltimo[i] = [ultimoPago];
      
      if (debugCounter <= 10) Logger.log(`Último pago final para fila ${filaActual}: ${outUltimo[i][0]}`);
    }
    Logger.log(`\n=== Resultados ===`);
    Logger.log(`Total filas procesadas: ${effectiveLen}`);
    Logger.log(`Filas omitidas (Col A vacía): ${cntSkipped}`);
    Logger.log(`Primer pago calculados: ${cntPrimer}`);
    Logger.log(`Último pago calculados: ${cntUltimo}`);
    Logger.log(`Adelantos: ${cntAdelantos}`);
    Logger.log(`Plazos en días: ${cntDias}`);

    // ============ ESCRITURA DE RESULTADOS ============
    Logger.log(`\nEscribiendo resultados en columna AI (${COL_AI})...`);
    sh.getRange(START_ROW, COL_AI, effectiveLen, 1)
      .setValues(outPrimer.slice(0, effectiveLen))
      .setNumberFormat('dd/mm/yyyy');

    Logger.log(`Escribiendo resultados en columna AJ (${COL_AJ})...`);
    sh.getRange(START_ROW, COL_AJ, effectiveLen, 1)
      .setValues(outUltimo.slice(0, effectiveLen))
      .setNumberFormat('dd/mm/yyyy');

    Logger.log(`Escritura completada.`);

    SpreadsheetApp.getActive().toast(
      `✓ Procesado: ${effectiveLen - cntSkipped} filas válidas\n` +
      `Omitidas: ${cntSkipped} | Primer pago: ${cntPrimer} | Último pago: ${cntUltimo}\n` +
      `Adelantos: ${cntAdelantos} | Plazos en días: ${cntDias}`,
      'Pagos Actualizados',
      7
    );

  } catch (error) {
    Logger.log(`ERROR: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    SpreadsheetApp.getActive().toast(
      `❌ Error: ${error.message}`,
      'Error en Cálculo de Pagos',
      10
    );
    throw error;
  }
}
