# ADR 0003: SVG-Verbindungslinien deklarativ mit DOM-Messung

- Status: Angenommen
- Datum: 26.07.10

## Kontext

Der Baum stellt Eltern-Kind-Beziehungen als Bézier-Kurven dar; Verweise als gebogene Linien mit Pfeil. In der Alt-App baute `redrawLines` (Z.1125-1206) den SVG-Inhalt imperativ aus `getBoundingClientRect`-Messungen. Rein deklarativ ist das nicht abbildbar: Die Linien-Geometrie hängt vom **tatsächlichen Layout** ab (Textumbruch, Box-Höhen, Scroll-Breite), das erst nach dem Render feststeht.

## Entscheidung

Die Linien werden im `TreeCanvas` **nach** dem Render aus DOM-Geometrie berechnet und als `PathSpec[]`-Signal deklarativ als `<path>`-Elemente gerendert (SVG-Namespace-korrekt via Angular-Template, kein `innerHTML`). Neuberechnung (mit `requestAnimationFrame`-Debounce) wird ausgelöst durch:

- einen `effect` auf Struktur/Auswahl/Profil/Ansicht (`open, selItem, elemente, auspraegungen, showRefs, showDiff, …`),
- einen `ResizeObserver` auf `#treeCanvas` (Größen-/Umbruch-Änderungen),
- `afterNextRender` (Erstauf­bau).

Die Kern-Geometrie (`nearestBox`, `refCurve`, die zwei Referenz-Durchläufe) ist nahezu unverändert übernommen; nur die DOM-Queries laufen über das `ElementRef`.

## Konsequenzen

- **Positiv:** Ein einziger bewusst imperativer DOM-Ort, sonst deklarativ; Linien folgen dem echten Layout; keine Layout-Thrashing-Schleife (das SVG-Overlay ist absolut positioniert, `pointer-events: none`, und beeinflusst das Layout nicht).
- **Negativ / Randbedingung:** Die Baum-DOM-Struktur ist Vertrag — `TreeNode` trägt Host-Klasse `ntree` mit direktem `.box`/`.nkids`, und die Klassen/`data-*`-Attribute (`.excluded`, `data-path`, `data-refkind`, `data-refziel`) dürfen nicht umbenannt werden. Timing hängt an `afterNextRender` + `rAF`; ohne das „hinken" Linien beim Auf-/Zuklappen.
