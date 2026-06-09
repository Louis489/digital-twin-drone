export class StartMissionUseCase {
    /**
     * Prépare la transition vers la scène 3D : masque Cesium et le Hub, affiche le loader.
     * NE révèle PAS la scène 3D - cela doit être fait par l'appelant UNIQUEMENT après
     * le chargement complet du modèle (voir revealScene).
     */
    public async execute(): Promise<void> {
        const cesiumDiv = document.getElementById('cesium-container');
        const loaderDiv = document.getElementById('loading-screen');
        const threeDiv = document.getElementById('three-container');
        const uiPanel = document.getElementById('ui-panel'); // Masquer le menu wms
        const mainControlPanel = document.getElementById('main-control-panel');
        const hubOverlay = document.getElementById('hub-overlay');
        const poiPanel = document.getElementById('poi-side-panel');
        const togglePanelBtn = document.getElementById('toggle-panel-btn');

        if (!cesiumDiv || !loaderDiv || !threeDiv) return;

        // Masquer Cesium, les éléments Hub et afficher le loader
        cesiumDiv.style.display = 'none';
        if (uiPanel) uiPanel.style.display = 'none';
        if (mainControlPanel) mainControlPanel.style.display = 'none';
        if (hubOverlay) hubOverlay.style.display = 'none';
        if (poiPanel) poiPanel.style.display = 'none';
        // Le bouton de repli ne doit apparaître que sur le globe
        if (togglePanelBtn) togglePanelBtn.style.display = 'none';
        loaderDiv.style.display = 'flex';

        // PAS de setTimeout, PAS de dévoilement de la scène 3D ici.
        // La scène 3D ne doit être révélée qu'APRÈS le chargement complet du modèle.
    }

    /**
     * Révèle la scène 3D et masque le loader.
     * À appeler UNIQUEMENT après que le modèle GLTF soit complètement chargé.
     */
    public revealScene(): void {
        const loaderDiv = document.getElementById('loading-screen');
        const threeDiv = document.getElementById('three-container');
        const fpsUI = document.getElementById('fps-ui');

        if (loaderDiv) loaderDiv.style.display = 'none';
        if (threeDiv) threeDiv.style.display = 'block';
        if (fpsUI) fpsUI.style.display = 'block';
    }
}
