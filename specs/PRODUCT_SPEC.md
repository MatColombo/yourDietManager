# yourDietManager — Product Spec V1

## 1. Visione

yourDietManager e una web app/PWA local-first che consente a una persona di definire il proprio sistema alimentare invece di adattarsi a una dieta costruita attorno a turni, orari o obiettivi prestabiliti.

La personalizzazione riguarda quattro livelli:

1. **profilo nutrizionale** — energia, macro, fibra e priorita;
2. **struttura temporale** — ciclo, classi giornata, slot e carry-over;
3. **preferenze alimentari** — globali e specifiche per classe pasto;
4. **esperienza** — lingua, tema, densita e colori.

## 2. Obiettivi V1

- Configurare un ciclo personale di 1–31 giorni.
- Creare classi giornata personalizzate mappate su archetipi fissi.
- Creare classi pasto personalizzate mappate su archetipi fissi.
- Definire pasti liberamente pianificabili e pasti esterni/mensa.
- Generare un piano alimentare usando cataloghi JSON di ingredienti e ricette importati e indicizzati in IndexedDB.
- Applicare allergie/intolleranze come hard constraints.
- Applicare target nutrizionali e preferenze come soft constraints pesati.
- Supportare overflow temporale tra date civili.
- Generare spesa per moltiplicatori di persone anche decimali.
- Operare in italiano e inglese, con timezone IANA e sistema di misura configurabili.
- Offrire tema e densita UI configurabili.
- Funzionare offline dopo il primo caricamento dei cataloghi scelti.

## 3. Non-obiettivi V1

- Diagnosi o prescrizione clinica.
- Backend multiutente o sincronizzazione cloud.
- Social network, condivisione pubblica o marketplace.
- Foto ricette.
- Backend database/server SQL/NoSQL. IndexedDB locale e invece parte esplicita della V1.
- Import automatico da database commerciali di terze parti.
- Generazione nutrizionale affidata a un LLM.

## 4. Utente target

Persona gia motivata e sufficientemente formata nell'uso dell'app, che vuole:

- adattare la dieta a turni o giornate non standard;
- scegliere la distribuzione dei pasti;
- controllare preferenze e alimenti esclusi;
- ottenere pianificazione, lista della spesa e riequilibrio senza rifare manualmente ogni giorno.

L'interfaccia ordinaria deve privilegiare velocita e densita informativa; finche l'onboarding e disabilitato, le spiegazioni essenziali devono essere contestuali o nella documentazione e nessuna funzione puo richiedere il completamento del wizard.

## 5. Onboarding

**Stato V1 RC:** il wizard iniziale e temporaneamente disabilitato perche la sua prima versione non esponeva con sufficiente completezza allergie, DayClass e reference data. Le installazioni nuove partono da una configurazione standard neutra e accedono direttamente all'app; `/onboarding` mostra soltanto l'avviso di sospensione e rimanda a `Configura`. Il wizard verra ridisegnato dopo il Data/UX hardening e non costituisce un prerequisito per consultare catalogo o usare gli editor.

Quando verra riattivato, l'ordine raccomandato resta:

1. Lingua, unita e tema.
2. Profilo nutrizionale.
3. Allergie e intolleranze.
4. Preferenze alimentari globali.
5. Classi pasto.
6. Classi giornata.
7. Ciclo 1–31 giorni.
8. Cataloghi ricette attivi e bootstrap/import locale con verifica spazio.
9. Anteprima del piano.
10. Generazione e conferma.

Il futuro onboarding potra salvare una bozza dopo ogni step; fino alla riattivazione la configurazione standard e gli editor `Configura` sono il percorso autorevole.

## 6. Navigazione ordinaria

Toolbar primaria consigliata:

- Oggi
- Calendario
- Ricette
- Spesa

Area secondaria `Configura`:

- Profilo nutrizionale
- Allergie e intolleranze
- Preferenze
- Classi pasto
- Classi giornata
- Ciclo
- Ingredienti
- Tema
- Lingua
- Backup

## 7. Principio di conferma

Le operazioni che modificano molti giorni devono seguire:

`analisi -> proposta -> selezione -> anteprima -> conferma unica -> undo unico`.

Nessun cambio di preferenza deve riscrivere silenziosamente il piano gia generato.

## 8. Success metrics di prodotto

- Una modifica ordinaria della giornata richiede massimo 1 schermata e 1 conferma.
- Un nuovo ciclo base puo essere configurato senza modificare codice.
- Una nuova classe giornata o pasto non richiede build dell'app.
- Una nuova lingua UI non richiede modifiche alla logica di dominio.
- 10.000 ricette non generano 10.000 pagine HTML.
- Il generatore non produce pasti automatici con porzioni frazionate/maggiorate di ricetta.

## 9. Persistenza V1

V1 e una PWA senza backend ma non e data-less: usa IndexedDB come database locale strutturato. I cataloghi continuano a essere distribuiti in JSON e i dati utente restano esportabili/importabili in JSON. Nessun account o server e richiesto.

## UX addition — gestione contenuti catalogo

La navigazione `Configura` mantiene Ingredienti come punto di gestione del catalogo ingredienti. La sezione `Ricette` include il punto di ingresso `Nuova ricetta`, ricerca/filtri, dettaglio e modifica. La consultazione di ricette/ingredienti e indipendente dall'esistenza di un piano.

Qualunque famiglia corrente, distribuita o creata localmente, e modificabile. La modifica e trasparente all'utente ma crea una nuova IngredientRevision/RecipeVersion e preserva lo storico. Alla prima modifica di una family distribuita, la family mantiene lo stesso ID stabile e passa a gestione locale; gli aggiornamenti del catalogo non devono sovrascrivere il current pointer locale.

`Duplica` resta un'azione separata che crea una nuova family; non e un prerequisito per modificare contenuto del catalogo. I filtri di origine distinguono provenienza/gestione (`Catalogo`/`Locale`), non editabilita.
