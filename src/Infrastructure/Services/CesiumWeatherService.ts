import * as Cesium from 'cesium';
import { WeatherLayerType } from '../../Domain';

const WEATHER_LAYER_ALPHA = 0.6;
const RAINVIEWER_RADAR_URL = 'https://tilecache.rainviewer.com/v2/radar/1715000000/256/{z}/{x}/{y}/2/1_1.png';
const IEM_CLOUD_WMS_URL = 'https://mesonet.agron.iastate.edu/cgi-bin/wms/goes/conus_ir.cgi?';

export class CesiumWeatherService {
  private activeLayer: Cesium.ImageryLayer | null = null;

  constructor(private readonly viewer: Cesium.Viewer) {}

  public setActiveLayer(layerType: WeatherLayerType): void {
    this.clearActiveLayer();

    if (layerType === WeatherLayerType.None) {
      return;
    }

    if (
      layerType === WeatherLayerType.Wind ||
      layerType === WeatherLayerType.Temperature ||
      layerType === WeatherLayerType.Pressure
    ) {
      console.warn('Couche non disponible gratuitement en tuiles image.');
      return;
    }

    const provider = this.createProvider(layerType);
    if (!provider) {
      return;
    }

    this.activeLayer = this.viewer.imageryLayers.addImageryProvider(provider);
    this.activeLayer.alpha = WEATHER_LAYER_ALPHA;
  }

  public clearActiveLayer(): void {
    if (!this.activeLayer) {
      return;
    }

    this.viewer.imageryLayers.remove(this.activeLayer, true);
    this.activeLayer = null;
  }

  private createProvider(layerType: WeatherLayerType): Cesium.ImageryProvider | null {
    if (layerType === WeatherLayerType.Rain) {
      return new Cesium.UrlTemplateImageryProvider({
        url: RAINVIEWER_RADAR_URL,
        credit: 'RainViewer',
        minimumLevel: 0,
        maximumLevel: 10,
      });
    }

    if (layerType === WeatherLayerType.CloudCover) {
      return new Cesium.WebMapServiceImageryProvider({
        url: IEM_CLOUD_WMS_URL,
        layers: 'goes_conus_ir',
        parameters: {
          transparent: 'true',
          format: 'image/png',
        },
        credit: 'Iowa Environmental Mesonet',
      });
    }

    return null;
  }
}
