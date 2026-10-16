# DJ Analyzer (MVP)

## Lancer avec Docker (recommandé, surtout sous Windows)
    docker build -t dj-analyzer .
    docker run -p 8000:8000 -v dj-data:/srv/data dj-analyzer
Puis ouvre http://localhost:8000

## Sans Docker (Linux / macOS / WSL2 uniquement)
    pip install -r requirements.txt   # + ffmpeg installé
    uvicorn app.main:app --reload

## Développement (rechargement automatique)
    docker compose up --build   # 1re fois, ou si requirements.txt change
    docker compose up           # ensuite
