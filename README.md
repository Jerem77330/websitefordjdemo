# DJ Analyzer

Analyse BPM / tonalité (Camelot) de tes fichiers, et recherche de n'importe quel
morceau en ligne, avec BPM et tonalité.

## Configuration
Copie `.env.example` en `.env` et mets ta clé GetSongBPM (gratuite :
https://getsongbpm.com/api). Sans clé, la recherche marche quand même (Deezer + Apple),
mais plus de BPM/tonalités seront estimés à partir des extraits.
**Ne mets jamais ta clé dans `docker-compose.yml` ni dans Git.**

## Lancer avec Docker (recommandé, surtout sous Windows)
    docker build -t dj-analyzer .
    docker run -p 8000:8000 --env-file .env -v dj-data:/srv/data dj-analyzer
Puis ouvre http://localhost:8000

## Sans Docker (Linux / macOS / WSL2 uniquement)
    pip install -r requirements.txt   # + ffmpeg installé
    uvicorn app.main:app --reload

## Avec docker compose (le plus simple)
    docker compose up -d --build   # 1re fois, ou si requirements.txt change
    docker compose restart         # après avoir remplacé des fichiers de app/ ou static/
Le fichier `.env` est lu automatiquement. Le serveur redémarre tout seul s'il plante.

## Dépannage : « Le serveur ne répond pas » / « Failed to fetch »
    docker compose ps                    # le conteneur « web » doit être « running »
    docker compose logs --tail 100 web   # l'erreur exacte est ici
Copie ces lignes de logs si tu demandes de l'aide.

## Tests (sans réseau, les API sont simulées)
    pip install pytest httpx && pytest -q

## Comment marche la recherche
1. **Ta base locale** : morceaux analysés (mots dans n'importe quel ordre, sans accents).
2. **Deezer** (gros catalogue, sans clé) + **GetSongBPM** (BPM/tonalité « officiels »),
   avec **Apple/iTunes** en renfort si Deezer trouve peu de choses. Les doublons sont fusionnés.
3. Pour chaque résultat sans BPM/tonalité, le site cherche ce morceau précis sur GetSongBPM,
   sinon **analyse l'extrait de 30 s** avec Essentia (marqué ≈ « estimé »).
4. Tout est mis en cache dans `data/tracks.db` : chaque morceau n'est analysé qu'une fois.

Astuce : tape `Artiste - Titre` pour une recherche plus précise.

## Les pages
- **Accueil** : top du moment (Monde + genres : Drum & Bass, House, Techno, Électro, Rap…),
  via les classements et playlists éditoriales Deezer (cache 1 h).
- **Analyser** : tes fichiers audio, analysés en entier (BPM, tonalité, énergie). Sans
  compte, les résultats ne sont pas gardés.
- **Bibliothèque** (compte requis) : tes morceaux avec la **roue de Camelot** (clique une
  tonalité pour filtrer les morceaux compatibles), tri par BPM / Camelot / énergie,
  extrait audio, suppression.
- **Mashup** : morceaux qui se superposent bien (tonalité compatible, tempo à ±3/6/10 %,
  mi/double tempo compris). ▶▶ = écouter les deux ensemble, tempo calé.
- **Sets** (compte requis) : ajoute des morceaux (« + Ajouter à un set » dans le détail),
  réordonne au glisser-déposer ou avec **Ordre harmonique auto**, courbe d'énergie,
  qualité de chaque transition, **export Rekordbox XML / M3U / CSV**.
- **Fiches publiques** `/morceau/artiste-titre--dz-123` : une page par morceau, lisible
  par Google et jolie quand on la partage (bouton « Partager »). `/sitemap.xml` et
  `/robots.txt` sont générés automatiquement.

## BPM, tonalité, énergie
- Tonalité affichée sous les deux formes : **8A · Am**.
- **Électro (DnB, house, techno, dance…)** : un BPM sous 100 est affiché en double tempo
  (87 → 174). Si le genre est inconnu, le BPM reste tel quel (bouton « Mauvais tempo ? »).
- Morceaux en ligne : seul l'extrait de 30 s est accessible légalement. Le site analyse
  **les extraits Deezer ET Apple** (souvent deux passages différents, ≈ 60 s) et fait
  **voter 3 méthodes** de détection de tonalité. Les données GetSongBPM restent prioritaires.
- **Énergie 1–10** : estimation maison (volume, densité d'attaques, tempo, compression),
  inspirée de Mixed In Key mais pas identique.

## Comptes
- Mots de passe hachés (scrypt), session par cookie (30 jours), 10 essais / 5 min max.
- **Le premier compte créé récupère la bibliothèque d'avant les comptes.** Crée donc
  ton compte en premier avant d'ouvrir le site à d'autres.
- En ligne (HTTPS) : mets `COOKIE_SECURE=1` et `SITE_URL=https://ton-site.fr` dans `.env`.

⚠️ Si le site devient public, vérifie les conditions d'utilisation des API Deezer et
Apple concernant l'analyse des extraits.
