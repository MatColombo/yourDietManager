# R2 — Ricerca, forme e ricette

**Implementazione consegnata; gate di accettazione BLOCCATO sulle prove reali del browser.** Build applicativa 1.1.0-dev.r3. Contratto: `specs/revision_v2/CONTRATTO_R2_R3.md`.

| Attività | Risultato | Evidenza / limite |
|---|---|---|
| R2.1 | Servizio e selettore comune concetto/forma; ricerca ingredienti delle ricette e alias IT/EN; invalidazione repository | Audit del catalogo e test di dominio. Touch, tastiera, cache cross-tab e offline da provare nel browser |
| R2.2 | 1.800 nuove versioni con titoli brevi; tre correzioni di identità con mapping | Tutti i titoli entro 70 caratteri; elenco completo in `evidence/titles.json`. Revisione editoriale R5 ancora aperta |
| R2.3 | Procedimento rimosso dai flussi operativi, nuovi checksum/versioni, export ordinario 2 | Nuovi test di autore italiano, duplicazione ed export/reimport. Lettore e backup V1 restano compatibili |
| R2.4 | Scelta forma prima della quantità, anteprima nutrizionale, fallback italiano, archetipi coerenti | Prova service: 50 g delle forme sintetiche A/B danno 50/100 kcal. Verifica dei form nel browser ancora aperta |

La migrazione conserva esattamente 600 revisioni originali e 1.800 ricette storiche. Le forme correnti restano 600, con 1.203 revisioni complessive: 600 originali, 600 R1, tre correzioni R2. Le ricette diventano 3.600 versioni, senza cancellazione dei record originari. Doppia esecuzione idempotente. I current locali vengono conservati.

I casi legati a fonte sono zucchini/zucchina, parmesan generico e mozzarella nonfat. Queste correzioni non aumentano artificialmente il numero degli ingredienti e non costituiscono equivalenze nutrizionali né certificazioni di sicurezza.

La prova sintetica Node su 10.000 forme, 30 ricerche, ha misurazioni in `evidence/catalog-and-search.json`. Non rappresenta la latenza end-to-end dell'interfaccia e non chiude un gate browser. I valori esatti e l'ambiente sono registrati nel file, non dedotti dalla complessità del codice.

Il peso finale dei nuovi record migrati è sconosciuto; la somma dei grammi è indicata come peso degli ingredienti. Tempi e praticità provenienti dal corpus legacy restano dichiarati non verificati, da revisionare in R5. Il planner conserva i metadati pratici legacy: questa consegna non ne certifica l'attendibilità editoriale.

Le superfici nuove di sostituzione avanzata R4 e spesa R6 dovranno riusare il selettore. ING-10 e gli scenari che attraversano quelle superfici non sono globalmente chiusi. La tracciabilità mantiene distinti implementazione e accettazione completa.
