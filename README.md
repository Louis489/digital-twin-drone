# Digital Twin - Drone

Jumeau numérique pour drone marin.

## Architecture

Le projet suit la **Clean Architecture** avec la structure suivante :

```
src/
├── Domain/         # Entités métier, règles de domaine
│   └── Entities/
│       └── Drone.ts
├── Application/    # Cas d'utilisation, orchestration
├── Infrastructure/ # Implémentations techniques (API, DB, etc.)
└── Presentation/   # Interface utilisateur (Three.js)
    └── Scene/
        └── DroneScene.ts
```

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

## Build

```bash
npm run build
```
