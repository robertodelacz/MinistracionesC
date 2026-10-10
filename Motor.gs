/* ============================================
   CONFIGURACIÓN GLOBAL
   ============================================ */
const CONFIG = {
  HOJAS: {
    SOLICITUDES: 'Solicitudes2026',
  },

  COLUMNAS: {
    LINEA_CREDITO: 1,        // A
    CHECKBOX: 32,            // AE
    FECHA_VALIDACION: 33,    // AF
    COLOR_INDICADOR: 3,      // C
    PRIMER_PAGO: 36,         // AI
    ULTIMO_PAGO: 37,         // AJ
    INFO_RELEVANTE_I: 9,     // I
    INFO_RELEVANTE_G: 7,     // G
    INFO_RELEVANTE_J: 10
  },

  INDICES: {
    LINEA_CREDITO: 0,        // A
    PRIMER_PAGO: 35,         // AI
    ULTIMO_PAGO: 36,         // AJ
    INFO_RELEVANTE_I: 8,     // I
    INFO_RELEVANTE_G: 6,     // G
    INFO_RELEVANTE_J: 9,
    CHECKBOX: 31,            // AE
    FECHA_VALIDACION: 32,    // AF
  },

  CACHE: {
    KEY_LINEAS: 'LINEAS_UNICAS_25',
    DURACION_SEG: 1800,
  },

  UI: {
    SIDEBAR_WIDTH: 400,
    MODAL_WIDTH: 1140,
    MODAL_HEIGHT: 840,
    MAX_SUGERENCIAS: 50,
  },
};

const LOGO_CUALLI_URL = 'https://cualli.mx/wp-content/uploads/2022/07/cualli-bl@3x.png';

/* ============================================
   SISTEMA DE DISEÑO
   ============================================ */
function tokensCSS() {
  return `
    :root{
      --gris:#515151;
      --gris-dark:#3A3A3A;
      --gold:#FDB913;
      --gold-deep:#A8740A;
      --paper:#F1EEE4;
      --surface:#FFFFFF;
      --border:#E2DECF;
      --ink:#1F1F1F;
      --muted:#9C9C94;
      --green:#1F7A43;
      --green-vivid:#16A34A;
      --azul-regimen:#1B4F8C;
      --alert:#A33028;
      --shadow-card:0 4px 18px -8px rgba(0,0,0,.14);
      --shadow-elevated:0 18px 40px -16px rgba(0,0,0,.28);
      --font-sans:'IBM Plex Sans',sans-serif;
      --font-mono:'IBM Plex Mono',monospace;
    }
  `;
}

function fontsLinkHTML() {
  return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
  `;
}

/* ============================================
   COLORES DINÁMICOS
   ============================================ */
const COLORES_DINAMICOS = {
  "Tipo Credito": {
    "keywords_simple": ["simple"],
    "color_simple": { clase: 'simple' },
    "default": { clase: 'otros' }
  }
};

function obtenerClaseDinamica(nombreCampo, valorCampo) {
  if (!COLORES_DINAMICOS[nombreCampo]) return null;
  const config = COLORES_DINAMICOS[nombreCampo];
  const valorNormalizado = String(valorCampo || '')
    .trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (config["keywords_simple"]) {
    const contieneSimple = config["keywords_simple"].some(keyword =>
      valorNormalizado.includes(keyword.toLowerCase())
    );
    if (contieneSimple && config["color_simple"]) return config["color_simple"].clase;
  }
  if (config["default"]) return config["default"].clase;
  return null;
}

/**
 * Clasifica el Régimen Fiscal para el chip destacado:
 * Persona Física -> azul · Persona Moral / PFAE -> negro
 */
function claseRegimenFiscal(valor) {
  const v = String(valor || '').trim().toUpperCase().replace(/\./g, '');
  if (v.indexOf('PFAE') !== -1 || v.indexOf('EMPRESARIAL') !== -1) return 'regimen-pm';
  if (v === 'PF' || v.indexOf('FISICA') !== -1 || v.indexOf('FÍSICA') !== -1) return 'regimen-pf';
  return 'regimen-pm';
}

/* ============================================
   FORMATOS DE CAMPOS
   ============================================ */
const FORMATOS_CAMPOS = {
  "Monto": (valor) => {
    const n = Number(valor);
    return isNaN(n) ? (valor ?? 'N/A') : n.toLocaleString('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  },
  "Fecha de Solicitud": (valor) => formatoFechaLarga(valor),
  "Fecha Firma": (valor) => formatoFechaLarga(valor),
  "Fecha Vencimiento LC": (valor) => formatoFechaLarga(valor),
  "Fecha Vencimiento": (valor) => formatoFechaLarga(valor),
  "Fecha de corte": (valor) => {
    if (!valor) return 'N/A';
    return String(valor).replace(/c\/m/gi, 'Cada Mes');
  },
  "Tasa": (valor) => {
    const n = Number(valor);
    return isNaN(n) ? (valor ?? 'N/A') : (n * 100).toFixed(2) + '%';
  }
};

/* ============================================
   FORMATO DE FECHAS
   ============================================ */
function formatoFechaLarga(valor) {
  if (!valor) return 'No especificada';
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const str = String(valor).trim();
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const dia = parseInt(m[1], 10);
    const mes = parseInt(m[2], 10) - 1;
    const año = m[3];
    if (mes >= 0 && mes <= 11) return `${dia} de ${meses[mes]} de ${año}`;
  }
  return str;
}

function parsearFecha(valor) {
  if (!valor) return null;
  if (Object.prototype.toString.call(valor) === '[object Date]' && !isNaN(valor)) return valor;

  const matchDMY = String(valor).match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchDMY) {
    const dia = parseInt(matchDMY[1], 10);
    const mes = parseInt(matchDMY[2], 10) - 1;
    const año = parseInt(matchDMY[3], 10);
    return new Date(año, mes, dia);
  }

  const mesesCortos = { ene:0, feb:1, mar:2, abr:3, may:4, jun:5, jul:6, ago:7, sep:8, oct:9, nov:10, dic:11 };
  const matchTxt = String(valor).toLowerCase().match(/^(\d{1,2})[-\s](\w{3})[-\s](\d{4})$/);
  if (matchTxt) {
    const dia = parseInt(matchTxt[1], 10);
    const mes = mesesCortos[matchTxt[2]];
    const año = parseInt(matchTxt[3], 10);
    if (mes !== undefined) return new Date(año, mes, dia);
  }
  return null;
}

/* ============================================
   SIDEBAR
   ============================================ */
function mostrarSidebarLineas() {
  const lineas = obtenerLineasUnicas();

  const html = HtmlService.createHtmlOutput(`
  <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        ${fontsLinkHTML()}
        <style>
          ${tokensCSS()}
          *{box-sizing:border-box}
          html,body{height:100%}
          body{ margin:0; padding:16px; background:var(--paper); color:var(--ink); font-family:var(--font-sans); }

          .frame{ background:var(--surface); border-radius:16px; box-shadow:var(--shadow-elevated); max-width:480px; margin:0 auto; overflow:hidden; }

          .logo-box{ width:54px; height:54px; background:#fff; border-radius:13px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; box-shadow:0 5px 14px rgba(0,0,0,.28); border-bottom:3px solid var(--gold); }
          .logo-box img{ max-width:42px; max-height:42px; object-fit:contain; }

          .sidebar-header{ background:linear-gradient(135deg,var(--gris) 0%, #3A3A3A 100%); padding:20px 20px 22px; display:flex; align-items:center; gap:14px; }
          .sidebar-header h2{ font-size:16px; font-weight:700; color:#fff; margin:0 0 4px; }
          .sidebar-header p{ margin:0; color:var(--gold); font-size:10px; letter-spacing:.1em; text-transform:uppercase; font-weight:700; font-family:var(--font-mono); }
          .sidebar-body{ padding:22px 20px 24px; }

          .toggle{ display:flex; background:var(--paper); border-radius:10px; padding:4px; margin-bottom:20px; }
          .toggle button{ flex:1; border:none; background:transparent; padding:9px 6px; font-family:var(--font-sans); font-weight:700; font-size:11px; letter-spacing:.03em; text-transform:uppercase; color:var(--gris); border-radius:7px; cursor:pointer; }
          .toggle button.active{ background:var(--gris); color:var(--gold); box-shadow:0 3px 8px rgba(0,0,0,.2); }

          .field{ margin-bottom:16px; position:relative; }
          .field label{ display:block; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--gris); margin-bottom:7px; }
          .input-wrap{ position:relative; }
          .input-wrap .material-icons-round{ position:absolute; left:12px; top:50%; transform:translateY(-50%); font-size:17px; color:#8A8A8A; }
          input{ width:100%; padding:10px 12px 10px 38px; border:1.5px solid var(--border); border-radius:10px; font-family:var(--font-mono); font-size:13px; font-weight:500; color:var(--ink); background:var(--surface); }
          input:focus{ outline:none; border-color:var(--gold-deep); box-shadow:0 0 0 3px rgba(253,185,19,.28); }

          .suggestions{
            position:absolute; inset-inline:0; top:calc(100% + 6px);
            background:var(--surface); border-radius:10px; box-shadow:var(--shadow-card);
            max-height:220px; overflow:auto; z-index:9999; display:none; list-style:none; padding:4px 0; margin:0;
          }
          .suggestions li{ padding:8px 14px; font-family:var(--font-mono); font-size:12.5px; cursor:pointer; }
          .suggestions li:hover{ background:var(--paper); color:var(--gold-deep); }

          .btn-primary{ width:100%; border:none; border-radius:30px; padding:13px; margin-top:6px; background:linear-gradient(135deg,var(--gold) 0%, var(--gold-deep) 100%); color:#2A1D00; font-family:var(--font-sans); font-weight:700; font-size:12.5px; letter-spacing:.03em; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; box-shadow:0 8px 20px rgba(168,116,10,.32); }
          .btn-primary:disabled{ opacity:.6; cursor:not-allowed; }
          .btn-primary .material-icons-round{ font-size:17px; }

          .loading{ display:none; text-align:center; padding:18px 0 2px; }
          .loading-content{ display:inline-flex; flex-direction:column; align-items:center; }
          .spinner{ width:32px; height:32px; border:3px solid var(--paper); border-top:3px solid var(--gold); border-radius:50%; animation:spin 1s linear infinite; margin-bottom:9px; }
          .loading p{ font-size:11.5px; color:var(--gris); margin:0; font-weight:600; }
          @keyframes spin{ to{ transform:rotate(360deg); } }
        </style>
      </head>
      <body>
        <div class="frame">
          <div class="sidebar-header">
            <div class="logo-box"><img src="${LOGO_CUALLI_URL}" alt="Cualli"></div>
            <div>
              <h2>Validación de ministraciones</h2>
              <p>Financiera Cualli</p>
            </div>
          </div>

          <div class="sidebar-body">
            <div class="toggle">
              <button id="btnInd" class="active" onclick="toggleModo('ind')">Individual</button>
              <button id="btnDia" onclick="toggleModo('dia')">Por día</button>
            </div>

            <div class="field">
              <label id="lblFecha" for="fecha">Fecha de Solicitud</label>
              <div class="input-wrap">
                <span class="material-icons-round">event</span>
                <input type="date" id="fecha">
              </div>
            </div>

            <div id="grupoLinea" class="field">
              <label for="linea">Línea de Crédito</label>
              <div class="input-wrap">
                <span class="material-icons-round">list_alt</span>
                <input id="linea" type="text" placeholder="Escribe una línea" autocomplete="off">
                <ul id="lineaSuggestions" class="suggestions"></ul>
              </div>
            </div>

            <button id="btnVisualizar" class="btn-primary" onclick="visualizar()">
              <span class="material-icons-round">search</span><span id="txtBtn">Buscar Línea</span>
            </button>

            <div id="loading" class="loading">
              <div class="loading-content">
                <div class="spinner"></div>
                <p>Buscando información...</p>
              </div>
            </div>
          </div>
        </div>

        <script>
          document.getElementById('fecha').valueAsDate = new Date();

          var LINEAS_CACHE = ${JSON.stringify(lineas)};
          var modoActual = 'ind';

          (function(){
            var input = document.getElementById('linea');
            var wrap  = input.parentElement;
            var list  = document.getElementById('lineaSuggestions');
            wrap.style.position = 'relative';

            function buildList(items){
              list.innerHTML = '';
              items.forEach(function(item){
                var li = document.createElement('li');
                li.textContent = item;
                li.onclick = function(){
                  input.value = item;
                  list.style.display = 'none';
                  input.focus();
                };
                list.appendChild(li);
              });
              list.style.display = items.length ? 'block' : 'none';
            }

            function renderSuggestions(q, showTopWhenEmpty){
              var qn = (q || '').toString().trim().toLowerCase();
              if (!qn) {
                if (showTopWhenEmpty && LINEAS_CACHE && LINEAS_CACHE.length) {
                  buildList(LINEAS_CACHE.slice(0, ${CONFIG.UI.MAX_SUGERENCIAS}));
                } else {
                  list.style.display = 'none';
                }
                return;
              }
              var data = LINEAS_CACHE
                .filter(function(x){ return String(x).toLowerCase().indexOf(qn) !== -1; })
                .slice(0, ${CONFIG.UI.MAX_SUGERENCIAS});
              buildList(data);
            }

            input.addEventListener('input', function(e){ renderSuggestions(e.target.value, false); });
            input.addEventListener('focus', function(){ renderSuggestions(input.value, true); });
            input.addEventListener('keydown', function(e){ if (e.key === 'Escape') list.style.display = 'none'; });
            document.addEventListener('click', function(e){ if (!wrap.contains(e.target)) list.style.display = 'none'; });

            input.addEventListener('keydown', function(e){
              if (e.key === 'Enter') document.getElementById('btnVisualizar').click();
            });
          })();

          function toggleModo(modo) {
            modoActual = modo;
            const isInd = modo === 'ind';
            document.getElementById('btnInd').classList.toggle('active', isInd);
            document.getElementById('btnDia').classList.toggle('active', !isInd);
            document.getElementById('grupoLinea').style.display = isInd ? 'block' : 'none';
            document.getElementById('lblFecha').textContent = isInd ? 'Fecha de Solicitud' : 'Fecha de Solicitudes';
            document.getElementById('txtBtn').textContent = isInd ? 'Buscar Línea' : 'Buscar por Día';
            if(!isInd) document.getElementById('linea').value = '';
          }

          function visualizar() {
            const btn = document.getElementById("btnVisualizar");
            const loading = document.getElementById("loading");
            const statusTxt = loading.querySelector('p');
            const fecha = document.getElementById('fecha').value;
            const linea = document.getElementById('linea').value;

            if (!fecha || (modoActual === 'ind' && !linea)) {
              alert('Por favor complete los campos necesarios (Fecha y Línea)');
              return;
            }

            btn.disabled = true;
            loading.style.display = 'block';
            if(statusTxt) statusTxt.textContent = "Buscando información...";

            const lineaBusqueda = (modoActual === 'dia') ? null : linea;

            google.script.run
              .withSuccessHandler(function(rows) {
                if (!rows || rows.length === 0) {
                  btn.disabled = false;
                  loading.style.display = 'none';
                  alert('No se encontraron registros para la búsqueda solicitada.');
                  return;
                }

                google.script.run
                  .withSuccessHandler(function() {
                    if(statusTxt) statusTxt.textContent = "¡Visualización exitosa!";
                    setTimeout(function() {
                      btn.disabled = false;
                      loading.style.display = 'none';
                      if(statusTxt) statusTxt.textContent = "Buscando información...";
                    }, 2000);
                  })
                  .mostrarDetalleNavegable(rows, 0);
              })
              .withFailureHandler(function(error) {
                btn.disabled = false;
                loading.style.display = 'none';
                alert('Error en la búsqueda: ' + error.message);
              })
              .getFilasCoincidentes(lineaBusqueda, fecha);
          }

          window.visualizar = visualizar;
          toggleModo('ind');
        </script>
      </body>
    </html>
  `).setTitle('Buscador Avanzado').setWidth(CONFIG.UI.SIDEBAR_WIDTH);

  SpreadsheetApp.getUi().showSidebar(html);
}

/* ============================================
   FUNCIONES DE DATOS
   ============================================ */
function obtenerLineasUnicas() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CONFIG.CACHE.KEY_LINEAS);
  if (cached) return JSON.parse(cached);

  var hoja = SpreadsheetApp.getActive().getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];

  var datos = hoja.getRange(2, CONFIG.COLUMNAS.LINEA_CREDITO, lastRow - 1, 1).getValues();
  var set = {};
  for (var i = 0; i < datos.length; i++) {
    var v = (datos[i][0] + '').trim();
    if (v) set[v] = true;
  }
  var arr = Object.keys(set).sort();
  cache.put(CONFIG.CACHE.KEY_LINEAS, JSON.stringify(arr), CONFIG.CACHE.DURACION_SEG);
  return arr;
}

function getFilasCoincidentes(linea, fechaISO) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  var lastRow = hoja.getLastRow();
  if (lastRow < 2) return [];

  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var idxFecha = headers.indexOf("Fecha de Solicitud");
  var colLinea = hoja.getRange(2, CONFIG.COLUMNAS.LINEA_CREDITO, lastRow - 1, 1).getValues();
  var colFecha = hoja.getRange(2, idxFecha + 1, lastRow - 1, 1).getValues();

  var rows = [];
  for (var i = 0; i < colLinea.length; i++) {
    var coincideLinea = (linea === null) || ((colLinea[i][0] + '').trim() === linea);
    var fv = colFecha[i][0];
    var ymd = '';
    if (fv instanceof Date && !isNaN(fv)) {
      var y = fv.getFullYear();
      var m = (fv.getMonth() + 1).toString().padStart(2,'0');
      var da = fv.getDate().toString().padStart(2,'0');
      ymd = y + '-' + m + '-' + da;
    }
    if (coincideLinea && ymd === fechaISO) rows.push(i + 2);
  }
  return rows;
}

/* ============================================
   MODAL DE DETALLE
   ============================================ */
function mostrarDetalleLineaPorRow(rowNumber) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  const lastRow = hoja.getLastRow();
  if (rowNumber < 2 || rowNumber > lastRow) {
    SpreadsheetApp.getUi().alert('Número de fila inválido.');
    return;
  }

  const lastCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const fila        = hoja.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];

  const primerPagoAIDisplay = fila[CONFIG.INDICES.PRIMER_PAGO] || '';
  const ultimoPagoAJDisplay = fila[CONFIG.INDICES.ULTIMO_PAGO] || '';

  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        ${fontsLinkHTML()}
        <style>${generarCSSModal()}</style>
      </head>
      <body>
        ${construirHTMLLinea(encabezados, fila, rowNumber, primerPagoAIDisplay, ultimoPagoAJDisplay, true)}
        <script>${generarJSModal(rowNumber)}</script>
      </body>
    </html>
  `).setWidth(CONFIG.UI.MODAL_WIDTH).setHeight(CONFIG.UI.MODAL_HEIGHT);

  SpreadsheetApp.getUi().showModalDialog(html, 'Detalles de Línea');
}

/* ============================================
   CSS DEL MODAL
   ============================================ */
function generarCSSModal() {
  return `
    ${tokensCSS()}
    *{ box-sizing:border-box; margin:0; padding:0; font-family:var(--font-sans); }
    body{ background:var(--paper); color:var(--ink); line-height:1.55; padding:34px; max-width:1080px; margin:0 auto; font-size:14.5px; }

    #fixedButtonContainer{
      position:fixed; top:0; left:0; right:0; height:70px; z-index:999999;
      background:rgba(241,238,228,.97); backdrop-filter:blur(6px);
      display:flex; align-items:center; justify-content:flex-end; padding:0 24px;
      border-bottom:1px solid var(--border);
    }
    #contentSpacer{ height:100px; width:100%; }
    #openWindowBtn{
      padding:9px 18px; border:none; border-radius:20px; background:var(--gris); color:#fff;
      cursor:pointer; font-weight:600; font-size:13px; font-family:var(--font-sans);
      display:inline-flex; align-items:center; gap:8px; white-space:nowrap; box-shadow:var(--shadow-card);
    }
    #openWindowBtn:hover{ background:var(--gris-dark); }
    #openWindowBtn:disabled{ opacity:.6; cursor:not-allowed; }
    #openWindowBtn.loading{ background:var(--muted); }
    .btn-icon{ width:15px; height:15px; flex-shrink:0; }
    #openWindowBtn.loading .btn-icon{ animation:spin 1s linear infinite; }
    @keyframes spin{ to{ transform:rotate(360deg); } }

    @media (max-width:600px){
      #fixedButtonContainer{ height:60px; padding:0 15px; }
      #contentSpacer{ height:60px; }
      #openWindowBtn{ padding:8px 14px; font-size:12px; }
      #openWindowBtn span:not(.btn-icon){ display:none; }
    }

    .record-card{ position:relative; background:var(--surface); border-radius:18px; box-shadow:var(--shadow-elevated); overflow:hidden; }

    .ribbon-wrap{ position:absolute; top:0; right:0; width:160px; height:160px; overflow:hidden; pointer-events:none; z-index:5; }
    .ribbon{
      position:absolute; top:26px; right:-44px; width:210px; transform:rotate(45deg);
      background:var(--gris-dark); color:#fff; text-align:center; font-weight:700;
      font-size:11px; letter-spacing:.1em; text-transform:uppercase; padding:6px 0;
      box-shadow:0 3px 10px rgba(0,0,0,.3); transition:background .25s ease;
    }
    .ribbon.validado{ background:linear-gradient(135deg,var(--gold) 0%, var(--gold-deep) 100%); }

    .modal-header{ background:linear-gradient(135deg,var(--gris) 0%, #3A3A3A 100%); padding:26px 28px; display:flex; align-items:center; gap:16px; }
    .logo-box{ width:58px; height:58px; background:#fff; border-radius:14px; flex:0 0 auto; display:flex; align-items:center; justify-content:center; overflow:hidden; box-shadow:0 6px 16px rgba(0,0,0,.3); border-bottom:3px solid var(--gold); }
    .logo-box img{ max-width:44px; max-height:44px; object-fit:contain; }
    .eyebrow-light{ margin:0 0 4px; color:rgba(255,255,255,.6); font-size:11px; letter-spacing:.1em; text-transform:uppercase; font-family:var(--font-mono); font-weight:600; }
    .header-cliente{ margin:0 0 9px; color:rgba(255,255,255,.88); font-size:15px; font-weight:600; }
    .modal-header h2{ font-size:23px; font-weight:700; color:#fff; margin:0 0 8px; }
    .id-chip{ font-family:var(--font-mono); font-size:12px; color:var(--gold); background:rgba(253,185,19,.15); border:1px solid rgba(253,185,19,.35); padding:4px 11px; border-radius:20px; font-weight:600; }

    .modal-body{ padding:24px 28px 28px; }

    .highlights{ margin-bottom:22px; }
    .highlight-card{ background:var(--surface); border:1px solid var(--border); border-radius:14px; box-shadow:var(--shadow-card); padding:18px 20px; border-top:3px solid var(--gold); }
    .highlight-card.gris-top{ border-top-color:var(--gris); }
    .highlight-card.wide{ margin-bottom:14px; }
    .highlight-row{ display:grid; grid-template-columns:1fr 1fr; gap:14px; }
    .highlight-head{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
    .icon-badge{ width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
    .icon-badge.gold{ background:#FCEFD2; color:var(--gold-deep); }
    .icon-badge.gris{ background:#EDEBE5; color:var(--gris); }
    .icon-badge .material-icons-round{ font-size:16px; }
    .highlight-title{ font-size:14.5px; font-weight:700; color:var(--ink); }
    .highlight-body{ font-size:14px; line-height:1.65; color:#5A5A54; }
    .highlight-body.empty{ color:var(--muted); }

    .vgroup{ border-radius:14px; box-shadow:var(--shadow-card); overflow:hidden; margin-bottom:14px; }
    .vgroup-dark{ background:linear-gradient(135deg,var(--gris) 0%, #3A3A3A 100%); color:#fff; border-top:3px solid var(--gold); }
    .vgroup-light{ background:linear-gradient(135deg,#FBF1D7 0%, #F3DFA8 100%); color:var(--ink); border:1px solid #EAD9A8; border-top:3px solid var(--gris); }
    .vgroup-label{ font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; padding:11px 18px; opacity:.92; border-bottom:1px solid rgba(255,255,255,.15); display:flex; align-items:center; gap:8px; }
    .vgroup-label .gicon{ width:22px; height:22px; border-radius:50%; background:rgba(255,255,255,.16); display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; }
    .vgroup-label .gicon .material-icons-round{ font-size:13px; }
    .vgroup-light .vgroup-label{ border-bottom-color:rgba(0,0,0,.1); color:var(--gold-deep); opacity:1; }
    .vgroup-light .vgroup-label .gicon{ background:rgba(0,0,0,.08); }
    .vgroup-row{ display:grid; }
    .vgroup-row.cols-3{ grid-template-columns:repeat(3,1fr); }
    .vgroup-row.cols-2{ grid-template-columns:repeat(2,1fr); }
    .vitem{ padding:14px 18px; border-right:1px solid rgba(255,255,255,.18); }
    .vitem:last-child{ border-right:none; }
    .vgroup-light .vitem{ border-right-color:rgba(0,0,0,.12); }
    .vi-label{ font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; font-weight:700; opacity:.78; margin-bottom:7px; }
    /* ✅ CAMBIO 1: Labels más grandes en el grupo claro (chips de Régimen/Tipo) */
    .vgroup-light .vi-label{ font-size:13px; letter-spacing:.04em; opacity:1; margin-bottom:10px; }
    .vi-value{ font-family:var(--font-mono); font-size:16.5px; font-weight:700; line-height:1.3; }
    .vi-value.lg{ font-size:21px; }
    .vi-value.alert{ color:var(--alert); }
    /* ✅ CAMBIO 2: Valor en amarillo institucional — Monto y Tasa */
    .vi-value.gold{ color:var(--gold) !important; }
    .vgroup-light .chip{ background:rgba(255,255,255,.75); }

    .vitem.acento-oro, .vitem.acento-plata{ border-left:none !important; margin:8px; padding:10px 14px; border-radius:8px; }
    .vitem.acento-oro{ background:linear-gradient(135deg,var(--gold) 0%, var(--gold-deep) 100%); color:#2A1D00; }
    .vitem.acento-plata{ background:rgba(255,255,255,.12); }
    .vgroup-row + .vgroup-row{ border-top:1px solid rgba(255,255,255,.18); }
    .vgroup-light .vgroup-row + .vgroup-row{ border-top-color:rgba(0,0,0,.12); }

    .status-banner{
      display:flex; align-items:center; gap:14px; color:#fff; border-radius:14px; padding:14px 20px;
      margin-bottom:14px; box-shadow:var(--shadow-card); border-top:3px solid var(--gold);
    }
    .status-banner.risk{ background:linear-gradient(135deg,#B5443B 0%, #7A241D 100%); }
    .status-banner.ok{ background:linear-gradient(135deg,var(--green) 0%, #14532D 100%); }
    .sb-icon{ width:34px; height:34px; border-radius:50%; background:rgba(255,255,255,.16); display:flex; align-items:center; justify-content:center; flex:0 0 auto; }
    .sb-icon .material-icons-round{ font-size:18px; }
    .sb-label{ font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; opacity:.92; }
    .sb-value{ font-family:var(--font-mono); font-size:18px; font-weight:700; margin-left:auto; text-transform:uppercase; }

    /* ✅ CAMBIO 3: Chips más grandes (padding y font-size) */
    .chip{ display:inline-block; padding:8px 18px; font-size:14px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; border-radius:20px; font-family:var(--font-sans); }
    .chip.activo{ background:var(--green-vivid); color:#fff; box-shadow:0 2px 8px rgba(22,163,74,.35); }
    .chip.inactivo{ background:linear-gradient(135deg,var(--gris) 0%, var(--gris-dark) 100%); color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.22); }
    .chip.otros{ background:linear-gradient(135deg,var(--gold) 0%, var(--gold-deep) 100%); color:#2A1D00; box-shadow:0 2px 8px rgba(168,116,10,.35); }
    .chip.simple{ background:linear-gradient(135deg,var(--gris) 0%, var(--gris-dark) 100%); color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.22); }
    .chip.regimen-pf{ background:var(--azul-regimen); color:#fff; box-shadow:0 2px 8px rgba(27,79,140,.35); }
    .chip.regimen-pm{ background:var(--ink); color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.3); }

    .action-bar{ display:flex; align-items:center; justify-content:space-between; padding-top:18px; margin-top:24px; border-top:1px solid var(--border); }
    .status-text{ font-size:13.5px; color:var(--gris); font-weight:600; }
    .status-text b{ color:var(--ink); }
    .status-message{ padding-top:8px; font-size:12.5px; color:var(--gris); min-height:14px; }
    .btn-validar{
      border:none; padding:14px 30px; background:linear-gradient(135deg,var(--gold) 0%, var(--gold-deep) 100%);
      color:#2A1D00; font-family:var(--font-sans); font-weight:700; font-size:13.5px; letter-spacing:.04em; text-transform:uppercase;
      cursor:pointer; display:inline-flex; align-items:center; gap:8px; border-radius:30px;
      box-shadow:0 8px 20px rgba(168,116,10,.3); transition:transform .15s ease, box-shadow .15s ease, background .2s ease;
    }
    .btn-validar:hover:not(:disabled){ transform:translateY(-1px); }
    .btn-validar:disabled{ cursor:not-allowed; opacity:.92; }
    .btn-validar.loading{ opacity:.7; cursor:progress; }
    .btn-validar.loading .icon{ animation:spin 1s linear infinite; }
    .btn-validar.validado{ background:linear-gradient(135deg,var(--gris) 0%, #3A3A3A 100%); color:#fff; box-shadow:none; }
    .btn-validar.error{ background:transparent; border:1.5px solid var(--alert); color:var(--alert); box-shadow:none; }
    .btn-validar .icon{ font-size:18.5px; }

    @media (max-width:768px){
      .highlight-row{ grid-template-columns:1fr; }
      .vgroup-row.cols-3, .vgroup-row.cols-2{ grid-template-columns:1fr; }
      .vitem{ border-right:none !important; border-bottom:1px solid rgba(255,255,255,.18); }
      .vitem:last-child{ border-bottom:none; }
      .vgroup-light .vitem{ border-bottom-color:rgba(0,0,0,.12); }
      body{ padding:16px; }
    }
  `;
}

function construirHTMLLinea(encabezados, fila, rowNumber, primerPagoAI, ultimoPagoAJ, mostrarBotonVentana) {
  const idx = Object.create(null);
  for (let i = 0; i < encabezados.length; i++) idx[encabezados[i]] = i;

  let htmlContent = '';

  // ========== BOTÓN ABRIR EN VENTANA ==========
  if (mostrarBotonVentana) {
    htmlContent += `
      <div id="fixedButtonContainer">
        <button id="openWindowBtn" onclick="abrirEnNuevaVentana(${rowNumber})" title="Abrir en pestaña del navegador">
          <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
          </svg>
          <span>Abrir en pestaña nueva</span>
        </button>
      </div>
      <div id="contentSpacer"></div>

      <script>
        function abrirEnNuevaVentana(rowNum) {
          const btn = document.getElementById('openWindowBtn');
          const text = btn.querySelector('span:not(.btn-icon)');

          btn.classList.add('loading');
          btn.disabled = true;
          if (text) text.textContent = 'Generando...';

          google.script.run
            .withSuccessHandler(function(result) {
              if (result && result.success) {
                const w = window.open('about:blank', '_blank');
                if (w) {
                  w.document.open();
                  w.document.write(result.html);
                  w.document.close();
                } else {
                  alert('Por favor, permite ventanas emergentes para abrir la visualización');
                }
                btn.classList.remove('loading');
                btn.disabled = false;
                if (text) text.textContent = 'Abrir en pestaña nueva';
              } else {
                alert('Error: ' + (result.message || 'No se pudo generar el contenido'));
                restaurarBoton(btn, text);
              }
            })
            .withFailureHandler(function(error) {
              alert('Error al abrir ventana: ' + error.message);
              restaurarBoton(btn, text);
            })
            .abrirEnVentanaCompleta(rowNum);
        }

        function restaurarBoton(btn, text) {
          btn.classList.remove('loading');
          btn.disabled = false;
          if (text) text.textContent = 'Abrir en pestaña nueva';
        }
      <\/script>
    `;
  }

  // ========== ESTADO REAL DE VALIDACIÓN ==========
  const checkboxRaw = String(fila[CONFIG.INDICES.CHECKBOX] || '').trim().toUpperCase();
  const yaValidado = checkboxRaw === 'TRUE' || checkboxRaw === 'VERDADERO';
  const fechaValidacionDisplay = (fila[CONFIG.INDICES.FECHA_VALIDACION] || '').toString().trim();

  htmlContent += `<div class="record-card">`;
  htmlContent += `<div class="ribbon-wrap"><div class="ribbon ${yaValidado ? 'validado' : ''}" id="ribbon">${yaValidado ? 'Validado' : 'Pendiente'}</div></div>`;
  htmlContent += generarHTMLHeader(fila, idx);
  htmlContent += `<div class="modal-body">`;

  // ========== INFORMACIÓN RELEVANTE — AL INICIO ==========
  const valorIRaw = fila[CONFIG.INDICES.INFO_RELEVANTE_I];
  const valorGRaw = fila[CONFIG.INDICES.INFO_RELEVANTE_G];
  const valorJRaw = fila[CONFIG.INDICES.INFO_RELEVANTE_J];

  let valorG = 'SIN DATOS', esVacioG = true;
  if (valorGRaw !== null && valorGRaw !== undefined && String(valorGRaw).trim() !== '') {
    valorG = String(valorGRaw).trim(); esVacioG = false;
  }
  let valorI = 'N/A', esVacioI = true;
  if (valorIRaw !== null && valorIRaw !== undefined && String(valorIRaw).trim() !== '') {
    valorI = String(valorIRaw).trim(); esVacioI = false;
  }
  let valorJ = 'N/A', esVacioJ = true;
  if (valorJRaw !== null && valorJRaw !== undefined && String(valorJRaw).trim() !== '') {
    valorJ = String(valorJRaw).trim().replace(/\n/g, '<br>').replace(/(\d+\.\s)/g, '<br>$1');
    esVacioJ = false;
  }

  const nombreI = encabezados[CONFIG.INDICES.INFO_RELEVANTE_I] || 'Información I';
  const nombreG = encabezados[CONFIG.INDICES.INFO_RELEVANTE_G] || 'Información G';
  const nombreJ = encabezados[CONFIG.INDICES.INFO_RELEVANTE_J] || 'Condiciones';

  htmlContent += `
    <div class="highlights">
      <div class="highlight-card wide">
        <div class="highlight-head">
          <div class="icon-badge gold"><span class="material-icons-round">gavel</span></div>
          <span class="highlight-title">${nombreJ}</span>
        </div>
        <div class="highlight-body ${esVacioJ ? 'empty' : ''}">${valorJ}</div>
      </div>
      <div class="highlight-row">
        <div class="highlight-card gris-top">
          <div class="highlight-head">
            <div class="icon-badge gris"><span class="material-icons-round">visibility</span></div>
            <span class="highlight-title">${nombreI}</span>
          </div>
          <div class="highlight-body ${esVacioI ? 'empty' : ''}">${valorI}</div>
        </div>
        <div class="highlight-card gris-top">
          <div class="highlight-head">
            <div class="icon-badge gris"><span class="material-icons-round">flag</span></div>
            <span class="highlight-title">${nombreG}</span>
          </div>
          <div class="highlight-body ${esVacioG ? 'empty' : ''}">${valorG}</div>
        </div>
      </div>
    </div>
  `;

  // ========== BANNER: VENCIMIENTO DE LÍNEA ==========
  if (idx['Fecha Vencimiento LC'] != null) {
    const raw = fila[idx['Fecha Vencimiento LC']];
    const val = FORMATOS_CAMPOS['Fecha Vencimiento LC'] ? FORMATOS_CAMPOS['Fecha Vencimiento LC'](raw) : (raw ?? 'N/A');
    htmlContent += `
      <div class="status-banner risk">
        <div class="sb-icon"><span class="material-icons-round">warning</span></div>
        <span class="sb-label">Vencimiento de la línea (LC)</span>
        <span class="sb-value">${val}</span>
      </div>
    `;
  }

  // ========== BANNER: ESTATUS ==========
  if (idx['Estatus'] != null) {
    const raw = fila[idx['Estatus']];
    const esActivo = raw && String(raw).trim().toLowerCase() === 'activo';
    htmlContent += `
      <div class="status-banner ${esActivo ? 'ok' : 'risk'}">
        <div class="sb-icon"><span class="material-icons-round">${esActivo ? 'check_circle' : 'flag'}</span></div>
        <span class="sb-label">Estatus</span>
        <span class="sb-value">${raw ?? 'N/A'}</span>
      </div>
    `;
  }

  // ========== GRUPO: GENERALES ==========
  let generalesChipsHTML = '';
  if (idx['Régimen Fiscal'] != null) {
    const raw = fila[idx['Régimen Fiscal']];
    generalesChipsHTML += `<div class="vitem"><div class="vi-label">Régimen fiscal</div><span class="chip ${claseRegimenFiscal(raw)}">${raw ?? 'N/A'}</span></div>`;
  }
  if (idx['Tipo Credito'] != null) {
    const raw = fila[idx['Tipo Credito']];
    const claseDinamica = obtenerClaseDinamica('Tipo Credito', raw) || 'otros';
    generalesChipsHTML += `<div class="vitem"><div class="vi-label">Tipo de crédito</div><span class="chip ${claseDinamica}">${raw ?? 'N/A'}</span></div>`;
  }

  let generalesFechasHTML = '';
  if (idx['Fecha Firma'] != null) {
    const raw = fila[idx['Fecha Firma']];
    const val = FORMATOS_CAMPOS['Fecha Firma'] ? FORMATOS_CAMPOS['Fecha Firma'](raw) : (raw ?? 'N/A');
    generalesFechasHTML += `<div class="vitem"><div class="vi-label">Fecha de firma</div><div class="vi-value">${val}</div></div>`;
  }
  if (idx['Fecha Vencimiento'] != null) {
    const raw = fila[idx['Fecha Vencimiento']];
    const val = FORMATOS_CAMPOS['Fecha Vencimiento'] ? FORMATOS_CAMPOS['Fecha Vencimiento'](raw) : (raw ?? 'N/A');
    generalesFechasHTML += `<div class="vitem"><div class="vi-label">Fecha de vencimiento</div><div class="vi-value alert">${val}</div></div>`;
  }
  if (idx['Vencimiento LC'] != null) {
    const raw = fila[idx['Vencimiento LC']];
    generalesFechasHTML += `<div class="vitem"><div class="vi-label">Vencimiento LC</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }

  if (generalesChipsHTML || generalesFechasHTML) {
    htmlContent += `
      <div class="vgroup vgroup-light">
        <div class="vgroup-label"><span class="gicon"><span class="material-icons-round">category</span></span>Datos Generales</div>
        ${generalesChipsHTML ? `<div class="vgroup-row cols-2">${generalesChipsHTML}</div>` : ''}
        ${generalesFechasHTML ? `<div class="vgroup-row cols-3">${generalesFechasHTML}</div>` : ''}
      </div>
    `;
  }

  // ========== GRUPO: CONDICIONES FINANCIERAS ==========
  // ✅ CAMBIO 4: Monto con clase gold (código muerto eliminado) · Tasa con clase gold
  let condFinRow1 = '';
  if (idx['Monto'] != null) {
    const raw = fila[idx['Monto']];
    const val = FORMATOS_CAMPOS['Monto'] ? FORMATOS_CAMPOS['Monto'](raw) : (raw ?? 'N/A');
    condFinRow1 += `<div class="vitem"><div class="vi-label">Monto</div><div class="vi-value lg gold">${val}</div></div>`;
  }
  if (idx['Tasa'] != null) {
    const raw = fila[idx['Tasa']];
    const val = FORMATOS_CAMPOS['Tasa'] ? FORMATOS_CAMPOS['Tasa'](raw) : (raw ?? 'N/A');
    condFinRow1 += `<div class="vitem"><div class="vi-label">Tasa</div><div class="vi-value gold">${val}</div></div>`;
  }
  if (idx['Fecha de Solicitud'] != null) {
    const raw = fila[idx['Fecha de Solicitud']];
    const val = FORMATOS_CAMPOS['Fecha de Solicitud'] ? FORMATOS_CAMPOS['Fecha de Solicitud'](raw) : (raw ?? 'N/A');
    condFinRow1 += `<div class="vitem"><div class="vi-label">Fecha de solicitud</div><div class="vi-value">${val}</div></div>`;
  }

  let condFinRow2 = '';
  if (idx['Producto contratado'] != null) {
    const raw = fila[idx['Producto contratado']];
    condFinRow2 += `<div class="vitem"><div class="vi-label">Producto contratado</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }
  if (idx['Formalizacion'] != null) {
    const raw = fila[idx['Formalizacion']];
    condFinRow2 += `<div class="vitem"><div class="vi-label">Formalización</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }
  if (idx['$'] != null) {
    const raw = fila[idx['$']];
    condFinRow2 += `<div class="vitem"><div class="vi-label">$</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }

  let condFinRow3 = '';
  if (idx['Cantidad Letra'] != null) {
    const raw = fila[idx['Cantidad Letra']];
    condFinRow3 += `<div class="vitem"><div class="vi-label">Cantidad letra</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }
  if (idx['Observaciones MC'] != null) {
    const raw = fila[idx['Observaciones MC']];
    condFinRow3 += `<div class="vitem"><div class="vi-label">Observaciones MC</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }

  if (condFinRow1 || condFinRow2 || condFinRow3) {
    htmlContent += `
      <div class="vgroup vgroup-dark">
        <div class="vgroup-label"><span class="gicon"><span class="material-icons-round">payments</span></span>Condiciones financieras</div>
        ${condFinRow1 ? `<div class="vgroup-row cols-3">${condFinRow1}</div>` : ''}
        ${condFinRow2 ? `<div class="vgroup-row cols-3">${condFinRow2}</div>` : ''}
        ${condFinRow3 ? `<div class="vgroup-row cols-2">${condFinRow3}</div>` : ''}
      </div>
    `;
  }

  // ========== GRUPO: CALENDARIO DE PAGOS ==========
  let calPlazoHTML = '';
  if (idx['Plazo'] != null) {
    const raw = fila[idx['Plazo']];
    calPlazoHTML += `<div class="vitem"><div class="vi-label">Plazo</div><div class="vi-value">${raw ?? 'N/A'}</div></div>`;
  }
  if (idx['Fecha de corte'] != null) {
    const raw = fila[idx['Fecha de corte']];
    const val = FORMATOS_CAMPOS['Fecha de corte'] ? FORMATOS_CAMPOS['Fecha de corte'](raw) : (raw ?? 'N/A');
    calPlazoHTML += `<div class="vitem"><div class="vi-label">Fecha de corte</div><div class="vi-value">${val}</div></div>`;
  }

  const valorAI = (primerPagoAI || '').toString().trim() || 'N/A';
  const valorAJ = (ultimoPagoAJ || '').toString().trim() || 'N/A';

  htmlContent += `
    <div class="vgroup vgroup-dark">
      <div class="vgroup-label"><span class="gicon"><span class="material-icons-round">event_repeat</span></span>Calendario de pagos</div>
      ${calPlazoHTML ? `<div class="vgroup-row cols-2">${calPlazoHTML}</div>` : ''}
      <div class="vgroup-row cols-2">
        <div class="vitem acento-oro"><div class="vi-label">Primer pago de interés</div><div class="vi-value">${valorAI}</div></div>
        <div class="vitem acento-plata"><div class="vi-label">Último pago capital/interés</div><div class="vi-value">${valorAJ}</div></div>
      </div>
    </div>
  `;

  // ========== BARRA DE ACCIÓN ==========
  htmlContent += `
    <div class="action-bar">
      <div class="status-text">Estado: <b id="statusText">${yaValidado ? ('Validado · ' + fechaValidacionDisplay) : 'Pendiente de validación'}</b></div>
      <button id="marcarCheckbox" class="btn-validar ${yaValidado ? 'validado' : ''}" onclick="marcarCheckbox(${rowNumber})" ${yaValidado ? 'disabled' : ''}>
        <span class="icon material-icons-round">${yaValidado ? 'done' : 'verified'}</span>
        <span class="button-text">${yaValidado ? 'Validado' : 'Validar Solicitud'}</span>
      </button>
    </div>
    <div id="buttonMessage" class="status-message"></div>
  `;

  htmlContent += `</div>`; // .modal-body
  htmlContent += `</div>`; // .record-card

  return htmlContent;
}

function generarHTMLHeader(fila, idx) {
  const idxIDOpp = idx["ID Oportunidad"];
  let idOpp = 'N/A';
  if (idxIDOpp != null) {
    const idRaw = fila[idxIDOpp];
    if (idRaw) {
      const lineas = String(idRaw).split('\\n').filter(l => l.trim() !== '');
      idOpp = lineas.length ? lineas[lineas.length - 1].trim() : 'N/A';
    }
  }
  const numeroLinea = fila[CONFIG.INDICES.LINEA_CREDITO] ?? 'N/A';
  const clienteNombre = (idx['Cliente'] != null && fila[idx['Cliente']]) ? String(fila[idx['Cliente']]).trim() : '';

  return `
    <div class="modal-header">
      <div class="logo-box"><img src="${LOGO_CUALLI_URL}" alt="Cualli"></div>
      <div>
        <p class="eyebrow-light">Registro de ministración</p>
        <h2>Línea de crédito ${numeroLinea}</h2>
        ${clienteNombre ? `<p class="header-cliente">${clienteNombre}</p>` : ''}
        <div><span class="id-chip">ID ${idOpp}</span></div>
      </div>
    </div>
  `;
}

function generarJSModal(rowNumber) {
  return `
    async function marcarCheckbox(rowNumber) {
      const button = document.getElementById('marcarCheckbox');
      const buttonText = button.querySelector('.button-text');
      const icon = button.querySelector('.icon');
      const message = document.getElementById('buttonMessage');
      const ribbon = document.getElementById('ribbon');
      const statusText = document.getElementById('statusText');

      button.classList.add('loading'); button.disabled = true;
      icon.textContent = 'hourglass_top'; buttonText.textContent = 'Validando...';

      google.script.run
        .withSuccessHandler(function(result) {
          button.classList.remove('loading');
          if (result && result.success) {
            button.classList.add('validado');
            icon.textContent = 'done';
            buttonText.textContent = 'Validado';
            if (ribbon) { ribbon.classList.add('validado'); ribbon.textContent = 'Validado'; }
            if (statusText) {
              const hoy = new Date();
              const f = String(hoy.getDate()).padStart(2,'0') + '/' + String(hoy.getMonth()+1).padStart(2,'0') + '/' + hoy.getFullYear();
              statusText.textContent = 'Validado \u00b7 ' + f;
            }
            message.textContent = '';
          } else {
            button.disabled = false;
            button.classList.add('error');
            icon.textContent = 'error';
            buttonText.textContent = 'Error';
            message.innerHTML = '<span style="color:var(--alert)">' + (result && result.message ? result.message : 'Error') + '</span>';
            setTimeout(function(){ resetButton(button, icon, buttonText, message); }, 3000);
          }
        })
        .withFailureHandler(function(error) {
          button.classList.remove('loading'); button.disabled = false; button.classList.add('error');
          icon.textContent = 'error'; buttonText.textContent = 'Error';
          message.innerHTML = '<span style="color:var(--alert)">' + error.message + '</span>';
          setTimeout(function(){ resetButton(button, icon, buttonText, message); }, 3000);
        })
        .marcarCheckboxEnSheet(rowNumber);
    }

    function resetButton(button, icon, buttonText, message){
      button.classList.remove('error');
      icon.textContent='verified'; buttonText.textContent='Validar Solicitud';
      message.textContent=''; button.disabled=false;
    }
  `;
}

/* ============================================
   VALIDACIÓN
   ============================================ */
function marcarCheckboxEnSheet(rowNumber) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  try {
    const estadoActual = hoja.getRange(rowNumber, CONFIG.COLUMNAS.CHECKBOX).getValue();
    if (estadoActual === true) {
      return { success: false, message: "Esta línea ya fue marcada previamente" };
    }
    hoja.getRange(rowNumber, CONFIG.COLUMNAS.CHECKBOX).setValue(true);
    hoja.getRange(rowNumber, CONFIG.COLUMNAS.FECHA_VALIDACION).setValue(new Date());
    hoja.getRange(rowNumber, CONFIG.COLUMNAS.COLOR_INDICADOR).setBackground('white');
    return { success: true, message: "Línea marcada como revisada" };
  } catch (error) {
    Logger.log(error);
    return { success: false, message: "Error al procesar: " + error.message };
  }
}

/* ============================================
   ABRIR EN PESTAÑA DEL NAVEGADOR
   ============================================ */
function abrirEnVentanaCompleta(rowNumber) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  const lastRow = hoja.getLastRow();
  if (rowNumber < 2 || rowNumber > lastRow) {
    return { success: false, message: 'Número de fila inválido.' };
  }

  const lastCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const fila = hoja.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];

  const primerPagoAIDisplay = fila[CONFIG.INDICES.PRIMER_PAGO] || '';
  const ultimoPagoAJDisplay = fila[CONFIG.INDICES.ULTIMO_PAGO] || '';

  const htmlCompleto = `
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Validación - Línea ${fila[CONFIG.INDICES.LINEA_CREDITO] ?? 'N/A'}</title>
        ${fontsLinkHTML()}
        <style>
          ${generarCSSModal()}
          body{ padding:40px 60px; max-width:1240px; margin:0 auto; padding-top:80px; font-size:14.5px; }
          .info-banner{
            position:fixed; top:0; left:0; right:0; background:var(--gris); color:#fff;
            padding:12px 20px; text-align:center; font-size:13px; font-weight:500; z-index:9998;
            border-bottom:3px solid var(--gold); font-family:var(--font-sans);
          }
          .info-banner .material-icons-round{ vertical-align:middle; margin-right:8px; font-size:18px; color:var(--gold); }
          @media print{
            .info-banner, .action-bar{ display:none !important; }
            body{ padding-top:20px; }
          }
          @media (max-width:768px){
            body{ padding:60px 20px 20px 20px; }
            .info-banner{ padding:10px 15px; font-size:12px; }
          }
        </style>
      </head>
      <body>
        <div class="info-banner">
          <span class="material-icons-round">info</span>
          <span>Vista de solo lectura · La validación debe hacerse desde Google Sheets</span>
        </div>

        ${construirHTMLLinea(encabezados, fila, rowNumber, primerPagoAIDisplay, ultimoPagoAJDisplay, false)}

        <script>
          function marcarCheckbox(rowNumber) {
            alert('La validación solo está disponible desde el modal dentro de Google Sheets.\\n\\nEsta ventana es solo para visualización e impresión.');
          }
          document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') { e.preventDefault(); window.print(); }
          });
          document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') { if (confirm('¿Cerrar esta ventana?')) window.close(); }
          });
        <\/script>
      </body>
    </html>
  `;

  return { success: true, html: htmlCompleto };
}

/**
 * Muestra el detalle con botones de navegación (Siguiente/Anterior)
 */
function mostrarDetalleNavegable(arrayFilas, indiceActual) {
  const rowNumber = arrayFilas[indiceActual];
  const htmlFragmento = obtenerSoloContenidoFila(rowNumber);

  const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        ${fontsLinkHTML()}
        <style>
          ${generarCSSModal()}
          .material-icons-round{ font-family:'Material Icons Round' !important; }

          #loader-nav{
            display:none; position:fixed; top:70px; left:0; width:100%; height:calc(100% - 70px);
            background:rgba(241,238,228,.92); z-index:2000000;
            flex-direction:column; align-items:center; justify-content:center;
          }
          #loader-nav p{ font-family:var(--font-sans); font-weight:700; margin-top:10px; color:var(--ink); }

          #carruselSuperior{
            position:fixed; top:0; left:0; height:70px; width:50%;
            display:flex; align-items:center; padding-left:20px; z-index:1000001; gap:10px;
            background:linear-gradient(135deg,var(--gris) 0%, #3A3A3A 100%);
          }
          .btn-nav-c{
            background:transparent; border:1.5px solid rgba(253,185,19,.45); border-radius:8px; padding:6px 9px;
            cursor:pointer; color:var(--gold); display:flex; align-items:center;
          }
          .btn-nav-c:hover:not(:disabled){ background:rgba(253,185,19,.12); }
          .btn-nav-c:disabled{ opacity:.3; cursor:not-allowed; }
          .info-nav-c{
            background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.18); padding:5px 13px; border-radius:20px;
            font-family:var(--font-mono); font-weight:600; font-size:11px; color:#fff; letter-spacing:.03em;
          }

          body{ padding-top:0 !important; margin:0; }
          #container-dinamico{ transition:opacity .2s ease; }
        </style>
      </head>
      <body>
        <div id="loader-nav">
          <div class="spinner"></div>
          <p>Cargando expediente...</p>
        </div>

        <div id="carruselSuperior">
          <button id="pBtn" class="btn-nav-c" onclick="cambiar(numActual - 1)"><span class="material-icons-round">chevron_left</span></button>
          <div class="info-nav-c" id="contTxt">REGISTRO ${String(indiceActual + 1).padStart(2,'0')} / ${arrayFilas.length}</div>
          <button id="nBtn" class="btn-nav-c" onclick="cambiar(numActual + 1)"><span class="material-icons-round">chevron_right</span></button>
        </div>

        <div id="container-dinamico">
          ${htmlFragmento}
        </div>

        <script>
          let listaDeFilas = ${JSON.stringify(arrayFilas)};
          let numActual = ${indiceActual};

          function cambiar(newIdx) {
            if (newIdx < 0 || newIdx >= listaDeFilas.length) return;

            document.getElementById('loader-nav').style.display = 'flex';
            document.getElementById('container-dinamico').style.opacity = '0.4';

            google.script.run
              .withSuccessHandler(function(nuevoHtml) {
                numActual = newIdx;

                const wrapper = document.getElementById('container-dinamico');
                wrapper.innerHTML = nuevoHtml;

                document.getElementById('contTxt').textContent = "REGISTRO " + String(numActual + 1).padStart(2,'0') + " / " + listaDeFilas.length;
                document.getElementById('pBtn').disabled = (numActual === 0);
                document.getElementById('nBtn').disabled = (numActual === listaDeFilas.length - 1);

                document.getElementById('loader-nav').style.display = 'none';
                wrapper.style.opacity = '1';

                reproducirScripts(wrapper);
              })
              .obtenerSoloContenidoFila(listaDeFilas[newIdx]);
          }

          function reproducirScripts(contenedor) {
            const scripts = contenedor.querySelectorAll('script');
            scripts.forEach(oldScript => {
              const newScript = document.createElement('script');
              newScript.text = oldScript.text;
              document.body.appendChild(newScript).parentNode.removeChild(newScript);
            });
          }

          document.getElementById('pBtn').disabled = (numActual === 0);
          document.getElementById('nBtn').disabled = (numActual === listaDeFilas.length - 1);
        <\/script>
      </body>
    </html>
  `).setWidth(CONFIG.UI.MODAL_WIDTH).setHeight(CONFIG.UI.MODAL_HEIGHT);

  SpreadsheetApp.getUi().showModalDialog(html, 'Validación de Ministraciones');
}

/**
 * Devuelve el HTML de la ficha + el script del botón de validar
 */
function obtenerSoloContenidoFila(rowNumber) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.HOJAS.SOLICITUDES);
  const lastCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
  const fila = hoja.getRange(rowNumber, 1, 1, lastCol).getDisplayValues()[0];

  const htmlCartas = construirHTMLLinea(
    encabezados,
    fila,
    rowNumber,
    fila[CONFIG.INDICES.PRIMER_PAGO],
    fila[CONFIG.INDICES.ULTIMO_PAGO],
    true
  );

  return htmlCartas + "<script>" + generarJSModal(rowNumber) + "<\/script>";
}
