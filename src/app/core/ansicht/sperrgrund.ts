/**
 * Warum die gebundene Fassung ein Element sperrt — **eine** Formulierung für
 * Baum und Detailbereich.
 *
 * Vorher stand die Fallunterscheidung an beiden Stellen mit eigenem Wortlaut:
 * der Anwender las im Kasten etwas anderes als daneben im Detailbereich, und
 * nur die eine Fassung nannte die Statusstufe. Der Text ist die Aussage, nicht
 * die Darstellung — er gehört an eine Stelle.
 *
 * @param eigen  Schließt die gebundene Fassung **dieses** Element aus (sonst geerbt)?
 * @param statusName  Name der Statusstufe der Vorgabe, falls bekannt.
 * @param anmerkung  Fachliche Begründung aus der Profilierung, falls vorhanden.
 */
export function sperrGrundText(
  eigen: boolean,
  statusName?: string | null,
  anmerkung?: string | null,
): string {
  const kern = eigen
    ? `Die gebundene Profilierung setzt dieses Element auf „${statusName || 'nicht verwendet'}" — es ist nicht befüllbar und erscheint nicht in der Testnachricht.`
    : 'Ein übergeordnetes Element ist in der gebundenen Profilierung ausgeschlossen — der Teilbaum entfällt.';
  return anmerkung ? `${kern}\nBegründung aus der Profilierung: ${anmerkung}` : kern;
}
