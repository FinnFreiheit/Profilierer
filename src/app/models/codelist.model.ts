/** Ein einzelner Codelisten-Wert (Z.428). */
export interface EnumWert {
  value: string;
  label: string;
}

/**
 * Codelisten-Info, die aus dem XSD-Typ abgeleitet wird (codelistOf, Z.435-456):
 * enthaelt die inline gepflegten Werte oder null bei externen Listen (Typ 3).
 */
export interface CodelistInfo {
  typeName: string;
  nameLang: string;
  kennung: string;
  beschreibung: string;
  werte: EnumWert[] | null;
  /**
   * Codelisten-Version aus dem XSD: fixe `listVersionID` der Restriction bzw.
   * `versionCodeliste/version` aus dem appinfo. Massgeblich fuer generierte
   * Instanzen — ein fixer Wert ist die einzige schema-valide Angabe.
   */
  version?: string;
}

/**
 * Eine geladene externe Codeliste (aus Genericode/XRepository).
 * Die genaue Struktur wird in P5 (CodelistService) verfeinert.
 */
export interface Codelist {
  kennung: string;
  name?: string;
  version?: string;
  nameLang?: string;
  werte: EnumWert[];
}
