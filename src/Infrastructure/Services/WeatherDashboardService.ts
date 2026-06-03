/**
 * @file WeatherDashboardService.ts
 * @description Service de gestion du Dashboard Météo 2D avec Leaflet.
 * Affiche une carte planisphère interactive avec fond sombre pour visualiser les données météo.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-velocity';
import 'leaflet-velocity/dist/leaflet-velocity.css';
import { OilSimulationService } from './OilSimulationService';

/**
 * @class WeatherDashboardService
 * @description Service singleton pour gérer le Dashboard Météo 2D.
 * Architecture modulaire préparée pour recevoir de futures couches météo (vent, pluie, température).
 */
export class WeatherDashboardService {
  private map: L.Map | null = null;
  private containerId: string = 'weather-map-container';
  private baseLayer: L.TileLayer | null = null;
  private resizeHandler: (() => void) | null = null;
  private tempLayer: L.TileLayer | null = null;
  private windVelocityLayer: any = null;
  private oilSimulationService: OilSimulationService | null = null;
  private isPlacingSpill: boolean = false;
  
  // Clé API OpenWeatherMap (remplacer par votre clé)
  private readonly OWM_API_KEY: string = 'fd16f027e40a338c7170fc95480c604e';

  /**
   * @constructor
   * Initialise le service sans créer la carte immédiatement.
   */
  constructor() {
    console.log('[WeatherDashboard] Service initialized');
  }

  /**
   * @method initMap
   * @public
   * Initialise la carte Leaflet avec un fond sombre CartoDB Dark Matter.
   * Centré sur l'Atlantique/Europe pour une vue globale.
   */
  public initMap(): void {
    if (this.map) {
      console.warn('[WeatherDashboard] Map already initialized');
      return;
    }

    const container = document.getElementById(this.containerId);
    if (!container) {
      console.error(`[WeatherDashboard] Container #${this.containerId} not found`);
      return;
    }

    // Définir les limites strictes du monde
    const worldBounds = L.latLngBounds([-90, -180], [90, 180]);

    // Initialiser la carte avec physique élastique optimale
    this.map = L.map(this.containerId, {
      center: [45.0, -15.0], // Atlantique Nord
      zoom: 4,
      zoomControl: false, // Désactiver le contrôle par défaut
      attributionControl: false,
      maxBounds: worldBounds, // Limites strictes du monde
      maxBoundsViscosity: 0.8, // 0.8 donne un bel effet élastique sur les bords
      minZoom: 2, // Dézoom libre jusqu'aux bords physiques du monde
      bounceAtZoomLimits: true, // Rebond aux limites de zoom
    });

    // Ajouter le fond de carte sombre CartoDB Dark Matter
    this.baseLayer = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        noWrap: true, // Empêcher la répétition du monde
        bounds: L.latLngBounds([-90, -180], [90, 180]), // Empêcher les requêtes hors-limites
      }
    );

    this.baseLayer.addTo(this.map);

    // ─── COUCHES MÉTÉO ───
    
    // Couche Température (OpenWeatherMap)
    this.tempLayer = L.tileLayer(
      `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${this.OWM_API_KEY}`,
      {
        attribution: 'Température &copy; <a href="https://openweathermap.org">OpenWeatherMap</a>',
        opacity: 0.6,
        maxNativeZoom: 18,
      }
    );

    // Couche Vent Dynamique sera chargée de manière asynchrone (voir plus bas)

    // ─── MENU CUSTOM (remplacement du Layer Control natif) ───
    this.setupCustomLayerMenu();
    
    // ─── INITIALISATION DU SIMULATEUR DE MARÉE NOIRE ───
    this.oilSimulationService = new OilSimulationService();
    this.oilSimulationService.init(this.map);
    console.log('[WeatherDashboard] Oil simulation service initialized');
    
    // ─── CRÉATION DE LA LÉGENDE ÉPAISSEUR PÉTROLE ───
    this.createOilSpillLegend();

    // Ajouter le contrôle de zoom en bas à gauche
    L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

    // Correctif de timing crucial : attendre que le conteneur ait sa taille finale
    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        
        // 1. On cadre la carte sur l'écran pour calculer le minZoom
        this.map.fitBounds(worldBounds);
        
        // 2. On récupère le zoom parfait calculé pour CET écran spécifique
        const screenPerfectZoom = this.map.getZoom();
        
        // 3. On verrouille le dézoom pour empêcher la carte de rétrécir davantage
        this.map.setMinZoom(screenPerfectZoom);
        
        // 4. Vue d'accueil : zoom automatique entre France et USA (Atlantique)
        const franceUSABounds = L.latLngBounds(
          [25, -100],  // Sud-Ouest (Sud USA)
          [55, 10]     // Nord-Est (Nord France)
        );
        this.map.fitBounds(franceUSABounds, { animate: true, duration: 1.5 });
      }
    }, 300);

    // Gérer le redimensionnement de la fenêtre
    this.resizeHandler = () => {
      if (this.map) {
        this.map.invalidateSize();
        this.map.fitBounds(worldBounds);
        
        // Recalculer le minZoom pour le nouvel écran
        const newScreenPerfectZoom = this.map.getZoom();
        this.map.setMinZoom(newScreenPerfectZoom);
      }
    };

    window.addEventListener('resize', this.resizeHandler);

    // ─── CHARGEMENT ASYNCHRONE DES DONNÉES DE VENT ───
    
    // Chargement asynchrone des données de vent
    fetch('https://raw.githubusercontent.com/danwild/leaflet-velocity/master/demo/wind-global.json')
      .then(response => response.json())
      .then(data => {
        this.windVelocityLayer = (L as any).velocityLayer({
          displayValues: true,
          displayOptions: {
            velocityType: 'Vent Global',
            displayPosition: 'bottomleft',
            displayEmptyString: 'Pas de données'
          },
          data: data,
          maxVelocity: 15,
          // Optimisations visuelles et de performance :
          velocityScale: 0.01,       // Vitesse de déplacement des particules (ajustable)
          particleAge: 90,           // Durée de vie d'une particule avant de disparaître (fluidifie le rendu)
          lineWidth: 1.5,            // Épaisseur des lignes pour un effet plus premium
          particleMultiplier: 1/800, // Augmente la densité des particules pour masquer les vides
          colorScale: [
            '#2b83ba', '#abdda4', '#ffffbf', '#fdae61', '#d7191c' // Palette météo pro (Bleu -> Rouge)
          ]
        });
        
        // La couche de vent est maintenant disponible pour le menu custom
        console.log('[WeatherDashboard] Wind layer loaded successfully');
      })
      .catch(err => console.error('[WeatherDashboard] Erreur chargement vent:', err));

    // ─── INTERACTION AU CLIC (Données météo en temps réel) ───
    this.setupWeatherClickHandler();

    console.log('[WeatherDashboard] Map initialized successfully');
  }

  /**
   * @method setupCustomLayerMenu
   * @private
   * Configure le menu custom pour activer/désactiver les couches météo.
   */
  private setupCustomLayerMenu(): void {
    const tempCheckbox = document.getElementById('toggle-temp-layer') as HTMLInputElement;
    const windCheckbox = document.getElementById('toggle-wind-layer') as HTMLInputElement;
    const menuContainer = document.getElementById('weather-layers-menu');

    if (!tempCheckbox || !windCheckbox) {
      console.warn('[WeatherDashboard] Checkboxes not found');
      return;
    }
    
    // Bloquer la propagation des événements sur le menu pour éviter les interférences avec la carte
    if (menuContainer && this.map) {
      L.DomEvent.disableClickPropagation(menuContainer);
      L.DomEvent.disableScrollPropagation(menuContainer);
      console.log('[WeatherDashboard] Event propagation disabled on menu container');
    }

    // Gestion de la couche Température
    tempCheckbox.addEventListener('change', () => {
      if (!this.map || !this.tempLayer) return;
      
      if (tempCheckbox.checked) {
        this.map.addLayer(this.tempLayer);
        console.log('[WeatherDashboard] Temperature layer enabled');
      } else {
        this.map.removeLayer(this.tempLayer);
        console.log('[WeatherDashboard] Temperature layer disabled');
      }
    });

    // Gestion de la couche Vent (sera disponible après chargement asynchrone)
    windCheckbox.addEventListener('change', () => {
      if (!this.map || !this.windVelocityLayer) {
        console.warn('[WeatherDashboard] Wind layer not loaded yet');
        return;
      }
      
      if (windCheckbox.checked) {
        this.map.addLayer(this.windVelocityLayer);
        console.log('[WeatherDashboard] Wind layer enabled');
      } else {
        this.map.removeLayer(this.windVelocityLayer);
        console.log('[WeatherDashboard] Wind layer disabled');
      }
    });

    console.log('[WeatherDashboard] Custom layer menu configured');
    
    // Configuration du bouton de simulation de marée noire
    this.setupOilSpillButton();
  }

  /**
   * @method setupOilSpillButton
   * @private
   * @description Configure le bouton "⚠️ Simuler Marée Noire" et le mode écoute.
   */
  private setupOilSpillButton(): void {
    const btn = document.getElementById('btn-simulate-spill');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();

      // CAS 1 : Une simulation est déjà en cours ou le mode est actif -> ON ARRÊTE TOUT
      if (this.isPlacingSpill || (this.oilSimulationService && this.oilSimulationService.getParticleCount() > 0)) {
        this.isPlacingSpill = false;
        if (this.oilSimulationService) this.oilSimulationService.clear();

        // Reset total de l'UI
        btn.innerHTML = '<span>⚠️</span> Simuler Marée Noire';
        btn.style.borderColor = 'rgba(139, 69, 19, 0.6)';
        btn.style.background = 'linear-gradient(135deg, rgba(139, 69, 19, 0.3), rgba(160, 82, 45, 0.2))';
        document.getElementById('weather-map-container')!.style.cursor = 'default';
        const legend = document.getElementById('oil-legend');
        if (legend) legend.style.display = 'none';
        return;
      }

      // CAS 2 : Aucune simulation -> ON ARME LE CLIC
      this.isPlacingSpill = true;
      btn.innerHTML = '📍 Cliquez sur l\'océan...';
      btn.style.borderColor = '#00d2ff';
      btn.style.background = 'rgba(0, 210, 255, 0.1)';
      document.getElementById('weather-map-container')!.style.cursor = 'crosshair';
    });
  }

  /**
   * @method createOilSpillLegend
   * @private
   * @description Crée la légende d'épaisseur de pétrole dans le menu HTML.
   */
  private createOilSpillLegend(): void {
    // Récupérer le conteneur du menu weather-controls
    const weatherMenu = document.getElementById('weather-layers-menu');
    if (!weatherMenu) {
      console.warn('[WeatherDashboard] Weather menu not found, legend not created');
      return;
    }
    
    // Créer la légende
    const legendHTML = `
      <div id="oil-legend" style="
        display: none;
        margin-top: 15px;
        padding-top: 15px;
        border-top: 1px solid rgba(0, 210, 255, 0.3);
      ">
        <!-- Titre -->
        <div style="
          font-size: 11px;
          font-weight: 700;
          color: #00d2ff;
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-align: center;
        ">🛢️ Épaisseur Pétrole</div>
        
        <!-- Échelle de couleurs -->
        <div style="
          display: flex;
          align-items: stretch;
          height: 100px;
          margin-bottom: 15px;
        ">
          <!-- Barre dégradé -->
          <div style="
            width: 18px;
            height: 100%;
            background: linear-gradient(to top, 
              rgb(189, 0, 38) 0%,
              rgb(240, 59, 32) 20%,
              rgb(253, 141, 60) 40%,
              rgb(254, 178, 76) 60%,
              rgb(254, 217, 118) 80%,
              rgb(255, 255, 178) 100%
            );
            border-radius: 4px;
            margin-right: 10px;
          "></div>
          
          <!-- Labels -->
          <div style="
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            font-size: 9px;
            line-height: 1.1;
            flex: 1;
          ">
            <div><span style="color: #ffffb2; font-weight: 600;">< 1µm</span> <span style="color: rgba(255,255,255,0.7);">Sheen</span></div>
            <div><span style="color: #fed976; font-weight: 600;">1-5µm</span> <span style="color: rgba(255,255,255,0.7);">Irisé</span></div>
            <div><span style="color: #fd8d3c; font-weight: 600;">5-10µm</span> <span style="color: rgba(255,255,255,0.7);">Métallique</span></div>
            <div><span style="color: #bd0026; font-weight: 600;">> 10µm</span> <span style="color: rgba(255,255,255,0.7);">Épais</span></div>
          </div>
        </div>
        
        <!-- Contrôle du temps -->
        <div style="
          border-top: 1px solid rgba(0, 210, 255, 0.2);
          padding-top: 12px;
          margin-top: 10px;
        ">
          <div style="
            font-size: 10px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.8);
            margin-bottom: 8px;
            text-align: center;
          ">⏱️ Contrôle du Temps</div>
          
          <div style="
            display: flex;
            gap: 8px;
            justify-content: center;
          ">
            <button id="speed-x1" style="
              background: linear-gradient(135deg, #00d2ff, #0088cc);
              border: none;
              border-radius: 6px;
              color: white;
              padding: 6px 12px;
              font-size: 11px;
              font-weight: 700;
              cursor: pointer;
              box-shadow: 0 2px 8px rgba(0, 210, 255, 0.3);
            ">x1</button>
            <button id="speed-x5" style="
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(0, 210, 255, 0.5);
              border-radius: 6px;
              color: white;
              padding: 6px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">x5</button>
            <button id="speed-x10" style="
              background: rgba(255, 255, 255, 0.1);
              border: 1px solid rgba(0, 210, 255, 0.5);
              border-radius: 6px;
              color: white;
              padding: 6px 12px;
              font-size: 11px;
              font-weight: 600;
              cursor: pointer;
            ">x10</button>
          </div>
        </div>
        
        <!-- Status -->
        <div id="oil-status" style="
          font-size: 9px;
          color: rgba(255, 255, 255, 0.5);
          margin-top: 10px;
          text-align: center;
          font-style: italic;
        ">Simulation active</div>
      </div>
    `;
    
    // Injecter après le dernier enfant du menu
    weatherMenu.insertAdjacentHTML('beforeend', legendHTML);
    
    // Câbler les boutons de vitesse
    this.setupSpeedControls();
    
    console.log('[WeatherDashboard] Oil spill legend created in menu');
  }
  
  /**
   * @method setupSpeedControls
   * @private
   * @description Configure les boutons de contrôle de vitesse du temps.
   */
  private setupSpeedControls(): void {
    const btnX1 = document.getElementById('speed-x1');
    const btnX5 = document.getElementById('speed-x5');
    const btnX10 = document.getElementById('speed-x10');
    
    if (!btnX1 || !btnX5 || !btnX10 || !this.oilSimulationService) return;
    
    const updateButtonStyles = (activeSpeed: number) => {
      [btnX1, btnX5, btnX10].forEach((btn, idx) => {
        const speed = [1, 5, 10][idx];
        const isActive = speed === activeSpeed;
        
        btn.style.background = isActive 
          ? 'linear-gradient(135deg, #00d2ff, #0088cc)'
          : 'rgba(255, 255, 255, 0.1)';
        btn.style.border = isActive ? 'none' : '1px solid rgba(0, 210, 255, 0.5)';
        btn.style.boxShadow = isActive ? '0 2px 8px rgba(0, 210, 255, 0.3)' : 'none';
        btn.style.fontWeight = isActive ? '700' : '600';
      });
    };
    
    btnX1.addEventListener('click', () => {
      this.oilSimulationService!.timeMultiplier = 1;
      updateButtonStyles(1);
      console.log('[WeatherDashboard] Speed set to x1');
    });
    
    btnX5.addEventListener('click', () => {
      this.oilSimulationService!.timeMultiplier = 5;
      updateButtonStyles(5);
      console.log('[WeatherDashboard] Speed set to x5');
    });
    
    btnX10.addEventListener('click', () => {
      this.oilSimulationService!.timeMultiplier = 10;
      updateButtonStyles(10);
      console.log('[WeatherDashboard] Speed set to x10');
    });
  }

  /**
   * @method setupWeatherClickHandler
   * @private
   * Configure l'interaction au clic pour afficher les données météo en temps réel.
   */
  private setupWeatherClickHandler(): void {
    if (!this.map) return;

    this.map.on('click', async (e: L.LeafletMouseEvent) => {
      // Mode Marée Noire : placer la flaque
      if (this.isPlacingSpill) {
        if (this.oilSimulationService) {
          this.oilSimulationService.spawnSpill(e.latlng.lat, e.latlng.lng);
        }
        this.isPlacingSpill = false; // On a fini de placer

        // Mise à jour de l'UI en mode "En cours"
        document.getElementById('weather-map-container')!.style.cursor = 'default';
        const btn = document.getElementById('btn-simulate-spill');
        if (btn) {
          btn.innerHTML = '🛑 Arrêter la simulation';
          btn.style.borderColor = '#ff4444';
          btn.style.background = 'rgba(255, 0, 0, 0.2)';
        }
        const legend = document.getElementById('oil-legend');
        if (legend) legend.style.display = 'block';

        return; // Bloque l'API météo
      }
      
      const { lat, lng } = e.latlng;
      
      try {
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${this.OWM_API_KEY}&units=metric&lang=fr`
        );
        
        if (!response.ok) {
          throw new Error('Erreur API OpenWeatherMap');
        }
        
        const data = await response.json();
        
        // Vérifier si la couche de vent est activée
        const windCheckbox = document.getElementById('toggle-wind-layer') as HTMLInputElement;
        const showWind = windCheckbox && windCheckbox.checked;
        
        // Formater le contenu du popup
        const popupContent = `
          <div style="min-width: 220px;">
            <div style="font-size: 16px; font-weight: 700; color: #00d2ff; margin-bottom: 10px; border-bottom: 1px solid rgba(0, 210, 255, 0.3); padding-bottom: 6px;">
              📍 ${data.name || 'Position'}
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.8;">🌡️ Température:</span>
                <span style="font-weight: 600; color: #00e5ff;">${data.main.temp.toFixed(1)}°C</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.8;">💧 Humidité:</span>
                <span style="font-weight: 600; color: #00e5ff;">${data.main.humidity}%</span>
              </div>
              ${showWind ? `
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.8;">💨 Vent:</span>
                <span style="font-weight: 600; color: #00e5ff;">${data.wind.speed.toFixed(1)} m/s</span>
              </div>
              ` : ''}
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.8;">🌤️ Conditions:</span>
                <span style="font-weight: 600; color: #00e5ff;">${data.weather[0].description}</span>
              </div>
              <div style="display: flex; justify-content: space-between;">
                <span style="opacity: 0.8;">🔽 Pression:</span>
                <span style="font-weight: 600; color: #00e5ff;">${data.main.pressure} hPa</span>
              </div>
            </div>
          </div>
        `;
        
        if (this.map) {
          L.popup()
            .setLatLng(e.latlng)
            .setContent(popupContent)
            .openOn(this.map);
        }
        
        console.log('[WeatherDashboard] Weather data displayed:', data.name);
      } catch (error) {
        console.error('[WeatherDashboard] Error fetching weather data:', error);
        
        if (this.map) {
          L.popup()
            .setLatLng(e.latlng)
            .setContent('<div style="color: #ff6b6b;">❌ Erreur de récupération des données météo</div>')
            .openOn(this.map);
        }
      }
    });

    console.log('[WeatherDashboard] Weather click handler configured');
  }

  /**
   * @method show
   * @public
   * Affiche le conteneur de la carte météo.
   */
  public show(): void {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'block';
      console.log('[WeatherDashboard] Container shown');
    }
  }

  /**
   * @method hide
   * @public
   * Masque le conteneur de la carte météo.
   */
  public hide(): void {
    const container = document.getElementById(this.containerId);
    if (container) {
      container.style.display = 'none';
      console.log('[WeatherDashboard] Container hidden');
    }
  }

  /**
   * @method destroyMap
   * @public
   * Détruit l'instance de la carte Leaflet et libère la mémoire.
   */
  public destroyMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.baseLayer = null;
      this.tempLayer = null;
      this.windVelocityLayer = null;
    }
    
    // Nettoyer le service de simulation de marée noire
    if (this.oilSimulationService) {
      this.oilSimulationService.destroy();
      this.oilSimulationService = null;
    }
    
    // Réinitialiser le flag d'état
    this.isPlacingSpill = false;
    
    // Cacher la légende
    const legend = document.getElementById('oil-legend');
    if (legend) legend.style.display = 'none';

    // Nettoyer le listener de resize
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    console.log('[WeatherDashboard] Map destroyed');
  }

  /**
   * @method getMap
   * @public
   * Retourne l'instance de la carte Leaflet (pour ajouter des couches météo ultérieurement).
   * @returns Instance de la carte ou null
   */
  public getMap(): L.Map | null {
    return this.map;
  }

  /**
   * @method addWeatherLayer
   * @public
   * Méthode préparée pour ajouter des couches météo (vent, pluie, température).
   * @param layerType - Type de couche météo à ajouter
   * @param layerUrl - URL du TileLayer météo
   */
  public addWeatherLayer(layerType: string, layerUrl: string): void {
    if (!this.map) {
      console.warn('[WeatherDashboard] Cannot add layer: map not initialized');
      return;
    }

    const weatherLayer = L.tileLayer(layerUrl, {
      attribution: `Weather Layer: ${layerType}`,
      opacity: 0.6,
    });

    weatherLayer.addTo(this.map);
    console.log(`[WeatherDashboard] Weather layer '${layerType}' added`);
  }

  /**
   * @method dispose
   * @public
   * Nettoie complètement le service et libère les ressources.
   */
  public dispose(): void {
    this.destroyMap();
    console.log('[WeatherDashboard] Service disposed');
  }
}
