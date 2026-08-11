import { Injectable, inject } from '@angular/core';
import { LibraryEntry, ProfileDoc } from '../../models/profile.model';
import { TestmessageEntry } from '../../models/testmessage.model';
import { Pruefbericht, SchemaUrteil } from '../../models/pruefbericht.model';
import { ordneVorkommenZu } from '../vorkommen-zuordnung';
import { InstanceImportService } from './instance-import.service';
import { KonformitaetService } from './konformitaet.service';
import { ProfileStoreService } from './profile-store.service';
import { SchemaIndexService } from './schema-index.service';
import { TestmessageStoreService } from './testmessage-store.service';
import { XmlValidationService } from './xml-validation.service';

/** Die zu prüfende Fassung: `null` = Arbeitsstand, sonst eine Versions-id. */
export type FassungsWahl = string | null;

/**
 * „Hält diese Testnachricht die Profilierung ein?" — der Abgleich einer
 * **hochgeladenen** Nachricht gegen eine **gewählte** Profilfassung (#107).
 *
 * Abgrenzung zum bestehenden Weg: `SitzungsAbgleichService` prüft die *laufende
 * Sitzung* gegen die am Eintrag eingefrorene Bindung, beim Speichern. Dieser
 * Dienst prüft ein frei gewähltes Paar, auf Knopfdruck, **ohne** die Sitzung
 * anzufassen — der geöffnete Editor bleibt, wie er ist.
 *
 * Die Regeln liegen unverändert im `KonformitaetService`; hier steht nur, was
 * beschafft und wie zugerechnet werden muss.
 */
@Injectable({ providedIn: 'root' })
export class ProfilPruefungService {
  private readonly testmessages = inject(TestmessageStoreService);
  private readonly profiles = inject(ProfileStoreService);
  private readonly schemata = inject(SchemaIndexService);
  private readonly importer = inject(InstanceImportService);
  private readonly konformitaet = inject(KonformitaetService);
  private readonly validator = inject(XmlValidationService);

  /**
   * Prüft und liefert den Bericht. Wirft nur, wo sich **gar nichts** aussagen
   * lässt (Nachricht oder Fassung nicht ladbar, kein Schema zur Version, XML
   * unlesbar) — der Aufrufer meldet das als Toast. Ein schema-invalides XML ist
   * dagegen kein Abbruch: es wird geprüft, der Kopf sagt die Einschränkung.
   */
  async pruefe(
    eintrag: TestmessageEntry,
    profil: LibraryEntry,
    fassungsWahl: FassungsWahl,
  ): Promise<Pruefbericht> {
    const xml = await this.testmessages.loadXml(eintrag.id);
    if (xml == null) throw new Error('Testnachricht nicht gefunden.');
    const { doc, fassung } = await this.ladeFassung(profil, fassungsWahl);

    // Das Schema der **Nachricht** — sie ist der zu prüfende Gegenstand. Ohne
    // Schema gibt es kein Modell und damit keinen Abgleich (die Versionen von
    // Nachricht und Profil sind durch die Auswahl bereits verträglich).
    const version = eintrag.xjustizVersion ?? doc.meta?.xjustizVersion ?? profil.xjustizVersion;
    const idx = await this.schemata.fuerVersion(version);
    if (!idx)
      throw new Error(
        `Kein hinterlegtes Schema für XJustiz ${version ?? '(unbekannt)'} — nicht prüfbar.`,
      );

    // Schemavalidierung als **Vorstufe**: der Bind-Walk läuft über die
    // Schema-Kinder und übergeht, was das Schema nicht kennt. Eine invalide
    // Nachricht liefert daher ein systematisch unvollständiges Modell — ohne
    // dieses Urteil im Kopf könnte der Bericht grün sein, weil Teile der Datei
    // gar nicht gelesen wurden.
    const schemaPruefung = await this.validator.validiere(xml);

    const auswertung = this.importer.auswerten(xml, idx);
    const bezeichnungen = await this.testmessages.loadBezeichnungen(eintrag.id).catch(() => null);
    const { modell, zuordenbar } = ordneVorkommenZu(auswertung.modell, doc, bezeichnungen);

    const befunde = this.konformitaet.pruefe(doc, modell, {
      istBlatt: auswertung.istBlatt,
      istEnthalten: auswertung.istEnthalten,
      vorkommenZuordenbar: zuordenbar,
    });

    return {
      kopf: {
        name: eintrag.name,
        msgName: auswertung.msgName,
        profilName: doc.meta?.name || profil.name,
        fassung,
        xjustizVersion: version,
        zeitpunkt: Date.now(),
        schema: schemaPruefung.status as SchemaUrteil,
        schemaFehler: schemaPruefung.status === 'valide' ? [] : schemaPruefung.fehler,
        fortschritt: doc.fortschritt,
        festlegungen: Object.values(doc.elemente).filter((e) => e.status).length,
        nErweiterung: befunde.verstoesse.filter((v) => v.erweiterung).length,
        // Nur melden, wo die Profilierung überhaupt benannte Vorkommen führt:
        // sonst stünde der Hinweis an jeder Nachricht, ohne etwas zu sagen.
        vorkommenUnzuordenbar: Object.keys(doc.auspraegungen).some((p) => !zuordenbar(p)),
      },
      verstoesse: befunde.verstoesse,
      luecken: befunde.luecken,
    };
  }

  /**
   * Passt diese Profilierung zu dieser Nachricht? Nachrichtentyp **und**
   * XJustiz-Version müssen übereinstimmen; eine fehlende Versionsangabe
   * (best-effort ermittelt bzw. Altbestand) passt zu allem — Nichtwissen ist
   * kein Widerspruch.
   *
   * Der Nachrichtentyp ist hart, weil Profil und Nachricht sonst keinen
   * einzigen Pfad teilen: die Prüfung liefe durch und meldete **null**
   * Verstöße. Ein falsch-grüner Bericht ist schlimmer als gar keiner.
   */
  passt(eintrag: TestmessageEntry, profil: LibraryEntry): boolean {
    if (!profil.nachricht || profil.nachricht !== eintrag.nachricht) return false;
    if (!profil.xjustizVersion || !eintrag.xjustizVersion) return true;
    return profil.xjustizVersion === eintrag.xjustizVersion;
  }

  /**
   * Die zu prüfende Fassung samt Bezeichnung (wie beim Erstellen, #25).
   * Öffentlich, weil ein Klick im Bericht sie erneut braucht: die Nachricht
   * wird dann an **genau diese** Fassung gebunden geöffnet.
   */
  async ladeFassung(
    profil: LibraryEntry,
    wahl: FassungsWahl,
  ): Promise<{ doc: ProfileDoc; fassung: string }> {
    if (wahl) {
      const ver = await this.profiles.loadVersion(profil.id, wahl);
      if (!ver) throw new Error('Fassung der Profilierung nicht gefunden.');
      return {
        doc: ver.doc,
        fassung: 'v' + ver.nr + (ver.abnahme ? ' (Abnahme)' : ''),
      };
    }
    const doc = await this.profiles.load(profil.id);
    if (!doc) throw new Error('Profilierung nicht gefunden.');
    return { doc, fassung: 'Arbeitsstand' };
  }
}
