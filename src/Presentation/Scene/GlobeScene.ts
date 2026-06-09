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
  private mapService: IMapService;
  private initializeMission: InitializeMission;

  /**
   * @constructor
   * @param containerOrId - Élément HTML ou ID du conteneur
   * @param onTransition - Callback pour la transition vers DroneScene
   */
  constructor(
    containerOrId: string | HTMLElement
  ) {
    if (typeof containerOrId === 'string') {
      const el = document.getElementById(containerOrId);
      if (!el)
        throw new Error(`Conteneur avec l'ID '${containerOrId}' introuvable.`);
      this.container = el;
    } else {
      this.container = containerOrId;
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
        cameraAltitude: 8000000, // 8 000 km — vue Atlantique inclinée
        cameraHeading: Cesium.Math.toRadians(5),
        cameraPitch: Cesium.Math.toRadians(-75), // -45° : voir l'horizon
        flyDuration: 5, // Positionnement immédiat
        markerOptions: {
          color: '#ff0000',
          pixelSize: 18,
          name: 'Scène 3D VR',
        },
      };

      // Exécution du Use Case - tout la logique métier est encapsulée
      const result = await this.initializeMission.execute(
        this.container,
        missionConfig
      );

      if (!result.success) {
        console.error(
          'Erreur lors de l\'initialisation de la mission:',
          result.error
        );
      }

      // Overlay titre Hub
      this.injectHubOverlay();
    } catch (error) {
      console.error('Exception dans GlobeScene.init:', error);
    }
  }

  /**
   * @method injectHubOverlay
   * @private
   * Injecte l'overlay HTML "Command Center" au-dessus du canvas Cesium.
   */
  private injectHubOverlay(): void {
    const overlayId = 'hub-overlay';
    if (document.getElementById(overlayId)) return;

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.innerHTML = `
      <div class="hub-title-block">
        <div class="hub-title">DIGITAL TWIN HUB</div>
        <div class="hub-subtitle">Sélectionnez un environnement de simulation</div>
        <div class="hub-divider"></div>
      </div>
    `;

    const style = document.createElement('style');
    style.id = 'hub-overlay-styles';
    style.textContent = `
      #hub-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        pointer-events: none;
        z-index: 100;
        display: flex;
        justify-content: center;
        padding-top: 28px;
      }

      .hub-title-block {
        text-align: center;
        user-select: none;
      }

      .hub-title {
        font-family: 'Orbitron', 'Segoe UI', 'Arial', sans-serif;
        font-size: clamp(22px, 3.5vw, 42px);
        font-weight: 900;
        letter-spacing: 0.25em;
        color: #ffffff;
        text-shadow:
          0 0 20px rgba(0, 229, 255, 0.9),
          0 0 50px rgba(0, 229, 255, 0.5),
          0 2px 4px rgba(0,0,0,0.8);
        line-height: 1.1;
      }

      .hub-subtitle {
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: clamp(11px, 1.4vw, 16px);
        font-weight: 400;
        letter-spacing: 0.3em;
        color: rgba(0, 229, 255, 0.85);
        text-transform: uppercase;
        margin-top: 8px;
        text-shadow: 0 1px 6px rgba(0,0,0,0.7);
      }

      .hub-divider {
        margin: 12px auto 0;
        width: 160px;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(0,229,255,0.7), transparent);
      }
    `;

    if (!document.getElementById('hub-overlay-styles')) {
      document.head.appendChild(style);
    }
    document.body.appendChild(overlay);
  }

  /**
   * @method removeHubOverlay
   * @private
   * Retire l'overlay Hub lors du changement de vue.
   */
  private removeHubOverlay(): void {
    const overlay = document.getElementById('hub-overlay');
    if (overlay) overlay.remove();
    const style = document.getElementById('hub-overlay-styles');
    if (style) style.remove();
  }

  /**
   * @method dispose
   * @description Libère toutes les ressources de la scène.
   * Appelé lors de la destruction du composant.
   */
  public dispose(): void {
    this.removeHubOverlay();
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
   * @method getMapService
   * @description Expose le service de carte pour configurer les interactions POI.
   * @returns Le CesiumMapService
   */
  public getMapService(): CesiumMapService {
    return this.mapService as CesiumMapService;
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
