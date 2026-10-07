/**
 * Mis Finanzas — API de solo lectura sobre la planilla "Finanzas personales".
 *
 * Se pega en Extensiones > Apps Script de la planilla y se publica como
 * aplicación web (Ejecutar como: yo · Acceso: cualquier persona).
 * El token se guarda en Configuración del proyecto > Propiedades del script,
 * con el nombre API_TOKEN. No va en el repo.
 *
 * La app no calcula nada: este script devuelve los valores tal como están en la
 * planilla (números y fechas con getValues) junto con el tipo de formato de
 * cada columna o celda ('ars', 'usd', 'pct', 'num', 'mes', 'fecha', 'txt'),
 * para que la app los muestre igual que la planilla.
 */

var VERSION = 1;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var esperado = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!esperado) return json_({ ok: false, status: 500, error: 'Falta la propiedad API_TOKEN en el script.' });
  if (!iguales_(String(params.token || ''), esperado)) return json_({ ok: false, status: 403, error: 'Token incorrecto.' });

  try {
    return json_(leerTodo_());
  } catch (err) {
    return json_({ ok: false, status: 500, error: String(err && err.message || err) });
  }
}

function leerTodo_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var hojas = {};
  ss.getSheets().forEach(function (h) { hojas[h.getName()] = h; });

  function hoja(nombre) {
    var h = hojas[nombre];
    if (!h) throw new Error('No existe la pestaña "' + nombre + '".');
    var rango = h.getDataRange();
    return { valores: rango.getValues(), formatos: rango.getNumberFormats(), tz: tz };
  }

  var panel = hoja('Panel');
  var proy = hoja('Proyección');
  var cats = hoja('Categorías');
  var config = hoja('Config');
  var cobros = hoja('Cobros ATG Lex');
  var cartera = hoja('Cartera');

  var filaMesPanel = buscarFila_(panel, 0, 'Mes');
  var filaMesProy = buscarFila_(proy, 0, 'Mes');
  var filasCat = buscarFilas_(cats, 0, 'Categoría');
  var filaSupuestos = buscarFila_(config, 0, 'Proyección');

  return {
    ok: true,
    version: VERSION,
    actualizado: new Date().toISOString(),
    planilla: ss.getName(),
    panel: {
      nota: texto_(panel, 1, 0),
      // A4:B12 y D4:E12: pares etiqueta / valor
      indicadores: pares_(panel, 3, 11, 0).concat(pares_(panel, 3, 11, 3)),
      tabla: tabla_(panel, filaMesPanel, 0)
    },
    proyeccion: {
      nota: texto_(proy, 1, 0),
      // A4:B11 qué hacer este mes · D4:E11 metas y totales
      recomendacion: pares_(proy, 3, 10, 0),
      metas: pares_(proy, 3, 10, 3),
      orden: texto_(proy, 12, 0),
      tabla: tabla_(proy, filaMesProy, 0)
    },
    categorias: {
      nota: texto_(cats, 1, 0),
      tabla: tabla_(cats, filasCat[0], 0),
      traspuesta: filasCat.length > 1 ? tabla_(cats, filasCat[1], 0) : null
    },
    resumenes: tabla_(hoja('Resúmenes'), 0, 0),
    movimientos: tabla_(hoja('Movimientos'), 0, 0),
    fijos: tabla_(hoja('Fijos'), 0, 0),
    ingresos: tabla_(hoja('Ingresos'), 0, 0),
    cobros: tabla_(cobros, 0, 0),
    cobrosPorMes: tabla_(cobros, 0, buscarColumna_(cobros, 0, 'Mes', 1)),
    inversiones: tabla_(hoja('Inversiones'), 0, 0),
    cartera: tabla_(cartera, 0, 0),
    carteraPorTipo: tabla_(cartera, 0, buscarColumna_(cartera, 0, 'Por tipo', 1)),
    reservas: tabla_(hoja('Reservas'), 0, 0),
    terceros: tabla_(hoja('Terceros'), 0, 0),
    pagosTerceros: hojas['Pagos terceros'] ? tabla_(hoja('Pagos terceros'), 0, 0) : null,
    config: {
      indicadores: pares_(config, 2, 7, 0),
      supuestos: filaSupuestos >= 0 ? tabla_(config, filaSupuestos, 0) : null
    }
  };
}

/* ── Lectura ─────────────────────────────────────────────────────────── */

// Tabla con encabezado en la fila `f` (base 0), desde la columna `c` hasta el
// primer encabezado vacío. Lee hasta la primera fila vacía después de la
// última con datos; las filas "Total…" van aparte y las de una sola celda
// (aclaraciones) van a `notas`.
function tabla_(h, f, c) {
  if (f < 0 || c < 0 || f >= h.valores.length) return null;
  var enc = h.valores[f];
  var fin = c;
  while (fin < enc.length && String(enc[fin]).trim() !== '') fin++;
  if (fin === c) return null;

  var nombres = [];
  for (var j = c; j < fin; j++) {
    // Encabezados con fecha (Categorías: un mes por columna) van como 'yyyy-MM-dd'
    nombres.push(esFecha_(enc[j]) ? Utilities.formatDate(enc[j], h.tz, 'yyyy-MM-dd') : String(enc[j]).trim());
  }

  var filas = [], formatosFilas = [], total = null, notas = [];
  for (var i = f + 1; i < h.valores.length; i++) {
    var fila = h.valores[i].slice(c, fin);
    var llenas = fila.filter(function (v) { return v !== '' && v !== null; }).length;
    if (!llenas) {
      // Si la tabla terminó (fila vacía y después algo que no es Total), cortar
      var sigue = false;
      for (var k = i + 1; k < h.valores.length; k++) {
        var s = h.valores[k].slice(c, fin).filter(function (v) { return v !== '' && v !== null; });
        if (s.length) { sigue = /^total/i.test(String(h.valores[k][c])) || s.length > 1; break; }
      }
      if (!sigue) {
        // Posibles aclaraciones debajo
        for (var n = i + 1; n < h.valores.length; n++) {
          var t = String(h.valores[n][c] || '').trim();
          if (t && h.valores[n].slice(c + 1, fin).every(function (v) { return v === ''; })) notas.push(t);
        }
        break;
      }
      continue;
    }
    if (llenas === 1 && fila[0] !== '' && typeof fila[0] === 'string' && nombres.length > 2 && fila[0].length > 40) {
      notas.push(fila[0]);
      continue;
    }
    if (/^total/i.test(String(fila[0]).trim())) {
      total = fila.map(function (v, j) { return celda_(v, h.formatos[i][c + j], h.tz).v; });
      continue;
    }
    filas.push(i);
  }

  // Tipo de cada columna: el de la primera celda con datos
  var cols = nombres.map(function (nombre, j) {
    var tipo = { k: 'txt', d: null };
    for (var r = 0; r < filas.length; r++) {
      var v = h.valores[filas[r]][c + j];
      if (v !== '' && v !== null) { tipo = tipo_(v, h.formatos[filas[r]][c + j]); break; }
    }
    return { n: nombre, k: tipo.k, d: tipo.d };
  });

  return {
    cols: cols,
    filas: filas.map(function (i) {
      return h.valores[i].slice(c, fin).map(function (v, j) { return celda_(v, h.formatos[i][c + j], h.tz).v; });
    }),
    total: total,
    notas: notas
  };
}

// Pares etiqueta/valor en las filas [desde, hasta] (base 0), columnas c y c+1
function pares_(h, desde, hasta, c) {
  var out = [];
  for (var i = desde; i <= hasta && i < h.valores.length; i++) {
    var etiqueta = String(h.valores[i][c] || '').trim();
    if (!etiqueta) continue;
    var cel = celda_(h.valores[i][c + 1], h.formatos[i][c + 1], h.tz);
    out.push({ l: etiqueta, v: cel.v, k: cel.k, d: cel.d, celda: columnaLetra_(c + 2) + (i + 1) });
  }
  return out;
}

function texto_(h, f, c) {
  return h.valores[f] ? String(h.valores[f][c] || '').trim() : '';
}

function buscarFila_(h, c, texto) {
  var filas = buscarFilas_(h, c, texto);
  return filas.length ? filas[0] : -1;
}

function buscarFilas_(h, c, texto) {
  var out = [];
  for (var i = 0; i < h.valores.length; i++) {
    if (String(h.valores[i][c]).trim() === texto) out.push(i);
  }
  return out;
}

function buscarColumna_(h, f, texto, desde) {
  var fila = h.valores[f] || [];
  for (var j = desde || 0; j < fila.length; j++) {
    if (String(fila[j]).trim() === texto) return j;
  }
  return -1;
}

/* ── Formato ─────────────────────────────────────────────────────────── */

function celda_(v, formato, tz) {
  var t = tipo_(v, formato);
  if (esFecha_(v)) v = Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  return { v: v, k: t.k, d: t.d };
}

function tipo_(v, formato) {
  var f = String(formato || '');
  if (esFecha_(v)) {
    var sinTextos = f.replace(/"[^"]*"/g, '');
    return { k: !sinTextos || /d/i.test(sinTextos) ? 'fecha' : 'mes', d: null };
  }
  if (typeof v === 'number') {
    var seccion = f.split(';')[0];
    var dec = (seccion.match(/\.(0+)/) || [null, ''])[1].length;
    if (/US\$|U\$S|USD/.test(f)) return { k: 'usd', d: dec };
    if (f.indexOf('%') >= 0) return { k: 'pct', d: dec };
    if (f.indexOf('$') >= 0) return { k: 'ars', d: dec };
    return { k: 'num', d: /^(General)?$/i.test(f) ? null : dec };
  }
  return { k: 'txt', d: null };
}

function esFecha_(v) {
  return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
}

function columnaLetra_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ── Utilidades ──────────────────────────────────────────────────────── */

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Comparación de largo fijo para no filtrar el token por tiempos
function iguales_(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// Para probar desde el editor: Ejecutar > probar
function probar() {
  var datos = leerTodo_();
  Logger.log(JSON.stringify(datos).length + ' bytes');
  Logger.log(JSON.stringify(datos.panel.indicadores));
}
