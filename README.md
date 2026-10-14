# Material Home Cards

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-support-FFDD00?logo=buymeacoffee&logoColor=000)](https://buymeacoffee.com/laurentmichel)

**Material Design 3** Lovelace cards for Home Assistant, with no dependencies.
They automatically pick up the colors of a Material You theme
(`--md-sys-color-*` variables, for example [Material You Theme](https://github.com/Nerwyn/material-you-theme))
and fall back to the Home Assistant colors otherwise.

<p align="center"><img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/hero.png" alt="Material Home Cards" width="900"></p>
<p align="center"><sub>Dark and light mode, with the Material You theme.</sub></p>

| Card | Type |
|---|---|
| Light slider tinted with the light's color | `custom:m3-light-slider-card` |
| Thermostat with adjustable target | `custom:m3-thermostat-card` |
| Sensor with a history curve | `custom:m3-graph-card` |
| Several sensors on one graph | `custom:m3-multi-graph-card` |
| Scene selector | `custom:m3-scene-card` |
| Media player | `custom:m3-media-card` |
| "Good morning" greeting with people | `custom:m3-person-card` |
| Robot map (Dreame mower…) | `custom:m3-map-card` |
| Weather and forecast | `custom:m3-weather-card` |
| Task in progress (3D print, washing machine…) | `custom:m3-progress-card` |
| Button for any entity | `custom:m3-button-card` |
| Popup opened by a `#hash` | `custom:m3-popup-card` |
| Room: temperature, humidity, light and heating | `custom:m3-room-card` |
| Settings list (stacked rows) | `custom:m3-list-card` |
| Badge for the top of views | `custom:m3-badge` |

## Installation (HACS)

1. HACS → ⋮ menu → **Custom repositories**
2. Repository: `https://github.com/laurentmichel/material-home-cards`, type: **Dashboard** (Lovelace)
3. Install **Material Home Cards**, then reload the page (Ctrl+Shift+R)

HACS adds the `/hacsfiles/material-home-cards/material-home-cards.js` resource by itself.

Every card has a **visual editor** and shows up in the card picker as "M3 …" (M3 Light Slider, M3 Thermostat,
M3 Graph, M3 Button…). The YAML below still works.

The cards follow Home Assistant's language: **English** and **French** are included, any other language falls
back to English. Entity states use Home Assistant's own translations. To add a language, add a table to
[`src/shared/i18n.js`](src/shared/i18n.js) — contributions are welcome.

## `m3-light-slider-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/slider.png" alt="m3-light-slider-card" width="880">

The whole card is a slider: dragging horizontally sets the brightness, and the filled part takes the light's
actual color (RGB or white temperature), as a pastel tone.

```yaml
type: custom:m3-light-slider-card
entity: light.office
name: Office        # optional
icon: mdi:lamp      # optional
```

| Gesture | Action |
|---|---|
| Horizontal drag | Brightness (at most one call every 300 ms, final value on release) |
| Tap | Turn on / off |
| Long press | More-info dialog (color, temperature) |

## `m3-thermostat-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/thermostat.png" alt="m3-thermostat-card" width="880">

Large target temperature between − / + buttons, with the mode and current temperature below
("Heat • 23.1 °C"). The displayed target changes as soon as you tap; a single command is sent
0.6 s after the last tap.

```yaml
type: custom:m3-thermostat-card
entity: climate.living_room
name: Living room    # optional
step: 0.5            # optional, step of the − / + buttons (default 0.5)
hvac_mode: heat      # optional, mode used by the "on" chip (default: heat, otherwise the first available mode)
icon: mdi:radiator   # optional, otherwise the icon follows the mode (flame when heating, power when off)
```

The on / off chip at the top right turns the thermostat on or off; tapping anywhere else opens the more-info dialog.

## `m3-graph-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/graph.png" alt="m3-graph-card" width="880">

Name and current value of a numeric sensor, with its smoothed history curve in the background.
The curve updates live and the history is reloaded every 5 minutes.

```yaml
type: custom:m3-graph-card
entity: sensor.phone_battery_level
name: Phone            # optional
icon: mdi:cellphone    # optional, otherwise the sensor's default icon
hours_to_show: 24      # optional, 1 to 720 h (default 24)
graph_height: 60       # optional, curve height in % of the card (default 60)
color: '#3b82f6'       # optional, CSS color of the curve (default: theme colors)
alert_below: 15        # optional, alert colors below this threshold
show_chevron: true     # optional, chevron on the right (default false)
```

Tapping opens the more-info dialog.

## `m3-multi-graph-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/multi-graph.png" alt="m3-multi-graph-card" width="880">

Several sensors on one graph, for example indoor and outdoor temperature: values at the top
(first sensor on the left, last one on the right), smoothed curves with a gradient at the bottom, on a shared
scale. Tapping a value opens that sensor's more-info dialog.

```yaml
type: custom:m3-multi-graph-card
hours_to_show: 24        # optional (default 24)
graph_height: 55         # optional, curve height in % of the card
variant: simple          # optional: simple (default), delta (difference between the first two) or extrema (min / max)
entities:
  - entity: sensor.house_temperature
    name: Indoor
    icon: mdi:home-outline
    color: '#8ec9ff'     # optional: CSS or HA color (blue, pink…)
  - entity: sensor.garden_temperature
    name: Outdoor
    icon: mdi:tree-outline
    color: '#fea6ff'
```

## `m3-button-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/button.png" alt="m3-button-card" width="880">

Icon, name and state of any entity. The card takes the `primary-container` tint when the entity is active
(on, open, playing, heating…) and shows a warning when it is offline.

| Entity | Tap (default) |
|---|---|
| Light, plug, switch, fan, cover, group… | Turn on / off |
| Scene, script | Run |
| Button, input_button | Press |
| Automation | Trigger |
| Lock | Lock / unlock |
| Media player | Play / pause |
| Vacuum | Start / return to dock |
| Others (sensors, thermostat…) | More-info dialog |

Long press opens the more-info dialog. Both can be replaced by any Home Assistant action, and a double tap can
trigger a third one.

```yaml
type: custom:m3-button-card
entity: light.office
name: Office            # optional
icon: mdi:lamp          # optional, otherwise the entity's icon for its state
icon_on: mdi:lamp       # optional, icon when the entity is active
icon_off: mdi:lamp-outline
text_on: "On"           # optional, replaces the state text
text_off: "Off"
show_state: true        # optional (default true)
tap_action:             # optional, otherwise the default action above
  action: navigate
  navigation_path: /lovelace/office
hold_action:            # optional, otherwise the more-info dialog
  action: more-info
double_tap_action:      # optional, disabled by default (a single tap then waits 250 ms)
  action: toggle
color: teal             # optional, (pastel) color when active, otherwise the theme's primary color
active: >-              # optional: template, or true / false; otherwise based on the entity state
  {{ '1' in states('input_text.vacuum_segments').split(',') }}
chip: >-                # optional: chip on the right (text or template), hidden when empty
  {% set segs = states('input_text.vacuum_segments').split(',') %}
  {{ segs.index('1') + 1 if '1' in segs else '' }}
```

## `m3-scene-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/scene.png" alt="m3-scene-card" width="880">

Scene selector as a Material 3 Expressive button group: the buttons are joined in a row, rounded at both ends,
and the **active scene** (the last one activated) widens and shows its name. With `off`, a last button turns the
given entity off; when it is off, that button is highlighted.
Long press (right click): the scene's more-info dialog.

```yaml
type: custom:m3-scene-card
variant: group           # optional: group (default), tiles or carousel
scenes:
  - entity: scene.bright
    name: Bright
    icon: mdi:brightness-5
    color: yellow        # optional: HA or CSS color
  - entity: scene.relax
    icon: mdi:sofa-outline
    color: purple
off:                     # optional, or simply "off: light.all"
  entity: light.all
  icon: mdi:moon-new
  color: orange
```

## `m3-media-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/media.png" alt="m3-media-card" width="880">

Media player: artwork, title and artist, app or source, progress bar (tap or drag to seek), controls
(shuffle, previous, play / pause, next, repeat) and volume. The background and accent use the artwork's colors
(Material You) when the browser can read it. Only the buttons the player supports are shown; when nothing is
playing, the card becomes compact with an on / off button. Tapping the top part opens the more-info dialog.

```yaml
type: custom:m3-media-card
entity: media_player.living_room
name: Living room        # optional
show_progress: true      # optional (default true)
show_volume: true        # optional (default true)
show_source: true        # optional, app or source (default true)
artwork_colors: true     # optional, colors taken from the artwork (default true)
```

## `m3-person-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/person.png" alt="m3-person-card" width="880">

Greeting: the photo and "Good morning, Laurent!" ("Good afternoon" / "Good evening" later in the day) for the
logged-in user, with their state below,
and the photos of the other people on the right. A person who is away turns grey; a dot shows who is at home.
Without a photo, the avatar shows the initial. Tapping opens the more-info dialog.

```yaml
type: custom:m3-person-card
persons:                 # optional, otherwise everyone except you
  - person.laurent
  - person.alicia
greeting: Hi there!      # optional, replaces "Good morning, <first name>!"
show_state: true         # optional (default true)
show_dot: true           # optional, "at home" dot (default true)
background: false        # optional, card background (default false)
```

## `m3-map-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/map.png" alt="m3-map-card" width="880">

A robot's map redrawn in Material 3 colors. When the map camera provides an SVG (as the Dreame Mower integration
does), the card removes the background, title and legend, recolors the lawn, mowing path, obstacles and robot
position, then crops to the area. Any other image is shown as is, with rounded corners. A chip can show the
robot's state and battery.

```yaml
type: custom:m3-map-card
entity: camera.mower_map
mower: lawn_mower.mower          # optional, state in the chip
battery: sensor.mower_battery    # optional
lawn_color: '#6abf69'            # optional
height: 360                      # optional, maximum height in px
```

## `m3-weather-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/weather.png" alt="m3-weather-card" width="880">

Weather: temperature, sky, feels-like, humidity and wind, on a background tinted by the weather (night icons after
sunset), then the hourly or daily forecast, received live.

```yaml
type: custom:m3-weather-card
entity: weather.home
forecast_type: hourly    # optional: hourly (default), daily or none
forecast_slots: 8        # optional, number of forecast slots
```

## `m3-progress-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/progress.png" alt="m3-progress-card" width="880">

Follows a task: state, percentage, progress bar, time left and end time (updated continuously).

```yaml
type: custom:m3-progress-card
entity: sensor.printer_state              # state shown as the subtitle
name: Print
progress: sensor.printer_progress         # optional, in %
end_time: sensor.printer_end_time         # optional, timestamp: the time left is derived from it
remaining: sensor.printer_time_left       # optional, otherwise a duration (min, h or s)
image: image.printer_model                # optional, thumbnail
color: orange                             # optional
```

## `m3-popup-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/popup.png" alt="m3-popup-card" width="640">

A popup that opens when the URL contains its `#hash`: a sheet sliding up from the bottom on mobile, a centered
dialog on desktop. It can hold any cards. On the dashboard the card is invisible; in edit mode, a placeholder with
an "Open" button lets you find and test it.

To open it, use a "Navigate" action to the hash, from any card:

```yaml
type: custom:m3-button-card
entity: light.living_room
tap_action:
  action: navigate
  navigation_path: '#living-room'
```

It closes by dragging the header down (mobile), with the × button, the Escape key, the phone's back button,
by tapping outside or after a delay.

```yaml
type: custom:m3-popup-card
hash: '#living-room'
header:
  name: Living room         # default "Popup"
  icon: mdi:sofa
  entity: light.living_room # optional
  button_type: switch       # name (default), state (name + state) or switch (name + state + toggle)
  show_header: true
cards:                      # any cards
  - type: custom:m3-light-slider-card
    entity: light.living_room
settings:
  close_by_clicking_outside: true
  auto_close: 0             # ms, 0 = never
  slide_to_close_distance: 100
style:
  width_desktop: 540        # px
  width_mobile: 100         # %
  border_radius: 28
  backdrop_blur: 6
```

The visual editor handles the hash, header, behavior and style; the `cards` list is edited in YAML.

## `m3-room-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/room.png" alt="m3-room-card" width="880">

A room: icon and name, large temperature with humidity next to it. The background takes the light's pastel color
when it is on, and the icon becomes a red flame while the heating is on (thermostat in any mode other than off).
Long press: turn the light on / off. With a "Navigate" action to a `#hash`, a tap opens the room's popup.

```yaml
type: custom:m3-room-card
name: Living room
icon: mdi:sofa-outline
light: light.living_room                          # optional, background color
climate: climate.living_room                      # optional, flame while the heating is on
temperature: sensor.living_room_temperature       # optional, otherwise the thermostat's
humidity: sensor.living_room_humidity             # optional
tap_action:                                       # optional, otherwise the more-info dialog
  action: navigate
  navigation_path: '#living-room'
hold_action:                                      # optional, otherwise toggle the light
  action: more-info
```

## `m3-list-card`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/list.png" alt="m3-list-card" width="880">

A Material 3 Expressive list, like Android settings: stacked rows forming a block with large rounded corners.
Each row has an icon, a title, a subtitle (the entity state by default) and, on the right, a switch, the state or
a chevron. An active row is tinted with the primary color.

On the right, `auto` picks a switch for things that turn on (light, plug…) and a chevron for a "Navigate" or
"URL" action. Tapping runs the entity's default action (like `m3-button-card`); a long press opens the more-info
dialog.

```yaml
type: custom:m3-list-card
title: Settings          # optional
radius: large            # optional: small, medium, large (default) or a number of px
dynamic: true            # optional, tints active rows (default true)
rows:
  - entity: light.living_room
  - entity: switch.coffee_plug
    name: Coffee machine
  - entity: scene.evening
    label: Run the scene         # replaces the state as the subtitle
  - entity: switch.deep_cleaning
    label_on: Deep               # subtitle depending on the state
    label_off: Normal
  - entity: sensor.detector_battery
    trailing: state
    alert_below: 20              # row in alert colors below this value
  - entity: sensor.house_temperature
    trailing: state              # auto, switch, state, chevron or none
  - name: Office
    icon: mdi:desktop-tower-monitor
    tap_action:
      action: navigate
      navigation_path: '#office'
```

The rows also work with [auto-entities](https://github.com/thomasloven/lovelace-auto-entities), using
`card_param: rows`.

## `m3-badge`

<img src="https://raw.githubusercontent.com/laurentmichel/material-home-cards/main/docs/images/badge.png" alt="m3-badge" width="880">

A badge for the top of a view (Edit → Badges), in the Material 3 "chip" style: icon and value on a background
tinted with the badge's color. Without a color, it uses the state color, like native badges.
`content`, `icon`, `color` and `label` accept a template, updated live.

```yaml
type: custom:m3-badge
entity: climate.house
attribute: current_temperature   # optional, shows an attribute instead of the state
color: amber                     # optional: HA color (amber, blue…), hex or rgb
icon: mdi:thermometer            # optional
variant: chip                    # optional: chip (default), pill or two-line
label: Heating                   # optional, second line of the two-line style
tap_action:                      # optional, otherwise the more-info dialog
  action: navigate
  navigation_path: /lovelace/heating
```

With a template, for example a washing machine's remaining time:

```yaml
type: custom:m3-badge
entity: sensor.washer_machine_state
content: >
  {% set t = (states('sensor.washer_completion_time') | as_datetime - now()).total_seconds() %}
  {{ t | timestamp_custom('%-H h %-M' if t > 3600 else '%-M min', false) }}
icon: mdi:washing-machine
color: blue
visibility:
  - condition: state
    entity: sensor.washer_machine_state
    state: run
```

## Development

### Testing without publishing

`npm run dev` starts a small local server (no dependencies) that serves a dev build of the cards and
**automatically reloads the Home Assistant page** on every save in `src/` (or in `build.mjs`).

1. `npm run dev`: the address to use is printed, for example `http://192.168.1.20:5000/material-home-cards-dev.js`
2. Settings → Dashboards → ⋮ → Resources → add this address as a **JavaScript module** (once)
3. In a test dashboard, use the `-dev` types: `custom:m3-thermostat-card-dev`, `custom:m3-light-slider-card-dev`,
   `custom:m3-graph-card-dev`, `custom:m3-button-card-dev`, `custom:m3-popup-card-dev`, `custom:m3-room-card-dev`,
   `custom:m3-list-card-dev`, `custom:m3-scene-card-dev`, `custom:m3-multi-graph-card-dev`,
   `custom:m3-media-card-dev`, `custom:m3-person-card-dev`, `custom:m3-map-card-dev`,
   `custom:m3-weather-card-dev`, `custom:m3-progress-card-dev` and `custom:m3-badge-dev`

The `-dev` types coexist with the version installed by HACS, which stays untouched. Change the port with
`PORT=5001 npm run dev`. If Home Assistant is opened over **https**, the browser blocks an http resource:
test from Home Assistant's local http address.

### Publishing

The sources live in `src/`, one card per file, with shared code in `src/shared/`. `npm run build`
(or `node build.mjs`) bundles them into `dist/material-home-cards.js`, the file loaded by HACS: rebuild and commit
it before every release.

To publish a version: bump `version` in `package.json`, run `npm run build`, commit, then create a GitHub release
`vX.Y.Z` — HACS then offers the update.

## Support

The cards are free and will stay free. If they made your dashboard a little nicer, you can
[buy me a coffee](https://buymeacoffee.com/laurentmichel) ☕ — it helps me keep building new cards and
supporting the latest Home Assistant releases. Stars, issues and ideas on GitHub are very welcome too!
