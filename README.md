# Marche japonaise 🚶

Application de suivi de vos séances de marche japonaise (marche rapide 3 min /
marche normale 3 min, sur 30 minutes). Toutes les données restent **en local
sur votre téléphone** (localStorage) — rien n'est envoyé à un serveur.

## Mettre en ligne sur GitHub Pages

1. Créez un dépôt GitHub (ex. `marche-japonaise`) et déposez-y ces 3 éléments
   à la racine : `index.html`, le dossier `css/`, le dossier `js/`.
2. Dans le dépôt : **Settings → Pages → Source : Deploy from a branch**,
   branche `main`, dossier `/ (root)`.
3. Votre app sera accessible à `https://<votre-pseudo>.github.io/marche-japonaise/`.
4. Sur iPhone, ouvrez ce lien dans Safari puis **Partager → Sur l'écran d'accueil**
   pour l'utiliser comme une vraie app, plein écran.

## Importer votre Google Sheet

Colonnes attendues (l'ordre n'a pas d'importance, les intitulés sont reconnus
même avec des variantes) : `date`, `lieu`, `distance`, `météo`, `durée`,
`fréquence cardiaque moyenne`, `rythme moyen`, `rythme de l'intervalle le plus
rapide`, `rythme de l'intervalle le plus lent`, `kilocalories totales`,
`commentaires`.

Trois façons d'importer, dans **Réglages → Importer un Google Sheet** :

- **Fichier CSV** : dans Google Sheets, `Fichier → Télécharger → Valeurs
  séparées par une virgule (.csv)`, puis sélectionnez le fichier dans l'app.
- **Lien publié** : `Fichier → Partager → Publier sur le web`, choisissez
  l'onglet concerné et le format `.csv`, collez le lien généré.
  (Si le chargement échoue à cause de restrictions réseau, téléchargez le
  CSV et utilisez l'option fichier ci-dessus.)
- **Coller le contenu** : copiez-collez directement le contenu du tableau.

Les rythmes au format `X'YY` (ex. `6'45`) sont interprétés comme `X'YY"`
(6 minutes 45 secondes par kilomètre). Les séances déjà présentes (même date,
lieu, distance et durée) ne sont pas dupliquées lors d'un nouvel import.

## Exporter vos données

`Réglages → Exporter mes données` :
- **CSV** : reprend les mêmes colonnes que l'import, pour réouvrir dans
  Google Sheets / Excel.
- **Sauvegarde JSON** : copie complète de vos séances et objectifs, utile
  avant de changer de téléphone.

## Développement local

Aucune dépendance de build : ouvrez simplement `index.html` dans un
navigateur, ou servez le dossier avec un petit serveur local
(`python3 -m http.server`) pour tester l'import de fichiers correctement.

Un test de fumée headless est fourni dans `test/smoke.js` (nécessite
`npm install jsdom` au préalable) : `node test/smoke.js`.
