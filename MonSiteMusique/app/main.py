import os
import tempfile
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db, providers
from .analyzer import analyze

MAX_SIZE = 100 * 1024 * 1024  # 100 Mo
ALLOWED = {".mp3", ".wav", ".flac", ".aiff", ".aif", ".m4a", ".ogg"}

db.init()
app = FastAPI(title="DJ Analyzer")
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def index():
    return FileResponse("static/index.html")


@app.post("/api/analyze")
def analyze_file(file: UploadFile = File(...)):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(400, f"Format non supporté ({ext}).")

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    try:
        size = 0
        while chunk := file.file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_SIZE:
                raise HTTPException(413, "Fichier trop volumineux (100 Mo max).")
            tmp.write(chunk)
        tmp.close()
        result = analyze(tmp.name, file.filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(422, f"Analyse impossible : {e}")
    finally:
        tmp.close()
        os.unlink(tmp.name)  # l'audio n'est jamais conservé

    result["id"] = db.save_track(result)
    return result


@app.get("/api/search")
def search(q: str = ""):
    online, error = [], None
    if q.strip() and providers.enabled():
        try:
            online = providers.search_online(q.strip())
        except Exception:
            error = "Recherche en ligne indisponible pour le moment."
    return {"local": db.search(q), "online": online,
            "online_enabled": providers.enabled(), "online_error": error}


@app.get("/api/online/{ext_id}")
def online_track(ext_id: str):
    cached = db.get_external(ext_id)
    if cached:
        return cached
    if not providers.enabled():
        raise HTTPException(503, "Clé GetSongBPM non configurée.")
    try:
        t = providers.get_song(ext_id)
    except Exception:
        raise HTTPException(502, "GetSongBPM ne répond pas.")
    if t["bpm"] is None:
        raise HTTPException(404, "Pas de données BPM pour ce morceau.")
    db.save_external(t)
    return t


@app.get("/api/tracks/{track_id}")
def track(track_id: int):
    t = db.get_track(track_id)
    if not t:
        raise HTTPException(404, "Morceau introuvable.")
    return t
