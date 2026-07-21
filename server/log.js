/**
 * Fehler-Logging des Backends: knappes Request-Log fuer alle Antworten mit
 * Status >= 400 und eine zentrale Error-Middleware, die Stacktraces auf die
 * Konsole schreibt und einheitlich als JSON antwortet (statt der Express-
 * HTML-Fehlerseite). Praefix [xjp] wie die uebrigen Server-Logs.
 */

/** Loggt jede fertige Antwort mit Status >= 400 (Routen antworten selbst mit 400/404-JSON). */
export function requestFehlerLog(req, res, next) {
  res.on('finish', () => {
    if (res.statusCode >= 400) {
      console.warn(`[xjp] ${res.statusCode} ${req.method} ${req.originalUrl}`);
    }
  });
  next();
}

/** Zentrale Error-Middleware: Stack loggen, JSON antworten (als letzte Middleware einhaengen). */
export function errorMiddleware(err, req, res, next) {
  console.error(`[xjp] FEHLER ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  // express.json-Parse-Fehler tragen status 400; sonst 500.
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: status >= 500 ? 'Interner Serverfehler' : err.message });
}
