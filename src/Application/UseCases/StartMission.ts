export class StartMissionUseCase {
    public async execute(): Promise<void> {
        const cesiumDiv = document.getElementById('cesium-container');
        const loaderDiv = document.getElementById('loading-screen');
        const threeDiv = document.getElementById('three-container');
        const uiPanel = document.getElementById('ui-panel'); // Masquer le menu wms
        const mainControlPanel = document.getElementById('main-control-panel');
        const hubOverlay = document.getElementById('hub-overlay');
        const poiPanel = document.getElementById('poi-side-panel');

        if (!cesiumDiv || !loaderDiv || !threeDiv) return;

        // 1. Masquer Cesium, les éléments Hub et afficher le loader
        cesiumDiv.style.display = 'none';
        if (uiPanel) uiPanel.style.display = 'none';
        if (mainControlPanel) mainControlPanel.style.display = 'none';
        if (hubOverlay) hubOverlay.style.display = 'none';
        if (poiPanel) poiPanel.style.display = 'none';
        loaderDiv.style.display = 'flex';

        // 2. Simuler un temps de chargement réseau/3D (1.5 secondes)
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 3. Masquer le loader et afficher la scène Three.js
        loaderDiv.style.display = 'none';
        threeDiv.style.display = 'block';
        
        // Afficher l'interface FPS
        const fpsUI = document.getElementById('fps-ui');
        if (fpsUI) fpsUI.style.display = 'block';
    }
}
