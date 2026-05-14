/**
 * @file OceanoDataService.ts
 * @description Service pour la gestion des données océanographiques via WMS/WMTS/Zarita.
 * Prépare l'intégration des couches de données maritimes pour le Jumeau Numérique.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import { IMapService, WMSLayerOptions } from '../../Domain/Interfaces/IMapService';

/**
 * @interface OceanoLayerConfig
 * @description Configuration d'une couche de données océanographiques.
 */
export interface OceanoLayerConfig {
  /** Identifiant unique de la couche */
  id: string;
  /** Nom affiché de la couche */
  name: string;
  /** URL du service WMS/WMTS */
  url: string;
  /** Nom technique de la couche sur le serveur */
  layerName: string;
  /** Type de service */
  serviceType: 'WMS' | 'WMTS' | 'Zarita';
  /** Description des données */
  description?: string;
  /** Options de rendu */
  options?: WMSLayerOptions;
}

/**
 * @class OceanoDataService
 * @description Service spécialisé pour l'intégration des données océanographiques.
 * Gère les couches WMS/WMTS et prépare l'intégration Zarita.
 */
export class OceanoDataService {
  private mapService: IMapService;
  private activeLayers: Map<string, OceanoLayerConfig> = new Map();

  /**
   * @constructor
   * @param mapService - Service de cartographie implémentant IMapService
   */
  constructor(mapService: IMapService) {
    this.mapService = mapService;
  }

  /**
   * @method addWMSSLayer
   * @description Ajoute une couche WMS standard à la carte.
   * @param config - Configuration de la couche
   * @throws Error si le service de carte n'est pas initialisé
   */
  public addWMSLayer(config: OceanoLayerConfig): void {
    if (config.serviceType !== 'WMS') {
      throw new Error(`Type de service non supporté: ${config.serviceType}. Utilisez 'WMS'.`);
    }

    this.mapService.addWMSLayer(config.url, config.layerName, config.options);
    this.activeLayers.set(config.id, config);
  }

  /**
   * @method addWMTSLayer
   * @description Ajoute une couche WMTS (tuiles) pour de meilleures performances.
   * @param config - Configuration de la couche WMTS
   * @todo Implémentation complète avec WebMapTileServiceImageryProvider
   */
  public addWMTSLayer(config: OceanoLayerConfig): void {
    if (config.serviceType !== 'WMTS') {
      throw new Error(`Type de service non supporté: ${config.serviceType}. Utilisez 'WMTS'.`);
    }

    // WMTS implémentation à compléter avec WebMapTileServiceImageryProvider
    console.warn(`WMTS layer ${config.name} requested but not fully implemented yet.`);
    this.activeLayers.set(config.id, config);
  }

  /**
   * @method addZaritaLayer
   * @description Prépare l'intégration des données Zarita.
   * @param config - Configuration de la couche Zarita
   * @todo Implémentation spécifique au format Zarita
   */
  public addZaritaLayer(config: OceanoLayerConfig): void {
    if (config.serviceType !== 'Zarita') {
      throw new Error(`Type de service non supporté: ${config.serviceType}. Utilisez 'Zarita'.`);
    }

    // Placeholder pour l'intégration Zarita future
    console.warn(`Zarita layer ${config.name} requested but integration pending.`);
    this.activeLayers.set(config.id, config);
  }

  /**
   * @method removeLayer
   * @description Supprime une couche active de la carte.
   * @param layerId - Identifiant de la couche à supprimer
   */
  public removeLayer(layerId: string): void {
    const layer = this.activeLayers.get(layerId);
    if (layer) {
      this.mapService.removeEntity(layerId);
      this.activeLayers.delete(layerId);
    }
  }

  /**
   * @method getActiveLayers
   * @description Retourne la liste des couches actuellement actives.
   * @returns Liste des configurations de couches actives
   */
  public getActiveLayers(): OceanoLayerConfig[] {
    return Array.from(this.activeLayers.values());
  }

  /**
   * @method clearAllLayers
   * @description Supprime toutes les couches océanographiques actives.
   */
  public clearAllLayers(): void {
    for (const [layerId] of this.activeLayers) {
      this.removeLayer(layerId);
    }
  }

  /**
   * @method getPredefinedConfigs
   * @description Retourne les configurations prédéfinies pour les données Oceano.
   * @returns Tableau de configurations prêtes à l'emploi
   */
  public static getPredefinedConfigs(): OceanoLayerConfig[] {
    return [
      {
        id: 'oceano-bathymetry',
        name: 'Bathymétrie',
        url: 'https://services.oceano.org/wms',
        layerName: 'bathymetry',
        serviceType: 'WMS',
        description: 'Données de profondeur océanique',
        options: {
          opacity: 0.7,
          format: 'image/png',
          srs: 'EPSG:4326',
        },
      },
      {
        id: 'oceano-currents',
        name: 'Courants Marins',
        url: 'https://services.oceano.org/wms',
        layerName: 'currents',
        serviceType: 'WMS',
        description: 'Courants océaniques en temps réel',
        options: {
          opacity: 0.6,
          format: 'image/png',
        },
      },
    ];
  }
}
