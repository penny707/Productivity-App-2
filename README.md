# Milio

**Milo + Elio in één kleine app.** De vakken en taken van Elio, de kalender en focus-timer uit het Milo-plan, en een startscherm dat elke dag voor je kiest wat telt.

Lokaal, snel en zonder installatie: Python (enkel de standaardbibliotheek), SQLite en gewone HTML/CSS/JavaScript. Er gaat niets naar het internet.

## Starten

Dubbelklik op **`start_app.bat`**. Er opent een zwart venster (de server) en je browser opent `http://127.0.0.1:8766`.
Stoppen: sluit het zwarte venster of druk `Ctrl+C`.

Vereisten: Windows 10/11, Python 3.8 of nieuwer ("Add Python to PATH" aangevinkt), een moderne browser.

Milio gebruikt poort **8766**, Elio 8765. Je kan ze dus naast elkaar laten draaien.

## Wat zit erin

### Kompas (startscherm)
- **Eerst dit**: elke dag kiest Kompas maximaal drie taken, op basis van harde deadlines, je streefmomenten en wat er vandaag in je kalender staat. Bij elke taak staat waarom ("deadline morgen", "streefmoment vandaag", "volgende stap").
- De keuze blijft de hele dag staan, zodat de lijst echt af kan. Alles af? Dan zegt Kompas dat en mag de rest wachten (of je vraagt "Nog eentje").
- **Later** schuift een taak naar morgen, overmorgen of volgende week (zet het streefmoment), met ongedaan maken. Wat je wegschoof komt die dag niet terug.
- **Dagboog**: je dag als zonnebaan boven de bergen. Je events zijn gekleurde bogen, de zon staat op het huidige uur en de lucht kleurt mee met het moment van de dag.
- **Niet vergeten** (komende 7 dagen) en je agenda van vandaag. De rest wordt bewust weggestopt.

### Kalender
- Week- en maandweergave die **altijd in het scherm past**: geen scrollen, de uren schalen mee met je venster. Navigeren met de pijltjes bovenaan.
- Slepen in een lege plek maakt een event, een event slepen verplaatst het (ook naar een andere dag), de onderrand slepen verlengt. Alles klikt vast op een kwartier.
- Deadlines (vlag) en streefmomenten (klok) van je taken staan in de dagrij; klikken opent de taak.
- Events kunnen aan een vak en een taak gekoppeld worden. Focussessies zijn gestreept.
- In Instellingen kies je welke uren de kalender toont (standaard 7:00 tot 24:00).

### Vakken
- Zoals in Elio: vakken met onderdelen en sub-onderdelen, taken van het type opdracht, theorie of labo, met een harde deadline en/of een persoonlijk streefmoment.
- Elk vak is een **berg**: je voortgang is een wandelaar die het pad naar de top beklimt. Bij 100% staat er een vlag.
- Taken toevoegen gaat snel: typ en druk Enter, de cursor blijft staan voor de volgende.
- Per vak zie je hoeveel tijd je er deze week in je kalender aan besteedde (en hoeveel daarvan focus).

### Deadlines
Harde deadlines en streefmomenten apart, gegroepeerd in te laat, deze week en later. Meteen afvinkbaar.

### Focus
Kies een taak, start een timer (15 tot 90 minuten, of vrij), en werk boven een rustig berglandschap. Bij **Klaar** komt de sessie als blok in je kalender (afgerond op 5 minuten). De timer blijft lopen als je de pagina herlaadt en staat ook in de zijbalk en de tabtitel.

## Van Elio naar Milio

Is Milio nog leeg, dan biedt het Kompas meteen aan om je vakken, onderdelen en taken uit Elio over te nemen. Later kan dat ook via Instellingen (het tandwiel linksonder).
Milio zoekt Elio in de map naast deze (`..\Productivity App\data.db`) en opent die database **alleen-lezen**: Elio zelf verandert niet. Importeren kan één keer.

## Je gegevens

- Alles staat in **`data.db`** in deze map. Dat bestand gaat nooit mee naar GitHub (zie `.gitignore`).
- Backup = `data.db` kopiëren naar OneDrive of een USB-stick. Doe dat bv. wekelijks.
- Afgevinkte taken blijven bewaard (met het tijdstip waarop je ze afvinkte).

## Privacy en veiligheid

- De server luistert enkel op `127.0.0.1`: alleen je eigen pc kan erbij.
- Andere websites in je browser kunnen niet aan je data: de server weigert verzoeken met een vreemde `Host` (DNS-rebinding) of `Origin` (CSRF), en schrijven kan alleen met JSON, wat een andere site niet zonder CORS-toestemming mag sturen.
- Geen externe scripts, lettertypes of trackers.

## Sneltoetsen

| Waar | Toets | Doet |
| --- | --- | --- |
| Kalender | `←` `→` | vorige / volgende week of maand |
| Kalender | `T` | naar vandaag |
| Kalender | `W` / `M` | week- / maandweergave |
| Kalender | `N` | nieuw event |
| Focus | `spatie` | pauze / hervatten |
| Overal | `Esc` | venster sluiten, slepen annuleren |

## Mapstructuur

```
app.py              server + database (SQLite)
start_app.bat       dubbelklik om te starten
static/
  index.html
  css/              basis, vakken, kalender, vandaag (Kompas), focus
  js/
    main.js         opstart, routing, zijbalk
    store.js        alle data in het geheugen + opslaan
    util.js         DOM, iconen, datums, API
    modals.js       vensters en formulieren
    bergen.js       de getekende bergen
    instellingen.js
    views/          vandaag (Kompas), kalender, vakken, deadlines, focus
```

## Testen zonder je echte data

Start met een aparte database en poort, zonder browservenster:

```
set MILIO_DB=C:\temp\test.db
set MILIO_PORT=8799
python app.py --geen-browser
```

## Problemen?

- **"Python is niet gevonden"**: installeer Python en vink "Add Python to PATH" aan, of herstart je pc.
- **Poort bezet**: Milio draait waarschijnlijk al in een ander zwart venster.
- **Browser opent niet**: ga zelf naar `http://127.0.0.1:8766`.
- **Iets ziet er vreemd uit na een update**: herlaad de pagina met `Ctrl+F5`.
