"""Analyse BPM + tonalité (Essentia) avec conversion en notation Camelot."""
import os
import essentia.standard as es

NOTES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
         "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}

CAMELOT_MAJOR = {0: "8B", 7: "9B", 2: "10B", 9: "11B", 4: "12B", 11: "1B",
                 6: "2B", 1: "3B", 8: "4B", 3: "5B", 10: "6B", 5: "7B"}
CAMELOT_MINOR = {9: "8A", 4: "9A", 11: "10A", 6: "11A", 1: "12A", 8: "1A",
                 3: "2A", 10: "3A", 5: "4A", 0: "5A", 7: "6A", 2: "7A"}

MIN_BPM = 60


def to_camelot(key: str, scale: str) -> str:
    table = CAMELOT_MAJOR if scale == "major" else CAMELOT_MINOR
    return table[NOTES[key]]


def clean_bpm(raw: float) -> int:
    """Arrondi à l'entier le plus proche ; en dessous de 60, c'est quasi
    toujours une erreur de moitié de tempo, donc on double."""
    bpm = round(raw)
    return bpm * 2 if bpm < MIN_BPM else bpm


def read_tags(path: str, filename: str) -> tuple[str, str]:
    stem = os.path.splitext(filename)[0]
    title, artist = stem, ""
    try:
        tags = es.MetadataReader(filename=path)()
        title = tags[0].strip() or stem
        artist = tags[1].strip()
    except Exception:
        pass
    if not artist and " - " in stem and title == stem:  # "Artiste - Titre"
        artist, title = [s.strip() for s in stem.split(" - ", 1)]
    return title, artist


def analyze(path: str, filename: str) -> dict:
    audio = es.MonoLoader(filename=path, sampleRate=44100)()
    raw_bpm, _beats, beats_conf, _, _ = es.RhythmExtractor2013(method="multifeature")(audio)
    key, scale, strength = es.KeyExtractor(profileType="edma")(audio)

    bpm = clean_bpm(float(raw_bpm))
    title, artist = read_tags(path, filename)
    return {
        "title": title,
        "artist": artist,
        "bpm": bpm,
        "bpm_confidence": round(float(beats_conf), 2),
        "bpm_alternatives": [a for a in (round(bpm / 2), bpm * 2) if a >= MIN_BPM],
        "key": f"{key} {scale}",
        "camelot": to_camelot(key, scale),
        "key_strength": round(float(strength), 2),
        "duration_sec": round(len(audio) / 44100, 1),
    }
