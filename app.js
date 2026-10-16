"use strict";
const $ = id => document.getElementById(id);
function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k);
  return e;
}
const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
  pause: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg>',
  pair: '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5v14l8-7zM13 5v14l8-7z"/></svg>',
  close: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6 6 18"/></svg>',
};
const fmtTime = s => !s && s !== 0 ? "" : Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
const fmtLong = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60); return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const SOURCE_NAMES = { deezer: "Deezer", itunes: "Apple", getsongbpm: "GetSongBPM", preview: "extraits audio analysés",
                       user: "corrigé à la main", local: "fichier analysé", library: "Bibliothèque" };
const isLibrary = (t, opts = {}) => opts.kind === "library" || opts.kind === "set" || t.origin === "library";
const isOnline = t => String(t.id ?? "").includes(":");

// « Rio (Wilkinson Remix) » -> nom « Rio », version « Wilkinson Remix »
function splitMix(title) {
  const m = (title || "").match(/^(.*?)\s*[(\[]([^)\]]*\b(mix|remix|edit|version|dub|vip|bootleg|rework|flip|refix|remaster(ed)?)\b[^)\]]*)[)\]]\s*$/i);
  return m ? { name: m[1], mix: m[2] } : { name: title || "Sans titre", mix: "" };
}

// ---- Toast
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}

// ---- Tonalités : Camelot + notation classique (« 8A · Am »), couleurs de la roue
const keyShort = k => { if (!k) return ""; const [n, s] = k.split(" "); return s ? n + (s === "minor" ? "m" : "") : k; };
const keyLabel = t => [t.camelot, keyShort(t.key)].filter(Boolean).join(" · ");
function keyColor(c) {
  const n = parseInt(c), minor = /A$/.test(c);
  return `hsl(${((n - 1) * 30 + 150) % 360} ${minor ? 70 : 85}% ${minor ? 58 : 70}%)`;
}
function keyPill(camelot, key) {
  if (!camelot) return el("span", { className: "key none", textContent: "?" });
  const s = el("span", { className: "key" }, camelot, key ? el("span", { className: "ks", textContent: " · " + keyShort(key) }) : null);
  s.style.background = keyColor(camelot);
  return s;
}
const CAMELOT_KEY = { "1A": "Abm", "2A": "Ebm", "3A": "Bbm", "4A": "Fm", "5A": "Cm", "6A": "Gm", "7A": "Dm", "8A": "Am", "9A": "Em", "10A": "Bm", "11A": "F#m", "12A": "Dbm",
                      "1B": "B", "2B": "F#", "3B": "Db", "4B": "Ab", "5B": "Eb", "6B": "Bb", "7B": "F", "8B": "C", "9B": "G", "10B": "D", "11B": "A", "12B": "E" };
const camelotPill = c => keyPill(c, CAMELOT_KEY[c] ? (CAMELOT_KEY[c].endsWith("m") ? CAMELOT_KEY[c].slice(0, -1) + " minor" : CAMELOT_KEY[c] + " major") : null);
function compatibleKeys(c) {
  const n = parseInt(c), l = c.slice(-1), wrap = x => ((x + 11) % 12) + 1;
  return [`${wrap(n - 1)}${l}`, `${n}${l === "A" ? "B" : "A"}`, `${wrap(n + 1)}${l}`];
}
// Énergie 1–10 : du bleu (calme) au rouge (explosif)
const energyColor = e => `hsl(${220 - (e - 1) * 24} 85% 62%)`;
function energyBadge(e) {
  if (!e) return el("span", { className: "nrg none", textContent: "–", title: "Énergie inconnue" });
  const b = el("span", { className: "nrg", textContent: e, title: `Énergie ${e}/10` });
  b.style.background = energyColor(e);
  return b;
}

// ---- Appels serveur avec messages compréhensibles
async function api(url, opts) {
  let r;
  try { r = await fetch(url, opts); }
  catch { throw new Error("Le serveur ne répond pas. Vérifie qu'il tourne (docker compose ps) puis recharge la page."); }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && me) { me = null; renderAuth(); }
  if (!r.ok) { const err = new Error(d.detail || `Erreur ${r.status}`); err.status = r.status; throw err; }
  return d;
}
const postJson = (url, body, method = "POST") =>
  api(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ================================================================ Fenêtre (modal)
function openModal(...content) {
  $("modal").replaceChildren(el("button", { className: "close", innerHTML: ICON.close, title: "Fermer", onclick: closeModal }), ...content);
  $("modal-wrap").classList.remove("hidden");
  const first = $("modal").querySelector("input"); if (first) first.focus();
}
function closeModal() { $("modal-wrap").classList.add("hidden"); }
$("modal-wrap").onclick = e => { if (e.target === $("modal-wrap")) closeModal(); };

// ================================================================ Comptes
let me = null;
async function loadMe() {
  try { me = (await api("/api/auth/me")).user; } catch { me = null; }
  renderAuth();
}
function renderAuth() {
  const area = $("auth-area");
  if (!me) { area.replaceChildren(el("button", { className: "btn", textContent: "Se connecter", onclick: () => openAuth() })); return; }
  const btn = el("button", { className: "avatar", textContent: (me.name || me.email)[0].toUpperCase(), title: me.email });
  btn.onclick = e => {
    e.stopPropagation();
    if (document.querySelector(".menu")) { document.querySelector(".menu").remove(); return; }
    document.body.append(el("div", { className: "menu" },
      el("div", { className: "who" }, el("b", { textContent: me.name || "" }), el("br"), me.email),
      el("button", { textContent: "Ma bibliothèque", onclick: () => show("library") }),
      el("button", { textContent: "Mes sets", onclick: () => show("sets") }),
      el("button", { textContent: "Se déconnecter", onclick: logout })));
  };
  area.replaceChildren(btn);
}
document.addEventListener("click", () => { const m = document.querySelector(".menu"); if (m) m.remove(); });

function openAuth(reason = "", mode = "login") {
  const err = el("div", { className: "err-line" });
  const email = el("input", { type: "email", autocomplete: "email", required: true });
  const pw = el("input", { type: "password", autocomplete: mode === "login" ? "current-password" : "new-password", required: true, minLength: 8 });
  const name = el("input", { type: "text", autocomplete: "nickname", maxLength: 60, placeholder: "ex. DJ Jo" });
  const submit = el("button", { className: "btn primary", type: "submit", textContent: mode === "login" ? "Se connecter" : "Créer mon compte" });
  const form = el("form", {},
    mode === "signup" ? [el("label", { textContent: "Nom de DJ (facultatif)" }), name] : null,
    el("label", { textContent: "E-mail" }), email,
    el("label", { textContent: mode === "signup" ? "Mot de passe (8 caractères minimum)" : "Mot de passe" }), pw,
    err, el("div", { className: "row" }, submit));
  form.onsubmit = async e => {
    e.preventDefault(); err.textContent = ""; submit.disabled = true;
    try {
      me = await postJson(`/api/auth/${mode}`, mode === "signup"
        ? { email: email.value, password: pw.value, name: name.value } : { email: email.value, password: pw.value });
      closeModal(); renderAuth(); toast(mode === "signup" ? `Bienvenue ${me.name} !` : `Content de te revoir ${me.name} !`);
      onAuthChange();
    } catch (x) { err.textContent = x.message; submit.disabled = false; }
  };
  const tab = (m, label) => el("button", { className: "chip" + (m === mode ? " on" : ""), type: "button", textContent: label, onclick: () => openAuth(reason, m) });
  openModal(el("h3", { textContent: mode === "login" ? "Connexion" : "Créer un compte" }),
    reason ? el("p", { className: "muted", style: "margin:4px 0 0", textContent: reason }) : null,
    el("div", { className: "tabs" }, tab("login", "J'ai un compte"), tab("signup", "Nouveau compte")), form);
}
async function logout() {
  try { await postJson("/api/auth/logout", {}); } catch {}
  me = null; renderAuth(); toast("Déconnecté"); onAuthChange();
}
function onAuthChange() {
  setsCache = null;
  if (view === "library") loadLibrary();
  if (view === "sets") loadSets();
  if (view === "analyze") renderAnalyzeGate();
  if (view === "search" && $("q").value.trim()) runSearch();
  if (drawerRow) renderDetail();
}
const needLogin = reason => { if (me) return false; openAuth(reason); return true; };
const gate = (msg) => el("div", { className: "gate" }, el("b", { textContent: "Connecte-toi pour continuer" }), el("p", { textContent: msg }),
  el("button", { className: "btn primary", textContent: "Se connecter / créer un compte", onclick: () => openAuth() }));

// ================================================================ Navigation
// #home, #analyze… gardent la page au rechargement ; #track=dz:123 et #mashup=dz:123 viennent des fiches publiques
const VIEWS = ["home", "search", "analyze", "library", "mashup", "sets"];
let view = null;
function show(v) {
  if (!VIEWS.includes(v)) v = "home";
  const changed = view !== v;
  view = v;
  for (const s of VIEWS) $("v-" + s).classList.toggle("hidden", s !== v);
  document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.view === v));
  history.replaceState(null, "", "#" + v);
  if (v === "library") loadLibrary();
  if (v === "sets") loadSets();
  if (v === "analyze") renderAnalyzeGate();
  if (v === "home" && !chartLoaded) loadCharts();
  if (changed) window.scrollTo({ top: 0 });
}
document.querySelectorAll("[data-view]").forEach(b => b.onclick = e => { e.preventDefault(); show(b.dataset.view); });
document.querySelectorAll("[data-go]").forEach(b => b.onclick = () => {
  if (b.dataset.go === "search") { window.scrollTo({ top: 0 }); $("q").focus(); }
  else show(b.dataset.go);
});

// ================================================================ Lecteur
const audio = $("audio"), audio2 = $("audio2");
let current = null;  // { key }
const isPlaying = key => current && current.key === key && !audio.paused;

function startPlayer({ key, url, url2, rate = 1, title, artist, cover }) {
  if (current && current.key === key) { audio.paused ? resume() : pause(); return; }
  pause();
  current = { key };
  audio.src = url; audio.playbackRate = 1;
  audio2.removeAttribute("src");
  if (url2) {  // mashup : 2e morceau calé sur le tempo du 1er
    audio2.src = url2;
    audio2.preservesPitch = true;
    audio2.playbackRate = Math.min(2, Math.max(0.5, rate));
    audio.volume = audio2.volume = 0.8;
  } else audio.volume = 1;
  resume();
  $("player").classList.remove("hidden");
  $("p-title").textContent = title || "";
  $("p-artist").textContent = artist || "";
  $("p-art").replaceChildren(cover ? el("img", { src: cover, alt: "" }) : el("div", { className: "ph", textContent: "♪" }));
}
function resume() { audio.play().catch(() => {}); if (audio2.getAttribute("src")) audio2.play().catch(() => {}); }
function pause() { audio.pause(); audio2.pause(); }
function syncPlayButtons() {
  $("p-toggle").innerHTML = audio.paused ? ICON.play : ICON.pause;
  document.querySelectorAll("[data-play]").forEach(b => {
    const on = isPlaying(b.dataset.play);
    b.innerHTML = on ? ICON.pause : (b.dataset.icon === "pair" ? ICON.pair : ICON.play);
    b.classList.toggle("playing", on);
  });
}
audio.onplay = audio.onpause = syncPlayButtons;
audio.onended = () => { audio2.pause(); syncPlayButtons(); };
audio.ontimeupdate = () => {
  const d = audio.duration || 30;
  $("p-cur").textContent = fmtTime(audio.currentTime);
  $("p-dur").textContent = fmtTime(d);
  $("p-fill").style.width = (100 * audio.currentTime / d) + "%";
};
$("p-toggle").onclick = () => audio.getAttribute("src") && (audio.paused ? resume() : pause());
$("p-bar").onclick = e => {
  const r = e.currentTarget.getBoundingClientRect();
  if (!audio.duration) return;
  audio.currentTime = audio.duration * (e.clientX - r.left) / r.width;
  if (audio2.getAttribute("src")) audio2.currentTime = Math.min(audio.currentTime * audio2.playbackRate, audio2.duration || 30);
};
$("p-close").onclick = () => { pause(); current = null; $("player").classList.add("hidden"); syncPlayButtons(); };

// Extrait d'un morceau qui n'en a pas encore (bibliothèque, mashup) : cherché à la demande.
async function ensurePreview(t) {
  if (t.preview_url) return t.preview_url;
  const p = new URLSearchParams({ artist: t.artist || "", title: t.title || "" });
  if (isLibrary(t) && Number.isInteger(t.id)) p.set("track_id", t.id);
  const m = await api("/api/preview?" + p);
  t.preview_url = m.preview_url;
  if (!t.cover && m.cover) t.cover = m.cover;
  return t.preview_url;
}
const playKey = t => "t:" + (t.id ?? "") + ":" + t.title;
async function playTrack(row) {
  const t = row.t;
  try { await ensurePreview(t); } catch (e) { toast(e.message); return; }
  row.render && row.render();
  const { name, mix } = splitMix(t.title);
  startPlayer({ key: playKey(t), url: t.preview_url, title: name + (mix ? ` (${mix})` : ""), artist: t.artist, cover: t.cover });
}

// ================================================================ Lignes de morceaux
function artBox(row, cls = "art") {
  const t = row.t;
  const box = el("div", { className: cls },
    t.cover ? el("img", { src: t.cover, alt: "", loading: "lazy", onerror: e => e.target.replaceWith(el("div", { className: "ph", textContent: "♪" })) })
            : el("div", { className: "ph", textContent: "♪" }));
  if (t.title && !row.loading) {
    const b = el("button", { className: cls === "art" ? "playbtn" : "d-play", title: "Écouter l'extrait", innerHTML: ICON.play });
    b.dataset.play = playKey(t);
    b.onclick = e => { e.stopPropagation(); playTrack(row); };
    box.append(b);
  }
  return box;
}

function thead(labels, ranked) {
  return el("div", { className: "thead" }, ranked ? el("span") : null, el("span"),
    el("span", { textContent: labels[0] }), el("span", { className: "c-third", textContent: labels[1] }),
    el("span", { textContent: "BPM" }), el("span", { textContent: "Tonalité" }),
    el("span", { className: "c-nrg", textContent: "Énergie" }),
    el("span", { className: "c-len", textContent: "Durée" }), el("span"));
}

function renderRow(row) {
  const { t, opts } = row;
  if (isLibrary(t, opts)) row.tr._trackId = t.id;  // pour retirer la ligne après suppression
  const { name, mix } = splitMix(t.title);
  const sources = opts.kind === "library" || opts.kind === "set" ? [] : (t.sources || (t.origin === "library" ? ["library"] : []));
  const main = el("div", { style: "min-width:0" },
    el("div", { className: "t-name" }, name, mix ? el("span", { className: "mix", textContent: " " + mix }) : null),
    el("div", { className: "t-artist", textContent: t.artist || "Artiste inconnu" }),
    row.error ? el("div", { className: "err-line", textContent: row.error })
      : sources.length && opts.kind !== "compact" ? el("div", { className: "tags" }, sources.map(s => el("span", { className: "tag", textContent: SOURCE_NAMES[s] || s }))) : null);
  const shim = w => el("span", { className: "shimmer", style: `width:${w}px;height:20px` });
  const bpm = row.loading ? shim(34) : el("span", { className: "num" }, t.bpm ? String(t.bpm) : el("span", { className: "muted", textContent: "—" }));
  const key = row.loading ? shim(60) : keyPill(t.camelot, t.key);
  const nrg = row.loading ? shim(26) : energyBadge(t.energy);

  if (opts.kind === "compact") { row.tr.replaceChildren(artBox(row), main, el("div", {}, bpm), el("div", {}, key)); syncPlayButtons(); return; }
  if (opts.kind === "set") {
    row.tr.replaceChildren(el("div", { className: "handle", textContent: "⋮⋮", title: "Glisser pour réordonner" }),
      el("div", { className: "pos", textContent: opts.position }), artBox(row), main,
      el("div", {}, bpm), el("div", {}, key), el("div", { className: "c-nrg" }, nrg), el("div", {}, opts.action ? opts.action(row) : null));
    syncPlayButtons(); return;
  }
  const third = typeof opts.third === "function" ? opts.third(t) : (t[opts.third || "album"] || "");
  row.tr.replaceChildren(...[
    opts.rank ? el("div", { className: "rank", textContent: t.rank }) : null,
    artBox(row), main,
    el("div", { className: "t-third c-third" }, third),
    el("div", {}, bpm), el("div", {}, key), el("div", { className: "c-nrg" }, nrg),
    el("div", { className: "num muted c-len", textContent: fmtTime(t.duration_sec) }),
    el("div", {}, opts.action ? opts.action(row) : null)].filter(Boolean));
  syncPlayButtons();
}

function makeRow(t, opts = {}) {
  const row = { t, opts, tr: el("div", { className: "track" }) };
  row.render = () => renderRow(row);
  row.tr.onclick = () => (opts.onPick ? opts.onPick(row) : openDetail(row));
  row.render();
  return row;
}

function skeleton(n = 8, ranked = false) {
  return Array.from({ length: n }, () => el("div", { className: "track" },
    ranked ? el("div") : null, el("div", { className: "art" }),
    el("div", {}, el("span", { className: "shimmer", style: "width:60%" }), el("br"), el("span", { className: "shimmer", style: "width:35%;margin-top:6px" })),
    el("div", { className: "c-third" }), el("div"), el("div"), el("div", { className: "c-nrg" }), el("div", { className: "c-len" }), el("div")));
}

// Bouton « + bibliothèque » des morceaux en ligne
const addAction = row => {
  if (!row.t.bpm && !row.t.camelot) return null;
  return el("button", { className: "icon-btn", title: "Ajouter à ma bibliothèque", innerHTML: ICON.plus,
                        onclick: e => { e.stopPropagation(); addToLibrary(row.t); } });
};
const trackPayload = t => ({ title: t.title, artist: t.artist || "", genre: t.genre || "", bpm: t.bpm || null, key: t.key || null,
  camelot: t.camelot || null, energy: t.energy || null, duration_sec: t.duration_sec || null, cover: t.cover || null,
  ext_id: isOnline(t) ? t.id : null });

// ================================================================ Détails en ligne
async function loadDetails(row) {
  if (!isOnline(row.t)) return;
  row.loading = true; row.render();
  try {
    const hint = row.t.genre_hint ? "?genre_hint=" + encodeURIComponent(row.t.genre_hint) : "";
    const full = await api("/api/online/" + encodeURIComponent(row.t.id) + hint);
    row.t = { ...row.t, ...full, preview_url: full.preview_url || row.t.preview_url, cover: row.t.cover || full.cover,
              sources: row.t.sources, rank: row.t.rank, genre_hint: row.t.genre_hint, complete: true };
    row.error = null;
  } catch (e) { row.error = e.message; row.t.complete = true; }
  row.loading = false; row.render();
  if (drawerRow === row) renderDetail();
}

// Complète BPM/tonalité/énergie manquants, 2 à la fois, dans l'ordre affiché.
// Une nouvelle liste dans le même contexte annule la précédente.
const enrichTokens = {};
function enrich(rows, ctx) {
  const token = {}; enrichTokens[ctx] = token;
  const queue = rows.filter(r => !r.t.complete);
  const work = async () => { while (queue.length && enrichTokens[ctx] === token) await loadDetails(queue.shift()); };
  return Promise.all([work(), work()]);
}

async function addToLibrary(t) {
  if (needLogin("Connecte-toi pour garder des morceaux dans ta bibliothèque.")) return;
  try {
    const r = await postJson("/api/library", trackPayload(t));
    toast(`« ${splitMix(t.title).name} » ajouté à ta bibliothèque`);
    return r;
  } catch (e) { toast(e.message); }
}

// ================================================================ Accueil : tops
let chartLoaded = false, currentGenre = "world";
async function loadCharts() {
  chartLoaded = true;
  try {
    const { genres } = await api("/api/charts");
    $("genre-chips").replaceChildren(...genres.map(g => {
      const c = el("button", { className: "chip" + (g.id === currentGenre ? " on" : ""), textContent: g.name });
      c.onclick = () => {
        currentGenre = g.id;
        document.querySelectorAll("#genre-chips .chip").forEach(x => x.classList.toggle("on", x === c));
        loadChart(g.id);
      };
      return c;
    }));
  } catch (e) { $("chart-status").textContent = e.message; chartLoaded = false; return; }
  loadChart(currentGenre);
}
async function loadChart(id) {
  const status = $("chart-status");
  status.classList.remove("err"); status.textContent = "Chargement…";
  $("chart-list").replaceChildren(thead(["Titre / Artiste", "Album"], true), ...skeleton(10, true));
  let d;
  try { d = await api("/api/charts/" + id); }
  catch (e) { status.textContent = e.message; status.classList.add("err"); $("chart-list").replaceChildren(); return; }
  if (id !== currentGenre) return;
  const rows = d.tracks.map(t => makeRow(t, { rank: true, kind: "online", action: addAction }));
  $("chart-list").replaceChildren(thead(["Titre / Artiste", "Album"], true), ...rows.map(r => r.tr));
  if (!rows.length) $("chart-list").append(el("div", { className: "empty", textContent: "Ce top est vide pour le moment." }));
  const todo = rows.filter(r => !r.t.complete).length;
  status.textContent = `${rows.length} titres` + (todo ? " · analyse en cours…" : "");
  enrich(rows, "chart").then(() => { if (id === currentGenre) status.textContent = `${rows.length} titres`; });
}

// ================================================================ Recherche
let timer, searchGen = 0;
$("q").oninput = () => {
  clearTimeout(timer);
  if (!$("q").value.trim()) { if (view === "search") show("home"); return; }
  if (view !== "search") show("search");
  timer = setTimeout(runSearch, 350);
};
$("q").onkeydown = e => { if (e.key === "Enter") { clearTimeout(timer); if ($("q").value.trim()) { show("search"); runSearch(); } } };

async function runSearch() {
  const gen = ++searchGen, q = $("q").value.trim();
  const status = $("search-status");
  if (!q) return;
  status.classList.remove("err");
  $("search-title").textContent = `Résultats pour « ${q} »`;
  status.textContent = "Recherche dans les catalogues…";
  $("online-block").classList.remove("hidden");
  $("online-list").replaceChildren(...skeleton());
  let d;
  try { d = await api("/api/search?q=" + encodeURIComponent(q)); }
  catch (e) { if (gen === searchGen) { status.textContent = e.message; status.classList.add("err"); $("online-list").replaceChildren(); } return; }
  if (gen !== searchGen) return;  // une recherche plus récente est partie

  $("local-block").classList.toggle("hidden", !d.local.length);
  $("local-list").replaceChildren(...d.local.map(t => libraryRow(t).tr));

  const notes = [];
  if (d.errors.length) notes.push("indisponible pour l'instant : " + d.errors.map(s => SOURCE_NAMES[s] || s).join(", "));
  if (!d.sources.getsongbpm) notes.push("clé GetSongBPM absente (fichier .env)");
  status.textContent = (d.online.length ? `${d.online.length} morceau(x)` : "Aucun résultat en ligne.") + (notes.length ? " — " + notes.join(" · ") : "");
  if (!d.online.length && d.errors.length) status.classList.add("err");

  const rows = d.online.map(t => makeRow(t, { kind: "online", action: addAction }));
  $("online-list").replaceChildren(thead(["Titre / Artiste", "Album"]), ...rows.map(r => r.tr));
  if (!rows.length) $("online-list").append(el("div", { className: "empty", textContent: "Rien trouvé. Essaie « Artiste - Titre » ou une autre orthographe." }));
  enrich(rows, "search");
}

// ================================================================ Panneau de détail
let drawerRow = null;
function openDetail(row) {
  document.querySelectorAll(".track.sel").forEach(x => x.classList.remove("sel"));
  row.tr.classList.add("sel");
  drawerRow = row;
  renderDetail();
  $("drawer").classList.add("open"); $("drawer").setAttribute("aria-hidden", "false");
  $("scrim").classList.remove("hidden");
  if (!isLibrary(row.t, row.opts) && !row.t.complete && !row.loading) loadDetails(row);
}
function closeDetail() {
  $("drawer").classList.remove("open"); $("drawer").setAttribute("aria-hidden", "true");
  $("scrim").classList.add("hidden");
  document.querySelectorAll(".track.sel").forEach(x => x.classList.remove("sel"));
  drawerRow = null;
}
$("scrim").onclick = closeDetail;
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeDetail(); closeModal(); } });

async function share(t) {
  const url = location.origin + t.page;
  const title = `${splitMix(t.title).name} – ${t.artist} · ${t.bpm || "?"} BPM · ${keyLabel(t)}`;
  try {
    if (navigator.share) await navigator.share({ title, url });
    else { await navigator.clipboard.writeText(url); toast("Lien copié !"); }
  } catch { /* partage annulé */ }
}

// Liste déroulante « Ajouter à un set »
let setsCache = null;
async function getSets() { if (!setsCache) setsCache = (await api("/api/sets")).sets; return setsCache; }
function setPicker(t) {
  const sel = el("select", { className: "select" }, el("option", { value: "", textContent: "+ Ajouter à un set…" }));
  if (me) getSets().then(list => {
    list.forEach(s => sel.append(el("option", { value: s.id, textContent: `${s.name} (${s.count})` })));
    sel.append(el("option", { value: "new", textContent: "Nouveau set…" }));
  }).catch(() => {});
  sel.onfocus = sel.onmousedown = e => { if (!me) { e.preventDefault(); needLogin("Connecte-toi pour créer des sets."); } };
  sel.onchange = async () => {
    let id = sel.value; sel.value = "";
    if (!id) return;
    try {
      if (id === "new") {
        const name = prompt("Nom du nouveau set :", "Mon set");
        if (!name) return;
        id = (await postJson("/api/sets", { name })).id;
      }
      const body = isLibrary(t) && Number.isInteger(t.id) ? { track_id: t.id } : { track: trackPayload(t) };
      const s = await postJson(`/api/sets/${id}/tracks`, body);
      setsCache = null;
      toast(`Ajouté à « ${s.name} » (${s.stats.count} titre${s.stats.count > 1 ? "s" : ""})`);
    } catch (e) { toast(e.message); }
  };
  return sel;
}

function renderDetail() {
  const row = drawerRow, t = row.t, lib = isLibrary(t, row.opts);
  const { name, mix } = splitMix(t.title);
  const fixUrl = lib ? `/api/tracks/${t.id}/bpm` : `/api/online/${encodeURIComponent(t.id)}/bpm`;
  const stat = (label, v, small) => el("div", { className: "stat" }, el("small", { textContent: label }), el("div", { className: "v" + (small ? " sm" : "") }, v));
  const loading = row.loading ? el("span", { className: "shimmer", style: "width:50px;height:20px" }) : null;

  const actions = el("div", { className: "d-actions" });
  if (t.bpm && t.camelot && !row.loading)
    actions.append(el("button", { className: "btn primary", textContent: "Trouver des mashups", onclick: () => { closeDetail(); setSeed({ ...t }); show("mashup"); } }));
  if (!row.loading && t.title && (t.bpm || t.camelot)) actions.append(setPicker(t));
  if (!lib && !row.loading && (t.bpm || t.camelot))
    actions.append(el("button", { className: "btn", textContent: "+ Bibliothèque", onclick: () => addToLibrary(t) }));
  if (t.page) actions.append(el("button", { className: "btn", textContent: "Partager", onclick: () => share(t) }));
  if (lib && me) actions.append(el("button", { className: "btn danger", textContent: "Supprimer", onclick: () => deleteTrack(t) }));

  const kids = [
    el("button", { className: "close", innerHTML: ICON.close, title: "Fermer", onclick: closeDetail }),
    artBox(row, "d-art"),
    el("h3", { className: "d-title", textContent: name }),
    mix ? el("div", { className: "d-mix", textContent: mix }) : null,
    el("div", { className: "d-artist", textContent: t.artist || "Artiste inconnu" }),
    el("div", { className: "d-meta", textContent: [t.album, t.genre].filter(Boolean).join(" · ") }),
    actions,
    el("div", { className: "stats", style: "grid-template-columns:repeat(2,1fr)" },
      stat("BPM", loading || (t.bpm ? String(t.bpm) : "—")),
      stat("Tonalité", loading || keyPill(t.camelot, t.key), true),
      stat("Énergie", loading || (t.energy ? [String(t.energy), el("span", { className: "muted", style: "font-size:14px", textContent: " /10" })] : "—")),
      stat("Durée", fmtTime(t.duration_sec) || "—")),
  ];

  const alts = t.bpm_alternatives || [];
  if (t.bpm && alts.length && !row.loading && t.id != null && me) {
    kids.push(el("div", { className: "box" }, el("h4", { textContent: "Mauvais tempo ?" }),
      el("div", {}, alts.map(a => el("button", { className: "alt", textContent: a, onclick: async () => {
        try {
          const r = await postJson(fixUrl, { bpm: a });
          Object.assign(t, r, { bpm_source: lib ? "local" : "user" });
          row.render(); renderDetail();
        } catch (e) { toast(e.message); }
      } })), el("span", { className: "muted", textContent: " mi-tempo / double tempo" }))));
  }
  if (t.camelot && !row.loading) {
    kids.push(el("div", { className: "box" }, el("h4", { textContent: "Se mixe bien avec" }),
      el("div", { className: "compat" }, camelotPill(t.camelot), compatibleKeys(t.camelot).map(camelotPill))));
  }
  const srcs = [];
  if (t.bpm_source) srcs.push(`BPM : ${SOURCE_NAMES[t.bpm_source] || t.bpm_source}`);
  if (t.key_source) srcs.push(`Tonalité : ${SOURCE_NAMES[t.key_source] || t.key_source}`);
  const links = [];
  if (t.page) links.push(el("a", { href: t.page, target: "_blank", textContent: "Fiche du morceau" }));
  if (t.uri) links.push(el("a", { href: t.uri, target: "_blank", rel: "noopener", textContent: "GetSongBPM" }));
  if (t.link && t.link !== t.uri) links.push(el("a", { href: t.link, target: "_blank", rel: "noopener", textContent: "Écouter en entier" }));
  if (srcs.length || links.length || row.error)
    kids.push(el("div", { className: "box" }, el("h4", { textContent: "Sources" }),
      srcs.length ? el("div", { textContent: srcs.join(" · ") }) : null,
      row.error ? el("div", { className: "err-line", textContent: row.error }) : null,
      links.length ? el("div", { style: "margin-top:6px;display:flex;gap:14px;flex-wrap:wrap" }, links) : null));
  $("drawer").replaceChildren(...kids.filter(Boolean));
  syncPlayButtons();
}

// ================================================================ Analyse de fichiers
const drop = $("drop"), input = $("file");
drop.onclick = () => input.click();
input.onchange = () => { handle(input.files); input.value = ""; };
drop.ondragover = e => { e.preventDefault(); drop.classList.add("over"); };
drop.ondragleave = () => drop.classList.remove("over");
drop.ondrop = e => { e.preventDefault(); drop.classList.remove("over"); handle(e.dataTransfer.files); };

function renderAnalyzeGate() {
  const g = $("analyze-gate");
  g.classList.toggle("hidden", !!me);
  if (!me) g.replaceChildren(el("div", { className: "notice" }, "Tu peux analyser sans compte, mais les résultats ne seront pas gardés. ",
    el("a", { textContent: "Se connecter", onclick: () => openAuth("Connecte-toi pour garder tes analyses dans ta bibliothèque.") }), " pour les retrouver dans ta bibliothèque."));
}

async function handle(files) {
  for (const f of files) {
    const row = makeRow({ title: f.name.replace(/\.[^.]+$/, ""), artist: "Analyse en cours…", origin: "library" }, { kind: "library", third: "genre" });
    row.loading = true; row.render();
    $("analyze-list").prepend(row.tr);
    try {
      const fd = new FormData(); fd.append("file", f);
      const d = await api("/api/analyze", { method: "POST", body: fd });
      row.t = { ...d, origin: d.saved ? "library" : "file", bpm_source: "local", key_source: "local" };
      if (d.saved) row.opts.action = deleteAction;
      else row.opts.kind = "file";
      fetchCover(row);  // en arrière-plan
    } catch (e) { row.t = { title: f.name, artist: "", origin: "library" }; row.error = "Erreur : " + e.message; row.tr.onclick = null; }
    row.loading = false; row.render();
  }
}

// Pochette (et extrait) d'un morceau de la bibliothèque, trouvés en ligne d'après artiste/titre
async function fetchCover(row) {
  if (row.t.cover || row.t.noMedia) return;
  try { await ensurePreview(row.t); row.render(); } catch { row.t.noMedia = true; }
}

// ================================================================ Bibliothèque + roue de Camelot
let libSort = "recent", libTracks = [], libToken = null, wheelKey = null;
document.querySelectorAll("#sorts .chip").forEach(c => c.onclick = () => {
  libSort = c.dataset.sort;
  document.querySelectorAll("#sorts .chip").forEach(x => x.classList.toggle("on", x === c));
  renderLibrary();
});
const deleteAction = row => el("button", { className: "icon-btn danger", title: "Supprimer de ma bibliothèque", innerHTML: ICON.trash,
                                            onclick: e => { e.stopPropagation(); deleteTrack(row.t); } });
const libraryRow = t => makeRow({ ...t, origin: "library", bpm_source: "local", key_source: "local" }, { kind: "library", third: "genre", action: deleteAction });

async function loadLibrary() {
  $("lib-gate").classList.toggle("hidden", !!me);
  $("lib-body").classList.toggle("hidden", !me);
  if (!me) { $("lib-gate").replaceChildren(gate("Ta bibliothèque garde tes analyses et les morceaux que tu ajoutes, sur tous tes appareils.")); return; }
  $("lib-status").classList.remove("err");
  try { libTracks = (await api("/api/search?q=")).local; }
  catch (e) { $("lib-status").textContent = e.message; $("lib-status").classList.add("err"); return; }
  renderLibrary();
}

function renderWheel() {
  const counts = {};
  libTracks.forEach(t => { if (t.camelot) counts[t.camelot] = (counts[t.camelot] || 0) + 1; });
  const compat = wheelKey ? new Set(compatibleKeys(wheelKey)) : new Set();
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 300 300");
  const C = 150, rad = d => (d - 90) * Math.PI / 180;
  const pt = (r, d) => `${C + r * Math.cos(rad(d))},${C + r * Math.sin(rad(d))}`;
  const ring = [["B", 145, 100], ["A", 98, 54]];
  for (const [letter, r1, r0] of ring) for (let n = 1; n <= 12; n++) {
    const code = `${n}${letter}`, mid = (n % 12) * 30, a0 = mid - 14.5, a1 = mid + 14.5;
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M${pt(r0, a0)} L${pt(r1, a0)} A${r1},${r1} 0 0 1 ${pt(r1, a1)} L${pt(r0, a1)} A${r0},${r0} 0 0 0 ${pt(r0, a0)} Z`);
    path.setAttribute("fill", keyColor(code));
    path.setAttribute("class", "seg");
    const strength = wheelKey ? (code === wheelKey ? 1 : compat.has(code) ? 0.75 : 0.12) : (counts[code] ? 0.95 : 0.3);
    path.style.opacity = strength;
    if (code === wheelKey) { path.setAttribute("stroke", "#fff"); path.setAttribute("stroke-width", "2.5"); }
    path.onclick = () => { wheelKey = wheelKey === code ? null : code; renderLibrary(); };
    const tip = document.createElementNS(NS, "title");
    tip.textContent = `${code} (${CAMELOT_KEY[code]}) : ${counts[code] || 0} morceau(x)`;
    path.append(tip);
    svg.append(path);
    const [x, y] = pt((r0 + r1) / 2, mid).split(",");
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", x); label.setAttribute("y", +y - 2); label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "11"); label.setAttribute("font-weight", "800"); label.setAttribute("fill", "#0b0b0b");
    label.textContent = code;
    const sub = document.createElementNS(NS, "text");
    sub.setAttribute("x", x); sub.setAttribute("y", +y + 10); sub.setAttribute("text-anchor", "middle");
    sub.setAttribute("font-size", "9"); sub.setAttribute("fill", "#0b0b0b"); sub.setAttribute("opacity", ".7");
    sub.textContent = counts[code] ? counts[code] : CAMELOT_KEY[code];
    svg.append(label, sub);
  }
  const hub = document.createElementNS(NS, "text");
  hub.setAttribute("x", C); hub.setAttribute("y", C + 5); hub.setAttribute("text-anchor", "middle");
  hub.setAttribute("font-size", "14"); hub.setAttribute("font-weight", "800"); hub.setAttribute("fill", "#f2f2f5");
  hub.textContent = wheelKey || "Camelot";
  svg.append(hub);
  $("wheel").replaceChildren(svg);
  $("wheel-status").textContent = wheelKey
    ? `${wheelKey} (${CAMELOT_KEY[wheelKey]}) et compatibles : ${[...compat].join(", ")}. Reclique pour tout voir.`
    : "Clique une tonalité pour voir les morceaux compatibles.";
}

function renderLibrary() {
  renderWheel();
  const camelotOrder = c => c ? parseInt(c) * 2 + (c.endsWith("B") ? 1 : 0) : 99;
  const sorters = {
    recent: () => 0,
    bpm: (a, b) => (a.bpm || 0) - (b.bpm || 0),
    key: (a, b) => camelotOrder(a.camelot) - camelotOrder(b.camelot) || (a.bpm || 0) - (b.bpm || 0),
    energy: (a, b) => (a.energy || 0) - (b.energy || 0),
    title: (a, b) => (a.title || "").localeCompare(b.title || ""),
  };
  let list = libTracks.slice();
  if (wheelKey) {
    const ok = new Set([wheelKey, ...compatibleKeys(wheelKey)]);
    list = list.filter(t => ok.has(t.camelot));
  }
  list.sort(sorters[libSort]);
  if (wheelKey) list.sort((a, b) => (b.camelot === wheelKey) - (a.camelot === wheelKey));  // même tonalité d'abord
  $("lib-status").textContent = libTracks.length ? `${list.length} morceau(x)${wheelKey ? ` sur ${libTracks.length}` : ""}` : "";
  const rows = list.map(libraryRow);
  $("lib-list").replaceChildren(thead(["Titre / Artiste", "Genre"]), ...rows.map(r => r.tr));
  if (!list.length) $("lib-list").append(el("div", { className: "empty", textContent: libTracks.length
    ? "Aucun morceau dans cette tonalité ni les tonalités compatibles."
    : "Aucun morceau pour l'instant. Analyse tes fichiers ou ajoute des morceaux trouvés en ligne avec « + »." }));
  // Pochettes manquantes : récupérées une fois (puis enregistrées), sans bloquer la page
  const token = {}; libToken = token;
  (async () => { for (const r of rows.filter(r => !r.t.cover).slice(0, 30)) { if (libToken !== token) return; await fetchCover(r); } })();
}

async function deleteTrack(t) {
  if (!confirm(`Supprimer « ${splitMix(t.title).name} » de ta bibliothèque ?`)) return;
  try { await api(`/api/tracks/${t.id}`, { method: "DELETE" }); }
  catch (e) { toast(e.message); return; }
  libTracks = libTracks.filter(x => x.id !== t.id);
  document.querySelectorAll(".track").forEach(tr => { if (tr._trackId === t.id) tr.remove(); });
  if (view === "library") renderLibrary();
  if (view === "sets" && currentSet) openSet(currentSet.id);
  if (drawerRow && drawerRow.t.id === t.id) closeDetail();
  setsCache = null;
  toast("Supprimé de ta bibliothèque");
}

// ================================================================ Mashup finder
const mash = { seed: null, tol: 6, hd: true, scope: "all", gen: 0 };
let seedTimer, seedGen = 0;
$("seed-q").oninput = () => { clearTimeout(seedTimer); seedTimer = setTimeout(searchSeed, 350); };

async function searchSeed() {
  const q = $("seed-q").value.trim(), gen = ++seedGen, status = $("seed-status");
  if (!q) { $("seed-results").replaceChildren(); status.textContent = ""; return; }
  status.classList.remove("err"); status.textContent = "Recherche…";
  let d;
  try { d = await api("/api/search?q=" + encodeURIComponent(q)); }
  catch (e) { status.textContent = e.message; status.classList.add("err"); return; }
  if (gen !== seedGen) return;
  const items = [...d.local.map(t => ({ ...t, origin: "library" })), ...d.online.slice(0, 10)];
  status.textContent = items.length ? "Choisis le morceau de départ :" : "Aucun résultat.";
  $("seed-results").replaceChildren(...items.map(t => makeRow(t, { kind: "compact", onPick: pickSeed }).tr));
}

async function pickSeed(row) {
  const status = $("seed-status");
  if (!(row.t.bpm && row.t.camelot) && !isLibrary(row.t)) {
    status.textContent = "Calcul du BPM et de la tonalité…";
    await loadDetails(row);
  }
  if (!(row.t.bpm && row.t.camelot)) { status.textContent = "BPM ou tonalité introuvable pour ce morceau, choisis-en un autre."; status.classList.add("err"); return; }
  setSeed({ ...row.t });
}

function setSeed(t) {
  mash.seed = t;
  const row = { t, opts: {}, render: () => renderSeed() };
  function renderSeed() {
    const { name, mix } = splitMix(t.title);
    $("seed-box").replaceChildren(el("div", { className: "seed" },
      artBox(row),
      el("div", { className: "s-info" },
        el("div", { className: "s-label", textContent: "Morceau de départ" }),
        el("div", { className: "s-title" }, name, mix ? el("span", { className: "mix muted", style: "font-weight:500", textContent: " " + mix }) : null),
        el("div", { className: "t-artist", textContent: t.artist || "" }),
        el("div", { className: "s-stats" }, el("span", { className: "num", textContent: `${t.bpm} BPM` }), keyPill(t.camelot, t.key), energyBadge(t.energy))),
      el("button", { className: "btn", textContent: "Changer", onclick: () => {
        $("seed-picker").classList.remove("hidden"); $("seed-box").classList.add("hidden");
        $("mashup-controls").classList.add("hidden"); $("seed-q").focus();
      } })));
    syncPlayButtons();
  }
  renderSeed();
  $("seed-picker").classList.add("hidden");
  $("seed-box").classList.remove("hidden");
  $("mashup-controls").classList.remove("hidden");
  runMashup();
}

function bindChips(id, attr, apply) {
  document.querySelectorAll(`#${id} .chip`).forEach(c => c.onclick = () => {
    document.querySelectorAll(`#${id} .chip`).forEach(x => x.classList.toggle("on", x === c));
    apply(c.dataset[attr]); runMashup();
  });
}
bindChips("tol-chips", "tol", v => mash.tol = Number(v));
bindChips("hd-chips", "hd", v => mash.hd = v === "1");
bindChips("scope-chips", "scope", v => mash.scope = v);

const compatCell = t => {
  const m = t.match, sign = m.bpm_diff > 0 ? "+" : "";
  return el("div", { className: "compat-cell" },
    el("b", { textContent: m.key_label }),
    el("span", { textContent: `${sign}${m.bpm_diff} % tempo${m.bpm_factor ? " · " + m.bpm_factor : ""} · ${m.score}/100` }),
    el("div", { className: "meter" }, el("i", { style: `width:${m.score}%` })));
};
const pairAction = row => {
  const b = el("button", { className: "icon-btn go", title: "Écouter les deux ensemble (tempo calé)", innerHTML: ICON.pair });
  b.dataset.play = "pair:" + playKey(mash.seed) + "|" + playKey(row.t);
  b.dataset.icon = "pair";
  b.onclick = e => { e.stopPropagation(); playPair(row); };
  return b;
};

async function playPair(row) {
  const seed = mash.seed, t = row.t;
  try { await Promise.all([ensurePreview(seed), ensurePreview(t)]); }
  catch (e) { toast(e.message); return; }
  row.render();
  const factor = t.match.bpm_factor === "×2" ? 2 : t.match.bpm_factor === "÷2" ? 0.5 : 1;
  startPlayer({ key: "pair:" + playKey(seed) + "|" + playKey(t), url: seed.preview_url, url2: t.preview_url,
                rate: seed.bpm / (t.bpm * factor),
                title: `${splitMix(seed.title).name} × ${splitMix(t.title).name}`, artist: "Mashup · tempo calé", cover: t.cover || seed.cover });
}

async function runMashup() {
  const s = mash.seed; if (!s) return;
  const gen = ++mash.gen, status = $("mashup-status");
  if (mash.scope === "library" && !me) { status.textContent = "Connecte-toi pour chercher dans ta bibliothèque."; $("mashup-list").replaceChildren(); return; }
  status.classList.remove("err"); status.textContent = "Recherche des morceaux compatibles…";
  const p = new URLSearchParams({ bpm: s.bpm, camelot: s.camelot, title: s.title || "", artist: s.artist || "",
                                  tolerance: mash.tol, half_double: mash.hd, scope: mash.scope });
  let d;
  try { d = await api("/api/mashup?" + p); }
  catch (e) { status.textContent = e.message; status.classList.add("err"); return; }
  if (gen !== mash.gen) return;
  status.textContent = d.tracks.length
    ? `${d.tracks.length} morceau(x) compatible(s), parmi ${d.pool} morceaux connus. ▶▶ = écouter les deux ensemble.`
    : `Aucun morceau compatible parmi ${d.pool} morceaux connus.`;
  const rows = d.tracks.map(t => makeRow({ ...t, sources: t.origin === "library" ? ["library"] : [t.source].filter(Boolean) },
                                         { kind: "mashup", third: compatCell, action: pairAction }));
  $("mashup-list").replaceChildren(thead(["Titre / Artiste", "Compatibilité"]), ...rows.map(r => r.tr));
  if (!rows.length) $("mashup-list").append(el("div", { className: "empty" },
    "Élargis l'écart de tempo, ou enrichis le réservoir : chaque morceau consulté sur le site (recherche, tops de l'accueil) ou analysé y est ajouté."));
}

// ================================================================ Sets
let currentSet = null;
$("new-set").onclick = async () => {
  const name = prompt("Nom du set :", "Mon set");
  if (!name) return;
  try { const s = await postJson("/api/sets", { name }); setsCache = null; await loadSets(); openSet(s.id); }
  catch (e) { toast(e.message); }
};

async function loadSets() {
  $("sets-gate").classList.toggle("hidden", !!me);
  $("sets-body").classList.toggle("hidden", !me);
  if (!me) { $("sets-gate").replaceChildren(gate("Crée des sets, obtiens l'ordre harmonique idéal et exporte-les vers Rekordbox.")); return; }
  let list;
  try { setsCache = null; list = await getSets(); } catch (e) { toast(e.message); return; }
  $("sets-list").replaceChildren(...list.map(s => el("button", {
    className: "set-item" + (currentSet && currentSet.id === s.id ? " on" : ""), onclick: () => openSet(s.id) },
    el("b", { textContent: s.name }), el("small", { textContent: `${s.count} titre(s) · ${fmtLong(s.duration_sec)}` }))));
  if (!list.length) {
    $("sets-list").append(el("p", { className: "muted", style: "font-size:13px", textContent: "Aucun set pour l'instant." }));
    $("set-detail").replaceChildren(el("div", { className: "gate" }, el("b", { textContent: "Crée ton premier set" }),
      el("p", { textContent: "Ajoute ensuite des morceaux depuis la bibliothèque, la recherche ou les tops (« + Ajouter à un set » dans le détail d'un morceau)." })));
    currentSet = null;
  } else if (!currentSet || !list.some(s => s.id === currentSet.id)) openSet(list[0].id);
}

async function openSet(id) {
  try { currentSet = await api(`/api/sets/${id}`); } catch (e) { toast(e.message); return; }
  document.querySelectorAll(".set-item").forEach((b, i) => b.classList.toggle("on", (setsCache || [])[i]?.id === id));
  renderSet();
}

function energyCurve(tracks) {
  const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
  const W = 600, H = 120, pad = 14, n = tracks.length;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio", "none");
  const x = i => n === 1 ? W / 2 : pad + i * (W - 2 * pad) / (n - 1);
  const y = e => H - pad - ((e || 1) - 1) * (H - 2 * pad) / 9;
  for (const e of [1, 5, 10]) {
    const l = document.createElementNS(NS, "line");
    l.setAttribute("x1", 0); l.setAttribute("x2", W); l.setAttribute("y1", y(e)); l.setAttribute("y2", y(e));
    l.setAttribute("stroke", "#25252d"); l.setAttribute("stroke-dasharray", "3 4");
    svg.append(l);
  }
  const pts = tracks.map((t, i) => [x(i), y(t.energy)]);
  if (n > 1) {
    const area = document.createElementNS(NS, "path");
    area.setAttribute("d", `M${pts[0][0]},${H} ` + pts.map(p => `L${p[0]},${p[1]}`).join(" ") + ` L${pts[n - 1][0]},${H} Z`);
    area.setAttribute("fill", "rgba(0,230,160,.10)");
    const line = document.createElementNS(NS, "polyline");
    line.setAttribute("points", pts.map(p => p.join(",")).join(" "));
    line.setAttribute("fill", "none"); line.setAttribute("stroke", "#00e6a0"); line.setAttribute("stroke-width", "2.5");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    svg.append(area, line);
  }
  tracks.forEach((t, i) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", pts[i][0]); c.setAttribute("cy", pts[i][1]); c.setAttribute("r", 5);
    c.setAttribute("fill", t.camelot ? keyColor(t.camelot) : "#8b8b98"); c.setAttribute("stroke", "#0a0a0c"); c.setAttribute("stroke-width", 2);
    const tip = document.createElementNS(NS, "title");
    tip.textContent = `${i + 1}. ${t.title} — énergie ${t.energy || "?"}, ${keyLabel(t) || "?"}`;
    c.append(tip); svg.append(c);
  });
  return svg;
}

function renderSet() {
  const s = currentSet;
  const nameInput = el("input", { className: "set-name", value: s.name, maxLength: 100, title: "Renommer" });
  nameInput.onchange = async () => {
    const name = nameInput.value.trim(); if (!name) { nameInput.value = s.name; return; }
    try { currentSet = await postJson(`/api/sets/${s.id}`, { name }, "PUT"); loadSets(); } catch (e) { toast(e.message); }
  };
  const st = s.stats;
  const head = el("div", { className: "set-head" }, nameInput,
    el("button", { className: "btn primary", textContent: "Ordre harmonique auto", disabled: st.count < 3, title: "Enchaîne au mieux tonalités, tempos et énergie",
      onclick: async () => { try { currentSet = await postJson(`/api/sets/${s.id}/optimize`, {}); renderSet(); toast("Ordre optimisé"); } catch (e) { toast(e.message); } } }),
    el("button", { className: "btn", textContent: "Exporter", disabled: !st.count, onclick: () => openExport(s) }),
    el("button", { className: "btn danger", textContent: "Supprimer", onclick: async () => {
      if (!confirm(`Supprimer le set « ${s.name} » ? (les morceaux restent dans ta bibliothèque)`)) return;
      try { await api(`/api/sets/${s.id}`, { method: "DELETE" }); currentSet = null; loadSets(); } catch (e) { toast(e.message); }
    } }));
  const summary = el("p", { className: "status", textContent: st.count
    ? `${st.count} titre(s) · ${fmtLong(st.duration_sec)}` + (st.bpm_min ? ` · ${st.bpm_min === st.bpm_max ? st.bpm_min : st.bpm_min + "–" + st.bpm_max} BPM` : "")
    : "Set vide : ajoute des morceaux avec « + Ajouter à un set » dans le détail d'un morceau." });
  const list = el("div", { className: "tracks set" });
  s.tracks.forEach((t, i) => {
    if (i > 0) {
      const tr = s.transitions[i - 1];
      list.append(el("div", { className: "trans " + tr.quality }, el("i"),
        `${tr.key_label}${tr.bpm_diff != null ? ` · ${tr.bpm_diff} % tempo` : ""}`));
    }
    const row = makeRow({ ...t, origin: "library", bpm_source: "local", key_source: "local" }, { kind: "set", position: i + 1, action: r =>
      el("button", { className: "icon-btn danger", title: "Retirer du set", innerHTML: ICON.close, onclick: e => { e.stopPropagation(); reorder(s.tracks.filter(x => x.id !== r.t.id).map(x => x.id)); } }) });
    dragify(row.tr, t.id);
    list.append(row.tr);
  });
  $("set-detail").replaceChildren(head, summary,
    st.count ? el("div", { className: "curve" }, el("small", { className: "lbl", textContent: "Courbe d'énergie" }), energyCurve(s.tracks)) : null,
    list);
}

async function reorder(ids) {
  try { currentSet = await postJson(`/api/sets/${currentSet.id}`, { track_ids: ids }, "PUT"); setsCache = null; renderSet(); }
  catch (e) { toast(e.message); }
}

// Glisser-déposer pour réordonner (souris ; sur mobile, l'ordre auto fait le travail)
let dragId = null;
function dragify(tr, id) {
  tr.draggable = true;
  tr.ondragstart = e => { dragId = id; tr.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; };
  tr.ondragend = () => { tr.classList.remove("dragging"); document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before")); };
  tr.ondragover = e => { e.preventDefault(); document.querySelectorAll(".drop-before").forEach(x => x.classList.remove("drop-before")); tr.classList.add("drop-before"); };
  tr.ondrop = e => {
    e.preventDefault();
    if (dragId == null || dragId === id) return;
    const ids = currentSet.tracks.map(t => t.id).filter(x => x !== dragId);
    ids.splice(ids.indexOf(id), 0, dragId);
    dragId = null; reorder(ids);
  };
}

function openExport(s) {
  let base = ""; try { base = localStorage.getItem("musicDir") || ""; } catch {}
  const dir = el("input", { type: "text", value: base, placeholder: "ex. C:\\Users\\moi\\Music ou /Users/moi/Music" });
  const opt = (value, title, desc, checked) => el("label", { className: "radio" },
    el("input", { type: "radio", name: "fmt", value, checked }), el("span", {}, el("b", { textContent: title }), el("small", { textContent: desc })));
  const form = el("form", {},
    opt("rekordbox", "Rekordbox (XML)", "BPM et tonalité inclus. Rekordbox : Préférences › Avancé › Base de données › XML.", true),
    opt("m3u", "Playlist M3U", "Serato, Traktor, VirtualDJ, Engine DJ…", false),
    opt("csv", "Tableau CSV", "Tracklist pour Excel ou pour partager.", false),
    el("label", { textContent: "Dossier où se trouvent tes fichiers (pour Rekordbox / M3U)" }), dir,
    el("p", { className: "muted", style: "font-size:12px;margin:6px 0 0", textContent: "Seuls les morceaux analysés depuis un fichier peuvent être retrouvés par ton logiciel." }),
    el("div", { className: "row" }, el("button", { className: "btn primary", type: "submit", textContent: "Télécharger" })));
  form.onsubmit = e => {
    e.preventDefault();
    try { localStorage.setItem("musicDir", dir.value); } catch {}
    const fmt = form.querySelector("input[name=fmt]:checked").value;
    location.href = `/api/sets/${s.id}/export?` + new URLSearchParams({ format: fmt, base_dir: dir.value });
    closeModal();
  };
  openModal(el("h3", { textContent: `Exporter « ${s.name} »` }), form);
}

// ================================================================ Démarrage
async function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  const m = h.match(/^(track|mashup)=(.+)$/);
  if (!m) { show(h === "search" ? "home" : h); return; }
  show(m[1] === "mashup" ? "mashup" : "home");
  try {
    const t = await api("/api/online/" + encodeURIComponent(m[2]));
    if (m[1] === "mashup" && t.bpm && t.camelot) setSeed(t);
    else openDetail(makeRow(t, { kind: "online" }));
  } catch (e) { toast(e.message); }
}
syncPlayButtons();
loadMe().then(openFromHash);
