/**
 * @file OilSimulationService.ts
 * @description Service de simulation de marée noire basé sur l'advection de particules avec deck.gl.
 * Superpose des milliers de particules haute-performance sur la carte Leaflet.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import { Deck } from '@deck.gl/core';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import { LeafletLayer } from "deck.gl-leaflet";
import * as L from 'leaflet';
import * as turf from '@turf/turf';

/**
 * @interface OilParticle
 * @description Structure d'une particule de pétrole avec épaisseur
 */
interface OilParticle {
  position: [number, number]; // [lng, lat]
  color: [number, number, number, number]; // [R, G, B, A]
  thickness: number; // Épaisseur/masse de la particule (µm équivalent)
  driftX: number; // Force de dérive horizontale unique
  driftY: number; // Force de dérive verticale unique
  isBeached: boolean; // True si la particule s'est échouée sur la côte
}

/**
 * @class OilSimulationService
 * @description Service singleton pour gérer la simulation de marée noire.
 * Utilise deck.gl pour un rendu haute-performance de milliers de particules.
 */
export class OilSimulationService {
  private map: L.Map | null = null;
  private particles: OilParticle[] = [];
  private deckLayer: LeafletLayer | null = null;
  private isInitialized: boolean = false;
  private animationFrameId: number | null = null;
  private frameCount: number = 0;
  public timeMultiplier: number = 1;
  private landPolygons: any = null; // Données GeoJSON des côtes

  /**
   * @constructor
   * Initialise le service de simulation.
   */
  constructor() {
    console.log('[OilSimulation] Service initialized');
  }

  /**
   * @method init
   * @public
   * @param {L.Map} map - Instance de la carte Leaflet
   * @description Initialise le service avec l'instance de carte Leaflet.
   */
  public init(map: L.Map): void {
    this.map = map;
    this.isInitialized = true;
    
    // Chargement des données terrestres pour la détection de collision
    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(res => res.json())
      .then(data => {
        this.landPolygons = data;
        console.log('[OilSimulation] Coastal collision data loaded');
      })
      .catch(err => console.error('Error loading land data:', err));
    
    console.log('[OilSimulation] Connected to Leaflet map');
  }

  /**
   * @method spawnSpill
   * @public
   * @param {number} lat - Latitude de la fuite
   * @param {number} lng - Longitude de la fuite
   * @description Génère 1000 particules de pétrole autour des coordonnées fournies.
   * Simule une flaque d'environ 500 mètres de rayon.
   */
  public spawnSpill(lat: number, lng: number): void {
    if (!this.isInitialized) {
      console.error('[OilSimulation] Service not initialized. Call init() first.');
      return;
    }

    // FORCER le nettoyage de toute simulation précédente (évite les fuites mémoire)
    this.clear();

    console.log(`[OilSimulation] Spawning oil spill at [${lat}, ${lng}]`);

    // Générer 300 particules seulement (optimisation extrême, zéro lag)
    const newParticles: OilParticle[] = [];
    const particleCount = 300;
    const spreadRadius = 0.05; // ~5.5km en degrés

    for (let i = 0; i < particleCount; i++) {
      // Distribution aléatoire avec bias vers le centre pour un effet plus réaliste
      const randomAngle = Math.random() * 2 * Math.PI;
      const randomRadius = Math.random() * spreadRadius;
      
      // Conversion polaire -> cartésienne avec correction latitude
      const deltaLng = randomRadius * Math.cos(randomAngle) / Math.cos(lat * Math.PI / 180);
      const deltaLat = randomRadius * Math.sin(randomAngle);
      
      const particleLng = lng + deltaLng;
      const particleLat = lat + deltaLat;

      // Couleur noire/brune avec variation légère d'opacité pour la texture
      const alpha = 180 + Math.floor(Math.random() * 75); // 180-255
      
      // Épaisseur initiale entre 10 et 15 (cœur massif de la fuite)
      const thickness = 10 + Math.random() * 5;
      
      // Force d'étalement unique pour chaque particule (drift individuel)
      // Math.pow pour garder un cœur dense et des bords qui s'échappent
      const driftForce = Math.pow(Math.random(), 2) * 0.003;
      const driftAngle = Math.random() * 2 * Math.PI;
      const pDriftX = Math.cos(driftAngle) * driftForce;
      const pDriftY = Math.sin(driftAngle) * driftForce;
      
      newParticles.push({
        position: [particleLng, particleLat],
        color: [30, 30, 30, alpha],
        thickness: thickness,
        driftX: pDriftX,
        driftY: pDriftY,
        isBeached: false
      });
    }

    // Ajouter les nouvelles particules au tableau existant
    this.particles = [...this.particles, ...newParticles];

    console.log(`[OilSimulation] Generated ${particleCount} particles. Total: ${this.particles.length}`);

    // Rendre la couche deck.gl
    this.renderDeckLayer();
    
    // Lancer l'animation si elle n'est pas déjà en cours
    if (!this.animationFrameId) {
      this.animate();
    }
  }

  /**
   * @method renderDeckLayer
   * @private
   * @description Intègre deck.gl avec Leaflet via LeafletLayer et ScatterplotLayer.
   * Met à jour la couche si elle existe déjà, sinon l'ajoute à la carte.
   */
  private renderDeckLayer(): void {
    if (!this.map) {
      console.error('[OilSimulation] Map not available');
      return;
    }

    // Créer le HeatmapLayer pour un rendu de nappe lisse et réaliste
    const heatmapLayer = new HeatmapLayer({
      id: 'oil-spill-heatmap',
      data: this.particles,
      getPosition: (d: OilParticle) => d.position,
      getWeight: (d: OilParticle) => d.thickness, // La densité est définie par l'épaisseur
      radiusPixels: 120, // Rayon énorme pour compenser le faible nombre de points
      colorRange: [
        [255, 255, 178, 20],  // Jaune très translucide (Sheen / Irisé)
        [254, 217, 118, 100], // Jaune clair
        [254, 178, 76, 180],  // Orange
        [253, 141, 60, 220],  // Orange foncé
        [240, 59, 32, 240],   // Rouge (Modéré)
        [189, 0, 38, 255]     // Brun Foncé (Crude Épais)
      ],
      aggregation: 'SUM',
      intensity: 1.5,
      threshold: 0.05,
      updateTriggers: {
        getWeight: [Date.now()] // Force le rafraîchissement
      }
    });

    if (this.deckLayer) {
      // Mettre à jour la couche existante
      this.deckLayer.setProps({
        layers: [heatmapLayer]
      });
    } else {
      // Créer et ajouter la nouvelle couche
      this.deckLayer = new LeafletLayer({
        layers: [heatmapLayer]
      });
      
      this.map.addLayer(this.deckLayer);
      console.log('[OilSimulation] Heatmap layer added to map');
    }
  }

  /**
   * @method animate
   * @private
   * @description Boucle d'animation pour simuler l'advection des particules.
   * Applique une dérive de courant, une diffusion aléatoire et la détection de collision côtière.
   */
  private animate = (): void => {
    this.frameCount++;
    
    if (this.particles.length === 0) {
      this.animationFrameId = null;
      return;
    }

    // La physique tourne à chaque frame, influencée par le temps
    const speed = this.timeMultiplier;
    
    // Courant principal (Gulf Stream vers le Nord-Est)
    const currentX = 0.0015 * speed; 
    const currentY = 0.0005 * speed;
    
    this.particles.forEach(p => {
      // Si la particule est échouée sur la côte, elle ne bouge plus, elle s'évapore juste
      if (p.isBeached) {
        p.thickness -= 0.005 * speed; // S'évapore un peu plus vite sur la plage
        return;
      }

      // Calcul de la future position
      const nextLng = p.position[0] + currentX + (p.driftX * speed);
      const nextLat = p.position[1] + currentY + (p.driftY * speed);

      // Détection de collision (seulement si les données sont chargées et toutes les X frames pour opti)
      let hitLand = false;
      if (this.landPolygons && this.frameCount % 5 === 0) { // Opti CPU: check collision 12 fois par seconde
        const point = turf.point([nextLng, nextLat]);
        // On cherche si le point est dans un polygone terrestre
        hitLand = this.landPolygons.features.some((feature: any) => 
          turf.booleanPointInPolygon(point, feature)
        );
      }

      if (hitLand) {
        p.isBeached = true; // La particule s'arrête définitivement ici
      } else {
        // Mise à jour de la position si elle est toujours en mer
        p.position[0] = nextLng;
        p.position[1] = nextLat;
      }

      // Évaporation normale en mer
      p.thickness -= 0.003 * speed;
    });

    // Nettoyer les particules mortes (totalement évaporées)
    this.particles = this.particles.filter(p => p.thickness > 0);

    // FLUIDITÉ TOTALE : Redessiner à chaque frame (60 FPS)
    if (this.deckLayer) {
      const heatmap = new HeatmapLayer({
        id: 'oil-spill-heatmap',
        data: [...this.particles], // Le spread operator est OBLIGATOIRE ici
        getPosition: (d: any) => d.position,
        getWeight: (d: any) => Math.max(0, d.thickness),
        radiusPixels: 100,
        intensity: 2,
        colorRange: [
          [255, 255, 178, 20],  // Jaune très translucide
          [254, 217, 118, 100], // Jaune clair
          [254, 178, 76, 180],  // Orange
          [253, 141, 60, 220],  // Orange foncé
          [240, 59, 32, 240],   // Rouge
          [189, 0, 38, 255]     // Brun Foncé
        ],
        aggregation: 'SUM',
        updateTriggers: {
          getWeight: [Date.now()]
        }
      });
      this.deckLayer.setProps({ layers: [heatmap] });
    }

    // Continuer la boucle d'animation
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * @method clear
   * @public
   * @description Efface toutes les particules et supprime la couche de la carte.
   */
  public clear(): void {
    // Arrêter l'animation
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.particles = [];
    
    // Rafraîchir la couche vide pour effacer l'écran
    if (this.deckLayer) {
      this.deckLayer.setProps({ layers: [] });
    }
    
    console.log('[OilSimulation] Simulation cleared');
  }

  /**
   * @method getParticleCount
   * @public
   * @returns {number} Nombre total de particules
   * @description Retourne le nombre total de particules actives.
   */
  public getParticleCount(): number {
    return this.particles.length;
  }

  /**
   * @method destroy
   * @public
   * @description Nettoie les ressources et détruit le service.
   */
  public destroy(): void {
    // Arrêter l'animation proprement
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    this.clear();
    this.map = null;
    this.isInitialized = false;
    console.log('[OilSimulation] Service destroyed');
  }
}

export default OilSimulationService;
