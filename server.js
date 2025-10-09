// ============================================
// SERVER.JS - Serveur Backend Timer Journalier avec Gamma
// ============================================

require('dotenv').config();

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;
const JWT_SECRET = 'votre_secret_jwt_a_changer_en_production';

// Configuration Gamma API
const GAMMA_API_KEY = process.env.GAMMA_API_KEY || 'sk-gamma-wU4oeff8ucVldlriOZI0PDvd8NbxpmKqi5RUwYlyvrU';
const GAMMA_API_URL = 'https://public-api.gamma.app/v0.2/generations';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Connexion à la base de données SQLite
const db = new sqlite3.Database('./timer_app.db', (err) => {
    if (err) {
        console.error('❌ Erreur connexion DB:', err);
    } else {
        console.log('✅ Connecté à la base de données SQLite');
    }
});

// ============================================
// MIDDLEWARE D'AUTHENTIFICATION
// ============================================

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token invalide' });
        }
        req.user = user;
        next();
    });
}

function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Accès refusé - Admin uniquement' });
    }
    next();
}

// ============================================
// ROUTES D'AUTHENTIFICATION
// ============================================

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    
    db.get('SELECT * FROM users WHERE email = ? AND is_active = 1', [email], async (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        
        if (!user) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        const validPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!validPassword) {
            return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
        }
        
        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                position: user.position,
                role: user.role
            }
        });
    });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
    res.json({ valid: true, user: req.user });
});

// ============================================
// ROUTES SESSIONS DE TRAVAIL (Employés)
// ============================================

app.get('/api/work-sessions/today', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    db.get(
        'SELECT * FROM work_sessions WHERE user_id = ? AND date = ?',
        [req.user.id, today],
        (err, session) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            
            if (!session) {
                return res.json({
                    work_seconds: 0,
                    break_seconds: 0,
                    lunch_seconds: 0
                });
            }
            
            res.json(session);
        }
    );
});

app.post('/api/work-sessions/update', authenticateToken, (req, res) => {
    const { work_seconds, break_seconds, lunch_seconds } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    db.run(
        `INSERT INTO work_sessions (user_id, date, work_seconds, break_seconds, lunch_seconds, start_time)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(user_id, date) 
         DO UPDATE SET 
            work_seconds = ?,
            break_seconds = ?,
            lunch_seconds = ?`,
        [req.user.id, today, work_seconds, break_seconds, lunch_seconds, work_seconds, break_seconds, lunch_seconds],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la sauvegarde' });
            }
            res.json({ success: true, message: 'Session mise à jour' });
        }
    );
});

app.post('/api/work-sessions/end-day', authenticateToken, (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    
    db.run(
        `UPDATE work_sessions 
         SET end_time = datetime('now') 
         WHERE user_id = ? AND date = ?`,
        [req.user.id, today],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json({ success: true, message: 'Journée terminée' });
        }
    );
});

// ============================================
// ROUTES TÂCHES & PROJETS (Lecture pour tous)
// ============================================

app.get('/api/tasks', authenticateToken, (req, res) => {
    db.all('SELECT * FROM tasks WHERE is_active = 1 ORDER BY name', (err, tasks) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        res.json(tasks);
    });
});

app.get('/api/projects', authenticateToken, (req, res) => {
    db.all('SELECT * FROM projects WHERE is_active = 1 ORDER BY name', (err, projects) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        res.json(projects);
    });
});

// ============================================
// ROUTES TIME ENTRIES (Temps sur tâches/projets)
// ============================================

app.post('/api/time-entries/start', authenticateToken, (req, res) => {
    const { task_id, project_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    db.run(
        `INSERT INTO time_entries (user_id, task_id, project_id, duration_seconds, date, started_at)
         VALUES (?, ?, ?, 0, ?, datetime('now'))`,
        [req.user.id, task_id || null, project_id || null, today],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors du démarrage' });
            }
            res.json({ success: true, entry_id: this.lastID });
        }
    );
});

app.put('/api/time-entries/:id', authenticateToken, (req, res) => {
    const { duration_seconds } = req.body;
    
    db.run(
        `UPDATE time_entries 
         SET duration_seconds = ?, ended_at = datetime('now')
         WHERE id = ? AND user_id = ?`,
        [duration_seconds, req.params.id, req.user.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la mise à jour' });
            }
            res.json({ success: true });
        }
    );
});

app.get('/api/time-entries/history', authenticateToken, (req, res) => {
    db.all(
        `SELECT te.*, t.name as task_name, p.name as project_name
         FROM time_entries te
         LEFT JOIN tasks t ON te.task_id = t.id
         LEFT JOIN projects p ON te.project_id = p.id
         WHERE te.user_id = ?
         ORDER BY te.date DESC, te.started_at DESC
         LIMIT 50`,
        [req.user.id],
        (err, entries) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json(entries);
        }
    );
});

// ============================================
// ROUTES ADMIN - GESTION EMPLOYÉS
// ============================================

app.post('/api/admin/employees', authenticateToken, isAdmin, async (req, res) => {
    const { first_name, last_name, email, password, position } = req.body;
    
    try {
        const password_hash = await bcrypt.hash(password, 10);
        
        db.run(
            `INSERT INTO users (first_name, last_name, email, password_hash, position, role)
             VALUES (?, ?, ?, ?, ?, 'employee')`,
            [first_name, last_name, email, password_hash, position],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: 'Cet email existe déjà' });
                    }
                    return res.status(500).json({ error: 'Erreur lors de la création' });
                }
                res.json({ success: true, user_id: this.lastID });
            }
        );
    } catch (error) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/admin/employees', authenticateToken, isAdmin, (req, res) => {
    db.all(
        `SELECT id, first_name, last_name, email, position, created_at, is_active
         FROM users WHERE role = 'employee' AND is_active = 1
         ORDER BY last_name, first_name`,
        (err, employees) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json(employees);
        }
    );
});

app.delete('/api/admin/employees/:id', authenticateToken, isAdmin, (req, res) => {
    db.run(
        'UPDATE users SET is_active = 0 WHERE id = ? AND role = "employee"',
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json({ success: true });
        }
    );
});

// ============================================
// ROUTES ADMIN - GESTION TÂCHES
// ============================================

app.post('/api/admin/tasks', authenticateToken, isAdmin, (req, res) => {
    const { name, description } = req.body;
    
    db.run(
        'INSERT INTO tasks (name, description) VALUES (?, ?)',
        [name, description],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la création' });
            }
            res.json({ success: true, task_id: this.lastID });
        }
    );
});

app.delete('/api/admin/tasks/:id', authenticateToken, isAdmin, (req, res) => {
    db.run(
        'UPDATE tasks SET is_active = 0 WHERE id = ?',
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json({ success: true });
        }
    );
});

// ============================================
// ROUTES ADMIN - GESTION PROJETS
// ============================================

app.post('/api/admin/projects', authenticateToken, isAdmin, (req, res) => {
    const { name, description, client } = req.body;
    
    db.run(
        'INSERT INTO projects (name, description, client) VALUES (?, ?, ?)',
        [name, description, client],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur lors de la création' });
            }
            res.json({ success: true, project_id: this.lastID });
        }
    );
});

app.delete('/api/admin/projects/:id', authenticateToken, isAdmin, (req, res) => {
    db.run(
        'UPDATE projects SET is_active = 0 WHERE id = ?',
        [req.params.id],
        function(err) {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json({ success: true });
        }
    );
});

// ============================================
// ROUTES ADMIN - STATISTIQUES
// ============================================

app.get('/api/admin/stats/global', authenticateToken, isAdmin, (req, res) => {
    const stats = {};
    
    db.get('SELECT COUNT(*) as count FROM users WHERE role = "employee" AND is_active = 1', (err, result) => {
        stats.total_employees = result.count;
        
        db.get('SELECT COUNT(*) as count FROM tasks WHERE is_active = 1', (err, result) => {
            stats.total_tasks = result.count;
            
            db.get('SELECT COUNT(*) as count FROM projects WHERE is_active = 1', (err, result) => {
                stats.total_projects = result.count;
                
                db.get('SELECT SUM(work_seconds) as total FROM work_sessions', (err, result) => {
                    stats.total_work_seconds = result.total || 0;
                    res.json(stats);
                });
            });
        });
    });
});

app.get('/api/admin/stats/employees', authenticateToken, isAdmin, (req, res) => {
    db.all('SELECT * FROM employee_stats', (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        res.json(stats);
    });
});

app.get('/api/admin/stats/employees/:id', authenticateToken, isAdmin, (req, res) => {
    db.get('SELECT * FROM employee_stats WHERE id = ?', [req.params.id], (err, stats) => {
        if (err) {
            return res.status(500).json({ error: 'Erreur serveur' });
        }
        res.json(stats);
    });
});

app.get('/api/admin/activity/recent', authenticateToken, isAdmin, (req, res) => {
    db.all(
        `SELECT 
            u.first_name || ' ' || u.last_name as employee_name,
            COALESCE(t.name, p.name) as activity_name,
            te.duration_seconds,
            te.date,
            te.started_at
         FROM time_entries te
         JOIN users u ON te.user_id = u.id
         LEFT JOIN tasks t ON te.task_id = t.id
         LEFT JOIN projects p ON te.project_id = p.id
         ORDER BY te.started_at DESC
         LIMIT 20`,
        (err, activities) => {
            if (err) {
                return res.status(500).json({ error: 'Erreur serveur' });
            }
            res.json(activities);
        }
    );
});

// ============================================
// ROUTES ADMIN - EXPORTS GRANULAIRES
// ============================================

app.post('/api/admin/export/detailed', authenticateToken, isAdmin, async (req, res) => {
    try {
        const {
            employeeIds,
            startDate,
            endDate,
            includeActivities,
            includeBreakdown,
            includeDailyStats,
            includeProjectDetails,
            includeTaskDetails
        } = req.body;

        const employees = await new Promise((resolve, reject) => {
            const query = employeeIds && employeeIds.length > 0
                ? `SELECT * FROM users WHERE id IN (${employeeIds.join(',')}) AND role = 'employee'`
                : 'SELECT * FROM users WHERE role = "employee" AND is_active = 1';

            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        const detailedData = await Promise.all(employees.map(async (employee) => {
            const employeeData = {
                id: employee.id,
                firstName: employee.first_name,
                lastName: employee.last_name,
                email: employee.email,
                position: employee.position,
                createdAt: employee.created_at
            };

            // Statistiques globales avec période
            const dateFilter = startDate && endDate
                ? `AND date BETWEEN '${startDate}' AND '${endDate}'`
                : '';

            const stats = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT
                        COALESCE(SUM(work_seconds), 0) as total_work_seconds,
                        COALESCE(SUM(break_seconds), 0) as total_break_seconds,
                        COALESCE(SUM(lunch_seconds), 0) as total_lunch_seconds,
                        COUNT(*) as total_days
                     FROM work_sessions
                     WHERE user_id = ? ${dateFilter}`,
                    [employee.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row || { total_work_seconds: 0, total_break_seconds: 0, total_lunch_seconds: 0, total_days: 0 });
                    }
                );
            });

            employeeData.globalStats = stats;

            // Statistiques journalières détaillées
            if (includeDailyStats) {
                employeeData.dailyStats = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            date,
                            work_seconds,
                            break_seconds,
                            lunch_seconds,
                            start_time,
                            end_time,
                            ROUND((work_seconds * 100.0) / NULLIF(work_seconds + break_seconds + lunch_seconds, 0), 2) as productivity_rate
                         FROM work_sessions
                         WHERE user_id = ? ${dateFilter}
                         ORDER BY date DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });
            }

            // Activités détaillées (projets + tâches)
            if (includeActivities) {
                employeeData.activities = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            te.id,
                            te.date,
                            te.started_at,
                            te.ended_at,
                            te.duration_seconds,
                            COALESCE(t.name, p.name) as activity_name,
                            CASE
                                WHEN te.task_id IS NOT NULL THEN 'task'
                                WHEN te.project_id IS NOT NULL THEN 'project'
                            END as activity_type,
                            t.description as task_description,
                            p.description as project_description,
                            p.client as project_client
                         FROM time_entries te
                         LEFT JOIN tasks t ON te.task_id = t.id
                         LEFT JOIN projects p ON te.project_id = p.id
                         WHERE te.user_id = ? ${dateFilter}
                         ORDER BY te.started_at DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });
            }

            // Répartition par projet
            if (includeProjectDetails) {
                employeeData.projectBreakdown = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            p.id,
                            p.name,
                            p.description,
                            p.client,
                            COUNT(te.id) as session_count,
                            SUM(te.duration_seconds) as total_seconds,
                            AVG(te.duration_seconds) as avg_session_duration,
                            MIN(te.date) as first_date,
                            MAX(te.date) as last_date
                         FROM projects p
                         LEFT JOIN time_entries te ON p.id = te.project_id AND te.user_id = ?
                         WHERE te.id IS NOT NULL ${dateFilter.replace('date', 'te.date')}
                         GROUP BY p.id
                         ORDER BY total_seconds DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });
            }

            // Répartition par tâche
            if (includeTaskDetails) {
                employeeData.taskBreakdown = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            t.id,
                            t.name,
                            t.description,
                            COUNT(te.id) as session_count,
                            SUM(te.duration_seconds) as total_seconds,
                            AVG(te.duration_seconds) as avg_session_duration,
                            MIN(te.date) as first_date,
                            MAX(te.date) as last_date
                         FROM tasks t
                         LEFT JOIN time_entries te ON t.id = te.task_id AND te.user_id = ?
                         WHERE te.id IS NOT NULL ${dateFilter.replace('date', 'te.date')}
                         GROUP BY t.id
                         ORDER BY total_seconds DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });
            }

            return employeeData;
        }));

        res.json({
            success: true,
            exportDate: new Date().toISOString(),
            filters: { employeeIds, startDate, endDate },
            data: detailedData
        });

    } catch (error) {
        console.error('❌ Erreur export détaillé:', error);
        res.status(500).json({
            error: 'Erreur lors de l\'export',
            message: error.message
        });
    }
});

// ============================================
// ROUTES GAMMA API
// ============================================

function formatEmployeeDataForGamma(employee, stats, activities, detailedData = null) {
    const workHours = (stats.total_work_seconds / 3600).toFixed(1);
    const breakHours = (stats.total_break_seconds / 3600).toFixed(1);
    const lunchHours = (stats.total_lunch_seconds / 3600).toFixed(1);
    const totalHours = ((stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds) / 3600).toFixed(1);
    const avgDailyHours = stats.total_days > 0 ? (stats.total_work_seconds / 3600 / stats.total_days).toFixed(1) : 0;

    let text = `# Rapport d'Activité Professionnel\n`;
    text += `## ${employee.first_name} ${employee.last_name}\n\n`;

    text += `---\n\n`;
    text += `# Informations Générales\n\n`;
    text += `* **Poste** : ${employee.position || 'Non spécifié'}\n`;
    text += `* **Email** : ${employee.email}\n`;
    text += `* **Date du rapport** : ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    text += `* **Période analysée** : ${stats.total_days || 0} jour(s) de travail\n\n`;

    text += `---\n\n`;
    text += `# Vue d'Ensemble des Temps\n\n`;
    text += `## Répartition Totale\n\n`;
    text += `| Catégorie | Heures | Pourcentage |\n`;
    text += `|-----------|--------|-------------|\n`;

    const workPercent = totalHours > 0 ? ((stats.total_work_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;
    const breakPercent = totalHours > 0 ? ((stats.total_break_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;
    const lunchPercent = totalHours > 0 ? ((stats.total_lunch_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;

    text += `| Temps de travail | ${workHours}h | ${workPercent}% |\n`;
    text += `| Pauses courtes | ${breakHours}h | ${breakPercent}% |\n`;
    text += `| Pause déjeuner | ${lunchHours}h | ${lunchPercent}% |\n`;
    text += `| **TOTAL** | **${totalHours}h** | **100%** |\n\n`;

    text += `## Métriques Clés\n\n`;
    text += `* **Moyenne quotidienne de travail** : ${avgDailyHours}h/jour\n`;
    text += `* **Taux d'activité productive** : ${workPercent}%\n`;
    text += `* **Nombre total de projets** : ${stats.total_projects || 0}\n`;
    text += `* **Nombre total de tâches** : ${stats.total_tasks || 0}\n\n`;

    // Statistiques journalières détaillées si disponibles
    if (detailedData && detailedData.dailyStats && detailedData.dailyStats.length > 0) {
        text += `---\n\n`;
        text += `# Détail Journalier\n\n`;
        text += `| Date | Heures Travail | Pauses | Déjeuner | Productivité |\n`;
        text += `|------|---------------|---------|----------|-------------|\n`;

        detailedData.dailyStats.slice(0, 10).forEach(day => {
            const dayWork = (day.work_seconds / 3600).toFixed(1);
            const dayBreak = (day.break_seconds / 3600).toFixed(1);
            const dayLunch = (day.lunch_seconds / 3600).toFixed(1);
            const prod = day.productivity_rate || 0;
            text += `| ${new Date(day.date).toLocaleDateString('fr-FR')} | ${dayWork}h | ${dayBreak}h | ${dayLunch}h | ${prod}% |\n`;
        });
        text += `\n`;
    }

    text += `---\n\n`;
    text += `# Analyse des Activités\n\n`;

    if (activities && activities.length > 0) {
        const grouped = {};
        activities.forEach(act => {
            const name = act.activity_name || 'Non catégorisé';
            if (!grouped[name]) {
                grouped[name] = {
                    name: name,
                    totalSeconds: 0,
                    occurrences: 0,
                    type: act.activity_type || 'unknown',
                    description: act.task_description || act.project_description || '',
                    client: act.project_client || ''
                };
            }
            grouped[name].totalSeconds += act.duration_seconds;
            grouped[name].occurrences++;
        });

        const sortedActivities = Object.values(grouped)
            .sort((a, b) => b.totalSeconds - a.totalSeconds);

        text += `## Top 10 des Activités par Temps\n\n`;
        text += `| # | Activité | Type | Temps Total | Sessions | Temps Moyen |\n`;
        text += `|---|----------|------|-------------|----------|-------------|\n`;

        sortedActivities.slice(0, 10).forEach((activity, index) => {
            const hours = (activity.totalSeconds / 3600).toFixed(1);
            const avgMinutes = Math.round(activity.totalSeconds / activity.occurrences / 60);
            const typeIcon = activity.type === 'project' ? '📁' : '✓';
            text += `| ${index + 1} | ${typeIcon} ${activity.name} | ${activity.type === 'project' ? 'Projet' : 'Tâche'} | ${hours}h | ${activity.occurrences} | ${avgMinutes}min |\n`;
        });
        text += `\n`;

        // Détail des projets si disponible
        if (detailedData && detailedData.projectBreakdown && detailedData.projectBreakdown.length > 0) {
            text += `## Analyse Détaillée des Projets\n\n`;
            detailedData.projectBreakdown.forEach(project => {
                const projHours = (project.total_seconds / 3600).toFixed(1);
                const avgSession = Math.round(project.avg_session_duration / 60);
                text += `### ${project.name}\n\n`;
                if (project.client) text += `* **Client** : ${project.client}\n`;
                if (project.description) text += `* **Description** : ${project.description}\n`;
                text += `* **Temps total** : ${projHours}h\n`;
                text += `* **Nombre de sessions** : ${project.session_count}\n`;
                text += `* **Durée moyenne par session** : ${avgSession} minutes\n`;
                text += `* **Période** : du ${new Date(project.first_date).toLocaleDateString('fr-FR')} au ${new Date(project.last_date).toLocaleDateString('fr-FR')}\n\n`;
            });
        }

        // Détail des tâches si disponible
        if (detailedData && detailedData.taskBreakdown && detailedData.taskBreakdown.length > 0) {
            text += `## Analyse Détaillée des Tâches\n\n`;
            detailedData.taskBreakdown.forEach(task => {
                const taskHours = (task.total_seconds / 3600).toFixed(1);
                const avgSession = Math.round(task.avg_session_duration / 60);
                text += `### ${task.name}\n\n`;
                if (task.description) text += `* **Description** : ${task.description}\n`;
                text += `* **Temps total** : ${taskHours}h\n`;
                text += `* **Nombre de sessions** : ${task.session_count}\n`;
                text += `* **Durée moyenne par session** : ${avgSession} minutes\n`;
                text += `* **Période** : du ${new Date(task.first_date).toLocaleDateString('fr-FR')} au ${new Date(task.last_date).toLocaleDateString('fr-FR')}\n\n`;
            });
        }
    } else {
        text += `Aucune activité enregistrée sur la période analysée.\n\n`;
    }

    text += `---\n\n`;
    text += `# Analyse de Performance et Productivité\n\n`;

    const productivity = totalHours > 0 ? (stats.total_work_seconds / (stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds) * 100) : 0;

    text += `## Indicateurs de Productivité\n\n`;
    text += `* **Taux de productivité global** : ${productivity.toFixed(1)}%\n`;
    text += `* **Heures travaillées moyennes par jour** : ${avgDailyHours}h\n`;
    text += `* **Ratio travail/pauses** : ${(stats.total_work_seconds / Math.max(stats.total_break_seconds + stats.total_lunch_seconds, 1)).toFixed(1)}:1\n\n`;

    text += `## Évaluation\n\n`;

    if (productivity >= 75) {
        text += `**Excellent niveau de productivité** : L'employé maintient un excellent équilibre entre travail effectif et temps de pause. `;
        text += `Le taux de productivité de ${productivity.toFixed(1)}% indique une gestion optimale du temps de travail.\n\n`;
    } else if (productivity >= 65) {
        text += `**Très bon niveau de productivité** : L'employé présente un très bon équilibre travail/pause avec ${productivity.toFixed(1)}% de temps productif. `;
        text += `Quelques optimisations mineures pourraient être envisagées.\n\n`;
    } else if (productivity >= 50) {
        text += `**Bon niveau de productivité** : Avec ${productivity.toFixed(1)}% de temps productif, l'employé maintient un niveau acceptable. `;
        text += `Une analyse des interruptions pourrait permettre d'optimiser ce taux.\n\n`;
    } else {
        text += `**Niveau de productivité à améliorer** : Le taux de ${productivity.toFixed(1)}% suggère un déséquilibre dans la répartition du temps. `;
        text += `Il est recommandé d'analyser les causes des interruptions fréquentes.\n\n`;
    }

    text += `## Points Forts\n\n`;
    if (stats.total_projects > 5 || stats.total_tasks > 10) {
        text += `* Grande diversité d'activités démontrant une polyvalence appréciable\n`;
    }
    if (avgDailyHours >= 7) {
        text += `* Engagement quotidien solide avec une moyenne de ${avgDailyHours}h par jour\n`;
    }
    if (productivity >= 65) {
        text += `* Excellente gestion du temps avec un taux de productivité de ${productivity.toFixed(1)}%\n`;
    }
    text += `* Suivi rigoureux des activités facilitant l'analyse et le reporting\n\n`;

    text += `## Axes d'Amélioration\n\n`;
    text += `* **Optimisation des pauses** : Planifier des pauses régulières et courtes plutôt que longues et dispersées\n`;
    text += `* **Focus sur les priorités** : Concentrer l'effort sur les projets à fort impact\n`;
    text += `* **Documentation** : Maintenir un journal de bord pour capturer les apprentissages et défis\n`;
    if (stats.total_projects < 3) {
        text += `* **Diversification** : Participer à davantage de projets pour développer de nouvelles compétences\n`;
    }
    text += `\n`;

    text += `---\n\n`;
    text += `# Recommandations Stratégiques\n\n`;

    text += `## Court Terme (1-2 semaines)\n\n`;
    text += `1. **Structurer la journée** : Définir des blocs de temps dédiés pour les tâches complexes\n`;
    text += `2. **Réduire les interruptions** : Identifier et minimiser les sources de distraction\n`;
    text += `3. **Optimiser les réunions** : S'assurer que chaque réunion a un objectif clair et un ordre du jour\n\n`;

    text += `## Moyen Terme (1 mois)\n\n`;
    text += `1. **Développement de compétences** : Identifier 2-3 compétences clés à améliorer\n`;
    text += `2. **Mentorat** : Partager l'expertise sur les projets maîtrisés\n`;
    text += `3. **Automatisation** : Identifier les tâches répétitives à automatiser\n\n`;

    text += `## Long Terme (3-6 mois)\n\n`;
    text += `1. **Montée en compétence** : Viser des projets plus stratégiques et complexes\n`;
    text += `2. **Leadership** : Prendre des responsabilités de coordination sur certains projets\n`;
    text += `3. **Innovation** : Proposer des améliorations de processus basées sur l'expérience terrain\n\n`;

    text += `---\n\n`;
    text += `# Conclusion\n\n`;
    text += `Ce rapport d'activité détaillé présente une analyse complète des performances de **${employee.first_name} ${employee.last_name}** sur la période étudiée. `;
    text += `Avec **${workHours}h de travail effectif** réparties sur **${stats.total_days || 0} jours**, et une implication dans **${stats.total_projects + stats.total_tasks} activités distinctes**, `;
    text += `l'employé démontre un engagement solide.\n\n`;

    text += `Le **taux de productivité de ${productivity.toFixed(1)}%** et la **diversité des activités** témoignent d'une contribution significative à l'organisation. `;
    text += `Les recommandations ci-dessus visent à maintenir et améliorer ces performances dans la durée.\n\n`;

    text += `---\n\n`;
    text += `*Rapport généré automatiquement le ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} à ${new Date().toLocaleTimeString('fr-FR')}*\n`;
    text += `*Données extraites du système de suivi Timer Journalier*`;

    return text;
}

app.post('/api/admin/gamma/generate-report/:employeeId', authenticateToken, isAdmin, async (req, res) => {
    try {
        const employeeId = req.params.employeeId;
        const { startDate, endDate, includeDetails } = req.body;

        console.log('🔍 Début génération rapport Gamma pour employé ID:', employeeId);
        console.log('📅 Période:', startDate, 'à', endDate);
        console.log('📊 Détails inclus:', includeDetails);

        const employee = await new Promise((resolve, reject) => {
            db.get(
                'SELECT * FROM users WHERE id = ? AND role = "employee"',
                [employeeId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });

        if (!employee) {
            console.log('❌ Employé non trouvé');
            return res.status(404).json({ error: 'Employé non trouvé' });
        }

        console.log('✅ Employé trouvé:', employee.first_name, employee.last_name);

        // Construire le filtre de date
        const dateFilter = startDate && endDate
            ? `AND date BETWEEN '${startDate}' AND '${endDate}'`
            : '';

        // Récupérer les stats avec période
        const stats = await new Promise((resolve, reject) => {
            db.get(
                `SELECT
                    COALESCE(SUM(work_seconds), 0) as total_work_seconds,
                    COALESCE(SUM(break_seconds), 0) as total_break_seconds,
                    COALESCE(SUM(lunch_seconds), 0) as total_lunch_seconds,
                    COUNT(*) as total_days
                 FROM work_sessions
                 WHERE user_id = ? ${dateFilter}`,
                [employeeId],
                (err, row) => {
                    if (err) reject(err);
                    else {
                        // Ajouter les counts de projets/tâches
                        db.get(
                            `SELECT
                                COUNT(DISTINCT project_id) as total_projects,
                                COUNT(DISTINCT task_id) as total_tasks
                             FROM time_entries
                             WHERE user_id = ? ${dateFilter}`,
                            [employeeId],
                            (err2, row2) => {
                                if (err2) reject(err2);
                                else resolve({
                                    ...(row || { total_work_seconds: 0, total_break_seconds: 0, total_lunch_seconds: 0, total_days: 0 }),
                                    total_projects: row2?.total_projects || 0,
                                    total_tasks: row2?.total_tasks || 0
                                });
                            }
                        );
                    }
                }
            );
        });

        console.log('📊 Stats récupérées:', stats);

        // Récupérer les activités détaillées
        const activities = await new Promise((resolve, reject) => {
            db.all(
                `SELECT
                    te.id,
                    te.date,
                    te.started_at,
                    te.ended_at,
                    te.duration_seconds,
                    COALESCE(t.name, p.name) as activity_name,
                    CASE
                        WHEN te.task_id IS NOT NULL THEN 'task'
                        WHEN te.project_id IS NOT NULL THEN 'project'
                    END as activity_type,
                    t.description as task_description,
                    p.description as project_description,
                    p.client as project_client
                 FROM time_entries te
                 LEFT JOIN tasks t ON te.task_id = t.id
                 LEFT JOIN projects p ON te.project_id = p.id
                 WHERE te.user_id = ? ${dateFilter}
                 ORDER BY te.started_at DESC`,
                [employeeId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });

        console.log('📋 Activités récupérées:', activities.length, 'entrées');

        let detailedData = null;

        // Si détails demandés, récupérer les données supplémentaires
        if (includeDetails) {
            detailedData = {};

            // Stats journalières
            detailedData.dailyStats = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT
                        date,
                        work_seconds,
                        break_seconds,
                        lunch_seconds,
                        start_time,
                        end_time,
                        ROUND((work_seconds * 100.0) / NULLIF(work_seconds + break_seconds + lunch_seconds, 0), 2) as productivity_rate
                     FROM work_sessions
                     WHERE user_id = ? ${dateFilter}
                     ORDER BY date DESC`,
                    [employeeId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            // Breakdown par projet
            detailedData.projectBreakdown = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT
                        p.id,
                        p.name,
                        p.description,
                        p.client,
                        COUNT(te.id) as session_count,
                        SUM(te.duration_seconds) as total_seconds,
                        AVG(te.duration_seconds) as avg_session_duration,
                        MIN(te.date) as first_date,
                        MAX(te.date) as last_date
                     FROM projects p
                     INNER JOIN time_entries te ON p.id = te.project_id AND te.user_id = ?
                     WHERE 1=1 ${dateFilter.replace('date', 'te.date')}
                     GROUP BY p.id
                     ORDER BY total_seconds DESC`,
                    [employeeId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            // Breakdown par tâche
            detailedData.taskBreakdown = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT
                        t.id,
                        t.name,
                        t.description,
                        COUNT(te.id) as session_count,
                        SUM(te.duration_seconds) as total_seconds,
                        AVG(te.duration_seconds) as avg_session_duration,
                        MIN(te.date) as first_date,
                        MAX(te.date) as last_date
                     FROM tasks t
                     INNER JOIN time_entries te ON t.id = te.task_id AND te.user_id = ?
                     WHERE 1=1 ${dateFilter.replace('date', 'te.date')}
                     GROUP BY t.id
                     ORDER BY total_seconds DESC`,
                    [employeeId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            console.log('📊 Données détaillées récupérées');
        }

        const inputText = formatEmployeeDataForGamma(employee, stats, activities, detailedData);
        
        console.log('📝 Texte formaté - Longueur:', inputText.length, 'caractères');
        console.log('🔑 Clé API présente:', GAMMA_API_KEY ? 'OUI' : 'NON');
        console.log('🔑 Premiers caractères de la clé:', GAMMA_API_KEY.substring(0, 15) + '...');
        console.log('🌐 URL API:', GAMMA_API_URL);
        
        const requestBody = {
            inputText: inputText,
            textMode: 'preserve',
            format: 'document',
            themeName: 'Night Sky',
            numCards: 5,
            cardSplit: 'inputTextBreaks',
            exportAs: 'pdf',
            textOptions: {
                amount: 'detailed',
                language: 'fr'
            },
            imageOptions: {
                source: 'pictographic'
            },
            cardOptions: {
                dimensions: 'a4'
            },
            sharingOptions: {
                workspaceAccess: 'view',
                externalAccess: 'noAccess'
            }
        };
        
        console.log('📤 Envoi de la requête à Gamma API...');
        
        const gammaResponse = await fetch(GAMMA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': GAMMA_API_KEY
            },
            body: JSON.stringify(requestBody)
        });
        
        console.log('📥 Réponse reçue - Status:', gammaResponse.status);
        console.log('📥 Headers:', JSON.stringify(Object.fromEntries(gammaResponse.headers.entries())));
        
        const responseText = await gammaResponse.text();
        console.log('📥 Réponse brute (premiers 500 caractères):', responseText.substring(0, 500));
        
        if (!gammaResponse.ok) {
            let errorData;
            try {
                errorData = JSON.parse(responseText);
            } catch (parseError) {
                errorData = { message: responseText };
            }
            console.error('❌ Erreur API Gamma:', JSON.stringify(errorData, null, 2));
            return res.status(gammaResponse.status).json({ 
                error: 'Erreur API Gamma',
                details: errorData,
                status: gammaResponse.status
            });
        }
        
        const gammaData = JSON.parse(responseText);
        console.log('✅ Génération lancée avec succès');
        console.log('🆔 Generation ID:', gammaData.generationId);
        
        res.json({
            success: true,
            generationId: gammaData.generationId,
            message: 'Génération en cours... Cela peut prendre 30-60 secondes.'
        });
        
    } catch (error) {
        console.error('❌ ERREUR COMPLÈTE:', error.message);
        console.error('📍 Stack trace:', error.stack);
        res.status(500).json({ 
            error: 'Erreur lors de la génération du rapport',
            message: error.message,
            stack: error.stack
        });
    }
});

app.get('/api/admin/gamma/status/:generationId', authenticateToken, isAdmin, async (req, res) => {
    try {
        const generationId = req.params.generationId;
        
        console.log('🔍 Vérification statut pour generation ID:', generationId);
        
        const gammaResponse = await fetch(`${GAMMA_API_URL}/${generationId}`, {
            method: 'GET',
            headers: {
                'X-API-KEY': GAMMA_API_KEY,
                'accept': 'application/json'
            }
        });
        
        console.log('📥 Status check - HTTP Status:', gammaResponse.status);
        
        if (!gammaResponse.ok) {
            const errorText = await gammaResponse.text();
            console.error('❌ Erreur status check:', errorText);
            return res.status(gammaResponse.status).json({ 
                error: 'Erreur lors de la vérification du statut',
                details: errorText
            });
        }
        
        const data = await gammaResponse.json();
        console.log('✅ Statut récupéré:', data.status);
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Erreur vérification statut Gamma:', error.message);
        res.status(500).json({ 
            error: 'Erreur lors de la vérification du statut',
            message: error.message
        });
    }
});

// ============================================
// DÉMARRAGE DU SERVEUR
// ============================================

app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🚀 Serveur Timer Journalier actif   ║
║                                        ║
║   📡 Port: ${PORT}                         ║
║   🌐 URL: http://localhost:${PORT}        ║
║                                        ║
║   ✅ Base de données connectée         ║
║   ✨ Gamma API configurée              ║
║   🔑 Clé API: ${GAMMA_API_KEY.substring(0, 12)}...       ║
╚════════════════════════════════════════╝
    `);
});

process.on('SIGINT', () => {
    db.close((err) => {
        if (err) {
            console.error(err.message);
        }
        console.log('\n👋 Fermeture de la base de données');
        process.exit(0);
    });
});
