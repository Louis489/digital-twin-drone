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
    this.scene.background = new THREE.Color(0x000033);
    this.scene.fog = new THREE.FogExp2(0x000033, 0.005);

    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      5000
    );
    this.camera.position.set(0, 0, 500);
    this.camera.lookAt(0, -50, -400);

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
    this.setupUnderwaterEnvironment();
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

  private setupUnderwaterEnvironment(): void {
    // Fond marin profond (2000x2000)
    const seabedGeometry = new THREE.PlaneGeometry(2000, 2000, 128, 128);
    const positions = seabedGeometry.attributes.position.array as Float32Array;
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const wave1 = Math.sin(x * 0.02) * Math.cos(y * 0.02) * 5;
      const wave2 = Math.sin(x * 0.05 + y * 0.03) * 2.5;
      const wave3 = Math.cos(x * 0.01 - y * 0.04) * 3.5;
      positions[i + 2] = wave1 + wave2 + wave3;
    }
    seabedGeometry.computeVertexNormals();

    const seabedMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a3e,
      roughness: 0.95,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const seabed = new THREE.Mesh(seabedGeometry, seabedMaterial);
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = -100;
    seabed.receiveShadow = true;
    this.scene.add(seabed);

    // Murs d'eau environnants
    const waterWallMaterial = new THREE.MeshStandardMaterial({
      color: 0x001133,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });

    // Mur gauche
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(1000, 600), waterWallMaterial);
    leftWall.position.set(-1000, 200, -500);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // Mur droit
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(1000, 600), waterWallMaterial);
    rightWall.position.set(1000, 200, -500);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Mur devant (arrière)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(2000, 600), waterWallMaterial);
    backWall.position.set(0, 200, -1000);
    this.scene.add(backWall);

    // Plafond d'eau
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), waterWallMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 500;
    this.scene.add(ceiling);
  }

  private loadDroneModel(): void {
    const loader = new GLTFLoader();
    loader.load(
      './IROV_AllInOne.glb',
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(0.3, 0.3, 0.3);
        model.position.set(0, -98, -400);
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
    if (this.droneModel) {
      const time = Date.now() * 0.0005;

      // Mouvement cyclique du ROV en profondeur
      const zCycle = Math.sin(time) * 150 - 250; // Oscille entre -400 et -100
      const yCycle = Math.sin(time * 0.7) * 24 - 74; // Oscille entre -98 et -50

      this.droneModel.position.z = zCycle;
      this.droneModel.position.y = yCycle;
      this.droneModel.rotation.y = time * 0.5;
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
