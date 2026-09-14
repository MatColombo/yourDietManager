# Contratto vincolante R4/R5 — 1.1.0-dev.r5

La richiesta «facciamo R4 e R5» autorizza queste fasi e i prerequisiti. Non autorizza R6, pubblicazione di un sito o promozione stable. La baseline e gli ID della revisione restano invariati. Questo documento dettaglia l’implementazione; non riduce i criteri di accettazione di `FASI_SVILUPPO.md`.

## R4.1 — Sostituzione contestuale

1. Aprire un `dialog.showModal()` nello stesso handler del click, prima di attendere il repository. Desktop: drawer laterale; fino a 640px: intero viewport. Mostrare classe pasto, ricette correnti, caricamento e Annulla.
2. Un contatore monotonico di richiesta elimina ogni risposta obsoleta. Annulla/Escape invalidano il contatore; la risposta tardiva non modifica DOM o DB. La modale usa il focus nativo, titolo focalizzabile e ritorno al comando originario. Durante il commit impedire un secondo invio.
3. Stati: loading, results, empty, error, confirming, success, cancelled. In errore mantenere Riprova e Annulla. Mai utilizzare alert come unica risposta nei flussi ordinari modificati.
4. Mostrare fino a otto risultati per pagina. Ricercare su titolo e campi degli ingredienti; filtro concetto con il selettore comune; filtro tempo in minuti. Paginare l’insieme ammissibile restituito dal retrieval, dichiarando il limite di ricerca di 500 candidati per archetipo. Non dichiarare impossibilità matematica quando la ricerca è limitata.
5. Presentare titoli, componenti, energia, variazione giornaliera e frequenze con il contatore R3. Le compatibilità sono valide per lo snapshot e vengono ricontrollate al commit. I tempi legacy restano non verificati editorialmente: R5 non li ha promossi.
6. Bozze di aderenza e note indicizzate per giornata/slot sopravvivono al render della sostituzione. Note salvate restano collegate all’occorrenza. Il pulsante Annulla modifica usa la history.

## R4.2 — Componenti e porzioni

`componentIndex=null` indica Intero pasto. Un indice intero valido sostituisce esattamente quella posizione e conserva gli altri oggetti mediante clone completo. Ogni componente aggiunto ha `servings=1`. Mai ricavare una porzione diversa per soddisfare l’energia.

`MealClass.maxComponents` è opzionale, intero 1–3, default storico 3; schema canonico e mirror coincidono. Il generatore, il validatore finale e la sostituzione rispettano il limite. L’editor offre applicazione esplicita dei preset uno/tre componenti senza cambiare altri valori.

Più ricette possono essere proposte insieme soltanto attraverso `meta.approvedMealCompositions`: status approved, revisore, data, archetipo, ID delle versioni e SHA-256 canonico dell’array completo delle versioni. L’array mantiene l’ordine dichiarato. Non dedurre una composizione culinaria dall’energia totale. La build non contiene composizioni con approvazioni inventate; le fixture approvate sono esclusivamente test sintetici. Senza composizioni disponibili restituire ricerca esaurita, non infeasibilità provata.

## R4.3 — Confine transazionale

`commitPlanPreview` delega a `commitGeneratedPreview`: non è più un percorso alternativo che evita history e controlli.

Il repository riceve `expected` (store/key/value) ed `expectedStores` (snapshot completi). Una singola transazione IndexedDB readwrite su tutti gli store interessati esegue, nell’ordine:

1. confronto dei record autorevoli e dei read set, incluso puntatore history;
2. confronto assenza della ricevuta `planCommand:<commandId>`;
3. applicazione del piano, aggiornamento history, invalidazione del ramo redo e ricevuta;
4. commit unico. Un errore sincrono di serializzazione o asincrono abortisce la transazione.

Il before dell’operazione è accettato solo se identico ai record autorevoli confrontati nella transazione. Non rileggere il before da una preview obsoleta. Il confronto dei valori, inclusi assente/null, è canonico. Gli snapshot completi controllano anche righe nuove o eliminate nella configurazione/catalogo/finestra del piano. Gli snapshot possono essere costosi: non sostituirli con un token in memoria; una futura ottimizzazione deve mantenere lo stesso isolamento.

Le preview sono temporanee e scadono al reload. La ricevuta è persistente; non cancellarla durante undo. Un replay del comando è rifiutato senza una nuova operazione. Undo/redo confrontano puntatore, operazione e stato atteso prima di ripristinare. BroadcastChannel è solo invalidazione cache.

Le transazioni fra schede e l’abort nativo restano da dimostrare nel browser reale. Le prove in memoria non certificano il comportamento di IndexedDB.

La spesa mantiene la gestione di obsolescenza precedente basata su timestamp: il digest dei soli input materiali e l’accettazione completa di T47/T58 sono R6, come previsto nel piano. Non dichiarare già risolte queste parti.

## R4.4–R4.6 — UX e profilo

Navigazione primaria Oggi/Calendario/Ricette/Spesa. Controlli tecnici della shell dentro Diagnostica avanzata. Calendario mobile a elenco con nome della classe oltre al colore. Un titolo per ricetta nella card pasto. Inglese/sinonimi ingrediente, classificazioni ricetta e dettagli nutrizionali in disclosure controllati: aprire/chiudere non ricrea né cambia i valori. I campi obbligatori restano raggiungibili.

`/onboarding` usa il percorso R4 a sei passi: lingua/fuso, sicurezza, struttura, preferenze, obiettivi, anteprima. La bozza `phase2OnboardingDraft` versione 2 conserva bundle, passo, dichiarazioni e sezioni visitate. Salva e riprendi non attiva il profilo. Il completamento salva configurazione, dichiarazione e metadati in un’unica transazione.

Sicurezza: unverified, none_declared, rules_declared. Non inferire nessuna allergia da un array vuoto; rifiutare none_declared con regole attive e rules_declared senza regole. Conservare SHA-256 del profilo nella dichiarazione: modifiche successive rendono il riepilogo non verificato. Obiettivi dimostrativi espliciti; nessuna soglia clinica nuova. Configurazione e catalogo restano accessibili anche senza onboarding completato.

Registrare separatamente focus, touch, zoom, contrasto, IT/EN e overflow su desktop/mobile. L’audit del sorgente non certifica questi scenari. Applicare il dirty guard alla nuova route. Non forzare render su editor sporchi.

## R5.1 — Manifest e pilot

`data/revision-v2/mediterranean/manifest.json` è un intake nominale: 200 concetti, 307 forme; nove gruppi con quote CAT-02 esatte. Ogni riga ha ID, nome, gruppo, alias, priorità, forme e fonte da risolvere. Il pilot seleziona esattamente 40 concetti/60 forme da questi stessi ID e include prodotto composto, crudo/cotto, secco/sgocciolato e alias italiani.

`dish-briefs.json`: 120 proposte distinte, ripartite 15/15/35/30/25. Non sono ricette pubblicate. Quantità, tempi, peso finale, nutrienti e review sono irrisolti; vietato riempirli con valori plausibili per superare un conteggio.

I conteggi `planned` e `reviewed` non sono intercambiabili. Una forma non conta come un concetto diverso. Le vecchie 1.800 combinazioni non vengono rinominate per soddisfare il target.

## R5.2 — Fonti e nutrienti

Adapter separati CREA, CIQUAL, USDA e LABEL in `src/corpus/mediterranean/sourceAdapters.js`.

- Ricevere versione, URL, data di acquisizione, evidenza delle condizioni, identità del record e base edibile per 100g esplicita. L’estrazione manuale è ammessa con attribuzione. La base in porzioni o ml non viene reinterpretata: richiede trasformazione esplicita aggiuntiva.
- Conservare l’input completo ricevuto e SHA-256 canonico. Gli estratti CREA consegnati sono trascrizioni di sei nutrienti, non archivi completi HTML; l’hash identifica l’estratto.
- Richiedere unità e definizione per ogni nutriente. Unità inattesa blocca la normalizzazione. Preservare energia della fonte: CREA Southgate, USDA General/Specific. Non applicare 4/4/9 indiscriminatamente.
- USDA: Foundation preferisce 2047, poi 2048, poi 1008; SR Legacy 1008 prima degli altri. Branded non passa dall’adapter USDA generico.
- Missing, trace, below_quantification e zero hanno stati distinti. Missing/trace non diventano 0; se essenziali bloccano il record. Carboidrati totali USDA e disponibili CREA mantengono definizioni diverse: nessuna equivalenza automatica.
- LABEL richiede identità esatta del prodotto e autorizzazione di riuso, oltre agli stessi controlli.

Fonti consultate il 2026-09-11: [CREA](https://www.alimentinutrizione.it/tabelle-nutrizionali), [Ciqual 2025](https://ciqual.anses.fr/cms/fr/la-table-ciqual-2025), [USDA FoodData Central](https://fdc.nal.usda.gov/). CREA espone richiesta di attribuzione; FDC dichiara CC0. Per Ciqual la versione 2025 è identificata, ma il pacchetto e le condizioni specifiche non sono acquisiti/verificati in questa consegna: nessun riuso dato per scontato.

Estratti effettivi: [ceci secchi](https://www.alimentinutrizione.it/tabelle-nutrizionali/004000), [bolliti](https://www.alimentinutrizione.it/tabelle-nutrizionali/004005), [in scatola sgocciolati](https://www.alimentinutrizione.it/tabelle-nutrizionali/004010). Le differenze restano tali; i nutrienti non provano assenza di allergeni/tracce. Il descrittore inglese del record in scatola contiene “raw”: conservato come ambiguità da revisionare.

## R5.3–R5.4 — Revisione e pubblicazione

Eseguire `npm run revision:v2:mediterranean`: genera staging, hash e copertura, senza attivare cataloghi. Per decisioni realmente ricevute usare `node scripts/revision-v2/import-mediterranean-reviews.mjs <file.json>` e poi rigenerare. Il comando rifiuta record, mapping o digest non corrispondenti. Le decisioni persistono separatamente e non sono azzerate dallo staging.

Ogni approvazione nutrizionale/sicurezza/culinaria deve avere dimensione, reviewer, actorType=human, reviewedAt, evidence e digest vincolato al contenuto e mapping. I controlli automatici sono separati e non diventano firme umane. Questo è controllo di coerenza locale delle attestazioni, non autenticazione crittografica dell’identità del revisore.

Il report `quarantine-dispositions.json` conserva tutti gli ID e motivi R0, lo SHA del manifest originale e la destinazione. Le voci senza revisione restano escluse. Non certificare una correzione per semplice scomparsa dal catalogo.

**Gate attuale R5: BLOCCATO.** Tre estratti acquisiti; zero forme con tutte le revisioni richieste. Il pilot 40/60 non è accettato. La scala 200/300, le 120 ricette materializzate, i controlli dei 1.800 titoli legacy e la fattibilità del nuovo catalogo sui profili di test non sono eseguiti. Non pubblicare un nuovo catalogo finché mancano questi prerequisiti. Completare fonti/mapping/review pilot, poi ricette e scala; mantenere i manifest di piano già consegnati.
