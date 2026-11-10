/**
 * Salco Lente: recibe las respuestas de la encuesta y las agrega a esta hoja de Google Sheets.
 *
 * PASOS (una sola vez):
 * 1. Crea una hoja de cálculo nueva en Google Sheets (por ejemplo "Encuesta Salco Lente").
 * 2. En la hoja: Extensiones > Apps Script. Borra lo que haya y pega TODO este archivo. Guarda.
 * 3. Arriba a la derecha: Implementar > Nueva implementación > tipo "Aplicación web".
 *      - Ejecutar como: Yo (tu cuenta)
 *      - Quién tiene acceso: Cualquier persona
 *    Pulsa Implementar y acepta los permisos (Google avisará que la app no está verificada: Opciones avanzadas > Ir a ...).
 * 4. Copia la "URL de la aplicación web" (termina en /exec) y pégala en js/config.js, en SL.CONFIG.ENCUESTA.URL.
 * 5. Sube el cambio a GitHub Pages. Listo: cada respuesta aparece como una fila nueva.
 *
 * Si cambias este código más adelante: Implementar > Administrar implementaciones > editar > Versión nueva.
 *
 * Es anónima: no se guarda ningún dato de quien responde (ni correo, ni IP, ni dispositivo).
 */
var HOJA = 'Respuestas';
var ENCABEZADOS = ['Fecha y hora', 'Calificación (1 a 5)', 'Comentario', 'Segundos de uso', 'Versión de la app', 'Funciones usadas', 'Productos vistos', 'Categorías vistas', 'Tarjetas abiertas por producto', 'Visita'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var r = Math.round(Number(d.r));
    if (!(r >= 1 && r <= 5)) return salida({ ok: false, error: 'calificacion' });
    var c = String(d.c == null ? '' : d.c).slice(0, 500);
    if (/^[=+\-@]/.test(c)) c = "'" + c;                       // evita que un comentario se interprete como fórmula
    var u = Math.max(0, Math.min(86400, Math.round(Number(d.u) || 0)));
    var v = String(d.v == null ? '' : d.v).slice(0, 10);
    var f = String(d.f == null ? '' : d.f).slice(0, 700);       // recorrido por la app: Escáner → Mi lista → Comparación...
    if (/^[=+\-@]/.test(f)) f = "'" + f;
    var p = String(d.p == null ? '' : d.p).slice(0, 500);
    var k = String(d.k == null ? '' : d.k).slice(0, 200);
    var t = String(d.t == null ? '' : d.t).slice(0, 900);
    var s = Math.max(1, Math.min(100000, Math.round(Number(d.s) || 1)));
    var visita = s === 1 ? 'Primera visita' : 'Repetición n°' + s;
    var txt = [p, k, t].map(function (x) { return /^[=+\-@]/.test(x) ? "'" + x : x; });
    p = txt[0]; k = txt[1]; t = txt[2];
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HOJA);
    if (!sh) {
      sh = ss.insertSheet(HOJA);
      sh.appendRow(ENCABEZADOS);
      sh.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold').setBackground('#007dc3').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      sh.setColumnWidth(3, 420);
    }
    for (var i = 0; i < ENCABEZADOS.length; i++) {              // hojas creadas antes: agrega los encabezados que falten
      var h = sh.getRange(1, i + 1);
      if (h.getValue() === '') { h.setValue(ENCABEZADOS[i]).setFontWeight('bold').setBackground('#007dc3').setFontColor('#ffffff'); if (i >= 5) sh.setColumnWidth(i + 1, 320); }
    }
    var fecha = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([fecha, r, c, u, v, f, p, k, t, visita]);
    return salida({ ok: true });
  } catch (err) {
    return salida({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() { return salida({ ok: true, servicio: 'encuesta Salco Lente' }); }

function salida(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
