const path = require("path");
const fs = require("fs");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");

const errors = [];

(async () => {
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    resources: "usable",
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;

  window.onerror = (msg, src, line, col, err) => {
    errors.push(`${msg} @ ${line}:${col}`);
  };
  window.console.error = (...args) => errors.push("console.error: " + args.join(" "));

  // charge les scripts manuellement dans l'ordre (jsdom runScripts + <script src> local nécessite fetch local)
  const trophiesSrc = fs.readFileSync(path.join(__dirname, "../js/trophies.js"), "utf8");
  const appSrc = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  window.eval(trophiesSrc);
  window.eval(appSrc);

  await new Promise((r) => setTimeout(r, 50));

  const doc = window.document;
  const $ = (s) => doc.querySelector(s);

  console.log("Trophées définis :", window.TrophyEngine.list.length);

  // -- Ajout d'une séance de MARCHE NORMALE (nouveau type) --
  $("#btn-add-fab").click();
  await new Promise((r) => setTimeout(r, 10));
  const typeBtnNormale = doc.querySelector('#form-type-toggle .type-btn[data-type="normale"]');
  if (!typeBtnNormale) errors.push("Bouton de bascule 'Marche normale' introuvable dans le formulaire");
  else typeBtnNormale.click();
  if (!doc.getElementById("row-intervalles").classList.contains("hidden"))
    errors.push("Les champs d'intervalles devraient être masqués en mode 'Marche normale'");
  if (doc.getElementById("lbl-rythme-moyen").textContent.indexOf("km/h") === -1)
    errors.push("Le libellé du champ vitesse ne mentionne pas km/h en mode 'Marche normale'");

  $("#f-date").value = "2026-07-04";
  $("#f-lieu").value = "Balade dominicale";
  $("#f-distance").value = "6";
  $("#f-meteo").value = "Nuageux";
  $("#f-duree").value = "70";
  $("#f-rythme-moyen").value = "5,4"; // km/h
  $("#f-kcal").value = "310";
  $("#form-session").dispatchEvent(new window.Event("submit", { cancelable: true }));

  const afterNormaleAdd = JSON.parse(window.localStorage.getItem("mj_sessions_v1") || "[]");
  const normaleSession = afterNormaleAdd.find((s) => s.lieu === "Balade dominicale");
  if (!normaleSession) errors.push("Séance de marche normale non enregistrée");
  else {
    if (normaleSession.type !== "normale") errors.push("Type incorrect pour la séance normale : " + normaleSession.type);
    if (normaleSession.rythmeRapide != null || normaleSession.rythmeLent != null)
      errors.push("Une marche normale ne devrait pas avoir d'intervalles rapide/lent");
    // 5,4 km/h -> ~666s/km (3600/5.4 = 666.67)
    if (Math.abs(normaleSession.rythmeMoyen - 667) > 2)
      errors.push("Conversion km/h -> rythme incorrecte : " + normaleSession.rythmeMoyen);
  }

  // -- Réouverture en édition : la vitesse km/h doit être restituée correctement --
  if (normaleSession) {
    doc.querySelector(`.nav-btn[data-view="accueil"]`).click();
    await new Promise((r) => setTimeout(r, 10));
    // ouvre directement via la fonction interne en simulant un clic sur la ligne si présente
    const item = doc.querySelector(`.session-item[data-id="${normaleSession.id}"]`);
    if (item) {
      item.click();
      await new Promise((r) => setTimeout(r, 10));
      const kmhField = doc.getElementById("f-rythme-moyen").value.replace(",", ".");
      if (Math.abs(parseFloat(kmhField) - 5.4) > 0.15) errors.push("La vitesse ré-affichée en édition est incorrecte : " + kmhField);
      doc.querySelector('[data-close="modal-session"]').click();
    }
  }

  // -- Import CSV avec une colonne "type" --
  const csvType = [
    "date;type;lieu;distance;météo;durée;fréquence cardiaque moyenne;rythme moyen;rythme de l'intervalle le plus rapide;rythme de l'intervalle le plus lent;kilocalories totales;commentaires",
    "02/02/2026;Marche normale;Quartier;2,50;Doux;25;110;9'30;;;140;Balade tranquille",
  ].join("\n");
  $("#btn-settings").click();
  await new Promise((r) => setTimeout(r, 10));
  $("#import-paste").value = csvType;
  $("#import-paste").dispatchEvent(new window.Event("input"));
  await new Promise((r) => setTimeout(r, 10));
  $("#btn-import-run").click();
  const afterCsvType = JSON.parse(window.localStorage.getItem("mj_sessions_v1") || "[]");
  const csvNormale = afterCsvType.find((s) => s.lieu === "Quartier");
  if (!csvNormale) errors.push("Import CSV avec colonne 'type' : séance non trouvée");
  else if (csvNormale.type !== "normale") errors.push("Import CSV : type non reconnu (" + csvNormale.type + ")");
  doc.querySelector('[data-close="modal-settings"]').click();

  // -- Ajout d'une séance manuelle --
  $("#btn-add-fab").click();
  await new Promise((r) => setTimeout(r, 10));
  doc.querySelector('#form-type-toggle .type-btn[data-type="japonaise"]').click();
  $("#f-date").value = "2026-08-10";
  $("#f-lieu").value = "Parc de test";
  $("#f-distance").value = "3,20";
  $("#f-meteo").value = "Soleil, léger vent";
  $("#f-duree").value = "30";
  $("#f-fc").value = "125";
  $("#f-rythme-moyen").value = "6'40";
  $("#f-kcal").value = "230";
  $("#f-rythme-rapide").value = "5'10";
  $("#f-rythme-lent").value = "7'50";
  $("#f-commentaire").value = "Séance test avec un commentaire de plus de cent caractères pour valider le trophée dédié au journal détaillé, vraiment.";
  $("#form-session").dispatchEvent(new window.Event("submit", { cancelable: true }));

  // -- Import CSV --
  const csv = [
    "date;lieu;distance;météo;durée;fréquence cardiaque moyenne;rythme moyen;rythme de l'intervalle le plus rapide;rythme de l'intervalle le plus lent;kilocalories totales;commentaires",
    "05/01/2026;Bord de mer;4,10;Pluie fine;30;130;6'20;5'00;7'30;260;Premiere sortie de janvier",
    "12/02/2026;Bord de mer;3,80;Neige légère;30;122;6'55;5'30;8'00;210;",
    "20/03/2026;Forêt;5,00;Ensoleillé;30;135;6'05;4'50;7'10;280;Record de distance",
  ].join("\n");
  window.eval(`document.getElementById('import-paste').value = ${JSON.stringify(csv)};`);
  $("#import-paste").dispatchEvent(new window.Event("input"));
  await new Promise((r) => setTimeout(r, 20));
  $("#btn-import-run").click();

  // -- Vérification du graphique "par semaine" (bug des barres invisibles) --
  doc.querySelector('.nav-btn[data-view="stats"]').click();
  await new Promise((r) => setTimeout(r, 10));
  const barShapes = Array.from(doc.querySelectorAll(".bar-shape"));
  if (!barShapes.length) errors.push("Aucune barre trouvée dans les graphiques stats");
  else {
    const heights = barShapes.map((el) => parseInt(el.style.height, 10) || 0);
    if (heights.every((h) => h === 0)) errors.push("Toutes les barres ont une hauteur de 0px (bug non corrigé)");
    console.log("Hauteurs de barres détectées :", heights.slice(0, 6).join(", "), "px ...");
  }

  // -- Navigation dans tous les onglets --
  for (const view of ["accueil", "trophees", "stats", "lieux", "progres"]) {
    doc.querySelector(`.nav-btn[data-view="${view}"]`).click();
    await new Promise((r) => setTimeout(r, 10));
  }

  // -- Ouverture / fermeture modales --
  doc.getElementById("btn-settings").click();
  if (!window.URL.createObjectURL) window.URL.createObjectURL = () => "blob:mock";
  if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {};
  doc.getElementById("btn-export-csv").click();
  doc.querySelector('[data-close="modal-settings"]').click();

  // -- Vérification du nouveau design de l'Accueil --
  doc.querySelector('.nav-btn[data-view="accueil"]').click();
  await new Promise((r) => setTimeout(r, 10));
  if (!doc.querySelector(".hero h1")) errors.push("Titre hero manquant sur l'Accueil");
  if (doc.querySelectorAll(".stat-tile.blob-red, .stat-tile.blob-blue, .stat-tile.blob-green, .stat-tile.blob-purple").length !== 4)
    errors.push("Les 4 cartes stat à pastille ne sont pas toutes présentes");
  if (!doc.querySelector(".week-strip") || doc.querySelectorAll(".week-col").length !== 7)
    errors.push("Le bandeau 'cette semaine' n'a pas 7 colonnes");
  console.log("Streak card présente :", !!doc.querySelector(".streak-card"));

  // -- Bascule d'affichage jap/normale sur Accueil, Stats, Progrès --
  for (const view of ["accueil", "stats", "progres"]) {
    doc.querySelector(`.nav-btn[data-view="${view}"]`).click();
    await new Promise((r) => setTimeout(r, 10));
    const toggleBtn = doc.querySelector('[data-role="view-type-toggle"] .type-btn[data-type="normale"]');
    if (!toggleBtn) { errors.push(`Bascule de type introuvable sur la vue ${view}`); continue; }
    toggleBtn.click();
    await new Promise((r) => setTimeout(r, 10));
    const backBtn = doc.querySelector('[data-role="view-type-toggle"] .type-btn[data-type="japonaise"]');
    if (backBtn) { backBtn.click(); await new Promise((r) => setTimeout(r, 10)); }
  }

  const sessions = JSON.parse(window.localStorage.getItem("mj_sessions_v1") || "[]");
  console.log("Séances stockées après ajout + import :", sessions.length);
  if (sessions.length !== 6) errors.push(`Nombre de séances inattendu : ${sessions.length} (attendu 6)`);

  const s0 = sessions.find((s) => s.lieu === "Parc de test");
  if (!s0) errors.push("Séance manuelle introuvable");
  else {
    if (s0.distance !== 3.2) errors.push("Distance mal parsée : " + s0.distance);
    if (s0.rythmeMoyen !== 400) errors.push("Rythme moyen mal parsé (attendu 400s) : " + s0.rythmeMoyen);
    if (s0.rythmeRapide !== 310) errors.push("Rythme rapide mal parsé (attendu 310s) : " + s0.rythmeRapide);
  }

  const imported = sessions.find((s) => s.lieu === "Forêt");
  if (!imported) errors.push("Séance importée 'Forêt' introuvable");
  else if (imported.distance !== 5) errors.push("Distance importée incorrecte : " + imported.distance);

  console.log(errors.length ? "❌ ERREURS :\n- " + errors.join("\n- ") : "✅ Aucune erreur détectée");
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error("Exception pendant le test :", e);
  process.exit(1);
});
