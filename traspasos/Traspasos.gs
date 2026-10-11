/* ==========================================================================
   TRASPASOS V2  ·  Núcleo (configuración, catálogo, validaciones, ingesta, hoja)
   --------------------------------------------------------------------------
   Archivos del módulo (copiar los tres al proyecto de Apps Script):
     · Traspasos.gs      → este archivo (reemplaza al Traspasos.gs anterior)
     · TraspasosOCR.gs   → lectura de capturas (Claude + respaldo OCR de Drive)
     · TraspasosApp.gs   → pantalla para compu y celular + web app

   Qué hace:
     1. Busca en Gmail los correos de traspasos (asunto con fecha yyyymmdd y banco).
     2. Lee TODAS las capturas de cada correo (no solo la más grande).
     3. Valida fecha (asunto = día del correo = fecha de la captura), cuenta de
        cargo, cuenta beneficiaria y monto contra la hoja CATALOGO TRASPASOS.
     4. Deja una fila por operación en la hoja TRASPASOS V2, sin perder nada:
        si una captura no se puede leer, queda una fila "SIN LECTURA" con aviso.
     5. El Vo.Bo. se da desde la hoja o desde la pantalla (web/celular).

   Nada de esto escribe cuentas "corregidas": si algo no coincide se avisa y
   se muestra qué se leyó contra qué se esperaba.
   ========================================================================== */

const TRAS = {
  HOJA: 'TRASPASOS V2',
  HOJA_CATALOGO: 'CATALOGO TRASPASOS',
  HOJA_LOG: 'LOG TRASPASOS V2',
  HOJA_HISTORICO: 'Traspasos',          // hoja anterior (solo se lee para armar el catálogo)
  TZ: 'America/Mexico_City',

  // --- Búsqueda en Gmail ---
  HORAS_ATRAS: 72,                       // ventana de búsqueda (cubre fines de semana)
  ASUNTO_PALABRAS: 'TRASPASO OR TRASPASOS OR EXTRAORDINARIO OR EXTRAORDINARIA OR EXTRAORDINARIOS',
  EXCLUIR_ASUNTO: /SOLICITUD\s+TRASPASO\s+ENTRE\s+CUENTAS/i,   // correos de otro proceso
  // Después del primer correo del hilo, solo cuentan los mensajes que digan esto (extraordinario o pidiendo Vo.Bo.).
  // Todo lo demás del hilo (publicaciones, comprobantes finales, respuestas) NO se valida.
  SEGUNDO_TRASPASO: /extraordinari|vo\.?\s*bo\b|vobo|visto\s+bueno/i,
  MAX_HILOS: 80,
  MIN_BYTES_IMAGEN: 8 * 1024,            // descarta logos / firmas pequeñas
  MAX_MENSAJES_POR_CORRIDA: 25,
  TIEMPO_MAX_MS: 4.5 * 60 * 1000,        // Apps Script corta a los 6 min
  MAX_INTENTOS_LECTURA: 3,               // luego deja fila "SIN LECTURA"

  // --- Lectura de capturas ---
  MOTOR: 'AUTO',                         // 'AUTO' (Claude si hay clave, si no Drive) | 'CLAUDE' | 'DRIVE'
  CLAUDE_MODELO: 'claude-sonnet-5-5',
  CLAUDE_URL: 'https://api.anthropic.com/v1/messages',
  CLAUDE_MAX_BYTES: 4.5 * 1024 * 1024,
  OCR_IDIOMA: 'es',

  // --- Mensaje de Vo.Bo. ---
  DESTINATARIA: 'Danna',
  USUARIOS_PERMITIDOS: [],               // correos extra con acceso a la pantalla web (además de ti)

  // --- Actualización automática (disparador) ---
  HORA_INICIO: 7, HORA_FIN: 20,          // hora de México
  DIAS: [1, 2, 3, 4, 5, 6],              // 0=domingo … 6=sábado

  // --- Montos ---
  MONTO_BAJO: 1000,                      // por debajo se avisa "confirma en la captura"

  LOG_MAX_FILAS: 3000,
  COLOR: {
    BANDA: '#2F3B4C', BANDA_TEXTO: '#FFFFFF', ENCABEZADO: '#E9E5D8', ENCABEZADO_TEXTO: '#1F1F1F',
    BLOQUE_B: '#F6F3EA', LINEA_SUAVE: '#E6E2D5',
    OK_FONDO: '#D9EEDF', OK_TEXTO: '#1E6B3A',
    PEND_FONDO: '#FFF1C2', PEND_TEXTO: '#7A5600',
    MAL_FONDO: '#F8D7D7', MAL_TEXTO: '#9B1C1C',
    GRIS_TEXTO: '#8A8A8A'
  }
};

const TRAS_ESTADOS = ['PENDIENTE', 'VO.BO. DADO', 'OBSERVADO', 'DESCARTADO'];
const TRAS_TIPOS = ['Principal', 'Extraordinario'];

/* Columnas de la hoja (el orden se puede cambiar: todo se busca por encabezado). */
const TRAS_COLS = [
  { k: 'estado',      t: 'ESTADO',                   w: 120, g: 1 },
  { k: 'vobo',        t: 'VO.BO.',                   w: 60,  g: 1 },
  { k: 'revision',    t: 'REVISIÓN',                 w: 120, g: 1 },
  { k: 'fechaCorreo', t: 'FECHA Y HORA DEL CORREO',  w: 135, g: 2 },
  { k: 'fechaAsunto', t: 'FECHA EN ASUNTO',          w: 100, g: 2 },
  { k: 'fechaApp',    t: 'FECHA EN CAPTURA',         w: 100, g: 2 },
  { k: 'destino',     t: 'DESTINO',                  w: 110, g: 2 },
  { k: 'tipo',        t: 'TIPO',                     w: 105, g: 2 },
  { k: 'monto',       t: 'MONTO',                    w: 120, g: 2 },
  { k: 'letra',       t: 'MONTO EN LETRA',           w: 260, g: 2 },
  { k: 'cuentaCargo', t: 'CUENTA CARGO',             w: 130, g: 2 },
  { k: 'cuentaBenef', t: 'CUENTA BENEFICIARIA',      w: 170, g: 2 },
  { k: 'valFecha',    t: 'VAL. FECHA',               w: 190, g: 3 },
  { k: 'valCargo',    t: 'VAL. CARGO',               w: 190, g: 3 },
  { k: 'valBenef',    t: 'VAL. BENEFICIARIA',        w: 190, g: 3 },
  { k: 'avisos',      t: 'AVISOS',                   w: 320, g: 3 },
  { k: 'votoPor',     t: 'VO.BO. POR',               w: 170, g: 4 },
  { k: 'votoFecha',   t: 'FECHA VO.BO.',             w: 125, g: 4 },
  { k: 'nota',        t: 'NOTA / OBSERVACIÓN',       w: 220, g: 4 },
  { k: 'mensaje',     t: 'MENSAJE',                  w: 320, g: 4 },
  { k: 'asunto',      t: 'ASUNTO',                   w: 260, g: 5 },
  { k: 'remitente',   t: 'REMITENTE',                w: 200, g: 5 },
  { k: 'idMensaje',   t: 'ID MENSAJE',               w: 130, g: 5 },
  { k: 'idFila',      t: 'ID FILA',                  w: 150, g: 5 },
  { k: 'imagen',      t: 'IMAGEN Nº',                w: 70,  g: 5 },
  { k: 'motor',       t: 'MOTOR',                    w: 130, g: 5 },
  { k: 'huella',      t: 'HUELLA DE IMAGEN',         w: 130, g: 5 },
  { k: 'idHilo',      t: 'ID HILO',                  w: 130, g: 5 },
  { k: 'lectura',     t: 'LECTURA ORIGINAL',         w: 260, g: 5 }
];
const TRAS_GRUPOS = { 1: 'ESTADO Y VISTO BUENO', 2: 'OPERACIÓN', 3: 'VALIDACIÓN', 4: 'SEGUIMIENTO', 5: 'ORIGEN (no editar)' };
const TRAS_FILA_ENC = 2, TRAS_FILA_DATOS = 3;

/* ======================================================================
   UTILIDADES
   ====================================================================== */
function trasSS_() {
  let ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  const props = PropertiesService.getScriptProperties();
  if (ss) {
    try { if (props.getProperty('TRAS_SS_ID') !== ss.getId()) props.setProperty('TRAS_SS_ID', ss.getId()); } catch (e) {}
    return ss;
  }
  const id = props.getProperty('TRAS_SS_ID');
  if (!id) throw new Error('No encuentro el libro. Abre el libro y usa el menú Traspasos una vez.');
  return SpreadsheetApp.openById(id);
}

function trasNorm_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
}
function trasDigitos_(s) { return String(s == null ? '' : s).replace(/\D/g, ''); }
/** Cuenta tal como se leyó: solo dígitos y "?" (dígito dudoso). */
function trasCuenta_(s) { return String(s == null ? '' : s).replace(/[^0-9?]/g, ''); }
function trasPad2_(n) { return (n < 10 ? '0' : '') + n; }

/** 'yyyy-MM-dd' del día (en hora de México) de un instante. */
function trasDiaMx_(d) {
  if (!d) return '';
  if (typeof d === 'string') return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '';
  if (Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TRAS.TZ, 'yyyy-MM-dd');
}
function trasDiaMx_hoy_() { return trasDiaMx_(new Date()); }

/** 'yyyy-MM-dd' válido a partir de partes, o ''. */
function trasISO_(y, m, d) {
  y = +y; m = +m; d = +d;
  if (y < 100) y += 2000;
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return '';
  return y + '-' + trasPad2_(m) + '-' + trasPad2_(d);
}
/** Fecha de texto "dd/mm/yyyy" (también - o .) → 'yyyy-MM-dd' o ''. */
function trasFechaTexto_(s) {
  const m = String(s == null ? '' : s).match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
  return m ? trasISO_(m[3], m[2], m[1]) : '';
}
/** yyyymmdd del asunto → 'yyyy-MM-dd' o ''. */
function trasFechaAsunto_(asunto) {
  const re = /(?:^|\D)(20\d{2})(\d{2})(\d{2})(?!\d)/g; let m;
  while ((m = re.exec(String(asunto || '')))) { const iso = trasISO_(m[1], m[2], m[3]); if (iso) return iso; }
  return '';
}
function trasISOaDDMMYYYY_(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''; }
function trasISOaDDMM_(iso) { return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''; }
/** 'yyyy-MM-dd' → Date al mediodía de México (evita saltos de día por zona horaria). */
function trasISOaFecha_(iso) {
  if (!iso) return '';
  return Utilities.parseDate(iso + ' 12:00', TRAS.TZ, 'yyyy-MM-dd HH:mm');
}
function trasDiasEntre_(isoA, isoB) {
  const a = Date.UTC(+isoA.slice(0, 4), +isoA.slice(5, 7) - 1, +isoA.slice(8, 10));
  const b = Date.UTC(+isoB.slice(0, 4), +isoB.slice(5, 7) - 1, +isoB.slice(8, 10));
  return Math.round((a - b) / 86400000);
}

/** Texto de monto ("$5,000,000.00", "5 000 000", 5e6) → número o null. */
function trasMonto_(v) {
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v == null ? '' : v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  if (/,\d{2}$/.test(s) && /\.\d{3}/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   // 5.000.000,00
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function trasFmtMonto_(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  const neg = n < 0; const partes = Math.abs(n).toFixed(2).split('.');
  return (neg ? '-' : '') + '$' + partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + partes[1];
}
function trasLetra_(n) {
  if (typeof n !== 'number' || !isFinite(n) || n <= 0) return '';
  try { return String(NUM_TEXTO(n)); } catch (e) { return ''; }
}

/** Dígito verificador de CLABE (18 dígitos). */
function trasClabeValida_(c) {
  c = trasDigitos_(c);
  if (c.length !== 18) return false;
  const pesos = [3, 7, 1]; let suma = 0;
  for (let i = 0; i < 17; i++) suma += (parseInt(c[i], 10) * pesos[i % 3]) % 10;
  return ((10 - (suma % 10)) % 10) === parseInt(c[17], 10);
}

/** Describe en palabras en qué se parece/diferencia lo leído contra lo esperado. */
function trasDiferencia_(leido, esperado) {
  leido = trasCuenta_(leido); esperado = trasDigitos_(esperado);
  if (!leido) return 'no se leyó';
  if (leido === esperado) return '';
  if (leido.length !== esperado.length) {
    const dif = leido.length - esperado.length;
    let pista = '';
    if (dif > 0 && leido.slice(dif) === esperado) pista = ' (sobran al inicio: ' + leido.slice(0, dif) + ')';
    else if (dif > 0 && leido.slice(0, esperado.length) === esperado) pista = ' (sobran al final)';
    else if (dif < 0 && esperado.slice(-leido.length) === leido) pista = ' (faltan al inicio: ' + esperado.slice(0, -dif) + ')';
    return (dif > 0 ? 'sobran ' + dif : 'faltan ' + (-dif)) + ' dígito(s)' + pista;
  }
  const pos = [];
  for (let i = 0; i < leido.length; i++) if (leido[i] !== esperado[i]) pos.push(i + 1);
  if (leido.indexOf('?') >= 0 && pos.length === (leido.match(/\?/g) || []).length) return 'hay dígito(s) dudoso(s) "?" en ' + (pos.length === 1 ? 'la posición ' : 'las posiciones ') + pos.join(', ');
  return 'distinto en ' + (pos.length === 1 ? 'la posición ' : 'las posiciones ') + pos.join(', ');
}

function trasHuella_(blob) {
  const bytes = blob.getBytes();
  const dig = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes);
  return dig.map(function (b) { const x = (b < 0 ? b + 256 : b).toString(16); return x.length < 2 ? '0' + x : x; }).join('');
}

function trasUsuario_() {
  let e = '';
  try { e = Session.getActiveUser().getEmail(); } catch (x) {}
  if (!e) { try { e = Session.getEffectiveUser().getEmail(); } catch (x) {} }
  return e || '';
}

/* ======================================================================
   CATÁLOGO (cuentas esperadas por destino)  ·  hoja CATALOGO TRASPASOS
   ====================================================================== */
const TRAS_CAT_COLS = ['DESTINO', 'CUENTA CARGO', 'CUENTA BENEFICIARIA', 'PALABRAS EN ASUNTO', 'ACTIVO', 'NOTA'];

function trasCrearCatalogo_(ss) {
  let h = ss.getSheetByName(TRAS.HOJA_CATALOGO);
  if (h) return h;
  h = ss.insertSheet(TRAS.HOJA_CATALOGO);
  if (h.getMaxColumns() < TRAS_CAT_COLS.length) h.insertColumnsAfter(h.getMaxColumns(), TRAS_CAT_COLS.length - h.getMaxColumns());
  h.getRange(1, 1, 1, TRAS_CAT_COLS.length).setValues([TRAS_CAT_COLS])
    .setFontWeight('bold').setBackground(TRAS.COLOR.ENCABEZADO).setFontColor(TRAS.COLOR.ENCABEZADO_TEXTO);
  h.getRange(2, 2, 200, 2).setNumberFormat('@');
  [110, 140, 190, 230, 60, 360].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.setFrozenRows(1);
  try { h.getRange(2, 5, 200, 1).insertCheckboxes(); } catch (e) {}
  return h;
}

/** Lee el catálogo vigente. Un destino puede tener varias filas (varias cuentas permitidas). */
function trasCargarCatalogo_(ss) {
  const h = ss.getSheetByName(TRAS.HOJA_CATALOGO);
  const cat = { destinos: {}, porBenef: {}, hayDatos: false, avisos: [] };
  if (!h || h.getLastRow() < 2) return cat;
  const vals = h.getRange(2, 1, h.getLastRow() - 1, 6).getValues();
  vals.forEach(function (r) {
    const destino = trasNorm_(r[0]);
    if (!destino) return;
    if (r[4] === false) return;                       // desmarcado = desactivado
    const d = cat.destinos[destino] || (cat.destinos[destino] = { nombre: destino, cargos: [], benefs: [], palabras: [destino] });
    const cargo = trasDigitos_(r[1]), benef = trasDigitos_(r[2]);
    if (cargo && d.cargos.indexOf(cargo) < 0) d.cargos.push(cargo);
    if (benef && d.benefs.indexOf(benef) < 0) { d.benefs.push(benef); cat.porBenef[benef] = destino; }
    String(r[3] || '').split(/[,;|]/).forEach(function (p) { p = trasNorm_(p); if (p && d.palabras.indexOf(p) < 0) d.palabras.push(p); });
    cat.hayDatos = true;
  });
  Object.keys(cat.destinos).forEach(function (n) {
    cat.destinos[n].benefs.forEach(function (b) {
      if (b.length === 18 && !trasClabeValida_(b)) cat.avisos.push('La cuenta beneficiaria de ' + n + ' (' + b + ') no pasa el dígito verificador de CLABE.');
    });
  });
  return cat;
}

/** Destino que menciona el asunto según las palabras del catálogo ('' si ninguno). */
function trasDestinoDeAsunto_(asunto, cat) {
  const s = trasNorm_(asunto); let mejor = '', largo = 0;
  Object.keys(cat.destinos).forEach(function (n) {
    cat.destinos[n].palabras.forEach(function (p) {
      if (p && s.indexOf(p) >= 0 && p.length > largo) { mejor = n; largo = p.length; }
    });
  });
  return mejor;
}

/**
 * Arma el catálogo a partir de lo que ya está en la hoja anterior "Traspasos":
 * toma, por destino, las cuentas que más se repiten (≥ 3 veces). Sirve para no
 * escribir números de cuenta en el código. Lo que ya existe en el catálogo no se pisa.
 */
function traspasosImportarCatalogo() {
  const ss = trasSS_();
  const ui = trasUi_();
  const hist = ss.getSheetByName(TRAS.HOJA_HISTORICO);
  if (!hist || hist.getLastRow() < 2) {
    if (ui) ui.alert('No encontré la hoja "' + TRAS.HOJA_HISTORICO + '" con historial. Llena la hoja ' + TRAS.HOJA_CATALOGO + ' a mano.');
    trasCrearCatalogo_(ss);
    return { filas: 0 };
  }
  const enc = hist.getRange(1, 1, 1, hist.getLastColumn()).getValues()[0].map(trasNorm_);
  const iB = enc.indexOf('BANCO'), iC = enc.indexOf('CUENTA CARGO'), iBe = enc.indexOf('CUENTA BENEFICIARIA');
  if (iB < 0 || iC < 0 || iBe < 0) { if (ui) ui.alert('La hoja anterior no tiene las columnas Banco / Cuenta Cargo / Cuenta Beneficiaria.'); return { filas: 0 }; }
  const vals = hist.getRange(2, 1, hist.getLastRow() - 1, hist.getLastColumn()).getValues();
  const cuenta = {};
  vals.forEach(function (r) {
    const dest = trasNorm_(r[iB]); const cargo = trasDigitos_(r[iC]); const benef = trasDigitos_(r[iBe]);
    if (!dest || !benef || benef.length !== 18 || !trasClabeValida_(benef)) return;
    if (cargo.length < 10 || cargo.length > 11) return;
    const k = dest + '|' + cargo + '|' + benef; cuenta[k] = (cuenta[k] || 0) + 1;
  });
  const filas = Object.keys(cuenta).filter(function (k) { return cuenta[k] >= 3; })
    .sort(function (a, b) { return cuenta[b] - cuenta[a]; })
    .map(function (k) { const p = k.split('|'); return { destino: p[0], cargo: p[1], benef: p[2], veces: cuenta[k] }; });

  const h = trasCrearCatalogo_(ss);
  const ya = h.getLastRow() >= 2 ? h.getRange(2, 1, h.getLastRow() - 1, 3).getValues().map(function (r) { return trasNorm_(r[0]) + '|' + trasDigitos_(r[1]) + '|' + trasDigitos_(r[2]); }) : [];
  const nuevas = filas.filter(function (f) { return ya.indexOf(f.destino + '|' + f.cargo + '|' + f.benef) < 0; });
  if (nuevas.length) {
    const ini = Math.max(h.getLastRow(), 1) + 1;
    h.getRange(ini, 2, nuevas.length, 2).setNumberFormat('@');
    h.getRange(ini, 1, nuevas.length, 6).setValues(nuevas.map(function (f) {
      return [f.destino, f.cargo, f.benef, f.destino, true, 'Importado del historial (' + f.veces + ' veces). Revísalo.'];
    }));
  }
  if (ui) ui.alert('Catálogo listo: ' + nuevas.length + ' fila(s) nuevas desde el historial.\nRevisa la hoja ' + TRAS.HOJA_CATALOGO + ' y corrige lo que haga falta: de ahí se validan las cuentas.');
  return { filas: nuevas.length };
}

function trasUi_() { try { return SpreadsheetApp.getUi(); } catch (e) { return null; } }

/* ======================================================================
   VALIDACIONES
   ====================================================================== */

/**
 * ctx: { diaCorreo:'yyyy-MM-dd', fechaAsunto, destinoAsunto, cat }
 * op:  { fechaApp:'yyyy-MM-dd'|'', cuentaCargo, cuentaBenef, monto:number|null, divisa, confianza, ilegible:[] , sinLectura:bool }
 * Devuelve { destino, valFecha, valCargo, valBenef, avisos:[] }
 * Los avisos que empiezan con ⚠ cuentan como "revisar"; los que empiezan con ℹ son solo informativos.
 */
function trasValidar_(op, ctx) {
  const avisos = []; const cat = ctx.cat || { destinos: {}, porBenef: {} };
  const benef = trasCuenta_(op.cuentaBenef), cargo = trasCuenta_(op.cuentaCargo);

  // ---- Destino ----
  const dAsunto = ctx.destinoAsunto || '';
  const dCuenta = benef ? (cat.porBenef[benef] || '') : '';
  let destino = dAsunto || dCuenta || '';
  if (dAsunto && dCuenta && dAsunto !== dCuenta) {
    avisos.push('⚠ El asunto dice ' + dAsunto + ' pero la cuenta beneficiaria es de ' + dCuenta + '.');
  }
  if (!destino) destino = 'SIN CLASIFICAR';
  else if (!dAsunto && dCuenta) avisos.push('ℹ El asunto no menciona el banco; se tomó por la cuenta beneficiaria (' + dCuenta + ').');
  const ref = cat.destinos[dAsunto || dCuenta] || null;

  // ---- Fecha ----
  let valFecha;
  const fa = ctx.fechaAsunto, dc = ctx.diaCorreo, fc = op.fechaApp;
  const problemas = [];
  if (!fa) problemas.push('el asunto no trae fecha (yyyymmdd)');
  else if (fa !== dc) {
    const dd = trasDiasEntre_(fa, dc);
    problemas.push('el asunto dice ' + trasISOaDDMM_(fa) + ' y el correo es del ' + trasISOaDDMM_(dc) + (dd < 0 ? ' (asunto en el pasado)' : ' (asunto en el futuro)'));
  }
  if (fc) {
    if (fa && fc !== fa) {
      let hint = '';
      const a = fa.replace(/-/g, ''), b = fc.replace(/-/g, '');
      let difs = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) difs++;
      if (difs === 1) hint = ' (diferencia de un solo dígito: puede ser lectura; revisa la captura)';
      problemas.push('la captura dice ' + trasISOaDDMM_(fc) + (fc.slice(0, 4) !== fa.slice(0, 4) ? '/' + fc.slice(0, 4) : '') + ' y el asunto ' + trasISOaDDMM_(fa) + hint);
    } else if (!fa && fc !== dc) {
      problemas.push('la captura dice ' + trasISOaDDMM_(fc) + ' y el correo es del ' + trasISOaDDMM_(dc));
    }
  }
  if (problemas.length) valFecha = 'Revisar: ' + problemas.join('; ');
  else if (!fc) valFecha = 'Correcto (la captura no muestra fecha)';
  else valFecha = 'Correcto';

  // ---- Cuenta cargo ----
  let valCargo;
  if (op.sinLectura || !cargo) valCargo = 'Sin dato: no se leyó la cuenta de cargo';
  else if (!ref || !ref.cargos.length) { valCargo = 'Sin catálogo: ' + (destino === 'SIN CLASIFICAR' ? 'destino no identificado' : 'falta ' + destino + ' en ' + TRAS.HOJA_CATALOGO); }
  else if (ref.cargos.indexOf(cargo) >= 0) valCargo = 'Correcto';
  else {
    const mejor = trasMasParecida_(cargo, ref.cargos);
    valCargo = 'Revisar: leyó ' + cargo + ', esperado ' + ref.cargos.join(' o ') + ' · ' + trasDiferencia_(cargo, mejor);
  }

  // ---- Cuenta beneficiaria ----
  let valBenef;
  if (op.sinLectura || !benef) valBenef = 'Sin dato: no se leyó la cuenta beneficiaria';
  else if (!ref || !ref.benefs.length) valBenef = 'Sin catálogo: ' + (destino === 'SIN CLASIFICAR' ? 'destino no identificado' : 'falta ' + destino + ' en ' + TRAS.HOJA_CATALOGO);
  else if (ref.benefs.indexOf(benef) >= 0) valBenef = 'Correcto';
  else {
    const mejor = trasMasParecida_(benef, ref.benefs);
    valBenef = 'Revisar: leyó ' + benef + ', esperado ' + ref.benefs.join(' o ') + ' · ' + trasDiferencia_(benef, mejor);
  }
  if (/^\d{18}$/.test(benef) && !trasClabeValida_(benef)) avisos.push('⚠ La cuenta beneficiaria leída no pasa el dígito verificador de CLABE (posible lectura incorrecta).');

  // ---- Monto y otros ----
  if (!op.sinLectura) {
    if (op.monto == null || !(op.monto > 0)) avisos.push('⚠ No se leyó el monto.');
    else if (op.monto < TRAS.MONTO_BAJO) avisos.push('⚠ Monto muy bajo (' + trasFmtMonto_(op.monto) + '): confirma en la captura.');
    if (op.divisa && !/^(MXN|MXP|PESOS|MN)/i.test(String(op.divisa).trim())) avisos.push('⚠ Divisa distinta de pesos: ' + op.divisa + '.');
    if (op.confianza === 'baja') avisos.push('⚠ La lectura salió con confianza baja: compárala con la captura.');
    if (op.ilegible && op.ilegible.length) avisos.push('⚠ Partes ilegibles en la captura: ' + op.ilegible.join(', ') + '.');
  }
  (op.notas || []).forEach(function (n) { avisos.push(n); });

  return { destino: destino, valFecha: valFecha, valCargo: valCargo, valBenef: valBenef, avisos: avisos };
}

function trasMasParecida_(x, lista) {
  let mejor = lista[0], puntaje = -1;
  lista.forEach(function (c) {
    let p = 0; const n = Math.min(c.length, x.length);
    for (let i = 0; i < n; i++) if (c[i] === x[i]) p++;
    if (p > puntaje) { puntaje = p; mejor = c; }
  });
  return mejor;
}

/** ¿La fila necesita atención? (misma regla que la fórmula REVISIÓN de la hoja) */
function trasNivel_(r) {
  const ok = [r.valFecha, r.valCargo, r.valBenef].every(function (v) { return /^Correcto/.test(String(v || '')); });
  const aviso = String(r.avisos || '').indexOf('⚠') >= 0;
  return (ok && !aviso) ? 'COINCIDE' : 'REVISAR';
}

/* ======================================================================
   CORREOS: asunto, imágenes, tipo
   ====================================================================== */
const TRAS_RE_PREFIJO = /^\s*((re|rv|fwd?|enc|reenv)\s*:\s*)+/i;

function trasLimpiarAsunto_(s) { return String(s || '').replace(TRAS_RE_PREFIJO, '').trim(); }
function trasEsRespuesta_(s) { return TRAS_RE_PREFIJO.test(String(s || '')); }

function trasEsAsuntoTraspaso_(asunto, cat) {
  const a = trasLimpiarAsunto_(asunto);
  if (!/traspaso|extraordinari/i.test(a)) return false;
  if (TRAS.EXCLUIR_ASUNTO.test(a)) return false;
  if (trasFechaAsunto_(a)) return true;
  if (cat && trasDestinoDeAsunto_(a, cat)) return true;
  return /extraordinari/i.test(a);
}

/** Texto nuevo de un correo (sin lo citado de mensajes anteriores). */
function trasTextoNuevo_(cuerpo) {
  const lineas = String(cuerpo || '').split(/\r?\n/); const out = [];
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (/^\s*>/.test(l)) break;
    if (/^\s*(On .{5,200}wrote:|El .{5,200}escribi[óo]:|-{2,}\s*(Original|Mensaje|Forwarded)|_{5,}|De:\s|From:\s|Enviado el:|Sent:)/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n');
}

function trasEsImagen_(a) {
  let ct = '', nom = '';
  try { ct = String(a.getContentType() || ''); } catch (e) {}
  try { nom = String(a.getName() || ''); } catch (e) {}
  return /^image\/(png|jpe?g|gif|webp)$/i.test(ct) || (/octet-stream/i.test(ct) && /\.(png|jpe?g|gif|webp)$/i.test(nom));
}

/** Imágenes candidatas de un mensaje, en orden estable (el índice se usa para volver a buscarlas). */
function trasImagenesDe_(msg) {
  let atts = [];
  try { atts = msg.getAttachments({ includeInlineImages: true, includeAttachments: true }) || []; } catch (e) { atts = msg.getAttachments() || []; }
  const out = [];
  atts.forEach(function (a) {
    if (!trasEsImagen_(a)) return;
    let n = 0; try { n = a.getSize ? a.getSize() : a.getBytes().length; } catch (e) { n = 0; }
    if (n && n < TRAS.MIN_BYTES_IMAGEN) return;
    out.push(a);
  });
  return out;
}

function trasContentType_(blob) {
  let ct = '', nom = '';
  try { ct = String(blob.getContentType() || ''); } catch (e) {}
  if (/^image\/(png|jpeg|gif|webp)$/i.test(ct)) return ct.toLowerCase();
  if (/jpg/i.test(ct)) return 'image/jpeg';
  try { nom = String(blob.getName() || '').toLowerCase(); } catch (e) {}
  if (/\.png$/.test(nom)) return 'image/png';
  if (/\.jpe?g$/.test(nom)) return 'image/jpeg';
  if (/\.gif$/.test(nom)) return 'image/gif';
  if (/\.webp$/.test(nom)) return 'image/webp';
  return 'image/png';
}

/* ======================================================================
   HOJA TRASPASOS V2
   ====================================================================== */
function trasMapa_(hoja) {
  const n = hoja.getLastColumn();
  const enc = hoja.getRange(TRAS_FILA_ENC, 1, 1, n).getValues()[0].map(function (x) { return trasNorm_(x); });
  const mapa = {};
  TRAS_COLS.forEach(function (c) { const i = enc.indexOf(trasNorm_(c.t)); if (i >= 0) mapa[c.k] = i + 1; });
  return mapa;
}
function trasLetraCol_(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

function trasUltimaFila_(hoja, mapa) {
  const col = mapa.idFila || mapa.idMensaje || 1;
  const ult = hoja.getLastRow();
  if (ult < TRAS_FILA_DATOS) return TRAS_FILA_DATOS - 1;
  const v = hoja.getRange(TRAS_FILA_DATOS, col, ult - TRAS_FILA_DATOS + 1, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '' && v[i][0] != null) return TRAS_FILA_DATOS + i;
  return TRAS_FILA_DATOS - 1;
}

function trasFormulaRevision_(fila, mapa) {
  const L = function (k) { return trasLetraCol_(mapa[k]); };
  return '=IF($' + L('idFila') + fila + '="","",IF(AND(COUNTIF($' + L('valFecha') + fila + ':$' + L('valBenef') + fila + ',"Correcto*")=3,ISERROR(SEARCH("⚠",$' + L('avisos') + fila + '))),"✔ COINCIDE","⚠ REVISAR"))';
}
function trasFormulaLetra_(fila, mapa) {
  const m = trasLetraCol_(mapa.monto);
  return '=IF(AND(ISNUMBER($' + m + fila + '),$' + m + fila + '>0),NUM_TEXTO($' + m + fila + '),"")';
}

function trasCrearHoja_(ss) {
  let h = ss.getSheetByName(TRAS.HOJA);
  if (h && h.getLastRow() >= TRAS_FILA_ENC) return h;
  if (!h) h = ss.insertSheet(TRAS.HOJA);
  const n = TRAS_COLS.length;
  if (h.getMaxColumns() < n) h.insertColumnsAfter(h.getMaxColumns(), n - h.getMaxColumns());
  if (h.getMaxRows() < 600) h.insertRowsAfter(h.getMaxRows(), 600 - h.getMaxRows());
  const C = TRAS.COLOR;

  // Banda de grupos (sin combinar celdas)
  const banda = TRAS_COLS.map(function (c, i) { return (i === 0 || TRAS_COLS[i - 1].g !== c.g) ? TRAS_GRUPOS[c.g] : ''; });
  h.getRange(1, 1, 1, n).setValues([banda]).setBackground(C.BANDA).setFontColor(C.BANDA_TEXTO).setFontWeight('bold').setFontSize(9);
  h.getRange(TRAS_FILA_ENC, 1, 1, n).setValues([TRAS_COLS.map(function (c) { return c.t; })])
    .setBackground(C.ENCABEZADO).setFontColor(C.ENCABEZADO_TEXTO).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  TRAS_COLS.forEach(function (c, i) { h.setColumnWidth(i + 1, c.w); });
  h.setFrozenRows(TRAS_FILA_ENC);
  h.setRowHeight(TRAS_FILA_ENC, 34);

  const mapa = trasMapa_(h);
  const filas = h.getMaxRows() - TRAS_FILA_DATOS + 1;
  h.getRange(TRAS_FILA_DATOS, mapa.cuentaCargo, filas, 2).setNumberFormat('@');            // cuentas como texto
  h.getRange(TRAS_FILA_DATOS, mapa.idMensaje, filas, 1).setNumberFormat('@');
  h.getRange(TRAS_FILA_DATOS, mapa.monto, filas, 1).setNumberFormat('$#,##0.00');
  h.getRange(TRAS_FILA_DATOS, mapa.fechaCorreo, filas, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  [mapa.fechaAsunto, mapa.fechaApp, mapa.votoFecha].forEach(function (c) {
    h.getRange(TRAS_FILA_DATOS, c, filas, 1).setNumberFormat(c === mapa.votoFecha ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
  });
  try { h.getRange(TRAS_FILA_DATOS, mapa.vobo, filas, 1).insertCheckboxes(); } catch (e) {}
  try {
    const regla = SpreadsheetApp.newDataValidation().requireValueInList(TRAS_ESTADOS, true).setAllowInvalid(false).build();
    h.getRange(TRAS_FILA_DATOS, mapa.estado, filas, 1).setDataValidation(regla);
  } catch (e) {}
  // Texto largo ajustado en avisos / validaciones / mensaje
  [mapa.valFecha, mapa.valCargo, mapa.valBenef, mapa.avisos, mapa.nota, mapa.mensaje, mapa.letra].forEach(function (c) {
    h.getRange(TRAS_FILA_DATOS, c, filas, 1).setWrap(true);
  });
  h.getRange(TRAS_FILA_DATOS, 1, filas, n).setVerticalAlignment('top');
  trasReglas_(h, mapa);
  return h;
}

function trasReglas_(hoja, mapa) {
  const C = TRAS.COLOR; const n = TRAS_COLS.length;
  const L = function (k) { return trasLetraCol_(mapa[k]); };
  const R = TRAS_FILA_DATOS;
  const rangoTodo = hoja.getRange(R, 1, Math.max(hoja.getMaxRows() - R + 1, 1), n);
  const rangoVal = hoja.getRange(R, mapa.valFecha, Math.max(hoja.getMaxRows() - R + 1, 1), 3);
  const rangoRev = hoja.getRange(R, mapa.revision, Math.max(hoja.getMaxRows() - R + 1, 1), 1);
  const rangoEst = hoja.getRange(R, mapa.estado, Math.max(hoja.getMaxRows() - R + 1, 1), 1);
  const reglas = [];
  const f = function (formula, rango, fondo, texto, extra) {
    let b = SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied(formula).setRanges([rango]);
    if (fondo) b = b.setBackground(fondo);
    if (texto) b = b.setFontColor(texto);
    if (extra === 'tachado') b = b.setStrikethrough(true);
    reglas.push(b.build());
  };
  // Descartado: gris y tachado
  f('=$' + L('estado') + R + '="DESCARTADO"', rangoTodo, null, C.GRIS_TEXTO, 'tachado');
  // Vo.Bo. dado: verde suave en estado / vobo / revisión
  f('=$' + L('estado') + R + '="VO.BO. DADO"', hoja.getRange(R, 1, Math.max(hoja.getMaxRows() - R + 1, 1), 3), C.OK_FONDO, C.OK_TEXTO);
  f('=$' + L('estado') + R + '="OBSERVADO"', hoja.getRange(R, 1, Math.max(hoja.getMaxRows() - R + 1, 1), 3), C.PEND_FONDO, C.PEND_TEXTO);
  // Validaciones
  f('=LEFT(' + L('valFecha') + R + ',8)="Correcto"', rangoVal, C.OK_FONDO, C.OK_TEXTO);
  f('=AND(' + L('valFecha') + R + '<>"",LEFT(' + L('valFecha') + R + ',8)<>"Correcto")', rangoVal, C.MAL_FONDO, C.MAL_TEXTO);
  f('=LEFT($' + L('revision') + R + ',1)="⚠"', rangoRev, C.MAL_FONDO, C.MAL_TEXTO);
  f('=LEFT($' + L('revision') + R + ',1)="✔"', rangoRev, C.OK_FONDO, C.OK_TEXTO);
  f('=AND($' + L('estado') + R + '="PENDIENTE",$' + L('idFila') + R + '<>"")', rangoEst, C.PEND_FONDO, C.PEND_TEXTO);
  // Tono alterno por día del correo (para ver dónde empieza y termina cada día)
  f('=AND($' + L('fechaCorreo') + R + '<>"",ISEVEN(INT($' + L('fechaCorreo') + R + ')))', rangoTodo, C.BLOQUE_B, null);
  hoja.setConditionalFormatRules(reglas);
}

/** Valores de una fila lista para escribir (un arreglo en el orden de columnas del mapa). */
function trasFilaArreglo_(reg, mapa, ancho) {
  const fila = new Array(ancho).fill('');
  Object.keys(reg).forEach(function (k) { if (mapa[k]) fila[mapa[k] - 1] = reg[k]; });
  return fila;
}

function trasEscribirFilas_(hoja, mapa, registros) {
  if (!registros.length) return;
  const ult = trasUltimaFila_(hoja, mapa);
  const ini = ult + 1;
  const fin = ini + registros.length - 1;
  if (fin > hoja.getMaxRows()) hoja.insertRowsAfter(hoja.getMaxRows(), fin - hoja.getMaxRows() + 300);
  const ancho = Math.max(hoja.getLastColumn(), TRAS_COLS.length);
  const bloque = registros.map(function (r, i) {
    const fila = trasFilaArreglo_(r, mapa, ancho);
    const nFila = ini + i;
    fila[mapa.revision - 1] = trasFormulaRevision_(nFila, mapa);
    fila[mapa.letra - 1] = trasFormulaLetra_(nFila, mapa);
    return fila;
  });
  hoja.getRange(ini, mapa.cuentaCargo, registros.length, 2).setNumberFormat('@');
  hoja.getRange(ini, mapa.idMensaje, registros.length, 1).setNumberFormat('@');
  // Fórmulas y valores van distintos: escribir valores y luego las fórmulas
  hoja.getRange(ini, 1, registros.length, ancho).setValues(bloque.map(function (f, i) {
    const c = f.slice(); c[mapa.revision - 1] = ''; c[mapa.letra - 1] = ''; return c;
  }));
  hoja.getRange(ini, mapa.revision, registros.length, 1).setFormulas(bloque.map(function (f) { return [f[mapa.revision - 1]]; }));
  hoja.getRange(ini, mapa.letra, registros.length, 1).setFormulas(bloque.map(function (f) { return [f[mapa.letra - 1]]; }));
  // Casillas y listas en las filas nuevas (por si la hoja se amplió)
  try { hoja.getRange(ini, mapa.vobo, registros.length, 1).insertCheckboxes(); } catch (e) {}
  return { ini: ini, fin: fin };
}

/* ======================================================================
   LOG
   ====================================================================== */
function trasLog_(ss, nivel, mensaje, detalle) {
  try {
    let h = ss.getSheetByName(TRAS.HOJA_LOG);
    if (!h) {
      h = ss.insertSheet(TRAS.HOJA_LOG);
      if (h.getMaxColumns() < 4) h.insertColumnsAfter(h.getMaxColumns(), 4 - h.getMaxColumns());
      h.getRange(1, 1, 1, 4).setValues([['FECHA', 'NIVEL', 'MENSAJE', 'DETALLE']]).setFontWeight('bold').setBackground(TRAS.COLOR.ENCABEZADO);
      h.setFrozenRows(1);
      [140, 70, 380, 520].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
    }
    const ult = h.getLastRow() + 1;
    if (ult > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), 200);
    h.getRange(ult, 1, 1, 4).setValues([[Utilities.formatDate(new Date(), TRAS.TZ, 'dd/MM/yyyy HH:mm:ss'), nivel, String(mensaje || ''), String(detalle || '').slice(0, 1500)]]);
    if (ult > TRAS.LOG_MAX_FILAS) h.deleteRows(2, 500);
  } catch (e) { try { Logger.log('log: ' + e); } catch (x) {} }
}

/* ======================================================================
   INGESTA
   ====================================================================== */

/** Índice de lo que ya está en la hoja (mensajes, huellas, hilos con principal, conteos del día). */
function trasIndice_(hoja, mapa, excluirMsg) {
  const idx = { msgs: {}, huellas: {}, hilosPrincipal: {}, filas: 0, porDia: {} };
  const ult = trasUltimaFila_(hoja, mapa);
  if (ult < TRAS_FILA_DATOS) return idx;
  const n = ult - TRAS_FILA_DATOS + 1;
  const col = function (k) { return mapa[k] ? hoja.getRange(TRAS_FILA_DATOS, mapa[k], n, 1).getValues().map(function (r) { return r[0]; }) : new Array(n).fill(''); };
  const msg = col('idMensaje'), hue = col('huella'), hilo = col('idHilo'), tipo = col('tipo'), fAs = col('fechaAsunto'),
    dest = col('destino'), est = col('estado'), idf = col('idFila');
  for (let i = 0; i < n; i++) {
    if (!idf[i] && !msg[i]) continue;
    if (excluirMsg && String(msg[i]) === String(excluirMsg)) continue;
    idx.filas++;
    const m = String(msg[i]);
    if (m) idx.msgs[m] = (idx.msgs[m] || 0) + 1;
    if (hue[i]) (idx.huellas[hue[i]] = idx.huellas[hue[i]] || []).push({ msg: m, hilo: String(hilo[i]), fila: TRAS_FILA_DATOS + i });
    if (hilo[i]) idx.hilosPrincipal[String(hilo[i])] = true;      // el hilo ya tiene su primer correo registrado (aunque se haya descartado)
    const dia = trasDiaMx_(fAs[i]);
    if (dia && est[i] !== 'DESCARTADO') {
      const k = dia + '|' + dest[i];
      (idx.porDia[k] = idx.porDia[k] || []).push({ hilo: String(hilo[i]), fila: TRAS_FILA_DATOS + i });
    }
  }
  return idx;
}

function traspasosActualizar(opciones) {
  const o = opciones || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(o.esperaMs || 25000)) return { ok: false, mensaje: 'Ya hay una actualización en curso. Intenta de nuevo en un minuto.' };
  const t0 = Date.now();
  const ss = trasSS_();
  try {
    return trasIngesta_(ss, o, t0);
  } catch (e) {
    trasLog_(ss, 'ERROR', 'La actualización falló', e && e.stack ? e.stack : e);
    return { ok: false, mensaje: 'Error: ' + (e && e.message ? e.message : e) };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function trasIngesta_(ss, o, t0) {
  const hoja = trasCrearHoja_(ss);
  trasCrearCatalogo_(ss);
  const mapa = trasMapa_(hoja);
  const cat = trasCargarCatalogo_(ss);
  const resumen = { ok: true, nuevas: 0, mensajes: 0, sinLectura: 0, omitidos: 0, errores: 0, pendientesProximaCorrida: 0, mensaje: '' };
  if (!cat.hayDatos) resumen.aviso = 'El catálogo está vacío: se leerán las capturas pero no se podrán validar cuentas. Corre "Importar catálogo".';

  const desde = Math.floor((Date.now() - (o.horasAtras || TRAS.HORAS_ATRAS) * 3600 * 1000) / 1000);
  const consulta = 'subject:(' + TRAS.ASUNTO_PALABRAS + ') has:attachment after:' + desde;
  const hilos = GmailApp.search(consulta, 0, TRAS.MAX_HILOS) || [];
  const idx = trasIndice_(hoja, mapa);
  const yo = trasUsuario_().toLowerCase();
  const ventanaMs = desde * 1000;

  // 1) reunir mensajes candidatos, con la información del hilo para decidir Principal/Extraordinario
  const candidatos = [];
  hilos.forEach(function (hilo) {
    let ms = [];
    try { ms = hilo.getMessages(); } catch (e) { return; }
    // Solo se revisan adjuntos de lo que falta por procesar (ahorra lecturas de Gmail en cada corrida)
    const nuevos = ms.filter(function (m) {
      if (m.getDate().getTime() < ventanaMs) return false;
      if (idx.msgs[m.getId()]) return false;
      let borrador = false; try { borrador = m.isDraft(); } catch (e) {}
      if (borrador) return false;
      if (!trasEsAsuntoTraspaso_(m.getSubject(), cat)) return false;
      if (yo && String(m.getFrom() || '').toLowerCase().indexOf(yo) >= 0) return false;      // tus propias respuestas
      return trasImagenesDe_(m).length > 0;
    });
    const primero = idx.hilosPrincipal[hilo.getId()] ? null
      : (nuevos.filter(function (m) { return !trasEsRespuesta_(m.getSubject()); })[0] || nuevos[0] || null);
    nuevos.forEach(function (m) {
      const esPrimero = !!primero && primero.getId() === m.getId();
      if (!esPrimero) {
        // Mensaje posterior del hilo: solo si dice "extraordinario" o pide el Vo.Bo. de otro traspaso
        const nuevoTxt = trasTextoNuevo_(m.getPlainBody());
        if (!TRAS.SEGUNDO_TRASPASO.test(m.getSubject() || '') && !TRAS.SEGUNDO_TRASPASO.test(nuevoTxt)) return;
      }
      candidatos.push({ msg: m, hiloId: hilo.getId(), esPrimero: esPrimero, posicion: nuevos.indexOf(m) });
    });
  });
  candidatos.sort(function (a, b) { return a.msg.getDate() - b.msg.getDate(); });

  // 2) procesar con tope de tiempo
  const nuevos = [];
  const principalEnCorrida = {};
  for (let i = 0; i < candidatos.length; i++) {
    if (i >= TRAS.MAX_MENSAJES_POR_CORRIDA || (Date.now() - t0) > TRAS.TIEMPO_MAX_MS) { resumen.pendientesProximaCorrida = candidatos.length - i; break; }
    const c = candidatos[i];
    try {
      const regs = trasProcesarMensaje_(ss, c, cat, idx, principalEnCorrida, o);
      if (regs === null) { resumen.errores++; continue; }       // reintentará en la próxima corrida
      resumen.mensajes++;
      regs.forEach(function (r) { nuevos.push(r); if (r.__sinLectura) resumen.sinLectura++; });
    } catch (e) {
      resumen.errores++;
      trasLog_(ss, 'ERROR', 'Mensaje ' + c.msg.getId(), e && e.stack ? e.stack : e);
    }
  }
  nuevos.forEach(function (r) { delete r.__sinLectura; });
  trasEscribirFilas_(hoja, mapa, nuevos);
  resumen.nuevas = nuevos.length;
  resumen.mensaje = nuevos.length
    ? ('Se agregaron ' + nuevos.length + ' operación(es) de ' + resumen.mensajes + ' correo(s).')
    : 'No hay correos nuevos de traspasos.';
  if (resumen.sinLectura) resumen.mensaje += ' ' + resumen.sinLectura + ' sin lectura: revísalas.';
  if (resumen.pendientesProximaCorrida) resumen.mensaje += ' Quedan ' + resumen.pendientesProximaCorrida + ' correo(s) para la próxima corrida.';
  if (resumen.errores) resumen.mensaje += ' ' + resumen.errores + ' con error (se reintentan).';
  trasLog_(ss, 'INFO', resumen.mensaje, JSON.stringify({ consulta: consulta, hilos: hilos.length, candidatos: candidatos.length }));
  return resumen;
}

/** Procesa un correo → arreglo de registros (uno por operación). null = fallo transitorio, se reintenta. */
function trasProcesarMensaje_(ss, c, cat, idx, principalEnCorrida, o) {
  const msg = c.msg; const msgId = msg.getId();
  if (idx.msgs[msgId]) return [];                       // ya registrado en esta misma corrida
  const asunto = msg.getSubject() || '';
  const imgs = trasImagenesDe_(msg);
  const diaCorreo = trasDiaMx_(msg.getDate());
  const fechaAsunto = trasFechaAsunto_(asunto);
  const destinoAsunto = trasDestinoDeAsunto_(asunto, cat);

  // Principal = primer correo del hilo. Cualquier otro mensaje que llegó hasta aquí ya cumplió la regla
  // (dice "extraordinario" o pide Vo.Bo. de otro traspaso) → Extraordinario.
  const nuevoTxt = trasTextoNuevo_(msg.getPlainBody());
  const dicExtra = /extraordinari/i.test(asunto) || /extraordinari/i.test(nuevoTxt);
  let tipo, avisoTipo = '';
  if (dicExtra) tipo = 'Extraordinario';
  else if (c.esPrimero) tipo = 'Principal';
  else { tipo = 'Extraordinario'; avisoTipo = 'ℹ Segundo traspaso del hilo (el correo pide Vo.Bo. sin decir "extraordinario").'; }
  const otrosMismoDia = (fechaAsunto && destinoAsunto) ? (idx.porDia[fechaAsunto + '|' + destinoAsunto] || []).filter(function (x) { return x.hilo !== c.hiloId; }) : [];
  if (otrosMismoDia.length) avisoTipo = (avisoTipo ? avisoTipo + ' ' : '') + 'ℹ Ya había otro traspaso a ' + destinoAsunto + ' con la misma fecha en otro correo.';

  const intentosClave = 'TRAS_INT_' + msgId;
  const props = PropertiesService.getScriptProperties();
  const intentos = parseInt(props.getProperty(intentosClave) || '0', 10);

  const registros = []; let operacionesDelCorreo = 0; let fallo = false; let ignoradas = 0; let primeraIgnorada = null;
  const huellasVistas = {};
  imgs.forEach(function (att, i) {
    const nImg = i + 1;
    const blob = att.copyBlob ? att.copyBlob() : att;
    const huella = trasHuella_(blob);
    if (huellasVistas[huella]) return;                    // misma imagen repetida dentro del correo
    huellasVistas[huella] = true;

    // Eco de la cita: misma imagen ya registrada en este mismo hilo y el correo trae otras imágenes nuevas
    const previas = idx.huellas[huella] || [];
    let avisoDup = '';
    if (previas.length) {
      const mismoHilo = previas.some(function (p) { return p.hilo === c.hiloId; });
      if (mismoHilo && imgs.length > 1) return;
      avisoDup = '⚠ Esta captura es idéntica a la de la fila ' + previas[0].fila + (mismoHilo ? ' (mismo hilo)' : ' (otro correo)') + ': confirma que no es un reenvío.';
    }

    const lect = trasLeerImagen_(blob, { asunto: asunto, o: o });
    if (!lect.ok && lect.transitorio && intentos + 1 < TRAS.MAX_INTENTOS_LECTURA) { fallo = true; return; }

    const ops = lect.ok ? lect.operaciones : [];
    if (lect.ok && lect.esComprobante === false && ops.length === 0) {              // logo, firma, etc.
      ignoradas++; if (!primeraIgnorada) primeraIgnorada = { nImg: nImg, huella: huella, motor: lect.motor };
      return;
    }
    const ctxVal = { diaCorreo: diaCorreo, fechaAsunto: fechaAsunto, destinoAsunto: destinoAsunto, cat: cat };

    if (!ops.length) {
      const v = trasValidar_({ sinLectura: true, fechaApp: '' }, ctxVal);
      const avisos = ['⚠ SIN LECTURA: ' + (lect.error || 'la captura no contiene operaciones legibles') + '. Revisa la captura a mano.'];
      if (avisoDup) avisos.push(avisoDup);
      if (avisoTipo) avisos.push(avisoTipo);
      v.avisos.forEach(function (a) { avisos.push(a); });
      registros.push(trasRegistro_({
        msg: msg, hiloId: c.hiloId, nImg: nImg, nOp: 1, tipo: tipo, huella: huella, diaCorreo: diaCorreo, fechaAsunto: fechaAsunto,
        op: { sinLectura: true }, v: v, avisos: avisos, motor: lect.motor || '—', lectura: lect.error || '', sinLectura: true
      }));
      operacionesDelCorreo++;
      return;
    }
    ops.forEach(function (op, j) {
      const v = trasValidar_(op, ctxVal);
      const avisos = [];
      if (avisoDup) avisos.push(avisoDup);
      if (avisoTipo) avisos.push(avisoTipo);
      v.avisos.forEach(function (a) { avisos.push(a); });
      registros.push(trasRegistro_({
        msg: msg, hiloId: c.hiloId, nImg: nImg, nOp: j + 1, tipo: tipo, huella: huella, diaCorreo: diaCorreo, fechaAsunto: fechaAsunto,
        op: op, v: v, avisos: avisos, motor: lect.motor, lectura: lect.crudo || ''
      }));
      operacionesDelCorreo++;
    });
  });

  if (fallo) {
    props.setProperty(intentosClave, String(intentos + 1));
    trasLog_(ss, 'AVISO', 'Lectura fallida (intento ' + (intentos + 1) + ') · ' + asunto, msgId);
    return null;
  }
  if (!operacionesDelCorreo) {
    // Ninguna imagen era comprobante: se deja una fila DESCARTADA como constancia (y para no volver a leerlo)
    if (!ignoradas) return [];
    trasLog_(ss, 'INFO', 'Correo sin comprobantes de traspaso (imágenes ignoradas) · ' + asunto, msgId);
    const vv = trasValidar_({ sinLectura: true, fechaApp: '' }, { diaCorreo: diaCorreo, fechaAsunto: fechaAsunto, destinoAsunto: destinoAsunto, cat: cat });
    const reg = trasRegistro_({
      msg: msg, hiloId: c.hiloId, nImg: primeraIgnorada.nImg, nOp: 1, tipo: tipo, huella: primeraIgnorada.huella, diaCorreo: diaCorreo, fechaAsunto: fechaAsunto,
      op: { sinLectura: true }, v: vv, avisos: ['ℹ El correo trae imágenes pero ninguna parece un comprobante de traspaso (se ignoraron). Si sí lo es, usa "Volver a leer".'],
      motor: primeraIgnorada.motor || '—', lectura: ''
    });
    reg.estado = 'DESCARTADO';
    delete reg.__sinLectura;
    return [reg];
  }
  try { props.deleteProperty(intentosClave); } catch (e) {}
  // Actualiza el índice para los siguientes correos de la misma corrida
  registros.forEach(function (r) {
    idx.msgs[msgId] = (idx.msgs[msgId] || 0) + 1;
    if (r.huella) (idx.huellas[r.huella] = idx.huellas[r.huella] || []).push({ msg: msgId, hilo: c.hiloId, fila: '(nueva)' });
    if (fechaAsunto && r.destino) (idx.porDia[fechaAsunto + '|' + r.destino] = idx.porDia[fechaAsunto + '|' + r.destino] || []).push({ hilo: c.hiloId, fila: '(nueva)' });
  });
  return registros;
}

function trasRegistro_(p) {
  const op = p.op || {};
  const monto = (op.monto == null || op.sinLectura) ? '' : op.monto;
  return {
    estado: 'PENDIENTE', vobo: false,
    fechaCorreo: p.msg.getDate(),
    fechaAsunto: p.fechaAsunto ? trasISOaFecha_(p.fechaAsunto) : '',
    fechaApp: op.fechaApp ? trasISOaFecha_(op.fechaApp) : '',
    destino: p.v.destino, tipo: p.tipo, monto: monto,
    cuentaCargo: op.cuentaCargo ? trasCuenta_(op.cuentaCargo) : '',
    cuentaBenef: op.cuentaBenef ? trasCuenta_(op.cuentaBenef) : '',
    valFecha: p.v.valFecha, valCargo: p.v.valCargo, valBenef: p.v.valBenef,
    avisos: p.avisos.join(' | '),
    votoPor: '', votoFecha: '', nota: '', mensaje: '',
    asunto: p.msg.getSubject() || '', remitente: p.msg.getFrom() || '',
    idMensaje: p.msg.getId(), idFila: p.msg.getId() + '#' + p.nImg + '#' + p.nOp, imagen: p.nImg,
    motor: p.motor, huella: p.huella, idHilo: p.hiloId, lectura: String(p.lectura || '').slice(0, 4000),
    __sinLectura: !!p.sinLectura
  };
}

/* ======================================================================
   DECISIONES (Vo.Bo. / Observar / Descartar / Reabrir)  ·  usadas por hoja y pantalla
   ====================================================================== */
function trasSaludo_() {
  const h = parseInt(Utilities.formatDate(new Date(), TRAS.TZ, 'H'), 10);
  return h >= 19 ? 'Buena noche' : (h >= 12 ? 'Buena tarde' : 'Buen día');
}

/** filas: [{destino, tipo, monto, diaCorreo}] → texto para pegar. */
function trasTextoVoBo_(filas) {
  if (!filas.length) return '';
  const fecha = trasISOaDDMMYYYY_(filas[0].diaCorreo || trasDiaMx_hoy_());
  const cab = trasSaludo_() + ' ' + TRAS.DESTINATARIA + ',\n\n';
  const monto = function (f) { return trasFmtMonto_(f.monto) + ' (' + trasLetra_(f.monto) + ')'; };
  const sujeto = function (f) { return 'traspaso' + (f.tipo === 'Extraordinario' ? ' extraordinario' : '') + ' para ' + f.destino; };
  if (filas.length === 1) {
    const f = filas[0];
    return cab + 'Doy el Vo.Bo. al ' + sujeto(f) + ' de hoy ' + fecha + ' por la cantidad de ' + monto(f) + '\n\nSaludos';
  }
  const lineas = filas.map(function (f) { return '• ' + sujeto(f).charAt(0).toUpperCase() + sujeto(f).slice(1) + ' por ' + monto(f); });
  return cab + 'Doy el Vo.Bo. a los siguientes traspasos de hoy ' + fecha + ':\n\n' + lineas.join('\n') + '\n\nSaludos';
}

function trasLeerFila_(hoja, mapa, fila) {
  const ancho = Math.max(hoja.getLastColumn(), TRAS_COLS.length);
  const v = hoja.getRange(fila, 1, 1, ancho).getValues()[0];
  const r = {};
  Object.keys(mapa).forEach(function (k) { r[k] = v[mapa[k] - 1]; });
  r.fila = fila;
  return r;
}

function trasBuscarFila_(hoja, mapa, idFila) {
  const ult = trasUltimaFila_(hoja, mapa);
  if (ult < TRAS_FILA_DATOS) return 0;
  const v = hoja.getRange(TRAS_FILA_DATOS, mapa.idFila, ult - TRAS_FILA_DATOS + 1, 1).getValues();
  for (let i = 0; i < v.length; i++) if (String(v[i][0]) === String(idFila)) return TRAS_FILA_DATOS + i;
  return 0;
}

/**
 * Aplica una decisión a una fila de la hoja. accion: 'vobo' | 'observar' | 'descartar' | 'reabrir'
 * No pide confirmación: eso lo hace la pantalla o la hoja. Devuelve la fila actualizada.
 */
function trasAplicarDecision_(hoja, mapa, fila, accion, nota, usuario) {
  const set = function (k, v) { if (mapa[k]) hoja.getRange(fila, mapa[k]).setValue(v); };
  const ahora = new Date();
  if (accion === 'vobo') {
    const r = trasLeerFila_(hoja, mapa, fila);
    set('estado', 'VO.BO. DADO'); set('vobo', true); set('votoPor', usuario || ''); set('votoFecha', ahora);
    set('mensaje', trasTextoVoBo_([{ destino: r.destino, tipo: r.tipo, monto: Number(r.monto), diaCorreo: trasDiaMx_(r.fechaCorreo) }]));
    if (nota != null && nota !== '') set('nota', nota);
  } else if (accion === 'observar') {
    set('estado', 'OBSERVADO'); set('vobo', false); set('votoPor', usuario || ''); set('votoFecha', ahora); set('mensaje', '');
    set('nota', nota || '');
  } else if (accion === 'descartar') {
    set('estado', 'DESCARTADO'); set('vobo', false); set('votoPor', usuario || ''); set('votoFecha', ahora); set('mensaje', '');
    if (nota != null && nota !== '') set('nota', nota);
  } else if (accion === 'reabrir') {
    set('estado', 'PENDIENTE'); set('vobo', false); set('votoPor', ''); set('votoFecha', ''); set('mensaje', '');
  } else {
    throw new Error('Acción desconocida: ' + accion);
  }
}

/**
 * Para el onEdit del libro: mantiene coherentes la casilla VO.BO. y la lista ESTADO cuando
 * se editan directamente en la hoja. Devuelve true si la edición era de esta hoja.
 */
function traspasosOnEdit_(e) {
  try {
    if (!e || !e.range) return false;
    const hoja = e.range.getSheet();
    if (hoja.getName() !== TRAS.HOJA) return false;
    const fila = e.range.getRow();
    if (fila < TRAS_FILA_DATOS || e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return true;
    const mapa = trasMapa_(hoja);
    if (!mapa.idFila || !hoja.getRange(fila, mapa.idFila).getValue()) return true;
    const col = e.range.getColumn();
    const usuario = trasUsuario_();
    if (col === mapa.vobo) {
      const marcado = e.range.getValue() === true;
      trasAplicarDecision_(hoja, mapa, fila, marcado ? 'vobo' : 'reabrir', null, usuario);
    } else if (col === mapa.estado) {
      const est = String(e.range.getValue());
      const accion = est === 'VO.BO. DADO' ? 'vobo' : (est === 'OBSERVADO' ? 'observar' : (est === 'DESCARTADO' ? 'descartar' : 'reabrir'));
      const nota = accion === 'observar' ? hoja.getRange(fila, mapa.nota).getValue() : null;
      trasAplicarDecision_(hoja, mapa, fila, accion, nota, usuario);
    }
    return true;
  } catch (err) {
    try { Logger.log('traspasosOnEdit_: ' + err); } catch (x) {}
    return true;
  }
}

/* ======================================================================
   DISPARADOR AUTOMÁTICO  +  CLAVE  +  COMPATIBILIDAD
   ====================================================================== */
function traspasosActualizarAuto() {
  const ahora = new Date();
  const h = parseInt(Utilities.formatDate(ahora, TRAS.TZ, 'H'), 10);
  const dia = parseInt(Utilities.formatDate(ahora, TRAS.TZ, 'u'), 10) % 7;     // u: 1=lunes … 7=domingo
  if (h < TRAS.HORA_INICIO || h >= TRAS.HORA_FIN) return;
  if (TRAS.DIAS.indexOf(dia) < 0) return;
  traspasosActualizar({ esperaMs: 3000, auto: true });
}

function traspasosInstalarDisparador() {
  traspasosQuitarDisparador(true);
  ScriptApp.newTrigger('traspasosActualizarAuto').timeBased().everyMinutes(10).create();
  trasSS_();       // guarda el id del libro para que funcione fuera del libro
  const ui = trasUi_();
  if (ui) ui.alert('Listo: los correos de traspasos se revisarán solos cada 10 minutos (de ' + TRAS.HORA_INICIO + ' a ' + TRAS.HORA_FIN + ' h, lunes a sábado).');
}
function traspasosQuitarDisparador(silencioso) {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'traspasosActualizarAuto') { ScriptApp.deleteTrigger(t); n++; }
  });
  const ui = trasUi_();
  if (ui && !silencioso) ui.alert(n ? 'Se quitó la actualización automática.' : 'No había actualización automática instalada.');
}

function traspasosGuardarClave() {
  const ui = trasUi_();
  if (!ui) throw new Error('Ejecuta esto desde el menú del libro.');
  const r = ui.prompt('Clave de Claude (API)', 'Pega tu clave. Se guarda solo en las propiedades privadas del script. Déjala vacía para quitarla.', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  const k = String(r.getResponseText() || '').trim();
  const props = PropertiesService.getScriptProperties();
  if (!k) { props.deleteProperty('ANTHROPIC_API_KEY'); ui.alert('Clave eliminada. Se usará el OCR de Drive.'); return; }
  props.setProperty('ANTHROPIC_API_KEY', k);
  ui.alert('Clave guardada. Las capturas nuevas se leerán con Claude.');
}

/** Vuelve a aplicar colores, listas y casillas (útil después de editar la hoja a mano). */
function traspasosActualizarFormato() {
  const ss = trasSS_(); const h = ss.getSheetByName(TRAS.HOJA);
  if (!h) { trasCrearHoja_(ss); return; }
  trasReglas_(h, trasMapa_(h));
}

/** Para el menú y para disparadores que ya apuntaban a la función anterior. */
function revisarTraspasos() {
  const r = traspasosActualizar({});
  const ui = trasUi_();
  if (ui) ui.alert(r.mensaje || 'Listo');
  else try { trasSS_().toast(r.mensaje || 'Listo', 'Traspasos', 8); } catch (e) {}
  return r;
}

/** Diagnóstico de un correo: muestra qué lee cada motor y cómo valida. */
function traspasosDiagnosticar(messageId) {
  const ss = trasSS_(); const cat = trasCargarCatalogo_(ss);
  const msg = GmailApp.getMessageById(messageId);
  if (!msg) { Logger.log('Mensaje no encontrado'); return; }
  const asunto = msg.getSubject();
  Logger.log('Asunto: ' + asunto + ' | destino por asunto: ' + trasDestinoDeAsunto_(asunto, cat) + ' | fecha asunto: ' + trasFechaAsunto_(asunto));
  trasImagenesDe_(msg).forEach(function (a, i) {
    const l = trasLeerImagen_(a.copyBlob ? a.copyBlob() : a, { asunto: asunto, o: {} });
    Logger.log('Imagen ' + (i + 1) + ' [' + l.motor + ']: ' + JSON.stringify(l.operaciones || l.error, null, 1));
    (l.operaciones || []).forEach(function (op) {
      Logger.log(JSON.stringify(trasValidar_(op, { diaCorreo: trasDiaMx_(msg.getDate()), fechaAsunto: trasFechaAsunto_(asunto), destinoAsunto: trasDestinoDeAsunto_(asunto, cat), cat: cat }), null, 1));
    });
  });
}
