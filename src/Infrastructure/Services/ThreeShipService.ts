import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { Octree } from 'three/examples/jsm/math/Octree.js';
import { Capsule } from 'three/examples/jsm/math/Capsule.js';
import droneModelUrl from '../../assets/drone.glb?url';
import shipModelUrl from '../../assets/ship.glb?url';
import skyExrUrl from '../../assets/sky.exr?url';
import turbineModelUrl from '../../assets/turbine.glb?url';
import windTurbineModelUrl from '../../assets/wind_turbine.glb?url';
import rov2ModelUrl from '../../assets/ROV2.glb?url';
import { PathRecorder } from '../../Domain/Entities/PathRecorder';
import { ReplayROVMissionUseCase } from '../../Application/UseCases/ReplayROVMission';
import type { IXRService } from '../../Domain/Interfaces/IXRService';


interface SerializedROVPath {
    waypoints: {
        timestamp: number;
        position: { x: number; y: number; z: number };
        rotation: { x: number; y: number; z: number; w: number };
    }[];
}

const DEMO_ROV_Y = -50;
const DEMO_SEABED_Y = -70;
const DEMO_REEF_CENTER_X = 630;
const DEMO_REEF_CENTER_Z = -400;
const PLAYER_SPAWN_Y = 125;
const PLAYER_EYE_HEIGHT = 50;
const PLAYER_SPAWN_POSITION = new THREE.Vector3(0, PLAYER_SPAWN_Y, 5);
const PLAYER_LOOK_AT_POSITION = new THREE.Vector3(700, -55, -500);

export class ThreeShipService implements IXRService {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls!: PointerLockControls;
    private water!: Water;
    private rovCamera!: THREE.PerspectiveCamera;
    private prevTime = performance.now();
    private drone: THREE.Group | null = null;
    private originalDroneMaterials: Map<THREE.Mesh, THREE.Material | THREE.Material[]> = new Map();
    private arMaterial = new THREE.MeshLambertMaterial({ 
        color: 0x00aaaa, 
        transparent: true, 
        opacity: 0.35, // Plus transparent pour l'obscurité
        depthTest: false,
        emissive: 0x00aaaa, // Bleu plus subtil
        emissiveIntensity: 0.3 // Moins éclatant pour la nuit
    });
    private shipModel: THREE.Group | null = null;
    
    // Physique FPS Octree
    private worldOctree = new Octree();
    private playerCollider = new Capsule(
        new THREE.Vector3(PLAYER_SPAWN_POSITION.x, PLAYER_SPAWN_POSITION.y, PLAYER_SPAWN_POSITION.z),
        new THREE.Vector3(PLAYER_SPAWN_POSITION.x, PLAYER_SPAWN_POSITION.y + PLAYER_EYE_HEIGHT, PLAYER_SPAWN_POSITION.z),
        0.5
    );
    private playerVelocity = new THREE.Vector3();
    private playerDirection = new THREE.Vector3();
    private playerOnFloor = false;
    private gravity = 100;
    private keyStates: { [key: string]: boolean } = {};
    private isSimulationActive = false;
    private mouseDownHandler: ((event: MouseEvent) => void) | null = null;
    private replayElapsedTime = 0;
    private pathRecorder = new PathRecorder();
    private replayROVMission = new ReplayROVMissionUseCase();
    private replayFrame = {
        position: new THREE.Vector3(),
        rotation: new THREE.Quaternion(),
    };
    private loadedPathPosition = new THREE.Vector3();
    private loadedPathRotation = new THREE.Quaternion();
    private xrDolly = new THREE.Group();
    private vesselFrame = new THREE.Group();
    private isXRSessionActive = false;
    private isXRSessionStarting = false;
    private isVRStarting = false;
    private controller1?: THREE.Group;
    private controller2?: THREE.Group;
    private teleportMarker?: THREE.Mesh;
    private teleportRaycaster = new THREE.Raycaster();
    private activeTeleportController: THREE.Group | null = null;
    private teleportTargetVector = new THREE.Vector3();
    private isTeleportTargetValid = false;
    private isARModeVRActive = false;
    private rightMenuWasPressed = false;
    private leftMenuWasPressed = false;
    private drone2: THREE.Group | null = null;
    private isDraggingDrone2 = false;
    private draggingController: THREE.Group | null = null;
    private draggedPart: THREE.Mesh | null = null;
    private dragDistance = 2.0;
    private isExplodedView = false;
    private drone2ExplodeData: Map<THREE.Object3D, { 
        originalPos: THREE.Vector3; 
        originalScale: THREE.Vector3; 
        normalizedScale: THREE.Vector3; 
        worldGridTarget?: THREE.Vector3; 
        overriddenPos?: THREE.Vector3;
        overriddenScale?: THREE.Vector3;
    }> = new Map();
    private hoveredMesh: THREE.Mesh | null = null;
    private hoveredOriginalEmissive: THREE.Color = new THREE.Color();
    private tooltipSprite!: THREE.Sprite;
    private tooltipCanvas!: HTMLCanvasElement;
    private tooltipContext!: CanvasRenderingContext2D;
    private tooltipTexture!: THREE.CanvasTexture;
    private rovRenderTarget!: THREE.WebGLRenderTarget;
    private vrMonitorMesh?: THREE.Mesh;
    private cockpitOverlay?: THREE.Mesh;
    private cockpitCanvas!: HTMLCanvasElement;
    private cockpitCtx!: CanvasRenderingContext2D;
    private cockpitTexture!: THREE.CanvasTexture;
    private sonarAngle = 0;
    private sonarBlips: { x: number, y: number, alpha: number, color: string }[] = [];
    private sonarRaycaster = new THREE.Raycaster();

    constructor(containerId: string) {
        const container = document.getElementById(containerId);
        if (!container) throw new Error("Conteneur Three.js introuvable");

        this.scene = new THREE.Scene();
        // On s'assure qu'il n'y a aucun brouillard
        this.scene.fog = null;

        // --- CHARGEMENT DU CIEL EXR HAUTE DÉFINITION ---
        const exrLoader = new EXRLoader();
        exrLoader.load(skyExrUrl, (texture) => {
            texture.mapping = THREE.EquirectangularReflectionMapping;
            
            // Application globale
            this.scene.background = texture;
            this.scene.environment = texture; 
            
            console.log("💎 Ciel EXR chargé ! Le rendu est maintenant en HDR professionnel.");
        }, undefined, (err) => {
            console.error("❌ Erreur de chargement EXR :", err);
            this.scene.background = new THREE.Color(0x87CEEB);
        });

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// On agrandit la "sphère de vision" pour voir jusqu'à 20 kilomètres
this.camera.far = 20000;
this.camera.updateProjectionMatrix(); // Indispensable pour valider le changement
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.autoClear = false; // Permet de superposer les rendus
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.4; // Ciel plus éloigné et moins lumineux
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.xr.enabled = true;
        this.renderer.xr.setReferenceSpaceType('local');
        container.appendChild(this.renderer.domElement);

        // Initialisation du marqueur de téléportation (Cercle COLOSSAL)
        const ringGeo = new THREE.RingGeometry(5.0, 5.8, 32); 
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        this.teleportMarker = new THREE.Mesh(ringGeo, ringMat);
        this.teleportMarker.visible = false;
        this.scene.add(this.teleportMarker);

        this.setupXRSessionEvents();
        this.setupVRControllers();
        this.scene.add(this.vesselFrame);
        this.vesselFrame.add(this.xrDolly);
        this.xrDolly.add(this.camera);

        // --- LUMIÈRES JOURNÉE ---
        // Lumière ambiante douce
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        // Lumière directionnelle soleil
        const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
        sunLight.position.set(50, 100, 50);
        sunLight.target.position.set(0, 0, 0);
        this.scene.add(sunLight);
        this.scene.add(sunLight.target);

        // 2. L'Océan Réaliste (Water Shader)
        const waterGeometry = new THREE.PlaneGeometry(10000, 10000);
        this.water = new Water(waterGeometry, {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/waternormals.jpg', function (texture) {
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: new THREE.Vector3(),
            sunColor: 0xffffff,
            waterColor: 0x000510, // Marine presque noir
            distortionScale: 0.6,
            fog: this.scene.fog !== undefined
        });
        this.water.rotation.x = -Math.PI / 2;
        this.scene.add(this.water);

        // --- CRÉATION DU FOND MARIN ---
        const seabedGeo = new THREE.PlaneGeometry(4200, 4200, 96, 96);
        
        // Déformation procédurale pour simuler des dunes sous-marines
        const pos = seabedGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            // Création de collines douces avec des fonctions sinus
            const z = Math.sin(x * 0.018) * 2.2 + Math.cos(y * 0.018) * 2.2; 
            pos.setZ(i, z);
        }
        seabedGeo.computeVertexNormals(); // Recalcule les ombres

        const seabedTextureLoader = new THREE.TextureLoader();
        const seabedBaseUrl = import.meta.env.BASE_URL + 'seabed/';
        const seabedColorMap = seabedTextureLoader.load(seabedBaseUrl + 'textures/coral_gravel_diff_2k.jpg');
        const seabedNormalMap = seabedTextureLoader.load(seabedBaseUrl + 'textures/coral_gravel_nor_gl_2k.jpg');
        const seabedRoughnessMap = seabedTextureLoader.load(seabedBaseUrl + 'textures/coral_gravel_rough_2k.jpg');
        for (const texture of [seabedColorMap, seabedNormalMap, seabedRoughnessMap]) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(90, 90);
        }
        seabedColorMap.colorSpace = THREE.SRGBColorSpace;

        const seabedMat = new THREE.MeshStandardMaterial({
            color: 0xffffff, // Bleu océan très profond (sable sombre)
            map: seabedColorMap,
            normalMap: seabedNormalMap,
            roughnessMap: seabedRoughnessMap,
            roughness: 0.9,
            metalness: 0.1,
            emissive: 0x06242a,
            emissiveIntensity: 0.5,
            side: THREE.DoubleSide
        });
        
        const seabed = new THREE.Mesh(seabedGeo, seabedMat);
        seabed.rotation.x = -Math.PI / 2; // À plat
        seabed.position.y = DEMO_SEABED_Y; // Profondeur mission -10m
        seabed.position.x = DEMO_REEF_CENTER_X;
        seabed.position.z = DEMO_REEF_CENTER_Z;
        this.scene.add(seabed);
        this.createReefDetails(DEMO_SEABED_Y + 1);

        // --- AJOUT DE L'INFRASTRUCTURE DE MISSION ---
        const turbineLoader = new GLTFLoader();
        turbineLoader.load(turbineModelUrl, (gltf) => {
            const turbine = gltf.scene;
            
            // On la grossit pour qu'elle soit gigantesque (Y=-50 à Y=0)
            turbine.scale.set(25, 25, 25); 
            // On la place sur le fond à -10 (très loin au large)
            turbine.position.set(700, -100, -500); // Très loin au large 

            turbine.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.material = new THREE.MeshStandardMaterial({
                        color: 0xcccccc, // Gris métal/béton
                        roughness: 0.8,
                        envMapIntensity: 1.0
                    });
                }
            });
            
            this.scene.add(turbine);
            console.log("⚡ Fondation d'éolienne ajoutée au centre de mission !");
            
            // Chargement de l'éolienne aérienne (wind_turbine) par-dessus la fondation
            this.loadTurbine();
        });

        // Chargement du navire principal
        const loader = new GLTFLoader();
        // Chargement du navire principal avec traçage complet
        console.log("⏳ [DEBUG SHIP] Tentative de chargement du bateau depuis :", shipModelUrl);

        loader.load(
            shipModelUrl,
            (gltf) => {
                console.log("✅ [DEBUG SHIP] Fichier GLB téléchargé et parsé !");
                
                // 1. Création d'un groupe parent (le wrapper magique)
                this.shipModel = new THREE.Group();
                
                // 2. On ajoute la scène du GLTF dans notre groupe
                this.shipModel.add(gltf.scene);
                
                this.shipModel.scale.set(50, 50, 50); 
                
                // --- POSITIONNEMENT FINAL "GOD MODE" ---
                // On descend le bateau drastiquement (Y=-120) pour que la caméra soit sur le pont
                // On le centre sur la caméra (X=0, Z=0)
                this.shipModel.position.set(-80, -80, -80); 
                
                // --- OPTIMISATION REFLETS EXR ---
                this.shipModel.traverse((child) => {
                    if ((child as THREE.Mesh).isMesh) {
                        const mesh = child as THREE.Mesh;
                        if (mesh.material) {
                            const mat = mesh.material as THREE.MeshStandardMaterial;
                            mat.envMapIntensity = 1.0; // Ajuster entre 0.5 et 1.5 selon le rendu
                            mat.metalness = 0.8; // Pour que la rouille et le métal brillent proprement
                            mat.roughness = 0.2; 
                            mat.needsUpdate = true;
                        }
                    }
                });

                this.vesselFrame.add(this.shipModel);
                console.log("🚢 [DEBUG SHIP] Bateau ajouté à la scène 3D !");
                
                // On donne le modèle à l'Octree pour générer les collisions
                this.worldOctree.fromGraphNode(this.shipModel);
                console.log("🧱 Collisions générées avec succès !");
            },
            (xhr) => {
                // Si le serveur donne la taille totale, on affiche le pourcentage
                if (xhr.total > 0) {
                    console.log(`⏳ [DEBUG SHIP] Chargement : ${Math.round((xhr.loaded / xhr.total) * 100)}%`);
                } else {
                    console.log(`⏳ [DEBUG SHIP] Chargement : ${xhr.loaded} octets reçus...`);
                }
            },
            (error) => {
                console.error("❌ [DEBUG SHIP] Erreur CRITIQUE de chargement :", error);
            }
        );

        // 4. Contrôles FPS (PointerLockControls)
        this.syncCameraWithPlayerCollider();
        this.camera.lookAt(PLAYER_LOOK_AT_POSITION);
        this.xrDolly.position.copy(PLAYER_SPAWN_POSITION);
        this.controls = new PointerLockControls(this.camera, document.body);

        // Correction "Pro" du PointerLock - désactivé par défaut
        const startControls = () => {
            if (this.isXRSessionActive || this.renderer.xr.isPresenting) {
                return;
            }
            if (this.controls && !this.controls.isLocked && this.isSimulationActive && document.pointerLockElement === null) {
                try {
                    this.controls.lock();
                } catch (error) {
                    console.warn('PointerLock ignoré : action utilisateur requise ou verrouillage interrompu.', error);
                }
            }
        };
        this.mouseDownHandler = startControls;
        // Ne pas activer par défaut - sera activé quand la simulation démarre

        // Gestion visuelle de l'UI si elle existe
        const blocker = document.getElementById('blocker');
        const fpsUi = document.getElementById('fps-ui');
        
        // Forcer le z-index de l'UI au cas où elle soit cachée derrière le canvas
        if (fpsUi) fpsUi.style.zIndex = '9999';

        this.controls.addEventListener('lock', () => {
            if (blocker) blocker.style.display = 'none';
        });
        
        this.controls.addEventListener('unlock', () => {
            if (blocker) blocker.style.display = 'flex';
        });

        // Écouteurs Clavier (système Octree)
        document.addEventListener('keydown', (event) => {
            this.keyStates[event.code] = true;
            if (event.key.toLowerCase() === 'v') {
                // 1. Anti-spam absolu : on ignore si la touche est maintenue ou si la VR demarre deja
                if (event.repeat || this.isVRStarting) return;

                if (navigator.xr && !this.renderer.xr.isPresenting) {
                    this.isVRStarting = true; // On verrouille

                    // 2. On libere la souris tout de suite
                    if (this.controls && this.controls.isLocked) {
                        this.controls.unlock();
                    }

                    // 3. On demande la session directement (Three.js gerera le makeXRCompatible en interne)
                    navigator.xr.requestSession('immersive-vr').then((session: XRSession) => {
                        // Fonction recursive pour retenter le coup si la carte graphique redemarre
                        const trySetSession = async (retries = 10) => {
                            try {
                                await this.renderer.xr.setSession(session);
                                console.log("VR Session lancee avec succes !");
                                this.isVRStarting = false; // On deverrouille seulement quand c'est un succes
                            } catch (error) {
                                if (retries > 0) {
                                    console.warn(`Le GPU bascule sur SteamVR, on patiente... (Essais restants: ${retries})`);
                                    // On attend 500ms que le contexte WebGL se restaure avant de reessayer
                                    setTimeout(() => trySetSession(retries - 1), 500);
                                } else {
                                    console.error('Erreur fatale setSession (Timeout) :', error);
                                    this.isVRStarting = false;
                                }
                            }
                        };

                        trySetSession();

                    }).catch((error: unknown) => {
                        console.error('Erreur requestSession :', error);
                        this.isVRStarting = false;
                    });
                } else if (navigator.xr && this.renderer.xr.isPresenting) {
                    // Bonus : Appuyer sur V en VR permet de quitter proprement
                    this.renderer.xr.getSession()?.end();
                }
            }
        });
        document.addEventListener('keyup', (event) => { this.keyStates[event.code] = false; });

        // Redimensionnement
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Chargement du drone sous l'eau
        this.loadDrone();
        this.loadDrone2();
        this.createCockpitOverlay();
        this.initTooltipSystem();

        this.animate = this.animate.bind(this);
        this.renderer.setAnimationLoop(this.animate);
    }

    private loadDrone() {
        const loader = new GLTFLoader();
        loader.load(droneModelUrl, (gltf) => {
            this.drone = gltf.scene;
                
            // --- RÉDUIRE LE ROV ---
            this.drone.scale.set(1, 1, 1); // Taille minimale 
                
            // --- ACTIVER LES PHARES DU ROV ---
            // Un spot puissant qui regarde devant
            const spotLight = new THREE.SpotLight(0xffffff, 140.0, 320, Math.PI / 2.6, 0.45, 1);
            // On le positionne sur le "nez" (selon l'axe avant de ton modèle)
            spotLight.position.set(0, 0, 1); 
            spotLight.target.position.set(0, -8, 60); // Regarde droit devant
                
            this.drone.add(spotLight);
            this.drone.add(spotLight.target);
            
            // 1. POSITION : Plus loin et plus profond
            this.drone.position.set(0, DEMO_ROV_Y, -30); 
            
            // 2. ORIENTATION : Rotation pour que l'avant (ne) face l'horizon droit
            // Le ROV se déplace vers +X (horizon droit), donc on le tourne de -90° sur Y
            this.drone.rotation.y = -Math.PI / 2; 

            // 3. Sauvegarde et correction des matériaux
            this.drone.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (mesh.material) {
                        (mesh.material as THREE.Material).side = THREE.DoubleSide;
                    }
                    this.originalDroneMaterials.set(mesh, mesh.material);
                }
            });


            // --- CAMÉRA EMBARQUÉE DU ROV ---
            this.rovCamera = new THREE.PerspectiveCamera(60, 320 / 180, 0.1, 1000);
            // Ajuste ces valeurs selon l'axe 'avant' de ton modèle 3D
            this.rovCamera.position.set(0, 0.5, 40); 
            this.rovCamera.lookAt(0, 0.5, 50); 
            this.drone.add(this.rovCamera);

            this.scene.add(this.drone);
            void this.loadDemoROVPath();
            console.log("🤖 [ThreeShipService] Drone en position sous-marine !");
        }, undefined, (error) => {
            console.error("❌ Erreur de chargement GLB :", error);
        });
    }

    private loadTurbine() {
        const loader = new GLTFLoader();
        loader.load(windTurbineModelUrl, (gltf) => {
            const turbine = gltf.scene;
            
            // Échelle géante pour correspondre à la fondation (qui a une échelle de 25)
            turbine.scale.set(150, 100, 150); 
            
            // Orientation de 90° vers le bateau
            turbine.rotation.y = -Math.PI / 2;
            
            // Positionnée exactement au niveau de la mer par-dessus la fondation (700, 0, -500)
            turbine.position.set(700, 0, -500); 

            // Intégration à l'Octree physique du monde pour les collisions ROV/Navire
            turbine.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    this.worldOctree.fromGraphNode(child);
                }
            });
            
            this.scene.add(turbine);
            console.log(" [ThreeShipService] Turbine éolienne (wind_turbine) chargée au centre de la fondation !");
        }, undefined, (error) => {
            console.error(" Erreur de chargement de la turbine éolienne :", error);
        });
    }

    private loadDrone2() {
        const loader = new GLTFLoader();
        loader.load(rov2ModelUrl, (gltf) => {
            this.drone2 = gltf.scene;
            this.drone2.scale.set(0.5, 0.5, 0.5);
            this.drone2.visible = false;

            this.drone2.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    
                    // Calcul de l'encombrement spatial réel de la pièce
                    const meshBox = new THREE.Box3().setFromObject(mesh);
                    const size = new THREE.Vector3();
                    meshBox.getSize(size);
                    const maxDim = Math.max(size.x, size.y, size.z);
                    
                    // On veut que chaque pièce fasse exactement 0.3m (30cm) pour rentrer dans la grille
                    const scaleFactor = maxDim > 0.001 ? 0.3 / maxDim : 1;
                    const normalizedScale = mesh.scale.clone().multiplyScalar(scaleFactor);

                    this.drone2ExplodeData.set(mesh, { 
                        originalPos: mesh.position.clone(),
                        originalScale: mesh.scale.clone(),
                        normalizedScale: normalizedScale
                    });
                }
            });

            this.scene.add(this.drone2);
            console.log(" [ThreeShipService] ROV2 chargé !");
        }, undefined, (error) => {
            console.error(" Erreur de chargement ROV2 :", error);
        });
    }

    private createCockpitOverlay() {
        this.cockpitCanvas = document.createElement('canvas');
        this.cockpitCanvas.width = 1024;
        this.cockpitCanvas.height = 512;
        this.cockpitCtx = this.cockpitCanvas.getContext('2d')!;
        this.cockpitTexture = new THREE.CanvasTexture(this.cockpitCanvas);

        const overlayGeo = new THREE.PlaneGeometry(0.8, 0.4);
        const overlayMat = new THREE.MeshBasicMaterial({
            map: this.cockpitTexture,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });

        this.cockpitOverlay = new THREE.Mesh(overlayGeo, overlayMat);
        this.cockpitOverlay.visible = false;
        this.camera.add(this.cockpitOverlay);
        this.cockpitOverlay.position.set(0, -0.08, -0.59);
    }

    private updateCockpitHUD(delta: number) {
        if (!this.cockpitOverlay || !this.cockpitOverlay.visible || !this.drone) return;

        const ctx = this.cockpitCtx;
        const canvas = this.cockpitCanvas;
        
        // COORDONNÉES ÉCARTÉES VERS LES BORDS (Laissant le centre dégagé pour la vidéo)
        const leftX = 180;  // Décalé à gauche (ancien 250)
        const rightX = 844; // Décalé à droite (ancien 774)
        const sonarX = 290; // Décalé à gauche (ancien 330)
        const sonarY = 160;
        const sonarR = 70;
        const maxSonarRange = 250.0; // Portée de 250m pour les pylônes de l'éolienne

        // 0. FOND GLOBAL FUMÉ
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(0, 15, 30, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // --- 1. MOTEUR DU SONAR 360° (RAYCASTING PHYSIQUE) ---
        this.sonarAngle += delta * 3.0; // Vitesse de rotation du balayage
        if (this.sonarAngle > Math.PI * 2) this.sonarAngle -= Math.PI * 2;

        // Direction locale du rayon (parfaitement plat sur l'horizon, Y = 0)
        const sweepDir = new THREE.Vector3(Math.sin(this.sonarAngle), 0, -Math.cos(this.sonarAngle));
        sweepDir.applyQuaternion(this.drone.quaternion).normalize(); // Orienté selon le cap du drone
        
        const rovPos = new THREE.Vector3();
        this.drone.getWorldPosition(rovPos);
        this.sonarRaycaster.set(rovPos, sweepDir);
        this.sonarRaycaster.far = maxSonarRange;
        
        // FIX CRITIQUE : Assigner la caméra au raycaster pour éviter le crash sur les Sprites
        this.sonarRaycaster.camera = this.camera; 

        const intersects = this.sonarRaycaster.intersectObjects(this.scene.children, true);
        let hitDistance = -1;

        for (const hit of intersects) {
            // Le sonar traverse les objets invisibles (boîtes de collision, triggers)
            if (!hit.object.visible) continue;

            // Exclure l'eau, le drone lui-même, l'UI éclatée, etc.
            const isWater = hit.object === this.water;
            const isDrone = hit.object.name.includes('ROV') || hit.object === this.drone || hit.object === this.drone2;
            const isHUD = hit.object === this.teleportMarker || hit.object === this.cockpitOverlay || hit.object === this.vrMonitorMesh;
            
            if (!isWater && !isDrone && !isHUD) {
                hitDistance = hit.distance;
                break; // Premier vrai obstacle physique touché
            }
        }

        if (hitDistance > 0) {
            const ratio = hitDistance / maxSonarRange;
            // Dessin du point sur le canvas (Y inversé par rapport à la 3D)
            const localX = Math.sin(this.sonarAngle) * (ratio * sonarR);
            const localY = -Math.cos(this.sonarAngle) * (ratio * sonarR);
            
            this.sonarBlips.push({
                x: localX, y: localY, alpha: 1.0,
                color: hitDistance < 20 ? '#ff0055' : '#ffcc00' // Rouge si < 20m, jaune sinon
            });
        }

        // --- DESSIN DE L'UI DU SONAR ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath(); ctx.arc(sonarX, sonarY, sonarR + 5, 0, 2 * Math.PI); ctx.fill();

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.9)'; ctx.lineWidth = 2;
        for(let r = 20; r <= sonarR; r += 20) {
            ctx.beginPath(); ctx.arc(sonarX, sonarY, r, 0, 2 * Math.PI); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(sonarX - sonarR, sonarY); ctx.lineTo(sonarX + sonarR, sonarY);
        ctx.moveTo(sonarX, sonarY - sonarR); ctx.lineTo(sonarX, sonarY + sonarR); ctx.stroke();

        // Faisceau de balayage visuel (Secteur)
        ctx.fillStyle = 'rgba(0, 255, 204, 0.3)';
        ctx.beginPath(); ctx.moveTo(sonarX, sonarY);
        const visualAngle = this.sonarAngle - Math.PI / 2; // Offset Canvas
        ctx.arc(sonarX, sonarY, sonarR, visualAngle - 0.6, visualAngle); ctx.fill();

        // Dessin et Fondu des Blips
        for (let i = this.sonarBlips.length - 1; i >= 0; i--) {
            const blip = this.sonarBlips[i];
            blip.alpha -= delta * 0.4; // Disparaît en 2.5 secondes
            if (blip.alpha <= 0) {
                this.sonarBlips.splice(i, 1);
                continue;
            }
            ctx.globalAlpha = blip.alpha;
            ctx.fillStyle = blip.color; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.arc(sonarX + blip.x, sonarY + blip.y, 4, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
        }
        ctx.globalAlpha = 1.0;

        ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 16px monospace'; ctx.textAlign = 'center';
        ctx.fillText('SONAR MAP', sonarX, sonarY - sonarR - 15);

        // --- 2. JAUGES DYNAMIQUES (PROFONDEUR ET ASSIETTE) ---
        const depth = Math.max(0, -rovPos.y);
        const pitch = -(new THREE.Euler().setFromQuaternion(this.drone.quaternion, 'YXZ').x) * (180 / Math.PI);

        [ {x: leftX, val: depth, max: 100, label: 'DEPTH', unit: 'm'}, {x: rightX, val: pitch, max: 50, label: 'PITCH', unit: '°'} ].forEach(gauge => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(gauge.x - 55, 80, 110, 350);
            ctx.strokeStyle = '#00ffcc'; ctx.fillStyle = '#00ffcc'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(gauge.x, 100); ctx.lineTo(gauge.x, 412); ctx.stroke();
            for (let i = 0; i <= 10; i++) {
                const y = 100 + i * 31.2;
                ctx.beginPath(); ctx.moveTo(gauge.x, y); ctx.lineTo(gauge.x + (gauge.label === 'DEPTH' ? 15 : -15), y); ctx.stroke();
            }
            
            // Position du curseur animée
            const ratio = gauge.label === 'DEPTH' ? Math.min(gauge.val / gauge.max, 1.0) : (gauge.max - Math.max(-gauge.max, Math.min(gauge.max, gauge.val))) / (gauge.max * 2);
            const cursorY = 100 + ratio * 312;
            ctx.beginPath(); ctx.moveTo(gauge.x, cursorY); 
            ctx.lineTo(gauge.x + (gauge.label === 'DEPTH' ? 25 : -25), cursorY - 10);
            ctx.lineTo(gauge.x + (gauge.label === 'DEPTH' ? 25 : -25), cursorY + 10); ctx.fill();
            
            // Valeur numérique qui suit le curseur animée
            ctx.font = 'bold 20px monospace'; 
            ctx.textAlign = gauge.label === 'DEPTH' ? 'left' : 'right';
            ctx.fillText(gauge.val.toFixed(1) + gauge.unit, gauge.x + (gauge.label === 'DEPTH' ? 35 : -35), cursorY + 6);
            
            // Titre fixe centré tout en haut de la jauge (aligné parfaitement au-dessus sur gauge.x)
            ctx.font = 'bold 18px monospace';
            ctx.fillStyle = '#00ffcc'; // S'assurer que le texte est bien cyan brillant
            ctx.textAlign = 'center';
            ctx.fillText(gauge.label, gauge.x, 70);
        });

        // --- 3. INFOS TEXTUELLES ET RÉTICULE ---
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(256, 400, 512, 90);
        ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 24px monospace'; ctx.textAlign = 'center';
        ctx.fillText('SYS: ROV COCKPIT HUD AR', 512, 435);
        ctx.font = 'bold 20px monospace'; ctx.fillStyle = '#00ff99';
        ctx.fillText(`BATTERY: 98% | LATENCY: ${Math.floor(Math.random()*5+20)}ms | DEPTH: ${depth.toFixed(1)}m`, 512, 470);

        ctx.strokeStyle = 'rgba(0, 255, 204, 0.8)'; ctx.beginPath(); ctx.arc(512, 256, 18, 0, 2 * Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(462, 256); ctx.lineTo(482, 256); ctx.moveTo(542, 256); ctx.lineTo(562, 256); ctx.moveTo(512, 206); ctx.lineTo(512, 226); ctx.moveTo(512, 286); ctx.lineTo(512, 306); ctx.stroke();

        // Envoi de la texture rafraîchie à la carte graphique
        this.cockpitTexture.needsUpdate = true;
    }

    private initTooltipSystem() {
        this.tooltipCanvas = document.createElement('canvas');
        this.tooltipCanvas.width = 512;
        this.tooltipCanvas.height = 128;
        this.tooltipContext = this.tooltipCanvas.getContext('2d')!;
        this.tooltipTexture = new THREE.CanvasTexture(this.tooltipCanvas);
        
        const spriteMat = new THREE.SpriteMaterial({ 
            map: this.tooltipTexture, 
            depthTest: false,
            transparent: true 
        });
        this.tooltipSprite = new THREE.Sprite(spriteMat);
        this.tooltipSprite.scale.set(0.6, 0.15, 1);
        this.tooltipSprite.visible = false;
        this.tooltipSprite.renderOrder = 999; // Toujours au premier plan
        this.scene.add(this.tooltipSprite);
    }

    private updateTooltipText(text: string) {
        const ctx = this.tooltipContext;
        ctx.clearRect(0, 0, 512, 128);

        // Fond
        ctx.fillStyle = 'rgba(0, 20, 30, 0.85)';
        ctx.fillRect(10, 10, 492, 108);
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 4;
        ctx.strokeRect(10, 10, 492, 108);

        // Nettoyage du texte et traduction basique
        let cleanText = text.replace(/[-_0-9]/g, ' ').trim().toUpperCase();
        if (!cleanText || cleanText === 'NODE') cleanText = "PIÈCE STRUCTURELLE";
        if (cleanText.includes('BATTERY')) cleanText = "BATTERIE PRINCIPALE";
        if (cleanText.includes('MOTOR') || cleanText.includes('THRUSTER')) cleanText = "MOTEUR / PROPULSEUR";

        // Texte adaptatif
        ctx.fillStyle = '#00ffcc';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        let fontSize = 40;
        ctx.font = `bold ${fontSize}px monospace`;
        while (ctx.measureText(cleanText).width > 460 && fontSize > 15) {
            fontSize -= 2;
            ctx.font = `bold ${fontSize}px monospace`;
        }

        ctx.fillText(cleanText, 256, 64);
        this.tooltipTexture.needsUpdate = true;
    }

    public toggleARMode(isActive: boolean) {
        // 1. Afficher/masquer le panneau de données AR
        const dataPanel = document.getElementById('ar-data-panel');
        if (dataPanel) dataPanel.style.display = isActive ? 'block' : 'none';

        // 2. NE PAS TOUCHER À L'EAU (Garder le monde normal)
        // if (this.water) this.water.visible = !isActive; // <- Supprimé

        // 3. NE PAS TOUCHER AU CIEL (Garder la couleur du jour)
        // if (isActive) { ... } else { ... } // <- Supprimé

        // 4. Eau marine profonde (distortionScale fixe à 0.8)
        if (this.water) {
            this.water.material.uniforms['distortionScale'].value = 0.8;
        }

        // Rendre le navire semi-transparent en mode AR
        if (this.shipModel) {
            this.shipModel.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    const mat = mesh.material as THREE.Material;
                    
                    if (isActive) {
                        // Mode AR : active transparence X-Ray
                        mat.transparent = true;
                        mat.opacity = 0.15; 
                    } else {
                        // Mode Normal : opaque avec textures
                        mat.transparent = false;
                        mat.opacity = 1.0;
                    }
                    mat.needsUpdate = true;
                }
            });
        }

        // --- GESTION DE LA VIDÉO HUD ---
        let videoContainer = document.getElementById('rov-video-hud');
        
        // Création du conteneur s'il n'existe pas encore
        if (!videoContainer) {
            videoContainer = document.createElement('div');
            videoContainer.id = 'rov-video-hud';
            videoContainer.style.position = 'fixed';
            videoContainer.style.top = '20px';
            videoContainer.style.left = '20px';
            videoContainer.style.width = '600px';
            videoContainer.style.height = '340px';
            videoContainer.style.backgroundColor = 'transparent'; // Important
            videoContainer.style.border = '2px solid #00ffcc';
            videoContainer.style.borderRadius = '8px';
            videoContainer.style.zIndex = '1000';
            videoContainer.style.boxShadow = '0 0 15px rgba(0, 255, 204, 0.3)';
            videoContainer.style.overflow = 'hidden';
            videoContainer.style.transition = 'opacity 0.3s ease-in-out';
            
            // Structure interne : Vidéo (placeholder pour l'instant) + Badge Texte
            videoContainer.innerHTML = `
                <div style="position:absolute; top:8px; left:8px; color:#00ffcc; font-family:monospace; font-size:12px; background:rgba(0,0,0,0.7); padding:4px 8px; border-radius: 4px; display:flex; align-items:center; gap: 5px; z-index: 2;">
                    <div style="width:8px; height:8px; background-color:red; border-radius:50%; animation: blink 1s infinite;"></div>
                    ROV CAM 01 - LIVE
                </div>
                <style>@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }</style>
            `;
            document.body.appendChild(videoContainer);
        }

        // Affichage ou masquage selon l'état du mode AR
        if (isActive) {
            videoContainer.style.display = 'block';
            setTimeout(() => { if(videoContainer) videoContainer.style.opacity = '1'; }, 10);
        } else {
            videoContainer.style.opacity = '0';
            setTimeout(() => { if(videoContainer) videoContainer.style.display = 'none'; }, 300);
        }

        // 5. Transformer le drone en Hologramme
        if (this.drone) {
            this.drone.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    mesh.material = isActive ? this.arMaterial : this.originalDroneMaterials.get(mesh)!;
                }
            });
        }
        this.updateROVTelemetryUI();
    }

    public async startImmersiveAR(): Promise<void> {
        if (!navigator.xr) {
            throw new Error('WebXR indisponible sur ce navigateur.');
        }

        const isSupported = await navigator.xr.isSessionSupported('immersive-ar');
        if (!isSupported) {
            throw new Error("Le mode WebXR immersive-ar n'est pas supporté sur cet appareil.");
        }

        this.deactivateSimulation();
        this.xrDolly.position.copy(PLAYER_SPAWN_POSITION);
        this.camera.position.set(0, PLAYER_EYE_HEIGHT, 0);

        const session = await navigator.xr.requestSession('immersive-ar', {
            requiredFeatures: ['local-floor'],
        });

        await this.renderer.xr.setSession(session);
    }

    public async startImmersiveVR(): Promise<void> {
        if (this.isXRSessionActive || this.isXRSessionStarting || this.renderer.xr.isPresenting) {
            return;
        }

        if (!navigator.xr) {
            console.error('WebXR indisponible sur ce navigateur.');
            return;
        }

        this.isXRSessionStarting = true;
        this.deactivateSimulation();
        if (this.controls?.isLocked) {
            this.controls.unlock();
        }
        this.keyStates = {};
        this.xrDolly.position.copy(PLAYER_SPAWN_POSITION);
        // On surélève le Dolly pour compenser l'espace 'local' de WebXR
        this.xrDolly.position.y += PLAYER_EYE_HEIGHT;
        this.camera.position.set(0, PLAYER_EYE_HEIGHT, 0);

        try {
            const session = await navigator.xr.requestSession('immersive-vr');
            await this.renderer.xr.setSession(session);
        } catch (error) {
            this.isXRSessionStarting = false;
            console.error("Erreur lancement VR:", error);
        }
    }

    private setupXRSessionEvents(): void {
        this.renderer.xr.addEventListener('sessionstart', () => {
            this.isXRSessionStarting = false;
            this.isXRSessionActive = true;
            this.deactivateSimulation();
            this.keyStates = {};
            if (this.controls?.isLocked) {
                this.controls.unlock();
            }
        });

        this.renderer.xr.addEventListener('sessionend', () => {
            this.isXRSessionStarting = false;
            this.isXRSessionActive = false;
            this.keyStates = {};
            this.xrDolly.position.copy(PLAYER_SPAWN_POSITION);
            // On surélève le Dolly pour compenser l'espace 'local' de WebXR
            this.xrDolly.position.y += PLAYER_EYE_HEIGHT;
            this.camera.position.set(0, PLAYER_EYE_HEIGHT, 0);
            this.playerVelocity.set(0, 0, 0);
        });
    }

    private setupVRControllers() {
        // Création d'un rayon visuel (laser blanc de 1 mètre)
        const geometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 0, -1)
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0xffffff });

        // Création de la cible de rendu pour le flux vidéo du ROV (Résolution 512x512)
        this.rovRenderTarget = new THREE.WebGLRenderTarget(512, 512);

        // Création de l'écran physique (Mesh)
        const monitorGeo = new THREE.PlaneGeometry(0.4, 0.3); // Taille : 40cm x 30cm
        const monitorMat = new THREE.MeshBasicMaterial({
            map: this.rovRenderTarget.texture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.85 // Légère transparence pour garder la conscience de l'eau derrière
        });
        this.vrMonitorMesh = new THREE.Mesh(monitorGeo, monitorMat);

        // On attache l'écran directement à la caméra (le casque) pour qu'il suive le regard
        this.camera.add(this.vrMonitorMesh); 
        // Ajustement pour qu'il soit devant les yeux (légèrement en dessous du centre)
        this.vrMonitorMesh.position.set(0, -0.08, -0.6); 
        this.vrMonitorMesh.rotation.set(0, 0, 0);
        this.vrMonitorMesh.visible = false; // Caché par défaut

        // Contrôleur 1
        this.controller1 = this.renderer.xr.getController(0);
        this.controller1.addEventListener('connected', (event: any) => {
            if (this.controller1) this.controller1.userData.inputSource = event.data;
        });
        this.controller1.add(new THREE.Line(geometry, material));
        this.xrDolly.add(this.controller1);

        // Contrôleur 2
        this.controller2 = this.renderer.xr.getController(1);
        this.controller2.addEventListener('connected', (event: any) => {
            if (this.controller2) this.controller2.userData.inputSource = event.data;
        });
        this.controller2.add(new THREE.Line(geometry, material));
        this.xrDolly.add(this.controller2);
    }

    public update() {
        if (!this.drone) return;

        // Stabilisation absolue (pas de tremblement, le drone reste droit)
        this.drone.rotation.x = 0; 
        this.drone.rotation.z = 0;
    }

    private async loadDemoROVPath() {
        try {
            const response = await fetch(`${import.meta.env.BASE_URL}data/rov-demo-path.json`);
            if (!response.ok) return;

            const path = await response.json() as SerializedROVPath;
            this.pathRecorder.clear();
            if (path.waypoints.length === 0) return;

            for (const waypoint of path.waypoints) {
                this.loadedPathPosition.set(waypoint.position.x, DEMO_ROV_Y, waypoint.position.z);
                this.loadedPathRotation.set(waypoint.rotation.x, waypoint.rotation.y, waypoint.rotation.z, waypoint.rotation.w);
                this.pathRecorder.record(this.loadedPathPosition, this.loadedPathRotation, waypoint.timestamp);
            }

            const firstWaypoint = path.waypoints[0];
            if (this.drone) {
                this.drone.position.set(firstWaypoint.position.x, DEMO_ROV_Y, firstWaypoint.position.z);
                this.drone.quaternion.set(firstWaypoint.rotation.x, firstWaypoint.rotation.y, firstWaypoint.rotation.z, firstWaypoint.rotation.w);
            }
            this.replayElapsedTime = 0;
        } catch {
            this.pathRecorder.clear();
        }
    }

    private updateReplayROV(deltaTime: number) {
        if (!this.drone || this.pathRecorder.count < 2) return;

        this.replayElapsedTime += deltaTime;
        if (this.replayROVMission.execute(this.pathRecorder.getWaypoints(), this.replayElapsedTime, this.replayFrame)) {
            this.drone.position.copy(this.replayFrame.position);
            this.drone.quaternion.copy(this.replayFrame.rotation);
        }
    }

    private createReefDetails(seabedY: number) {
        const reefGroup = new THREE.Group();
        const coralColors = [0xff5f7e, 0xff9f43, 0x9b5de5, 0x00bbf9, 0x80ed99, 0xffd166];
        const coralGeometries = [
            new THREE.ConeGeometry(1.4, 5, 7),
            new THREE.CylinderGeometry(0.35, 0.75, 4, 6),
            new THREE.IcosahedronGeometry(1.8, 0),
        ];
        const rockGeometry = new THREE.DodecahedronGeometry(2.2, 0);
        const seaweedGeometry = new THREE.CylinderGeometry(0.18, 0.35, 5, 5);

        for (let index = 0; index < 150; index++) {
            const geometry = coralGeometries[index % coralGeometries.length];
            const color = coralColors[index % coralColors.length];
            const material = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.18,
                roughness: 0.85,
                metalness: 0,
            });
            const coral = new THREE.Mesh(geometry, material);
            const angle = index * 2.399963229728653;
            const radius = 35 + (index % 17) * 24;
            coral.position.set(
                DEMO_REEF_CENTER_X + Math.cos(angle) * radius,
                seabedY,
                DEMO_REEF_CENTER_Z + Math.sin(angle) * radius,
            );
            const scale = 1.1 + (index % 6) * 0.24;
            coral.scale.set(scale, scale, scale);
            coral.rotation.y = angle;
            reefGroup.add(coral);
        }

        for (let index = 0; index < 70; index++) {
            const geometry = coralGeometries[index % coralGeometries.length];
            const color = coralColors[(index + 2) % coralColors.length];
            const material = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.35,
                roughness: 0.8,
                metalness: 0,
            });
            const coral = new THREE.Mesh(geometry, material);
            const angle = index * 2.19;
            const radius = 8 + (index % 8) * 8;
            coral.position.set(
                150 + Math.cos(angle) * radius,
                seabedY,
                27 + Math.sin(angle) * radius,
            );
            const scale = 1.5 + (index % 5) * 0.35;
            coral.scale.set(scale, scale, scale);
            coral.rotation.y = angle;
            reefGroup.add(coral);
        }

        for (let index = 0; index < 45; index++) {
            const material = new THREE.MeshStandardMaterial({
                color: 0x3b4a46,
                roughness: 1,
                metalness: 0,
            });
            const rock = new THREE.Mesh(rockGeometry, material);
            const angle = index * 2.071;
            const radius = 50 + (index % 11) * 34;
            rock.position.set(
                DEMO_REEF_CENTER_X + Math.cos(angle) * radius,
                seabedY - 0.2,
                DEMO_REEF_CENTER_Z + Math.sin(angle) * radius,
            );
            const scale = 1.2 + (index % 5) * 0.45;
            rock.scale.set(scale * 1.4, scale * 0.55, scale);
            rock.rotation.set(index * 0.31, angle, index * 0.17);
            reefGroup.add(rock);
        }

        for (let index = 0; index < 90; index++) {
            const material = new THREE.MeshStandardMaterial({
                color: 0x1b8a5a,
                emissive: 0x0b3d2d,
                emissiveIntensity: 0.2,
                roughness: 0.75,
                metalness: 0,
            });
            const seaweed = new THREE.Mesh(seaweedGeometry, material);
            const angle = index * 2.63;
            const radius = 45 + (index % 15) * 26;
            seaweed.position.set(
                DEMO_REEF_CENTER_X + Math.cos(angle) * radius,
                seabedY + 2.5,
                DEMO_REEF_CENTER_Z + Math.sin(angle) * radius,
            );
            const scale = 0.8 + (index % 4) * 0.2;
            seaweed.scale.set(scale, 0.8 + (index % 5) * 0.25, scale);
            seaweed.rotation.z = Math.sin(index) * 0.22;
            reefGroup.add(seaweed);
        }

        this.scene.add(reefGroup);
    }

    private updateROVTelemetryUI() {
        if (!this.drone) return;

        const depthElement = document.getElementById('data-depth');
        const tempElement = document.getElementById('data-temp');
        const depth = Math.max(0, -this.drone.position.y);
        if (depthElement) {
            depthElement.innerText = depth.toFixed(2);
        }
        if (tempElement) {
            const temperature = Math.max(2.5, 12 - depth * 0.025);
            tempElement.innerText = temperature.toFixed(2);
        }
    }

    private animate() {
        if (this.water) {
            this.water.material.uniforms['time'].value += 1.0 / 60.0;
        }
        
        const time = performance.now();
        let delta = (time - this.prevTime) / 1000;
        if (delta > 0.1) delta = 0.1;
        this.updateReplayROV(delta);
        this.updateROVTelemetryUI();
        
        // Mise à jour du Cockpit Virtuel en temps réel
        this.updateCockpitHUD(delta);

        if (this.drone2 && this.drone2.visible) {
            if (!this.isExplodedView) this.drone2.rotation.y += 0.002; 

            this.drone2.traverse((child) => {
                if ((child as THREE.Mesh).isMesh && child !== this.draggedPart) {
                    const data = this.drone2ExplodeData.get(child);
                    if (data) {
                        // Calcul de la cible
                        let targetLocalPos = data.originalPos;
                        let targetScale = data.originalScale;

                        if (this.isExplodedView) {
                            if (data.worldGridTarget) {
                                if (data.overriddenPos) {
                                    targetLocalPos = data.overriddenPos;
                                } else {
                                    targetLocalPos = child.parent!.worldToLocal(data.worldGridTarget.clone());
                                }
                            }
                            // Priorité : 1. Taille customisée (si manipulée) -> 2. Taille standard de grille (30cm)
                            targetScale = data.overriddenScale ? data.overriddenScale : data.normalizedScale;
                        }

                        child.position.lerp(targetLocalPos, 0.15);
                        child.scale.lerp(targetScale, 0.15);
                    }
                }
            });
        }

        if (!this.renderer.xr.isPresenting) {
            if (this.controls && this.controls.isLocked === true) {
                // Limitation du delta pour éviter les sauts physiques
                // Mise à jour physique FPS Octree
                this.updatePlayer(delta);
            }
        }

        // 1. Nettoyage
        this.renderer.clear();

        // CORRECTION CIEL : En VR, la caméra locale reste à 0, il faut sa vraie position dans le monde
        const headWorldPos = new THREE.Vector3();
        this.camera.getWorldPosition(headWorldPos);
        this.setAtmosphereForHeight(headWorldPos.y);

        // CORRECTION OEIL GAUCHE : On interdit au code de forcer un écran unique en VR
        if (!this.renderer.xr.isPresenting) {
            this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
            this.renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
            this.renderer.setScissorTest(true);
        }

        // 2. RENDU CAMÉRA PRINCIPALE
        this.renderer.render(this.scene, this.camera);

        // --- 3. LOGIQUE DES MANETTES VR (Doit être exécutée APRÈS le rendu) ---
        if (this.renderer.xr.isPresenting) {
            const session = this.renderer.xr.getSession();
            const inputSources = session ? Array.from(session.inputSources) : [];
            let rightARPressed = false;
            let leftSummonPressed = false;
            let currentHitMesh: THREE.Mesh | null = null;
            let currentHitPoint = new THREE.Vector3();

            [this.controller1, this.controller2].forEach((controller, index) => {
                if (!controller) return;
                
                const inputSource = controller.userData.inputSource || inputSources[index];
                if (!inputSource || !inputSource.gamepad) return;

                const trigger = inputSource.gamepad.buttons[0];  
                const grip = inputSource.gamepad.buttons[1];     
                const touchpad = inputSource.gamepad.buttons[2]; 
                const menuBtn = inputSource.gamepad.buttons[3];  

                const isXRPressed = (touchpad && touchpad.pressed) || (trigger && trigger.pressed);
                const isMenuOrGrip = (menuBtn && menuBtn.pressed) || (grip && grip.pressed);

                // DISPATCH PAR MAIN (HANDEDNESS)
                if (isMenuOrGrip) {
                    if (inputSource.handedness === 'right') {
                        rightARPressed = true;
                    } else if (inputSource.handedness === 'left') {
                        leftSummonPressed = true;
                    } else {
                        // Fallback si le casque ne précise pas la main
                        if (index === 0) rightARPressed = true;
                        if (index === 1) leftSummonPressed = true;
                    }
                }

                // Calcul préalable systématique de l'origine et de la direction du laser
                const tempMatrix = new THREE.Matrix4();
                tempMatrix.extractRotation(controller.matrixWorld);
                const direction = new THREE.Vector3(0, 0, -1).applyMatrix4(tempMatrix).normalize();
                
                const laserOrigin = new THREE.Vector3();
                controller.getWorldPosition(laserOrigin);
                this.teleportRaycaster.set(laserOrigin, direction);

                // --- LOGIQUE DE SURBRILLANCE ET TRACTEUR SUR LE ROV2 ---
                const isTriggerPressed = trigger && trigger.pressed;
                
                if (this.drone2 && this.drone2.visible && !this.isDraggingDrone2 && !this.draggedPart) {
                    const droneIntersects = this.teleportRaycaster.intersectObject(this.drone2, true);
                    if (droneIntersects.length > 0) {
                        currentHitMesh = droneIntersects[0].object as THREE.Mesh;
                        currentHitPoint.copy(droneIntersects[0].point);
                        
                        if (isTriggerPressed) {
                            if (this.isExplodedView) {
                                this.draggedPart = currentHitMesh; // On attrape juste LA pièce
                            } else {
                                this.isDraggingDrone2 = true; // On attrape TOUT le drone
                            }
                            this.draggingController = controller;
                            this.dragDistance = 2.0; // Réinitialisation de la distance de drag
                        }
                    }
                }

                // --- AJUSTEMENT DE DISTANCE ET TAILLE AU TOUCHPAD ---
                if (this.draggingController === controller && (this.isDraggingDrone2 || this.draggedPart)) {
                    const touchpadAxes = inputSource.gamepad.axes;
                    if (touchpadAxes && touchpadAxes.length >= 2) {
                        const slideX = touchpadAxes[0]; // Axe X (-1 gauche, 1 droite)
                        const slideY = touchpadAxes[1]; // Axe Y (-1 haut, 1 bas)

                        // Ajustement de la distance (Haut/Bas)
                        if (Math.abs(slideY) > 0.1) {
                            this.dragDistance += slideY * 0.05;
                            this.dragDistance = Math.max(0.5, Math.min(this.dragDistance, 5.0));
                        }

                        // Ajustement de la taille (Gauche/Droite) uniquement pour la pièce saisie
                        if (Math.abs(slideX) > 0.1 && this.draggedPart) {
                            const scaleAdjust = 1.0 + (slideX * 0.03); // Multiplicateur de sensibilité
                            this.draggedPart.scale.multiplyScalar(scaleAdjust);
                        }
                    }
                }

                // --- DÉPLACEMENT DE L'OBJET SAISI (DRAG & DROP) ---
                if (this.draggingController === controller && (this.isDraggingDrone2 || this.draggedPart)) {
                    if (isTriggerPressed) {
                        // Cible spatiale fixée par dragDistance
                        const grabTarget = laserOrigin.clone().add(direction.multiplyScalar(this.dragDistance));
                        
                        if (this.draggedPart) {
                            // Utiliser le parent direct pour gérer les pièces imbriquées dans le GLTF
                            this.draggedPart.parent!.worldToLocal(grabTarget);
                            this.draggedPart.position.copy(grabTarget);
                        } else if (this.isDraggingDrone2) {
                            this.drone2!.position.copy(grabTarget);
                        }
                        
                        if (this.teleportMarker) this.teleportMarker.visible = false;
                        this.isTeleportTargetValid = false;
                        return; // Court-circuit
                    } else {
                        // RELÂCHEMENT (DROP) : Sauvegarder la position ET l'échelle exactes
                        if (this.draggedPart) {
                            const data = this.drone2ExplodeData.get(this.draggedPart);
                            if (data) {
                                data.overriddenPos = this.draggedPart.position.clone();
                                data.overriddenScale = this.draggedPart.scale.clone();
                            }
                        }
                        
                        this.isDraggingDrone2 = false;
                        this.draggedPart = null;
                        this.draggingController = null;
                    }
                }

                // --- LOGIQUE CLASSIQUE DE TÉLÉPORTATION ---
                // (Ne s'exécute que si on n'est pas en train de manipuler un composant ou le drone entier)
                if (isXRPressed && !this.isDraggingDrone2 && !this.draggedPart) {
                    this.activeTeleportController = controller;
                    
                    if (this.shipModel) {
                        const intersects = this.teleportRaycaster.intersectObject(this.shipModel, true);
                        if (intersects.length > 0) {
                            const hitPoint = intersects[0].point;
                            this.teleportTargetVector.copy(hitPoint);
                            
                            if (this.teleportMarker) {
                                this.teleportMarker.position.copy(hitPoint);
                                this.teleportMarker.position.y += 0.30; // Plus haut pour éviter de rentrer dans les textures du sol
                                this.teleportMarker.visible = true;
                            }
                            this.isTeleportTargetValid = true;
                        } else {
                            if (this.teleportMarker) this.teleportMarker.visible = false;
                            this.isTeleportTargetValid = false;
                        }
                    }
                } else if (this.activeTeleportController === controller && !isXRPressed) {
                    if (this.isTeleportTargetValid) {
                        this.xrDolly.position.copy(this.teleportTargetVector);
                        this.xrDolly.position.y += PLAYER_EYE_HEIGHT;
                    }
                    if (this.teleportMarker) this.teleportMarker.visible = false;
                    this.activeTeleportController = null;
                    this.isTeleportTargetValid = false;
                }
            });

            // --- APPLICATION DU HOVER / SURBRILLANCE ---
            if (this.draggedPart) {
                // Si on manipule une pièce, on force l'étiquette sur celle-ci
                currentHitMesh = this.draggedPart;
                this.draggedPart.getWorldPosition(currentHitPoint);
            } else if (this.isDraggingDrone2) {
                // Si on déplace le drone entier, on cache l'étiquette pour plus de clarté
                currentHitMesh = null; 
            }

            if (currentHitMesh !== this.hoveredMesh) {
                // 1. Restaurer la couleur de l'ancien objet
                const prevMesh = this.hoveredMesh;
                if (prevMesh) {
                    const prevAny = prevMesh as any;
                    if (prevAny.material && prevAny.material.emissive) {
                        prevAny.material.emissive.copy(this.hoveredOriginalEmissive);
                    }
                }
                
                this.hoveredMesh = currentHitMesh;
                
                // 2. Illuminer le nouvel objet
                const newMesh = this.hoveredMesh;
                if (newMesh) {
                    const newAny = newMesh as any;
                    if (newAny.material && newAny.material.emissive) {
                        this.hoveredOriginalEmissive.copy(newAny.material.emissive);
                        newAny.material.emissive.setHex(0x00ffcc); // Cyan brillant
                    }
                    this.updateTooltipText(newAny.name);
                    this.tooltipSprite.visible = true;
                } else {
                    this.tooltipSprite.visible = false;
                }
            }
            
            // 3. Mise à jour de la position de l'étiquette
            if (this.hoveredMesh && this.tooltipSprite.visible) {
                this.tooltipSprite.position.copy(currentHitPoint);
                this.tooltipSprite.position.y += 0.15; // Flotte au-dessus du point d'impact
            }

            // --- EXÉCUTION MAIN DROITE : TOGGLE AR ---
            if (rightARPressed) {
                if (!this.rightMenuWasPressed) {
                    this.isARModeVRActive = !this.isARModeVRActive;
                    this.toggleARMode(this.isARModeVRActive);
                    console.log(`[VR] Mode AR basculé via main DROITE : ${this.isARModeVRActive}`);
                    
                    // NOUVEAUTÉ : Si on active le mode AR, on nettoie le ROV2 flottant
                    if (this.isARModeVRActive) {
                        if (this.drone2) this.drone2.visible = false;
                        this.isExplodedView = false;
                        this.isDraggingDrone2 = false;
                        this.draggedPart = null;
                        if (this.tooltipSprite) this.tooltipSprite.visible = false;
                        this.drone2ExplodeData.forEach(d => {
                            delete d.overriddenPos;
                            delete d.overriddenScale;
                        });
                    }
                    
                    this.rightMenuWasPressed = true;
                }
            } else {
                this.rightMenuWasPressed = false;
            }

            // --- EXÉCUTION MAIN GAUCHE : INVOCATION / EXPLOSION ROV2 ---
            if (leftSummonPressed) {
                if (!this.leftMenuWasPressed) {
                    if (this.drone2) {
                        if (!this.drone2.visible) {
                            // 1ère pression : Invocation
                            this.drone2.visible = true;
                            const headPos = new THREE.Vector3();
                            this.camera.getWorldPosition(headPos);
                            const offset = new THREE.Vector3(0, 0.1, -1.2);
                            offset.applyQuaternion(this.camera.quaternion);
                            this.drone2.position.copy(headPos).add(offset);
                            console.log("🛸 [VR] ROV2 invoqué via main GAUCHE !");
                        } else {
                            // Pressions suivantes : Toggle Vue Éclatée
                            this.isExplodedView = !this.isExplodedView;
                            
                            if (this.isExplodedView) {
                                // Calcul d'un Mur 2D dans le Monde Réel (World Space) face au joueur
                                const headPos = new THREE.Vector3();
                                this.camera.getWorldPosition(headPos);
                                
                                // Direction du regard, aplatie sur l'horizon
                                const cameraDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
                                cameraDir.y = 0; 
                                cameraDir.normalize();
                                if (cameraDir.lengthSq() === 0) cameraDir.set(0, 0, -1); // Sécurité
                                
                                // Vecteurs pour construire la grille
                                const rightDir = new THREE.Vector3().crossVectors(cameraDir, new THREE.Vector3(0, 1, 0)).normalize();
                                const upDir = new THREE.Vector3(0, 1, 0);
                                
                                // Le centre de la grille est à 1.2 mètres devant le joueur
                                const wallCenter = headPos.clone().add(cameraDir.multiplyScalar(1.2));
                                // On baisse la grille de 30 cm seulement
                                wallCenter.y -= 0.3; 
                                
                                const meshes = Array.from(this.drone2ExplodeData.keys());
                                const cols = Math.ceil(Math.sqrt(meshes.length));
                                
                                const spacing = 0.50; // Augmenté de 0.35 à 0.50 pour plus d'air
                                
                                meshes.forEach((mesh, i) => {
                                    const col = i % cols;
                                    const row = Math.floor(i / cols);
                                    const offsetX = (col - cols / 2) * spacing;
                                    const offsetY = (cols / 2 - row) * spacing;
                                    
                                    const worldPos = wallCenter.clone()
                                        .add(rightDir.clone().multiplyScalar(offsetX))
                                        .add(upDir.clone().multiplyScalar(offsetY));
                                        
                                    const data = this.drone2ExplodeData.get(mesh);
                                    if (data) data.worldGridTarget = worldPos;
                                });
                            } else {
                                // Fermeture : nettoyage
                                this.drone2ExplodeData.forEach(d => {
                                    delete d.overriddenPos;
                                    delete d.overriddenScale;
                                });
                            }
                        }
                    }
                    this.leftMenuWasPressed = true;
                }
            } else {
                this.leftMenuWasPressed = false;
            }
        }

        // --- 3. RENDU CAMÉRA SECONDAIRE (ROV HUD) ---
        // Si la caméra ROV est active (Mode AR On)
        if (this.rovCamera && this.isARModeVRActive) {
            const rovWorldPos = new THREE.Vector3();
            this.rovCamera.getWorldPosition(rovWorldPos);

            if (this.renderer.xr.isPresenting) {
                // --- EN VR : Rendu sur l'écran virtuel de cockpit attaché à la caméra ---
                if (this.vrMonitorMesh) this.vrMonitorMesh.visible = true;
                if (this.cockpitOverlay) this.cockpitOverlay.visible = true;

                const currentRenderTarget = this.renderer.getRenderTarget();

                // 1. On coupe temporairement WebXR pour ne pas corrompre le FOV du casque
                const xrEnabled = this.renderer.xr.enabled;
                this.renderer.xr.enabled = false;

                // 2. Rendu de l'écran 2D
                this.renderer.setRenderTarget(this.rovRenderTarget);
                this.renderer.clear();
                this.setAtmosphereForHeight(rovWorldPos.y);
                
                // FIX ANTI-FEEDBACK LOOP : Cacher l'écran pendant qu'on filme la scène
                if (this.vrMonitorMesh) this.vrMonitorMesh.visible = false;

                this.renderer.render(this.scene, this.rovCamera);
                
                if (this.vrMonitorMesh) this.vrMonitorMesh.visible = true; // On le rallume

                // 3. On rallume WebXR et on restaure la cible
                this.renderer.setRenderTarget(currentRenderTarget);
                this.renderer.xr.enabled = xrEnabled;

                // 4. CRUCIAL : On restaure immédiatement l'atmosphère et la profondeur de la surface
                const headWorldPos = new THREE.Vector3();
                this.camera.getWorldPosition(headWorldPos);
                this.setAtmosphereForHeight(headWorldPos.y);

            } else {
                // --- SUR ÉCRAN PC : Rendu classique en Picture-in-Picture HTML ---
                if (this.vrMonitorMesh) this.vrMonitorMesh.visible = false;
                if (this.cockpitOverlay) this.cockpitOverlay.visible = false;

                const hud = document.getElementById('rov-video-hud');
                if (hud && hud.style.display !== 'none') {
                    this.renderer.clearDepth();
                    this.setAtmosphereForHeight(rovWorldPos.y);

                    const pipWidth = 600;
                    const pipHeight = 340;
                    const pipX = 20;
                    const pipY = window.innerHeight - pipHeight - 20;

                    this.renderer.setViewport(pipX, pipY, pipWidth, pipHeight);
                    this.renderer.setScissor(pipX, pipY, pipWidth, pipHeight);
                    this.renderer.setScissorTest(true);

                    this.renderer.render(this.scene, this.rovCamera);
                }
            }
        } else {
            // Si le mode AR est désactivé, on cache l'écran VR et le cockpit
            if (this.vrMonitorMesh) this.vrMonitorMesh.visible = false;
            if (this.cockpitOverlay) this.cockpitOverlay.visible = false;
        }

        this.prevTime = time;
    }

    // Refonte atmosphère dynamique
    private setAtmosphereForHeight(yPosition: number) {
        if (yPosition < 0) {
            // Ambiance Abysses
            const deepBlue = new THREE.Color(0x010b19);
            this.scene.background = deepBlue;
            // On s'assure de ne pas recréer le fog à chaque frame pour les perfs
            if (!this.scene.userData.underwaterFog) {
                this.scene.userData.underwaterFog = new THREE.FogExp2(deepBlue, 0.006); // Divisé par 2
            }
            this.scene.fog = this.scene.userData.underwaterFog;
        } else {
            // Ambiance Surface
            this.scene.background = this.scene.environment || new THREE.Color(0x87CEEB);
            this.scene.fog = null;
        }
    }

    // Méthodes de physique FPS Octree
    private playerCollisions() {
        const result = this.worldOctree.capsuleIntersect(this.playerCollider);
        this.playerOnFloor = false;
        if (result) {
            this.playerOnFloor = result.normal.y > 0;
            if (!this.playerOnFloor) {
                this.playerVelocity.addScaledVector(result.normal, -result.normal.dot(this.playerVelocity));
            }
            this.playerCollider.translate(result.normal.multiplyScalar(result.depth));
        }
    }

    private updatePlayer(deltaTime: number) {
        let damping = Math.exp(-4 * deltaTime) - 1;
        if (!this.playerOnFloor) {
            this.playerVelocity.y -= this.gravity * deltaTime;
            damping *= 0.1;
        }
        this.playerVelocity.addScaledVector(this.playerVelocity, damping);
        
        const speedDelta = deltaTime * (this.playerOnFloor ? 200 : 80); // VITESSE RAPIDE !
        if (this.keyStates['KeyW'] || this.keyStates['ArrowUp']) {
            this.playerVelocity.add(this.getForwardVector().multiplyScalar(speedDelta));
        }
        if (this.keyStates['KeyS'] || this.keyStates['ArrowDown']) {
            this.playerVelocity.add(this.getForwardVector().multiplyScalar(-speedDelta));
        }
        if (this.keyStates['KeyA'] || this.keyStates['ArrowLeft']) {
            this.playerVelocity.add(this.getSideVector().multiplyScalar(-speedDelta));
        }
        if (this.keyStates['KeyD'] || this.keyStates['ArrowRight']) {
            this.playerVelocity.add(this.getSideVector().multiplyScalar(speedDelta));
        }

        const deltaPosition = this.playerVelocity.clone().multiplyScalar(deltaTime);
        this.playerCollider.translate(deltaPosition);
        this.playerCollisions();
        
        this.syncCameraWithPlayerCollider();
    }

    private syncCameraWithPlayerCollider() {
        this.camera.position.copy(this.playerCollider.end).sub(PLAYER_SPAWN_POSITION);
    }

    private getForwardVector() {
        this.camera.getWorldDirection(this.playerDirection);
        this.playerDirection.y = 0;
        this.playerDirection.normalize();
        return this.playerDirection;
    }

    private getSideVector() {
        this.camera.getWorldDirection(this.playerDirection);
        this.playerDirection.y = 0;
        this.playerDirection.normalize();
        this.playerDirection.cross(this.camera.up);
        return this.playerDirection;
    }

    private onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    public activateSimulation() {
        this.isSimulationActive = true;
        if (this.mouseDownHandler) {
            document.addEventListener('mousedown', this.mouseDownHandler);
        }
    }

    public deactivateSimulation() {
        this.isSimulationActive = false;
        if (this.controls && this.controls.isLocked) {
            this.controls.unlock();
        }
        if (this.mouseDownHandler) {
            document.removeEventListener('mousedown', this.mouseDownHandler);
        }
    }
}
