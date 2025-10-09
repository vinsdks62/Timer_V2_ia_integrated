-- ============================================
-- DONNÉES RÉALISTES POUR MÉTALLURGIE
-- SARL Hubert Pascal - Usinage, Chaudronnerie, Ferronnerie
-- ============================================

-- Nettoyer les anciennes données de test
DELETE FROM time_entries WHERE task_id IN (SELECT id FROM tasks WHERE name LIKE '%Test%' OR name LIKE '%Time Entry%');
DELETE FROM tasks WHERE name LIKE '%Test%' OR name LIKE '%Time Entry%' OR name LIKE '%test%';
DELETE FROM projects WHERE name LIKE '%Test%' OR name LIKE '%test%';

-- ============================================
-- TÂCHES QUOTIDIENNES MÉTALLURGIE
-- ============================================

INSERT INTO tasks (name, description) VALUES
-- Tâches administratives et gestion
('Traiter les demandes de devis', 'Répondre aux clients et établir les devis pour nouveaux projets'),
('Contrôle qualité pièces usinées', 'Vérification dimensionnelle et conformité des pièces'),
('Mise à jour planning atelier', 'Actualiser le planning de production hebdomadaire'),
('Inventaire matières premières', 'Vérifier stocks acier, inox, aluminium'),

-- Tâches techniques usinage
('Réglage machine CN', 'Programmation et réglage des machines à commande numérique'),
('Maintenance préventive tours', 'Entretien et graissage des tours et fraiseuses'),
('Étalonnage outils de mesure', 'Calibrage micromètres, pieds à coulisse, comparateurs'),

-- Tâches chaudronnerie
('Préparation chantier soudure', 'Mise en place du poste de soudage et contrôle matériel'),
('Traçage et découpe tôle', 'Traçage manuel ou numérique et découpe plasma/cisaille'),
('Contrôle étanchéité assemblages', 'Test pression et contrôle visuel des soudures'),

-- Tâches ferronnerie
('Prise de côtes sur site client', 'Relevé dimensions pour portails, garde-corps, rampes'),
('Galvanisation pièces', 'Traitement anticorrosion des éléments ferronnerie'),
('Finition et polissage', 'Ébavurage, ponçage et polissage pièces finies'),

-- Tâches sécurité et environnement
('Inspection EPI atelier', 'Vérification équipements de protection individuelle'),
('Formation sécurité nouvel arrivant', 'Briefing sécurité et règles atelier'),
('Tri et évacuation déchets métalliques', 'Séparation ferraille, copeaux, chutes pour recyclage');

-- ============================================
-- PROJETS CLIENTS RÉALISTES
-- ============================================

INSERT INTO projects (name, description, client) VALUES
-- Projets ferronnerie résidentiel
('Portail coulissant Maison Dupont', 'Fabrication et pose portail acier galvanisé 4m motorisé', 'M. et Mme Dupont'),
('Garde-corps terrasse Villa Martin', 'Garde-corps inox brossé 15ml avec main courante bois', 'Famille Martin'),
('Escalier hélicoïdal métallique', 'Escalier acier avec marches bois chêne massif', 'Cabinet Architecture Lemoine'),
('Verrière d''atelier style industriel', 'Verrière acier noir mat 3x2m avec vitrage', 'Loft Parisien SARL'),

-- Projets chaudronnerie industrielle
('Cuve inox alimentaire 500L', 'Fabrication cuve inox 316L avec robinetterie', 'Brasserie Normande'),
('Réservoir air comprimé 1000L', 'Réservoir acier peint + accessoires pression', 'Garage Industriel Rouen'),
('Capotage machine industrielle', 'Carénage protection en tôle pliée avec portes', 'Usine Textile St-Étienne'),
('Conduits ventilation atelier', 'Réseau gaines inox Ø400mm avec raccords', 'Menuiserie Bois Leblanc'),

-- Projets usinage de précision
('Pièces mécaniques série prototype', 'Usinage 50 pièces aluminium tolérance ±0.02mm', 'StartUp Robotique Lyon'),
('Réparation arbre moteur pompe', 'Rectification et rechargement chrome arbre Ø80', 'Station Pompage Seine'),
('Fabrication moules injection', 'Usinage moules acier trempé pour injection plastique', 'Plasturgie Normandie'),
('Pignons transmission spéciaux', 'Taillage engrenages module 3 Z=24 dents acier 42CD4', 'Équipement Agricole SAS'),

-- Projets maintenance et rénovation
('Rénovation structure métallique hangar', 'Renforcement charpente acier + traitement anticorrosion', 'Exploitation Agricole Duval'),
('Modernisation ligne production', 'Modification convoyeurs et supports machines', 'Agroalimentaire Bernay'),
('Réparation grues atelier', 'Contrôle réglementaire + réparation palans 3T', 'Fonderie Elbeuf'),

-- Projets artistiques et sur-mesure
('Sculpture métal place publique', 'Création artistique acier corten 4m hauteur', 'Mairie de Vernon'),
('Mobilier urbain design', 'Bancs et jardinières métal pour aménagement', 'Communauté Communes Eure'),
('Enseigne commerciale lumineuse', 'Structure inox avec lettres découpées LED', 'Boutique Mode Centre-Ville');

-- ============================================
-- VÉRIFICATION
-- ============================================

-- Afficher le résumé
SELECT 'TÂCHES ACTIVES' as Type, COUNT(*) as Nombre FROM tasks WHERE is_active = 1
UNION ALL
SELECT 'PROJETS ACTIFS' as Type, COUNT(*) as Nombre FROM projects WHERE is_active = 1;
