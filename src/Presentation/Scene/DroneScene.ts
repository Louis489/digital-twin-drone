import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Drone } from '../../Domain/Entities/Drone';

export class DroneScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private droneModel: THREE.Group | null = null;
  // @ts-ignore - conservé pour future intégration
  private droneEntity: Drone | null = null;
  private resizeHandler!: () => void;
  private isPlacing: boolean = false;
  private isPlaced: boolean = false;
  private uiContainer: HTMLDivElement | null = null;
  private placeButton: HTMLButtonElement | null = null;

  constructor(container: HTMLElement, droneEntity?: Drone) {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.01,
      20
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // 1. Créer le conteneur UI en PREMIER (avant ARButton)
    this.uiContainer = document.createElement('div');
    this.uiContainer.id = 'ar-ui-container';
    this.uiContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    document.body.appendChild(this.uiContainer);

    // 2. Créer l'ARButton avec le conteneur existant
    const arButton = ARButton.createButton(this.renderer, {
      requiredFeatures: ['dom-overlay'],
      domOverlay: { root: this.uiContainer }
    });
    document.body.appendChild(arButton);

    if (droneEntity) {
      this.droneEntity = droneEntity;
    }

    this.setupLights();
    this.createDOMOverlay(); // Ajoute les boutons au conteneur existant
    this.loadDroneModel();
    this.setupXRController();

    this.handleResize(container);
    this.renderer.setAnimationLoop(this.animate.bind(this));
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);
  }

  private createDOMOverlay(): void {
    if (!this.uiContainer) return;

    // Conteneur pour le menu (en bas)
    const menu = document.createElement('div');
    menu.style.cssText = `
      position: absolute;
      bottom: 40px;
      left: 0;
      width: 100%;
      display: flex;
      justify-content: center;
      pointer-events: none;
    `;

    // Bouton "Faire apparaître ROV"
    this.placeButton = document.createElement('button');
    this.placeButton.textContent = 'Faire apparaître ROV';
    this.placeButton.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      padding: 16px 32px;
      font-size: 18px;
      font-weight: bold;
      border-radius: 30px;
      cursor: pointer;
      box-shadow: 0 4px 15px rgba(0,0,0,0.3);
      transition: transform 0.2s, box-shadow 0.2s;
      pointer-events: auto;
    `;
    this.placeButton.addEventListener('mouseenter', () => {
      if (this.placeButton) {
        this.placeButton.style.transform = 'scale(1.05)';
        this.placeButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
      }
    });
    this.placeButton.addEventListener('mouseleave', () => {
      if (this.placeButton) {
        this.placeButton.style.transform = 'scale(1)';
        this.placeButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
      }
    });
    this.placeButton.addEventListener('click', () => this.startPlacing());

    menu.appendChild(this.placeButton);
    this.uiContainer.appendChild(menu);
  }

  private startPlacing(): void {
    if (this.droneModel && !this.isPlaced && !this.isPlacing) {
      // Le ROV apparaît à 2m devant, en mode placement
      this.droneModel.position.set(0, -0.5, -2);
      this.droneModel.visible = true;
      this.isPlacing = true;

      // Changer le texte du bouton pour indiquer qu'on peut poser
      if (this.placeButton) {
        this.placeButton.textContent = 'Touchez l\'écran pour poser';
        this.placeButton.style.opacity = '0.7';
      }
    }
  }

  private placeROV(): void {
    if (this.isPlacing && this.droneModel) {
      // Fixer la position actuelle
      this.isPlacing = false;
      this.isPlaced = true;

      // Masquer le bouton
      if (this.placeButton) {
        this.placeButton.style.display = 'none';
      }
    }
  }

  private loadDroneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      './IROV_AllInOne.glb',
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.08, 0.08, 0.08); // Échelle réaliste pour une chambre
        model.visible = false;
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.droneModel = model;
        this.scene.add(model);
      },
      undefined,
      (error) => {
        console.error('Erreur chargement modèle:', error);
      }
    );
  }

  private setupXRController(): void {
    const controller = this.renderer.xr.getController(0);

    // Événement select (tap sur écran) pour poser le ROV
    controller.addEventListener('select', () => {
      if (this.isPlacing) {
        this.placeROV();
      }
    });

    this.scene.add(controller);
  }

  private animate(): void {
    // Mode "fantôme" : le ROV suit à 2m devant la caméra
    if (this.isPlacing && this.droneModel) {
      // Position fixe relative à la caméra (devant, légèrement en bas)
      const offset = new THREE.Vector3(0, -0.5, -2);
      offset.applyMatrix4(this.camera.matrixWorld);
      this.droneModel.position.copy(offset);
    }

    this.renderer.render(this.scene, this.camera);
  }

  private handleResize(container: HTMLElement): void {
    this.resizeHandler = (): void => {
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', this.resizeHandler);
  }

  setDroneEntity(drone: Drone): void {
    this.droneEntity = drone;
  }

  dispose(): void {
    this.renderer.setAnimationLoop(null);

    const arButton = document.getElementById('ARButton');
    if (arButton) {
      arButton.remove();
    }

    if (this.uiContainer) {
      this.uiContainer.remove();
    }
    this.placeButton = null;
    this.uiContainer = null;

    window.removeEventListener('resize', this.resizeHandler);

    if (this.droneModel) {
      this.droneModel.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      this.scene.remove(this.droneModel);
      this.droneModel = null;
    }

    this.scene.clear();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
