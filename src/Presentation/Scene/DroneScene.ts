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
  private reticle: THREE.Mesh | null = null;
  private hitTestSource: XRHitTestSource | null = null;
  private isPlaced: boolean = false;
  private touchStartX: number = 0;

  private hitTestSourceRequested: boolean = false;

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

    document.body.appendChild(
      ARButton.createButton(this.renderer, { requiredFeatures: ['hit-test'] })
    );

    if (droneEntity) {
      this.droneEntity = droneEntity;
    }

    this.setupLights();
    this.createReticle();
    this.loadDroneModel();
    this.setupXRController();
    this.setupTouchRotation();

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

  private createReticle(): void {
    const geometry = new THREE.RingGeometry(0.1, 0.12, 32);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.reticle = new THREE.Mesh(geometry, material);
    this.reticle.rotation.x = -Math.PI / 2;
    this.reticle.visible = false;
    this.scene.add(this.reticle);
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
    controller.addEventListener('select', () => {
      if (this.reticle && this.reticle.visible && this.droneModel && !this.isPlaced) {
        this.droneModel.position.setFromMatrixPosition(this.reticle.matrix);
        this.droneModel.visible = true;
        this.reticle.visible = false;
        this.isPlaced = true;
      }
    });
    this.scene.add(controller);
  }

  private setupTouchRotation(): void {
    window.addEventListener('touchstart', (e) => {
      this.touchStartX = e.touches[0].clientX;
    });

    window.addEventListener('touchmove', (e) => {
      if (this.isPlaced && this.droneModel) {
        const deltaX = e.touches[0].clientX - this.touchStartX;
        this.droneModel.rotation.y += deltaX * 0.01;
        this.touchStartX = e.touches[0].clientX;
      }
    });
  }

  // @ts-ignore - timestamp requis par WebXR
  private animate(_timestamp: number, frame: XRFrame | undefined): void {
    if (frame) {
      const referenceSpace = this.renderer.xr.getReferenceSpace();

      if (!this.hitTestSourceRequested && referenceSpace) {
        const session = this.renderer.xr.getSession();
        // @ts-ignore - requestHitTestSource existe si la session XR supporte hit-test
        if (session?.requestHitTestSource) {
          // @ts-ignore
          session.requestHitTestSource({ space: referenceSpace }).then((source: XRHitTestSource | undefined) => {
            if (source) {
              this.hitTestSource = source;
            }
          });
          this.hitTestSourceRequested = true;
        }
      }

      if (this.hitTestSource && this.reticle && !this.isPlaced) {
        const hitTestResults = frame.getHitTestResults(this.hitTestSource);
        if (hitTestResults.length > 0) {
          const hit = hitTestResults[0];
          const pose = hit.getPose(referenceSpace!);
          if (pose) {
            this.reticle.visible = true;
            this.reticle.matrix.fromArray(pose.transform.matrix);
          }
        } else {
          this.reticle.visible = false;
        }
      }
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

    window.removeEventListener('resize', this.resizeHandler);

    if (this.reticle) {
      this.reticle.geometry.dispose();
      (this.reticle.material as THREE.Material).dispose();
      this.scene.remove(this.reticle);
    }

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
