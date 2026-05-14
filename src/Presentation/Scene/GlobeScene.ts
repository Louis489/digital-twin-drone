/**
 * @file GlobeScene.ts
 * @description Chef d'orchestre de la présentation du globe.
 * Version refactorisée selon les principes Clean Architecture et SOLID.
 * Délègue toute la logique métier aux Use Cases et ne dépend que d'abstractions (IMapService).
 * @author Digital Twin Team
 * @version 2.0.0
 */

import * as Cesium from 'cesium';
import { IMapService } from '../../Domain/Interfaces/IMapService';
import { CesiumMapService } from '../../Infrastructure/Services/CesiumMapService';
import {
  InitializeMission,
  MissionConfig,
} from '../../Application/UseCases/InitializeMission';

export type SceneTransitionCallback = () => void;

/**
 * @class GlobeScene
 * @description Contrôleur de présentation pour la vue du globe 3D.
 * Responsabilité unique : orchestrer l'affichage sans connaissance de l'implémentation technique.
 * @implements {Clean Architecture - Presentation Layer}
 */
export class GlobeScene {
  private container: HTMLElement;
  private onTransition: SceneTransitionCallback | null = null;
  private mapService: IMapService;
  private initializeMission: InitializeMission;

  /**
   * @constructor
   * @param containerOrId - Élément HTML ou ID du conteneur
   * @param onTransition - Callback pour la transition vers DroneScene
   */
  constructor(
    containerOrId: string | HTMLElement,
    onTransition?: SceneTransitionCallback
  ) {
    if (typeof containerOrId === 'string') {
      const el = document.getElementById(containerOrId);
      if (!el)
        throw new Error(`Conteneur avec l'ID '${containerOrId}' introuvable.`);
      this.container = el;
    } else {
      this.container = containerOrId;
    }

    if (onTransition) {
      this.onTransition = onTransition;
    }

    // Injection de dépendance : On injecte CesiumMapService mais GlobeScene ne sait que c'est Cesium
    // Il pourrait être remplacé par GoogleMapService ou LeafletService sans modification
    this.mapService = new CesiumMapService();
    this.initializeMission = new InitializeMission(this.mapService);
  }

  /**
   * @method init
   * @description Initialise la scène du globe via le Use Case métier.
   * Configuration de la mission à Limerick avec marqueur rouge.
   * @returns Promise<void>
   */
  public async init(): Promise<void> {
    try {
      // Configuration de la mission selon les besoins métier
      const missionConfig: MissionConfig = {
        dronePosition: {
          longitude: -10.5, // Au large de la côte Ouest de l'Irlande
          latitude: 52.5,
          altitude: 0,
        },
        cameraAltitude: 15000000, // 15,000 km - vue globale
        flyDuration: 0, // Positionnement immédiat
        markerOptions: {
          color: '#ff0000', // Rouge
          pixelSize: 15,
          name: 'Mission Offshore - Clic pour démarrer',
        },
      };

      // Exécution du Use Case - tout la logique métier est encapsulée
      const result = await this.initializeMission.execute(
        this.container,
        missionConfig,
        this.onTransition ?? undefined
      );

      if (!result.success) {
        console.error(
          'Erreur lors de l\'initialisation de la mission:',
          result.error
        );
      }
    } catch (error) {
      console.error('Exception dans GlobeScene.init:', error);
    }
  }

  /**
   * @method dispose
   * @description Libère toutes les ressources de la scène.
   * Appelé lors de la destruction du composant.
   */
  public dispose(): void {
    this.initializeMission.dispose();
  }

  /**
   * @method getViewer
   * @description Expose le viewer Cesium pour les services d'infrastructure.
   * @returns Le viewer Cesium ou null si non initialisé
   */
  public getViewer(): Cesium.Viewer {
    return (this.mapService as CesiumMapService).getViewer() as Cesium.Viewer;
  }

  /**
   * @method onMarkerClick
   * @description Enregistre un callback pour le clic sur le marqueur.
   * @param callback - Fonction à appeler quand on clique sur le marqueur
   */
  public onMarkerClick(callback: () => void): void {
    const viewer = this.getViewer();
    if (!viewer) return;
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
      const pickedObject = viewer.scene.pick(click.position);
      // Si on a cliqué sur N'IMPORTE QUEL objet 3D sur le globe
      if (Cesium.defined(pickedObject)) {
        callback();
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }
}
