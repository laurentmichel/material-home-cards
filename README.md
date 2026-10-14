# Material Home Cards

Cartes Lovelace au style **Material Design 3** pour Home Assistant, sans dépendance.
Elles reprennent automatiquement les couleurs d'un thème Material You
(variables `--md-sys-color-*`, par exemple [Material You Theme](https://github.com/Nerwyn/material-you-theme))
et retombent sur les couleurs Home Assistant sinon.

| Carte | Type |
|---|---|
| Slider de lumière teinté avec la couleur de la lumière | `custom:m3-light-slider-card` |
| Thermostat avec consigne réglable | `custom:m3-thermostat-card` |

## Installation (HACS)

1. HACS → menu ⋮ → **Dépôts personnalisés**
2. Dépôt : `https://github.com/laurentmichel/material-home-cards`, type : **Tableau de bord** (Dashboard / Lovelace)
3. Installer **Material Home Cards**, puis recharger la page (Ctrl+Maj+R)

HACS ajoute lui-même la ressource `/hacsfiles/material-home-cards/material-home-cards.js`.

Les deux cartes ont un **éditeur visuel** (entité, nom, icône, et pour le thermostat le pas et le mode
de démarrage) : elles apparaissent dans le sélecteur de cartes sous « M3 Light Slider » et « M3 Thermostat ».
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

## Développement

Les sources sont dans `src/`, une carte par fichier. `npm run build` (ou `node build.mjs`)
les assemble dans `dist/material-home-cards.js`, le fichier chargé par HACS : pensez à le
reconstruire et à le committer avant chaque release.

Pour publier une version : incrémenter `version` dans `package.json`, `npm run build`,
committer, puis créer une release GitHub `vX.Y.Z` — HACS propose alors la mise à jour.
