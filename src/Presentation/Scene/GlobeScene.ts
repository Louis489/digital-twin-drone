import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type SceneTransitionCallback = () => void;

export class GlobeScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private globe: THREE.Mesh | null = null;
  private marker: THREE.Mesh;
  private resizeHandler!: () => void;
  private controls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private animationId: number | null = null;
  private onTransition: SceneTransitionCallback | null = null;
  private isAutoRotating: boolean = true;
  private rotationTimeout: number | null = null;

  constructor(container: HTMLElement, onTransition?: SceneTransitionCallback) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);

    this.camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 0, 5);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.autoRotate = false;

    this.controls.addEventListener('start', () => {
      this.isAutoRotating = false;
      if (this.rotationTimeout !== null) {
        clearTimeout(this.rotationTimeout);
        this.rotationTimeout = null;
      }
    });

    this.controls.addEventListener('end', () => {
      this.rotationTimeout = window.setTimeout(() => {
        this.isAutoRotating = true;
      }, 1000);
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    if (onTransition) {
      this.onTransition = onTransition;
    }

    this.setupLights();
    this.marker = this.createLimerickMarker();

    this.loadGlobeTexture().then((globe) => {
      this.globe = globe;
      this.scene.add(globe);
      globe.add(this.marker);
    });

    this.setupEventListeners();
    this.handleResize(container);
    this.animate();
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 3, 5);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    const rimLight = new THREE.DirectionalLight(0x4455ff, 0.5);
    rimLight.position.set(-5, 0, -5);
    this.scene.add(rimLight);
  }

  private async loadGlobeTexture(): Promise<THREE.Mesh> {
    const loader = new THREE.TextureLoader();
    const texture = await loader.loadAsync(
      'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_atmos_2048.jpg'
    );

    const geometry = new THREE.SphereGeometry(1.5, 64, 64);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.1,
    });
    const globe = new THREE.Mesh(geometry, material);
    globe.receiveShadow = true;
    return globe;
  }

  private createLimerickMarker(): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(0.05, 16, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff3333 });
    const marker = new THREE.Mesh(geometry, material);

    // Limerick: 52.668° N, 8.63° W
    const lat = 52.668;
    const lon = -8.63;

    const phi = (90 - lat) * (Math.PI / 180);
    const theta = lon * (Math.PI / 180);
    const radius = 1.52;

    marker.position.x = radius * Math.sin(phi) * Math.cos(theta);
    marker.position.y = radius * Math.cos(phi);
    marker.position.z = -radius * Math.sin(phi) * Math.sin(theta);

    return marker;
  }

  private setupEventListeners(): void {
    this.renderer.domElement.addEventListener('click', (event) => {
      this.onMouseClick(event);
    });

    this.renderer.domElement.addEventListener('mousemove', (event) => {
      this.onMouseMove(event);
    });
  }

  private onMouseMove(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.marker);

    this.renderer.domElement.style.cursor = intersects.length > 0 ? 'pointer' : 'default';
  }

  private onMouseClick(event: MouseEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.marker);

    if (intersects.length > 0 && this.onTransition) {
      this.onTransition();
    }
  }

  private animate(): void {
    this.animationId = requestAnimationFrame(() => this.animate());

    if (this.globe && this.isAutoRotating) {
      this.globe.rotation.y += 0.002;
    }

    this.controls.update();
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

  dispose(): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    window.removeEventListener('resize', this.resizeHandler);

    if (this.rotationTimeout !== null) {
      clearTimeout(this.rotationTimeout);
      this.rotationTimeout = null;
    }

    this.controls.removeEventListener('start', () => {});
    this.controls.removeEventListener('end', () => {});

    if (this.marker) {
      this.marker.geometry.dispose();
      (this.marker.material as THREE.Material).dispose();
      if (this.globe) {
        this.globe.remove(this.marker);
      }
    }

    if (this.globe) {
      const material = this.globe.material as THREE.MeshStandardMaterial;
      if (material.map) {
        material.map.dispose();
      }
      material.dispose();
      this.globe.geometry.dispose();
      this.scene.remove(this.globe);
      this.globe = null;
    }

    this.scene.traverse((child) => {
      if (child instanceof THREE.Light) {
        child.dispose();
      }
    });

    this.scene.clear();
    this.controls.dispose();
    this.renderer.dispose();

    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
