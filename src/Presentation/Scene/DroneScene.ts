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
  private previousTouchX: number | null = null;
  private previousTouchDistance: number | null = null;

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
      display: none;
    `;
    document.body.appendChild(this.uiContainer);

    // Afficher/cacher l'UI selon l'état de la session AR
    this.renderer.xr.addEventListener('sessionstart', () => {
      if (this.uiContainer) this.uiContainer.style.display = 'block';
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      if (this.uiContainer) this.uiContainer.style.display = 'none';
    });

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
    this.setupTouchInteractions();

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
        model.scale.set(0.008, 0.008, 0.008); // Échelle minuscule (8mm) pour AR
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

  private setupTouchInteractions(): void {
    window.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
    window.addEventListener('touchmove', this.onTouchMove.bind(this), { passive: false });
  }

  private onTouchStart(event: TouchEvent): void {
    if (event.touches.length === 1) {
      this.previousTouchX = event.touches[0].pageX;
      this.previousTouchDistance = null;
    } else if (event.touches.length === 2) {
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      this.previousTouchDistance = Math.hypot(dx, dy);
      this.previousTouchX = null;
    }
  }

  private onTouchMove(event: TouchEvent): void {
    // Ne fonctionne que si le ROV est chargé, visible et déjà posé
    if (!this.droneModel || !this.droneModel.visible || this.isPlacing) {
      return;
    }

    event.preventDefault();

    if (event.touches.length === 1 && this.previousTouchX !== null) {
      // Rotation à 1 doigt
      const deltaX = event.touches[0].pageX - this.previousTouchX;
      this.droneModel.rotation.y += deltaX * 0.01;
      this.previousTouchX = event.touches[0].pageX;
    } else if (event.touches.length === 2 && this.previousTouchDistance !== null) {
      // Zoom pinch à 2 doigts
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      const currentDistance = Math.hypot(dx, dy);

      const scaleFactor = currentDistance / this.previousTouchDistance;
      this.droneModel.scale.multiplyScalar(scaleFactor);

      // Garder-fou : borner l'échelle
      const currentScale = this.droneModel.scale.x;
      const clampedScale = THREE.MathUtils.clamp(currentScale, 0.002, 0.05);
      this.droneModel.scale.set(clampedScale, clampedScale, clampedScale);

      this.previousTouchDistance = currentDistance;
    }
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
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);

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
