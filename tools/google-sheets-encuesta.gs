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
var ENCABEZADOS = ['Fecha y hora', 'Calificación (1 a 5)', 'Comentario', 'Segundos de uso', 'Versión de la app', 'Funciones usadas'];

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
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(HOJA);
    if (!sh) {
      sh = ss.insertSheet(HOJA);
      sh.appendRow(ENCABEZADOS);
      sh.getRange(1, 1, 1, ENCABEZADOS.length).setFontWeight('bold').setBackground('#007dc3').setFontColor('#ffffff');
      sh.setFrozenRows(1);
      sh.setColumnWidth(3, 420);
    }
    if (sh.getRange(1, 6).getValue() === '') {                  // hojas creadas antes de esta columna: agrega el encabezado
      sh.getRange(1, 6).setValue(ENCABEZADOS[5]).setFontWeight('bold').setBackground('#007dc3').setFontColor('#ffffff');
      sh.setColumnWidth(6, 420);
    }
    var fecha = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([fecha, r, c, u, v, f]);
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
