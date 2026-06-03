/**
 * @file CesiumMapService.ts
 * @description Implémentation concrète de IMapService utilisant CesiumJS.
 * Respecte le principe d'Inversion de Dépendance (DIP) - dépend de l'abstraction, non d'un framework.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import {
  IMapService,
  IGeoPosition,
  PointMarkerOptions,
  WMSLayerOptions,
  POIEntityProperties,
} from '../../Domain/Interfaces/IMapService';

/**
 * @class CesiumMapService
 * @description Service de cartographie 3D basé sur CesiumJS.
 * Implémente l'interface IMapService pour fournir une abstraction sur le moteur de rendu.
 * @implements {IMapService}
 */
export class CesiumMapService implements IMapService {
  private viewer: Cesium.Viewer | null = null;
  private container: HTMLElement | null = null;
  private entitiesMap: Map<string, Cesium.Entity> = new Map();
  private entityProperties: Map<string, POIEntityProperties> = new Map();
  private clickHandlers: Map<string, (properties?: POIEntityProperties) => void> = new Map();
  private globalPOIClickHandler?: (entityId: string, properties: POIEntityProperties) => void;

  /**
   * @inheritdoc
   * Initialise le viewer Cesium dans le conteneur spécifié.
   * Configure les widgets et optimise pour les performances.
   */
  public async initialize(container: HTMLElement | string): Promise<void> {
    this.container =
      typeof container === 'string'
        ? document.getElementById(container)
        : container;

    if (!this.container) {
      throw new Error(
        `Conteneur introuvable: ${typeof container === 'string' ? container : 'HTMLElement'}`
      );
    }

    // Configuration du conteneur
    this.container.innerHTML = '';
    this.container.style.cssText =
      'width: 100vw; height: 100vh; position: absolute; top: 0; left: 0; display: block; overflow: hidden; background-color: #000;';

    // Attente pour application CSS
    await new Promise((resolve) => setTimeout(resolve, 100));

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) {
      throw new Error(
        'Le conteneur a des dimensions nulles. Impossible d\'initialiser Cesium.'
      );
    }

    // Initialisation différée pour éviter les lags au démarrage
    await new Promise((resolve) => setTimeout(resolve, 500));

    this.viewer = new Cesium.Viewer(this.container, {
      animation: false,
      timeline: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true, // Optimisation performances
      shouldAnimate: true,
    });

    // Masquer les crédits
    const credit = this.viewer.cesiumWidget.creditContainer as HTMLElement;
    if (credit) {
      credit.style.display = 'none';
    }

    // Configuration globale des clics
    this.setupGlobalClickHandler();

    // Écouteur de chargement des tuiles pour masquer l'écran de chargement
    this.viewer.scene.globe.tileLoadProgressEvent.addEventListener((progress: number) => {
      if (progress === 0) {
        // Le chargement est terminé
        const overlay = document.getElementById('loading-overlay');
        if (overlay) {
          overlay.style.display = 'none';
          console.log('[CesiumMapService] Loading overlay hidden');
        }
      }
    });
  }

  /**
   * @inheritdoc
   * Ajoute un marqueur ponctuel sur la carte avec propriétés POI optionnelles.
   */
  public addPointMarker(
    position: IGeoPosition,
    options: PointMarkerOptions = {},
    properties?: POIEntityProperties
  ): string {
    if (!this.viewer) {
      throw new Error('Le viewer n\'est pas initialisé.');
    }

    const entityId = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const labelText = (options.name ?? 'Point').toUpperCase();
    const pointColor = this.parseColor(options.color ?? '#ff0000');
    const isWeather = (options.color ?? '').toLowerCase() === '#00e5ff';

    const entity = this.viewer.entities.add({
      id: entityId,
      position: Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        position.altitude ?? 0
      ),
      point: {
        pixelSize: options.pixelSize ?? 18,
        color: pointColor,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 3,
        scaleByDistance: new Cesium.NearFarScalar(1e6, 1.4, 1e8, 0.6),
        translucencyByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e8, 0.3),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: {
        text: labelText,
        font: isWeather ? 'bold 13px \'Segoe UI\', sans-serif' : 'bold 14px \'Segoe UI\', sans-serif',
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: isWeather ? Cesium.Color.fromCssColorString('#00e5ff') : Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        pixelOffset: new Cesium.Cartesian2(0, -32),
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        showBackground: true,
        backgroundColor: Cesium.Color.fromCssColorString('rgba(1, 8, 22, 0.75)'),
        backgroundPadding: new Cesium.Cartesian2(10, 6),
        scaleByDistance: new Cesium.NearFarScalar(1e6, 1.2, 1e8, 0.5),
        translucencyByDistance: new Cesium.NearFarScalar(1e6, 1.0, 2e8, 0.0),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      name: options.name ?? 'Point',
    });

    this.entitiesMap.set(entityId, entity);

    // Stocker les propriétés POI si fournies
    if (properties) {
      this.entityProperties.set(entityId, properties);
    }

    return entityId;
  }

  /**
   * @inheritdoc
   * Récupère les propriétés d'une entité POI.
   */
  public getEntityProperties(entityId: string): POIEntityProperties | null {
    return this.entityProperties.get(entityId) ?? null;
  }

  /**
   * @method setGlobalPOIClickHandler
   * @description Configure un gestionnaire global pour tous les clics POI.
   * @param handler - Fonction appelée quand un POI est cliqué
   */
  public setGlobalPOIClickHandler(handler: (entityId: string, properties: POIEntityProperties) => void): void {
    this.globalPOIClickHandler = handler;
  }

  /**
   * @inheritdoc
   * Déplace la caméra vers une position spécifique avec orientation optionnelle.
   */
  public flyTo(
    position: IGeoPosition,
    altitude: number,
    duration: number = 0,
    heading: number = 0,
    pitch: number = -Math.PI / 2
  ): void {
    if (!this.viewer) {
      throw new Error('Le viewer n\'est pas initialisé.');
    }

    this.viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        position.longitude,
        position.latitude,
        altitude
      ),
      orientation: {
        heading: heading,
        pitch: pitch,
        roll: 0,
      },
      duration: duration,
    });
  }

  /**
   * @inheritdoc
   * Ajoute une couche WMS/WMTS à la carte.
   * @todo Implémentation complète pour les données Oceano/WMTS
   */
  public addWMSLayer(
    url: string,
    layerName: string,
    options: WMSLayerOptions = {}
  ): void {
    if (!this.viewer) {
      throw new Error('Le viewer n\'est pas initialisé.');
    }

    // Configuration WMS avec WebMapServiceImageryProvider
    const provider = new Cesium.WebMapServiceImageryProvider({
      url: url,
      layers: layerName,
      parameters: {
        format: options.format ?? 'image/png',
        transparent: true,
        version: options.version ?? '1.1.1',
      },
      credit: new Cesium.Credit(layerName),
    });

    this.viewer.imageryLayers.addImageryProvider(provider);
  }

  /**
   * @inheritdoc
   * Supprime une entité de la carte.
   */
  public removeEntity(entityId: string): void {
    if (!this.viewer) {
      return;
    }

    const entity = this.entitiesMap.get(entityId);
    if (entity) {
      this.viewer.entities.remove(entity);
      this.entitiesMap.delete(entityId);
      this.clickHandlers.delete(entityId);
    }
  }

  /**
   * @inheritdoc
   * Configure le gestionnaire de clic pour une entité.
   */
  public setEntityClickHandler(entityId: string, callback: (properties?: POIEntityProperties) => void): void {
    this.clickHandlers.set(entityId, callback);
  }

  /**
   * @inheritdoc
   * Détruit le viewer et libère toutes les ressources.
   */
  public dispose(): void {
    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    this.entitiesMap.clear();
    this.clickHandlers.clear();

    if (this.container) {
      this.container.innerHTML = '';
    }
  }

  /**
   * @private
   * Configure le gestionnaire global de clic pour détecter les entités cliquables.
   */
  private setupGlobalClickHandler(): void {
    if (!this.viewer) return;

    const handler = new Cesium.ScreenSpaceEventHandler(
      this.viewer.scene.canvas
    );

    handler.setInputAction(
      (click: Cesium.ScreenSpaceEventHandler.PositionedEvent) => {
        const pickedObject = this.viewer!.scene.pick(click.position);

        if (Cesium.defined(pickedObject) && pickedObject.id) {
          const entityId = pickedObject.id.id;
          const properties = this.entityProperties.get(entityId);

          // Si c'est un POI avec propriétés
          if (properties && this.globalPOIClickHandler) {
            this.globalPOIClickHandler(entityId, properties);
            return;
          }

          // Sinon, gestion legacy
          const callback = this.clickHandlers.get(entityId);
          if (callback) {
            callback(properties);
          }
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }

  /**
   * @private
   * Convertit une couleur string en objet Cesium.Color.
   * @param color - Couleur au format hex (#ff0000) ou nom CSS
   * @returns Objet Cesium.Color
   */
  private parseColor(color: string): Cesium.Color {
    if (color.startsWith('#')) {
      const r = parseInt(color.slice(1, 3), 16) / 255;
      const g = parseInt(color.slice(3, 5), 16) / 255;
      const b = parseInt(color.slice(5, 7), 16) / 255;
      return new Cesium.Color(r, g, b, 1.0);
    }

    // Couleurs prédéfinies
    const colorMap: Record<string, Cesium.Color> = {
      red: Cesium.Color.RED,
      blue: Cesium.Color.BLUE,
      green: Cesium.Color.GREEN,
      white: Cesium.Color.WHITE,
      black: Cesium.Color.BLACK,
      yellow: Cesium.Color.YELLOW,
      cyan: Cesium.Color.CYAN,
      magenta: Cesium.Color.MAGENTA,
    };

    return colorMap[color.toLowerCase()] ?? Cesium.Color.RED;
  }

  /**
   * @method getViewer
   * @description Expose le viewer Cesium pour les services d'infrastructure.
   * @returns Le viewer Cesium ou null si non initialisé
   */
  public getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }
}
