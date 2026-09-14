# CR → sviluppo → verifica R8

Gli EXT derivano dalla CR §16. Gli ID R01–R27 della review restano invariati; non vengono attribuiti nuovi rilievi fittizi. L’autorizzazione dell’utente consente lo sviluppo R8 con R5/R7 ancora aperte.

| Attività | Requisiti e origine | Scenari | File principali | Evidenze | Stato |
| --- | --- | --- | --- | --- | --- |
| R8.1 Favoriti e pasti bloccati | CR §16 · EXT-01 | T66 | `schemas/recipe-favorite.schema.json`, `schemas/calendar-day.schema.json`, `src/ui/catalogPages.js`, `src/ui/planPages.js`, `src/services/catalogQuery.js`, `src/services/effectivePlanService.js`, `src/planner/planGenerator.js`, `src/planner/softScoring.js`; servizi/UI condivisi | EV-R8-SERVICES, EV-R8-REGRESSION | Implementato; accettazione aperta |
| R8.2 Menu riutilizzabili | CR §16 · EXT-02 | T67 | `schemas/saved-menu.schema.json`, `src/services/planPreviewGuard.js`, `src/services/planPolicyValidation.js`; servizi/UI condivisi | EV-R8-SERVICES, EV-R8-REGRESSION | Implementato; accettazione aperta |
| R8.3 Dispensa semplice | CR §16 · EXT-03 | T68 | `schemas/pantry-entry.schema.json`, `src/services/shoppingService.js`, `src/ui/shoppingPages.js`; servizi/UI condivisi | EV-R8-SERVICES, EV-R8-REGRESSION | Implementato; accettazione aperta |
| R8.4 Avanzi e preparazione anticipata | CR §16 · EXT-04 | T69 | `schemas/production-batch.schema.json`, `schemas/calendar-day.schema.json`, `src/services/shoppingService.js`, `src/services/effectivePlanService.js`, `src/planner/frequencyPlanGenerator.js`; servizi/UI condivisi | EV-R8-SERVICES, EV-R8-REGRESSION | Implementato; accettazione aperta |
| R8.5 Stagionalità e costo | CR §16 · EXT-05, EXT-06 | T70 (stagionalità e costo separati) | `schemas/seasonality-profile.schema.json`, `schemas/ingredient-price.schema.json`, `src/planner/softScoring.js`, `src/ui/shoppingPages.js`; servizi/UI condivisi | EV-R8-SERVICES, EV-R8-REGRESSION | Implementato; accettazione aperta |

Persistenza comune: DB 9/31 store, contenuti 5, backup 4, shell 42/dati 22. Le sei raccolte sono descritte nel contratto R8 e negli schemi.

333 test automatici su 44 file. Cinque scenari di accettazione R8 restano PARZIALI; gli esiti automatici non attestano reload, rendering o IndexedDB reale.
