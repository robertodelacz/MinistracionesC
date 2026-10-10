/** === SIDEBAR: Buscador de Dispersiones === */
function mostrarSidebarDispersiones() {
  const ids = obtenerIDsUnicos();

  const html = HtmlService.createHtmlOutput(`
  <!DOCTYPE html>
  <html>
    <head>
      <base target="_top">
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
      <style>
        :root {
          --comic-black: #000;
          --comic-yellow: #FFD700;
          --comic-orange: #FF6B35;
          --comic-white: #FFF;
          --comic-gray: #F5F5F5;
          --comic-shadow: 4px 4px 0 var(--comic-black);
          --comic-border: 3px solid var(--comic-black);
        }
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        html, body { height: 100%; }
        
        body {
          margin: 0;
          padding: 0;
          background: var(--comic-white);
          font-family: 'Bangers', 'Arial Black', sans-serif;
        }
        
        .sidebar {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding: 24px 16px;
        }
        
        /* Header simple */
        .header-top {
          background: var(--comic-yellow);
          border: var(--comic-border);
          border-radius: 16px;
          padding: 20px;
          box-shadow: var(--comic-shadow);
        }
        
        .header-content {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .header-icon {
          width: 50px;
          height: 50px;
          background: var(--comic-white);
          border: var(--comic-border);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        
        .header-icon img {
          width: 40px;
          height: 40px;
        }
        
        .header-text h2 {
          margin: 0;
          font-size: 22px;
          font-weight: 900;
          color: var(--comic-black);
          letter-spacing: 0.5px;
        }
        
        .header-text p {
          margin: 4px 0 0 0;
          font-size: 12px;
          color: var(--comic-black);
          font-weight: 700;
          font-family: 'Arial', sans-serif;
        }
        
        /* Card principal */
        .main-card {
          background: var(--comic-white);
          border: var(--comic-border);
          border-radius: 16px;
          padding: 24px;
          box-shadow: var(--comic-shadow);
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-group label {
          display: block;
          margin: 0 0 10px 0;
          font-size: 14px;
          font-weight: 900;
          color: var(--comic-black);
          letter-spacing: 0.5px;
        }
        
        .input-wrapper {
          position: relative;
        }
        
        input {
          width: 100%;
          font-size: 15px;
          font-weight: 600;
          background: var(--comic-white);
          border: var(--comic-border);
          border-radius: 12px;
          padding: 14px 14px 14px 48px;
          color: var(--comic-black);
          font-family: 'Arial', sans-serif;
        }
        
        input:focus {
          outline: none;
          border-color: var(--comic-orange);
        }
        
        .input-icon {
          position: absolute;
          left: 16px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 22px;
          color: var(--comic-orange);
        }
        
        /* Botón simple */
        .btn {
          width: 100%;
          padding: 16px;
          border: var(--comic-border);
          border-radius: 12px;
          cursor: pointer;
          font-weight: 900;
          font-size: 16px;
          background: var(--comic-orange);
          color: var(--comic-white);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: var(--comic-shadow);
          font-family: 'Bangers', sans-serif;
          letter-spacing: 0.5px;
          text-shadow: 2px 2px 0 rgba(0,0,0,0.2);
        }
        
        .btn:hover {
          background: #FF8C42;
        }
        
        .btn:active {
          transform: translate(2px, 2px);
          box-shadow: 2px 2px 0 var(--comic-black);
        }
        
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .btn i {
          font-size: 20px;
        }

         /* Botón secundario (limpiar) */
        .btn-secondary {
          background: var(--comic-gray);
          color: var(--comic-black);
          text-shadow: none;
          margin-top: 12px;
        }
        
        .btn-secondary:hover {
          background: #e0e0e0;
        }
        
        /* Loading simple */
        .loading {
          display: none;
          text-align: center;
          padding: 24px;
          background: var(--comic-gray);
          border: var(--comic-border);
          border-radius: 12px;
          margin-top: 20px;
          box-shadow: var(--comic-shadow);
        }
        
        .loading-content {
          display: inline-flex;
          flex-direction: column;
          align-items: center;
        }
        
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid var(--comic-yellow);
          border-top: 4px solid var(--comic-black);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 12px;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .loading-content p {
          font-size: 14px;
          font-weight: 900;
          color: var(--comic-black);
          letter-spacing: 0.5px;
        }
        
        /* Sugerencias simples */
        .suggestions {
          position: absolute;
          inset-inline: 0;
          top: calc(100% + 8px);
          background: var(--comic-white);
          border: var(--comic-border);
          border-radius: 12px;
          box-shadow: var(--comic-shadow);
          max-height: 240px;
          overflow: auto;
          z-index: 9999;
          display: none;
          list-style: none;
          padding: 6px;
          margin: 0;
        }
        
        .suggestions li {
          padding: 10px 12px;
          cursor: pointer;
          user-select: none;
          font-size: 14px;
          font-weight: 700;
          border-radius: 8px;
          color: var(--comic-black);
          font-family: 'Arial', sans-serif;
          border: 2px solid transparent;
        }
        
        .suggestions li:hover {
          background: var(--comic-yellow);
          border: 2px solid var(--comic-black);
        }
      </style>
    </head>
    <body>
      <div class="sidebar">
        <!-- Header Superior -->
        <div class="header-top">
          <div class="header-content">
            <div class="header-icon">
              <img src="https://img.icons8.com/?size=100&id=63647&format=png&color=000000" alt="Icono">
            </div>
            <div class="header-text">
              <h2>Alta de Lineas</h2>
              <p>Consulta de Registros</p>
            </div>
          </div>
        </div>

        <!-- Card Principal -->
        <div class="main-card">
          <div class="form-group">
            <label for="idInput">🔍 ID de Línea / Oportunidad</label>
            <div class="input-wrapper">
              <i class="material-icons-round input-icon">search</i>
              <input id="idInput" type="text" placeholder="Escribe un ID..." autocomplete="off">
              <ul id="idSuggestions" class="suggestions"></ul>
            </div>
          </div>

          <button id="btnBuscar" class="btn" onclick="buscarDispersion()">
            <i class="material-icons-round">search</i>
            <span>Ver Información</span>
          </button>

          <button id="btnLimpiar" class="btn btn-secondary" onclick="limpiarSeleccion()">
            <i class="material-icons-round">clear</i>
            <span>Limpiar</span>
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
        var IDS_CACHE = ${JSON.stringify(ids)};

        // Autocompletado
        (function(){
          var input = document.getElementById('idInput');
          var wrap = input.parentElement;
          var list = document.getElementById('idSuggestions');
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
              if (showTopWhenEmpty && IDS_CACHE && IDS_CACHE.length) {
                buildList(IDS_CACHE.slice(0, 50));
              } else {
                list.style.display = 'none';
              }
              return;
            }
            var data = IDS_CACHE
              .filter(function(x){ return String(x).toLowerCase().indexOf(qn) !== -1; })
              .slice(0, 50);
            buildList(data);
          }

          input.addEventListener('input', function(e){ renderSuggestions(e.target.value, false); });
          input.addEventListener('focus', function(){ renderSuggestions(input.value, true); });
          input.addEventListener('keydown', function(e){
            if (e.key === 'Escape') list.style.display = 'none';
            if (e.key === 'Enter') document.getElementById('btnBuscar').click();
          });
          document.addEventListener('click', function(e){
            if (!wrap.contains(e.target)) list.style.display = 'none';
          });
        })();

        function buscarDispersion() {
          var btn = document.getElementById('btnBuscar');
          var loading = document.getElementById('loading');
          var idValue = document.getElementById('idInput').value.trim();

          if (!idValue) {
            alert('Por favor ingresa un ID de línea');
            return;
          }

          btn.disabled = true;
          loading.style.display = 'block';

          google.script.run
            .withSuccessHandler(function(result){
              btn.disabled = false;
              loading.style.display = 'none';
              if (!result || !result.found) {
                alert('No se encontró ningún registro con el ID: ' + idValue);
              }
            })
            .withFailureHandler(function(error){
              btn.disabled = false;
              loading.style.display = 'none';
              alert('Error: ' + error.message);
            })
            .mostrarDetalleDispersion(idValue);
        }

        function limpiarSeleccion() {
          var input = document.getElementById('idInput');
          var list = document.getElementById('idSuggestions');
          input.value = '';
          list.style.display = 'none';
          input.focus();
        }
      </script>
    </body>
  </html>
  `).setTitle('🔍 Buscador Dispersiones').setWidth(400);

  SpreadsheetApp.getUi().showSidebar(html);
}

/** === OBTENER IDs ÚNICOS (columna A) === */
function obtenerIDsUnicos() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('IDS_DISPERSION');
  if (cached) return JSON.parse(cached);

  var hoja = SpreadsheetApp.getActive().getSheetByName("REGISTRO DISPERSION");
  var lastRow = hoja.getLastRow();
  if (lastRow < 3) return [];

  var datos = hoja.getRange(3, 1, lastRow - 2, 1).getValues();

  var set = {};
  for (var i = 0; i < datos.length; i++) {
    var v = (datos[i][0] + '').trim();
    if (v && v !== '–' && v !== '-') set[v] = true;
  }
  var arr = Object.keys(set).sort();
  cache.put('IDS_DISPERSION', JSON.stringify(arr), 1800);
  return arr;
}

/** === BUSCAR Y MOSTRAR DETALLE === */
function mostrarDetalleDispersion(idBuscado) {
  const hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("REGISTRO DISPERSION");
  const lastRow = hoja.getLastRow();
  const lastCol = hoja.getLastColumn();

  if (lastRow < 3) return { found: false };

  // Buscar todas las filas con ese ID
  const colA = hoja.getRange(3, 1, lastRow - 2, 1).getValues();
  const filasDelBloque = [];

  for (let i = 0; i < colA.length; i++) {
    const val = String(colA[i][0] || '').trim();
    if (val === idBuscado) {
      filasDelBloque.push(i + 3);
    }
  }

  if (filasDelBloque.length === 0) return { found: false };

  // Leer encabezados
  const encabezados = hoja.getRange(2, 1, 1, lastCol).getDisplayValues()[0];

  // Leer primera fila del bloque (datos principales A-N)
  const primeraFila = filasDelBloque[0];
  const datosPrincipales = hoja.getRange(primeraFila, 1, 1, 14).getDisplayValues()[0];

  // Leer todas las filas del bloque (dispersiones O-V y observaciones W)
  const dispersiones = [];
  for (const fila of filasDelBloque) {
    const rowData = hoja.getRange(fila, 15, 1, 8).getDisplayValues()[0];
    dispersiones.push(rowData);
  }

  // Observaciones (columna W = 23)
  const observaciones = hoja.getRange(primeraFila, 23).getDisplayValue() || '';

  // Construir HTML del modal
  const htmlContent = construirHTMLDispersion(encabezados, datosPrincipales, dispersiones, observaciones, idBuscado);

    const html = HtmlService.createHtmlOutput(`
    <!DOCTYPE html>
    <html>
      <head>
        <base target="_top">
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
      </head>
      <body>
        ${htmlContent}
        <script>
          function descargarComoJPEG() {
            const boton = document.getElementById('btnDescargar');
            boton.disabled = true;
            boton.innerHTML = '<i class="material-icons">hourglass_top</i> Generando...';
            
            const contenedor = document.getElementById('contenido-completo');
            
            html2canvas(contenedor, {
              scale: 2,
              backgroundColor: '#f8fafc',
              logging: false,
              useCORS: true
            }).then(function(canvas) {
              canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = 'Dispersion_${idBuscado}_' + new Date().getTime() + '.jpg';
                link.href = url;
                link.click();
                URL.revokeObjectURL(url);
                
                boton.disabled = false;
                boton.innerHTML = '<i class="material-icons">download</i> Descargar JPEG';
              }, 'image/jpeg', 0.95);
            }).catch(function(error) {
              console.error('Error al generar imagen:', error);
              alert('Error al generar la imagen');
              boton.disabled = false;
              boton.innerHTML = '<i class="material-icons">download</i> Descargar JPEG';
            });
          }
        </script>
      </body>
    </html>
  `).setWidth(950).setHeight(750);

  SpreadsheetApp.getUi().showModalDialog(html, 'Detalle de Dispersión');
  return { found: true };
}

/** === CONSTRUIR HTML DEL MODAL === */
function construirHTMLDispersion(encabezados, datosPrincipales, dispersiones, observaciones, idBuscado) {
  
  const formatoMoneda = (valor) => {
    if (!valor || valor === '–' || valor === '-') return valor || 'N/A';
    const limpio = String(valor).replace(/[$,]/g, '').trim();
    const n = Number(limpio);
    return isNaN(n) ? valor : n.toLocaleString('es-MX', {
      style: 'currency', currency: 'MXN', minimumFractionDigits: 2
    });
  };

  const formatoPorcentaje = (valor) => {
    if (!valor || valor === '–' || valor === '-') return valor || 'N/A';
    if (String(valor).includes('%')) return valor;
    const n = Number(String(valor).replace('%', '').trim());
    return isNaN(n) ? valor : n.toFixed(2) + '%';
  };

  const formatoPlazo = (valor) => {
    if (!valor || valor === '–' || valor === '-') return 'N/A';
    const num = String(valor).trim();
    return `${num} meses`;
  };

  // Encabezados principales (A-N)
  const camposPrincipales = [
    { nombre: "Acreditado", idx: 1 },
    { nombre: "Producto", idx: 2 },
    { nombre: "ID Oportunidad", idx: 3 },
    { nombre: "Tipo Crédito", idx: 4 },
    { nombre: "Régimen", idx: 5 },
    { nombre: "Formalización", idx: 6 },
    { nombre: "Monto LC", idx: 7, formato: formatoMoneda },
    { nombre: "Tasa", idx: 8, formato: formatoPorcentaje },
    { nombre: "Comisión", idx: 9, formato: formatoPorcentaje },
    { nombre: "Gravamen", idx: 10 },
    { nombre: "Fecha Firma", idx: 11 },
    { nombre: "Plazo", idx: 12, formato: formatoPlazo },
    { nombre: "Fecha Vencimiento", idx: 13 }
  ];

  let html = `
    <style>
      :root {
        --primary: #4a6bff; --primary-light: #eef1ff; --primary-dark: #3a56cc;
        --text-dark: #2d3436; --text-medium: #636e72; --bg-light: #f8fafc;
        --bg-card: #ffffff; --border: #dfe6e9;
        --shadow: 0 20px 40px -10px rgba(0,0,0,0.1);
        --radius: 16px;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Poppins','Roboto', sans-serif; }
      body { background-color: var(--bg-light); color: var(--text-dark); line-height: 1.6; padding: 24px; }

      /* Botón descargar JPEG */
      .btn-descargar {
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 14px 24px;
        background: linear-gradient(135deg, #00b894 0%, #00cec9 100%);
        color: white;
        border: 3px solid #000;
        border-radius: 12px;
        box-shadow: 4px 4px 0 #000;
        cursor: pointer;
        font-weight: 700;
        font-size: 15px;
        display: flex;
        align-items: center;
        gap: 8px;
        z-index: 1000;
        font-family: 'Poppins', sans-serif;
        transition: all 0.2s;
      }
      .btn-descargar:hover {
        background: linear-gradient(135deg, #00cec9 0%, #00b894 100%);
        transform: translate(-2px, -2px);
        box-shadow: 6px 6px 0 #000;
      }
      .btn-descargar:active {
        transform: translate(2px, 2px);
        box-shadow: 2px 2px 0 #000;
      }
      .btn-descargar:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .btn-descargar i {
        font-size: 20px;
      }

      .header {
        text-align: center; margin-bottom: 30px;
        background: linear-gradient(135deg, #667eea 0%, #1A1A2E 100%);
        border: 4px solid #000; border-radius: 20px;
        box-shadow: 8px 8px 0 rgba(0,0,0,0.2); padding: 25px 20px;
      }
      .header h2 {
        background: white; padding: 15px 25px; border: 4px solid #000;
        border-radius: 10px; display: inline-block;
        box-shadow: 4px 4px 0 rgba(0,0,0,0.2); margin-bottom: 15px;
        font-size: 22px; font-weight: 800; text-transform: uppercase;
      }
      .header .subtitle { color: white; font-size: 16px; }
      .header .subtitle span { color: #FFD700; font-weight: 700; }

      .card-group { margin-bottom: 30px; }
      .group-header {
        display: flex; align-items: center; margin-bottom: 15px; padding-left: 10px;
      }
      .group-icon {
        width: 40px; height: 40px; background: rgba(74,107,255,.1);
        border-radius: 50%; display: flex; align-items: center;
        justify-content: center; margin-right: 12px;
      }
      .group-icon i { color: var(--primary); font-size: 20px; }
      .card-group h3 { font-weight: 600; color: var(--text-dark); font-size: 18px; }

      .card-container { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; }
      .info-card {
        border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow);
        transition: all 0.3s ease; min-height: 100px;
      }
      .info-card:hover { transform: translateY(-3px); }
      .card-content {
        padding: 16px; height: 100%; display: flex; flex-direction: column; justify-content: center;
      }
      .info-label {
        font-size: 15px; color: rgba(255,255,255,.85); margin-bottom: 6px;
        font-weight: 500; letter-spacing: .5px; text-transform: uppercase;
      }
      .info-value { font-size: 14px; color: #fff; font-weight: 600; word-break: break-word; }
      .info-value.empty { color: rgba(255,255,255,.6); font-style: italic; }
      .highlight-value { font-size: 16px; font-weight: 700; }

      .bg-principal { background: linear-gradient(135deg, #2d3436 0%, #636e72 100%); }
      .bg-monto { background: linear-gradient(135deg, #701C83 0%, #701C83 100%); }
      .bg-fecha { background: linear-gradient(135deg, #FF7B1C 0%, #FF7B1C 100%); }

      .tabla-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px; flex-wrap: wrap; gap: 10px;
      }

      .badge-total {
        display: inline-flex; align-items: center; gap: 16px;
        background: #1A1A2E; color: white; padding: 14px 22px; border-radius: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3), 0 0 0 2px #FF6B35, 0 2px 0 0 #FFD166;
        border: 2px solid #FFD166; position: relative; overflow: hidden;
        font-family: 'Segoe UI', sans-serif;
      }

      .badge-total-text {
        display: flex; flex-direction: column; align-items: flex-start;
        position: relative; z-index: 1;
      }

      .badge-total .label {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 1px; color: #FFD166; margin-bottom: 4px;
        background: rgba(255,107,53,0.15); padding: 2px 8px;
        border-radius: 4px; border: 1px solid rgba(255,107,53,0.4);
      }

      .badge-total .monto {
        font-family: 'Roboto Mono', monospace; font-size: 22px;
        font-weight: 800; letter-spacing: -0.5px; color: #FFFFFF;
        text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
      }

      .tabla-container {
        background: white; border-radius: 20px; overflow: hidden;
        box-shadow: 0 10px 40px rgba(0,0,0,0.12); border: 3px solid #1a1a2e;
      }
      .tabla-dispersiones {
        width: 100%; border-collapse: separate; border-spacing: 0;
        font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; font-size: 15px;
        table-layout: fixed;
      }
      .tabla-dispersiones thead { position: sticky; top: 0; z-index: 10; }
      .tabla-dispersiones th {
        background: linear-gradient(180deg, #1a1a2e 0%, #16213e 100%);
        color: #fff; padding: 14px 10px; text-align: left;
        font-weight: 700; text-transform: uppercase; font-size: 10px;
        letter-spacing: 0.5px; border-bottom: 4px solid #e94560;
        overflow: hidden; text-overflow: ellipsis;
      }
      .tabla-dispersiones th:first-child { border-radius: 16px 0 0 0; }
      .tabla-dispersiones th:last-child { border-radius: 0 16px 0 0; }
      .tabla-dispersiones th i {
        vertical-align: middle; margin-right: 4px; font-size: 14px; opacity: 0.9;
      }
      
      .tabla-dispersiones th:nth-child(1),
      .tabla-dispersiones td:nth-child(1) { width: 10%; }
      .tabla-dispersiones th:nth-child(2),
      .tabla-dispersiones td:nth-child(2) { width: 12%; }
      .tabla-dispersiones th:nth-child(3),
      .tabla-dispersiones td:nth-child(3) { width: 25%; }
      .tabla-dispersiones th:nth-child(4),
      .tabla-dispersiones td:nth-child(4) { width: 15%; }
      .tabla-dispersiones th:nth-child(5),
      .tabla-dispersiones td:nth-child(5) { width: 20%; }
      .tabla-dispersiones th:nth-child(6),
      .tabla-dispersiones td:nth-child(6) { width: 18%; }
      
      .tabla-dispersiones td {
        padding: 12px 10px; border-bottom: 1px solid #e8e8e8;
        vertical-align: middle; color: #2d3436; font-weight: 500;
        transition: all 0.2s ease; overflow: hidden; text-overflow: ellipsis;
      }
      .tabla-dispersiones tbody tr { background: #fff; transition: all 0.25s ease; }
      .tabla-dispersiones tbody tr:nth-child(odd) { background: #f8fafc; }
      .tabla-dispersiones tbody tr:hover {
        background: linear-gradient(90deg, #fff5f5 0%, #fef3e2 100%);
        transform: scale(1.005); box-shadow: 0 4px 15px rgba(233,69,96,0.15);
      }
      .tabla-dispersiones tbody tr:last-child td:first-child { border-radius: 0 0 0 16px; }
      .tabla-dispersiones tbody tr:last-child td:last-child { border-radius: 0 0 16px 0; }
      
      .col-solicitud { font-weight: 700; color: #1a1a2e !important; font-size: 12px; text-align: center; }
      .col-fecha { color: #e94560 !important; font-weight: 600; white-space: nowrap; font-size: 11px; }
      .col-monto { font-weight: 700; color: #00b894 !important; font-family: 'Roboto Mono', monospace; font-size: 13px; white-space: nowrap; }
      .col-concepto { line-height: 1.4; font-size: 12px; }
      .col-comentarios { font-size: 11px; color: #636e72 !important; line-height: 1.4; }
      .col-beneficiario { font-weight: 600; color: #6c5ce7 !important; font-size: 12px; }
      .celda-vacia { color: #b2bec3 !important; font-style: italic; font-weight: 400; text-align: center; }
      
      .badge-retenida {
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white; padding: 4px 8px; border-radius: 20px;
        font-size: 9px; font-weight: 700; text-transform: uppercase;
        letter-spacing: 0.3px; display: inline-block;
        box-shadow: 0 2px 8px rgba(238,90,36,0.3);
      }

      .obs-card {
        background: linear-gradient(135deg, #ffeaa7 0%, #fdcb6e 100%);
        border: 3px solid #000; border-radius: var(--radius);
        padding: 20px; box-shadow: 6px 6px 0 rgba(0,0,0,0.15);
      }
      .obs-card h4 {
        margin-bottom: 10px; font-size: 14px; text-transform: uppercase;
        display: flex; align-items: center; gap: 8px;
      }
      .obs-card p { font-size: 14px; line-height: 1.6; white-space: pre-wrap; }

      @media (max-width: 768px) {
        .card-container { grid-template-columns: repeat(2, 1fr); }
      }
    </style>

    <button id="btnDescargar" class="btn-descargar" onclick="descargarComoJPEG()">
      <i class="material-icons">download</i>
      Generar Captura
    </button>

    <div id="contenido-completo">

    <div class="header">
        <h2><i class="material-icons" style="vertical-align:middle;">account_balance</i> Detalle de Dispersión</h2>
      <p class="subtitle">ID Línea: <span>${idBuscado}</span></p>
    </div>

    <!-- BLOQUE 1: Datos Principales -->
    <section class="card-group">
      <div class="group-header">
        <div class="group-icon"><i class="material-icons">person</i></div>
        <h3>Datos del Crédito</h3>
      </div>
      <div class="card-container">
  `;

  // Tarjetas de datos principales
  camposPrincipales.forEach(campo => {
    let valor = datosPrincipales[campo.idx] || '';
    if (valor === '–' || valor === '-') valor = '';
    if (campo.formato && valor) valor = campo.formato(valor);
    
    let claseExtra = 'bg-principal';
    if (campo.nombre.includes('Monto') || campo.nombre.includes('Tasa') || campo.nombre.includes('Comisión')) {
      claseExtra = 'bg-monto';
    } else if (campo.nombre.includes('Fecha')) {
      claseExtra = 'bg-fecha';
    }

    html += `
      <div class="info-card ${claseExtra}">
        <div class="card-content">
          <div class="info-label">${campo.nombre}</div>
          <div class="info-value ${!valor ? 'empty' : ''} ${campo.nombre.includes('Monto') ? 'highlight-value' : ''}">${valor || 'N/A'}</div>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </section>

    <!-- BLOQUE 2: Tabla de Dispersiones -->
    <section class="card-group">
      <div class="group-header">
        <div class="group-icon"><i class="material-icons">receipt_long</i></div>
        <h3>Detalle de Dispersiones (${dispersiones.length} registro${dispersiones.length > 1 ? 's' : ''})</h3>
      </div>
      
      <div class="tabla-header">
        <div></div>
        <div class="badge-total">
          <div class="badge-total-text">
            <span class="label">💰 Total Dispersado</span>
            <span class="monto">${(() => {
              let suma = 0;
              dispersiones.forEach(row => {
                const val = row[3] || '';
                if (val && !String(val).toUpperCase().includes('RETENIDA')) {
                  const limpio = String(val).replace(/[$,]/g, '').trim();
                  const num = parseFloat(limpio);
                  if (!isNaN(num)) suma += num;
                }
              });
              return suma.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 });
            })()}</span>
          </div>
        </div>
      </div>
      
      <div class="tabla-container">
        <table class="tabla-dispersiones">
          <thead>
            <tr>
              <th><i class="material-icons">tag</i>No. Solicitud</th>
              <th><i class="material-icons">event</i>Fecha</th>
              <th><i class="material-icons">description</i>Concepto</th>
              <th><i class="material-icons">payments</i>Monto</th>
              <th><i class="material-icons">chat</i>Comentarios</th>
              <th><i class="material-icons">person</i>Beneficiario</th>
            </tr>
          </thead>
          <tbody>
  `;

  // Filas de dispersiones
  dispersiones.forEach(row => {
    html += '<tr>';
    for (let i = 0; i <= 5; i++) {
      let val = row[i] || '';
      let clase = '';
      let esVacio = !val || val === '–' || val === '-';
      const esRetenida = String(val).toUpperCase().includes('RETENIDA');
      
      switch(i) {
        case 0: clase = 'col-solicitud'; break;
        case 1: clase = 'col-fecha'; break;
        case 2: clase = 'col-concepto'; break;
        case 3: 
          clase = 'col-monto';
          if (val && !esRetenida) val = formatoMoneda(val);
          break;
        case 4: clase = 'col-comentarios'; break;
        case 5: 
          clase = 'col-beneficiario';
          if (esRetenida) val = '<span class="badge-retenida">Retenida por Cualli</span>';
          break;
      }
      
      if (esVacio && !esRetenida) {
        html += '<td class="' + clase + ' celda-vacia">—</td>';
      } else {
        html += '<td class="' + clase + '">' + val + '</td>';
      }
    }
    html += '</tr>';
  });

  html += `
          </tbody>
        </table>
      </div>
    </section>
  `;

  // BLOQUE 3: Observaciones
  if (observaciones && observaciones.trim()) {
    html += `
      <section class="card-group">
        <div class="obs-card">
          <h4><i class="material-icons">comment</i> Observaciones</h4>
          <p>${observaciones}</p>
        </div>
      </section>
    `;
  }

  html += `</div>`; // ← AGREGA ESTA LÍNEA para cerrar contenido-completo

  return html;
}
