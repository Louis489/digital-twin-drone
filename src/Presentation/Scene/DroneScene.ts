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
  private isPlaced: boolean = false;
  private isDragging: boolean = false;
  private uiContainer: HTMLDivElement | null = null;

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

    const arButton = ARButton.createButton(this.renderer, this.createOverlayConfig());
    document.body.appendChild(arButton);

    if (droneEntity) {
      this.droneEntity = droneEntity;
    }

    this.setupLights();
    this.createDOMOverlay();
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
    // Création du conteneur UI
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
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding-bottom: 40px;
    `;

    // Menu en bas
    const menu = document.createElement('div');
    menu.style.cssText = `
      width: 100%;
      display: flex;
      justify-content: center;
      pointer-events: auto;
      gap: 20px;
    `;

    // Bouton ROV
    const rovButton = document.createElement('button');
    rovButton.textContent = 'Placer ROV';
    rovButton.style.cssText = `
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
    `;
    rovButton.addEventListener('mouseenter', () => {
      rovButton.style.transform = 'scale(1.05)';
      rovButton.style.boxShadow = '0 6px 20px rgba(0,0,0,0.4)';
    });
    rovButton.addEventListener('mouseleave', () => {
      rovButton.style.transform = 'scale(1)';
      rovButton.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
    });
    rovButton.addEventListener('click', () => this.placeROV());

    menu.appendChild(rovButton);
    this.uiContainer.appendChild(menu);
    document.body.appendChild(this.uiContainer);
  }

  private createOverlayConfig(): { requiredFeatures: string[]; domOverlay: { root: HTMLElement } } | undefined {
    if (!this.uiContainer) return undefined;
    return {
      requiredFeatures: ['dom-overlay'],
      domOverlay: { root: this.uiContainer }
    };
  }

  private placeROV(): void {
    if (this.droneModel && !this.isPlaced) {
      // Position 1.5m devant la caméra
      this.droneModel.position.set(0, -0.5, -1.5);
      this.droneModel.visible = true;
      this.isPlaced = true;
    }
  }

  private loadDroneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      './IROV_AllInOne.glb',
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.1, 0.1, 0.1);
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

    controller.addEventListener('selectstart', () => {
      if (this.droneModel && this.isPlaced) {
        // Vérifier si le rayon touche le ROV
        const controllerPos = new THREE.Vector3();
        controller.getWorldPosition(controllerPos);
        const dronePos = this.droneModel.position;
        const distance = controllerPos.distanceTo(dronePos);
        if (distance < 0.5) {
          this.isDragging = true;
        }
      }
    });

    controller.addEventListener('selectend', () => {
      this.isDragging = false;
    });

    this.scene.add(controller);
  }

  private animate(): void {
    // Mode drag : le ROV suit la position du contrôleur/téléphone
    if (this.isDragging && this.droneModel) {
      const controller = this.renderer.xr.getController(0);
      const position = new THREE.Vector3();
      controller.getWorldPosition(position);
      // Ajuster la position pour tenir le ROV devant
      this.droneModel.position.copy(position);
      this.droneModel.position.z -= 0.3;
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
