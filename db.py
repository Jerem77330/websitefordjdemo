import os
import sqlite3

DB_PATH = os.environ.get("DB_PATH", "data/tracks.db")


def conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init():
    with conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            artist TEXT NOT NULL DEFAULT '',
            bpm INTEGER, camelot TEXT, key TEXT, duration_sec REAL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(title, artist))""")
        c.execute("""CREATE TABLE IF NOT EXISTS external_tracks (
            ext_id TEXT PRIMARY KEY, title TEXT, artist TEXT, album TEXT,
            bpm INTEGER, key TEXT, camelot TEXT, time_sig TEXT,
            danceability TEXT, uri TEXT, fetched_at TEXT DEFAULT CURRENT_TIMESTAMP)""")


def save_track(r: dict) -> int:
    with conn() as c:
        row = c.execute(
            """INSERT INTO tracks(title, artist, bpm, camelot, key, duration_sec)
               VALUES(:title, :artist, :bpm, :camelot, :key, :duration_sec)
               ON CONFLICT(title, artist) DO UPDATE SET
                 bpm=excluded.bpm, camelot=excluded.camelot,
                 key=excluded.key, duration_sec=excluded.duration_sec
               RETURNING id""", r).fetchone()
        return row["id"]


def search(q: str, limit: int = 50) -> list[dict]:
    like = f"%{q.strip()}%"
    with conn() as c:
        rows = c.execute(
            """SELECT * FROM tracks WHERE title LIKE ? OR artist LIKE ?
               ORDER BY created_at DESC LIMIT ?""", (like, like, limit)).fetchall()
    return [dict(r) for r in rows]


def get_track(track_id: int) -> dict | None:
    with conn() as c:
        row = c.execute("SELECT * FROM tracks WHERE id = ?", (track_id,)).fetchone()
    return dict(row) if row else None


def get_external(ext_id: str) -> dict | None:
    with conn() as c:
        row = c.execute("SELECT * FROM external_tracks WHERE ext_id = ?", (ext_id,)).fetchone()
    return dict(row) if row else None


def save_external(t: dict) -> None:
    with conn() as c:
        c.execute("""INSERT OR REPLACE INTO external_tracks
            (ext_id, title, artist, album, bpm, key, camelot, time_sig, danceability, uri)
            VALUES (:ext_id, :title, :artist, :album, :bpm, :key, :camelot, :time_sig, :danceability, :uri)""", t)
