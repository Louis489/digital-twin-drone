/**
 * @interface IOceanoService
 * Contrat pour la gestion des couches de données océanographiques.
 */
export interface IOceanoService {
    /**
     * Ajoute ou affiche la couche de bathymétrie WMS.
     */
    enableBathymetryLayer(): void;
    
    /**
     * Masque ou retire la couche de bathymétrie WMS.
     */
    disableBathymetryLayer(): void;
}
