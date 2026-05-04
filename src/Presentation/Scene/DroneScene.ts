import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { Drone } from '../../Domain/Entities/Drone';

export class DroneScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private droneModel: THREE.Group | null = null;
  private droneEntity: Drone | null = null;
  private resizeHandler!: () => void;

  constructor(container: HTMLElement, droneEntity?: Drone) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x001e0f);
    this.scene.fog = new THREE.FogExp2(0x001e0f, 0.05);

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );
    this.camera.position.set(30, 25, 30);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    document.body.appendChild(ARButton.createButton(this.renderer));

    if (droneEntity) {
      this.droneEntity = droneEntity;
    }

    this.setupLights();
    this.setupSeabed();
    this.loadDroneModel();

    this.handleResize(container);
    this.renderer.setAnimationLoop(this.animate.bind(this));
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.bias = -0.001;
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x88ccff, 0.5);
    fillLight.position.set(-10, 10, -10);
    this.scene.add(fillLight);

    const rimLight = new THREE.SpotLight(0xffffff, 1);
    rimLight.position.set(0, 10, -10);
    rimLight.lookAt(0, 0, 0);
    this.scene.add(rimLight);
  }

  private setupSeabed(): void {
    const segments = 64;
    const planeGeometry = new THREE.PlaneGeometry(100, 100, segments, segments);

    const positions = planeGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const wave1 = Math.sin(x * 0.2) * Math.cos(y * 0.2) * 0.5;
      const wave2 = Math.sin(x * 0.5 + y * 0.3) * 0.25;
      const wave3 = Math.cos(x * 0.1 - y * 0.4) * 0.35;
      positions[i + 2] = wave1 + wave2 + wave3;
    }
    planeGeometry.computeVertexNormals();

    const planeMaterial = new THREE.MeshStandardMaterial({
      color: 0x2b2b2b,
      roughness: 0.9,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });
    const seabed = new THREE.Mesh(planeGeometry, planeMaterial);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -1;
    seabed.receiveShadow = true;
    this.scene.add(seabed);
  }

  private loadDroneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      './IROV_AllInOne.glb',
      (gltf) => {
        const model = gltf.scene;
        // Échelle AR-friendly (plus grande pour être visible)
        model.scale.set(0.3, 0.3, 0.3);
        // Position AR: devant l'utilisateur, légèrement au sol
        model.position.set(0, -0.5, -2);
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.droneModel = model;
        this.scene.add(model);
      },
      (progress) => {
        console.log(`Chargement: ${(progress.loaded / progress.total) * 100}%`);
      },
      (error) => {
        console.error('Erreur chargement modèle:', error);
      }
    );
  }

  private animate(): void {
    if (this.droneModel && this.droneEntity) {
      const pos = this.droneEntity.localPosition;
      this.droneModel.position.x = pos.x;
      this.droneModel.position.y = pos.y;
      this.droneModel.position.z = pos.z;
      this.droneModel.rotation.y = this.droneEntity.rotationY;
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

    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
      if (child instanceof THREE.Light) {
        child.dispose();
      }
    });

    this.scene.clear();

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
