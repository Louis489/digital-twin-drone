/**
 * @file IMapService.ts
 * @description Interface définissant le contrat pour les services de cartographie.
 * Respecte le principe de Ségrégation d'Interface (ISP) et d'Inversion de Dépendance (DIP).
 * @author Digital Twin Team
 * @version 1.0.0
 */

/**
 * @interface IGeoPosition
 * @description Représentation d'une position géographique en WGS84.
 */
export interface IGeoPosition {
  /** Longitude en degrés (-180 à 180) */
  longitude: number;
  /** Latitude en degrés (-90 à 90) */
  latitude: number;
  /** Altitude en mètres (optionnel, défaut: 0) */
  altitude?: number;
}

/**
 * @interface POIEntityProperties
 * @description Propriétés pour les Points d'Intérêt (POI) cliquables
 */
export interface POIEntityProperties {
  title: string;
  description: string;
  imageUrl: string;
  targetId: string;
  isPOI: true;
}

/**
 * @interface IMapService
 * @description Contrat pour les services de cartographie 3D.
 * Permet de découpler la logique métier de l'implémentation technique (Cesium, Google Maps, etc.)
 */
export interface IMapService {
  /**
   * Initialise le viewer cartographique dans le conteneur spécifié.
   * @param container - Élément HTML ou ID du conteneur
   * @returns Promise<void>
   */
  initialize(container: HTMLElement | string): Promise<void>;

  /**
   * Ajoute un marqueur ponctuel sur la carte.
   * @param position - Coordonnées géographiques du point
   * @param options - Options de style (couleur, taille, etc.)
   * @param properties - Propriétés personnalisées POI (optionnel)
   * @returns Identifiant unique de l'entité créée
   */
  addPointMarker(
    position: IGeoPosition,
    options?: PointMarkerOptions,
    properties?: POIEntityProperties
  ): string;

  /**
   * Récupère les propriétés d'une entité par son identifiant.
   * @param entityId - Identifiant de l'entité
   * @returns Propriétés de l'entité ou null si non trouvé
   */
  getEntityProperties(entityId: string): POIEntityProperties | null;

  /**
   * Déplace la caméra vers une position spécifique.
   * @param position - Coordonnées cibles
   * @param altitude - Altitude de la caméra en mètres
   * @param duration - Durée de l'animation en secondes (0 = instantané)
   * @param heading - Orientation caméra en radians (optionnel)
   * @param pitch - Inclinaison caméra en radians (optionnel)
   */
  flyTo(position: IGeoPosition, altitude: number, duration?: number, heading?: number, pitch?: number): void;

  /**
   * Ajoute une couche WMS/WMTS à la carte.
   * @param url - URL du service
   * @param layerName - Nom de la couche
   * @param options - Options de configuration de la couche
   */
  addWMSLayer(url: string, layerName: string, options?: WMSLayerOptions): void;

  /**
   * Supprime une entité de la carte par son identifiant.
   * @param entityId - Identifiant de l'entité
   */
  removeEntity(entityId: string): void;

  /**
   * Configure le gestionnaire d'événements de clic sur une entité.
   * @param entityId - Identifiant de l'entité cliquable
   * @param callback - Fonction appelée au clic avec les propriétés POI
   */
  setEntityClickHandler(entityId: string, callback: (properties?: POIEntityProperties) => void): void;

  /**
   * Détruit le viewer et libère les ressources.
   */
  dispose(): void;
}

/**
 * @interface PointMarkerOptions
 * @description Options de personnalisation pour les marqueurs ponctuels.
 */
export interface PointMarkerOptions {
  /** Couleur du marqueur (format hex ou nom CSS) */
  color?: string;
  /** Taille du point en pixels */
  pixelSize?: number;
  /** Couleur du contour */
  outlineColor?: string;
  /** Largeur du contour en pixels */
  outlineWidth?: number;
  /** Nom affiché dans le tooltip */
  name?: string;
}

/**
 * @interface WMSLayerOptions
 * @description Options pour la configuration des couches WMS/WMTS.
 */
export interface WMSLayerOptions {
  /** Opacité de la couche (0 à 1) */
  opacity?: number;
  /** Format des tuiles (ex: 'image/png') */
  format?: string;
  /** Système de coordonnées (ex: 'EPSG:4326') */
  srs?: string;
  /** Version du service WMS */
  version?: string;
}
