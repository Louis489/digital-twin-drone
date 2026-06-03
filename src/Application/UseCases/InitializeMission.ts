/**
 * @file InitializeMission.ts
 * @description Use Case pour l'initialisation d'une mission avec positionnement du drone.
 * Coordonne l'initialisation de la carte et le placement initial du drone.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import { IMapService, IGeoPosition } from '../../Domain/Interfaces/IMapService';

/**
 * @interface POIProperties
 * @description Propriétés personnalisées pour les Points d'Intérêt (POI)
 */
export interface POIProperties {
  title: string;
  description: string;
  imageUrl: string;
  targetId: string;
  isPOI: true;
}

/**
 * @interface MissionConfig
 * @description Configuration d'une mission d'initialisation.
 */
export interface MissionConfig {
  /** Position initiale du drone */
  dronePosition: IGeoPosition;
  /** Altitude de la caméra en mètres */
  cameraAltitude: number;
  /** Heading de la caméra en radians (optionnel, défaut: 0) */
  cameraHeading?: number;
  /** Pitch de la caméra en radians (optionnel, défaut: -Math.PI/2) */
  cameraPitch?: number;
  /** Durée de l'animation de vol (0 = instantané) */
  flyDuration?: number;
  /** Options du marqueur drone */
  markerOptions?: {
    color?: string;
    pixelSize?: number;
    name?: string;
  };
  /** Propriétés POI pour le marqueur 3D */
  scene3DPOIProperties?: POIProperties;
  /** Configuration du POI météo */
  weatherPOI?: {
    position: IGeoPosition;
    properties: POIProperties;
  };
}

/**
 * @interface MissionResult
 * @description Résultat de l'initialisation de la mission.
 */
export interface MissionResult {
  /** Identifiant de l'entité marqueur créée (Scène 3D) */
  markerEntityId: string;
  /** Identifiant du marqueur météo */
  weatherMarkerId?: string;
  /** Statut de l'initialisation */
  success: boolean;
  /** Message d'erreur éventuel */
  error?: string;
}

/**
 * @class InitializeMission
 * @description Use Case responsable de l'initialisation complète d'une mission.
 * Implémente la logique métier de positionnement sans dépendance au moteur de rendu.
 */
export class InitializeMission {
  private mapService: IMapService;

  /**
   * @constructor
   * @param mapService - Service de cartographie (injection de dépendance)
   */
  constructor(mapService: IMapService) {
    this.mapService = mapService;
  }

  /**
   * @method execute
   * @description Exécute l'initialisation de la mission.
   * Initialise la carte, positionne la caméra et place le marqueur drone.
   * @param container - Élément HTML conteneur pour la carte
   * @param config - Configuration de la mission
   * @param onMarkerClick - Callback optionnel au clic sur le marqueur
   * @returns Promise<MissionResult> - Résultat de l'opération
   */
  public async execute(
    container: HTMLElement | string,
    config: MissionConfig,
    onMarkerClick?: () => void
  ): Promise<MissionResult> {
    try {
      // Étape 1: Initialisation du service de cartographie
      await this.mapService.initialize(container);

      // Étape 2: Positionnement de la caméra
      this.mapService.flyTo(
        config.dronePosition,
        config.cameraAltitude,
        config.flyDuration ?? 0,
        config.cameraHeading,
        config.cameraPitch
      );

      // Étape 3: Création du marqueur drone (POI Scène 3D)
      const scene3DProperties: POIProperties = config.scene3DPOIProperties ?? {
        title: 'Scène 3D VR',
        description: 'Explorez le navire et le drone en réalité virtuelle immersive. Visualisation temps réel des données océanographiques.',
        imageUrl: '/assets/turbine_scene.png',
        targetId: 'scene-3d',
        isPOI: true
      };

      const markerId = this.mapService.addPointMarker(config.dronePosition, {
        color: config.markerOptions?.color ?? '#ff0000',
        pixelSize: config.markerOptions?.pixelSize ?? 15,
        outlineColor: '#ffffff',
        outlineWidth: 2,
        name: config.markerOptions?.name ?? 'Mission Offshore - Clic pour démarrer',
      }, scene3DProperties);

      // Étape 4: Création du POI Météo (Atlantique)
      let weatherMarkerId = '';
      if (config.weatherPOI) {
        weatherMarkerId = this.mapService.addPointMarker(config.weatherPOI.position, {
          color: '#00e5ff', // Cyan pour différencier
          pixelSize: 20,
          outlineColor: '#ffffff',
          outlineWidth: 2,
          name: 'Dashboard Météo',
        }, config.weatherPOI.properties);
      } else {
        // POI Météo par défaut dans l'Atlantique
        const defaultWeatherPOI: POIProperties = {
          title: 'Dashboard Météo',
          description: 'Visualisation des vents et données océanographiques en temps réel. Analyse des courants marins et prévisions météo.',
          imageUrl: '', // Image supprimée pour éviter l'erreur réseau
          targetId: 'meteo-dashboard',
          isPOI: true
        };
        weatherMarkerId = this.mapService.addPointMarker(
          { longitude: -15, latitude: 45, altitude: 0 }, // Atlantique
          {
            color: '#00e5ff',
            pixelSize: 20,
            outlineColor: '#ffffff',
            outlineWidth: 2,
            name: 'Dashboard Météo',
          },
          defaultWeatherPOI
        );
      }

      // Étape 5: Configuration du gestionnaire de clic pour le marqueur 3D
      if (onMarkerClick) {
        this.mapService.setEntityClickHandler(markerId, onMarkerClick);
      }

      return {
        markerEntityId: markerId,
        weatherMarkerId: weatherMarkerId,
        success: true,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erreur inconnue lors de l\'initialisation';

      return {
        markerEntityId: '',
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * @method dispose
   * @description Libère les ressources de la mission.
   */
  public dispose(): void {
    this.mapService.dispose();
  }
}
