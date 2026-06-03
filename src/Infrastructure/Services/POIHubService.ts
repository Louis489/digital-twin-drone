/**
 * @file POIHubService.ts
 * @description Service de gestion du panneau latéral droit pour les Points d'Intérêt (POI).
 * Affiche les informations détaillées lors du clic sur un marqueur Cesium.
 * @author Digital Twin Team
 * @version 1.0.0
 */

import { POIEntityProperties } from '../../Domain/Interfaces/IMapService';

/**
 * @interface POIPanelState
 * @description État courant du panneau POI
 */
interface POIPanelState {
  isOpen: boolean;
  currentPOI: POIEntityProperties | null;
}

/**
 * @class POIHubService
 * @description Service singleton pour gérer le Hub de Points d'Intérêt.
 * Gère l'affichage du panneau latéral droit et les interactions avec les marqueurs Cesium.
 */
export class POIHubService {
  private panel: HTMLElement | null = null;
  private state: POIPanelState = { isOpen: false, currentPOI: null };
  private onNavigateCallback?: (targetId: string) => void;
  private closeButtonClickHandler = (): void => this.closePanel();
  private actionButtonClickHandler = (): void => this.handleActionClick();
  private keydownHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.state.isOpen) {
      this.closePanel();
    }
  };

  // Sélecteurs DOM
  private readonly PANEL_ID = 'poi-side-panel';
  private readonly TITLE_ID = 'poi-title';
  private readonly IMAGE_ID = 'poi-image';
  private readonly DESCRIPTION_ID = 'poi-description';
  private readonly ACTION_BTN_ID = 'poi-action-btn';
  private readonly CLOSE_BTN_ID = 'poi-close-btn';

  /**
   * @constructor
   * Initialise le service et injecte le HTML/CSS si nécessaire.
   */
  constructor() {
    this.initializePanel();
  }

  /**
   * @method initializePanel
   * @private
   * Crée le panneau latéral s'il n'existe pas déjà.
   */
  private initializePanel(): void {
    // Vérifier si le panneau existe déjà
    if (document.getElementById(this.PANEL_ID)) {
      this.panel = document.getElementById(this.PANEL_ID);
      this.attachEventListeners();
      return;
    }

    // Créer le conteneur du panneau
    const panel = document.createElement('div');
    panel.id = this.PANEL_ID;
    panel.className = 'poi-side-panel';
    panel.innerHTML = `
      <div class="poi-panel-content">
        <button id="${this.CLOSE_BTN_ID}" class="poi-close-btn" aria-label="Fermer">×</button>
        <h2 id="${this.TITLE_ID}" class="poi-title">Titre du POI</h2>
        <div class="poi-image-container">
          <img id="${this.IMAGE_ID}" class="poi-image" src="" alt="Image du POI">
        </div>
        <p id="${this.DESCRIPTION_ID}" class="poi-description">Description du point d'intérêt...</p>
        <button id="${this.ACTION_BTN_ID}" class="poi-action-btn">Essayer la simulation</button>
      </div>
    `;

    // Injecter les styles si non présents
    this.injectStyles();

    // Ajouter au body
    document.body.appendChild(panel);
    this.panel = panel;

    this.attachEventListeners();
  }

  /**
   * @method injectStyles
   * @private
   * Injecte les styles CSS du panneau POI.
   */
  private injectStyles(): void {
    if (document.getElementById('poi-panel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'poi-panel-styles';
    styles.textContent = `
      .poi-side-panel {
        position: fixed;
        top: 0;
        right: -420px;
        width: 400px;
        height: 100vh;
        background: linear-gradient(170deg, rgba(2, 12, 28, 0.95), rgba(1, 6, 18, 0.92));
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-left: 1px solid rgba(0, 216, 255, 0.42);
        box-shadow: -4px 0 24px rgba(0, 216, 255, 0.14);
        z-index: 200;
        transition: right 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        overflow-y: auto;
        font-family: 'Segoe UI', Arial, sans-serif;
      }

      .poi-side-panel.open {
        right: 0;
      }

      .poi-panel-content {
        padding: 28px;
        color: #dffcff;
      }

      .poi-close-btn {
        position: absolute;
        top: 20px;
        right: 20px;
        width: 36px;
        height: 36px;
        background: rgba(0, 216, 255, 0.15);
        border: 1px solid rgba(0, 216, 255, 0.4);
        border-radius: 50%;
        color: #00e5ff;
        font-size: 24px;
        line-height: 1;
        cursor: pointer;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .poi-close-btn:hover {
        background: rgba(0, 216, 255, 0.3);
        border-color: rgba(0, 216, 255, 0.7);
        transform: scale(1.05);
      }

      .poi-title {
        margin: 0 0 20px 0;
        font-size: 24px;
        font-weight: 700;
        color: #00e5ff;
        letter-spacing: 0.5px;
        line-height: 1.3;
        padding-right: 40px;
      }

      .poi-image-container {
        width: 100%;
        height: 200px;
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 20px;
        border: 1px solid rgba(0, 216, 255, 0.3);
        background: rgba(0, 30, 50, 0.5);
      }

      .poi-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        transition: transform 0.3s ease;
      }

      .poi-image-container:hover .poi-image {
        transform: scale(1.03);
      }

      .poi-description {
        font-size: 15px;
        line-height: 1.7;
        color: rgba(223, 252, 255, 0.9);
        margin-bottom: 28px;
      }

      .poi-action-btn {
        width: 100%;
        padding: 16px 24px;
        background: linear-gradient(135deg, rgba(0, 216, 255, 0.2), rgba(0, 168, 255, 0.15));
        border: 1px solid rgba(0, 216, 255, 0.5);
        border-radius: 10px;
        color: #00e5ff;
        font-size: 15px;
        font-weight: 600;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: all 0.25s ease;
        text-transform: uppercase;
      }

      .poi-action-btn:hover {
        background: linear-gradient(135deg, rgba(0, 216, 255, 0.35), rgba(0, 168, 255, 0.25));
        border-color: rgba(0, 216, 255, 0.8);
        box-shadow: 0 4px 20px rgba(0, 216, 255, 0.25);
        transform: translateY(-2px);
      }

      .poi-action-btn:active {
        transform: translateY(0);
      }

      /* Responsive */
      @media (max-width: 768px) {
        .poi-side-panel {
          width: 100%;
          right: -100%;
        }
      }
    `;

    document.head.appendChild(styles);
  }

  /**
   * @method attachEventListeners
   * @private
   * Attache les écouteurs d'événements aux boutons du panneau.
   */
  private attachEventListeners(): void {
    // Bouton fermer
    const closeBtn = document.getElementById(this.CLOSE_BTN_ID);
    if (closeBtn) {
      closeBtn.removeEventListener('click', this.closeButtonClickHandler);
      closeBtn.addEventListener('click', this.closeButtonClickHandler);
    }

    // Bouton action
    const actionBtn = document.getElementById(this.ACTION_BTN_ID);
    if (actionBtn) {
      actionBtn.removeEventListener('click', this.actionButtonClickHandler);
      actionBtn.addEventListener('click', this.actionButtonClickHandler);
    }

    // Fermer avec la touche Escape
    document.removeEventListener('keydown', this.keydownHandler);
    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * @method openPanel
   * @public
   * Ouvre le panneau avec les données du POI spécifié.
   * @param properties - Propriétés du POI à afficher
   */
  public openPanel(properties: POIEntityProperties): void {
    this.state.currentPOI = properties;
    this.state.isOpen = true;

    // Mettre à jour le contenu
    const titleEl = document.getElementById(this.TITLE_ID);
    const imageEl = document.getElementById(this.IMAGE_ID) as HTMLImageElement;
    const descEl = document.getElementById(this.DESCRIPTION_ID);

    if (titleEl) titleEl.textContent = properties.title;
    if (imageEl) {
      imageEl.src = properties.imageUrl;
      imageEl.alt = properties.title;
    }
    if (descEl) descEl.textContent = properties.description;

    // Ouvrir le panneau
    if (this.panel) {
      this.panel.classList.add('open');
    }

    console.log(`[POIHub] Panel opened for: ${properties.title} (target: ${properties.targetId})`);
  }

  /**
   * @method closePanel
   * @public
   * Ferme le panneau latéral.
   */
  public closePanel(): void {
    this.state.isOpen = false;
    this.state.currentPOI = null;

    if (this.panel) {
      this.panel.classList.remove('open');
    }

    console.log('[POIHub] Panel closed');
  }

  /**
   * @method handleActionClick
   * @private
   * Gère le clic sur le bouton d'action.
   */
  private handleActionClick(): void {
    if (!this.state.currentPOI) return;

    const targetId = this.state.currentPOI.targetId;
    console.log(`[POIHub] Simulation requested for: ${targetId}`);
    this.hide();

    // Appeler le callback de navigation si défini
    if (this.onNavigateCallback) {
      this.onNavigateCallback(targetId);
    }
  }

  /**
   * @method onNavigate
   * @public
   * Définit le callback appelé lors de la navigation.
   * @param callback - Fonction à appeler avec le targetId
   */
  public onNavigate(callback: (targetId: string) => void): void {
    this.onNavigateCallback = callback;
  }

  /**
   * @method onSimulationStart
   * @public
   * Définit le callback appelé lorsque l'utilisateur demande explicitement une simulation.
   * @param callback - Fonction à appeler avec le targetId
   */
  public onSimulationStart(callback: (targetId: string) => void): void {
    this.onNavigateCallback = callback;
  }

  /**
   * @method handlePOIClick
   * @public
   * Méthode appelée par le service de carte quand un POI est cliqué.
   * @param entityId - Identifiant de l'entité Cesium
   * @param properties - Propriétés du POI
   */
  public handlePOIClick(entityId: string, properties: POIEntityProperties): void {
    console.log(`[POIHub] POI clicked: ${entityId} - ${properties.title}`);
    this.openPanel(properties);
  }

  /**
   * @method isOpen
   * @public
   * Vérifie si le panneau est actuellement ouvert.
   * @returns État d'ouverture du panneau
   */
  public isOpen(): boolean {
    return this.state.isOpen;
  }

  /**
   * @method hide
   * @public
   * Masque explicitement le panneau sans détruire son conteneur.
   */
  public hide(): void {
    this.closePanel();
  }

  /**
   * @method dispose
   * @public
   * Détruit le panneau et nettoie les ressources.
   */
  public dispose(): void {
    const closeBtn = document.getElementById(this.CLOSE_BTN_ID);
    if (closeBtn) {
      closeBtn.removeEventListener('click', this.closeButtonClickHandler);
    }

    const actionBtn = document.getElementById(this.ACTION_BTN_ID);
    if (actionBtn) {
      actionBtn.removeEventListener('click', this.actionButtonClickHandler);
    }

    document.removeEventListener('keydown', this.keydownHandler);

    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.panel = null;
    this.state = { isOpen: false, currentPOI: null };
    this.onNavigateCallback = undefined;
  }

  /**
   * @method destroy
   * @public
   * Alias explicite de dispose pour les changements de vue.
   */
  public destroy(): void {
    this.dispose();
  }
}

export default POIHubService;
