/**
 * @file InitializeMission.ts
 * @description Use Case pour l'initialisation d'une mission avec positionnement du drone.
 * Coordonne l'initialisation de la carte et le placement initial du drone.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import { IMapService, IGeoPosition } from '../../Domain/Interfaces/IMapService';

/**
 * @interface MissionConfig
 * @description Configuration d'une mission d'initialisation.
 */
export interface MissionConfig {
  /** Position initiale du drone */
  dronePosition: IGeoPosition;
  /** Altitude de la caméra en mètres */
  cameraAltitude: number;
  /** Durée de l'animation de vol (0 = instantané) */
  flyDuration?: number;
  /** Options du marqueur drone */
  markerOptions?: {
    color?: string;
    pixelSize?: number;
    name?: string;
  };
}

/**
 * @interface MissionResult
 * @description Résultat de l'initialisation de la mission.
 */
export interface MissionResult {
  /** Identifiant de l'entité marqueur créée */
  markerEntityId: string;
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
        config.flyDuration ?? 0
      );

      // Étape 3: Création du marqueur drone
      const markerId = this.mapService.addPointMarker(config.dronePosition, {
        color: config.markerOptions?.color ?? '#ff0000',
        pixelSize: config.markerOptions?.pixelSize ?? 15,
        outlineColor: '#ffffff',
        outlineWidth: 2,
        name: config.markerOptions?.name ?? 'Drone Position',
      });

      // Étape 4: Configuration du gestionnaire de clic
      if (onMarkerClick) {
        this.mapService.setEntityClickHandler(markerId, onMarkerClick);
      }

      return {
        markerEntityId: markerId,
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
