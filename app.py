# app.py
# Milio - lokale server. Enkel de Python-standaardbibliotheek, niets te installeren.
# Start met: python app.py   (opent http://127.0.0.1:8766)
# Zonder zwart venster: start_app.pyw (daar wijst de bureaubladsnelkoppeling naar).
#
# Opties:
#   --geen-browser     open geen venster bij het starten
# Omgevingsvariabelen (handig om te testen zonder je echte data aan te raken):
#   MILIO_DB=pad\naar\test.db   MILIO_PORT=8799

import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

# ----------------------------------------------------------------------------
# Configuratie
# ----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("MILIO_DB") or os.path.join(BASE_DIR, "data.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")
HOST = "127.0.0.1"
PORT = int(os.environ.get("MILIO_PORT") or 8766)
URL = f"http://{HOST}:{PORT}/"
APP_ID = "milio"
VENSTER_TITEL = "Milio"  # gelijk aan <title> in static/index.html
BACKUP_DIR = os.path.join(os.path.dirname(DB_PATH), "backups")
BACKUPS_BEWAREN = 14
SERVER = None

# Vingerafdruk van deze code: draait er bij het starten nog een oudere versie
# (bv. na een update), dan wordt die automatisch vervangen.
with open(os.path.abspath(__file__), "rb") as _f:
    CODE_VERSIE = hashlib.sha1(_f.read()).hexdigest()[:12]
# Elio kan op meerdere plaatsen staan; we nemen de database die het laatst gebruikt werd.
# Die wordt enkel gelezen (read-only). MILIO_ELIO=pad\naar\data.db wijst er zelf een aan.
ELIO_KANDIDATEN = [
    os.environ.get("MILIO_ELIO") or "",
    os.path.join(os.path.dirname(BASE_DIR), "Productivity App", "data.db"),
    os.path.join(os.path.expanduser("~"), "Documents", "GitHub", "Productivity App", "data.db"),
    os.path.join(os.path.expanduser("~"), "Documents", "Productivity App", "data.db"),
]


def elio_pad():
    if os.environ.get("MILIO_ELIO"):
        return os.environ["MILIO_ELIO"]
    gevonden = [p for p in ELIO_KANDIDATEN if p and os.path.isfile(p)]
    return max(gevonden, key=os.path.getmtime) if gevonden else ELIO_KANDIDATEN[1]

STANDAARD_INSTELLINGEN = {
    "thema": "dark",
    "sidebar_ingeklapt": "0",
    "naam": "",
    "dag_start": "7",
    "dag_eind": "24",
    "animaties": "1",
    "verberg_klaar": "0",
}


# ----------------------------------------------------------------------------
# Database
# ----------------------------------------------------------------------------
def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS vakken (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            naam TEXT NOT NULL,
            kleur TEXT NOT NULL DEFAULT '#5B7FD6',
            volgorde INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS onderdelen (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vak_id INTEGER NOT NULL REFERENCES vakken(id) ON DELETE CASCADE,
            parent_id INTEGER REFERENCES onderdelen(id) ON DELETE CASCADE,
            titel TEXT NOT NULL,
            volgorde INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS taken (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            onderdeel_id INTEGER NOT NULL REFERENCES onderdelen(id) ON DELETE CASCADE,
            titel TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'opdracht',
            klaar INTEGER NOT NULL DEFAULT 0,
            klaar_op TEXT,
            deadline TEXT,
            streefdatum TEXT,
            notitie TEXT NOT NULL DEFAULT '',
            volgorde INTEGER NOT NULL DEFAULT 0
        );

        -- start/eind: 'YYYY-MM-DDTHH:MM' in lokale tijd, of 'YYYY-MM-DD' bij hele dag
        -- (bij hele dag is eind de laatste dag zelf).
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            titel TEXT NOT NULL DEFAULT '',
            start TEXT NOT NULL,
            eind TEXT NOT NULL,
            hele_dag INTEGER NOT NULL DEFAULT 0,
            vak_id INTEGER REFERENCES vakken(id) ON DELETE SET NULL,
            taak_id INTEGER REFERENCES taken(id) ON DELETE SET NULL,
            kleur TEXT,
            soort TEXT NOT NULL DEFAULT 'gepland',
            notitie TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS instellingen (
            sleutel TEXT PRIMARY KEY,
            waarde TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_onderdelen_vak ON onderdelen(vak_id);
        CREATE INDEX IF NOT EXISTS idx_taken_onderdeel ON taken(onderdeel_id);
        CREATE INDEX IF NOT EXISTS idx_events_start ON events(start);
        """
    )
    conn.executemany(
        "INSERT OR IGNORE INTO instellingen (sleutel, waarde) VALUES (?, ?)",
        STANDAARD_INSTELLINGEN.items(),
    )
    conn.commit()
    conn.close()


def maak_backup():
    """
    Eén backup per dag in backups/data-JJJJ-MM-DD.db, via de SQLite backup-API
    (veilig terwijl Milio draait). Enkel de laatste BACKUPS_BEWAREN blijven.
    """
    if not os.path.isfile(DB_PATH):
        return
    os.makedirs(BACKUP_DIR, exist_ok=True)
    doel = os.path.join(BACKUP_DIR, f"data-{datetime.now():%Y-%m-%d}.db")
    if not os.path.exists(doel):
        tijdelijk = doel + ".bezig"  # pas hernoemen als de kopie volledig is
        bron, kopie = sqlite3.connect(DB_PATH), sqlite3.connect(tijdelijk)
        try:
            bron.backup(kopie)
        finally:
            kopie.close()
            bron.close()
        os.replace(tijdelijk, doel)
    backups = sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith("data-") and f.endswith(".db"))
    for oud in backups[:-BACKUPS_BEWAREN]:
        os.remove(os.path.join(BACKUP_DIR, oud))


def backup_lus():
    # Milio kan dagen blijven draaien: kijk elk uur of de backup van vandaag er al is.
    while True:
        time.sleep(3600)
        try:
            maak_backup()
        except Exception:
            pass


# ----------------------------------------------------------------------------
# Validatie: elke kolom die de API mag schrijven heeft een kleine controlefunctie.
# ----------------------------------------------------------------------------
class Fout(Exception):
    def __init__(self, bericht, status=400):
        super().__init__(bericht)
        self.status = status


DATUM = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MOMENT = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")
KLEUR = re.compile(r"^#[0-9a-fA-F]{6}$")


def tekst(max_len, verplicht=False):
    def check(v):
        v = ("" if v is None else str(v)).strip()[:max_len]
        if verplicht and not v:
            raise Fout("Dit veld mag niet leeg zijn.")
        return v
    return check


def geheel(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        raise Fout("Ongeldig getal.")


def id_of_null(v):
    return None if v in (None, "", 0) else geheel(v)


def waar(v):
    return 1 if v in (True, 1, "1", "true") else 0


def datum_of_null(v):
    if not v:
        return None
    if not DATUM.match(str(v)):
        raise Fout("Ongeldige datum.")
    return str(v)


def moment(v):
    v = str(v or "")
    if not (DATUM.match(v) or MOMENT.match(v)):
        raise Fout("Ongeldig tijdstip.")
    return v


def kleur(v):
    if not KLEUR.match(str(v or "")):
        raise Fout("Ongeldige kleur.")
    return str(v)


def kleur_of_null(v):
    return kleur(v) if v else None


def een_van(*opties):
    def check(v):
        if v not in opties:
            raise Fout("Ongeldige keuze.")
        return v
    return check


# tabel -> (kolommen met controle, verplichte kolommen bij aanmaken, kolom die de volgorde groepeert)
TABELLEN = {
    "vakken": (
        {"naam": tekst(80, True), "kleur": kleur, "volgorde": geheel},
        ["naam"],
        None,
    ),
    "onderdelen": (
        {"vak_id": geheel, "parent_id": id_of_null, "titel": tekst(120, True), "volgorde": geheel},
        ["vak_id", "titel"],
        "vak_id",
    ),
    "taken": (
        {
            "onderdeel_id": geheel,
            "titel": tekst(160, True),
            "type": een_van("opdracht", "theorie", "labo"),
            "klaar": waar,
            "deadline": datum_of_null,
            "streefdatum": datum_of_null,
            "notitie": tekst(4000),
            "volgorde": geheel,
        },
        ["onderdeel_id", "titel"],
        "onderdeel_id",
    ),
    "events": (
        {
            "titel": tekst(160),
            "start": moment,
            "eind": moment,
            "hele_dag": waar,
            "vak_id": id_of_null,
            "taak_id": id_of_null,
            "kleur": kleur_of_null,
            "soort": een_van("gepland", "focus"),
            "notitie": tekst(4000),
        },
        ["start", "eind"],
        False,
    ),
}


def controleer_event(rij):
    """Start en eind moeten van hetzelfde soort zijn en eind mag niet voor start liggen."""
    lang = 10 if rij["hele_dag"] else 16
    if len(rij["start"]) != lang or len(rij["eind"]) != lang:
        raise Fout("Start en einde passen niet bij 'hele dag'.")
    if rij["eind"] < rij["start"] or (not rij["hele_dag"] and rij["eind"] == rij["start"]):
        raise Fout("Het einde moet na het begin liggen.")


def controleer_onderdeel(cur, rij):
    if rij.get("parent_id"):
        cur.execute("SELECT vak_id FROM onderdelen WHERE id = ?", (rij["parent_id"],))
        p = cur.fetchone()
        if not p or p["vak_id"] != rij["vak_id"]:
            raise Fout("Ongeldig bovenliggend onderdeel.")


def nu():
    return datetime.now().strftime("%Y-%m-%dT%H:%M")


def schoon(tabel, body, alles_verplicht):
    velden, verplicht, _ = TABELLEN[tabel]
    uit = {}
    for k, check in velden.items():
        if k in body:
            uit[k] = check(body[k])
    if alles_verplicht:
        for k in verplicht:
            if k not in uit:
                raise Fout(f"'{k}' is verplicht.")
    return uit


def lees_rij(cur, tabel, rid):
    cur.execute(f"SELECT * FROM {tabel} WHERE id = ?", (rid,))
    r = cur.fetchone()
    if not r:
        raise Fout("Niet gevonden.", 404)
    return dict(r)


def maak(conn, tabel, body):
    cur = conn.cursor()
    rij = schoon(tabel, body, True)
    groep = TABELLEN[tabel][2]
    if groep is not False and "volgorde" not in rij:
        if groep:
            cur.execute(f"SELECT COALESCE(MAX(volgorde), -1) + 1 FROM {tabel} WHERE {groep} = ?", (rij[groep],))
        else:
            cur.execute(f"SELECT COALESCE(MAX(volgorde), -1) + 1 FROM {tabel}")
        rij["volgorde"] = cur.fetchone()[0]
    if tabel == "events":
        rij.setdefault("hele_dag", 0)
        controleer_event(rij)
    if tabel == "onderdelen":
        controleer_onderdeel(cur, rij)
    if tabel == "taken" and rij.get("klaar"):
        rij["klaar_op"] = nu()
    kolommen = ", ".join(rij)
    vraag = ", ".join("?" for _ in rij)
    cur.execute(f"INSERT INTO {tabel} ({kolommen}) VALUES ({vraag})", list(rij.values()))
    return lees_rij(cur, tabel, cur.lastrowid)


def wijzig(conn, tabel, rid, body):
    cur = conn.cursor()
    oud = lees_rij(cur, tabel, rid)
    rij = schoon(tabel, body, False)
    if tabel == "onderdelen":
        rij.pop("vak_id", None)  # een onderdeel verhuist niet naar een ander vak
        if rij.get("parent_id") == rid:
            raise Fout("Een onderdeel kan niet onder zichzelf staan.")
        controleer_onderdeel(cur, {**oud, **rij})
    if tabel == "events":
        controleer_event({**oud, **rij})
    if tabel == "taken" and "klaar" in rij and rij["klaar"] != oud["klaar"]:
        rij["klaar_op"] = nu() if rij["klaar"] else None
    if rij:
        sets = ", ".join(f"{k} = ?" for k in rij)
        cur.execute(f"UPDATE {tabel} SET {sets} WHERE id = ?", [*rij.values(), rid])
    return lees_rij(cur, tabel, rid)


def alle(cur, sql, args=()):
    cur.execute(sql, args)
    return [dict(r) for r in cur.fetchall()]


def lees_instellingen(cur):
    return {r["sleutel"]: r["waarde"] for r in alle(cur, "SELECT * FROM instellingen")}


# ----------------------------------------------------------------------------
# Elio-import: kopieert vakken, onderdelen en taken uit Elio's data.db.
# Die database wordt read-only geopend, Elio zelf blijft onaangeroerd.
# ----------------------------------------------------------------------------
def elio_status(cur):
    inst = lees_instellingen(cur)
    pad = elio_pad()
    gevonden = os.path.isfile(pad)
    return {
        "gevonden": gevonden,
        "pad": pad,
        "laatst_gebruikt": datetime.fromtimestamp(os.path.getmtime(pad)).strftime("%Y-%m-%dT%H:%M") if gevonden else None,
        "geimporteerd_op": inst.get("elio_import"),
    }


def importeer_elio(conn):
    cur = conn.cursor()
    status = elio_status(cur)
    if status["geimporteerd_op"]:
        raise Fout("Elio is al eens geïmporteerd.")
    if not status["gevonden"]:
        raise Fout(f"Geen Elio-database gevonden op {status['pad']}.")

    uri = "file:" + status["pad"].replace("\\", "/") + "?mode=ro"
    bron = sqlite3.connect(uri, uri=True)
    bron.row_factory = sqlite3.Row
    try:
        b = bron.cursor()
        vakken = alle(b, "SELECT * FROM vakken ORDER BY volgorde, id")
        onderdelen = alle(b, "SELECT * FROM onderdelen ORDER BY volgorde, id")
        taken = alle(b, "SELECT * FROM taken ORDER BY volgorde, id")
    finally:
        bron.close()

    cur.execute("SELECT COALESCE(MAX(volgorde), -1) + 1 FROM vakken")
    start_volgorde = cur.fetchone()[0]
    vak_map, ond_map = {}, {}
    for i, v in enumerate(vakken):
        k = v["kleur"] if KLEUR.match(v["kleur"] or "") else "#5B7FD6"
        cur.execute("INSERT INTO vakken (naam, kleur, volgorde) VALUES (?, ?, ?)", (v["naam"], k, start_volgorde + i))
        vak_map[v["id"]] = cur.lastrowid

    # Ouders eerst: herhaal tot alle onderdelen met een gekende ouder geplaatst zijn.
    rest = [o for o in onderdelen if o["vak_id"] in vak_map]
    while rest:
        volgende = []
        for o in rest:
            if o["parent_id"] and o["parent_id"] not in ond_map:
                volgende.append(o)
                continue
            cur.execute(
                "INSERT INTO onderdelen (vak_id, parent_id, titel, volgorde) VALUES (?, ?, ?, ?)",
                (vak_map[o["vak_id"]], ond_map.get(o["parent_id"]), o["titel"], o["volgorde"]),
            )
            ond_map[o["id"]] = cur.lastrowid
        if len(volgende) == len(rest):
            break  # wezen zonder ouder: overslaan
        rest = volgende

    aantal_taken = 0
    for t in taken:
        if t["onderdeel_id"] not in ond_map:
            continue
        cur.execute(
            """INSERT INTO taken (onderdeel_id, titel, type, klaar, deadline, streefdatum, volgorde)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                ond_map[t["onderdeel_id"]],
                t["titel"],
                t["type"] if t["type"] in ("opdracht", "theorie", "labo") else "opdracht",
                1 if t["klaar"] else 0,
                t["deadline"],
                t["streefdatum"],
                t["volgorde"],
            ),
        )
        aantal_taken += 1

    cur.execute(
        "INSERT OR REPLACE INTO instellingen (sleutel, waarde) VALUES ('elio_import', ?)",
        (nu(),),
    )
    return {"vakken": len(vak_map), "onderdelen": len(ond_map), "taken": aantal_taken}


# ----------------------------------------------------------------------------
# HTTP
# ----------------------------------------------------------------------------
CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class AppHandler(BaseHTTPRequestHandler):
    server_version = "Milio/1.0"

    def log_message(self, fmt, *args):
        pass  # stil, net als Elio

    def stuur(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def lees_body(self):
        lengte = int(self.headers.get("Content-Length") or 0)
        if lengte <= 0:
            return {}
        try:
            data = json.loads(self.rfile.read(lengte).decode("utf-8"))
        except ValueError:
            raise Fout("Ongeldige JSON.")
        if not isinstance(data, dict):
            raise Fout("Ongeldige JSON.")
        return data

    def api(self, methode, delen, query):
        body = self.lees_body() if methode in ("POST", "PUT") else {}
        conn = get_conn()
        try:
            with conn:
                cur = conn.cursor()
                bron = delen[1] if len(delen) > 1 else ""

                if bron == "status" and methode == "GET":
                    return {"app": APP_ID, "versie": CODE_VERSIE}

                if bron == "afsluiten" and methode == "POST":
                    threading.Thread(target=SERVER.shutdown, daemon=True).start()
                    return {"ok": True}

                if bron == "data" and methode == "GET":
                    return {
                        "vakken": alle(cur, "SELECT * FROM vakken ORDER BY volgorde, id"),
                        "onderdelen": alle(cur, "SELECT * FROM onderdelen ORDER BY volgorde, id"),
                        "taken": alle(cur, "SELECT * FROM taken ORDER BY volgorde, id"),
                        "instellingen": lees_instellingen(cur),
                    }

                if bron == "events" and methode == "GET" and len(delen) == 2:
                    van = datum_of_null(query.get("van", [None])[0])
                    tot = datum_of_null(query.get("tot", [None])[0])
                    if not van or not tot:
                        raise Fout("'van' en 'tot' zijn verplicht.")
                    return alle(
                        cur,
                        "SELECT * FROM events WHERE start < ? AND eind >= ? ORDER BY start, id",
                        (tot, van),
                    )

                if bron == "instellingen" and methode == "PUT":
                    for k, v in body.items():
                        cur.execute(
                            "INSERT INTO instellingen (sleutel, waarde) VALUES (?, ?) "
                            "ON CONFLICT(sleutel) DO UPDATE SET waarde = excluded.waarde",
                            (str(k)[:60], str(v)[:20000]),
                        )
                    return lees_instellingen(cur)

                if bron == "elio":
                    if methode == "GET":
                        return elio_status(cur)
                    if methode == "POST":
                        return importeer_elio(conn)

                if bron in TABELLEN:
                    if len(delen) == 2 and methode == "POST":
                        return maak(conn, bron, body)
                    if len(delen) == 3:
                        rid = geheel(delen[2])
                        if methode == "PUT":
                            return wijzig(conn, bron, rid, body)
                        if methode == "DELETE":
                            cur.execute(f"DELETE FROM {bron} WHERE id = ?", (rid,))
                            return {"ok": True}

                raise Fout("API-route niet gevonden.", 404)
        except sqlite3.IntegrityError:
            raise Fout("Dit verwijst naar iets dat niet (meer) bestaat.")
        finally:
            conn.close()

    def vertrouwd(self, methode):
        """
        Enkel Milio zelf mag de API gebruiken, geen andere websites in je browser:
        - Host moet 127.0.0.1/localhost zijn (blokkeert DNS-rebinding),
        - een Origin-header moet van Milio zelf komen (blokkeert CSRF),
        - schrijven vraagt JSON; dat kan een andere site niet sturen zonder
          CORS-toestemming, en die geeft deze server nooit.
        """
        eigen = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
        if self.headers.get("Host", "") not in eigen:
            return False
        origin = self.headers.get("Origin")
        if origin and urlparse(origin).netloc not in eigen:
            return False
        if methode in ("POST", "PUT"):
            return (self.headers.get("Content-Type") or "").startswith("application/json")
        return True

    def dispatch(self, methode):
        url = urlparse(self.path)
        delen = [d for d in url.path.split("/") if d]

        if not self.vertrouwd(methode):
            self.stuur({"fout": "Geweigerd: dit verzoek kwam niet van Milio zelf."}, 403)
            return

        if delen and delen[0] == "api":
            try:
                self.stuur(self.api(methode, delen, parse_qs(url.query)))
            except Fout as f:
                self.stuur({"fout": str(f)}, f.status)
            except Exception as e:  # onverwacht: toon het, maar laat de server leven
                self.stuur({"fout": f"Serverfout: {e}"}, 500)
            return

        if methode != "GET":
            self.stuur({"fout": "Methode niet toegestaan."}, 405)
            return

        rel = url.path.lstrip("/") or "index.html"
        bestand = os.path.realpath(os.path.join(STATIC_DIR, rel))
        if not bestand.startswith(os.path.realpath(STATIC_DIR) + os.sep) or not os.path.isfile(bestand):
            self.stuur({"fout": "Bestand niet gevonden."}, 404)
            return
        with open(bestand, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(os.path.splitext(bestand)[1].lower(), "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        self.dispatch("GET")

    def do_POST(self):
        self.dispatch("POST")

    def do_PUT(self):
        self.dispatch("PUT")

    def do_DELETE(self):
        self.dispatch("DELETE")


class AppServer(ThreadingHTTPServer):
    # Op Windows laat SO_REUSEADDR een tweede server op dezelfde poort toe.
    # Uitzetten, zodat een tweede start merkt dat Milio al draait.
    allow_reuse_address = False


# ----------------------------------------------------------------------------
# Start
# ----------------------------------------------------------------------------
def meld_fout(bericht):
    """In de console, of als pop-up wanneer Milio zonder console draait (pythonw)."""
    if sys.stdout is not None:
        print(f"[!] {bericht}")
    elif sys.platform == "win32":
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, bericht, "Milio", 0x10)


def naar_server(pad, data=None):
    """Praat met een Milio die al draait (zonder proxy: het is je eigen pc)."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(URL + pad, data=data, method="POST" if data else "GET",
                                 headers={"Content-Type": "application/json"})
    with opener.open(req, timeout=2) as res:
        return json.loads(res.read().decode("utf-8"))


def bind_server(pogingen=1):
    for i in range(pogingen):
        try:
            return AppServer((HOST, PORT), AppHandler)
        except OSError:
            if i == pogingen - 1:
                raise
            time.sleep(0.25)


def zoek_edge():
    for basis in ("ProgramFiles(x86)", "ProgramFiles", "LocalAppData"):
        pad = os.path.join(os.environ.get(basis) or "", "Microsoft", "Edge", "Application", "msedge.exe")
        if os.path.isfile(pad):
            return pad
    return None


def toon_bestaand_venster():
    """Haalt een open Milio-venster naar voren. Een Edge-appvenster heeft de paginatitel
    als venstertitel ("Milio", of "12:34 · taak · Milio" tijdens een focussessie)."""
    if sys.platform != "win32":
        return False
    import ctypes
    from ctypes import wintypes
    user32 = ctypes.windll.user32
    gevonden = []

    @ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def bekijk(hwnd, _):
        lengte = user32.GetWindowTextLengthW(hwnd)
        if not lengte or not user32.IsWindowVisible(hwnd):
            return True
        titel = ctypes.create_unicode_buffer(lengte + 1)
        user32.GetWindowTextW(hwnd, titel, lengte + 1)
        klasse = ctypes.create_unicode_buffer(64)
        user32.GetClassNameW(hwnd, klasse, 64)
        t = titel.value
        if (t == VENSTER_TITEL or t.endswith(" · " + VENSTER_TITEL)) and klasse.value.startswith("Chrome_WidgetWin"):
            gevonden.append(hwnd)
            return False
        return True

    user32.EnumWindows(bekijk, 0)
    if not gevonden:
        return False
    if user32.IsIconic(gevonden[0]):
        user32.ShowWindow(gevonden[0], 9)  # SW_RESTORE
    user32.SetForegroundWindow(gevonden[0])
    return True


def toon_app():
    """Eén Milio-venster: bestaat het al, dan dat tonen; anders een Edge-appvenster
    (zonder adresbalk) openen, of je gewone browser als Edge er niet is."""
    if "--geen-browser" in sys.argv or toon_bestaand_venster():
        return
    edge = zoek_edge()
    if edge:
        try:
            subprocess.Popen([edge, f"--app={URL}"])
            return
        except OSError:
            pass
    webbrowser.open(URL)


def main():
    global SERVER
    try:
        SERVER = bind_server()
    except OSError:
        try:
            status = naar_server("api/status")
        except urllib.error.HTTPError as e:
            if str(e.headers.get("Server", "")).startswith("Milio"):
                # Een Milio van vóór de afsluitknop: die kan zichzelf niet laten stoppen.
                meld_fout("Er draait nog een oudere Milio in een zwart venster (zie je taakbalk).\n"
                          "Sluit dat venster en dubbelklik daarna opnieuw op Milio.")
                sys.exit(1)
            status = {}
        except Exception:
            status = {}
        if status.get("app") != APP_ID:
            meld_fout(f"Poort {PORT} is in gebruik door een ander programma.\nHerstart je pc en probeer opnieuw.")
            sys.exit(1)
        if status.get("versie") == CODE_VERSIE:
            toon_app()  # tweede dubbelklik: gewoon het venster tonen
            return
        try:  # er draait een oudere versie (na een update): vervangen
            naar_server("api/afsluiten", b"{}")
        except Exception:
            pass
        try:
            SERVER = bind_server(pogingen=20)
        except OSError:
            meld_fout("De vorige versie van Milio kon niet gestopt worden.\nHerstart je pc en probeer opnieuw.")
            sys.exit(1)

    init_db()
    try:
        maak_backup()
    except Exception as e:
        meld_fout(f"Backup maken mislukt: {e}")
    threading.Thread(target=backup_lus, daemon=True).start()

    print("=" * 60)
    print(" Milio draait")
    print(f" Open: {URL}")
    print(f" Database: {DB_PATH}")
    print(f" Backups: {BACKUP_DIR}")
    print(" Sluiten: Ctrl+C in dit venster, of 'Afsluiten' in Milio")
    print("=" * 60)
    toon_app()
    try:
        SERVER.serve_forever()
    except KeyboardInterrupt:
        pass
    SERVER.server_close()
    print("\nServer gestopt.")


if __name__ == "__main__":
    main()
