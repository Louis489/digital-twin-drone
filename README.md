# Digital Twin — Drone Marin

> Jumeau numérique d'un drone sous-marin (ROV) et de son environnement naval, combinant un globe géospatial 3D, une scène immersive VR/AR et un tableau de bord météo-océanographique temps réel.

---

## Sommaire

- [Présentation](#présentation)
- [Aperçu des fonctionnalités](#aperçu-des-fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Structure du projet](#structure-du-projet)
- [Les trois scènes](#les-trois-scènes)
  - [1. Globe Cesium (Hub)](#1-globe-cesium-hub)
  - [2. Scène 3D / VR du navire](#2-scène-3d--vr-du-navire)
  - [3. Tableau de bord météo](#3-tableau-de-bord-météo)
- [Sources de données externes](#sources-de-données-externes)
- [Installation](#installation)
- [Scripts disponibles](#scripts-disponibles)
- [Configuration des clés API](#configuration-des-clés-api)
- [Déploiement](#déploiement)

---

## Présentation

Cette application web est un **jumeau numérique** d'un drone sous-marin destiné à l'inspection d'infrastructures offshore (éoliennes, coques de navires). Elle propose trois environnements complémentaires accessibles depuis un hub central :

1. **Un globe 3D** (Cesium) servant de menu de navigation et affichant le trafic maritime, la bathymétrie et la météo en temps réel.
2. **Une scène immersive 3D/VR** (Three.js + WebXR) où l'on explore un navire et pilote un ROV sous-marin.
3. **Un tableau de bord météo 2D** (Leaflet + deck.gl) avec simulation de marée noire.

---

## Aperçu des fonctionnalités

| Domaine | Fonctionnalités |
|---------|-----------------|
| **Géospatial** | Globe 3D, points d'intérêt cliquables, navigation caméra animée |
| **Trafic maritime** | Flux AIS temps réel (WebSocket), clustering, niveaux de détail (LOD), couleurs par type de navire |
| **Océanographie** | Bathymétrie GEBCO (WMS), routes maritimes (GeoJSON) |
| **Météo** | Couches OpenWeatherMap, grille vectorielle Open-Meteo, vent/température/pression |
| **3D immersif** | Navire chargé en GLTF, ROV, fond marin, récif corallien, éoliennes, shader d'océan |
| **VR/AR** | Sessions WebXR (VR casque + AR mobile), téléportation, vision rayon-X, vue éclatée du ROV |
| **Simulation** | Marée noire (particules deck.gl + collision côtière Turf.js), rejeu de télémétrie |

---

## Stack technique

### Cœur
- **TypeScript** `5.2` — typage statique
- **Vite** `5.2` — bundler et serveur de développement

### Rendu 3D et géospatial
- **CesiumJS** `1.141` — globe 3D, tuiles satellite, entités géospatiales
- **Three.js** `0.164` — moteur de rendu WebGL pour la scène immersive
- **WebXR API** — sessions VR et AR

### Cartographie 2D
- **Leaflet** `1.9` — carte météo 2D
- **deck.gl** `9.3` — couche de particules (marée noire) en `HeatmapLayer`
- **leaflet-velocity** — animation des champs de vent
- **Turf.js** `7.3` — géométrie spatiale (collision particules / côtes)

---

## Architecture

Le projet applique la **Clean Architecture** : les dépendances pointent toujours vers l'intérieur (Domain), garantissant un découplage fort entre la logique métier et les frameworks.

```
┌─────────────────────────────────────────────────────┐
│  Presentation      Scènes, orchestration UI          │
│  ┌────────────────────────────────────────────────┐ │
│  │  Application    Use Cases (cas d'utilisation)    │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │  Domain    Entités + Interfaces (contrats) │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│  Infrastructure   Implémentations concrètes (Cesium, │
│                   Three.js, WebSocket, APIs)         │
└─────────────────────────────────────────────────────┘
```

| Couche | Responsabilité | Exemples |
|--------|----------------|----------|
| **Domain** | Entités métier et interfaces, sans dépendance externe | `Ship`, `Drone`, `IMapService`, `IXRService` |
| **Application** | Cas d'utilisation orchestrant le métier | `ManageShipTrafficUseCase`, `StartMissionUseCase` |
| **Infrastructure** | Implémentations techniques des interfaces | `CesiumMapService`, `ThreeShipService`, `AISStreamWebSocketService` |
| **Presentation** | Scènes et liaison avec l'interface utilisateur | `GlobeScene`, `DroneScene` |

> Le **principe d'inversion de dépendance (DIP)** est respecté : par exemple `GlobeScene` dépend de l'interface `IMapService`, pas de `CesiumMapService` directement. Cesium pourrait être remplacé sans toucher à la couche Presentation.

---

## Structure du projet

```
digital-twin-drone/
├── index.html                  # Point d'entrée HTML, conteneurs et UI statique
├── src/
│   ├── main.ts                 # Orchestrateur global, transitions de scènes
│   │
│   ├── Domain/                 # ── Cœur métier (aucune dépendance externe) ──
│   │   ├── Entities/
│   │   │   ├── Drone.ts             # Entité drone (position, orientation)
│   │   │   ├── Ship.ts              # Entité navire AIS + types + niveaux LOD
│   │   │   ├── Vessel.ts            # Entité bateau
│   │   │   ├── InspectionMission.ts # Mission d'inspection ROV
│   │   │   ├── PathRecorder.ts      # Enregistrement de trajectoire
│   │   │   └── WeatherLayer.ts      # Types de couches météo
│   │   └── Interfaces/
│   │       ├── IMapService.ts           # Contrat service cartographique
│   │       ├── IXRService.ts            # Contrat VR/AR
│   │       ├── IOceanoService.ts        # Contrat données océano
│   │       ├── IShipTrafficRepository.ts# Contrat flux AIS
│   │       └── IGeoSpatialService.ts    # Contrat géospatial
│   │
│   ├── Application/             # ── Cas d'utilisation ──
│   │   └── UseCases/
│   │       ├── InitializeMission.ts     # Initialise globe + POIs
│   │       ├── StartMission.ts          # Transition globe → scène 3D
│   │       ├── ManageShipTraffic.ts     # Orchestre le trafic AIS + LOD
│   │       ├── ComputeLodLevel.ts       # Calcul pur du niveau de détail
│   │       ├── ToggleBathymetry.ts      # Active/désactive la bathymétrie
│   │       ├── ToggleShippingLanes.ts   # Active/désactive les routes
│   │       ├── ToggleARVision.ts        # Bascule la vision rayon-X
│   │       ├── StartImmersiveAR.ts      # Lance une session WebXR AR
│   │       ├── StartImmersiveVRUseCase.ts # Lance une session WebXR VR
│   │       ├── ReplayTelemetryUseCase.ts# Rejoue la télémétrie CSV
│   │       └── ReplayROVMission.ts      # Interpole la trajectoire ROV
│   │
│   ├── Infrastructure/         # ── Implémentations techniques ──
│   │   ├── Services/
│   │   │   ├── CesiumMapService.ts      # Viewer globe + POIs (IMapService)
│   │   │   ├── CesiumOceanoService.ts   # Bathymétrie + trafic AIS rendu
│   │   │   ├── CesiumWeatherService.ts  # Couches météo sur le globe
│   │   │   ├── AISStreamWebSocketService.ts # Flux AIS temps réel
│   │   │   ├── ThreeShipService.ts      # Scène 3D/VR principale (Three.js)
│   │   │   ├── WeatherDashboardService.ts   # Carte météo Leaflet
│   │   │   └── OilSimulationService.ts  # Simulation marée noire (deck.gl)
│   │   └── Helpers/
│   │       ├── ShipVisualFactory.ts     # Génère les flèches SVG par type
│   │       └── ShipModelFactory.ts      # Fabrique de modèles navires
│   │
│   ├── Presentation/           # ── Scènes et UI ──
│   │   └── Scene/
│   │       ├── GlobeScene.ts            # Orchestration du globe Cesium
│   │       └── DroneScene.ts            # Showroom 3D/AR du ROV
│   │
│   └── assets/                 # Modèles GLB, textures, données
└── package.json
```

---

## Les trois scènes

### 1. Globe Cesium (Hub)

Scène d'accueil servant de **menu de navigation**.

**Composants clés :**
- `GlobeScene` (Presentation) orchestre le tout.
- `CesiumMapService` (Infrastructure) initialise le `Cesium.Viewer` avec tous les widgets natifs désactivés (UI 100 % personnalisée).
- `InitializeMission` (Application) place deux **points d'intérêt (POI)** : *Scène 3D VR* et *Dashboard Météo*.
- `POIHubService` affiche un panneau latéral coulissant au clic d'un POI.

**Données affichées :**
- **Trafic AIS** : `AISStreamWebSocketService` reçoit les positions via WebSocket, `ManageShipTrafficUseCase` gère le registre et le **LOD** (cluster > 5000 km, flèches > 500 km, modèles < 500 km), `CesiumOceanoService` effectue le rendu.
- **Bathymétrie** : couche WMS GEBCO via `ToggleBathymetryUseCase`.
- **Météo** : `CesiumWeatherService` superpose les tuiles OpenWeatherMap et une grille vectorielle Open-Meteo.

### 2. Scène 3D / VR du navire

Environnement immersif FPS rendu avec **Three.js** et compatible **WebXR**.

**Service principal :** `ThreeShipService`

**Contenu de la scène :**
- Navire chargé en **GLTF** (~86 Mo) avec barre de progression.
- ROV sous-marin avec phare, caméra embarquée et HUD cockpit.
- Océan (shader `Water`), fond marin déformé, récif corallien procédural, éoliennes offshore.
- Ciel HDR (`.exr`) pour l'éclairage basé image (IBL).

**Contrôles et physique :**
- Déplacement FPS via `PointerLockControls` + collisions `Octree`/`Capsule`.
- Rejeu de trajectoire ROV via `ReplayROVMissionUseCase` (interpolation lerp/slerp).

**VR/AR (WebXR) :**
- **VR** : téléportation au laser, vue éclatée du ROV manipulable, écran cockpit virtuel.
- **AR / Vision rayon-X** : navire rendu semi-transparent, ROV en hologramme, flux caméra PIP.

> Une scène secondaire, `DroneScene`, propose un *showroom* du ROV avec `OrbitControls`, menu de démontage des pièces et support AR mobile.

### 3. Tableau de bord météo

Carte 2D **Leaflet** dédiée à la visualisation météo-océanographique.

**Service principal :** `WeatherDashboardService`

- Fond de carte sombre (CartoDB Dark Matter).
- Couches température et **vent animé** (`leaflet-velocity`).
- **Simulation de marée noire** : `OilSimulationService` génère ~300 particules rendues via une `HeatmapLayer` deck.gl, advectées par les courants et arrêtées aux côtes grâce à `Turf.js`.

---

## Sources de données externes

| Source | Protocole | Données | Clé requise |
|--------|-----------|---------|-------------|
| **AISStream.io** | WebSocket (`wss`) | Positions navires temps réel | Oui |
| **OpenWeatherMap** | HTTP (tuiles) | Couches météo raster | Oui |
| **Open-Meteo** | HTTP (REST) | Température, vent, pression | Non |
| **GEBCO** | WMS | Bathymétrie des océans | Non |

---

## Installation

```bash
# Cloner le dépôt puis installer les dépendances
npm install
```

**Prérequis :** Node.js 18+ et un navigateur compatible WebGL 2. Pour la VR/AR, un appareil et un navigateur compatibles WebXR sont nécessaires.

---

## Scripts disponibles

| Script | Commande | Description |
|--------|----------|-------------|
| Développement | `npm run dev` | Lance le serveur Vite avec rechargement à chaud |
| Build | `npm run build` | Compile TypeScript puis génère le bundle de production |
| Prévisualisation | `npm run preview` | Sert le build de production localement |
| Déploiement | `npm run deploy` | Build puis publication sur GitHub Pages |

---

## Configuration des clés API

Les clés API se renseignent directement dans l'interface (panneau latéral du globe et du dashboard) :

- **AISStream** : champ *Clé API AISStream* (section Trafic en temps réel).
- **OpenWeatherMap** : champ *Clé API OpenWeatherMap* (section Weather Layers).


---

## Déploiement

Le projet est configuré pour **GitHub Pages** via `gh-pages` :

```bash
npm run deploy
```

Cette commande build l'application puis publie le dossier `dist/` sur la branche `gh-pages`.
