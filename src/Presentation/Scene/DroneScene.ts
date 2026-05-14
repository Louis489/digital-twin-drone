import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ARButton } from 'three/examples/jsm/webxr/ARButton.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class DroneScene {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private droneModel: THREE.Group | null = null;
  private resizeHandler!: () => void;
  private isPlacing: boolean = false;
  private isPlaced: boolean = false;
  private uiContainer: HTMLDivElement | null = null;
  private placeButton: HTMLButtonElement | null = null;
  private previousTouchX: number | null = null;
  private previousTouchDistance: number | null = null;
  private showroomGroup: THREE.Group | null = null;
  private controls: OrbitControls | null = null;
  private partsMenu: HTMLDivElement | null = null;
  private placementOffset = new THREE.Vector3(0, -0.5, -2);

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    // Fond et brouillard studio infini
    const bgColor = new THREE.Color(0x1a1c22);
    this.scene.background = bgColor;
    this.scene.fog = new THREE.FogExp2(bgColor, 0.08);

    this.camera = new THREE.PerspectiveCamera(
      70,
      container.clientWidth / container.clientHeight,
      0.01,
      20
    );
    this.camera.position.set(0, 1.0, 5.0); // Vue d'ensemble élégante du showroom

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Créer le menu de démontage interactif (PC uniquement)
    this.partsMenu = document.createElement('div');
    this.partsMenu.id = 'parts-menu';
    this.partsMenu.style.cssText = `
      position: absolute;
      right: 20px;
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 100;
      max-height: 70vh;
      overflow-y: auto;
      background: rgba(20, 22, 28, 0.8);
      padding: 15px;
      border-radius: 10px;
      border: 1px solid #444;
      color: white;
      font-family: sans-serif;
    `;
    const title = document.createElement('h3');
    title.textContent = 'COMPOSANTS';
    title.style.cssText = 'margin-top: 0; margin-bottom: 10px; font-size: 14px; text-align: center;';
    this.partsMenu.appendChild(title);
    document.body.appendChild(this.partsMenu);

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
      // Cacher le showroom et préparer le ROV pour l'AR
      if (this.showroomGroup) this.showroomGroup.visible = false;
      this.scene.background = null;
      this.scene.fog = null; // Désactiver le brouillard en AR
      if (this.droneModel) {
        this.droneModel.visible = false;
        this.droneModel.scale.set(0.008, 0.008, 0.008); // Échelle AR minuscule (8mm)
      }
      if (this.controls) this.controls.enabled = false;
      if (this.partsMenu) this.partsMenu.style.display = 'none'; // Cacher le menu en AR
    });
    this.renderer.xr.addEventListener('sessionend', () => {
      if (this.uiContainer) this.uiContainer.style.display = 'none';
      // Réafficher le showroom et repositionner le ROV
      if (this.showroomGroup) this.showroomGroup.visible = true;
      const bgColor = new THREE.Color(0x1a1c22);
      this.scene.background = bgColor;
      this.scene.fog = new THREE.FogExp2(bgColor, 0.08); // Réactiver le brouillard
      if (this.droneModel) {
        this.droneModel.visible = true;
        this.droneModel.position.set(0, 0.6, 0); // Sur le socle en verre
        this.droneModel.scale.set(0.018, 0.018, 0.018); // Échelle showroom PC (8cm)
      }
      this.isPlaced = false;
      this.isPlacing = false;
      if (this.placeButton) {
        this.placeButton.style.display = 'block';
        this.placeButton.textContent = 'Faire apparaître ROV';
        this.placeButton.style.opacity = '1';
      }
      if (this.controls) this.controls.enabled = true;
      if (this.partsMenu) this.partsMenu.style.display = 'flex'; // Réafficher le menu
    });

    // 2. Créer l'ARButton avec le conteneur existant
    const arButton = ARButton.createButton(this.renderer, {
      requiredFeatures: ['dom-overlay'],
      domOverlay: { root: this.uiContainer }
    });
    document.body.appendChild(arButton);

    // 3. Supprimer le bouton "AR NOT SUPPORTED" sur PC
    setTimeout(() => {
      const arBtn = document.getElementById('ARButton');
      if (arBtn && arBtn.textContent?.includes('NOT SUPPORTED')) {
        arBtn.style.display = 'none';
      }
    }, 500);

    this.setupShowroom();
    this.setupLights();
    this.createDOMOverlay(); // Ajoute les boutons au conteneur existant
    this.loadDroneModel();
    this.setupXRController();
    this.setupTouchInteractions();
    this.setupOrbitControls();

    this.handleResize(container);
    this.renderer.setAnimationLoop(this.animate.bind(this));
  }

  private setupLights(): void {
    // Lumière d'ambiance douce
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    this.scene.add(ambientLight);

    // Spot principal venant d'en haut à droite (éclairage d'exposition)
    const mainSpot = new THREE.SpotLight(0xffffff, 2);
    mainSpot.position.set(3, 5, 3);
    mainSpot.target.position.set(0, 0.5, 0);
    mainSpot.angle = Math.PI / 6;
    mainSpot.penumbra = 0.2;
    mainSpot.castShadow = true;
    mainSpot.shadow.mapSize.width = 2048;
    mainSpot.shadow.mapSize.height = 2048;
    this.scene.add(mainSpot);
    this.scene.add(mainSpot.target);

    // Contre-jour pour détacher le ROV du fond
    const rimLight = new THREE.SpotLight(0xffffff, 1);
    rimLight.position.set(-2, 3, -4);
    rimLight.target.position.set(0, 0.5, 0);
    rimLight.angle = Math.PI / 4;
    rimLight.penumbra = 0.3;
    this.scene.add(rimLight);
    this.scene.add(rimLight.target);

    // Lumière de remplissage douce
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.3);
    fillLight.position.set(-5, 2, 5);
    this.scene.add(fillLight);
  }

  private setupShowroom(): void {
    this.showroomGroup = new THREE.Group();

    // Sol très large (studio infini)
    const floorGeometry = new THREE.PlaneGeometry(50, 50);
    const floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.8,
      metalness: 0.2,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.51;
    floor.receiveShadow = true;
    this.showroomGroup.add(floor);

    // Grille d'ingénierie (laboratoire de conception)
    const grid = new THREE.GridHelper(50, 50, 0x00aaff, 0x444444);
    grid.position.y = -0.5;
    this.showroomGroup.add(grid);

    // Base en métal brossé
    const baseGeometry = new THREE.CylinderGeometry(1.2, 1.3, 0.15, 64);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.7,
      roughness: 0.4,
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -0.6;
    base.receiveShadow = true;
    this.showroomGroup.add(base);

    // Surface en verre trempé fumé
    const glassGeometry = new THREE.CylinderGeometry(1.0, 1.0, 0.05, 64);
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.05,
      transmission: 0.6,
      thickness: 0.5,
      transparent: true,
      opacity: 0.3,
    });
    const glass = new THREE.Mesh(glassGeometry, glassMaterial);
    glass.position.y = -0.5;
    glass.receiveShadow = true;
    this.showroomGroup.add(glass);

    // Anneau LED bleu fin autour du socle
    const ledRingGeometry = new THREE.TorusGeometry(1.25, 0.02, 16, 100);
    const ledRingMaterial = new THREE.MeshBasicMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.8,
    });
    const ledRing = new THREE.Mesh(ledRingGeometry, ledRingMaterial);
    ledRing.rotation.x = -Math.PI / 2;
    ledRing.position.y = -0.5;
    this.showroomGroup.add(ledRing);

    // Lumière ponctuelle LED subtile
    const ledLight = new THREE.PointLight(0x00aaff, 0.5, 3);
    ledLight.position.set(0, -0.4, 0);
    this.showroomGroup.add(ledLight);

    this.scene.add(this.showroomGroup);
  }

  private setupOrbitControls(): void {
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 2.5; // Bloquer le zoom minimum
    this.controls.maxDistance = 8;
    this.controls.target.set(0, 0.5, 0); // Centré sur le ROV et le socle
    this.controls.update();
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
        // Mode showroom PC : échelle 8cm, positionné sur le verre
        model.scale.set(0.018, 0.018, 0.018);
        model.position.set(0, 0.6, 0); // Affleurant la surface en verre
        model.visible = true;

        // Analyse du modèle et création des boutons de démontage (12 composants majeurs)
        const importantParts: { [key: string]: string } = {
          'Arm_and_Camera_Body_1': 'Bras de Caméra',
          'Camera_Head': 'Tête de Caméra',
          'Laser_Body': 'Corps du Laser',
          'Laser_Head': 'Tête du Laser',
          'HT1_Propeller': 'Propulseur Horiz. Avant Gauche',
          'HT2_Propeller': 'Propulseur Horiz. Avant Droit',
          'HT3_Propeller': 'Propulseur Horiz. Arrière Gauche',
          'HT4_Propeller': 'Propulseur Horiz. Arrière Droit',
          'VT1_Propeller': 'Propulseur Vert. Avant Gauche',
          'VT2_Propeller': 'Propulseur Vert. Avant Droit',
          'VT3_Blades': 'Propulseur Vert. Arrière Gauche',
          'VT4_Propeller': 'Propulseur Vert. Arrière Droit',
        };

        model.traverse((child) => {
          if (child instanceof THREE.Mesh && child.name && importantParts[child.name] && this.partsMenu) {
            const btn = document.createElement('button');
            btn.textContent = importantParts[child.name];
            btn.style.cssText =
              'background: #2a2d35; color: white; border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer; text-align: left; transition: 0.2s; font-size: 13px; border-left: 3px solid #00aaff;';

            btn.onmouseenter = () => {
              btn.style.background = '#3a3d45';
            };
            btn.onmouseleave = () => {
              btn.style.background = '#2a2d35';
            };

            btn.onclick = () => {
              child.visible = !child.visible;
              btn.style.opacity = child.visible ? '1' : '0.4';
              btn.style.borderLeft = child.visible ? '3px solid #00aaff' : '3px solid transparent';
            };

            this.partsMenu.appendChild(btn);
          }
        });

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
    // Mode AR : le ROV suit la caméra en mode placement
    if (this.isPlacing && this.droneModel) {
      this.placementOffset.set(0, -0.5, -2);
      this.placementOffset.applyMatrix4(this.camera.matrixWorld);
      this.droneModel.position.copy(this.placementOffset);
    }

    // Mode showroom : rotation lente élégante si pas en AR
    if (!this.renderer.xr.isPresenting && this.showroomGroup && this.droneModel) {
      this.showroomGroup.rotation.y += 0.003;
      this.droneModel.rotation.y += 0.003;
    }

    if (this.controls) this.controls.update();
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

    if (this.partsMenu) {
      this.partsMenu.remove();
    }
    this.partsMenu = null;

    window.removeEventListener('resize', this.resizeHandler);
    window.removeEventListener('touchstart', this.onTouchStart);
    window.removeEventListener('touchmove', this.onTouchMove);

    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    if (this.showroomGroup) {
      this.scene.remove(this.showroomGroup);
      this.showroomGroup = null;
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
