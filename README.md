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
| Plusieurs capteurs sur un même graphique | `custom:m3-multi-graph-card` |
| Sélecteur de scènes | `custom:m3-scene-card` |
| Lecteur multimédia | `custom:m3-media-card` |
| Accueil « Bonjour » avec les personnes | `custom:m3-person-card` |
| Bouton pour n'importe quelle entité | `custom:m3-button-card` |
| Popup ouverte par un `#hash` | `custom:m3-popup-card` |
| Pièce : température, humidité, lumière et chauffage | `custom:m3-room-card` |
| Liste de réglages (lignes empilées) | `custom:m3-list-card` |
| Badge pour le haut des vues | `custom:m3-badge` |

## Installation (HACS)

1. HACS → menu ⋮ → **Dépôts personnalisés**
2. Dépôt : `https://github.com/laurentmichel/material-home-cards`, type : **Tableau de bord** (Dashboard / Lovelace)
3. Installer **Material Home Cards**, puis recharger la page (Ctrl+Maj+R)

HACS ajoute lui-même la ressource `/hacsfiles/material-home-cards/material-home-cards.js`.

Les cartes ont un **éditeur visuel** et apparaissent dans le sélecteur de cartes sous « M3 Light Slider »,
« M3 Thermostat », « M3 Graph », « M3 Button » et « M3 Popup ».
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

## `m3-multi-graph-card`

Plusieurs capteurs sur un même graphique, par exemple la température dedans et dehors : les valeurs en haut
(le premier capteur à gauche, le dernier à droite), les courbes lissées en bas avec un dégradé, sur une échelle
commune. Un appui sur une valeur ouvre la fenêtre de détails du capteur.

```yaml
type: custom:m3-multi-graph-card
hours_to_show: 24        # facultatif (défaut 24)
graph_height: 55         # facultatif, hauteur des courbes en % de la carte
variant: simple          # facultatif : simple (défaut), delta (écart entre les deux premiers) ou extrema (min / max)
entities:
  - entity: sensor.maison_temperature
    name: Intérieur
    icon: mdi:home-outline
    color: '#8ec9ff'     # facultatif : CSS ou couleur HA (blue, pink…)
  - entity: sensor.thermometre_jardin_temperature
    name: Extérieur
    icon: mdi:tree-outline
    color: '#fea6ff'
```

## `m3-button-card`

Icône, nom et état de n'importe quelle entité. La carte prend la teinte `primary-container` quand
l'entité est active (allumée, ouverte, en lecture, en chauffe…) et affiche une alerte quand elle est hors ligne.

| Entité | Appui (par défaut) |
|---|---|
| Lumière, prise, interrupteur, ventilateur, volet, groupe… | Allumer / éteindre |
| Scène, script | Lancer |
| Bouton, input_button | Appuyer |
| Automatisation | Déclencher |
| Serrure | Verrouiller / déverrouiller |
| Lecteur multimédia | Lecture / pause |
| Aspirateur | Démarrer / retour à la base |
| Autres (capteurs, thermostat…) | Fenêtre de détails |

L'appui long ouvre la fenêtre de détails. Les deux se remplacent par n'importe quelle action Home Assistant,
et un double appui peut en déclencher une troisième.

```yaml
type: custom:m3-button-card
entity: light.bureau
name: Bureau            # facultatif
icon: mdi:lamp          # facultatif, sinon l'icône de l'entité selon son état
icon_on: mdi:lamp       # facultatif, icône quand l'entité est active
icon_off: mdi:lamp-outline
text_on: Allumée        # facultatif, remplace le texte d'état
text_off: Éteinte
show_state: true        # facultatif (défaut true)
tap_action:             # facultatif, sinon l'action par défaut ci-dessus
  action: navigate
  navigation_path: /lovelace/bureau
hold_action:            # facultatif, sinon la fenêtre de détails
  action: more-info
double_tap_action:      # facultatif, désactivé par défaut (l'appui simple attend alors 250 ms)
  action: toggle
color: teal             # facultatif, couleur (pastel) quand c'est actif, sinon couleur primaire du thème
active: >-              # facultatif : template, ou true / false ; sinon selon l'état de l'entité
  {{ '1' in states('input_text.segments_aspirateur').split(',') }}
```

## `m3-scene-card`

Sélecteur de scènes en groupe de boutons Material 3 Expressive : les boutons sont collés en une rangée,
arrondis aux extrémités, et la **scène active** (la dernière lancée) s'élargit et affiche son nom. Avec `off`,
un dernier bouton éteint l'entité donnée ; quand elle est éteinte, c'est lui qui est mis en avant.
Appui long (clic droit) : fenêtre de détails de la scène.

```yaml
type: custom:m3-scene-card
variant: group           # facultatif : group (défaut), tiles ou carousel
scenes:
  - entity: scene.maison_lumineux
    name: Lumineux
    icon: mdi:brightness-5
    color: yellow        # facultatif : couleur HA ou CSS
  - entity: scene.maison_soho
    icon: mdi:sofa-outline
    color: purple
off:                     # facultatif, ou simplement « off: light.tout »
  entity: light.tout
  icon: mdi:moon-new
  color: orange
```

## `m3-media-card`

Lecteur multimédia : pochette, titre et artiste, application ou source, barre de progression (un appui ou un
glissement pour se déplacer), commandes (aléatoire, précédent, lecture / pause, suivant, répétition) et volume.
Le fond et l'accent reprennent les couleurs de la pochette (Material You) quand le navigateur peut la lire.
Seuls les boutons gérés par le lecteur s'affichent ; quand rien ne joue, la carte devient compacte avec un
bouton marche / arrêt. Un appui sur la partie haute ouvre la fenêtre de détails.

```yaml
type: custom:m3-media-card
entity: media_player.salon
name: Salon              # facultatif
show_progress: true      # facultatif (défaut true)
show_volume: true        # facultatif (défaut true)
show_source: true        # facultatif, application ou source (défaut true)
artwork_colors: true     # facultatif, couleurs tirées de la pochette (défaut true)
```

## `m3-person-card`

Accueil : la photo et « Bonjour Laurent ! » (« Bonsoir » à partir de 18 h) pour l'utilisateur connecté, avec son
état dessous, et les photos des autres personnes à droite. Une personne absente passe en gris ; une pastille
indique qui est à la maison. Sans photo, l'avatar affiche l'initiale. Un appui ouvre la fenêtre de détails.

```yaml
type: custom:m3-person-card
persons:                 # facultatif, sinon toutes les personnes sauf vous
  - person.laurent
  - person.alicia
greeting: Salut !        # facultatif, remplace « Bonjour <prénom> ! »
show_state: true         # facultatif (défaut true)
show_dot: true           # facultatif, pastille « à la maison » (défaut true)
background: false        # facultatif, fond de carte (défaut false)
```

## `m3-popup-card`

Popup qui s'ouvre quand l'URL contient son `#hash` : un panneau qui glisse depuis le bas sur mobile, une
fenêtre centrée sur ordinateur. Elle contient n'importe quelles cartes. Dans le tableau de bord, la carte
est invisible ; en mode édition, un repère avec un bouton « Ouvrir » permet de la retrouver et de la tester.

Pour l'ouvrir, une action « Naviguer » vers le hash, depuis n'importe quelle carte :

```yaml
type: custom:m3-button-card
entity: light.salon
tap_action:
  action: navigate
  navigation_path: '#salon'
```

Elle se ferme en glissant l'en-tête vers le bas (mobile), avec le bouton ×, la touche Échap, le bouton
retour du téléphone, en appuyant à côté ou après un délai.

```yaml
type: custom:m3-popup-card
hash: '#salon'
header:
  name: Salon               # défaut « Popup »
  icon: mdi:sofa
  entity: light.salon       # facultatif
  button_type: switch       # name (défaut), state (nom + état) ou switch (nom + état + interrupteur)
  show_header: true
cards:                      # n'importe quelles cartes
  - type: custom:m3-light-slider-card
    entity: light.salon
settings:
  close_by_clicking_outside: true
  auto_close: 0             # ms, 0 = jamais
  slide_to_close_distance: 100
style:
  width_desktop: 540        # px
  width_mobile: 100         # %
  border_radius: 28
  backdrop_blur: 6
```

L'éditeur visuel règle le hash, l'en-tête, le comportement et l'apparence ; la liste `cards` se modifie en YAML.

## `m3-room-card`

Carte d'une pièce : icône et nom, température en grand et humidité à côté. Le fond prend la couleur
pastel de la lumière quand elle est allumée, et l'icône devient une flamme rouge quand le chauffage
est en marche (thermostat sur un autre mode qu'« Arrêt »). Appui long : allumer / éteindre la lumière. Avec une action « Naviguer » vers un
`#hash`, l'appui ouvre la popup de la pièce.

```yaml
type: custom:m3-room-card
name: Salon
icon: mdi:sofa-outline
light: light.salon                                 # facultatif, couleur du fond
climate: climate.salon                             # facultatif, flamme quand le chauffage est en marche
temperature: sensor.thermometre_salon_temperature  # facultatif, sinon celle du thermostat
humidity: sensor.thermometre_salon_humidity        # facultatif
tap_action:                                        # facultatif, sinon la fenêtre de détails
  action: navigate
  navigation_path: '#salon'
hold_action:                                       # facultatif, sinon allumer / éteindre la lumière
  action: more-info
```

## `m3-list-card`

Liste au style Material 3 Expressive, comme les réglages Android : des lignes empilées qui forment un bloc
aux grands coins arrondis. Chaque ligne a une icône, un titre, un sous-titre (l'état de l'entité par défaut)
et, à droite, un interrupteur, l'état ou une flèche. Une ligne active se teinte en couleur primaire.

À droite, `auto` choisit un interrupteur pour ce qui s'allume (lumière, prise…) et une flèche pour une
action « Naviguer » ou « URL ». L'appui fait l'action par défaut de l'entité (comme `m3-button-card`),
l'appui long ouvre la fenêtre de détails.

```yaml
type: custom:m3-list-card
title: Réglages          # facultatif
radius: large            # facultatif : small, medium, large (défaut) ou un nombre de px
dynamic: true            # facultatif, teinte les lignes actives (défaut true)
rows:
  - entity: light.salon
  - entity: switch.prise_cafe
    name: Machine à café
  - entity: scene.soiree
    label: Lancer la scène       # remplace l'état en sous-titre
  - entity: switch.nettoyage_en_profondeur
    label_on: En profondeur      # sous-titre selon l'état
    label_off: Normal
  - entity: sensor.maison_temperature
    trailing: state              # auto, switch, state, chevron ou none
  - name: Bureau
    icon: mdi:desktop-tower-monitor
    tap_action:
      action: navigate
      navigation_path: '#bureau'
```

## `m3-badge`

Badge à placer en haut d'une vue (Modifier → Badges), au style « chip » de Material 3 : icône et valeur
sur un fond teinté de la couleur du badge. Sans couleur, il prend celle de l'état, comme les badges natifs.
`content`, `icon`, `color` et `label` acceptent un template, mis à jour en direct.

```yaml
type: custom:m3-badge
entity: climate.maison
attribute: current_temperature   # facultatif, affiche un attribut au lieu de l'état
color: amber                     # facultatif : couleur HA (amber, blue…), hex ou rgb
icon: mdi:thermometer            # facultatif
variant: chip                    # facultatif : chip (défaut), pill ou two-line
label: Chauffage                 # facultatif, deuxième ligne du style two-line
tap_action:                      # facultatif, sinon la fenêtre de détails
  action: navigate
  navigation_path: /dashboard-maison/chauffage
```

Avec un template, par exemple le temps restant d'un lave-linge :

```yaml
type: custom:m3-badge
entity: sensor.lave_linge_machine_state
content: >
  {% set t = (states('sensor.lave_linge_completion_time') | as_datetime - now()).total_seconds() %}
  {{ t | timestamp_custom('%-H h %-M' if t > 3600 else '%-M min', false) }}
icon: mdi:washing-machine
color: blue
visibility:
  - condition: state
    entity: sensor.lave_linge_machine_state
    state: run
```

## Développement

### Tester sans publier

`npm run dev` lance un petit serveur local (sans dépendance) qui sert une version de dev des cartes
et **recharge automatiquement la page Home Assistant** à chaque sauvegarde dans `src/` (ou dans `build.mjs`).

1. `npm run dev` : l'adresse à utiliser s'affiche, par exemple `http://192.168.1.20:5000/material-home-cards-dev.js`
2. Paramètres → Tableaux de bord → ⋮ → Ressources → ajouter cette adresse en **module JavaScript** (une seule fois)
3. Dans un tableau de bord de test, utiliser les types `-dev` :
   `custom:m3-thermostat-card-dev`, `custom:m3-light-slider-card-dev`, `custom:m3-graph-card-dev`, `custom:m3-button-card-dev`, `custom:m3-popup-card-dev`, `custom:m3-room-card-dev`, `custom:m3-list-card-dev`, `custom:m3-scene-card-dev`, `custom:m3-multi-graph-card-dev`, `custom:m3-media-card-dev`, `custom:m3-person-card-dev` et `custom:m3-badge-dev`

Les types `-dev` cohabitent avec la version installée par HACS, qui reste intacte. Le port se change avec
`PORT=5001 npm run dev`. Si Home Assistant est ouvert en **https**, le navigateur bloque une ressource en http :
tester depuis l'adresse locale en http de Home Assistant.

### Publier

Les sources sont dans `src/`, une carte par fichier. `npm run build` (ou `node build.mjs`)
les assemble dans `dist/material-home-cards.js`, le fichier chargé par HACS : pensez à le
reconstruire et à le committer avant chaque release.

Pour publier une version : incrémenter `version` dans `package.json`, `npm run build`,
committer, puis créer une release GitHub `vX.Y.Z` — HACS propose alors la mise à jour.
