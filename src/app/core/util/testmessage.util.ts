/**
 * Leitet die Cluster-Metadaten einer hochgeladenen XJustiz-Instanz aus dem
 * Wurzelelement ab. Der Nachrichtentyp *ist* das Root-Element (localName
 * `nachricht.<fachmodul>.<...>.<id>`); ein separates Feld gibt es nicht.
 *
 * Gibt `null` zurueck, wenn der Text kein lesbares XML oder keine XJustiz-
 * Nachricht (`nachricht.*`) ist — der Aufrufer lehnt den Upload dann ab.
 * Bewusst getrennt von `InstanceImportService.rootMessageName`, das nur den
 * Namen fuer das Drag&Drop-Routing braucht.
 */
import { TestmessageInput } from '../../models/testmessage.model';

export interface TestmessageMeta {
  nachricht: string;
  fachmodul: string;
  xjustizVersion?: string;
}

/**
 * Namensabfrage fuer eine neue Testnachricht (einheitlicher Prompt der beiden
 * Speichern-Fluesse). null = abgebrochen; leere Eingabe faellt auf den
 * Vorschlag zurueck.
 */
export function frageTestnachrichtName(vorschlag: string): string | null {
  const eingabe = prompt('Name der neuen Testnachricht:', vorschlag);
  return eingabe == null ? null : eingabe.trim() || vorschlag;
}

/** Basis-Eingabedaten eines Testspeicher-Eintrags aus XML + Root-Metadaten. */
export function testmessageInput(
  name: string,
  xml: string,
  meta: TestmessageMeta,
): TestmessageInput {
  return {
    name,
    xml,
    nachricht: meta.nachricht,
    fachmodul: meta.fachmodul,
    xjustizVersion: meta.xjustizVersion,
    groesse: xml.length,
  };
}

export function parseTestmessage(xmlText: string): TestmessageMeta | null {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  const root = doc.documentElement;
  const name = root?.localName ?? '';
  if (!/^nachricht\./.test(name)) return null;
  // fachmodul = zweites Segment (nach "nachricht."); leerer Fallback -> "sonstige".
  const fachmodul = name.split('.')[1] || 'sonstige';
  const meta: TestmessageMeta = { nachricht: name, fachmodul };
  const version = leseVersion(root);
  if (version) meta.xjustizVersion = version;
  return meta;
}

/**
 * Best-effort: XJustiz-Version aus dem `xjustizVersion`-Attribut. Steht in
 * XJustiz-Instanzen ueblicherweise am `nachrichtenkopf` (nicht am Wurzelelement),
 * daher beide Stellen pruefen.
 */
function leseVersion(root: Element): string | undefined {
  const vom = (el: Element | undefined): string | undefined => {
    const v = el?.getAttribute('xjustizVersion')?.trim();
    return v || undefined;
  };
  return vom(root) ?? vom(root.getElementsByTagNameNS('*', 'nachrichtenkopf')[0]);
}
