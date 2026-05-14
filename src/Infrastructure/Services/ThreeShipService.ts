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

export class ThreeShipService {
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
private playerCollider = new Capsule(new THREE.Vector3(0, 100.5, 0), new THREE.Vector3(0, 150.5, 0), 0.5);    private playerVelocity = new THREE.Vector3();
    private playerDirection = new THREE.Vector3();
    private playerOnFloor = false;
    private gravity = 100;
    private keyStates: { [key: string]: boolean } = {};
    private isSimulationActive = false;
    private mouseDownHandler: ((event: MouseEvent) => void) | null = null;
    private orbitAngle = 0;
    private turbinePosition = new THREE.Vector3(700, -100, -500);

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
        container.appendChild(this.renderer.domElement);

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
        const seabedGeo = new THREE.PlaneGeometry(3000, 3000, 64, 64);
        
        // Déformation procédurale pour simuler des dunes sous-marines
        const pos = seabedGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);
            // Création de collines douces avec des fonctions sinus
            const z = Math.sin(x * 0.02) * 5 + Math.cos(y * 0.02) * 5; 
            pos.setZ(i, z);
        }
        seabedGeo.computeVertexNormals(); // Recalcule les ombres

        const seabedMat = new THREE.MeshStandardMaterial({
            color: 0x041a2f, // Bleu océan très profond (sable sombre)
            roughness: 0.9,
            metalness: 0.1,
            side: THREE.DoubleSide
        });
        
        const seabed = new THREE.Mesh(seabedGeo, seabedMat);
        seabed.rotation.x = -Math.PI / 2; // À plat
        seabed.position.y = -10; // Profondeur mission -10m
        this.scene.add(seabed);

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

                this.scene.add(this.shipModel);
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
        this.camera.position.set(0, 3.5, 5); // Hauteur des yeux (pont à Y=2 + 1.5m)
        this.controls = new PointerLockControls(this.camera, document.body);
        this.scene.add(this.controls.getObject());

        // Correction "Pro" du PointerLock - désactivé par défaut
        const startControls = () => {
            if (this.controls && !this.controls.isLocked && this.isSimulationActive) {
                this.controls.lock();
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
        document.addEventListener('keydown', (event) => { this.keyStates[event.code] = true; });
        document.addEventListener('keyup', (event) => { this.keyStates[event.code] = false; });

        // Redimensionnement
        window.addEventListener('resize', this.onWindowResize.bind(this));

        // Chargement du drone sous l'eau
        this.loadDrone();

        this.animate = this.animate.bind(this);
        this.animate();
    }

    private loadDrone() {
        const loader = new GLTFLoader();
        loader.load(droneModelUrl, (gltf) => {
            this.drone = gltf.scene;
                
            // --- RÉDUIRE LE ROV ---
            this.drone.scale.set(1, 1, 1); // Taille minimale 
                
            // --- ACTIVER LES PHARES DU ROV ---
            // Un spot puissant qui regarde devant
            const spotLight = new THREE.SpotLight(0xffffff, 20.0, 100, Math.PI / 4, 0.5, 1);
            // On le positionne sur le "nez" (selon l'axe avant de ton modèle)
            spotLight.position.set(0, 0, 1); 
            spotLight.target.position.set(0, 0, 50); // Regarde droit devant
                
            this.drone.add(spotLight);
            this.drone.add(spotLight.target);
            
            // 1. POSITION : Plus loin et plus profond
            this.drone.position.set(0, -10, -30); 
            
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
            console.log("🤖 [ThreeShipService] Drone en position sous-marine !");
        }, undefined, (error) => {
            console.error("❌ Erreur de chargement GLB :", error);
        });
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
    }

    public update() {
        if (!this.drone) return;
        
        // Mouvement orbital autour de la turbine
        this.orbitAngle += 0.02; // Vitesse de rotation augmentée
        
        const orbitRadius = 80; // Rayon de l'orbite autour des poteaux
        const orbitHeight = -150; // Hauteur de l'orbite (plus profonde)
        
        // Position circulaire autour de la turbine
        const targetX = this.turbinePosition.x + Math.cos(this.orbitAngle) * orbitRadius;
        const targetY = orbitHeight;
        const targetZ = this.turbinePosition.z + Math.sin(this.orbitAngle) * orbitRadius;

        // LERP vers la position cible
        const lerpFactor = 0.02;
        this.drone.position.x += (targetX - this.drone.position.x) * lerpFactor;
        this.drone.position.y += (targetY - this.drone.position.y) * lerpFactor;
        this.drone.position.z += (targetZ - this.drone.position.z) * lerpFactor;

        // Le ROV regarde dans sa direction de mouvement (tangentiel au cercle)
        const tangentAngle = this.orbitAngle + Math.PI / 2; // +90° pour la tangente
        const lookAtX = this.drone.position.x + Math.cos(tangentAngle);
        const lookAtY = this.drone.position.y;
        const lookAtZ = this.drone.position.z + Math.sin(tangentAngle);
        
        this.drone.lookAt(lookAtX, lookAtY, lookAtZ);

        // Stabilisation absolue (pas de tremblement, le drone reste droit)
        this.drone.rotation.x = 0; 
        this.drone.rotation.z = 0;
    }

    private animate() {
        requestAnimationFrame(this.animate);
        if (this.water) {
            this.water.material.uniforms['time'].value += 1.0 / 60.0;
        }
        
        const time = performance.now();
        if (this.controls && this.controls.isLocked === true) {
            // Limitation du delta pour éviter les sauts physiques
            let delta = (time - this.prevTime) / 1000;
            if (delta > 0.1) delta = 0.1;
            
            // Mise à jour physique FPS Octree
            this.updatePlayer(delta);
        }

        // 1. Nettoyage
        this.renderer.clear();

        // 2. RENDU CAMÉRA PRINCIPALE (Joueur)
        this.setAtmosphereForHeight(this.camera.position.y);
        this.renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
        this.renderer.setScissor(0, 0, window.innerWidth, window.innerHeight);
        this.renderer.setScissorTest(true);
        this.renderer.render(this.scene, this.camera);

        // 3. RENDU CAMÉRA SECONDAIRE (ROV HUD)
        const hud = document.getElementById('rov-video-hud');
        if (hud && hud.style.display !== 'none' && this.rovCamera) {
            this.renderer.clearDepth();
            
            // On récupère la vraie position absolue du drone dans le monde
            const rovWorldPos = new THREE.Vector3();
            this.rovCamera.getWorldPosition(rovWorldPos);
            
            // ON CHANGE L'ATMOSPHÈRE JUSTE POUR LE ROV
            this.setAtmosphereForHeight(rovWorldPos.y);

            const pipWidth = 600;
            const pipHeight = 340;
            const pipX = 20;
            
            // CORRECTION : WebGL compte à partir du bas. 
            // Pour l'avoir en haut avec 20px de marge, on soustrait la hauteur de la fenêtre.
            const pipY = window.innerHeight - pipHeight - 20; 

            this.renderer.setViewport(pipX, pipY, pipWidth, pipHeight);
            this.renderer.setScissor(pipX, pipY, pipWidth, pipHeight);
            this.renderer.setScissorTest(true);
            
            this.renderer.render(this.scene, this.rovCamera);
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
        
        this.camera.position.copy(this.playerCollider.end);
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
