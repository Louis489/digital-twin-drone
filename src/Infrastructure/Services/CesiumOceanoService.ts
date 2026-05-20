import * as Cesium from 'cesium';
import type { Ship } from '../../Domain';
import { LodLevel } from '../../Domain';
import { IOceanoService } from '../../Domain/Interfaces/IOceanoService';
import { IGeoSpatialService } from '../../Domain/Interfaces/IGeoSpatialService';
import { getArrowSvgDataUri } from '../Helpers/ShipVisualFactory';

/**
 * @class CesiumOceanoService
 * Implémentation spécifique à Cesium pour les données océanographiques (WMS).
 */
export class CesiumOceanoService implements IOceanoService, IGeoSpatialService {
    private viewer: Cesium.Viewer;
    private bathymetryLayer: Cesium.ImageryLayer | null = null;
    private shipDataSource: Cesium.CustomDataSource;
    private shippingLanesDataSource: Cesium.GeoJsonDataSource | null = null;
    private cameraHeightListenerId: Cesium.Event.RemoveCallback | null = null;

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;

        // DataSource pour le système Ship temps réel (multi-LOD)
        this.shipDataSource = new Cesium.CustomDataSource('Ship_Traffic_LOD');
        this.viewer.dataSources.add(this.shipDataSource);
        this.shipDataSource.clustering.enabled = true;
        this.shipDataSource.clustering.pixelRange = 50;
        this.shipDataSource.clustering.minimumClusterSize = 3;
        this.shipDataSource.clustering.clusterEvent.addEventListener((clusteredEntities, cluster) => {
            cluster.label.show = true;
            cluster.label.text = clusteredEntities.length.toLocaleString();
            cluster.label.font = 'bold 14px sans-serif';
            cluster.label.fillColor = Cesium.Color.WHITE;
            cluster.label.style = Cesium.LabelStyle.FILL_AND_OUTLINE;
            cluster.label.outlineColor = Cesium.Color.BLACK;
            cluster.label.outlineWidth = 2;
            cluster.point.show = true;
            cluster.point.color = Cesium.Color.fromCssColorString('#0074D9').withAlpha(0.85);
            cluster.point.pixelSize = Math.max(22, Math.min(clusteredEntities.length * 2, 44));
            cluster.point.outlineColor = Cesium.Color.CYAN;
            cluster.point.outlineWidth = 2;
        });
        this.updateShipClusteringForCameraHeight();
        this.viewer.camera.changed.addEventListener(() => this.updateShipClusteringForCameraHeight());
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

    public async toggleShippingLanes(visible: boolean): Promise<void> {
        if (!this.shippingLanesDataSource) {
            this.shippingLanesDataSource = await Cesium.GeoJsonDataSource.load(`${import.meta.env.BASE_URL}data/shipping_lanes.geojson`, {
                stroke: Cesium.Color.CYAN.withAlpha(0.4),
                strokeWidth: 1.5,
                clampToGround: true,
            });
            this.viewer.dataSources.add(this.shippingLanesDataSource);

            for (const entity of this.shippingLanesDataSource.entities.values) {
                if (entity.polyline) {
                    entity.polyline.material = new Cesium.ColorMaterialProperty(Cesium.Color.CYAN.withAlpha(0.4));
                    entity.polyline.width = new Cesium.ConstantProperty(1.5);
                }
            }
        }

        this.shippingLanesDataSource.show = visible;
    }

    // ─── Système Ship temps réel avec LOD ────────────────────────

    /**
     * Rend les navires Ship avec le système multi-LOD.
     * Utilise distanceDisplayCondition de Cesium pour basculer
     * automatiquement entre points globaux et flèches 2D orientées.
     */
    public renderShipTraffic(ships: Map<string, Ship>, _lodLevel: LodLevel): void {
        const existingIds = new Set(this.shipDataSource.entities.values.map((e) => e.id));
        const activeIds = new Set<string>();

        for (const [mmsi, ship] of ships) {
            activeIds.add(mmsi);
            const position = Cesium.Cartesian3.fromDegrees(ship.longitude, ship.latitude);
            const billboardRotation = Cesium.Math.toRadians(-ship.trueHeading);
            const arrowImage = getArrowSvgDataUri(ship);
            const description = CesiumOceanoService.createShipDescription(ship);
            const existing = this.shipDataSource.entities.getById(mmsi);

            if (!existing) {
                this.shipDataSource.entities.add({
                    id: mmsi,
                    name: ship.name,
                    position,
                    description,
                    // LOD 1 – Points (vue globale, > 5 000 km)
                    point: new Cesium.PointGraphics({
                        pixelSize: 5,
                        color: Cesium.Color.CYAN.withAlpha(0.85),
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 1,
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(LOD_DIST_BILLBOARD, Number.MAX_VALUE),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                    // LOD 2 – Flèches 2D colorées par type de navire (0 – 5 000 km)
                    billboard: new Cesium.BillboardGraphics({
                        image: arrowImage,
                        scale: 0.38,
                        rotation: billboardRotation,
                        alignedAxis: Cesium.Cartesian3.ZERO,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                    label: new Cesium.LabelGraphics({
                        text: ship.name,
                        font: '11px sans-serif',
                        fillColor: Cesium.Color.CYAN,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        pixelOffset: new Cesium.Cartesian2(0, -18),
                        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1_500_000),
                        disableDepthTestDistance: Number.POSITIVE_INFINITY,
                    }),
                });
                continue;
            }

            // Mise à jour de l'entité existante
            existing.position = new Cesium.ConstantPositionProperty(position);
            existing.description = new Cesium.ConstantProperty(description);
            if (existing.billboard) {
                existing.billboard.rotation = new Cesium.ConstantProperty(billboardRotation);
                existing.billboard.image = new Cesium.ConstantProperty(arrowImage);
            }
        }

        // Purge des navires disparus du registre
        for (const id of existingIds) {
            if (!activeIds.has(id)) {
                this.shipDataSource.entities.removeById(id);
            }
        }
    }

    public clearShipTraffic(): void {
        this.shipDataSource.entities.removeAll();
    }

    /**
     * Écoute la hauteur caméra et appelle le callback à chaque changement.
     * Utilisé par la couche Presentation pour alimenter ManageShipTrafficUseCase.updateCameraHeight().
     */
    public onCameraHeightChange(callback: (heightMeters: number) => void): void {
        if (this.cameraHeightListenerId) {
            this.cameraHeightListenerId();
        }
        this.cameraHeightListenerId = this.viewer.camera.changed.addEventListener(() => {
            const height = this.viewer.camera.positionCartographic.height;
            callback(height);
        });
        // Émettre la valeur initiale
        callback(this.viewer.camera.positionCartographic.height);
    }

    private updateShipClusteringForCameraHeight(): void {
        const height = this.viewer.camera.positionCartographic.height;
        this.shipDataSource.clustering.enabled = height > LOD_DIST_BILLBOARD;
    }

    private static createShipDescription(ship: Ship): string {
        const navStatus = NAV_STATUS_LABELS[ship.navigationalStatus] ?? 'Inconnu';
        return `
            <div style="background:#07131f;color:#dffcff;border:1px solid #00d8ff;font-family:Arial,sans-serif;padding:14px;min-width:260px;">
                <div style="color:#00e5ff;font-weight:700;letter-spacing:1px;font-size:15px;margin-bottom:10px;">${ship.name}</div>
                <div style="display:grid;grid-template-columns:110px 1fr;gap:6px;font-size:13px;">
                    <span style="color:#6ddcff;">MMSI</span><strong>${ship.mmsi}</strong>
                    <span style="color:#6ddcff;">Statut Nav.</span><strong>${navStatus}</strong>
                    <span style="color:#6ddcff;">Type</span><strong>${ship.shipType}</strong>
                    <span style="color:#6ddcff;">SOG</span><strong>${ship.sog.toFixed(1)} nd</strong>
                    <span style="color:#6ddcff;">COG</span><strong>${ship.cog.toFixed(0)}°</strong>
                    <span style="color:#6ddcff;">Cap</span><strong>${ship.trueHeading.toFixed(0)}°</strong>
                </div>
            </div>
        `;
    }
}

// ─── Constantes LOD ──────────────────────────────────────────────

/** Seuil de distance caméra au-delà duquel on affiche des points simples (mètres) */
const LOD_DIST_BILLBOARD = 5_000_000;

// ─── Labels des statuts de navigation IMO ────────────────────────

const NAV_STATUS_LABELS: Record<number, string> = {
    0: 'En route (moteur)',
    1: 'Au mouillage',
    2: 'Non commandé',
    3: 'Manoeuvrabilité restreinte',
    4: 'Contraint par tirant d\'eau',
    5: 'Amarré',
    6: 'Échoué',
    7: 'En pêche',
    8: 'En route (voile)',
    14: 'AIS-SART',
    15: 'Non défini',
};
