import { XsdAttribut } from '../../models/xsd-index.model';

/**
 * Der Wert, den ein Attribut in der erzeugten Instanz traegt: der vom Schema
 * erzwungene `fixed`-Wert, sonst — nur fuer `xjustizVersion` — die geladene
 * Schemaversion.
 *
 * Der Sonderfall ist keine Bequemlichkeit: bis 3.6.2 steht am
 * `Type.GDS.Nachrichtenkopf` `use="required" fixed="3.6.2"`, ab 4.0.0 traegt
 * dasselbe Pflicht-Attribut **kein** `fixed` mehr, sondern den Typ
 * `Type.GDS.XJustizVersion` (Pattern `4\.(0|[1-9]\d*)\.(0|[1-9]\d*)`). Ohne
 * diesen Zweig fiele das Attribut weg und jede erzeugte 4.x-Nachricht waere
 * schema-invalide. Die geladene Schemaversion erfuellt das Pattern und ist
 * fachlich genau das, was das Attribut zusichert.
 *
 * null heisst: aus dem Schema kein Wert ableitbar. Bei einem **Pflicht**-Attribut
 * springt dann `ValueService.attributWert` mit einem typkonformen Platzhalter
 * ein — Attribute sind im Baum nicht erfassbar, ein leeres Pflicht-Attribut
 * machte die Nachricht sonst dauerhaft schema-invalide. Optionale Attribute
 * bleiben weg. Diese Funktion bleibt rein und kennt nur das Schema; wer den
 * Wert der erzeugten Nachricht braucht, fragt `ValueService.attributWert`.
 */
export function pflichtAttrWert(a: XsdAttribut, version: string): string | null {
  if (a.fixed != null) return a.fixed;
  if (a.name === 'xjustizVersion') return version || null;
  return null;
}
