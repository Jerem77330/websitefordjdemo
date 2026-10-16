"""Source externe : GetSongBPM (https://getsongbpm.com/api). Clé gratuite requise."""
import json
import os
import urllib.parse
import urllib.request

from .analyzer import NOTES, to_camelot

BASE = "https://api.getsong.co"


def enabled() -> bool:
    return bool(os.environ.get("GETSONGBPM_API_KEY"))


def _get(path: str, **params) -> dict:
    params["api_key"] = os.environ["GETSONGBPM_API_KEY"]
    req = urllib.request.Request(f"{BASE}{path}?{urllib.parse.urlencode(params)}",
                                 headers={"User-Agent": "DJAnalyzer/0.1"})
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)


def parse_key(key_of: str | None):
    """'F♯m' -> ('F# minor', '11A') ; 'Bb' -> ('Bb major', '6B')."""
    if not key_of:
        return None, None
    s = key_of.strip().replace("♯", "#").replace("♭", "b")
    minor = s.endswith("m")
    note = s[:-1] if minor else s
    if note not in NOTES:
        return None, None
    scale = "minor" if minor else "major"
    return f"{note} {scale}", to_camelot(note, scale)


def search_online(q: str, limit: int = 10) -> list[dict]:
    items = _get("/search/", type="song", lookup=q, limit=limit).get("search")
    if not isinstance(items, list):  # "no result" -> pas une liste
        return []
    out = []
    for it in items:
        artist = it.get("artist")
        out.append({"id": it.get("id"), "title": it.get("title", ""),
                    "artist": artist.get("name", "") if isinstance(artist, dict) else (artist or "")})
    return [o for o in out if o["id"]]


def get_song(ext_id: str) -> dict:
    s = _get("/song/", id=ext_id).get("song") or {}
    key, camelot = parse_key(s.get("key_of"))
    artist, album = s.get("artist"), s.get("album")
    try:
        bpm = round(float(s.get("tempo")))
    except (TypeError, ValueError):
        bpm = None
    return {
        "ext_id": ext_id,
        "title": s.get("title", ""),
        "artist": artist.get("name", "") if isinstance(artist, dict) else (artist or ""),
        "album": album.get("title", "") if isinstance(album, dict) else (album or ""),
        "bpm": bpm, "key": key, "camelot": camelot,
        "time_sig": s.get("time_sig"),
        "danceability": s.get("danceability"),
        "uri": s.get("uri"),
    }
