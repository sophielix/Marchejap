/* ==========================================================================
   Marche Japonaise — Moteur de trophées (150 trophées)
   Chaque trophée est pensé pour le format réel de la marche japonaise :
   séances de 30 minutes, alternance 3 min rapide / 3 min normale.
   Pas de trophées "vitesse de pointe façon course" ni "ultra longue distance"
   hors de propos : tout est calé sur les données réellement enregistrées.
   ========================================================================== */

(function (global) {
  "use strict";

  const CAT = {
    REGULARITE: "Régularité",
    SERIES: "Séries",
    DISTANCE: "Distance",
    RYTHME: "Rythme",
    INTERVALLES: "Intervalles",
    ENERGIE: "Énergie",
    CŒUR: "Fréquence cardiaque",
    LIEUX: "Lieux",
    METEO: "Météo",
    CALENDRIER: "Calendrier",
    SAISONS: "Saisons",
    ANCIENNETE: "Ancienneté",
    JALONS: "Jalons",
    JOURNAL: "Journal",
    PROGRESSION: "Progression",
    DUREE: "Temps passé",
    ASSIDUITE_MOIS: "Assiduité mensuelle",
    FUN: "Clins d'œil",
  };

  const T = []; // liste finale des trophées
  let _id = 0;
  const id = (slug) => `${String(++_id).padStart(3, "0")}-${slug}`;

  function add(trophy) {
    T.push(trophy);
  }

  function addTier(opts) {
    // opts: {slugBase, cat, emoji, thresholds:[], nameFn, descFn, valueFn, progressTarget}
    opts.thresholds.forEach((seuil, i) => {
      add({
        id: id(`${opts.slugBase}-${seuil}`),
        cat: opts.cat,
        emoji: opts.emoji,
        nom: opts.nameFn(seuil, i),
        desc: opts.descFn(seuil, i),
        check: (ctx) => opts.valueFn(ctx) >= seuil,
        progress: (ctx) => ({ current: opts.valueFn(ctx), target: seuil }),
      });
    });
  }

  /* -------------------------------------------------------------------- */
  /* 1) RÉGULARITÉ — nombre total de séances                              */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "seances",
    cat: CAT.REGULARITE,
    emoji: "🚶",
    thresholds: [1, 3, 5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200],
    nameFn: (n) => (n === 1 ? "Premier pas" : `${n} séances`),
    descFn: (n) =>
      n === 1
        ? "Réaliser votre toute première séance de marche japonaise."
        : `Réaliser un total de ${n} séances de marche japonaise.`,
    valueFn: (ctx) => ctx.count,
  });

  /* -------------------------------------------------------------------- */
  /* 2) SÉRIES — semaines et mois consécutifs avec au moins une séance    */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "semaines-consecutives",
    cat: CAT.SERIES,
    emoji: "🔥",
    thresholds: [2, 4, 8, 12, 26, 52],
    nameFn: (n) => `${n} semaines de suite`,
    descFn: (n) => `Marcher au moins une fois par semaine, ${n} semaines consécutives.`,
    valueFn: (ctx) => ctx.streakWeeks,
  });
  addTier({
    slugBase: "mois-consecutifs",
    cat: CAT.SERIES,
    emoji: "📆",
    thresholds: [2, 3, 6, 9, 12],
    nameFn: (n) => `${n} mois de suite`,
    descFn: (n) => `Marcher au moins une fois par mois, ${n} mois consécutifs.`,
    valueFn: (ctx) => ctx.streakMonths,
  });

  /* -------------------------------------------------------------------- */
  /* 3) DISTANCE — cumul total et record en une séance                   */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "distance-cumulee",
    cat: CAT.DISTANCE,
    emoji: "🗺️",
    thresholds: [5, 10, 25, 50, 75, 100, 150, 200, 300, 500],
    nameFn: (n) => `${n} km au compteur`,
    descFn: (n) => `Cumuler ${n} km parcourus, toutes séances confondues.`,
    valueFn: (ctx) => ctx.totalDistance,
  });
  addTier({
    slugBase: "distance-record",
    cat: CAT.DISTANCE,
    emoji: "🏅",
    thresholds: [2, 3, 4, 5, 6, 8],
    nameFn: (n) => `${n} km en une séance`,
    descFn: (n) => `Parcourir ${n} km au cours d'une seule séance de 30 minutes.`,
    valueFn: (ctx) => ctx.bestDistance,
  });

  /* -------------------------------------------------------------------- */
  /* 4) RYTHME MOYEN — meilleure allure moyenne toutes séances            */
  /* -------------------------------------------------------------------- */
  function addPaceTier(opts) {
    // Pour un rythme (secondes/km), plus petit = meilleur : on ne peut pas
    // réutiliser addTier (qui suppose "plus grand = mieux"), donc logique dédiée.
    opts.thresholds.forEach((seuil) => {
      add({
        id: id(`${opts.slugBase}-${seuil}`),
        cat: opts.cat,
        emoji: opts.emoji,
        nom: opts.nameFn(seuil),
        desc: opts.descFn(seuil),
        check: (ctx) => opts.valueFn(ctx) > 0 && opts.valueFn(ctx) <= seuil,
        progress: (ctx) => {
          const v = opts.valueFn(ctx);
          // progress bar : on affiche l'écart restant jusqu'au seuil (en secondes, borné à 0)
          return { current: v > 0 ? Math.max(0, seuil - v + seuil) : 0, target: seuil * 2, raw: v, seuil };
        },
      });
    });
  }
  addPaceTier({
    slugBase: "rythme-moyen",
    cat: CAT.RYTHME,
    emoji: "⏱️",
    thresholds: [480, 450, 420, 390, 360, 330], // secondes/km — plus petit = plus rapide
    nameFn: (s) => `Allure moyenne sous ${fmtPace(s)}`,
    descFn: (s) => `Terminer une séance avec un rythme moyen plus rapide que ${fmtPace(s)}.`,
    valueFn: (ctx) => ctx.bestRythmeMoyenSec || 0,
  });

  /* -------------------------------------------------------------------- */
  /* 5) INTERVALLES — meilleur intervalle rapide + écart rapide/lent      */
  /* -------------------------------------------------------------------- */
  addPaceTier({
    slugBase: "intervalle-rapide",
    cat: CAT.INTERVALLES,
    emoji: "⚡",
    thresholds: [360, 330, 300, 270, 240],
    nameFn: (s) => `Intervalle rapide sous ${fmtPace(s)}`,
    descFn: (s) => `Boucler un intervalle "marche rapide" (3 min) à moins de ${fmtPace(s)}.`,
    valueFn: (ctx) => ctx.bestRythmeRapideSec || 0,
  });
  addTier({
    slugBase: "ecart-intervalles",
    cat: CAT.INTERVALLES,
    emoji: "🎢",
    thresholds: [20, 40, 60, 90, 120],
    nameFn: (s) => `Écart d'allure de ${s}s`,
    descFn: (s) =>
      `Creuser un écart d'au moins ${s} secondes/km entre votre intervalle rapide et votre intervalle normal — la vraie signature de la marche japonaise.`,
    valueFn: (ctx) => ctx.bestEcartIntervalles,
  });

  /* -------------------------------------------------------------------- */
  /* 6) ÉNERGIE — kilocalories cumulées et record en une séance           */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "kcal-cumulees",
    cat: CAT.ENERGIE,
    emoji: "🔋",
    thresholds: [500, 1000, 2500, 5000, 7500, 10000, 15000, 20000],
    nameFn: (n) => `${n.toLocaleString("fr-FR")} kcal cumulées`,
    descFn: (n) => `Brûler un total de ${n.toLocaleString("fr-FR")} kilocalories sur l'ensemble de vos séances.`,
    valueFn: (ctx) => ctx.totalKcal,
  });
  addTier({
    slugBase: "kcal-record",
    cat: CAT.ENERGIE,
    emoji: "💥",
    thresholds: [150, 200, 250, 300, 350, 400],
    nameFn: (n) => `${n} kcal en une séance`,
    descFn: (n) => `Brûler ${n} kcal au cours d'une seule séance de 30 minutes.`,
    valueFn: (ctx) => ctx.bestKcal,
  });

  /* -------------------------------------------------------------------- */
  /* 7) FRÉQUENCE CARDIAQUE — zones atteintes                             */
  /* -------------------------------------------------------------------- */
  [
    { seuil: 100, nom: "Échauffement tranquille", desc: "Enregistrer une FC moyenne inférieure à 100 bpm.", cmp: "lt" },
    { seuil: 120, nom: "Zone confort", desc: "Enregistrer une FC moyenne entre 100 et 120 bpm.", cmp: "range100" },
    { seuil: 140, nom: "Zone active", desc: "Enregistrer une FC moyenne entre 120 et 140 bpm.", cmp: "range120" },
    { seuil: 160, nom: "Zone cardio", desc: "Enregistrer une FC moyenne entre 140 et 160 bpm.", cmp: "range140" },
    { seuil: 999, nom: "Cœur à l'ouvrage", desc: "Enregistrer une FC moyenne supérieure à 160 bpm.", cmp: "gt160" },
  ].forEach((z) => {
    add({
      id: id(`fc-${z.seuil}`),
      cat: CAT.CŒUR,
      emoji: "❤️",
      nom: z.nom,
      desc: z.desc,
      check: (ctx) => ctx.fcZonesAtteintes.has(z.cmp),
    });
  });

  /* -------------------------------------------------------------------- */
  /* 8) LIEUX — diversité et fidélité                                     */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "lieux-differents",
    cat: CAT.LIEUX,
    emoji: "📍",
    thresholds: [2, 3, 5, 7, 10, 15],
    nameFn: (n) => `${n} lieux différents`,
    descFn: (n) => `Marcher dans ${n} lieux différents.`,
    valueFn: (ctx) => ctx.distinctLieux,
  });
  addTier({
    slugBase: "lieu-fidele",
    cat: CAT.LIEUX,
    emoji: "🏠",
    thresholds: [5, 10, 20, 30],
    nameFn: (n) => `${n} séances au même endroit`,
    descFn: (n) => `Revenir ${n} fois marcher dans votre lieu favori.`,
    valueFn: (ctx) => ctx.maxLieuCount,
  });

  /* -------------------------------------------------------------------- */
  /* 9) MÉTÉO — conditions rencontrées                                    */
  /* -------------------------------------------------------------------- */
  const meteoBadges = [
    { key: "pluie", emoji: "🌧️", nom: "Ni pluie ni excuse", desc: "Marcher sous la pluie." },
    { key: "neige", emoji: "❄️", nom: "Flocons et foulées", desc: "Marcher sous la neige." },
    { key: "vent", emoji: "🌬️", nom: "Vent de face", desc: "Marcher par temps venteux." },
    { key: "brouillard", emoji: "🌫️", nom: "Dans le brouillard", desc: "Marcher par temps de brouillard." },
    { key: "orage", emoji: "⛈️", nom: "Brave l'orage", desc: "Marcher avec de l'orage annoncé (en toute sécurité !)." },
    { key: "canicule", emoji: "🥵", nom: "Canicule maîtrisée", desc: "Marcher par forte chaleur." },
    { key: "froid", emoji: "🥶", nom: "Grand froid", desc: "Marcher par temps froid." },
    { key: "soleil", emoji: "☀️", nom: "Chasseur de soleil", desc: "Marcher sous le soleil." },
    { key: "nuageux", emoji: "☁️", nom: "Ciel voilé", desc: "Marcher sous un ciel nuageux." },
  ];
  meteoBadges.forEach((m) => {
    add({
      id: id(`meteo-${m.key}`),
      cat: CAT.METEO,
      emoji: m.emoji,
      nom: m.nom,
      desc: m.desc,
      check: (ctx) => ctx.meteoKeywords.has(m.key),
    });
  });
  addTier({
    slugBase: "meteo-diversite",
    cat: CAT.METEO,
    emoji: "🌈",
    thresholds: [3, 5, 7],
    nameFn: (n) => (n === 9 ? "Toute-terrain, toute météo" : `${n} conditions météo différentes`),
    descFn: (n) => `Avoir marché sous ${n} types de météo différents.`,
    valueFn: (ctx) => ctx.meteoKeywords.size,
  });

  /* -------------------------------------------------------------------- */
  /* 10) CALENDRIER — jours de la semaine et week-ends                    */
  /* -------------------------------------------------------------------- */
  const jours = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  jours.forEach((j, idx) => {
    add({
      id: id(`jour-${j}`),
      cat: CAT.CALENDRIER,
      emoji: "🗓️",
      nom: `Rendez-vous du ${j}`,
      desc: `Faire au moins une séance un ${j}.`,
      check: (ctx) => ctx.weekdaysDone.has(idx),
    });
  });
  add({
    id: id("semaine-complete"),
    cat: CAT.CALENDRIER,
    emoji: "🏆",
    nom: "Semaine complète",
    desc: "Avoir marché au moins une fois chaque jour de la semaine (toutes séances confondues).",
    check: (ctx) => ctx.weekdaysDone.size === 7,
  });
  addTier({
    slugBase: "weekend",
    cat: CAT.CALENDRIER,
    emoji: "🛋️",
    thresholds: [5, 10],
    nameFn: (n) => `${n} séances de week-end`,
    descFn: (n) => `Cumuler ${n} séances un samedi ou un dimanche.`,
    valueFn: (ctx) => ctx.weekendCount,
  });

  /* -------------------------------------------------------------------- */
  /* 11) SAISONS                                                          */
  /* -------------------------------------------------------------------- */
  const saisons = [
    { key: "hiver", emoji: "⛄", nom: "Marcheuse d'hiver" },
    { key: "printemps", emoji: "🌸", nom: "Éclosion de printemps" },
    { key: "ete", emoji: "🌞", nom: "Étés actifs" },
    { key: "automne", emoji: "🍂", nom: "Feuilles d'automne" },
  ];
  saisons.forEach((s) => {
    add({
      id: id(`saison-${s.key}`),
      cat: CAT.SAISONS,
      emoji: s.emoji,
      nom: s.nom,
      desc: `Faire au moins une séance en ${s.key === "ete" ? "été" : s.key}.`,
      check: (ctx) => ctx.seasonsDone.has(s.key),
    });
  });
  add({
    id: id("quatre-saisons"),
    cat: CAT.SAISONS,
    emoji: "🍁",
    nom: "Les quatre saisons",
    desc: "Avoir marché au moins une fois pendant chacune des quatre saisons.",
    check: (ctx) => ctx.seasonsDone.size === 4,
  });

  /* -------------------------------------------------------------------- */
  /* 12) ANCIENNETÉ — depuis la première séance                           */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "anciennete",
    cat: CAT.ANCIENNETE,
    emoji: "🌱",
    thresholds: [30, 90, 182, 365, 548, 730, 1095],
    nameFn: (n) => {
      if (n === 30) return "1 mois de pratique";
      if (n === 90) return "3 mois de pratique";
      if (n === 182) return "6 mois de pratique";
      if (n === 365) return "1 an de pratique";
      if (n === 548) return "18 mois de pratique";
      if (n === 730) return "2 ans de pratique";
      if (n === 1095) return "3 ans de pratique";
      return "5 ans de pratique";
    },
    descFn: (n) => `${n} jours se sont écoulés depuis votre toute première séance.`,
    valueFn: (ctx) => ctx.daysSinceFirst,
  });

  /* -------------------------------------------------------------------- */
  /* 13) JALONS — numéros de séance sympathiques                          */
  /* -------------------------------------------------------------------- */
  [
    { n: 7, nom: "Chiffre porte-bonheur", desc: "Réaliser votre 7ᵉ séance." },
    { n: 42, nom: "La réponse à tout", desc: "Réaliser votre 42ᵉ séance." },
    { n: 50, nom: "Demi-centenaire", desc: "Réaliser votre 50ᵉ séance." },
    { n: 77, nom: "Double chance", desc: "Réaliser votre 77ᵉ séance." },
    { n: 100, nom: "Le grand centenaire", desc: "Réaliser votre 100ᵉ séance." },
    { n: 108, nom: "Nombre porte-bonheur", desc: "Réaliser votre 108ᵉ séance." },
  ].forEach((j) => {
    add({
      id: id(`jalon-${j.n}`),
      cat: CAT.JALONS,
      emoji: "🎯",
      nom: j.nom,
      desc: j.desc,
      check: (ctx) => ctx.count >= j.n,
      progress: (ctx) => ({ current: ctx.count, target: j.n }),
    });
  });

  /* -------------------------------------------------------------------- */
  /* 14) JOURNAL — commentaires laissés                                   */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "commentaires",
    cat: CAT.JOURNAL,
    emoji: "📝",
    thresholds: [1, 10, 25, 50],
    nameFn: (n) => (n === 1 ? "Premier mot" : `${n} commentaires écrits`),
    descFn: (n) =>
      n === 1
        ? "Ajouter un commentaire à une séance pour la première fois."
        : `Ajouter un commentaire à ${n} séances.`,
    valueFn: (ctx) => ctx.commentsCount,
  });
  add({
    id: id("commentaire-long"),
    cat: CAT.JOURNAL,
    emoji: "📖",
    nom: "Roman-fleuve",
    desc: "Écrire un commentaire de plus de 100 caractères sur une séance.",
    check: (ctx) => ctx.hasLongComment,
  });

  /* -------------------------------------------------------------------- */
  /* 15) PROGRESSION — records battus plusieurs fois de suite             */
  /* -------------------------------------------------------------------- */
  add({
    id: id("progression-rythme-3"),
    cat: CAT.PROGRESSION,
    emoji: "📈",
    nom: "En pleine accélération",
    desc: "Améliorer votre rythme moyen 3 séances de suite par rapport à la séance précédente.",
    check: (ctx) => ctx.streakRythmeAmeliore >= 3,
    progress: (ctx) => ({ current: ctx.streakRythmeAmeliore, target: 3 }),
  });
  add({
    id: id("progression-rythme-5"),
    cat: CAT.PROGRESSION,
    emoji: "🚀",
    nom: "Courbe ascendante",
    desc: "Améliorer votre rythme moyen 5 séances de suite par rapport à la séance précédente.",
    check: (ctx) => ctx.streakRythmeAmeliore >= 5,
    progress: (ctx) => ({ current: ctx.streakRythmeAmeliore, target: 5 }),
  });
  add({
    id: id("record-distance-3x"),
    cat: CAT.PROGRESSION,
    emoji: "🥇",
    nom: "Repousse ses limites",
    desc: "Battre votre record personnel de distance à 3 reprises.",
    check: (ctx) => ctx.nbRecordsDistance >= 3,
    progress: (ctx) => ({ current: ctx.nbRecordsDistance, target: 3 }),
  });
  add({
    id: id("record-kcal-3x"),
    cat: CAT.PROGRESSION,
    emoji: "🥇",
    nom: "Toujours plus d'énergie",
    desc: "Battre votre record personnel de kilocalories à 3 reprises.",
    check: (ctx) => ctx.nbRecordsKcal >= 3,
    progress: (ctx) => ({ current: ctx.nbRecordsKcal, target: 3 }),
  });
  add({
    id: id("record-intervalle-3x"),
    cat: CAT.PROGRESSION,
    emoji: "🥇",
    nom: "Toujours plus rapide",
    desc: "Battre votre record d'intervalle rapide à 3 reprises.",
    check: (ctx) => ctx.nbRecordsRythmeRapide >= 3,
    progress: (ctx) => ({ current: ctx.nbRecordsRythmeRapide, target: 3 }),
  });

  /* -------------------------------------------------------------------- */
  /* 16) TEMPS PASSÉ — heures cumulées de marche                          */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "heures-cumulees",
    cat: CAT.DUREE,
    emoji: "⏳",
    thresholds: [5, 10, 25, 50, 75, 100, 150],
    nameFn: (n) => `${n} heures de marche cumulées`,
    descFn: (n) => `Cumuler ${n} heures de marche japonaise depuis le début.`,
    valueFn: (ctx) => Math.floor(ctx.totalDureeMin / 60),
  });

  /* -------------------------------------------------------------------- */
  /* 17) ASSIDUITÉ MENSUELLE — séances dans un même mois calendaire       */
  /* -------------------------------------------------------------------- */
  addTier({
    slugBase: "assiduite-mois",
    cat: CAT.ASSIDUITE_MOIS,
    emoji: "🌟",
    thresholds: [4, 8, 12, 16, 20],
    nameFn: (n) => `${n} séances en un mois`,
    descFn: (n) => `Réaliser ${n} séances au cours d'un même mois calendaire.`,
    valueFn: (ctx) => ctx.maxMonthlyCount,
  });

  /* -------------------------------------------------------------------- */
  /* 18) CLINS D'ŒIL — trophées "fun" sans rapport avec la performance    */
  /* -------------------------------------------------------------------- */
  add({
    id: id("compte-rond"),
    cat: CAT.FUN,
    emoji: "🎱",
    nom: "Compte rond",
    desc: "Enregistrer une séance avec une distance parfaitement ronde (ex. 4,00 km).",
    check: (ctx) => ctx.hasRoundDistance,
  });
  add({
    id: id("meteo-extreme-meme-jour"),
    cat: CAT.FUN,
    emoji: "🎭",
    nom: "Toute la palette",
    desc: "Avoir enregistré à la fois une séance très chaude et une séance très froide (météo mentionnant chaleur/canicule et froid/neige).",
    check: (ctx) => ctx.meteoKeywords.has("froid") && (ctx.meteoKeywords.has("canicule") || ctx.meteoKeywords.has("soleil")),
  });

  // Ajuste dynamiquement le nombre total à exactement 150 trophées :
  // complète avec des jalons de séances supplémentaires si besoin, ou tronque sinon.
  const JALONS_SUPPLEMENTAIRES = [175, 225, 275, 350, 400, 450, 500, 600, 700, 800, 900];
  let extraIdx = 0;
  while (T.length < 150 && extraIdx < JALONS_SUPPLEMENTAIRES.length) {
    const n = JALONS_SUPPLEMENTAIRES[extraIdx++];
    add({
      id: id(`seances-extra-${n}`),
      cat: CAT.REGULARITE,
      emoji: "🚶",
      nom: `${n} séances`,
      desc: `Réaliser un total de ${n} séances de marche japonaise.`,
      check: (ctx) => ctx.count >= n,
      progress: (ctx) => ({ current: ctx.count, target: n }),
    });
  }
  if (T.length > 150) T.length = 150;

  /* -------------------------------------------------------------------- */
  /* Utilitaires                                                          */
  /* -------------------------------------------------------------------- */
  function fmtPace(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}'${String(s).padStart(2, "0")}"/km`;
  }
  function evaluateAll(ctx) {
    return T.map((t) => {
      let unlocked = false;
      try {
        unlocked = !!t.check(ctx);
      } catch (e) {
        unlocked = false;
      }
      let progress = null;
      if (t.progress) {
        try {
          progress = t.progress(ctx);
        } catch (e) {
          progress = null;
        }
      }
      return { ...t, unlocked, progress };
    });
  }

  global.TrophyEngine = {
    list: T,
    categories: CAT,
    evaluateAll,
    fmtPace,
  };
})(window);
