# I18N Spec V1

## 1. Lingue iniziali

- `it`
- `en`

Fallback: `en`.

## 2. UI strings

Mai hardcodare testo UI nei moduli di dominio.

Usare chiavi:

```text
nav.today
nav.calendar
dayArchetype.night
mealArchetype.breakfast
shopping.today
```

## 3. Catalog data

Recipe e ingredient IDs sono language-neutral.

Testi localizzati in oggetto `i18n`.

Per ingredienti:

```json
"i18n": {
  "it":{"name":"Salmone"},
  "en":{"name":"Salmon"}
}
```

## 4. User content

Classi giornata/pasto e ricette custom possono essere salvate come label libera nella lingua dell'utente in IndexedDB. La traduzione automatica e opzionale e non richiesta V1.


## 5. Timezone e unita

`timeZone` e un ID IANA (es. `Europe/Rome`) salvato in AppConfig e usato per interpretare date/orari del piano. Il browser timezone e solo default iniziale.

Le quantita canoniche del dominio restano metriche (`g`/`ml`); `measurementSystem` controlla il display e gli input convertibili. Le conversioni non devono cambiare i nutrienti canonici.

## 6. Formatting

Usare `Intl` per:

- date;
- numeri;
- unita visuali dove appropriato.

I dati JSON canonici usano punto decimale e formati ISO indipendenti dalla lingua.

## 7. Nuove lingue

Aggiungere una lingua non deve richiedere modifiche a enum o logica. Il quality gate deve verificare coverage delle chiavi UI obbligatorie.

## 8. Persistenza locale

Locale e contenuti user restano record JSON-serializzabili in IndexedDB. Eventuali search token localizzati del catalogo possono essere precomputati per locale e indicizzati senza cambiare gli ID canonici.
