/* ==========================================================================
   Marche Japonaise — app.js
   Toutes les données restent en local (localStorage) sur l'appareil.
   ========================================================================== */

(function () {
  "use strict";

  /* ============================== CONSTANTES ============================ */
  const LS_SESSIONS = "mj_sessions_v1";
  const LS_GOALS = "mj_goals_v1";
  const LS_SEEN_TROPHIES = "mj_seen_trophies_v1";
  const DEFAULT_GOALS = { seances: 8, distance: 20, kcal: 2000 };

  const JOURS_LABEL = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const JOURS_LABEL_CAP = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
  const MOIS_LABEL = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const MOIS_ABBR = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  /* ================================ UTILS ================================ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const uid = () => "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const escapeHtml = (str) =>
    String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stripAccents = (str) => String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const norm = (str) => stripAccents(String(str || "")).toLowerCase().trim();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function toast(msg, emoji) {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast";
    el.innerHTML = `<span>${emoji || "✅"}</span><span>${escapeHtml(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  /* ============================ DATES & TEMPS ============================ */
  function parseDateFlexible(str) {
    if (!str) return null;
    str = String(str).trim();
    let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); // ISO
    if (m) return isoFromYMD(+m[1], +m[2], +m[3]);
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); // dd/mm/yyyy
    if (m) return isoFromYMD(+m[3], +m[2], +m[1]);
    m = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2})$/); // dd/mm/yy
    if (m) return isoFromYMD(2000 + +m[3], +m[2], +m[1]);
    const d = new Date(str);
    if (!isNaN(d.getTime())) return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
    return null;
  }
  function isoFromYMD(y, mo, d) {
    return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  function dateFromISO(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function formatDateShort(iso) {
    const d = dateFromISO(iso);
    return `${d.getDate()} ${MOIS_ABBR[d.getMonth()]}`;
  }
  function formatDateLong(iso) {
    const d = dateFromISO(iso);
    return `${JOURS_LABEL_CAP[d.getDay()]} ${d.getDate()} ${MOIS_LABEL[d.getMonth()]} ${d.getFullYear()}`;
  }
  function seasonOf(iso) {
    const m = dateFromISO(iso).getMonth() + 1;
    if ([12, 1, 2].includes(m)) return "hiver";
    if ([3, 4, 5].includes(m)) return "printemps";
    if ([6, 7, 8].includes(m)) return "ete";
    return "automne";
  }
  function mondayOf(iso) {
    const d = dateFromISO(iso);
    const day = (d.getDay() + 6) % 7; // 0 = lundi
    d.setDate(d.getDate() - day);
    return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function addDaysISO(iso, n) {
    const d = dateFromISO(iso);
    d.setDate(d.getDate() + n);
    return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function monthKey(iso) {
    return iso.slice(0, 7);
  }
  function todayISO() {
    const d = new Date();
    return isoFromYMD(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  /* ============================ RYTHME (X'YY") ============================ */
  // Interprète explicitement "X'YY" comme "X'YY"" (X minutes, YY secondes / km).
  function parsePace(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str) return null;
    const m = str.match(/^(\d{1,2})\s*[''′]\s*(\d{1,2})/);
    if (m) {
      const min = +m[1];
      const sec = +m[2];
      if (sec > 59) return null;
      return min * 60 + sec;
    }
    const m2 = str.match(/^(\d{1,2}):(\d{1,2})$/); // fallback mm:ss
    if (m2) return +m2[1] * 60 + +m2[2];
    const asNum = parseFRNumber(str);
    return asNum != null && asNum > 0 && asNum < 60 ? Math.round(asNum * 60) : null; // "7,5" -> 7'30
  }
  function formatPace(sec) {
    if (!sec && sec !== 0) return "—";
    sec = Math.round(sec);
    return `${Math.floor(sec / 60)}'${String(sec % 60).padStart(2, "0")}"`;
  }

  /* ============================ DURÉE ============================ */
  function parseDuree(str) {
    if (str == null) return null;
    str = String(str).trim();
    if (!str) return null;
    let m = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/); // h:mm:ss
    if (m) return (+m[1]) * 60 + (+m[2]) + (+m[3]) / 60;
    m = str.match(/^(\d{1,3}):(\d{2})$/); // mm:ss
    if (m) return +m[1] + +m[2] / 60;
    m = str.match(/^(\d{1,2})\s*h\s*(\d{0,2})/i); // 1h05 / 1h
    if (m) return (+m[1]) * 60 + (m[2] ? +m[2] : 0);
    m = str.match(/^(\d+[.,]?\d*)\s*(mn|min)/i);
    if (m) return parseFRNumber(m[1]);
    const n = parseFRNumber(str);
    return n != null ? n : null;
  }
  function formatDuree(min) {
    if (min == null) return "—";
    min = Math.round(min);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60);
    const r = min % 60;
    return r === 0 ? `${h} h` : `${h} h ${String(r).padStart(2, "0")}`;
  }

  /* ============================ NOMBRES ============================ */
  function parseFRNumber(str) {
    if (str == null || str === "") return null;
    const cleaned = String(str).replace(/\s/g, "").replace(",", ".").replace(/[^\d.\-]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  function formatKm(km) {
    if (km == null) return "—";
    return km.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " km";
  }
  function formatKmShort(km) {
    if (km == null) return "—";
    return km.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  /* ================================ STORAGE ================================ */
  const Store = {
    getSessions() {
      try {
        const raw = localStorage.getItem(LS_SESSIONS);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
      } catch (e) {
        return [];
      }
    },
    setSessions(arr) {
      localStorage.setItem(LS_SESSIONS, JSON.stringify(arr));
    },
    getGoals() {
      try {
        const raw = localStorage.getItem(LS_GOALS);
        return raw ? { ...DEFAULT_GOALS, ...JSON.parse(raw) } : { ...DEFAULT_GOALS };
      } catch (e) {
        return { ...DEFAULT_GOALS };
      }
    },
    setGoals(g) {
      localStorage.setItem(LS_GOALS, JSON.stringify(g));
    },
    getSeenTrophies() {
      try {
        const raw = localStorage.getItem(LS_SEEN_TROPHIES);
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    },
    setSeenTrophies(ids) {
      localStorage.setItem(LS_SEEN_TROPHIES, JSON.stringify(ids));
    },
  };

  function sortedSessions() {
    return Store.getSessions().slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  function saveSession(data) {
    const list = Store.getSessions();
    if (data.id) {
      const idx = list.findIndex((s) => s.id === data.id);
      if (idx >= 0) list[idx] = data;
      else list.push(data);
    } else {
      data.id = uid();
      list.push(data);
    }
    Store.setSessions(list);
    onDataChanged();
  }
  function deleteSession(id) {
    Store.setSessions(Store.getSessions().filter((s) => s.id !== id));
    onDataChanged();
  }

  /* ================================ CSV ================================ */
  function parseCSVText(text) {
    // Détecte le séparateur (virgule ou point-virgule) sur la 1ère ligne.
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    const delim = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === delim) { row.push(field); field = ""; }
        else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else if (c === "\r") { /* ignore */ }
        else field += c;
      }
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  const HEADER_MATCHERS = [
    { key: "date", test: (h) => /^date/.test(h) },
    { key: "lieu", test: (h) => /lieu|endroit|location/.test(h) },
    { key: "distance", test: (h) => /distance|km/.test(h) },
    { key: "meteo", test: (h) => /meteo|weather/.test(h) },
    { key: "duree", test: (h) => /duree|temps total|duration/.test(h) },
    { key: "fc", test: (h) => /frequence|cardiaque|fc |^fc$|bpm/.test(h) },
    { key: "rythmeMoyen", test: (h) => /rythme moyen|allure moyenne|pace moyen/.test(h) },
    { key: "rythmeRapide", test: (h) => /rapide/.test(h) },
    { key: "rythmeLent", test: (h) => /lent/.test(h) },
    { key: "kcal", test: (h) => /kilocal|kcal|calories/.test(h) },
    { key: "commentaire", test: (h) => /comment|remarque|note/.test(h) },
  ];

  function mapHeaders(headerRow) {
    const map = {}; // index -> key
    const used = new Set();
    headerRow.forEach((raw, idx) => {
      const h = norm(raw);
      for (const m of HEADER_MATCHERS) {
        if (m.test(h) && !used.has(m.key)) {
          map[idx] = m.key;
          used.add(m.key);
          break;
        }
      }
    });
    return map;
  }

  function rowsToSessions(rows) {
    if (!rows.length) return { sessions: [], recognized: {} };
    const map = mapHeaders(rows[0]);
    const recognized = {};
    Object.values(map).forEach((k) => (recognized[k] = true));
    const sessions = [];
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const obj = { date: "", lieu: "", distance: null, meteo: "", duree: null, fc: null, rythmeMoyen: null, rythmeRapide: null, rythmeLent: null, kcal: null, commentaire: "" };
      let any = false;
      Object.entries(map).forEach(([idx, key]) => {
        const val = row[idx] != null ? String(row[idx]).trim() : "";
        if (val !== "") any = true;
        switch (key) {
          case "date": obj.date = parseDateFlexible(val) || ""; break;
          case "lieu": obj.lieu = val; break;
          case "distance": obj.distance = parseFRNumber(val); break;
          case "meteo": obj.meteo = val; break;
          case "duree": obj.duree = parseDuree(val); break;
          case "fc": obj.fc = parseFRNumber(val); break;
          case "rythmeMoyen": obj.rythmeMoyen = parsePace(val); break;
          case "rythmeRapide": obj.rythmeRapide = parsePace(val); break;
          case "rythmeLent": obj.rythmeLent = parsePace(val); break;
          case "kcal": obj.kcal = parseFRNumber(val); break;
          case "commentaire": obj.commentaire = val; break;
        }
      });
      if (any && obj.date) { obj.id = uid(); sessions.push(obj); }
    }
    return { sessions, recognized };
  }

  function sessionsToCSV(list) {
    const headers = ["date", "lieu", "distance", "météo", "durée", "fréquence cardiaque moyenne", "rythme moyen", "rythme de l'intervalle le plus rapide", "rythme de l'intervalle le plus lent", "kilocalories totales", "commentaires"];
    const esc = (v) => {
      v = v == null ? "" : String(v);
      return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    };
    const lines = [headers.join(";")];
    list.forEach((s) => {
      const d = dateFromISO(s.date);
      const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      lines.push([
        dateStr,
        esc(s.lieu),
        s.distance != null ? String(s.distance).replace(".", ",") : "",
        esc(s.meteo),
        s.duree != null ? formatDuree(s.duree).replace(" ", "") : "",
        s.fc != null ? s.fc : "",
        s.rythmeMoyen != null ? formatPace(s.rythmeMoyen) : "",
        s.rythmeRapide != null ? formatPace(s.rythmeRapide) : "",
        s.rythmeLent != null ? formatPace(s.rythmeLent) : "",
        s.kcal != null ? s.kcal : "",
        esc(s.commentaire),
      ].join(";"));
    });
    return "\uFEFF" + lines.join("\r\n");
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function dedupeKey(s) {
    return [s.date, norm(s.lieu), s.distance, s.duree, s.kcal].join("|");
  }
  function importSessions(newOnes) {
    const existing = Store.getSessions();
    const existingKeys = new Set(existing.map(dedupeKey));
    let added = 0;
    newOnes.forEach((s) => {
      const k = dedupeKey(s);
      if (!existingKeys.has(k)) { existing.push(s); existingKeys.add(k); added++; }
    });
    Store.setSessions(existing);
    onDataChanged();
    return added;
  }

  /* ============================ CONTEXTE STATISTIQUE ============================ */
  const METEO_KEYWORDS = {
    pluie: ["pluie", "pluv", "averse"],
    neige: ["neige", "neig"],
    vent: ["vent", "venteux", "rafale"],
    brouillard: ["brouillard", "brume"],
    orage: ["orage", "tonnerre", "eclair"],
    canicule: ["canicule", "caniculaire"],
    froid: ["froid", "glacial", "gel", "gele"],
    soleil: ["soleil", "ensoleille", "ensoleillé", "clair"],
    nuageux: ["nuageux", "couvert", "nuage"],
  };

  function buildContext(sessionsAsc) {
    const ctx = {
      sessions: sessionsAsc,
      count: sessionsAsc.length,
      totalDistance: 0, totalKcal: 0, totalDureeMin: 0,
      bestDistance: 0, bestKcal: 0,
      bestRythmeMoyenSec: 0, bestRythmeRapideSec: 0, bestEcartIntervalles: 0,
      fcZonesAtteintes: new Set(),
      lieuCounts: new Map(),
      meteoKeywords: new Set(),
      weekdaysDone: new Set(),
      weekendCount: 0,
      seasonsDone: new Set(),
      daysSinceFirst: 0,
      commentsCount: 0, hasLongComment: false,
      streakRythmeAmeliore: 0,
      nbRecordsDistance: 0, nbRecordsKcal: 0, nbRecordsRythmeRapide: 0,
      maxMonthlyCount: 0,
      hasRoundDistance: false,
      streakWeeks: 0, streakMonths: 0,
    };
    if (!sessionsAsc.length) return finalizeCtx(ctx);

    let minRythmeMoyen = Infinity, minRythmeRapide = Infinity;
    let runMaxDist = -Infinity, runMaxKcal = -Infinity, runMinRapide = Infinity;
    const monthCounts = new Map();

    sessionsAsc.forEach((s) => {
      if (s.distance != null) { ctx.totalDistance += s.distance; ctx.bestDistance = Math.max(ctx.bestDistance, s.distance); }
      if (s.kcal != null) { ctx.totalKcal += s.kcal; ctx.bestKcal = Math.max(ctx.bestKcal, s.kcal); }
      if (s.duree != null) ctx.totalDureeMin += s.duree;
      if (s.rythmeMoyen) minRythmeMoyen = Math.min(minRythmeMoyen, s.rythmeMoyen);
      if (s.rythmeRapide) minRythmeRapide = Math.min(minRythmeRapide, s.rythmeRapide);
      if (s.rythmeRapide && s.rythmeLent) ctx.bestEcartIntervalles = Math.max(ctx.bestEcartIntervalles, s.rythmeLent - s.rythmeRapide);

      if (s.fc != null) {
        if (s.fc < 100) ctx.fcZonesAtteintes.add("lt");
        else if (s.fc < 120) ctx.fcZonesAtteintes.add("range100");
        else if (s.fc < 140) ctx.fcZonesAtteintes.add("range120");
        else if (s.fc < 160) ctx.fcZonesAtteintes.add("range140");
        else ctx.fcZonesAtteintes.add("gt160");
      }
      if (s.lieu) ctx.lieuCounts.set(s.lieu, (ctx.lieuCounts.get(s.lieu) || 0) + 1);
      if (s.meteo) {
        const mn = norm(s.meteo);
        Object.entries(METEO_KEYWORDS).forEach(([key, words]) => {
          if (words.some((w) => mn.includes(w))) ctx.meteoKeywords.add(key);
        });
      }
      if (s.date) {
        const dow = dateFromISO(s.date).getDay();
        ctx.weekdaysDone.add(dow);
        if (dow === 0 || dow === 6) ctx.weekendCount++;
        ctx.seasonsDone.add(seasonOf(s.date));
        const mk = monthKey(s.date);
        monthCounts.set(mk, (monthCounts.get(mk) || 0) + 1);
      }
      if (s.commentaire && s.commentaire.trim()) {
        ctx.commentsCount++;
        if (s.commentaire.trim().length > 100) ctx.hasLongComment = true;
      }
      if (s.distance != null && Math.abs(s.distance - Math.round(s.distance)) < 1e-9) ctx.hasRoundDistance = true;

      if (s.distance != null) { if (s.distance > runMaxDist) { ctx.nbRecordsDistance++; runMaxDist = s.distance; } }
      if (s.kcal != null) { if (s.kcal > runMaxKcal) { ctx.nbRecordsKcal++; runMaxKcal = s.kcal; } }
      if (s.rythmeRapide) { if (s.rythmeRapide < runMinRapide) { ctx.nbRecordsRythmeRapide++; runMinRapide = s.rythmeRapide; } }
    });

    ctx.bestRythmeMoyenSec = isFinite(minRythmeMoyen) ? minRythmeMoyen : 0;
    ctx.bestRythmeRapideSec = isFinite(minRythmeRapide) ? minRythmeRapide : 0;
    ctx.distinctLieux = ctx.lieuCounts.size;
    ctx.maxLieuCount = ctx.lieuCounts.size ? Math.max(...ctx.lieuCounts.values()) : 0;
    ctx.maxMonthlyCount = monthCounts.size ? Math.max(...monthCounts.values()) : 0;

    const firstDate = sessionsAsc[0].date;
    ctx.daysSinceFirst = Math.floor((dateFromISO(todayISO()) - dateFromISO(firstDate)) / 86400000);

    // Série d'amélioration du rythme moyen (en partant de la fin, en remontant)
    let streak = 0;
    for (let i = sessionsAsc.length - 1; i > 0; i--) {
      const cur = sessionsAsc[i].rythmeMoyen, prev = sessionsAsc[i - 1].rythmeMoyen;
      if (cur && prev && cur < prev) streak++;
      else break;
    }
    ctx.streakRythmeAmeliore = streak;

    // Séries de semaines / mois consécutifs (meilleure série historique)
    ctx.streakWeeks = longestConsecutive(Array.from(new Set(sessionsAsc.map((s) => mondayOf(s.date)))).sort(), 7, (a, b) => (dateFromISO(b) - dateFromISO(a)) / 86400000);
    const monthIdx = Array.from(new Set(sessionsAsc.map((s) => monthKey(s.date)))).map((mk) => {
      const [y, m] = mk.split("-").map(Number);
      return y * 12 + (m - 1);
    }).sort((a, b) => a - b);
    ctx.streakMonths = longestConsecutiveInts(monthIdx);

    return finalizeCtx(ctx);
  }
  function finalizeCtx(ctx) {
    if (!ctx.lieuCounts) ctx.lieuCounts = new Map();
    ctx.distinctLieux = ctx.distinctLieux || 0;
    ctx.maxLieuCount = ctx.maxLieuCount || 0;
    return ctx;
  }
  function longestConsecutive(sortedISOWeeks, stepDays) {
    if (!sortedISOWeeks.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < sortedISOWeeks.length; i++) {
      const diff = (dateFromISO(sortedISOWeeks[i]) - dateFromISO(sortedISOWeeks[i - 1])) / 86400000;
      if (diff === stepDays) { cur++; best = Math.max(best, cur); } else cur = 1;
    }
    return best;
  }
  function longestConsecutiveInts(sortedInts) {
    if (!sortedInts.length) return 0;
    let best = 1, cur = 1;
    for (let i = 1; i < sortedInts.length; i++) {
      if (sortedInts[i] === sortedInts[i - 1] + 1) { cur++; best = Math.max(best, cur); } else cur = 1;
    }
    return best;
  }

  function getRecordSessions(sessionsAsc) {
    let bestDist = null, bestKcal = null, bestRapide = null, bestMoyen = null;
    sessionsAsc.forEach((s) => {
      if (s.distance != null && (!bestDist || s.distance > bestDist.distance)) bestDist = s;
      if (s.kcal != null && (!bestKcal || s.kcal > bestKcal.kcal)) bestKcal = s;
      if (s.rythmeRapide && (!bestRapide || s.rythmeRapide < bestRapide.rythmeRapide)) bestRapide = s;
      if (s.rythmeMoyen && (!bestMoyen || s.rythmeMoyen < bestMoyen.rythmeMoyen)) bestMoyen = s;
    });
    return { bestDist, bestKcal, bestRapide, bestMoyen };
  }

  function contextLine(s) {
    if (!s) return "";
    const d = dateFromISO(s.date);
    return `${s.lieu || "Lieu non précisé"} · ${JOURS_LABEL_CAP[d.getDay()]} ${d.getDate()} ${MOIS_LABEL[d.getMonth()]} ${d.getFullYear()}${s.meteo ? " · " + escapeHtml(s.meteo) : ""}`;
  }

  /* ============================ RENDU : ACCUEIL ============================ */
  function ringsSVG(fractions) {
    // fractions: [{color, value}] rayon décroissant, comme les anneaux Forme.
    const R = [62, 47, 32];
    const stroke = 11;
    let svg = `<svg class="rings-svg" viewBox="0 0 148 148">`;
    fractions.forEach((f, i) => {
      const r = R[i];
      const c = 2 * Math.PI * r;
      const frac = clamp(f.value, 0, 1);
      svg += `<circle cx="74" cy="74" r="${r}" fill="none" stroke="${f.color}" stroke-opacity="0.18" stroke-width="${stroke}"/>`;
      svg += `<circle cx="74" cy="74" r="${r}" fill="none" stroke="${f.color}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 74 74)"/>`;
    });
    svg += `</svg>`;
    return svg;
  }

  const TIPS = [
    "La marche japonaise alterne 3 min d'allure rapide et 3 min d'allure normale : c'est ce contraste d'intensité qui fait tout l'intérêt de la méthode, plus que la vitesse brute.",
    "Pendant les 3 minutes rapides, visez un effort où parler devient difficile mais reste possible : c'est le repère le plus simple pour bien doser l'intensité.",
    "Pendant les 3 minutes normales, laissez vraiment votre fréquence cardiaque redescendre : c'est cette récupération active qui prépare le prochain intervalle rapide.",
    "Un léger balancement des bras, coudes pliés à 90°, aide à propulser la marche rapide sans forcer sur les jambes.",
    "Allonger la foulée en phase rapide est plus efficace — et moins traumatisant pour les articulations — qu'augmenter uniquement la cadence.",
    "Gardez le regard loin devant et le menton parallèle au sol : une bonne posture limite les tensions dans le cou et le bas du dos.",
    "5 cycles de 6 minutes (3+3) suffisent à composer une séance complète de 30 minutes : pas besoin d'aller plus loin pour en tirer les bénéfices.",
    "La régularité prime sur la performance : mieux vaut 3 séances modestes par semaine qu'une séance intense isolée.",
    "Variez les lieux de marche : un terrain légèrement vallonné augmente naturellement l'intensité des intervalles rapides.",
    "Pensez à vous hydrater avant la séance, surtout par temps chaud ou lors d'intervalles rapides soutenus.",
    "Un bon amorti sous le talon et l'avant-pied fait une vraie différence sur 30 minutes d'alternance d'allures.",
    "Notez vos sensations dans les commentaires : elles racontent souvent plus que les chiffres sur la qualité d'une séance.",
    "Le froid raidit les muscles : rallongez légèrement l'échauffement en début de séance quand les températures chutent.",
    "Essayez de garder la même boucle test une fois par mois : c'est le meilleur moyen de mesurer votre vraie progression.",
    "Respirer par le nez en phase normale et par la bouche en phase rapide aide à réguler naturellement l'effort.",
    "La marche japonaise a été conçue comme une alternative accessible à la course à pied pour travailler l'endurance et la force des jambes.",
    "Un carnet de bord régulier (comme celui-ci !) est l'un des meilleurs leviers de motivation sur la durée.",
    "Pas besoin de terrain plat : les petites côtes sont d'excellentes alliées pendant les intervalles rapides.",
    "Écoutez votre corps : si une séance est trop difficile, ralentissez la phase rapide plutôt que de l'écourter.",
    "Chaque séance compte, même les jours de météo maussade — regardez vos trophées « météo » pour vous en convaincre !",
  ];
  function tipOfTheDay() {
    const start = new Date(new Date().getFullYear(), 0, 0);
    const diff = new Date() - start;
    const dayOfYear = Math.floor(diff / 86400000);
    return TIPS[dayOfYear % TIPS.length];
  }

  function renderAccueil() {
    const all = sortedSessions();
    const ctx = buildContext(all);
    const goals = Store.getGoals();
    const container = $("#accueil-content");

    if (!all.length) {
      container.innerHTML = `
        <div class="rings-card" style="margin-bottom:18px;">
          ${ringsSVG([{ color: "var(--red)", value: 0 }, { color: "var(--green)", value: 0 }, { color: "var(--cyan)", value: 0 }])}
          <div class="rings-legend">
            <div class="legend-row"><span class="legend-dot" style="background:var(--red)"></span><span class="lbl">Kcal du mois</span></div>
            <div class="legend-row"><span class="legend-dot" style="background:var(--green)"></span><span class="lbl">Distance du mois</span></div>
            <div class="legend-row"><span class="legend-dot" style="background:var(--cyan)"></span><span class="lbl">Séances du mois</span></div>
          </div>
        </div>
        <div class="card empty-state">
          <span class="emoji">🚶‍♀️</span>
          <h3>Aucune séance enregistrée</h3>
          <p>Ajoutez votre première séance ou importez votre suivi depuis Google Sheets pour démarrer.</p>
          <div class="btn-row">
            <button class="btn btn-secondary" id="cta-import">Importer</button>
            <button class="btn btn-primary" id="cta-add">Ajouter une séance</button>
          </div>
        </div>
        <div class="card tip-card">
          <p class="card-title">💡 Le conseil du jour</p>
          <p style="font-size:13.5px; line-height:1.5; margin:0;">${escapeHtml(tipOfTheDay())}</p>
        </div>`;
      $("#cta-add").onclick = () => openSessionModal();
      $("#cta-import").onclick = () => openSettingsModal();
      return;
    }

    const thisMonth = monthKey(todayISO());
    const monthSessions = all.filter((s) => monthKey(s.date) === thisMonth);
    const mDist = monthSessions.reduce((a, s) => a + (s.distance || 0), 0);
    const mKcal = monthSessions.reduce((a, s) => a + (s.kcal || 0), 0);
    const mCount = monthSessions.length;

    const fKcal = goals.kcal ? mKcal / goals.kcal : 0;
    const fDist = goals.distance ? mDist / goals.distance : 0;
    const fSeances = goals.seances ? mCount / goals.seances : 0;

    const last5 = all.slice(-5).reverse();

    container.innerHTML = `
      <div class="rings-card">
        ${ringsSVG([{ color: "var(--red)", value: fKcal }, { color: "var(--green)", value: fDist }, { color: "var(--cyan)", value: fSeances }])}
        <div class="rings-legend">
          <div class="legend-row"><span class="legend-dot" style="background:var(--red)"></span><b>${Math.round(mKcal)}</b><span class="lbl">/ ${goals.kcal} kcal</span></div>
          <div class="legend-row"><span class="legend-dot" style="background:var(--green)"></span><b>${formatKmShort(mDist)}</b><span class="lbl">/ ${goals.distance} km</span></div>
          <div class="legend-row"><span class="legend-dot" style="background:var(--cyan)"></span><b>${mCount}</b><span class="lbl">/ ${goals.seances} séances</span></div>
        </div>
      </div>

      <div class="stat-grid" style="margin-top:14px;">
        <div class="stat-tile accent-green"><span class="val">${formatKmShort(ctx.totalDistance)} km</span><span class="lbl">Distance totale</span></div>
        <div class="stat-tile accent-red"><span class="val">${Math.round(ctx.totalKcal).toLocaleString("fr-FR")}</span><span class="lbl">Kcal cumulées</span></div>
        <div class="stat-tile accent-cyan"><span class="val">${ctx.count}</span><span class="lbl">Séances au total</span></div>
        <div class="stat-tile accent-gold"><span class="val">${ctx.streakWeeks}</span><span class="lbl">Meilleure série (sem.)</span></div>
      </div>

      <h2 class="section-title">Dernières séances</h2>
      <div class="card" style="padding: 6px 18px;">
        ${last5.map(sessionRowHTML).join("")}
      </div>

      <div class="card tip-card">
        <p class="card-title">💡 Le conseil du jour</p>
        <p style="font-size:13.5px; line-height:1.5; margin:0;">${escapeHtml(tipOfTheDay())}</p>
      </div>
    `;
    $$(".session-item", container).forEach((el) => (el.onclick = () => openSessionModal(el.dataset.id)));
  }

  function sessionRowHTML(s) {
    const d = dateFromISO(s.date);
    return `
      <div class="session-item" data-id="${s.id}">
        <div class="session-date"><div class="d">${d.getDate()}</div><div class="m">${MOIS_ABBR[d.getMonth()]}</div></div>
        <div class="session-mid">
          <div class="lieu">${escapeHtml(s.lieu || "Sans lieu")}</div>
          <div class="sub">${s.meteo ? escapeHtml(s.meteo) + " · " : ""}${s.rythmeMoyen ? formatPace(s.rythmeMoyen) + "/km" : "—"}</div>
        </div>
        <div class="session-end">
          <div class="km">${s.distance != null ? formatKmShort(s.distance) + " km" : "—"}</div>
          <div class="kcal">${s.kcal != null ? s.kcal + " kcal" : ""}</div>
        </div>
      </div>`;
  }

  /* ============================ RENDU : TROPHÉES ============================ */
  let activeTrophyCat = "Toutes";
  function renderTrophees() {
    const all = sortedSessions();
    const ctx = buildContext(all);
    const evaluated = window.TrophyEngine.evaluateAll(ctx);
    const unlockedCount = evaluated.filter((t) => t.unlocked).length;

    const cats = ["Toutes", ...Object.values(window.TrophyEngine.categories)];
    const container = $("#trophees-content");

    const filtered = activeTrophyCat === "Toutes" ? evaluated : evaluated.filter((t) => t.cat === activeTrophyCat);
    // Débloqués d'abord pour la satisfaction immédiate, puis triés par progression.
    filtered.sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      const pa = a.progress ? (a.progress.current || 0) / (a.progress.target || 1) : 0;
      const pb = b.progress ? (b.progress.current || 0) / (b.progress.target || 1) : 0;
      return pb - pa;
    });

    container.innerHTML = `
      <div class="trophy-summary">
        <svg class="trophy-ring" viewBox="0 0 78 78">
          <circle cx="39" cy="39" r="32" fill="none" stroke="var(--bg-elevated-3)" stroke-width="9"/>
          <circle cx="39" cy="39" r="32" fill="none" stroke="var(--gold)" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${2 * Math.PI * 32}" stroke-dashoffset="${2 * Math.PI * 32 * (1 - unlockedCount / 150)}"
            transform="rotate(-90 39 39)"/>
        </svg>
        <div class="trophy-summary-text"><b>${unlockedCount} / 150</b><br><span class="lbl">trophées débloqués</span></div>
      </div>
      <div class="cat-filter" id="cat-filter">
        ${cats.map((c) => `<div class="cat-chip ${c === activeTrophyCat ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</div>`).join("")}
      </div>
      <div class="trophy-grid">
        ${filtered.map(trophyCellHTML).join("")}
      </div>
    `;
    $$(".cat-chip", container).forEach((el) => (el.onclick = () => { activeTrophyCat = el.dataset.cat; renderTrophees(); }));
    $$(".trophy-cell", container).forEach((el) => (el.onclick = () => openTrophyDetail(el.dataset.id, evaluated)));
  }
  function trophyCellHTML(t) {
    let barHTML = "";
    if (!t.unlocked && t.progress && t.progress.target) {
      const pct = clamp(((t.progress.current || 0) / t.progress.target) * 100, 0, 100);
      barHTML = `<div class="bar"><i style="width:${pct}%"></i></div>`;
    }
    return `<div class="trophy-cell ${t.unlocked ? "unlocked" : ""}" data-id="${t.id}">
      <span class="emoji">${t.emoji}</span>
      <div class="nom">${escapeHtml(t.nom)}</div>
      ${barHTML}
    </div>`;
  }
  function openTrophyDetail(id, evaluated) {
    const t = evaluated.find((x) => x.id === id);
    if (!t) return;
    let progressHTML = "";
    if (!t.unlocked && t.progress) {
      if (t.progress.raw !== undefined) {
        progressHTML = `<p style="color:var(--text-secondary); font-size:13px;">Votre record actuel : <b style="color:var(--text)">${t.progress.raw > 0 ? formatPace(t.progress.raw) + "/km" : "—"}</b> · objectif : ${formatPace(t.progress.seuil)}/km</p>`;
      } else {
        const pct = clamp(((t.progress.current || 0) / t.progress.target) * 100, 0, 100);
        progressHTML = `<div class="bar" style="height:6px; margin:14px 0 6px;"><i style="width:${pct}%"></i></div>
          <p style="color:var(--text-secondary); font-size:13px;">${Math.min(t.progress.current, t.progress.target)} / ${t.progress.target}</p>`;
      }
    }
    $("#trophy-detail").innerHTML = `
      <div style="font-size:56px; margin-bottom:10px; ${t.unlocked ? "" : "filter:grayscale(1) opacity(.4);"}">${t.emoji}</div>
      <h2 style="margin:0 0 6px; font-size:20px;">${escapeHtml(t.nom)}</h2>
      <p style="color:var(--text-secondary); font-size:11.5px; text-transform:uppercase; letter-spacing:.05em; font-weight:700; margin:0 0 14px;">${escapeHtml(t.cat)}</p>
      <p style="font-size:14.5px; line-height:1.5;">${escapeHtml(t.desc)}</p>
      ${t.unlocked ? `<p style="color:var(--gold); font-weight:700; margin-top:10px;">🏆 Débloqué</p>` : progressHTML}
    `;
    openModal("modal-trophy");
  }
  function checkNewlyUnlocked(evaluated) {
    const seen = new Set(Store.getSeenTrophies());
    const nowUnlocked = evaluated.filter((t) => t.unlocked).map((t) => t.id);
    const fresh = nowUnlocked.filter((id) => !seen.has(id));
    if (fresh.length && seen.size > 0) {
      // n'affiche pas de toast au tout premier calcul (import initial, etc.) pour éviter le spam
      fresh.slice(0, 3).forEach((id, i) => {
        const t = evaluated.find((x) => x.id === id);
        setTimeout(() => toast(`Trophée débloqué : ${t.nom}`, t.emoji), i * 600);
      });
      if (fresh.length > 3) setTimeout(() => toast(`+ ${fresh.length - 3} autres trophées débloqués !`, "🎉"), 3 * 600);
    }
    Store.setSeenTrophies(nowUnlocked);
  }

  /* ============================ RENDU : STATS ============================ */
  function groupByMonth(all, n) {
    const map = new Map();
    all.forEach((s) => {
      const k = monthKey(s.date);
      if (!map.has(k)) map.set(k, { key: k, count: 0, distance: 0, kcal: 0, duree: 0 });
      const g = map.get(k);
      g.count++; g.distance += s.distance || 0; g.kcal += s.kcal || 0; g.duree += s.duree || 0;
    });
    const arr = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    return arr.slice(-n);
  }
  function groupByWeek(all, n) {
    const map = new Map();
    all.forEach((s) => {
      const k = mondayOf(s.date);
      if (!map.has(k)) map.set(k, { key: k, count: 0, distance: 0, kcal: 0, duree: 0 });
      const g = map.get(k);
      g.count++; g.distance += s.distance || 0; g.kcal += s.kcal || 0; g.duree += s.duree || 0;
    });
    const arr = Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
    return arr.slice(-n);
  }
  function groupByYear(all) {
    const map = new Map();
    all.forEach((s) => {
      const k = s.date.slice(0, 4);
      if (!map.has(k)) map.set(k, { key: k, count: 0, distance: 0, kcal: 0, duree: 0 });
      const g = map.get(k);
      g.count++; g.distance += s.distance || 0; g.kcal += s.kcal || 0; g.duree += s.duree || 0;
    });
    return Array.from(map.values()).sort((a, b) => (a.key < b.key ? -1 : 1));
  }
  function miniBars(data, valueKey, labelFn, colorVar) {
    const max = Math.max(1, ...data.map((d) => d[valueKey]));
    return `<div class="bars">${data.map((d) => `
      <div class="bar-col">
        <div class="bar-shape" style="height:${clamp((d[valueKey] / max) * 100, 3, 100)}%; background:${colorVar}"></div>
        <div class="bar-lbl">${labelFn(d)}</div>
      </div>`).join("")}</div>`;
  }

  function renderStats() {
    const all = sortedSessions();
    const container = $("#stats-content");
    if (!all.length) { container.innerHTML = emptyStateHTML(); bindEmptyCTAs(container); return; }

    const ctx = buildContext(all);
    const months = groupByMonth(all, 6);
    const weeks = groupByWeek(all, 8);
    const years = groupByYear(all);

    // faits amusants
    const lieuFav = [...ctx.lieuCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const dowCounts = new Array(7).fill(0);
    all.forEach((s) => dowCounts[dateFromISO(s.date).getDay()]++);
    const dowFavIdx = dowCounts.indexOf(Math.max(...dowCounts));
    const meteoCounts = {};
    all.forEach((s) => { if (s.meteo) meteoCounts[s.meteo] = (meteoCounts[s.meteo] || 0) + 1; });
    const meteoFav = Object.entries(meteoCounts).sort((a, b) => b[1] - a[1])[0];
    const avgKcal = ctx.count ? ctx.totalKcal / ctx.count : 0;
    const avgDist = ctx.count ? ctx.totalDistance / ctx.count : 0;
    const terrainsFoot = ctx.totalDistance * 1000 / 105; // longueur d'un terrain de foot
    const filmsEquiv = ctx.totalDureeMin / 120;

    container.innerHTML = `
      <h3 class="section-title first">Vue d'ensemble</h3>
      <div class="stat-grid">
        <div class="stat-tile accent-green"><span class="val">${formatKmShort(avgDist)} km</span><span class="lbl">Distance moy. / séance</span></div>
        <div class="stat-tile accent-red"><span class="val">${Math.round(avgKcal)}</span><span class="lbl">Kcal moy. / séance</span></div>
        <div class="stat-tile accent-cyan"><span class="val">${formatDuree(ctx.totalDureeMin)}</span><span class="lbl">Temps cumulé</span></div>
        <div class="stat-tile accent-gold"><span class="val">${ctx.streakMonths}</span><span class="lbl">Meilleure série (mois)</span></div>
      </div>

      <h3 class="section-title">Par semaine <span style="color:var(--text-tertiary); font-weight:500; font-size:13px;">(8 dernières)</span></h3>
      <div class="card">
        <p class="card-title">Distance (km)</p>
        <div class="chart-wrap">${miniBars(weeks, "distance", (d) => formatDateShort(d.key).split(" ")[0], "var(--green)")}</div>
      </div>

      <h3 class="section-title">Par mois <span style="color:var(--text-tertiary); font-weight:500; font-size:13px;">(6 derniers)</span></h3>
      <div class="card">
        <p class="card-title">Séances</p>
        <div class="chart-wrap">${miniBars(months, "count", (d) => MOIS_ABBR[+d.key.slice(5, 7) - 1], "var(--cyan)")}</div>
      </div>
      <div class="card">
        <p class="card-title">Kilocalories</p>
        <div class="chart-wrap">${miniBars(months, "kcal", (d) => MOIS_ABBR[+d.key.slice(5, 7) - 1], "var(--red)")}</div>
      </div>

      ${years.length > 1 ? `
      <h3 class="section-title">Par année</h3>
      <div class="card">
        ${years.map((y) => `
          <div class="record-row">
            <div class="record-badge" style="background:var(--bg-elevated-2)">📅</div>
            <div class="record-info"><div class="title">${y.key}</div><div class="meta">${y.count} séances · ${formatKmShort(y.distance)} km</div></div>
            <div class="record-value">${Math.round(y.kcal).toLocaleString("fr-FR")} kcal</div>
          </div>`).join("")}
      </div>` : ""}

      <h3 class="section-title">Anecdotes & curiosités</h3>
      <div class="card">
        ${lieuFav ? factRow("📍", `Votre lieu favori est <b>${escapeHtml(lieuFav[0])}</b>, visité ${lieuFav[1]} fois.`) : ""}
        ${factRow("🗓️", `Vous marchez le plus souvent le <b>${JOURS_LABEL[dowFavIdx]}</b> (${dowCounts[dowFavIdx]} séances).`)}
        ${meteoFav ? factRow("🌤️", `Météo la plus fréquente : <b>${escapeHtml(meteoFav[0])}</b>.`) : ""}
        ${factRow("⚽", `Bout à bout, vos séances équivalent à <b>${Math.round(terrainsFoot)} terrains de football</b> parcourus.`)}
        ${factRow("🎬", `Vous avez cumulé l'équivalent de <b>${filmsEquiv.toFixed(1)} films de 2h</b> à marcher.`)}
        ${factRow("🔥", `Meilleur écart d'intensité entre intervalles : <b>${ctx.bestEcartIntervalles ? ctx.bestEcartIntervalles + "s/km" : "—"}</b> entre le plus rapide et le plus lent.`)}
      </div>
    `;
  }
  function factRow(emoji, html) {
    return `<div class="fact-row"><span class="emoji">${emoji}</span><span class="txt">${html}</span></div>`;
  }
  function emptyStateHTML() {
    return `<div class="card empty-state">
      <span class="emoji">📊</span>
      <h3>Pas encore de données</h3>
      <p>Ajoutez ou importez des séances pour voir apparaître vos statistiques.</p>
      <div class="btn-row">
        <button class="btn btn-secondary" id="cta-import2">Importer</button>
        <button class="btn btn-primary" id="cta-add2">Ajouter une séance</button>
      </div>
    </div>`;
  }
  function bindEmptyCTAs(container) {
    const a = $("#cta-add2", container), i = $("#cta-import2", container);
    if (a) a.onclick = () => openSessionModal();
    if (i) i.onclick = () => openSettingsModal();
  }

  /* ============================ RENDU : LIEUX ============================ */
  function renderLieux() {
    const all = sortedSessions();
    const container = $("#lieux-content");
    if (!all.length) { container.innerHTML = emptyStateHTML(); bindEmptyCTAs(container); return; }

    const map = new Map();
    all.forEach((s) => {
      const key = s.lieu || "Lieu non précisé";
      if (!map.has(key)) map.set(key, { nom: key, count: 0, distance: 0, kcal: 0, bestRapide: Infinity, meteos: {} });
      const g = map.get(key);
      g.count++; g.distance += s.distance || 0; g.kcal += s.kcal || 0;
      if (s.rythmeRapide) g.bestRapide = Math.min(g.bestRapide, s.rythmeRapide);
      if (s.meteo) g.meteos[s.meteo] = (g.meteos[s.meteo] || 0) + 1;
    });
    const lieux = Array.from(map.values()).sort((a, b) => b.count - a.count);

    container.innerHTML = `
      <div class="card">
        <p class="card-title">${lieux.length} lieu${lieux.length > 1 ? "x" : ""} exploré${lieux.length > 1 ? "s" : ""}</p>
        ${lieux.map((l) => `
          <div class="lieu-card" style="padding:12px 0; border-bottom:1px solid var(--separator);">
            <div class="lieu-pin">📍</div>
            <div class="lieu-info">
              <div class="nom">${escapeHtml(l.nom)}</div>
              <div class="meta">${l.count} séance${l.count > 1 ? "s" : ""} · ${formatKmShort(l.distance)} km · ${Math.round(l.kcal).toLocaleString("fr-FR")} kcal
                ${isFinite(l.bestRapide) ? " · meilleur intervalle " + formatPace(l.bestRapide) + "/km" : ""}</div>
            </div>
          </div>`).join("")}
      </div>
    `;
    $$(".lieu-card", container).forEach((el, i) => (el.style.cursor = "default"));
    $$(".lieu-card:last-child", container).forEach((el) => (el.style.borderBottom = "none"));
  }

  /* ============================ RENDU : PROGRÈS ============================ */
  function renderProgres() {
    const all = sortedSessions();
    const container = $("#progres-content");
    if (!all.length) { container.innerHTML = emptyStateHTML(); bindEmptyCTAs(container); return; }

    const { bestDist, bestKcal, bestRapide, bestMoyen } = getRecordSessions(all);
    const ctx = buildContext(all);

    const last10 = all.slice(-10);
    const paceData = last10.filter((s) => s.rythmeMoyen).map((s) => ({ key: s.date, distance: 1000 - s.rythmeMoyen })); // inversé pour affichage "plus haut = plus rapide"

    container.innerHTML = `
      <h3 class="section-title first">Vos records</h3>
      <div class="card">
        ${recordRow("⚡", "Meilleur intervalle rapide", bestRapide, bestRapide ? formatPace(bestRapide.rythmeRapide) + "/km" : "—")}
        ${recordRow("🗺️", "Plus grande distance", bestDist, bestDist ? formatKmShort(bestDist.distance) + " km" : "—")}
        ${recordRow("🔥", "Plus de kilocalories", bestKcal, bestKcal ? Math.round(bestKcal.kcal) + " kcal" : "—")}
        ${recordRow("⏱️", "Meilleur rythme moyen", bestMoyen, bestMoyen ? formatPace(bestMoyen.rythmeMoyen) + "/km" : "—")}
      </div>

      <h3 class="section-title">Séries en cours</h3>
      <div class="stat-grid">
        <div class="stat-tile accent-gold"><span class="val">${ctx.streakWeeks}</span><span class="lbl">Semaines consécutives (record)</span></div>
        <div class="stat-tile accent-gold"><span class="val">${ctx.streakMonths}</span><span class="lbl">Mois consécutifs (record)</span></div>
      </div>

      <h3 class="section-title">Évolution du rythme moyen <span style="color:var(--text-tertiary); font-weight:500; font-size:13px;">(10 dernières séances)</span></h3>
      <div class="card">
        <p class="card-title">Plus la barre est haute, plus l'allure était rapide</p>
        <div class="chart-wrap">${miniBars(paceData, "distance", (d) => formatDateShort(d.key).split(" ")[0], "var(--cyan)")}</div>
      </div>

      <h3 class="section-title">Progression</h3>
      <div class="card">
        ${factRow("📈", `Vous avez battu votre record de distance <b>${ctx.nbRecordsDistance}</b> fois depuis le début.`)}
        ${factRow("🔥", `Vous avez battu votre record de kilocalories <b>${ctx.nbRecordsKcal}</b> fois.`)}
        ${factRow("⚡", `Vous avez battu votre record d'intervalle rapide <b>${ctx.nbRecordsRythmeRapide}</b> fois.`)}
        ${factRow("🔁", `Rythme moyen amélioré <b>${ctx.streakRythmeAmeliore}</b> séance${ctx.streakRythmeAmeliore > 1 ? "s" : ""} de suite (série en cours).`)}
      </div>
    `;
  }
  function recordRow(emoji, title, s, valueStr) {
    return `<div class="record-row">
      <div class="record-badge" style="background:var(--bg-elevated-2)">${emoji}</div>
      <div class="record-info"><div class="title">${title}</div><div class="meta">${s ? contextLine(s) : "Pas encore de donnée"}</div></div>
      <div class="record-value">${valueStr}</div>
    </div>`;
  }

  /* ============================ MODALES : SÉANCE ============================ */
  function openModal(id) { $("#" + id).classList.remove("hidden"); }
  function closeModal(id) { $("#" + id).classList.add("hidden"); }

  function openSessionModal(id) {
    const form = $("#form-session");
    form.reset();
    $("#btn-delete-session").classList.toggle("hidden", !id);
    if (id) {
      const s = Store.getSessions().find((x) => x.id === id);
      if (!s) return;
      $("#session-modal-title").textContent = "Modifier la séance";
      $("#f-id").value = s.id;
      $("#f-date").value = s.date || "";
      $("#f-lieu").value = s.lieu || "";
      $("#f-distance").value = s.distance != null ? String(s.distance).replace(".", ",") : "";
      $("#f-meteo").value = s.meteo || "";
      $("#f-duree").value = s.duree != null ? String(s.duree) : "";
      $("#f-fc").value = s.fc != null ? s.fc : "";
      $("#f-rythme-moyen").value = s.rythmeMoyen != null ? formatPace(s.rythmeMoyen).replace('"', "") : "";
      $("#f-kcal").value = s.kcal != null ? s.kcal : "";
      $("#f-rythme-rapide").value = s.rythmeRapide != null ? formatPace(s.rythmeRapide).replace('"', "") : "";
      $("#f-rythme-lent").value = s.rythmeLent != null ? formatPace(s.rythmeLent).replace('"', "") : "";
      $("#f-commentaire").value = s.commentaire || "";
    } else {
      $("#session-modal-title").textContent = "Nouvelle séance";
      $("#f-id").value = "";
      $("#f-date").value = todayISO();
    }
    openModal("modal-session");
  }

  $("#form-session").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = {
      id: $("#f-id").value || null,
      date: $("#f-date").value,
      lieu: $("#f-lieu").value.trim(),
      distance: parseFRNumber($("#f-distance").value),
      meteo: $("#f-meteo").value.trim(),
      duree: parseDuree($("#f-duree").value),
      fc: parseFRNumber($("#f-fc").value),
      rythmeMoyen: parsePace($("#f-rythme-moyen").value),
      kcal: parseFRNumber($("#f-kcal").value),
      rythmeRapide: parsePace($("#f-rythme-rapide").value),
      rythmeLent: parsePace($("#f-rythme-lent").value),
      commentaire: $("#f-commentaire").value.trim(),
    };
    if (!data.date || !data.lieu) { toast("Date et lieu sont requis", "⚠️"); return; }
    saveSession(data);
    closeModal("modal-session");
    toast("Séance enregistrée", "✅");
  });
  $("#btn-delete-session").addEventListener("click", () => {
    const id = $("#f-id").value;
    if (id && confirm("Supprimer définitivement cette séance ?")) {
      deleteSession(id);
      closeModal("modal-session");
      toast("Séance supprimée", "🗑️");
    }
  });

  /* ============================ MODALE : RÉGLAGES / IMPORT / EXPORT ============================ */
  let pendingImportText = "";
  function openSettingsModal() {
    const g = Store.getGoals();
    $("#g-seances").value = g.seances;
    $("#g-distance").value = g.distance;
    $("#g-kcal").value = g.kcal;
    $("#import-preview").innerHTML = "";
    $("#import-file").value = "";
    $("#import-url").value = "";
    $("#import-paste").value = "";
    pendingImportText = "";
    openModal("modal-settings");
  }
  $("#btn-settings").addEventListener("click", openSettingsModal);
  $("#btn-save-goals").addEventListener("click", () => {
    const g = {
      seances: parseFRNumber($("#g-seances").value) || DEFAULT_GOALS.seances,
      distance: parseFRNumber($("#g-distance").value) || DEFAULT_GOALS.distance,
      kcal: parseFRNumber($("#g-kcal").value) || DEFAULT_GOALS.kcal,
    };
    Store.setGoals(g);
    toast("Objectifs mis à jour", "🎯");
    renderCurrentView();
  });

  function updateImportPreview(text) {
    pendingImportText = text;
    if (!text || !text.trim()) { $("#import-preview").innerHTML = ""; return; }
    try {
      const rows = parseCSVText(text);
      const { sessions, recognized } = rowsToSessions(rows);
      const cols = Object.keys(recognized);
      $("#import-preview").innerHTML = `
        <div class="card" style="margin-top:4px;">
          <p class="card-title">Aperçu</p>
          <p style="font-size:13px; color:var(--text-secondary); margin:0 0 6px;">${sessions.length} séance(s) détectée(s) · colonnes reconnues : ${cols.length ? escapeHtml(cols.join(", ")) : "aucune"}</p>
          ${sessions.slice(0, 2).map((s) => `<div class="fact-row"><span class="emoji">🚶</span><span class="txt">${escapeHtml(s.date)} — ${escapeHtml(s.lieu)} — ${s.distance != null ? s.distance + " km" : "?"}</span></div>`).join("")}
        </div>`;
    } catch (e) {
      $("#import-preview").innerHTML = `<p style="color:var(--red); font-size:13px;">Impossible de lire ce contenu (${escapeHtml(e.message)}).</p>`;
    }
  }
  $("#import-file").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateImportPreview(String(reader.result));
    reader.readAsText(file, "UTF-8");
  });
  $("#import-paste").addEventListener("input", (e) => updateImportPreview(e.target.value));
  $("#btn-import-url").addEventListener("click", async () => {
    const url = $("#import-url").value.trim();
    if (!url) { toast("Collez un lien CSV publié", "⚠️"); return; }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      $("#import-paste").value = "";
      updateImportPreview(text);
      toast("Contenu chargé, vérifiez l'aperçu", "✅");
    } catch (e) {
      toast("Échec du chargement (CORS ou lien invalide) — téléchargez le CSV et importez le fichier", "⚠️");
    }
  });
  $("#btn-import-run").addEventListener("click", () => {
    if (!pendingImportText.trim()) { toast("Aucun contenu à importer", "⚠️"); return; }
    try {
      const rows = parseCSVText(pendingImportText);
      const { sessions } = rowsToSessions(rows);
      if (!sessions.length) { toast("Aucune séance valide détectée", "⚠️"); return; }
      const added = importSessions(sessions);
      toast(`${added} séance(s) importée(s)`, "📥");
      closeModal("modal-settings");
    } catch (e) {
      toast("Erreur pendant l'import", "⚠️");
    }
  });
  $("#btn-export-csv").addEventListener("click", () => {
    const all = sortedSessions();
    if (!all.length) { toast("Rien à exporter", "⚠️"); return; }
    downloadFile(`marche-japonaise-${todayISO()}.csv`, sessionsToCSV(all), "text/csv;charset=utf-8");
  });
  $("#btn-export-json").addEventListener("click", () => {
    const payload = { sessions: Store.getSessions(), goals: Store.getGoals(), exportedAt: new Date().toISOString() };
    downloadFile(`marche-japonaise-sauvegarde-${todayISO()}.json`, JSON.stringify(payload, null, 2), "application/json");
  });
  $("#btn-wipe").addEventListener("click", () => {
    if (confirm("Toutes vos séances seront définitivement supprimées de cet appareil. Continuer ?")) {
      Store.setSessions([]);
      Store.setSeenTrophies([]);
      onDataChanged();
      closeModal("modal-settings");
      toast("Données effacées", "🗑️");
    }
  });

  /* ============================ NAVIGATION ============================ */
  const HEADER_EYEBROW = {
    accueil: "Aujourd'hui",
    trophees: "Collection",
    stats: "Analyse",
    lieux: "Exploration",
    progres: "Records personnels",
  };
  function switchView(view) {
    $$(".view").forEach((v) => v.classList.remove("active"));
    $("#view-" + view).classList.add("active");
    $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
    $("#header-eyebrow").textContent = HEADER_EYEBROW[view] || "";
    currentView = view;
    renderCurrentView();
  }
  let currentView = "accueil";
  function renderCurrentView() {
    if (currentView === "accueil") renderAccueil();
    else if (currentView === "trophees") renderTrophees();
    else if (currentView === "stats") renderStats();
    else if (currentView === "lieux") renderLieux();
    else if (currentView === "progres") renderProgres();
  }
  function onDataChanged() {
    checkTrophiesAndNotify();
    renderCurrentView();
  }
  function checkTrophiesAndNotify() {
    const ctx = buildContext(sortedSessions());
    const evaluated = window.TrophyEngine.evaluateAll(ctx);
    checkNewlyUnlocked(evaluated);
  }

  $$(".nav-btn").forEach((btn) => (btn.onclick = () => switchView(btn.dataset.view)));
  $("#btn-add-fab").onclick = () => openSessionModal();
  $$("[data-close]").forEach((el) => (el.onclick = () => closeModal(el.dataset.close)));
  $$(".modal-overlay").forEach((ov) => (ov.onclick = (e) => { if (e.target === ov) ov.classList.add("hidden"); }));

  /* ============================ INIT ============================ */
  // Initialise la liste des trophées déjà vus au 1er lancement pour éviter un déluge de toasts.
  (function initSeenTrophies() {
    if (localStorage.getItem(LS_SEEN_TROPHIES) == null) {
      const ctx = buildContext(sortedSessions());
      const evaluated = window.TrophyEngine.evaluateAll(ctx);
      Store.setSeenTrophies(evaluated.filter((t) => t.unlocked).map((t) => t.id));
    }
  })();

  switchView("accueil");
})();
