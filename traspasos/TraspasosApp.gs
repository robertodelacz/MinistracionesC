/* ==========================================================================
   TRASPASOS V2  ·  Pantalla (compu y celular) + servidor
   --------------------------------------------------------------------------
   · Misma pantalla en tres lugares: ventana dentro del libro, panel lateral y
     aplicación web (para abrir desde el celular con un enlace).
   · Aplicación web: Implementar → Nueva implementación → Aplicación web
       Ejecutar como: Yo   ·   Quién tiene acceso: Solo yo
     (así solo entras tú con tu cuenta; las capturas se leen de TU Gmail en el
      momento, no se copian a ningún otro lado).
   · Todas las funciones públicas (sin guion bajo final) las llama la pantalla
     con google.script.run.
   ========================================================================== */

/* ---------- Menú (lo agrega On Open.gs) ---------- */
function traspasosMenu_() {
  return SpreadsheetApp.getUi().createMenu('🏦 Traspasos')
    .addItem('🖥️ Abrir pantalla de Vo.Bo.', 'traspasosAbrirPanel')
    .addItem('📱 Panel lateral (angosto)', 'traspasosAbrirLateral')
    .addItem('🔄 Actualizar ahora', 'revisarTraspasos')
    .addSeparator()
    .addItem('📋 Importar catálogo desde el historial', 'traspasosImportarCatalogo')
    .addItem('⏱️ Activar actualización automática', 'traspasosInstalarDisparador')
    .addItem('⏹️ Quitar actualización automática', 'traspasosQuitarDisparador')
    .addItem('🔑 Guardar clave de Claude', 'traspasosGuardarClave')
    .addItem('🎨 Reaplicar formato de la hoja', 'traspasosActualizarFormato');
}

function traspasosAbrirPanel() {
  trasSS_();
  const html = HtmlService.createHtmlOutput(trasHtml_()).setWidth(1000).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Traspasos · Visto bueno');
}
function traspasosAbrirLateral() {
  trasSS_();
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutput(trasHtml_()).setTitle('Traspasos'));
}

/** Aplicación web (celular). Si ya tienes otra doGet en el proyecto, une las dos con un parámetro ?p=. */
function doGet(e) {
  if (!trasAutorizado_()) {
    return HtmlService.createHtmlOutput('<meta name="viewport" content="width=device-width,initial-scale=1"><p style="font:16px system-ui;padding:24px">Esta página es privada.</p>').setTitle('Privado');
  }
  return HtmlService.createHtmlOutput(trasHtml_()).setTitle('Traspasos · Vo.Bo.')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function trasAutorizado_() {
  try {
    const activo = Session.getActiveUser().getEmail();
    if (!activo) return true;                       // la implementación ya limita el acceso a ti
    const duenio = Session.getEffectiveUser().getEmail();
    if (!duenio || activo.toLowerCase() === duenio.toLowerCase()) return true;
    return (TRAS.USUARIOS_PERMITIDOS || []).map(function (x) { return String(x).toLowerCase(); }).indexOf(activo.toLowerCase()) >= 0;
  } catch (e) { return false; }
}
function trasExigirAutorizado_() { if (!trasAutorizado_()) throw new Error('No tienes permiso para usar esta pantalla.'); }

/* ======================================================================
   API PARA LA PANTALLA
   ====================================================================== */
function trasFechaHoraTxt_(d) {
  if (!d || Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, TRAS.TZ, 'dd/MM/yyyy HH:mm');
}
function trasFechaTxt_(d) {
  const iso = trasDiaMx_(d); return iso ? trasISOaDDMMYYYY_(iso) : '';
}

function trasOpParaPantalla_(r) {
  const monto = (typeof r.monto === 'number') ? r.monto : (r.monto === '' || r.monto == null ? null : Number(r.monto));
  const avisos = String(r.avisos || '').split(' | ').map(function (x) { return x.trim(); }).filter(Boolean);
  return {
    idFila: String(r.idFila), idMensaje: String(r.idMensaje), imagen: Number(r.imagen) || 1,
    estado: String(r.estado || 'PENDIENTE'), destino: String(r.destino || ''), tipo: String(r.tipo || ''),
    monto: monto, montoTxt: monto != null ? trasFmtMonto_(monto) : '', letra: monto != null ? trasLetra_(monto) : '',
    cuentaCargo: String(r.cuentaCargo || ''), cuentaBenef: String(r.cuentaBenef || ''),
    fechaAsunto: trasFechaTxt_(r.fechaAsunto), fechaApp: trasFechaTxt_(r.fechaApp), fechaCorreo: trasFechaHoraTxt_(r.fechaCorreo),
    valFecha: String(r.valFecha || ''), valCargo: String(r.valCargo || ''), valBenef: String(r.valBenef || ''),
    avisos: avisos, nivel: trasNivel_(r),
    sinLectura: avisos.some(function (a) { return a.indexOf('SIN LECTURA') >= 0; }),
    votoPor: String(r.votoPor || ''), votoFecha: trasFechaHoraTxt_(r.votoFecha), nota: String(r.nota || ''),
    mensaje: String(r.mensaje || ''), motor: String(r.motor || '')
  };
}

function trasLeerTodas_(hoja, mapa) {
  const ult = trasUltimaFila_(hoja, mapa);
  if (ult < TRAS_FILA_DATOS) return [];
  const ancho = Math.max(hoja.getLastColumn(), TRAS_COLS.length);
  const vals = hoja.getRange(TRAS_FILA_DATOS, 1, ult - TRAS_FILA_DATOS + 1, ancho).getValues();
  const out = [];
  vals.forEach(function (v, i) {
    if (!v[mapa.idFila - 1]) return;
    const r = {}; Object.keys(mapa).forEach(function (k) { r[k] = v[mapa[k] - 1]; });
    r.fila = TRAS_FILA_DATOS + i; out.push(r);
  });
  return out;
}

function traspasosListar(vista, fechaISO) {
  trasExigirAutorizado_();
  const ss = trasSS_();
  const hoja = trasCrearHoja_(ss);
  const mapa = trasMapa_(hoja);
  const hoy = trasDiaMx_hoy_();
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || '')) ? fechaISO : hoy;
  const todas = trasLeerTodas_(hoja, mapa);
  let sel;
  if (vista === 'pendientes') {
    sel = todas.filter(function (r) { return (r.estado === 'PENDIENTE' || r.estado === 'OBSERVADO') && trasDiasEntre_(hoy, trasDiaMx_(r.fechaCorreo) || hoy) <= 45; });
  } else {
    sel = todas.filter(function (r) { return trasDiaMx_(r.fechaCorreo) === fecha; });
  }
  const pendientesTotal = todas.filter(function (r) { return r.estado === 'PENDIENTE' || r.estado === 'OBSERVADO'; }).length;
  const resumen = { total: sel.length, pendientes: 0, vobo: 0, observados: 0, descartados: 0, revisar: 0, pendientesTotal: pendientesTotal };
  const grupos = {}; const orden = [];
  sel.forEach(function (r) {
    const op = trasOpParaPantalla_(r);
    if (op.estado === 'PENDIENTE') resumen.pendientes++;
    else if (op.estado === 'VO.BO. DADO') resumen.vobo++;
    else if (op.estado === 'OBSERVADO') resumen.observados++;
    else if (op.estado === 'DESCARTADO') resumen.descartados++;
    if (op.nivel === 'REVISAR' && op.estado !== 'DESCARTADO' && op.estado !== 'VO.BO. DADO') resumen.revisar++;
    const id = String(r.idMensaje);
    if (!grupos[id]) {
      grupos[id] = { idMensaje: id, asunto: String(r.asunto || ''), remitente: String(r.remitente || '').replace(/<.*$/, '').replace(/"/g, '').trim() || String(r.remitente || ''),
        fechaHora: trasFechaHoraTxt_(r.fechaCorreo), orden: r.fechaCorreo && r.fechaCorreo.getTime ? r.fechaCorreo.getTime() : 0, ops: [] };
      orden.push(id);
    }
    grupos[id].ops.push(op);
  });
  const correos = orden.map(function (id) { return grupos[id]; });
  correos.sort(function (a, b) { return vista === 'pendientes' ? a.orden - b.orden : b.orden - a.orden; });
  correos.forEach(function (c) { c.ops.sort(function (a, b) { return (a.idFila < b.idFila) ? -1 : 1; }); });
  let urlWeb = ''; try { urlWeb = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  return {
    ok: true, vista: vista === 'pendientes' ? 'pendientes' : 'dia', fecha: fecha, hoy: hoy, resumen: resumen, correos: correos,
    config: { destinataria: TRAS.DESTINATARIA, motor: trasClaveClaude_() && TRAS.MOTOR !== 'DRIVE' ? 'Claude' : 'OCR de Drive', urlWeb: urlWeb, usuario: trasUsuario_(), catalogoVacio: !trasCargarCatalogo_(ss).hayDatos }
  };
}

function traspasosImagen(idFila) {
  trasExigirAutorizado_();
  const ss = trasSS_(); const hoja = trasCrearHoja_(ss); const mapa = trasMapa_(hoja);
  const fila = trasBuscarFila_(hoja, mapa, idFila);
  if (!fila) return { ok: false, mensaje: 'No encontré esa fila.' };
  const r = trasLeerFila_(hoja, mapa, fila);
  const msg = GmailApp.getMessageById(String(r.idMensaje));
  if (!msg) return { ok: false, mensaje: 'El correo ya no está en Gmail.' };
  const imgs = trasImagenesDe_(msg);
  const att = imgs[(Number(r.imagen) || 1) - 1];
  if (!att) return { ok: false, mensaje: 'No encontré la imagen en el correo.' };
  const blob = att.copyBlob ? att.copyBlob() : att;
  const bytes = blob.getBytes();
  if (bytes.length > 7 * 1024 * 1024) return { ok: false, mensaje: 'La imagen es muy pesada para mostrarla aquí. Ábrela en Gmail.' };
  const ct = trasContentType_(blob);
  return { ok: true, dataUrl: 'data:' + ct + ';base64,' + Utilities.base64Encode(bytes), nombre: String(blob.getName() || '') };
}

function trasConLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, mensaje: 'El sistema está ocupado (se está actualizando). Intenta de nuevo en unos segundos.' };
  try { return fn(); } finally { try { lock.releaseLock(); } catch (e) {} }
}

/** accion: 'vobo' | 'observar' | 'descartar' | 'reabrir'. confirmar=true para dar Vo.Bo. a una fila con advertencias. */
function traspasosDecidir(idFila, accion, nota, confirmar) {
  trasExigirAutorizado_();
  return trasConLock_(function () {
    const ss = trasSS_(); const hoja = trasCrearHoja_(ss); const mapa = trasMapa_(hoja);
    const fila = trasBuscarFila_(hoja, mapa, idFila);
    if (!fila) return { ok: false, mensaje: 'No encontré esa fila (¿se borró de la hoja?).' };
    const antes = trasLeerFila_(hoja, mapa, fila);
    if (accion === 'vobo' && antes.estado === 'DESCARTADO') return { ok: false, mensaje: 'La fila está descartada. Reábrela primero.' };
    if (accion === 'vobo' && trasNivel_(antes) === 'REVISAR' && !confirmar) return { ok: false, requiereConfirmar: true, mensaje: 'Esta operación tiene advertencias. Confirma para darle el Vo.Bo.' };
    if (accion === 'vobo' && !(Number(antes.monto) > 0)) return { ok: false, mensaje: 'No hay monto leído. Corrige el monto en la hoja antes de dar el Vo.Bo.' };
    if (accion === 'observar' && !String(nota || '').trim()) return { ok: false, mensaje: 'Escribe qué se observa.' };
    trasAplicarDecision_(hoja, mapa, fila, accion, nota, trasUsuario_());
    const despues = trasLeerFila_(hoja, mapa, fila);
    trasLog_(ss, 'DECISION', accion + ' · ' + idFila, trasUsuario_() + (nota ? ' · ' + nota : ''));
    return { ok: true, op: trasOpParaPantalla_(despues) };
  });
}

/** Aplica la misma acción a todas las operaciones abiertas de un correo (Vo.Bo. a todos). */
function traspasosDecidirCorreo(idMensaje, accion, confirmar) {
  trasExigirAutorizado_();
  if (accion !== 'vobo') return { ok: false, mensaje: 'Solo se permite Vo.Bo. a todos.' };
  return trasConLock_(function () {
    const ss = trasSS_(); const hoja = trasCrearHoja_(ss); const mapa = trasMapa_(hoja);
    const filas = trasLeerTodas_(hoja, mapa).filter(function (r) { return String(r.idMensaje) === String(idMensaje) && (r.estado === 'PENDIENTE' || r.estado === 'OBSERVADO'); });
    if (!filas.length) return { ok: false, mensaje: 'No hay operaciones abiertas en este correo.' };
    const conAdv = filas.filter(function (r) { return trasNivel_(r) === 'REVISAR'; });
    if (conAdv.length && !confirmar) return { ok: false, requiereConfirmar: true, mensaje: conAdv.length + ' de ' + filas.length + ' operación(es) tienen advertencias. Confirma para darles Vo.Bo. a todas.' };
    if (filas.some(function (r) { return !(Number(r.monto) > 0); })) return { ok: false, mensaje: 'Hay operaciones sin monto leído: revísalas una por una.' };
    const usuario = trasUsuario_();
    filas.forEach(function (r) { trasAplicarDecision_(hoja, mapa, r.fila, 'vobo', null, usuario); });
    trasLog_(ss, 'DECISION', 'vobo a todos · ' + idMensaje, usuario + ' · ' + filas.length + ' fila(s)');
    const ops = filas.map(function (r) { return trasOpParaPantalla_(trasLeerFila_(hoja, mapa, r.fila)); });
    return { ok: true, ops: ops };
  });
}

/** Texto del mensaje de Vo.Bo. para una o varias filas (ya sea que estén dadas o no). */
function traspasosMensaje(idsFila) {
  trasExigirAutorizado_();
  const ss = trasSS_(); const hoja = trasCrearHoja_(ss); const mapa = trasMapa_(hoja);
  const filas = [];
  (idsFila || []).forEach(function (id) {
    const f = trasBuscarFila_(hoja, mapa, id); if (!f) return;
    const r = trasLeerFila_(hoja, mapa, f);
    filas.push({ destino: r.destino, tipo: r.tipo, monto: Number(r.monto), diaCorreo: trasDiaMx_(r.fechaCorreo) });
  });
  if (!filas.length) return { ok: false, mensaje: 'No encontré las operaciones.' };
  return { ok: true, texto: trasTextoVoBo_(filas) };
}

/** Deja un borrador de respuesta (a todos) en el hilo del correo. Nunca se envía solo. */
function traspasosBorrador(idMensaje, texto) {
  trasExigirAutorizado_();
  const t = String(texto || '').trim();
  if (!t) return { ok: false, mensaje: 'No hay texto para el borrador.' };
  const msg = GmailApp.getMessageById(String(idMensaje));
  if (!msg) return { ok: false, mensaje: 'El correo ya no está en Gmail.' };
  msg.createDraftReplyAll(t);
  return { ok: true, mensaje: 'Borrador creado en Gmail (en el mismo hilo). Revísalo y envíalo desde ahí.' };
}

/** Vuelve a leer las capturas de un correo (borra sus filas abiertas y las genera de nuevo). */
function traspasosReleer(idMensaje, motor) {
  trasExigirAutorizado_();
  return trasConLock_(function () {
    const ss = trasSS_(); const hoja = trasCrearHoja_(ss); const mapa = trasMapa_(hoja);
    const filas = trasLeerTodas_(hoja, mapa).filter(function (r) { return String(r.idMensaje) === String(idMensaje); });
    if (!filas.length) return { ok: false, mensaje: 'No encontré ese correo en la hoja.' };
    if (filas.some(function (r) { return r.estado === 'VO.BO. DADO'; })) return { ok: false, mensaje: 'Este correo ya tiene Vo.Bo. dado; reábrelo antes de volver a leerlo.' };
    const msg = GmailApp.getMessageById(String(idMensaje));
    if (!msg) return { ok: false, mensaje: 'El correo ya no está en Gmail.' };
    const cat = trasCargarCatalogo_(ss);
    const hilo = msg.getThread();
    const idx = trasIndice_(hoja, mapa, idMensaje);             // sin las filas de este correo
    const cand = trasCandidatoDe_(msg, hilo, cat);
    const regs = trasProcesarMensaje_(ss, cand, cat, idx, {}, { motor: motor || '' });
    if (regs === null) return { ok: false, mensaje: 'No se pudo leer ahora; las filas actuales se conservaron. Intenta de nuevo en un minuto.' };
    if (!regs.length) return { ok: false, mensaje: 'La relectura no encontró operaciones; las filas actuales se conservaron.' };
    regs.forEach(function (r) { delete r.__sinLectura; });
    // Lectura exitosa: ahora sí se reemplazan las filas viejas (de abajo hacia arriba)
    filas.map(function (r) { return r.fila; }).sort(function (a, b) { return b - a; }).forEach(function (f) { hoja.deleteRows(f, 1); });
    try { PropertiesService.getScriptProperties().deleteProperty('TRAS_INT_' + idMensaje); } catch (e) {}
    trasEscribirFilas_(hoja, mapa, regs);
    trasLog_(ss, 'INFO', 'Relectura · ' + idMensaje, regs.length + ' operación(es)');
    return { ok: true, mensaje: 'Se volvieron a leer ' + regs.length + ' operación(es).' };
  });
}

function trasCandidatoDe_(msg, hilo, cat) {
  const ms = hilo.getMessages();
  const yo = trasUsuario_().toLowerCase();
  const calificados = ms.filter(function (m) {
    if (!trasEsAsuntoTraspaso_(m.getSubject(), cat)) return false;
    if (yo && String(m.getFrom() || '').toLowerCase().indexOf(yo) >= 0) return false;
    return trasImagenesDe_(m).length > 0;
  });
  const primeroNoRe = calificados.filter(function (m) { return !trasEsRespuesta_(m.getSubject()); })[0] || calificados[0] || null;
  return { msg: msg, hiloId: hilo.getId(), esPrimero: !!primeroNoRe && primeroNoRe.getId() === msg.getId(), posicion: calificados.indexOf(msg) };
}

function traspasosActualizarAhora() {
  trasExigirAutorizado_();
  return traspasosActualizar({});
}

/* ======================================================================
   PANTALLA (HTML)
   ====================================================================== */
function trasHtml_() { return TRAS_HTML; }

const TRAS_HTML = String.raw`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Traspasos</title>
<style>
:root{--bg:#F5F3EC;--card:#FFFFFF;--ink:#1F2933;--mut:#6B7280;--line:#E6E2D5;--ok:#1E6B3A;--okbg:#D9EEDF;--warn:#7A5600;--warnbg:#FFF1C2;--bad:#9B1C1C;--badbg:#F8D7D7;--acc:#2F3B4C;--accink:#fff;--chip:#ECE8DA}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#15181D;--card:#1E232A;--ink:#E7EAEE;--mut:#9AA3AE;--line:#2D343D;--ok:#7FD39B;--okbg:#17352338;--warn:#F2C766;--warnbg:#3A2F0F;--bad:#F19999;--badbg:#3C1B1B;--acc:#D6DCE5;--accink:#15181D;--chip:#2A313A}}
*{box-sizing:border-box}
html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:820px;margin:0 auto;padding:12px 16px 80px}
header{position:sticky;top:0;background:var(--bg);padding:10px 0 8px;z-index:5;border-bottom:1px solid var(--line)}
.fila{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
h1{font-size:18px;margin:0;flex:1 1 auto}
button{font:inherit;min-height:44px;padding:0 14px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
button:disabled{opacity:.5;cursor:default}
button.pri{background:var(--acc);color:var(--accink);border-color:var(--acc);font-weight:600}
button.ok{background:var(--ok);color:#fff;border-color:var(--ok);font-weight:600}
button.mal{color:var(--bad)}
button.peq{min-height:36px;padding:0 10px;font-size:14px}
.tabs{display:flex;gap:6px;margin-top:8px}
.tab{flex:1;text-align:center;padding:9px 6px;border-radius:10px;background:var(--chip);border:1px solid transparent;min-height:40px}
.tab.on{background:var(--acc);color:var(--accink);font-weight:600}
input[type=date],textarea{font:inherit;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;min-height:40px}
textarea{width:100%;min-height:70px}
.res{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 2px}
.pill{padding:4px 10px;border-radius:999px;background:var(--chip);font-size:13px}
.pill.w{background:var(--warnbg);color:var(--warn)} .pill.b{background:var(--badbg);color:var(--bad)} .pill.g{background:var(--okbg);color:var(--ok)}
.correo{margin-top:14px}
.correo>.cab{display:flex;gap:8px;align-items:flex-start;justify-content:space-between;margin:0 2px 6px}
.cab .t{font-weight:600;overflow-wrap:anywhere}
.cab .s{color:var(--mut);font-size:13px}
.op{background:var(--card);border:1px solid var(--line);border-left:6px solid var(--warn);border-radius:12px;padding:12px;margin-bottom:10px}
.op.ok{border-left-color:var(--ok)} .op.rev{border-left-color:var(--bad)} .op.desc{opacity:.6}
.chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.chip{padding:3px 9px;border-radius:999px;background:var(--chip);font-size:12.5px;font-weight:600;letter-spacing:.2px}
.chip.ok{background:var(--okbg);color:var(--ok)} .chip.w{background:var(--warnbg);color:var(--warn)} .chip.b{background:var(--badbg);color:var(--bad)}
.monto{font-size:26px;font-weight:700;margin:8px 0 0;font-variant-numeric:tabular-nums}
.letra{color:var(--mut);font-size:12.5px;margin-bottom:6px}
.val{display:grid;grid-template-columns:78px 1fr;gap:2px 10px;padding:8px 0;border-top:1px dashed var(--line)}
.val .k{color:var(--mut);font-size:13px}
.val .v{overflow-wrap:anywhere}
.cta{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15px;letter-spacing:.3px}
.est{font-size:13px;margin-top:2px}
.est.ok{color:var(--ok)} .est.mal{color:var(--bad)} .est.sd{color:var(--warn)}
.avisos{margin:6px 0 0;padding:8px 10px;border-radius:8px;background:var(--warnbg);color:var(--warn);font-size:13.5px}
.avisos.i{background:var(--chip);color:var(--mut)}
.avisos div+div{margin-top:3px}
.acc{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.acc button{flex:1 1 auto}
.pie{color:var(--mut);font-size:12.5px;margin-top:8px}
.panel{margin-top:10px;padding:10px;border-radius:10px;background:var(--chip)}
.panel pre{white-space:pre-wrap;margin:0 0 8px;font:14px/1.45 system-ui,sans-serif}
.img{margin-top:10px;text-align:center}
.img img{max-width:100%;border-radius:8px;border:1px solid var(--line);cursor:zoom-in}
.vacio{text-align:center;color:var(--mut);padding:36px 12px}
.toast{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);background:var(--acc);color:var(--accink);padding:11px 16px;border-radius:12px;max-width:92vw;z-index:30;box-shadow:0 6px 20px #0004}
.vis{position:fixed;inset:0;background:#000d;z-index:40;overflow:auto;display:none}
.vis img{display:block;max-width:none;width:160%;margin:0 auto;touch-action:pinch-zoom}
.vis .x{position:fixed;right:12px;top:12px}
.conf{margin-top:10px;padding:10px;border-radius:10px;background:var(--badbg);color:var(--bad)}
.conf .acc{margin-top:8px}
.spin{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:g .7s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes g{to{transform:rotate(360deg)}}
.aviso-cat{margin-top:10px;padding:10px;border-radius:10px;background:var(--warnbg);color:var(--warn);font-size:14px}
</style></head><body>
<div class="wrap">
 <header>
  <div class="fila"><h1>Traspasos · Visto bueno</h1><button id="bAct" class="pri">Actualizar</button></div>
  <div class="tabs"><div class="tab on" id="tDia" role="button" tabindex="0">Por día</div><div class="tab" id="tPen" role="button" tabindex="0">Pendientes</div></div>
  <div class="fila" id="barraDia" style="margin-top:8px"><button class="peq" id="bAnt">‹</button><input type="date" id="fFecha"><button class="peq" id="bSig">›</button><button class="peq" id="bHoy">Hoy</button></div>
  <div class="res" id="res"></div>
 </header>
 <div id="aviso"></div>
 <div id="lista"><div class="vacio"><span class="spin"></span>Cargando…</div></div>
 <div class="pie" id="pie"></div>
</div>
<div class="vis" id="vis"><button class="x pri" id="vx">Cerrar</button><img id="visImg" alt="Captura"></div>
<div class="toast" id="toast" style="display:none"></div>
<script>
(function(){
var S={req:0,vista:'dia',fecha:'',data:null,img:{},msg:{},obs:{},conf:{},cargando:false,ocupado:{}};
function $(id){return document.getElementById(id);}
function h(tag,attrs){var e=document.createElement(tag);if(attrs){for(var k in attrs){var v=attrs[k];if(v==null||v===false)continue;if(k==='class')e.className=v;else if(k==='text')e.textContent=v;else if(k.slice(0,2)==='on')e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?'':v);}}
 for(var i=2;i<arguments.length;i++){var c=arguments[i];if(c==null||c===false)continue;if(Array.isArray(c)){c.forEach(function(x){if(x)e.appendChild(x);});}else if(typeof c==='string'){e.appendChild(document.createTextNode(c));}else e.appendChild(c);}
 return e;}
function srv(fn){var args=Array.prototype.slice.call(arguments,1);return new Promise(function(ok,mal){
 if(!(window.google&&google.script&&google.script.run)){mal(new Error('Sin conexión con Apps Script'));return;}
 google.script.run.withSuccessHandler(ok).withFailureHandler(function(e){mal(new Error(e&&e.message?e.message:String(e)));})[fn].apply(google.script.run,args);});}
function toast(t,ms){var e=$('toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(function(){e.style.display='none';},ms||3500);}
function digitos(s){return String(s||'').replace(/\D/g,'');}
function agrupa(s){s=String(s||'');return s?s.replace(/(.{4})/g,'$1 ').trim():'—';}

/* ---------- carga ---------- */
function cargar(silencioso){
 if(silencioso&&S.cargando)return Promise.resolve();
 var tk=++S.req;S.cargando=true;
 if(!silencioso&&!S.data)$('lista').replaceChildren(h('div',{class:'vacio'},h('span',{class:'spin'}),'Cargando…'));
 return srv('traspasosListar',S.vista,S.fecha).then(function(d){if(tk!==S.req)return;S.data=d;if(!S.fecha)S.fecha=d.fecha;$('fFecha').value=S.fecha;S.cargando=false;pintar();}).catch(function(e){if(tk!==S.req)return;S.cargando=false;$('lista').replaceChildren(h('div',{class:'vacio'},'No se pudo cargar: '+e.message));});}
function ponerVista(v){S.vista=v;$('tDia').className='tab'+(v==='dia'?' on':'');$('tPen').className='tab'+(v==='pendientes'?' on':'');$('barraDia').style.display=v==='dia'?'flex':'none';S.data=null;cargar();}
function moverDia(n){var d=new Date((S.fecha||S.data.hoy)+'T12:00:00');d.setDate(d.getDate()+n);S.fecha=d.toISOString().slice(0,10);S.data=null;cargar();}

/* ---------- pintar ---------- */
function pintar(){
 var d=S.data;if(!d)return;var r=d.resumen;
 var pills=[];
 pills.push(h('span',{class:'pill'},r.total+' operación(es)'));
 if(r.pendientes)pills.push(h('span',{class:'pill w'},r.pendientes+' pendiente(s)'));
 if(r.revisar)pills.push(h('span',{class:'pill b'},r.revisar+' por revisar'));
 if(r.vobo)pills.push(h('span',{class:'pill g'},r.vobo+' con Vo.Bo.'));
 if(r.observados)pills.push(h('span',{class:'pill w'},r.observados+' observada(s)'));
 if(S.vista==='dia'&&r.pendientesTotal>r.pendientes)pills.push(h('span',{class:'pill b',role:'button',tabindex:'0',onclick:function(){ponerVista('pendientes');}},r.pendientesTotal+' pendientes en total ›'));
 $('res').replaceChildren.apply($('res'),pills);
 var av=$('aviso');av.replaceChildren();
 if(d.config.catalogoVacio)av.appendChild(h('div',{class:'aviso-cat'},'El catálogo de cuentas está vacío: no se pueden validar cuentas. En el libro: Traspasos → Importar catálogo.'));
 var lista=$('lista');lista.replaceChildren();
 if(!d.correos.length){lista.appendChild(h('div',{class:'vacio'},S.vista==='pendientes'?'No hay traspasos pendientes. ✔':'No hay traspasos este día. Usa “Actualizar” para buscar correos nuevos.'));}
 d.correos.forEach(function(c){lista.appendChild(pintaCorreo(c));});
 var pie=[];pie.push('Lectura: '+d.config.motor);if(d.config.usuario)pie.push(d.config.usuario);
 if(d.config.urlWeb)pie.push('Enlace para el celular: '+d.config.urlWeb);
 $('pie').textContent=pie.join(' · ');
}
function pintaCorreo(c){
 var abiertas=c.ops.filter(function(o){return o.estado==='PENDIENTE'||o.estado==='OBSERVADO';});
 var cab=h('div',{class:'cab'},h('div',null,h('div',{class:'t',text:c.asunto||'(sin asunto)'}),h('div',{class:'s',text:c.remitente+' · '+c.fechaHora})));
 if(abiertas.length>1){
  var k='c:'+c.idMensaje;
  cab.appendChild(h('button',{class:'peq ok',onclick:function(){todos(c,abiertas,false);}},'Vo.Bo. a las '+abiertas.length));
 }
 var box=h('div',{class:'correo'},cab);
 if(S.conf['c:'+c.idMensaje])box.appendChild(pintaConfirmCorreo(c,abiertas));
 c.ops.forEach(function(o){box.appendChild(pintaOp(o,c));});
 var dadas=c.ops.filter(function(o){return o.estado==='VO.BO. DADO';});
 if(dadas.length>1&&abiertas.length===0)box.appendChild(h('div',{class:'acc'},h('button',{class:'peq',onclick:function(){mostrarMensaje(c.idMensaje,dadas.map(function(o){return o.idFila;}),c.idMensaje);}},'Mensaje para las '+dadas.length+' operaciones')));
 if(S.msg['c:'+c.idMensaje])box.appendChild(pintaMensaje('c:'+c.idMensaje,c.idMensaje));
 return box;
}
function chip(t,cls){return h('span',{class:'chip'+(cls?' '+cls:''),text:t});}
function pintaOp(o,c){
 var cls='op'+(o.estado==='VO.BO. DADO'?' ok':(o.estado==='DESCARTADO'?' desc':(o.nivel==='REVISAR'?' rev':'')));
 var est=o.estado==='VO.BO. DADO'?chip('✔ Vo.Bo. dado','ok'):(o.estado==='OBSERVADO'?chip('Observada','w'):(o.estado==='DESCARTADO'?chip('Descartada'):chip('Pendiente','w')));
 var rev=o.estado==='DESCARTADO'?null:(o.nivel==='COINCIDE'?chip('✔ Coincide','ok'):chip('⚠ Revisar','b'));
 var el=h('div',{class:cls,id:'op-'+o.idFila},
  h('div',{class:'chips'},chip(o.destino||'—'),chip(o.tipo||'—'),est,rev),
  o.montoTxt?h('div',{class:'monto',text:o.montoTxt}):h('div',{class:'monto',text:'Sin monto'}),
  o.letra?h('div',{class:'letra',text:o.letra}):null,
  fila('Fecha',h('div',{class:'v'},h('div',{text:'Asunto '+(o.fechaAsunto||'—')+' · Correo '+(o.fechaCorreo.slice(0,10)||'—')+' · Captura '+(o.fechaApp||'sin fecha')}),estado(o.valFecha))),
  fila('Cargo',h('div',{class:'v'},h('div',{class:'cta',text:agrupa(o.cuentaCargo)}),estado(o.valCargo))),
  fila('Beneficiaria',h('div',{class:'v'},h('div',{class:'cta',text:agrupa(o.cuentaBenef)}),estado(o.valBenef)))
 );
 var crit=o.avisos.filter(function(a){return a.indexOf('⚠')===0;}),info=o.avisos.filter(function(a){return a.indexOf('⚠')!==0;});
 if(crit.length)el.appendChild(h('div',{class:'avisos'},crit.map(function(a){return h('div',{text:a});})));
 if(info.length)el.appendChild(h('div',{class:'avisos i'},info.map(function(a){return h('div',{text:a});})));
 if(o.nota)el.appendChild(h('div',{class:'pie',text:'Nota: '+o.nota}));
 if(o.votoPor&&o.estado!=='PENDIENTE')el.appendChild(h('div',{class:'pie',text:(o.estado==='VO.BO. DADO'?'Vo.Bo. de ':(o.estado==='OBSERVADO'?'Observada por ':'Descartada por '))+o.votoPor+' · '+o.votoFecha}));
 el.appendChild(botones(o,c));
 if(S.conf[o.idFila])el.appendChild(pintaConfirm(o));
 if(S.obs[o.idFila]!=null)el.appendChild(pintaObs(o));
 if(S.img[o.idFila])el.appendChild(pintaImg(o));
 if(S.msg[o.idFila])el.appendChild(pintaMensaje(o.idFila,o.idMensaje));
 return el;
}
function fila(k,v){return h('div',{class:'val'},h('div',{class:'k',text:k}),v);}
function estado(t){var ok=/^Correcto/.test(t);var sd=/^Sin /.test(t);return h('div',{class:'est '+(ok?'ok':(sd?'sd':'mal')),text:(ok?'✔ ':(sd?'• ':'✖ '))+(t||'—')});}
function botones(o,c){
 var b=h('div',{class:'acc'});
 var oc=!!S.ocupado[o.idFila];
 b.appendChild(h('button',{onclick:function(){alternaImg(o);}},S.img[o.idFila]?'Ocultar captura':'Ver captura'));
 if(o.estado==='PENDIENTE'||o.estado==='OBSERVADO'){
  b.appendChild(h('button',{class:'ok',disabled:oc,onclick:function(){voBo(o,false);}},'Dar Vo.Bo.'));
  b.appendChild(h('button',{onclick:function(){S.obs[o.idFila]=o.nota||'';pintar();}},'Observar'));
  b.appendChild(h('button',{class:'mal',disabled:oc,onclick:function(){decidir(o,'descartar','');}},'Descartar'));
 }else{
  b.appendChild(h('button',{disabled:oc,onclick:function(){decidir(o,'reabrir','');}},'Reabrir'));
  if(o.estado==='VO.BO. DADO')b.appendChild(h('button',{onclick:function(){mostrarMensaje(o.idFila,[o.idFila],o.idMensaje);}},'Mensaje'));
 }
 if(o.sinLectura||o.estado!=='VO.BO. DADO')b.appendChild(h('button',{class:'peq',disabled:oc,onclick:function(){releer(o);}},'Volver a leer'));
 return b;
}
function pintaConfirm(o){
 return h('div',{class:'conf'},h('div',{text:S.conf[o.idFila]}),h('div',{class:'acc'},h('button',{class:'ok',onclick:function(){voBo(o,true);}},'Sí, dar Vo.Bo.'),h('button',{onclick:function(){delete S.conf[o.idFila];pintar();}},'Cancelar')));
}
function pintaConfirmCorreo(c,abiertas){
 return h('div',{class:'conf'},h('div',{text:S.conf['c:'+c.idMensaje]}),h('div',{class:'acc'},h('button',{class:'ok',onclick:function(){todos(c,abiertas,true);}},'Sí, dar Vo.Bo. a todas'),h('button',{onclick:function(){delete S.conf['c:'+c.idMensaje];pintar();}},'Cancelar')));
}
function pintaObs(o){
 var ta=h('textarea',{placeholder:'¿Qué se observa? (queda en la hoja)'});ta.value=S.obs[o.idFila];
 ta.addEventListener('input',function(){S.obs[o.idFila]=ta.value;});
 return h('div',{class:'panel'},ta,h('div',{class:'acc'},h('button',{class:'pri',onclick:function(){decidir(o,'observar',ta.value);}},'Guardar observación'),h('button',{onclick:function(){delete S.obs[o.idFila];pintar();}},'Cancelar')));
}
function pintaImg(o){
 var s=S.img[o.idFila];
 if(s==='cargando')return h('div',{class:'img'},h('span',{class:'spin'}),'Trayendo la captura de Gmail…');
 if(s&&s.error)return h('div',{class:'img'},'No se pudo mostrar: '+s.error);
 var im=h('img',{src:s.dataUrl,alt:'Captura del correo',onclick:function(){$('visImg').src=s.dataUrl;$('vis').style.display='block';}});
 return h('div',{class:'img'},im,h('div',{class:'pie',text:'Toca la imagen para ampliarla'}));
}
function pintaMensaje(clave,idMensaje){
 var m=S.msg[clave];if(m==='cargando')return h('div',{class:'panel'},h('span',{class:'spin'}),'Armando mensaje…');
 var ta=h('textarea');ta.value=m.texto;ta.addEventListener('input',function(){m.texto=ta.value;});ta.style.minHeight='150px';
 return h('div',{class:'panel'},h('div',{class:'pie',text:'Mensaje listo para pegar (puedes editarlo):'}),ta,
  h('div',{class:'acc'},h('button',{class:'pri',onclick:function(){copiar(ta);}},'Copiar'),
  h('button',{onclick:function(){borrador(idMensaje,m.texto);}},'Crear borrador en Gmail'),
  h('button',{onclick:function(){delete S.msg[clave];pintar();}},'Cerrar')));
}

/* ---------- acciones ---------- */
function copiar(ta){
 ta.focus();ta.select();var ok=false;
 try{ok=document.execCommand('copy');}catch(e){}
 if(!ok&&navigator.clipboard){navigator.clipboard.writeText(ta.value).then(function(){toast('Copiado');},function(){toast('Selecciona el texto y cópialo a mano');});return;}
 toast(ok?'Copiado':'Selecciona el texto y cópialo a mano');
}
function alternaImg(o){
 if(S.img[o.idFila]){delete S.img[o.idFila];pintar();return;}
 S.img[o.idFila]='cargando';pintar();
 srv('traspasosImagen',o.idFila).then(function(r){S.img[o.idFila]=r.ok?r:{error:r.mensaje};pintar();}).catch(function(e){S.img[o.idFila]={error:e.message};pintar();});
}
function reemplazaOp(nuevo){
 S.data.correos.forEach(function(c){c.ops=c.ops.map(function(x){return x.idFila===nuevo.idFila?nuevo:x;});});
 recalcula();pintar();
}
function recalcula(){
 var r={total:0,pendientes:0,vobo:0,observados:0,descartados:0,revisar:0,pendientesTotal:S.data.resumen.pendientesTotal};
 S.data.correos.forEach(function(c){c.ops.forEach(function(o){r.total++;if(o.estado==='PENDIENTE')r.pendientes++;else if(o.estado==='VO.BO. DADO')r.vobo++;else if(o.estado==='OBSERVADO')r.observados++;else if(o.estado==='DESCARTADO')r.descartados++;if(o.nivel==='REVISAR'&&o.estado!=='DESCARTADO'&&o.estado!=='VO.BO. DADO')r.revisar++;});});
 S.data.resumen=r;
}
function voBo(o,confirmado){
 S.ocupado[o.idFila]=true;pintar();
 srv('traspasosDecidir',o.idFila,'vobo','',!!confirmado).then(function(r){
  delete S.ocupado[o.idFila];
  if(r.requiereConfirmar){S.conf[o.idFila]=r.mensaje;pintar();return;}
  if(!r.ok){toast(r.mensaje);pintar();return;}
  delete S.conf[o.idFila];reemplazaOp(r.op);toast('Vo.Bo. registrado');
  mostrarMensaje(o.idFila,[o.idFila],o.idMensaje);
 }).catch(function(e){delete S.ocupado[o.idFila];toast(e.message);pintar();});
}
function decidir(o,accion,nota){
 S.ocupado[o.idFila]=true;pintar();
 srv('traspasosDecidir',o.idFila,accion,nota,false).then(function(r){
  delete S.ocupado[o.idFila];
  if(!r.ok){toast(r.mensaje);pintar();return;}
  delete S.obs[o.idFila];delete S.conf[o.idFila];delete S.msg[o.idFila];reemplazaOp(r.op);
  toast(accion==='reabrir'?'Reabierta':(accion==='descartar'?'Descartada':'Observación guardada'));
 }).catch(function(e){delete S.ocupado[o.idFila];toast(e.message);pintar();});
}
function todos(c,abiertas,confirmado){
 srv('traspasosDecidirCorreo',c.idMensaje,'vobo',!!confirmado).then(function(r){
  if(r.requiereConfirmar){S.conf['c:'+c.idMensaje]=r.mensaje;pintar();return;}
  if(!r.ok){toast(r.mensaje);return;}
  delete S.conf['c:'+c.idMensaje];r.ops.forEach(reemplazaOp);toast('Vo.Bo. dado a '+r.ops.length+' operaciones');
  mostrarMensaje('c:'+c.idMensaje,r.ops.map(function(o){return o.idFila;}),c.idMensaje);
 }).catch(function(e){toast(e.message);});
}
function mostrarMensaje(clave,ids,idMensaje){
 S.msg[clave]='cargando';pintar();
 srv('traspasosMensaje',ids).then(function(r){if(!r.ok){delete S.msg[clave];toast(r.mensaje);pintar();return;}S.msg[clave]={texto:r.texto};pintar();}).catch(function(e){delete S.msg[clave];toast(e.message);pintar();});
}
function borrador(idMensaje,texto){
 srv('traspasosBorrador',idMensaje,texto).then(function(r){toast(r.mensaje,5000);}).catch(function(e){toast(e.message);});
}
function releer(o){
 S.ocupado[o.idFila]=true;pintar();toast('Leyendo de nuevo…');
 srv('traspasosReleer',o.idMensaje,'').then(function(r){delete S.ocupado[o.idFila];toast(r.mensaje,5000);S.data=null;S.img={};cargar();}).catch(function(e){delete S.ocupado[o.idFila];toast(e.message);pintar();});
}
function actualizar(){
 var b=$('bAct');b.disabled=true;b.replaceChildren(h('span',{class:'spin'}),'Buscando…');
 srv('traspasosActualizarAhora').then(function(r){toast(r.mensaje||'Listo',5000);b.disabled=false;b.textContent='Actualizar';S.data=null;cargar();}).catch(function(e){toast(e.message,6000);b.disabled=false;b.textContent='Actualizar';});
}

/* ---------- arranque ---------- */
$('bAct').addEventListener('click',actualizar);
$('tDia').addEventListener('click',function(){ponerVista('dia');});
$('tPen').addEventListener('click',function(){ponerVista('pendientes');});
$('bAnt').addEventListener('click',function(){moverDia(-1);});
$('bSig').addEventListener('click',function(){moverDia(1);});
$('bHoy').addEventListener('click',function(){S.fecha='';S.data=null;cargar();});
$('fFecha').addEventListener('change',function(){if($('fFecha').value){S.fecha=$('fFecha').value;S.data=null;cargar();}});
$('vx').addEventListener('click',function(){$('vis').style.display='none';});
setInterval(function(){if(document.hidden||S.cargando)return;if(Object.keys(S.obs).length||Object.keys(S.conf).length||Object.keys(S.ocupado).length)return;cargar(true);},90000);
window.__TRAS={S:S,cargar:cargar};
cargar();
})();
</script></body></html>`;
