# Theme & Appearance Spec V1

## 1. Obiettivo

Consentire un'esperienza visiva tailor-made senza generare CSS arbitrario o compromettere accessibilita.

## 2. ThemeProfile

Design tokens configurabili, persistiti come ThemeProfile IndexedDB e esportabili in JSON:

- mode: system/light/dark
- primary
- secondary
- surface
- background
- text
- mutedText
- border
- success/warning/danger
- borderRadiusScale
- density: compact/comfortable
- fontScale

## 3. Preset iniziali

- minimal
- warm
- botanical
- pastel
- professional
- dark
- high_contrast

Un preset e solo un set iniziale di token modificabili.

## 4. DayClass colors

Ogni DayClass ha colore proprio, indipendente dal tema. Il renderer deve calcolare automaticamente un foreground accessibile oppure richiedere correzione se contrasto insufficiente.

## 5. Guardrail

- contrasto testo essenziale WCAG AA target;
- non permettere testo completamente illeggibile;
- focus ring sempre visibile;
- density non deve ridurre touch target sotto limiti pratici su mobile.

## 6. CSS architecture

Mappare JSON theme profile a CSS custom properties:

```text
--ydm-color-primary
--ydm-color-surface
--ydm-radius-md
--ydm-space-unit
```

Nessun CSS generato con selettori utente arbitrari.

## 7. Bootstrap theme

Per evitare flash visivi si puo duplicare in localStorage solo una copia non autorevole dei token minimi di tema. ThemeProfile autorevole resta in IndexedDB; la copia bootstrap viene rigenerata dal repository.

## 8. Token contract e validazione contrasto

`ThemeProfile.tokens` e un oggetto a chiavi chiuse. V1 richiede almeno: `primary`, `secondary`, `surface`, `background`, `text`, `mutedText`, `border`, `success`, `warning`, `danger`, `focusRing`, `borderRadiusScale`. I colori sono `#RRGGBB`; chiavi arbitrarie non sono accettate dallo schema.

Il Theme Engine applica WCAG 2.x contrast ratio usando luminanza relativa sRGB:

```text
(Llighter + 0.05) / (Ldarker + 0.05)
```

Guardrail V1:

- testo normale essenziale: almeno 4.5:1 contro `background` e `surface` dove usato;
- testo grande/UI non testuale rilevante: almeno 3:1;
- `focusRing`: almeno 3:1 rispetto alle superfici adiacenti;
- `mutedText`: non puo essere usato per informazioni essenziali se non raggiunge 4.5:1.

Un profilo custom che fallisce viene rifiutato al salvataggio con indicazione delle coppie problematiche. Per `DayClass.color`, il renderer sceglie tra foreground candidati predefiniti verificati; se nessuno raggiunge il rapporto richiesto, la UI chiede di correggere il colore.
