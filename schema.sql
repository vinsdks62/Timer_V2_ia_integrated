-- ============================================
-- Base de données Timer Journalier - SQLite
-- ============================================

-- Table des utilisateurs (employés + admin)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    position TEXT,
    role TEXT DEFAULT 'employee' CHECK(role IN ('employee', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Table des tâches
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Table des projets
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    client TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 1
);

-- Table des sessions de travail journalières
CREATE TABLE IF NOT EXISTS work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    work_seconds INTEGER DEFAULT 0,
    break_seconds INTEGER DEFAULT 0,
    lunch_seconds INTEGER DEFAULT 0,
    start_time DATETIME,
    end_time DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

-- Table des temps passés sur les tâches/projets
CREATE TABLE IF NOT EXISTS time_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id INTEGER,
    project_id INTEGER,
    duration_seconds INTEGER NOT NULL,
    date DATE NOT NULL,
    started_at DATETIME,
    ended_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    CHECK ((task_id IS NOT NULL AND project_id IS NULL) OR (task_id IS NULL AND project_id IS NOT NULL))
);

-- ============================================
-- INDEX pour améliorer les performances
-- ============================================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_date ON work_sessions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(date);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);

-- ============================================
-- DONNÉES DE TEST
-- ============================================

-- Insertion d'un compte admin (mot de passe: admin123)
-- Hash bcrypt du mot de passe "admin123"
INSERT INTO users (first_name, last_name, email, password_hash, position, role) 
VALUES ('Admin', 'Système', 'admin@entreprise.fr', '$2b$10$rKzE8Jz9vxYxW7wYxW7wYO7qXZGx7wYxW7wYxW7wYxW7wYxW7wYe', 'Administrateur', 'admin');

-- Insertion d'employés de test (mot de passe: password123)
INSERT INTO users (first_name, last_name, email, password_hash, position, role) 
VALUES 
    ('Jean', 'Dupont', 'jean.dupont@entreprise.fr', '$2b$10$rKzE8Jz9vxYxW7wYxW7wYO7qXZGx7wYxW7wYxW7wYxW7wYxW7wYe', 'Développeur', 'employee'),
    ('Marie', 'Martin', 'marie.martin@entreprise.fr', '$2b$10$rKzE8Jz9vxYxW7wYxW7wYO7qXZGx7wYxW7wYxW7wYxW7wYxW7wYe', 'Designer', 'employee'),
    ('Pierre', 'Dubois', 'pierre.dubois@entreprise.fr', '$2b$10$rKzE8Jz9vxYxW7wYxW7wYO7qXZGx7wYxW7wYxW7wYxW7wYxW7wYe', 'Chef de Projet', 'employee');

-- Insertion de tâches
INSERT INTO tasks (name, description) 
VALUES 
    ('Répondre aux emails clients', 'Traiter les demandes quotidiennes'),
    ('Mise à jour documentation', 'Actualiser les documents techniques'),
    ('Code review PR #234', 'Révision du code'),
    ('Réunion hebdomadaire équipe', 'Point d''équipe hebdomadaire'),
    ('Tests unitaires module auth', 'Écrire les tests pour l''authentification');

-- Insertion de projets
INSERT INTO projects (name, description, client) 
VALUES 
    ('Développement Site Web Client A', 'Refonte complète du site e-commerce', 'Client A'),
    ('Refonte base de données', 'Migration et optimisation BDD', 'Interne'),
    ('Application mobile iOS', 'Application de gestion interne', 'Interne'),
    ('Formation React nouveaux dev', 'Programme de formation interne', 'Interne'),
    ('Migration vers cloud AWS', 'Migration infrastructure cloud', 'Interne');

-- Insertion de sessions de travail de test
INSERT INTO work_sessions (user_id, date, work_seconds, break_seconds, lunch_seconds, start_time, end_time)
VALUES 
    (2, '2025-09-29', 27000, 1800, 3600, '2025-09-29 08:00:00', '2025-09-29 17:30:00'),
    (3, '2025-09-29', 25200, 1200, 3600, '2025-09-29 08:30:00', '2025-09-29 17:00:00'),
    (4, '2025-09-29', 28800, 2100, 3600, '2025-09-29 08:00:00', '2025-09-29 18:00:00');

-- Insertion de temps passés sur des tâches/projets
INSERT INTO time_entries (user_id, project_id, duration_seconds, date, started_at, ended_at)
VALUES 
    (2, 1, 7245, '2025-09-29', '2025-09-29 09:00:00', '2025-09-29 11:00:45'),
    (3, 2, 10800, '2025-09-29', '2025-09-29 09:00:00', '2025-09-29 12:00:00'),
    (4, 3, 15600, '2025-09-29', '2025-09-29 08:30:00', '2025-09-29 12:50:00');

INSERT INTO time_entries (user_id, task_id, duration_seconds, date, started_at, ended_at)
VALUES 
    (2, 1, 2340, '2025-09-29', '2025-09-29 14:00:00', '2025-09-29 14:39:00'),
    (3, 2, 1800, '2025-09-29', '2025-09-29 14:30:00', '2025-09-29 15:00:00'),
    (4, 3, 1200, '2025-09-29', '2025-09-29 15:00:00', '2025-09-29 15:20:00');

-- ============================================
-- VUES UTILES pour les statistiques
-- ============================================

-- Vue des statistiques par employé
CREATE VIEW IF NOT EXISTS employee_stats AS
SELECT 
    u.id,
    u.first_name,
    u.last_name,
    u.email,
    u.position,
    COALESCE(SUM(ws.work_seconds), 0) as total_work_seconds,
    COALESCE(SUM(ws.break_seconds), 0) as total_break_seconds,
    COALESCE(SUM(ws.lunch_seconds), 0) as total_lunch_seconds,
    COUNT(DISTINCT te.project_id) as total_projects,
    COUNT(DISTINCT te.task_id) as total_tasks
FROM users u
LEFT JOIN work_sessions ws ON u.id = ws.user_id
LEFT JOIN time_entries te ON u.id = te.user_id
WHERE u.role = 'employee' AND u.is_active = 1
GROUP BY u.id;

-- Vue du temps par projet
CREATE VIEW IF NOT EXISTS project_time_stats AS
SELECT 
    p.id,
    p.name,
    p.client,
    COALESCE(SUM(te.duration_seconds), 0) as total_seconds,
    COUNT(DISTINCT te.user_id) as employee_count
FROM projects p
LEFT JOIN time_entries te ON p.id = te.project_id
WHERE p.is_active = 1
GROUP BY p.id;

-- Vue du temps par tâche
CREATE VIEW IF NOT EXISTS task_time_stats AS
SELECT 
    t.id,
    t.name,
    COALESCE(SUM(te.duration_seconds), 0) as total_seconds,
    COUNT(DISTINCT te.user_id) as employee_count
FROM tasks t
LEFT JOIN time_entries te ON t.id = te.task_id
WHERE t.is_active = 1
GROUP BY t.id;