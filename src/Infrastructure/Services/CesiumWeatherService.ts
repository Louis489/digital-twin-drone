import * as Cesium from 'cesium';
import { WeatherLayerType } from '../../Domain/Entities/WeatherLayer';

export class CesiumWeatherService {
    private viewer: Cesium.Viewer;
    private currentWeatherLayer: Cesium.ImageryLayer | null = null;
    private weatherDataSource: Cesium.CustomDataSource;
    private cameraMoveListener: (() => void) | null = null;
    private currentActiveLayer: WeatherLayerType = WeatherLayerType.None;

    // Mapping des types vers les noms de couches OpenWeatherMap
    private owmLayerNames: Record<WeatherLayerType, string | null> = {
        [WeatherLayerType.None]: null,
        [WeatherLayerType.Wind]: 'wind_new',
        [WeatherLayerType.Temperature]: 'temp_new',
        [WeatherLayerType.CloudCover]: 'clouds_new',
        [WeatherLayerType.Rain]: 'precipitation_new',
        [WeatherLayerType.Pressure]: 'pressure_new'
    };

    constructor(viewer: Cesium.Viewer) {
        this.viewer = viewer;
        this.weatherDataSource = new Cesium.CustomDataSource('weather-data');
        this.viewer.dataSources.add(this.weatherDataSource);
    }

    public async setActiveLayer(layerType: WeatherLayerType, apiKey: string): Promise<void> {
        this.currentActiveLayer = layerType;
        
        // 1. Nettoyage de la couche précédente et des entités
        if (this.currentWeatherLayer) {
            this.viewer.imageryLayers.remove(this.currentWeatherLayer);
            this.currentWeatherLayer = null;
        }
        this.weatherDataSource.entities.removeAll();

        if (this.cameraMoveListener) {
            this.viewer.camera.moveEnd.removeEventListener(this.cameraMoveListener);
            this.cameraMoveListener = null;
        }

        // 2. Arrêt si 'None' ou si aucune clé n'est fournie
        if (layerType === WeatherLayerType.None || !apiKey) {
            return;
        }

        const owmLayer = this.owmLayerNames[layerType];
        if (owmLayer) {
            // 3. Création du fournisseur de tuiles OpenWeatherMap
            const weatherProvider = new Cesium.UrlTemplateImageryProvider({
                url: `https://tile.openweathermap.org/map/${owmLayer}/{z}/{x}/{y}.png?appid=${apiKey}`,
                maximumLevel: 10,
                credit: 'Weather data © OpenWeatherMap'
            });

            // 4. Ajout à Cesium avec une légère transparence pour voir la mer
            this.currentWeatherLayer = this.viewer.imageryLayers.addImageryProvider(weatherProvider);
            this.currentWeatherLayer.alpha = 0.45;
        }

        // 5. Activer la grille vectorielle Open-Meteo pour la précision des données par-dessus
        this.cameraMoveListener = () => {
            if (this.currentActiveLayer !== WeatherLayerType.None) {
                this.fetchAndDrawOpenMeteoGrid();
            }
        };
        this.viewer.camera.moveEnd.addEventListener(this.cameraMoveListener);
        
        // Premier appel immédiat
        this.fetchAndDrawOpenMeteoGrid();
    }

        private async fetchAndDrawOpenMeteoGrid() {
        const layerType = this.currentActiveLayer;
        if (layerType === WeatherLayerType.None) return;

        const camera = this.viewer.camera;
        const height = camera.positionCartographic.height;

        let rect = camera.computeViewRectangle();
        if (!rect) return;

        const west = Cesium.Math.toDegrees(rect.west);
        const south = Cesium.Math.toDegrees(rect.south);
        const east = Cesium.Math.toDegrees(rect.east);
        const north = Cesium.Math.toDegrees(rect.north);

        // Génération d'une grille de points dynamique : Grille 14x14 pour le vent (196 flèches pour l'effet nuage), 8x8 pour les autres
        const gridSteps = layerType === WeatherLayerType.Wind ? 14 : 8;
        const latStep = (north - south) / gridSteps;
        const lonStep = (east - west) / gridSteps;

        const lats: number[] = [];
        const lons: number[] = [];

        for (let i = 1; i <= gridSteps; i++) {
            for (let j = 1; j <= gridSteps; j++) {
                const lat = south + (i * latStep) - (latStep / 2);
                const lon = west + (j * lonStep) - (lonStep / 2);
                // Limites de la carte
                if (lat > -85 && lat < 85) {
                    lats.push(Number(lat.toFixed(2)));
                    lons.push(Number(lon.toFixed(2)));
                }
            }
        }

        if (lats.length === 0) return;

        // Ajustement de la taille de l'UI en fonction de l'altitude : flèches plus compactes pour le vent
        const isWind = layerType === WeatherLayerType.Wind;
        const arrowSize = isWind
            ? (height > 5000000 ? 20 : height > 1000000 ? 16 : 14)
            : (height > 5000000 ? 32 : height > 1000000 ? 26 : 22);
        const labelSize = height > 5000000 ? 16 : height > 1000000 ? 14 : 12;

        try {
            // Open-Meteo API (Gratuit, Batch request, Pas de clé requise)
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation`;
            const response = await fetch(url);
            const data = await response.json();

            this.weatherDataSource.entities.removeAll();

            // L'API renvoie un objet si 1 point, ou un array si plusieurs points
            const results = Array.isArray(data) ? data : [data];

            results.forEach((res: any, index: number) => {
                if (!res.current) return;
                
                const lat = lats[index];
                const lon = lons[index];
                const position = Cesium.Cartesian3.fromDegrees(lon, lat, height > 5000000 ? 50000 : 1000);

                if (layerType === WeatherLayerType.Temperature) {
                    this.weatherDataSource.entities.add({
                        position,
                        label: {
                            text: `${Math.round(res.current.temperature_2m)}°C`,
                            font: `bold ${labelSize}px sans-serif`,
                            fillColor: Cesium.Color.WHITE,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 3,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        }
                    });
                } else if (layerType === WeatherLayerType.Wind) {
                    // Conversion km/h vers m/s
                    const speedMs = Math.round(res.current.wind_speed_10m / 3.6);
                    const colorHex = speedMs > 15 ? '#ff0000' : speedMs > 8 ? '#ff8800' : '#00ff00';
                    
                    // Création d'un canvas pour le Billboard directionnel afin de supporter la rotation nativement dans Cesium (Label ne la supportant pas)
                    const canvas = document.createElement('canvas');
                    canvas.width = 32;
                    canvas.height = 32;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.fillStyle = colorHex;
                        ctx.beginPath();
                        ctx.moveTo(16, 0);   // Pointe
                        ctx.lineTo(32, 28);  // Bas droit
                        ctx.lineTo(16, 20);  // Creux
                        ctx.lineTo(0, 28);   // Bas gauche
                        ctx.closePath();
                        ctx.fill();
                        ctx.strokeStyle = '#000000';
                        ctx.lineWidth = 2;
                        ctx.stroke();
                    }

                    this.weatherDataSource.entities.add({
                        position,
                        billboard: {
                            image: canvas,
                            // Direction météo : d'où vient le vent (0 = Nord). On ajuste pour Cesium (qui pointe vers le haut à 0 rad par défaut).
                            rotation: Cesium.Math.toRadians(-res.current.wind_direction_10m + 180), 
                            width: arrowSize,
                            height: arrowSize
                        }
                    });

                    // N'affiche le texte de vitesse du vent que si la caméra est assez proche pour ne pas polluer le nuage de flèches
                    if (height < 3000000) {
                        this.weatherDataSource.entities.add({
                            position,
                            label: {
                                text: `${speedMs} m/s`,
                                font: `${labelSize - 3}px monospace`,
                                fillColor: Cesium.Color.WHITE,
                                outlineColor: Cesium.Color.BLACK,
                                outlineWidth: 1.5,
                                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                                pixelOffset: new Cesium.Cartesian2(0, arrowSize / 1.5)
                            }
                        });
                    }
                } else if (layerType === WeatherLayerType.Pressure) {
                    this.weatherDataSource.entities.add({
                        position,
                        label: {
                            text: `${Math.round(res.current.surface_pressure)} hPa`,
                            font: `bold ${labelSize}px monospace`,
                            fillColor: Cesium.Color.CYAN,
                            outlineColor: Cesium.Color.BLACK,
                            outlineWidth: 2,
                            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        }
                    });
                }
            });

        } catch (e) {
            console.error("Erreur récupération données Open-Meteo :", e);
        }
    }
}
