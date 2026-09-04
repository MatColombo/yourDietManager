# V1 Data/UX Hardening — Pass C Report

## Stato

**DONE** — candidate `1.0.0-rc.4`.

Pass C chiude il blocco **Editor/Navigation UX Hardening** sopra Pass A (reference-data model) e Pass B (guided form infrastructure). Non implementa ancora il Pass D: recipe/ingredient detail indipendenti dal piano e modifica trasparente di qualunque origin restano il prossimo blocco.

## 1. Onboarding sospeso e bootstrap standard neutro

Il wizard iniziale e stato tolto dal percorso operativo. Una nuova installazione non viene piu rediretta a `/onboarding`; quella route mostra soltanto un avviso di sospensione e rimanda a `Configura`.

Il nuovo `public/data/bootstrap/default-configuration.json` e un default neutro:

- locale iniziale `it`, sistema metrico, settimana da lunedi;
- timezone risolta dal browser quando disponibile;
- `shoppingPeopleMultiplier = 1`;
- nessuna allergia/intolleranza preimpostata;
- nessuna preferenza alimentare preimpostata;
- target energia 2000 kcal come baseline modificabile;
- protein/carbs/fat/fiber disabilitati con limiti null e `weight = 0`;
- MealClass standard breakfast/lunch/dinner/snack senza regole arbitrarie;
- una DayClass standard senza finestre lavoro;
- Cycle standard di un giorno.

`configurationBootstrap.js` marca il bootstrap con `bootstrapConfigurationVersion = standard-v1`. Un vecchio default puo essere aggiornato automaticamente solo se e ancora intatto: una configurazione esplicitamente salvata/importata dall'utente non viene sovrascritta.

## 2. Stato editor e no-collapse

E stato introdotto `src/ui/uiState.js` come unico strato autorevole per lo stato visuale non persistito.

Le disclosure operative usano `controlledDetails(...)` e memorizzano il proprio stato `open` in `state.ui.expanded`. Aggiungere/rimuovere/riordinare work window, meal slot, MealClass rules o altri elementi non ricrea piu disclosure con il default sbagliato.

L'audit sorgente non lascia `<details>` operativi ad hoc fuori da `uiState.js`.

Inoltre `state.render()` differisce il full rerender quando la route corrente e editabile e contiene una bozza dirty. Aggiornamenti asincroni (catalog progress, stato applicativo, ecc.) non possono quindi sostituire il DOM dell'editor e cancellare la bozza.

## 3. Dirty-state e navigation guard globale

La protezione delle modifiche non salvate e centralizzata e copre:

- link interni `data-route`;
- navigazione programmatica tramite `state.navigate(...)`;
- browser Back/Forward;
- reload e chiusura tab tramite `beforeunload`.

Le mutazioni generate da controlli programmatici (autocomplete, chip, MealArchetype picker, add/remove/reorder) emettono `ydm:draft-change`, quindi hanno la stessa semantica dirty di `input`/`change` nativi.

Dopo un save riuscito `state.markSaved()` pulisce il dirty state; un'uscita esplicitamente confermata puo invece scartare la bozza.

L'audit sorgente non lascia `history.pushState`/`replaceState` operativi fuori dal router/UI-state condiviso.

## 4. Feedback di salvataggio

Il precedente feedback locale poteva sparire immediatamente a causa del rerender. Pass C aggiunge una notification region globale `aria-live` che sopravvive alla ricostruzione della pagina.

I save di configurazione producono sempre:

- feedback inline nel contesto dell'editor;
- toast globale success/error persistente;
- messaggio localizzato IT/EN.

Lo stesso meccanismo e stato riutilizzato dove appropriato per lingua, tema, import configurazione e authoring gia esistente.

## 5. DayClass `capabilities` — root cause e fix

Il bug riportato dall'utente era reale: il form passava l'intera `DayClass` a `capabilitiesEditor(...)`, quindi scriveva campi come `fridge`, `reheating` e `maxPrepMinutes` al livello top-level. Lo schema ammette invece soltanto:

```json
{
  "capabilities": {
    "fridge": "...",
    "reheating": "...",
    "cooking": true,
    "complexSnack": false,
    "portabilityRequired": false,
    "maxPrepMinutes": 45
  }
}
```

Il binding ora usa esclusivamente `day.capabilities`. Lo stesso vincolo copre tutti i campi capabilities, non solo quelli comparsi nell'errore originale.

## 6. Full form ↔ schema audit

Gli editor di configurazione usano ora `configurationUiDiagnostics(...)`, che combina:

1. JSON Schema;
2. invarianti cross-record;
3. semantic/reference-data validation.

Il pulsante Save resta disabilitato mentre esistono errori bloccanti e viene aggiornato live su `input`, `change` e `ydm:draft-change`.

Correzioni aggiuntive emerse dall'audit:

- i numeri obbligatori vuoti non vengono piu trasformati silenziosamente in `0` o in un default;
- `dailyEnergyKcal`, `energyTolerancePct`, nutrient weight, modifier value, energy-share min/target/max, numeric MealClass rule values, frequency limits, `endDayOffset`, slot `dayOffset` e cycle length restano invalidi finche non compilati correttamente;
- una DayClass non `free` non puo rimanere senza meal slot: il form crea uno slot valido quando si esce da `free` se necessario e impedisce di rimuovere l'ultimo slot;
- i rerender richiesti da cambio tipo target/mode segnano prima la bozza come dirty;
- l'editor Cycle aggiorna solo la griglia necessaria invece di ricostruire l'intero form.

Principio risultante: **il form deve essere almeno altrettanto restrittivo del contratto dati che produce**. Lo schema resta una rete di sicurezza, non il normale punto in cui l'utente scopre errori strutturali.

## 7. i18n e accessibilita

Aggiunte stringhe IT/EN per:

- conferma uscita con modifiche non salvate;
- onboarding sospeso;
- save fallito/riuscito;
- feedback ricetta/ingrediente gia esistente;
- chiusura notifiche.

La notification region usa `aria-live`; le azioni Save invalidabili espongono anche lo stato disabilitato/accessibile.

## 8. Offline / GitHub Pages

Il service worker e stato aggiornato a shell cache `v14` e precache di `src/ui/uiState.js`. Il comportamento resta compatibile sia con root site sia con project site `/yourDietManager/`.

## 9. Gate automatici

Verifica completata:

- `npm run check` — PASS;
- **98/98 test** — PASS;
- syntax check **93 file JavaScript** — PASS;
- accessibility source audit **16/16** — PASS;
- `npm run hardening:forms` — PASS;
- benchmark catalog/history 10k — PASS;
- corpus smoke Phase 4 — PASS;
- planner smoke Phase 5 — PASS;
- build root `/` — PASS;
- build/audit GitHub Pages `/yourDietManager/` — PASS;
- IT/EN parity — PASS.

Il release gate resta intenzionalmente **BLOCKED 4/8** esclusivamente per il corpus production Phase 4:

1. `recipeVersions=3`, minimo production 3000;
2. `pipelineVersion=phase3-fixture`;
3. 4 IngredientRevision base non `curated/high`;
4. `catalogVersion=0.3.0-dev`.

Pass C non introduce nuovi blocker.

## 10. Limiti deliberati / Pass D

Pass C non dichiara completati i flussi recipe/ingredient detail/edit. Restano nel Pass D:

- detail ricetta/ingrediente indipendente dall'esistenza di un piano, verificato browser-side;
- `Modifica` per qualunque origin tramite nuova revisione/versione e avanzamento del family pointer;
- `Duplica` come azione distinta, non workaround per modificare dati base;
- browser regression suite click-level che eserciti anche dirty navigation, save feedback, no-collapse e form/schema parity attraverso interazioni reali.

Il corpus production resta sospeso finche Pass D non e completato.
