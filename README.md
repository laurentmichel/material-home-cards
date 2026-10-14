# Material Home Cards

Cartes Lovelace au style **Material Design 3** pour Home Assistant, sans dépendance.
Elles reprennent automatiquement les couleurs d'un thème Material You
(variables `--md-sys-color-*`, par exemple [Material You Theme](https://github.com/Nerwyn/material-you-theme))
et retombent sur les couleurs Home Assistant sinon.

| Carte | Type |
|---|---|
| Slider de lumière teinté avec la couleur de la lumière | `custom:m3-light-slider-card` |
| Thermostat avec consigne réglable | `custom:m3-thermostat-card` |
| Capteur avec courbe d'historique | `custom:m3-graph-card` |

## Installation (HACS)

1. HACS → menu ⋮ → **Dépôts personnalisés**
2. Dépôt : `https://github.com/laurentmichel/material-home-cards`, type : **Tableau de bord** (Dashboard / Lovelace)
3. Installer **Material Home Cards**, puis recharger la page (Ctrl+Maj+R)

HACS ajoute lui-même la ressource `/hacsfiles/material-home-cards/material-home-cards.js`.

Les cartes ont un **éditeur visuel** et apparaissent dans le sélecteur de cartes sous « M3 Light Slider »,
« M3 Thermostat » et « M3 Graph ».
Le YAML ci-dessous reste utilisable.

## `m3-light-slider-card`

Toute la carte est un slider : glisser horizontalement règle la luminosité, la partie remplie
prend la couleur réelle de la lumière (RGB ou température de blanc).

```yaml
type: custom:m3-light-slider-card
entity: light.bureau
name: Bureau        # facultatif
icon: mdi:lamp      # facultatif
```

| Geste | Action |
|---|---|
| Glisser horizontalement | Luminosité (au plus un appel toutes les 300 ms, valeur finale au relâchement) |
| Appui | Allumer / éteindre |
| Appui long | Fenêtre de détails (couleur, température) |

## `m3-thermostat-card`

Consigne en grand entre deux boutons − / +, mode et température actuelle en dessous
(« Chauffage • 23,1 °C »). La consigne affichée change dès l'appui ; une seule commande part
0,6 s après le dernier appui.

```yaml
type: custom:m3-thermostat-card
entity: climate.salon
name: Salon          # facultatif
step: 0.5            # facultatif, pas des boutons − / + (défaut 0.5)
hvac_mode: heat      # facultatif, mode utilisé par « Marche » (défaut : heat, sinon le premier mode disponible)
icon: mdi:radiator   # facultatif, sinon l'icône suit le mode (flamme en chauffage, power à l'arrêt)
```

Le bouton « Marche / Arrêt » en haut à droite allume / éteint ; un appui ailleurs sur la carte ouvre la fenêtre de détails.

## `m3-graph-card`

Nom et valeur actuelle d'un capteur numérique, avec la courbe de son historique lissée en fond.
La courbe se met à jour en direct et l'historique est rechargé toutes les 5 minutes.

```yaml
type: custom:m3-graph-card
entity: sensor.pixel_8_pro_battery_level
name: Pixel 8 Pro      # facultatif
icon: mdi:cellphone    # facultatif, sinon l'icône par défaut du capteur
hours_to_show: 24      # facultatif, de 1 à 720 h (défaut 24)
graph_height: 60       # facultatif, hauteur de la courbe en % de la carte (défaut 60)
color: '#3b82f6'       # facultatif, couleur CSS de la courbe (défaut : couleurs du thème)
alert_below: 15        # facultatif, couleurs d'alerte sous ce seuil
show_chevron: true     # facultatif, chevron à droite (défaut false)
```

Un appui ouvre la fenêtre de détails.

## Développement

### Tester sans publier

`npm run dev` lance un petit serveur local (sans dépendance) qui sert une version de dev des cartes
et **recharge automatiquement la page Home Assistant** à chaque sauvegarde dans `src/`.

1. `npm run dev` : l'adresse à utiliser s'affiche, par exemple `http://192.168.1.20:5000/material-home-cards-dev.js`
2. Paramètres → Tableaux de bord → ⋮ → Ressources → ajouter cette adresse en **module JavaScript** (une seule fois)
3. Dans un tableau de bord de test, utiliser les types `-dev` :
   `custom:m3-thermostat-card-dev`, `custom:m3-light-slider-card-dev` et `custom:m3-graph-card-dev`

Les types `-dev` cohabitent avec la version installée par HACS, qui reste intacte. Le port se change avec
`PORT=5001 npm run dev`. Si Home Assistant est ouvert en **https**, le navigateur bloque une ressource en http :
tester depuis l'adresse locale en http de Home Assistant.

### Publier

Les sources sont dans `src/`, une carte par fichier. `npm run build` (ou `node build.mjs`)
les assemble dans `dist/material-home-cards.js`, le fichier chargé par HACS : pensez à le
reconstruire et à le committer avant chaque release.

Pour publier une version : incrémenter `version` dans `package.json`, `npm run build`,
committer, puis créer une release GitHub `vX.Y.Z` — HACS propose alors la mise à jour.
