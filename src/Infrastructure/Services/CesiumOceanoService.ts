import * as Cesium from 'cesium';
import { IOceanoService } from '../../Domain/Interfaces/IOceanoService';

/**
 * @class CesiumOceanoService
 * Implémentation spécifique à Cesium pour les données océanographiques (WMS).
 */
export class CesiumOceanoService implements IOceanoService {
    private viewer: Cesium.Viewer;
    private bathymetryLayer: Cesium.ImageryLayer | null = null;

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
    }

    public enableBathymetryLayer(): void {
        if (this.bathymetryLayer) {
            this.bathymetryLayer.show = true;
            return;
        }

        // Configuration du flux WMS GEBCO (General Bathymetric Chart of the Oceans)
        const wmsProvider = new Cesium.WebMapServiceImageryProvider({
            url: 'https://wms.gebco.net/mapserv', // Nouvelle URL officielle GEBCO
            layers: 'gebco_latest_2', // Couche colorisée pour voir les profondeurs (bleus)
            parameters: {
                transparent: true,
                format: 'image/png'
            }
        });

        this.bathymetryLayer = this.viewer.imageryLayers.addImageryProvider(wmsProvider);
        // Transparence à 0.6 pour que les couleurs bleues se mélangent bien avec le fond satellite
        this.bathymetryLayer.alpha = 0.6;
    }

    public disableBathymetryLayer(): void {
        if (this.bathymetryLayer) {
            this.bathymetryLayer.show = false;
        }
    }
}
