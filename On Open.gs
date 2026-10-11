function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📊 Herramientas de Validacion')
    .addItem('🔍 Buscar', 'mostrarSidebarLineas')
    .addItem('📈 KPIs Desembolsos', 'mostrarDashboardKPIs')
    .addSeparator()
    .addItem('Calculo Pagos', 'recalcularPagos_Bulk')
    .addSubMenu(traspasosMenu_())

    .addToUi();
}

function mostrarDashboardKPIs() {
  const html = HtmlService.createHtmlOutputFromFile('desembolsos')
    .setWidth(1200)
    .setHeight(1000);
  SpreadsheetApp.getUi().showSidebar(html);
}

function mostrarVistaPreviaDesembolso(htmlContent) {
  const output = HtmlService.createHtmlOutput(htmlContent)
    .setWidth(600)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(output, '📤 Vista previa de resultado');
}

function obtenerDescripcionFiltro(filtro) {
  const f = (d) => {
    const [y, m, d2] = d.split('-');
    return `${d2}/${m}/${y}`;
  };
  switch (filtro.tipo) {
    case 'dia': return `Fecha: ${f(filtro.desde)}`;
    case 'rango': return `Del ${f(filtro.desde)} al ${f(filtro.hasta)}`;
    case 'mes_anio': return `Mes: ${filtro.mes} / Año: ${filtro.anio}`;
    case 'anio': return `Año: ${filtro.anio}`;
    default: return '';
  }
}




// 🕒 Función CORREGIDA para validar fechas con manejo de zona horaria
function esFechaValidaPorFiltro(fecha, filtro) {
  if (!fecha || !(fecha instanceof Date)) return false;
  
  try {
    // Configurar la zona horaria (ej. 'America/Mexico_City' para UTC-6)
    const timezone = 'America/Mexico_City';
    
    // Normalizar la fecha de la hoja de cálculo
    const fechaNormalizada = new Date(Utilities.formatDate(fecha, timezone, 'yyyy-MM-dd'));
    
    if (filtro.tipo === 'dia') {
      const desde = new Date(filtro.desde);
      desde.setHours(0, 0, 0, 0);
      return Utilities.formatDate(fechaNormalizada, timezone, 'yyyy-MM-dd') === 
             Utilities.formatDate(desde, timezone, 'yyyy-MM-dd');
    }

    if (filtro.tipo === 'rango') {
      const desde = new Date(filtro.desde);
      const hasta = new Date(filtro.hasta);
      desde.setHours(0, 0, 0, 0);
      hasta.setHours(23, 59, 59, 999); // Incluir todo el día final
      
      return fechaNormalizada >= desde && fechaNormalizada <= hasta;
    }

    if (filtro.tipo === 'mes_anio') {
      const mesFiltro = parseInt(filtro.mes);
      const anioFiltro = parseInt(filtro.anio);
      
      return (fecha.getMonth() + 1 === mesFiltro) && 
             (fecha.getFullYear() === anioFiltro);
    }

    if (filtro.tipo === 'anio') {
      return fecha.getFullYear() === parseInt(filtro.anio);
    }
  } catch (e) {
    console.error('Error en esFechaValidaPorFiltro:', e);
    return false;
  }

  return false;
}

// 🟦 Monto Dispersado
function calcularMontoDispersado(filtro) {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Solicitudes2026');
  const datos = hoja.getDataRange().getValues();

  let totalMX = 0, totalUSD = 0;
  let conteoMX = 0, conteoUSD = 0;

  datos.slice(1).forEach(row => {
    const fecha = row[2];
    const monto = parseFloat((row[3] + '').replace(/,/g, '')) || 0;
    const moneda = (row[4] + '').toUpperCase().trim();

    if (!(fecha instanceof Date) || isNaN(fecha)) return;
    if (!esFechaValidaPorFiltro(fecha, filtro)) return;

    if (filtro.moneda === 'MX' && moneda === 'MX') {
      totalMX += monto;
      conteoMX++;
    } else if (filtro.moneda === 'USD' && moneda === 'USD') {
      totalUSD += monto;
      conteoUSD++;
    } else if (filtro.moneda === 'ambos') {
      if (moneda === 'MX') {
        totalMX += monto;
        conteoMX++;
      } else if (moneda === 'USD') {
        totalUSD += monto;
        conteoUSD++;
      }
    }
  });

  return {
  mx: totalMX,
  usd: totalUSD,
  cantidad: conteoMX + conteoUSD,
  conteoMX: conteoMX,
  conteoUSD: conteoUSD
};

}


// 🟦 Top Clientes por monto
function obtenerTopClientes(filtro) {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Solicitudes2026');
  const datos = hoja.getDataRange().getValues();
  const acumulado = {};

  datos.slice(1).forEach(row => {
    const fecha = row[2];
    const cliente = (row[1] + '').trim();
    const id = (row[12] + '').trim(); // columna M
    const monto = parseFloat((row[3] + '').replace(/,/g, '')) || 0;
    const moneda = (row[4] + '').toUpperCase().trim();

    if (!(fecha instanceof Date) || !esFechaValidaPorFiltro(fecha, filtro)) return;

    if (
      (filtro.moneda === 'MX' && moneda !== 'MX') ||
      (filtro.moneda === 'USD' && moneda !== 'USD')
    ) return;

    const clave = cliente + '-' + id;
    acumulado[clave] = (acumulado[clave] || 0) + monto;
  });

  const lista = Object.entries(acumulado).map(([clave, monto]) => {
    const [cliente, id] = clave.split('-');
    return { cliente, id, monto };
  });

  lista.sort((a, b) => b.monto - a.monto);
  
  // Cambia esta línea para usar el parámetro del filtro
  return lista.slice(0, filtro.numClientes || 10); // Usa numClientes del filtro o 10 por defecto
}

// 🟦 Promedio de desembolsos
function calcularPromedioDesembolso(filtro) {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Solicitudes2026');
  const datos = hoja.getDataRange().getValues();

  let totalMX = 0, totalUSD = 0;
  let conteoMX = 0, conteoUSD = 0;

  datos.slice(1).forEach(row => {
    const fecha = row[2];
    const monto = parseFloat((row[3] + '').replace(/,/g, '')) || 0;
    const moneda = (row[4] + '').toUpperCase().trim();

    if (!(fecha instanceof Date) || !esFechaValidaPorFiltro(fecha, filtro)) return;

    if (filtro.moneda === 'MX' && moneda === 'MX') {
      totalMX += monto;
      conteoMX++;
    } else if (filtro.moneda === 'USD' && moneda === 'USD') {
      totalUSD += monto;
      conteoUSD++;
    } else if (filtro.moneda === 'ambos') {
      if (moneda === 'MX') {
        totalMX += monto;
        conteoMX++;
      } else if (moneda === 'USD') {
        totalUSD += monto;
        conteoUSD++;
      }
    }
  });

  return {
    mx: conteoMX > 0 ? totalMX / conteoMX : 0,
    usd: conteoUSD > 0 ? totalUSD / conteoUSD : 0,
    cantidad: conteoMX + conteoUSD
  };
}

function calcularMinMaxDesembolso(filtro) {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Solicitudes2026');
  const datos = hoja.getDataRange().getValues();

  let minMX = null, maxMX = null, clienteMinMX = '', clienteMaxMX = '';
  let minUSD = null, maxUSD = null, clienteMinUSD = '', clienteMaxUSD = '';

  datos.slice(1).forEach(row => {
    const fecha = row[2]; // Columna C
    const cliente = row[1]; // Columna B
    const monto = parseFloat((row[3] + '').replace(/,/g, '')) || 0; // Columna D
    const moneda = (row[4] + '').toUpperCase().trim(); // Columna E

    if (!(fecha instanceof Date) || !esFechaValidaPorFiltro(fecha, filtro)) return;

    // MXN
    if (filtro.moneda === 'MX' || filtro.moneda === 'ambos') {
      if (moneda === 'MX') {
        if (minMX === null || monto < minMX) {
          minMX = monto;
          clienteMinMX = cliente;
        }
        if (maxMX === null || monto > maxMX) {
          maxMX = monto;
          clienteMaxMX = cliente;
        }
      }
    }

    // USD
    if (filtro.moneda === 'USD' || filtro.moneda === 'ambos') {
      if (moneda === 'USD') {
        if (minUSD === null || monto < minUSD) {
          minUSD = monto;
          clienteMinUSD = cliente;
        }
        if (maxUSD === null || monto > maxUSD) {
          maxUSD = monto;
          clienteMaxUSD = cliente;
        }
      }
    }
  });

  return {
    minMX: minMX || 0,
    maxMX: maxMX || 0,
    clienteMinMX: clienteMinMX || 'N/A',
    clienteMaxMX: clienteMaxMX || 'N/A',
    minUSD: minUSD || 0,
    maxUSD: maxUSD || 0,
    clienteMinUSD: clienteMinUSD || 'N/A',
    clienteMaxUSD: clienteMaxUSD || 'N/A'
  };
}
