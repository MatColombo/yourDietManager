# Contratto operativo R0/R1

Versione applicazione `1.1.0-dev.r1` · 11 settembre 2026. Questo documento prevale sulle descrizioni V1 per le sole modifiche R0/R1. La review e le fasi autorevoli sono conservate in `baseline/` e `FASI_SVILUPPO.md`. Il freeze G/H resta evidenza della versione `1.0.0-rc.34`: non autorizza la pubblicazione di questa build.

## Identità e persistenza

| Oggetto | Contratto attuale | Autorità |
| --- | --- | --- |
| Concetto ingrediente | Termine concept nella tassonomia esistente `product_food` | Nome generico, alias del registry e percorso categoria/sottocategoria/concept |
| Forma | `IngredientFamily.ingredientId`, schema 1 | ID stabile; non è un gruppo personalizzato |
| Revisione | `IngredientRevision`, lettore 1 oppure 2 | Nutrienti, unità, stato, fonte; schema 2 aggiunge display IT/EN e safetyEvidence |
| Gruppo | `FoodGroup`, schema 1, chiave `[id, version]` | Membri `productFood` o `ingredient`; niente gruppi annidati |
| Mapping | `IngredientMapping`, schema 1, chiave `[mappingId, version]` | Fonte, forma/revisione di destinazione, ragione e decisione esplicita |
| Conversione | `IngredientConversion`, schema 1, chiave `[conversionId, version]` | Direzione, fattore positivo, unità, fonte, stato revisione e scopo |
| Ricetta | `RecipeVersion`, lettore 1 oppure 2 | Schema 1 resta lossless; schema 2 vieta instructions in ogni lingua |
| Preferenze/sicurezza | Lettori 1/2; nuovi scrittori in staging | Nessuna attivazione di regole 2 prima del solver R3 |
| Database | IndexedDB 7, 25 store | 22 preesistenti più i tre registri versionati |
| Contenuti/backup | Contenuti 4; backup 2, lettura backup 1 | Backup 2 R1 ancora vincolato allo stesso catalogo; autosufficienza completa R6 |

Il campo `display.*.variantLabel` contiene 1–60 caratteri. Il peso analitico rimane 100 g oppure 100 ml. Gli stati raw, cooked, dry, drained, prepared, ready_to_eat, as_sold e unknown rimangono distinti. La migrazione introduce etichette di stato provvisorie; il miglio soffiato è identificato esplicitamente. La revisione editoriale delle varianti del catalogo si completa in R2/R5: questi dati non sono dichiarati tutti curati.

Non duplicare `product_food`. Non convertire alias in equivalenze nutrizionali o allergeniche. Un percorso deve avere una radice, una sottocategoria figlia e un concept foglia. Le categorie Altro sono escluse dal conteggio della copertura curata. `listIngredientConcepts` è la base di dominio; il selettore comune nelle schermate è R2.

## Migrazione e compatibilità

`migrateIngredientModel` legge il current di ciascuna forma, valida il percorso già presente, aggiunge una revisione deterministica `<oldRevisionId>_v2_r1` e registra un mapping di identità. Non riclassifica dal nome e non media nutrienti. Il timestamp di origine viene conservato per rendere il contenuto deterministico; il momento della migrazione è nel report.

Il mapping è approvato soltanto per la conservazione strutturale dell'identità (`approvedBy=ingredient-model-r1-1`); la sicurezza resta `unreviewed`, senza autore o data di una revisione alimentare inventata. Le vecchie revisioni e tutte le ricette distribuite rimangono intatte. Il current base passa alla nuova revisione. Se la famiglia o la revisione è locale, il current resta intatto e viene registrata una proposta di riconciliazione. Nessun alias costituisce autorizzazione a fondere due forme.

La migrazione scrive in batch di 100 con checkpoint `contentMigration:4`. Ogni batch confronta i current e le destinazioni nella transazione di scrittura. Un'interruzione mantiene i batch conclusi; la ripresa riesamina i current e riusa gli ID deterministici. Collisioni immutabili e cambi concorrenti interrompono il batch. Gli irrisolti sono conservati nel report ed esclusi dalle nuove selezioni del planner. Le importazioni successive sono riconciliate nuovamente; il marker completo non esclude nuovi record.

Non modificare `PRE_V1_DATA_EPOCH`. Un'installazione non vuota viene adottata per la migrazione additiva, senza `resetAll`, anche se l'epoch manca o è vecchia. Il downgrade del contenuto viene rifiutato. La vecchia inizializzazione distruttiva rimane limitata a un database privo di record.

I puntatori locali, i piani, le note, le checklist, gli operation snapshot e le regole legacy non vengono riscritti da R1. Le preferenze V1 non diventano automaticamente frequenze hard. Il backup 2 include i nuovi registri, le revisioni base migrate e lo staging; preserva la lettura del formato 1. La chiusura transitiva verso cataloghi diversi e il ripristino completo di history/meta sono attività R6, non garanzie di questa fase.

## Sicurezza e quarantena R0

`catalogQuarantine.js` contiene gli ID espliciti dei venti piatti con pesce crudo e i sedici ingredienti con metadati allergeni da rivedere. Il manifest indica motivo, fonte e destinazione. I dati storici restano consultabili. Una protezione aggiuntiva esclude dai piatti senza cottura prodotti ittici la cui prontezza al consumo non risulta documentata; l'audit elenca anche tali casi.

Con una regola allergene attiva, la ricetta deve risolvere tutte le revisioni incluse. Assenza di tag non significa compatibilità: servono evidenza completa, fonte e revisione. Le tracce note pertinenti escludono la proposta. I metadati noti vengono derivati dalla forma, mai dal concetto generico di ricerca. Le evidenze incomplete o non revisionate producono `safety_unverified`.

Il catalogo allegato non contiene valutazioni di sicurezza complete secondo il nuovo contratto: con un'allergia attiva può non essere generabile alcun piano. Non inventare attestazioni per rimuovere questo blocco. Le fixture con evidenza reviewed sono dichiaratamente sintetiche e restano nei test. La classificazione definitiva, i gruppi nel solver e l'overlay di incompatibilità dei piani esistenti sono R3/R5.

## Anteprime e interazioni

Generazione, estensione, sostituzione e riequilibrio emettono anteprime con identificatore di sessione, impronta del contenuto e del contesto letto dal repository. La conferma ricarica il contesto e rifiuta modifiche di configurazione, catalogo, record, gruppo o giornata. Le ricette vengono rivalidate rispetto alla sicurezza e alle capacità attuali. Il before del riequilibrio deriva dai giorni riletti. Il parametro `previewId` è obbligatorio per `commitReplacement`; una chiamata senza anteprima non effettua scritture.

Le anteprime scadono al reload; sono mantenute al massimo 32 per repository/sessione. La coda impedisce doppi commit nella stessa istanza e un'anteprima già usata non viene riapplicata dopo undo. Il confronto precedente alla scrittura NON chiude la concorrenza completa tra tab: ricevute persistenti e confronto atomico di tutto il comando restano R4. Non dichiarare HARD-04/05 soddisfatti interamente.

Sostituisci inserisce subito un pannello accanto al pasto, lo porta in vista e gestisce caricamento, risultati, nessun risultato ed errore. Un ID scarta risposte di richieste precedenti. Escape/Annulla chiudono e riportano il focus al pulsante. Le bozze di stato/note sono conservate per occorrenza; le note già salvate rimangono anche dopo la sostituzione. La conferma mostra esito e percorso verso la cronologia. Il pannello modale definitivo, l'esplorazione dei candidati e la sostituzione composta sono R4. Le misure di focus, tempi e viewport richiedono ancora il browser reale.

## Conversioni e scrittori V2

`quantitàDestinazione = quantitàOrigine × factor`. Una conversione `unit` conserva la forma; `shopping_yield` serve agli acquisti. Non applicare l'inversa se non registrata, non scegliere tacitamente fra fonti/versioni concorrenti, non usare conversioni non revisionate. Senza corrispondenza si restituisce `conversion_missing`; con più scelte `choice_required`. Il calcolo nutritivo usa sempre la revisione della riga e il suo peso normalizzato. Per schema 2 le vecchie conversioni prive di fonte non vengono riutilizzate.

`saveFoodGroup`, `saveIngredientConversion` e `saveIngredientMapping` aggiungono versioni senza riscriverne altre. `stageConfigurationV2` valida min/ideale/max, unità meal/day, finestre 1–90, target e scope e salva una bozza separata. `saveRecipe({schemaVersion:2,...})` produce versioni prive di instructions, con checksum e duplicazione compatibili. L'editor ordinario V1 e la rimozione end-to-end del procedimento saranno aggiornati in R2: non presentare il solo nuovo schema come completamento di REC-04.

## Verifica e confini

Eseguire `npm run revision:v2:test`, `npm run revision:v2:audit`, `npm test`, `npm run lint`, `npm run hardening:forms`, `npm run hardening:a11y`, `npm run build` e `npm run revision:v2:trace`. `npm run check` resta la catena storica A–H: non rigenerare le evidenze del freeze per farle apparire accettazione della nuova build. Gli snapshot G/H usano i byte della baseline conservata; il test R1 verifica separatamente versioni e cache correnti.

Cache nuove: shell v38 e data v18, coerenti fra service worker e offlineCatalog, con i nuovi moduli e schemi. Le prove Node/in-memory non sostituiscono una prova di IndexedDB, aggiornamento offline o accessibilità nel browser. Ogni blocco resta nel registro. Non promuovere questa build a stable sulla base di report H.
