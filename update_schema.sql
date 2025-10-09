-- Commencer une transaction pour assurer l'intégrité des données
BEGIN TRANSACTION;

-- Supprimer les vues qui dépendent de la table 'time_entries'
DROP VIEW IF EXISTS employee_stats;
DROP VIEW IF EXISTS project_time_stats;
DROP VIEW IF EXISTS task_time_stats;

-- Créer une nouvelle table avec la bonne structure
CREATE TABLE IF NOT EXISTS time_entries_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    task_id INTEGER,
    project_id INTEGER,
    description TEXT, -- Nouvelle colonne pour les activités génériques
    duration_seconds INTEGER NOT NULL,
    date DATE NOT NULL,
    started_at DATETIME,
    ended_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

-- Copier les données de l'ancienne table vers la nouvelle
INSERT INTO time_entries_new (id, user_id, task_id, project_id, duration_seconds, date, started_at, ended_at)
SELECT id, user_id, task_id, project_id, duration_seconds, date, started_at, ended_at FROM time_entries;

-- Supprimer l'ancienne table
DROP TABLE time_entries;

-- Renommer la nouvelle table
ALTER TABLE time_entries_new RENAME TO time_entries;

-- ============================================
-- Recréer les vues utiles pour les statistiques
-- ============================================

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

-- Appliquer la transaction
COMMIT;
