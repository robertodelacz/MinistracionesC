/***** CONFIG *****/
const HOJA_DATOS = 'Traspasos';
const HOJA_LOG   = 'LogTraspaso';
const OCR_LANG   = 'es';

const CUENTA_CARGO_ESPERADA = '21003720010';

const CATALOGO_BENEF = {
  ACENDES:     '646180257803000004',
  BBVA:        '012180001128326159',
  BANCREA:     '152680120000472268',
  TESOFOM:     '646180396000030000',
  TESOCUALLI:  '646180396000030000',
  INBURSA:     '036180210037200104',
};

const TZ_MX = 'America/Mexico_City';


/***** ENTRADA PRINCIPAL *****/
function revisarTraspasos() {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const base = ss.getSheetByName(HOJA_DATOS) || ss.insertSheet(HOJA_DATOS);
  const log  = ss.getSheetByName(HOJA_LOG)   || ss.insertSheet(HOJA_LOG);

  if (base.getLastRow() === 0) {
    base.appendRow([
      'Fecha Correo', 'Fecha Aplicación', 'Fecha Asunto', 'Cuenta Cargo', 'Cuenta Beneficiaria',
      'Monto', 'Monto en letra', 'ID mensaje',
      'Banco', 'Val. Fecha', 'Val. Cargo', 'Val. Benef.', 'Tipo'
    ]);
  }
  if (log.getLastRow() === 0) {
    log.appendRow(['Fecha Log','Asunto','ID mensaje','Estado','Detalle','Tipo']);
  }

  const INICIO = new Date();
  INICIO.setHours(0, 0, 0, 0);
  const hoyYYYYMMDD = Utilities.formatDate(INICIO, TZ_MX, 'yyyyMMdd');

  // ==== IDs ya procesados ====
  const lrBase = base.getLastRow();
  const idsBaseCol = (lrBase >= 2)
    ? base.getRange(2, 8, lrBase - 1, 1).getValues().flat().filter(Boolean)
    : [];
  const idsBase      = new Set(idsBaseCol.map(String));
  const idsBasePlain = new Set(idsBaseCol.map(v => String(v).split('#')[0]));

  const hilos = GmailApp.search(buildQueryDesdeHoy_());

  // ====================================================================
  // REGLAS DE SELECCIÓN:
  // 1. Por cada hilo, el PRIMER mensaje que sea de HOY, tenga imagen,
  //    y NO sea Re: → tipo "Principal"
  // 2. Mensajes Re: u otros secundarios → SOLO si dicen explícitamente
  //    "extraordinario" en subject o body → tipo "Extraordinario"
  // 3. Cualquier otro mensaje del hilo se ignora
  // ====================================================================
  const mensajes = [];

  hilos.forEach(hilo => {
    const ms = hilo.getMessages();
    if (!ms.length) return;

    let principalAgregado = false;

    ms.forEach(m => {
      if (m.getDate() < INICIO) return;
      if (idsBasePlain.has(m.getId())) return;

      const subject  = m.getSubject()   || '';
      const bodyTxt  = m.getPlainBody() || '';
      const bodyHtml = m.getBody()      || '';

      const att = seleccionarImagenAdjunta_(m.getAttachments());
      if (!att) return;

      const esRespuesta = /^\s*re\s*:/i.test(subject);

      if (!principalAgregado && !esRespuesta) {
        m.tipoForzado = 'Principal';
        principalAgregado = true;
        mensajes.push(m);
      } else {
        if (_esExplicitamenteExtraordinario_(subject, bodyTxt, bodyHtml)) {
          m.tipoForzado = 'Extraordinario';
          mensajes.push(m);
        } else {
          Logger.log(`⏭️ Skip Re:/secundario sin "extraordinario": ${m.getId()} | "${subject}"`);
        }
      }
    });
  });

  if (!mensajes.length) {
    Logger.log('ℹ️ Sin mensajes nuevos para procesar hoy.');
    return;
  }

  mensajes
    .sort((a, b) => a.getDate() - b.getDate())
    .forEach(msg => {
      const msgId = msg.getId();

      if (idsBasePlain.has(msgId)) {
        Logger.log(`⏭️ Skip duplicado: ${msgId}`);
        return;
      }

      try {
        const subject = msg.getSubject() || '';
        const tipo    = msg.tipoForzado;
        const banco   = detectarBancoPorAsunto_(subject);

        const fechaAsuntoStr  = (subject.match(/(\d{8})/) || [])[1] || '';
        const fechaAsuntoDate = fechaAsuntoStr ? parseYYYYMMDD_(fechaAsuntoStr) : null;

        const att = seleccionarImagenAdjunta_(msg.getAttachments());
        if (!att) {
          log.appendRow([ahora_(), subject, msgId, 'Skip', 'Sin imagen válida', tipo]);
          return;
        }

        const textoOCR = ocrImagenAtexto_(att);
        if (!textoOCR) {
          log.appendRow([ahora_(), subject, msgId, 'Skip', 'OCR vacío', tipo]);
          return;
        }

        const filasCrudas = parsearMultiples_(textoOCR);
        if (!filasCrudas || !filasCrudas.length) {
          log.appendRow([ahora_(), subject, msgId, 'Skip', 'No se detectaron filas parseables', tipo]);
          return;
        }

        const seenWithinMsg = new Set();
        const nuevasDelMensaje = [];

        filasCrudas.forEach((d, idx) => {
          const { fechaAplicacion, cuentaCargo, cuentaBeneficiario, importe } = d;

          const valFecha = validarFechaAsunto_(fechaAsuntoStr, hoyYYYYMMDD, fechaAplicacion, msg.getDate());
          const cuentaCargoEsperada = (banco === 'INBURSA') ? '0112832615' : CUENTA_CARGO_ESPERADA;

          const cuentaCargoCorrected = corregirCuentaBancaria_(cuentaCargo, cuentaCargoEsperada);
          const cuentaBenefCorrected = corregirCuentaBancaria_(cuentaBeneficiario, CATALOGO_BENEF[banco] || '');

          const valCargo = validarCuenta_(cuentaCargoCorrected, cuentaCargoEsperada);
          valCargo.esperada = cuentaCargoEsperada;

          const esperadaBenef = banco ? (CATALOGO_BENEF[banco] || '') : '';
          const valBenef = esperadaBenef
            ? validarCuenta_(cuentaBenefCorrected, esperadaBenef)
            : { ok: false, detalle: 'Banco no identificado', mismatches: [] };

          const idFila = `${msgId}#${idx + 1}`;

          const keyWithinMsg = `${fechaAplicacion}|${cuentaCargoCorrected}|${cuentaBenefCorrected}|${aNumero_(importe).toFixed(2)}`;
          if (seenWithinMsg.has(keyWithinMsg)) {
            Logger.log(`⏭️ Skip fila duplicada en mensaje: ${keyWithinMsg}`);
            return;
          }
          seenWithinMsg.add(keyWithinMsg);

          if (idsBase.has(idFila)) return;

          nuevasDelMensaje.push({
            id: idFila, subject, tipo, banco,
            fechaAplicacion, fechaCorreo: msg.getDate(),
            fechaAsuntoStr, fechaAsuntoDate,
            cuentaCargo: cuentaCargoCorrected,
            cuentaBeneficiario: cuentaBenefCorrected,
            importe, valFecha, valCargo, valBenef
          });
        });

        if (!nuevasDelMensaje.length) {
          log.appendRow([ahora_(), subject, msgId, 'Skip', 'Sin filas nuevas (dedupe)', tipo]);
          return;
        }

        const start = primeraFilaVacia_(base);
        const valuesLeft  = [];
        const valuesRight = [];

        nuevasDelMensaje.forEach(r => {
          const fechaAplicacionCorregida = r.fechaAplicacion ? corregirFechaOCR_(r.fechaAplicacion) : '';
          const fechaAplicacionDate = fechaAplicacionCorregida ? parseDDMMYYYY_(fechaAplicacionCorregida) : '';

          valuesLeft.push([
            r.fechaCorreo || new Date(),
            fechaAplicacionDate || '',
            r.fechaAsuntoStr || '',
            String(r.cuentaCargo),       // forzar string para evitar notación científica
            String(r.cuentaBeneficiario), // forzar string para evitar notación científica
            aNumero_(r.importe),
          ]);

          valuesRight.push([
            r.id,
            r.banco || '',
            r.valFecha.ok ? 'Correcto' : r.valFecha.detalle,
            r.valCargo.ok ? 'Correcto' : r.valCargo.detalle,
            r.valBenef.ok ? 'Correcto' : r.valBenef.detalle,
            r.tipo
          ]);
        });

        // ✅ FIX: Formatear D y E como texto ANTES de escribir valores
        base.getRange(start, 4, valuesLeft.length, 1).setNumberFormat('@'); // D: Cuenta Cargo
        base.getRange(start, 5, valuesLeft.length, 1).setNumberFormat('@'); // E: Cuenta Benef

        base.getRange(start, 1, valuesLeft.length, 6).setValues(valuesLeft);
        base.getRange(start, 8, valuesRight.length, 6).setValues(valuesRight);

        base.getRange(start, 1, valuesLeft.length, 1).setNumberFormat('dd/MM/yyyy'); // A
        base.getRange(start, 2, valuesLeft.length, 1).setNumberFormat('dd/MM/yyyy'); // B
        base.getRange(start, 3, valuesLeft.length, 1).setNumberFormat('@');          // C
        base.getRange(start, 6, valuesLeft.length, 1).setNumberFormat('$#,##0.00'); // F

        try {
          const fG2 = base.getRange("G2").getFormula();
          if (fG2 && !/^=ARRAYFORMULA\(/i.test(fG2.trim())) {
            base.getRange(start, 7, valuesLeft.length, 1).setFormulaR1C1(base.getRange("G2").getFormulaR1C1());
          }
        } catch (e) {}

        for (let i = 0; i < nuevasDelMensaje.length; i++) {
          const r = nuevasDelMensaje[i];
          base.getRange(start + i, 10).setBackground(r.valFecha.ok ? '#67f867' : '#ff9500');
          base.getRange(start + i, 11).setBackground(r.valCargo.ok ? '#67f867' : '#ff9500');
          base.getRange(start + i, 12).setBackground(r.valBenef.ok ? '#67f867' : '#ff9500');

          if (!r.valCargo.ok) {
            aplicarRichMismatch_(base.getRange(start + i, 4), r.cuentaCargo, r.valCargo.esperada, r.valCargo.mismatches);
          }
          if (!r.valBenef.ok && (CATALOGO_BENEF[r.banco] || '')) {
            aplicarRichMismatch_(base.getRange(start + i, 5), r.cuentaBeneficiario, CATALOGO_BENEF[r.banco], r.valBenef.mismatches);
          }
          idsBase.add(String(r.id));
        }

        idsBasePlain.add(msgId);
        log.appendRow([ahora_(), subject, msgId, 'Procesado', `OK — ${nuevasDelMensaje.length} fila(s)`, tipo]);

      } catch (e) {
        log.appendRow([ahora_(), msg.getSubject() || '', msgId, 'Error', String(e), msg.tipoForzado || '']);
      }
    });
}


/* ====== Helpers ====== */

function _esExplicitamenteExtraordinario_(subject, bodyTxt, bodyHtml) {
  const txt = ((subject || '') + ' ' + (bodyTxt || '') + ' ' + (bodyHtml || '')).toLowerCase();
  return /extraordinari/.test(txt);
}

function seleccionarImagenAdjunta_(atts) {
  if (!atts || !atts.length) return null;
  const MIN_BYTES = 5 * 1024;
  const esSoportado = (a) => {
    const ct  = (a.getContentType && a.getContentType()) || '';
    const nom = (a.getName && a.getName()) ? a.getName().toLowerCase() : '';
    const porMime = /^image\/(png|jpe?g)$/i.test(ct);
    const porExt  = /\.(png|jpe?g|jpg)$/i.test(nom);
    const sospechoso = /signature|firma|logo|icon|banner/i.test(nom);
    const bytes = (a.getBytes && a.getBytes()) ? a.getBytes().length : (a.getSize ? a.getSize() : 0);
    return (porMime || porExt) && !sospechoso && bytes >= MIN_BYTES;
  };
  const validos = atts.filter(esSoportado);
  if (!validos.length) return null;
  validos.sort((a, b) => {
    const ab = (a.getBytes && a.getBytes()) ? a.getBytes().length : (a.getSize ? a.getSize() : 0);
    const bb = (b.getBytes && b.getBytes()) ? b.getBytes().length : (b.getSize ? b.getSize() : 0);
    return bb - ab;
  });
  return validos[0];
}

function buildQueryDesdeHoy_() {
  const hoy0 = new Date();
  hoy0.setHours(0, 0, 0, 0);
  const desde = Utilities.formatDate(hoy0, TZ_MX, 'yyyy/MM/dd');
  Logger.log(`🔍 Buscando desde: ${desde}`);
  Logger.log(`🕐 Hora actual: ${Utilities.formatDate(new Date(), TZ_MX, 'yyyy/MM/dd HH:mm:ss')}`);
  const query = `(subject:(TRASPASO OR TRASPASOS OR EXTRAORDINARI)) after:${desde}`;
  Logger.log(`📧 Query: ${query}`);
  return query;
}

function ocrImagenAtexto_(blob) {
  try {
    const resource = {
      title: `OCR_${new Date().toISOString()}`,
      mimeType: 'application/vnd.google-apps.document'
    };
    const file = Drive.Files.create(resource, blob, { ocr: true, ocrLanguage: OCR_LANG });
    Utilities.sleep(3000);
    try {
      const doc = DocumentApp.openById(file.id);
      let texto = doc.getBody().getText() || '';
      texto = limpiarTextoOCR_(texto);
      return texto;
    } finally {
      try { Drive.Files.remove(file.id); } catch(e){}
    }
  } catch(e) {
    Logger.log(`Error OCR: ${e}`);
    return '';
  }
}

function corregirFechaOCR_(fecha) {
  if (!fecha) return fecha;
  const partes = fecha.split('/');
  if (partes.length !== 3) return fecha;
  let [dia, mes, anio] = partes.map(Number);
  const anioActual = new Date().getFullYear();
  if (anio > anioActual + 1) { Logger.log(`⚠️ Año futuro: ${anio} → ${anioActual}`); anio = anioActual; }
  if (anio < 100) anio = 2000 + anio;
  const fc = `${String(dia).padStart(2,'0')}/${String(mes).padStart(2,'0')}/${anio}`;
  if (fc !== fecha) Logger.log(`🔧 Fecha: ${fecha} → ${fc}`);
  return fc;
}

function corregirCuentaBancaria_(cuenta, esperada) {
  if (!cuenta || !esperada) return cuenta;
  const cuentaStr   = String(cuenta).trim();
  const esperadaStr = String(esperada).trim();
  if (cuentaStr === esperadaStr) return cuentaStr;
  if (cuentaStr.length !== esperadaStr.length) return cuentaStr;
  const confusiones = {
    '0':['O','o','D'],'1':['I','l','|'],'2':['Z','z'],'3':['8'],
    '5':['S','s'],'6':['G','g','b','8'],'7':['1','l'],'8':['B','3','6'],'9':['g','q']
  };
  const arr = cuentaStr.split('');
  for (let i = 0; i < esperadaStr.length; i++) {
    const dE = esperadaStr[i], dO = arr[i];
    if (dE !== dO && (confusiones[dE] || []).includes(dO)) {
      Logger.log(`🔧 Pos ${i}: '${dO}' → '${dE}'`);
      arr[i] = dE;
    }
  }
  const resultado = arr.join('');
  if (resultado !== cuentaStr) Logger.log(`✅ Cuenta: ${cuentaStr} → ${resultado}`);
  return resultado;
}

function corregirNumerosConcatenados_(texto) {
  let corregido = texto;
  const numerosLargos = texto.match(/\d{12,}/g);
  if (!numerosLargos) return corregido;

  numerosLargos.forEach(numLargo => {
    Logger.log(`🔍 Número largo (${numLargo.length} dígitos): ${numLargo}`);
    const anioActual = new Date().getFullYear();

    // Caso: año(4) + cuenta cargo(11) = 15 dígitos → ej: 202621003720010
    if (numLargo.length === 15) {
      const posibleAnio = parseInt(numLargo.substring(0, 4));
      if (posibleAnio >= 2020 && posibleAnio <= anioActual + 2) {
        const resto = numLargo.substring(4);
        Logger.log(`  ✂️ Año+Cuenta: año=${posibleAnio}, cuenta=${resto}`);
        corregido = corregido.replace(numLargo, `${posibleAnio} ${resto}`);
        return;
      }
    }

    // Caso: año(4) + cargo(11) + benef(18) = 33 dígitos
    if (numLargo.length >= 32 && numLargo.length <= 35) {
      const posibleAnio = parseInt(numLargo.substring(0, 4));
      if (posibleAnio >= 2020 && posibleAnio <= anioActual + 2) {
        const resto  = numLargo.substring(4);
        const cargo  = resto.substring(0, 11);
        const benef  = resto.substring(11);
        Logger.log(`  ✂️ Año+Cargo+Benef: año=${posibleAnio}, cargo=${cargo}, benef=${benef}`);
        corregido = corregido.replace(numLargo, `${posibleAnio} ${cargo} ${benef}`);
        return;
      }
    }

    // Caso: cargo(11) + benef(18) = 29 dígitos
    if (numLargo.length >= 28 && numLargo.length <= 30) {
      const cargo = numLargo.substring(0, 11);
      const benef = numLargo.substring(11);
      Logger.log(`  ✂️ Cargo+Benef: cargo=${cargo}, benef=${benef}`);
      corregido = corregido.replace(numLargo, `${cargo} ${benef}`);
      return;
    }

    // Caso general: 19-27 dígitos → dividir en pos 11
    if (numLargo.length >= 19 && numLargo.length <= 27) {
      const cargo = numLargo.substring(0, 11);
      const benef = numLargo.substring(11);
      Logger.log(`  ✂️ General pos 11: cargo=${cargo}, benef=${benef}`);
      corregido = corregido.replace(numLargo, `${cargo} ${benef}`);
    }
  });

  return corregido;
}

function limpiarTextoOCR_(texto) {
  if (!texto) return '';
  Logger.log(`\n🧹 Limpiando texto OCR...`);
  let limpio = texto;
  limpio = limpio.replace(/\u00A0/g, ' ');
  limpio = limpio.replace(/[\u200B-\u200D\uFEFF]/g, '');
  limpio = limpio.replace(/\u2002|\u2003/g, ' ');
  limpio = limpio.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  Logger.log(`  🔤 Corrigiendo confusiones letra-número...`);
  limpio = limpio.replace(/(\d)G(\d)/g, '$16$2');
  limpio = limpio.replace(/(\d)g(\d)/g, '$16$2');
  limpio = limpio.replace(/(\d)[Oo](\d)/g, '$10$2');
  limpio = limpio.replace(/(\d)[Il|](\d)/g, '$11$2');
  limpio = limpio.replace(/(\d)[Ss](\d)/g, '$15$2');
  limpio = limpio.replace(/(\d)B(\d)/g, '$18$2');
  Logger.log(`  🔢 Corrigiendo números concatenados...`);
  limpio = corregirNumerosConcatenados_(limpio);
  Logger.log(`  🔧 Corrigiendo errores de OCR...`);
  limpio = corregirNumeros_(limpio);
  limpio = limpio.replace(/[ \t]+/g, ' ');
  limpio = limpio.replace(/\n\s*\n\s*\n/g, '\n\n');
  Logger.log(`✅ Texto limpio (${limpio.length} caracteres)`);
  return limpio.trim();
}

function corregirNumeros_(texto) {
  let c = texto;
  c = c.replace(/\b(\d+)O(\d+)\b/g,  '$10$2');
  c = c.replace(/\bO(\d{9,})\b/g,    '0$1');
  c = c.replace(/\b(\d+)[lI](\d+)\b/g, '$11$2');
  c = c.replace(/\b(\d+)S(\d+)\b/g,  '$15$2');
  c = c.replace(/\b(\d+)B(\d+)\b/g,  '$18$2');
  c = c.replace(/\b(\d+)Z(\d+)\b/g,  '$12$2');
  c = c.replace(/\b(\d+)G(\d+)\b/g,  '$16$2');
  // ✅ ELIMINADA la línea que re-concatenaba dígitos separados por espacios
  // c = c.replace(/(\d)\s+(\d)/g, '$1$2'); ← REMOVIDA
  return c;
}

function filtrarImportesAmbiguos_(importes) {
  if (!importes || importes.length <= 1) return importes;
  const mayor = importes[0];
  const mayorStr = String(Math.round(mayor));
  return importes.filter(imp => {
    if (imp === mayor) return true;
    const impStr = String(Math.round(imp));
    if (mayorStr.includes(impStr)) {
      Logger.log(`🚫 Importe filtrado como fragmento: ${imp} (substring de ${mayor})`);
      return false;
    }
    return true;
  });
}

function parsearMultiples_(textoOriginal) {
  if (!textoOriginal) return [];
  Logger.log(`\n🔄 Iniciando parseo múltiple...`);
  const raw = limpiarTextoOCR_(textoOriginal);
  Logger.log(`📝 Texto limpio (${raw.length} chars)`);

  const estrategias = [
    { fn: () => parsearLineaUnica_(raw),        nombre: 'Línea Única' },
    { fn: () => parsearFormatoTabular_(raw),    nombre: 'Formato Tabular' },
    { fn: () => parsearPorColumnas_(raw),       nombre: 'Por Columnas' },
    { fn: () => parsearConOrdenVisual_(raw),    nombre: 'Orden Visual' },
    { fn: () => parsearPorSeparadores_(raw),    nombre: 'Por Separadores' },
    { fn: () => parsearPorPatronCompleto_(raw), nombre: 'Patrón Completo' },
    { fn: () => parsearPorImportes_(raw),       nombre: 'Por Importes' },
    { fn: () => parsearDesdeTexto_(raw),        nombre: 'Texto Básico' }
  ];

  let mejorResultado = [];
  let estrategiaExitosa = '';

  for (const e of estrategias) {
    try {
      Logger.log(`\n🧪 Probando: ${e.nombre}`);
      const res = e.fn();
      if (res && res.length > 0) {
        Logger.log(`  ✓ ${res.length} fila(s)`);
        const valido = validarResultadoParseo_(res);
        Logger.log(`  ✓ Validación: ${valido ? 'PASS ✅' : 'FAIL ❌'}`);
        if (res.length > mejorResultado.length) { mejorResultado = res; estrategiaExitosa = e.nombre; }
        if (valido) { Logger.log(`\n✅ Exitosa: ${e.nombre}`); break; }
      } else {
        Logger.log(`  ✗ Sin resultados`);
      }
    } catch(err) {
      Logger.log(`  ❌ Error: ${err}`);
    }
  }

  if (mejorResultado.length) Logger.log(`\n🎉 Mejor: ${estrategiaExitosa} (${mejorResultado.length} fila(s))`);
  else Logger.log(`\n⚠️ No se pudo parsear`);
  return mejorResultado;
}

function parsearLineaUnica_(texto) {
  const linea = texto.replace(/\n/g, ' ').trim();
  const patron = /(\d{1,2}\/\d{1,2}\/\d{4})\s*(\d{29})\s*.*?\$\s*([\d,]+\.?\d{0,2})/;
  let match = linea.match(patron);
  if (match) {
    let [_, fecha, num, importe] = match;
    return [{ fechaAplicacion: corregirFechaOCR_(fecha), cuentaCargo: num.substring(0,11), cuentaBeneficiario: num.substring(11), importe: importe.replace(/,/g,'') }];
  }
  const patronFlexible = /(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{25,35}).*?\$\s*([\d,]+\.?\d{0,2})/;
  match = linea.match(patronFlexible);
  if (match) {
    let [_, fecha, num, importe] = match;
    return [{ fechaAplicacion: corregirFechaOCR_(fecha), cuentaCargo: num.substring(0,11), cuentaBeneficiario: num.substring(11), importe: importe.replace(/,/g,'') }];
  }
  return null;
}

function parsearFormatoTabular_(texto) {
  const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  const filas = [];
  lineas.forEach(linea => {
    const numeros = linea.match(/\d{10,}/g);
    if (!numeros || numeros.length < 2) return;
    const mFecha = linea.match(/\b([0-3]?\d[\/-][01]?\d[\/-]\d{4})\b/);
    const importeMatch = linea.match(/\$?\s*([\d,]+\.?\d{0,2})/);
    if (importeMatch) {
      const ord = [...numeros].sort((a,b) => a.length-b.length);
      filas.push({ fechaAplicacion: mFecha ? corregirFechaOCR_(mFecha[1].replace(/-/g,'/')) : '', cuentaCargo: ord[0], cuentaBeneficiario: ord[1], importe: importeMatch[1].replace(/,/g,'') });
    }
  });
  return filas.length ? filas : null;
}

function parsearPorColumnas_(texto) {
  const lineas = texto.split('\n');
  let inicioFilas = 0;
  const headers = ['fecha','cargo','beneficiar','razon','alias','importe'];
  for (let i = 0; i < Math.min(3, lineas.length); i++) {
    if (headers.filter(h => lineas[i].toLowerCase().includes(h)).length >= 3) { inicioFilas = i+1; break; }
  }
  const filas = [];
  for (let i = inicioFilas; i < lineas.length; i++) {
    const linea = lineas[i].trim();
    if (!linea) continue;
    const partes = linea.split(/\s{2,}|\t/).map(p => p.trim()).filter(Boolean);
    if (partes.length < 3) continue;
    let fecha='', cuentas=[], importe='';
    partes.forEach(p => {
      if (/\b\d{1,2}[\/-]\d{1,2}[\/-]\d{4}\b/.test(p) && !fecha) fecha = p;
      else if (/^\d{10,}$/.test(p)) cuentas.push(p);
      else if (/[\d,]+\.?\d{0,2}/.test(p) && !importe) { const m = p.match(/([\d,]+\.?\d{0,2})/); if(m) importe=m[1]; }
    });
    if (cuentas.length >= 2 && importe) {
      cuentas.sort((a,b) => a.length-b.length);
      filas.push({ fechaAplicacion: corregirFechaOCR_(fecha.replace(/-/g,'/')), cuentaCargo: cuentas[0], cuentaBeneficiario: cuentas[1], importe: importe.replace(/,/g,'') });
    }
  }
  return filas.length ? filas : null;
}

function parsearConOrdenVisual_(texto) {
  const nums = (texto.match(/\d{10,}/g) || []);
  if (nums.length < 2) return null;
  const unicos = [...new Set(nums)];
  if (unicos.length < 2) return null;
  const ord = [...unicos].sort((a,b) => a.length-b.length);
  const cargo = ord[0], benef = ord[ord.length-1];
  const mFecha = texto.match(/\b([0-3]?\d[\/-][01]?\d[\/-]\d{4})\b/);
  let importes = extraerImportes_(texto);
  if (!importes.length) return null;
  importes = filtrarImportesAmbiguos_(importes);
  return importes.map(imp => ({
    fechaAplicacion: mFecha ? corregirFechaOCR_(mFecha[1].replace(/-/g,'/')) : '',
    cuentaCargo: cargo,
    cuentaBeneficiario: benef,
    importe: String(imp)
  }));
}

function parsearPorSeparadores_(texto) {
  const partes = texto.split(/\n?[-–—]{3,}\n?/g).map(s => s.trim()).filter(Boolean);
  if (partes.length <= 1) return null;
  const filas = partes.map(parsearBloqueIndividual_).filter(Boolean);
  return filas.length ? filas : null;
}

function parsearPorPatronCompleto_(texto) {
  const patron = /(?:Fecha[:\s]*)?(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})[\s\S]*?(\d{10,20})[\s\S]*?(\d{10,20})[\s\S]*?\$\s*([\d,]+\.?\d{0,2})/gi;
  const matches = [...texto.matchAll(patron)];
  if (!matches.length) return null;
  return matches.map(m => {
    let [_, fecha, n1, n2, importe] = m;
    let cargo=n1, benef=n2;
    if (cargo.length > benef.length) [cargo,benef]=[benef,cargo];
    return { fechaAplicacion: corregirFechaOCR_(fecha.replace(/-/g,'/')), cuentaCargo: cargo, cuentaBeneficiario: benef, importe: importe.replace(/,/g,'') };
  });
}

function parsearBloqueIndividual_(bloque) {
  const texto = String(bloque).replace(/\s+/g,' ').trim();
  const mFecha = texto.match(/\b([0-3]?\d[\/-][01]?\d[\/-]\d{4})\b/);
  const nums = texto.match(/\d{10,}/g) || [];
  if (nums.length < 2) return null;
  const unicos = [...new Set(nums)];
  if (unicos.length < 2) return null;
  let cargo=unicos[0], benef=unicos[1];
  if (cargo.length > benef.length) [cargo,benef]=[benef,cargo];
  const importes = extraerImportes_(texto);
  if (!importes.length) return null;
  return { fechaAplicacion: mFecha ? corregirFechaOCR_(mFecha[1].replace(/-/g,'/')) : '', cuentaCargo: cargo, cuentaBeneficiario: benef, importe: String(importes[0]) };
}

function extraerImportes_(texto) {
  const patrones = [
    /\$\s*([\d]{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    /\$\s*([\d]{1,3}(?:\.\d{3})*(?:,\d{2})?)/g,
    /([\d]{1,3}(?:,\d{3})*\.\d{2})/g,
  ];
  const importes = new Set();
  patrones.forEach(p => {
    [...texto.matchAll(p)].forEach(m => {
      const num = parseFloat(m[1].replace(/,/g,''));
      if (!isNaN(num) && num > 0) importes.add(num);
    });
  });
  return [...importes].sort((a,b) => b-a);
}

function validarResultadoParseo_(filas) {
  if (!filas || !filas.length) return false;
  return filas.every(f =>
    f.cuentaCargo && f.cuentaCargo.length >= 10 &&
    f.cuentaBeneficiario && f.cuentaBeneficiario.length >= 10 &&
    f.importe && !isNaN(aNumero_(f.importe)) && aNumero_(f.importe) > 0
  );
}

function parsearDesdeTexto_(t) {
  const texto = String(t).replace(/\s+/g,' ').trim();
  const mFecha = texto.match(/\b([0-3]?\d[\/-][01]?\d[\/-]\d{4})\b/);
  const nums = texto.match(/\b\d{10,}\b/g) || [];
  let importes = extraerImportes_(texto);
  if (nums.length < 2 || !importes.length) return null;
  let cargo=nums[0], benef=nums[1];
  if (cargo.length > benef.length) [cargo,benef]=[benef,cargo];
  importes = filtrarImportesAmbiguos_(importes);
  return importes.map(n => ({ fechaAplicacion: mFecha ? corregirFechaOCR_(mFecha[1].replace(/-/g,'/')) : '', cuentaCargo: cargo, cuentaBeneficiario: benef, importe: String(n) }));
}

function parsearPorImportes_(texto) {
  const mFecha = texto.match(/\b([0-3]?\d[\/-][01]?\d[\/-]\d{4})\b/);
  const nums = texto.match(/\b\d{10,}\b/g) || [];
  if (nums.length < 2) return [];
  let cargo=nums[0], benef=nums[1];
  if (cargo.length > benef.length) [cargo,benef]=[benef,cargo];
  let importes = extraerImportes_(texto);
  importes = filtrarImportesAmbiguos_(importes);
  const vistos = new Set();
  return importes.filter(n => { const k=n.toFixed(2); if(vistos.has(k)) return false; vistos.add(k); return true; })
    .map(n => ({ fechaAplicacion: mFecha ? corregirFechaOCR_(mFecha[1].replace(/-/g,'/')) : '', cuentaCargo: cargo, cuentaBeneficiario: benef, importe: String(n) }));
}

function validarFechaAsunto_(fechaAsuntoYYYYMMDD, hoyYYYYMMDD, fechaImagen='', fechaCorreo=null) {
  let fechaCorreoYYYYMMDD = '';
  if (fechaCorreo) fechaCorreoYYYYMMDD = Utilities.formatDate(fechaCorreo, TZ_MX, 'yyyyMMdd');
  let fechaImagenYYYYMMDD = '';
  if (fechaImagen) {
    const partes = fechaImagen.replace(/-/g,'/').trim().split('/');
    if (partes.length === 3) {
      const [dI,mI,yI] = partes.map(Number);
      fechaImagenYYYYMMDD = `${yI}${String(mI).padStart(2,'0')}${String(dI).padStart(2,'0')}`;
    }
  }
  if (!fechaAsuntoYYYYMMDD) return { ok:false, detalle:'Sin fecha en asunto' };
  if (!fechaCorreoYYYYMMDD) return { ok:false, detalle:'Sin fecha de correo' };
  if (fechaAsuntoYYYYMMDD===fechaCorreoYYYYMMDD && fechaImagenYYYYMMDD===fechaCorreoYYYYMMDD && fechaImagenYYYYMMDD) return { ok:true, detalle:'Correcto' };
  if (!fechaImagenYYYYMMDD) {
    if (fechaAsuntoYYYYMMDD===fechaCorreoYYYYMMDD) return { ok:true, detalle:'Correcto (sin fecha en imagen)' };
    return { ok:false, detalle:`Sin fecha en imagen | ${compararFechas_(fechaAsuntoYYYYMMDD, fechaCorreoYYYYMMDD,'Asunto','Correo')}` };
  }
  const disc = [];
  if (fechaAsuntoYYYYMMDD!==fechaCorreoYYYYMMDD) disc.push(compararFechas_(fechaAsuntoYYYYMMDD,fechaCorreoYYYYMMDD,'Asunto','Correo'));
  if (fechaImagenYYYYMMDD!==fechaCorreoYYYYMMDD) disc.push(compararFechas_(fechaImagenYYYYMMDD,fechaCorreoYYYYMMDD,'Imagen','Correo'));
  if (fechaAsuntoYYYYMMDD!==fechaImagenYYYYMMDD) disc.push(compararFechas_(fechaAsuntoYYYYMMDD,fechaImagenYYYYMMDD,'Asunto','Imagen'));
  return { ok:false, detalle: disc.join(' | ') };
}

function compararFechas_(f1, f2, n1, n2) {
  const difs = [];
  if (f1.slice(0,4)!==f2.slice(0,4)) difs.push(`Año ${n1}/${n2}: ${f1.slice(0,4)}≠${f2.slice(0,4)}`);
  if (f1.slice(4,6)!==f2.slice(4,6)) difs.push(`Mes ${n1}/${n2}: ${f1.slice(4,6)}≠${f2.slice(4,6)}`);
  if (f1.slice(6,8)!==f2.slice(6,8)) difs.push(`Día ${n1}/${n2}: ${f1.slice(6,8)}≠${f2.slice(6,8)}`);
  return difs.length ? difs.join(', ') : `${n1} y ${n2} coinciden`;
}

function validarCuenta_(obtenida, esperada) {
  if (!obtenida) return { ok:false, detalle:'Cuenta vacía', mismatches:[] };
  if (!esperada)  return { ok:false, detalle:'Sin cuenta esperada', mismatches:[] };
  const a = String(obtenida).trim(), e = String(esperada).trim();
  if (a===e) return { ok:true, detalle:'Correcto', mismatches:[] };
  const mismatches = [];
  for (let i=0; i<Math.min(a.length,e.length); i++) if (a[i]!==e[i]) mismatches.push(i);
  if (a.length!==e.length) {
    const msg = a.length < e.length ? `Falta ${e.length-a.length} dígito(s)` : `Sobra ${a.length-e.length} dígito(s)`;
    return { ok:false, detalle:msg, mismatches };
  }
  return { ok:false, detalle:'Dígitos distintos en posiciones: '+mismatches.map(i=>i+1).join(', '), mismatches };
}

function aplicarRichMismatch_(range, valorObtenido, valorEsperado, mismatches) {
  range.setValue(valorObtenido);
  try {
    const text = String(valorObtenido);
    const builder = SpreadsheetApp.newRichTextValue().setText(text);
    const rojo = SpreadsheetApp.newTextStyle().setForegroundColor('#c00000').build();
    mismatches.forEach(idx => { if (idx < text.length) builder.setTextStyle(idx, idx+1, rojo); });
    range.setRichTextValue(builder.build());
    range.setNote(`Esperado: ${valorEsperado}`);
  } catch (_) {
    range.setNote(`Esperado: ${valorEsperado}`);
  }
}

function detectarBancoPorAsunto_(subject) {
  const s = (subject||'').toUpperCase();
  if (s.includes('ACENDES'))     return 'ACENDES';
  if (s.includes('BBVA'))        return 'BBVA';
  if (s.includes('BANCREA'))     return 'BANCREA';
  if (s.includes('TESOFOM'))     return 'TESOFOM';
  if (s.includes('TESOCUALLI'))  return 'TESOCUALLI';
  if (s.includes('INBURSA'))     return 'INBURSA';
  return '';
}

function ahora_() {
  return Utilities.formatDate(new Date(), TZ_MX, 'dd/MM/yyyy HH:mm:ss');
}
function parseYYYYMMDD_(s) {
  return new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8));
}
function parseDDMMYYYY_(s) {
  if (!s) return '';
  const [d,m,y] = s.split('/').map(Number);
  const anio = y < 100 ? 2000+y : (y > new Date().getFullYear()+1 ? new Date().getFullYear() : y);
  return new Date(anio, m-1, d);
}
function aNumero_(s) {
  return Number(String(s).replace(/,/g,'').replace(/[^0-9.]/g,''));
}
function primeraFilaVacia_(hoja) {
  const colA = hoja.getRange("A:A").getValues().flat();
  for (let i=1; i<colA.length; i++) if (!colA[i]) return i+1;
  return hoja.getLastRow()+1;
}

function diagnosticarOCR(messageId) {
  const msg = GmailApp.getMessageById(messageId);
  if (!msg) { Logger.log("❌ Mensaje no encontrado"); return; }
  Logger.log(`📧 Asunto: ${msg.getSubject()}`);
  Logger.log(`🏦 Banco: ${detectarBancoPorAsunto_(msg.getSubject())}`);
  const att = seleccionarImagenAdjunta_(msg.getAttachments());
  if (!att) { Logger.log("❌ Sin imagen válida"); return; }
  Logger.log(`📎 Imagen: ${att.getName()}`);
  const textoOCR = ocrImagenAtexto_(att);
  Logger.log("\n===== TEXTO OCR =====\n" + textoOCR);
  Logger.log("\n===== PARSEO =====");
  const r = {
    lineaUnica:     parsearLineaUnica_(textoOCR),
    tabular:        parsearFormatoTabular_(textoOCR),
    columnas:       parsearPorColumnas_(textoOCR),
    ordenVisual:    parsearConOrdenVisual_(textoOCR),
    separadores:    parsearPorSeparadores_(textoOCR),
    patronCompleto: parsearPorPatronCompleto_(textoOCR),
    importes:       parsearPorImportes_(textoOCR),
    textoBasico:    parsearDesdeTexto_(textoOCR)
  };
  Object.entries(r).forEach(([n,res]) => {
    Logger.log(`\n📊 ${n}: ${res ? res.length : 0} fila(s)`);
    if (res && res.length) { Logger.log(JSON.stringify(res,null,2)); Logger.log(`✓ ${validarResultadoParseo_(res)?'PASS':'FAIL'}`); }
  });
}
