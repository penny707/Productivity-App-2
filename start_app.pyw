# start_app.pyw
# Start Milio zonder zwart venster (wordt gestart met pythonw.exe).
# Hier wijst de bureaubladsnelkoppeling naar. Stoppen: 'Afsluiten' in Milio.

import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import app  # noqa: E402

try:
    app.main()
except SystemExit:
    pass
except Exception:
    log = os.path.join(app.BASE_DIR, "fout.log")
    with open(log, "a", encoding="utf-8") as f:
        traceback.print_exc(file=f)
    app.meld_fout(f"Milio is gestopt met een fout.\nDetails staan in:\n{log}")
