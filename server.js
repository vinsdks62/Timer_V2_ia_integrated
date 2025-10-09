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
// ROUTES ADMIN - EXPORTS GRANULAIRES AMÉLIORÉS
// ============================================

app.post('/api/admin/export/detailed', authenticateToken, isAdmin, async (req, res) => {
    try {
        const {
            employeeIds,
            startDate,
            endDate,
            includeActivities = true,
            includeBreakdown = true,
            includeDailyStats = true,
            includeProjectDetails = true,
            includeTaskDetails = true,
            includeHourlyBreakdown = false,
            includeProductivityMetrics = true,
            includeComparisonData = false
        } = req.body;

        console.log('📊 Export détaillé demandé avec options:', {
            employeeIds, startDate, endDate,
            includeHourlyBreakdown, includeProductivityMetrics, includeComparisonData
        });

        const employees = await new Promise((resolve, reject) => {
            const query = employeeIds && employeeIds.length > 0
                ? `SELECT * FROM users WHERE id IN (${employeeIds.join(',')}) AND role = 'employee'`
                : 'SELECT * FROM users WHERE role = "employee" AND is_active = 1';

            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        console.log(`👥 ${employees.length} employé(s) à analyser`);

        const detailedData = await Promise.all(employees.map(async (employee) => {
            console.log(`🔍 Analyse de ${employee.first_name} ${employee.last_name}...`);
            
            const employeeData = {
                id: employee.id,
                firstName: employee.first_name,
                lastName: employee.last_name,
                email: employee.email,
                position: employee.position,
                createdAt: employee.created_at
            };

            const dateFilter = startDate && endDate
                ? `AND date BETWEEN '${startDate}' AND '${endDate}'`
                : '';

            // === STATISTIQUES GLOBALES ===
            const stats = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT
                        COALESCE(SUM(work_seconds), 0) as total_work_seconds,
                        COALESCE(SUM(break_seconds), 0) as total_break_seconds,
                        COALESCE(SUM(lunch_seconds), 0) as total_lunch_seconds,
                        COUNT(*) as total_days,
                        AVG(work_seconds) as avg_work_seconds,
                        MAX(work_seconds) as max_work_seconds,
                        MIN(work_seconds) as min_work_seconds
                     FROM work_sessions
                     WHERE user_id = ? ${dateFilter}`,
                    [employee.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row || {
                            total_work_seconds: 0,
                            total_break_seconds: 0,
                            total_lunch_seconds: 0,
                            total_days: 0,
                            avg_work_seconds: 0,
                            max_work_seconds: 0,
                            min_work_seconds: 0
                        });
                    }
                );
            });

            const counts = await new Promise((resolve, reject) => {
                db.get(
                    `SELECT
                        COUNT(DISTINCT project_id) as total_projects,
                        COUNT(DISTINCT task_id) as total_tasks,
                        COUNT(*) as total_entries
                     FROM time_entries
                     WHERE user_id = ? ${dateFilter}`,
                    [employee.id],
                    (err, row) => {
                        if (err) reject(err);
                        else resolve(row || { total_projects: 0, total_tasks: 0, total_entries: 0 });
                    }
                );
            });

            employeeData.globalStats = { ...stats, ...counts };

            // === MÉTRIQUES DE PRODUCTIVITÉ ===
            if (includeProductivityMetrics) {
                const totalTime = stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds;
                const productivityRate = totalTime > 0 
                    ? (stats.total_work_seconds / totalTime * 100).toFixed(2) 
                    : 0;

                employeeData.productivityMetrics = {
                    productivityRate: parseFloat(productivityRate),
                    avgDailyWorkHours: stats.total_days > 0 
                        ? (stats.total_work_seconds / 3600 / stats.total_days).toFixed(2) 
                        : 0,
                    consistencyScore: stats.total_days > 0 && stats.avg_work_seconds > 0
                        ? (1 - (stats.max_work_seconds - stats.min_work_seconds) / stats.avg_work_seconds).toFixed(2)
                        : 0,
                    workBreakRatio: (stats.total_break_seconds + stats.total_lunch_seconds) > 0
                        ? (stats.total_work_seconds / (stats.total_break_seconds + stats.total_lunch_seconds)).toFixed(2)
                        : 0,
                    activeWorkDays: stats.total_days,
                    totalActivities: counts.total_entries,
                    avgActivitiesPerDay: stats.total_days > 0
                        ? (counts.total_entries / stats.total_days).toFixed(2)
                        : 0
                };
            }

            // === STATISTIQUES JOURNALIÈRES ===
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
                            ROUND((work_seconds * 100.0) / NULLIF(work_seconds + break_seconds + lunch_seconds, 0), 2) as productivity_rate,
                            (work_seconds + break_seconds + lunch_seconds) as total_seconds
                         FROM work_sessions
                         WHERE user_id = ? ${dateFilter}
                         ORDER BY date DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else {
                                const enriched = rows.map(day => ({
                                    ...day,
                                    work_hours: (day.work_seconds / 3600).toFixed(2),
                                    break_hours: (day.break_seconds / 3600).toFixed(2),
                                    lunch_hours: (day.lunch_seconds / 3600).toFixed(2),
                                    total_hours: (day.total_seconds / 3600).toFixed(2),
                                    day_of_week: new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'long' })
                                }));
                                resolve(enriched || []);
                            }
                        }
                    );
                });
            }

            // === RÉPARTITION HORAIRE ===
            if (includeHourlyBreakdown && includeDailyStats) {
                const hourlyData = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            date,
                            strftime('%H', start_time) as start_hour,
                            strftime('%H', end_time) as end_hour,
                            (julianday(end_time) - julianday(start_time)) * 24 as session_duration_hours
                         FROM work_sessions
                         WHERE user_id = ? ${dateFilter}
                         AND start_time IS NOT NULL AND end_time IS NOT NULL
                         ORDER BY date DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else resolve(rows || []);
                        }
                    );
                });

                const startHours = hourlyData.map(d => parseInt(d.start_hour)).filter(h => !isNaN(h));
                const endHours = hourlyData.map(d => parseInt(d.end_hour)).filter(h => !isNaN(h));

                employeeData.hourlyBreakdown = {
                    avgStartHour: startHours.length > 0 
                        ? (startHours.reduce((a, b) => a + b, 0) / startHours.length).toFixed(1)
                        : null,
                    avgEndHour: endHours.length > 0
                        ? (endHours.reduce((a, b) => a + b, 0) / endHours.length).toFixed(1)
                        : null,
                    earliestStart: startHours.length > 0 ? Math.min(...startHours) : null,
                    latestEnd: endHours.length > 0 ? Math.max(...endHours) : null,
                    avgSessionDuration: hourlyData.length > 0
                        ? (hourlyData.reduce((sum, d) => sum + d.session_duration_hours, 0) / hourlyData.length).toFixed(2)
                        : null
                };
            }

            // === ACTIVITÉS DÉTAILLÉES ===
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
                            p.client as project_client,
                            strftime('%H:%M', te.started_at) as start_time,
                            strftime('%H:%M', te.ended_at) as end_time
                         FROM time_entries te
                         LEFT JOIN tasks t ON te.task_id = t.id
                         LEFT JOIN projects p ON te.project_id = p.id
                         WHERE te.user_id = ? ${dateFilter}
                         ORDER BY te.started_at DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else {
                                const enriched = rows.map(activity => ({
                                    ...activity,
                                    duration_hours: (activity.duration_seconds / 3600).toFixed(2),
                                    duration_minutes: Math.round(activity.duration_seconds / 60)
                                }));
                                resolve(enriched || []);
                            }
                        }
                    );
                });
            }

            // === RÉPARTITION PAR PROJET ===
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
                            MAX(te.date) as last_date,
                            MIN(te.duration_seconds) as min_session,
                            MAX(te.duration_seconds) as max_session
                         FROM projects p
                         INNER JOIN time_entries te ON p.id = te.project_id AND te.user_id = ?
                         WHERE 1=1 ${dateFilter.replace('date', 'te.date')}
                         GROUP BY p.id
                         ORDER BY total_seconds DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else {
                                const enriched = rows.map(proj => ({
                                    ...proj,
                                    total_hours: (proj.total_seconds / 3600).toFixed(2),
                                    avg_hours_per_session: (proj.avg_session_duration / 3600).toFixed(2),
                                    percentage_of_time: stats.total_work_seconds > 0
                                        ? ((proj.total_seconds / stats.total_work_seconds) * 100).toFixed(2)
                                        : 0,
                                    days_active: proj.first_date && proj.last_date
                                        ? Math.ceil((new Date(proj.last_date) - new Date(proj.first_date)) / (1000 * 60 * 60 * 24)) + 1
                                        : 0
                                }));
                                resolve(enriched || []);
                            }
                        }
                    );
                });
            }

            // === RÉPARTITION PAR TÂCHE ===
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
                            MAX(te.date) as last_date,
                            MIN(te.duration_seconds) as min_session,
                            MAX(te.duration_seconds) as max_session
                         FROM tasks t
                         INNER JOIN time_entries te ON t.id = te.task_id AND te.user_id = ?
                         WHERE 1=1 ${dateFilter.replace('date', 'te.date')}
                         GROUP BY t.id
                         ORDER BY total_seconds DESC`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else {
                                const enriched = rows.map(task => ({
                                    ...task,
                                    total_hours: (task.total_seconds / 3600).toFixed(2),
                                    avg_hours_per_session: (task.avg_session_duration / 3600).toFixed(2),
                                    percentage_of_time: stats.total_work_seconds > 0
                                        ? ((task.total_seconds / stats.total_work_seconds) * 100).toFixed(2)
                                        : 0,
                                    days_active: task.first_date && task.last_date
                                        ? Math.ceil((new Date(task.last_date) - new Date(task.first_date)) / (1000 * 60 * 60 * 24)) + 1
                                        : 0
                                }));
                                resolve(enriched || []);
                            }
                        }
                    );
                });
            }

            // === ANALYSE PAR JOUR DE LA SEMAINE ===
            if (includeProductivityMetrics) {
                employeeData.weekdayAnalysis = await new Promise((resolve, reject) => {
                    db.all(
                        `SELECT
                            CASE cast(strftime('%w', date) as integer)
                                WHEN 0 THEN 'Dimanche'
                                WHEN 1 THEN 'Lundi'
                                WHEN 2 THEN 'Mardi'
                                WHEN 3 THEN 'Mercredi'
                                WHEN 4 THEN 'Jeudi'
                                WHEN 5 THEN 'Vendredi'
                                WHEN 6 THEN 'Samedi'
                            END as day_name,
                            strftime('%w', date) as day_number,
                            COUNT(*) as day_count,
                            AVG(work_seconds) as avg_work_seconds,
                            AVG(break_seconds + lunch_seconds) as avg_break_seconds,
                            SUM(work_seconds) as total_work_seconds
                         FROM work_sessions
                         WHERE user_id = ? ${dateFilter}
                         GROUP BY strftime('%w', date)
                         ORDER BY day_number`,
                        [employee.id],
                        (err, rows) => {
                            if (err) reject(err);
                            else {
                                const enriched = rows.map(day => ({
                                    ...day,
                                    avg_work_hours: (day.avg_work_seconds / 3600).toFixed(2),
                                    total_work_hours: (day.total_work_seconds / 3600).toFixed(2),
                                    productivity_score: day.avg_work_seconds > 0 && day.avg_break_seconds > 0
                                        ? ((day.avg_work_seconds / (day.avg_work_seconds + day.avg_break_seconds)) * 100).toFixed(2)
                                        : 0
                                }));
                                resolve(enriched || []);
                            }
                        }
                    );
                });
            }

            // === COMPARAISON AVEC LA MOYENNE ===
            if (includeComparisonData) {
                const globalAverages = await new Promise((resolve, reject) => {
                    db.get(
                        `SELECT
                            AVG(avg_work) as company_avg_work_seconds,
                            AVG(avg_break) as company_avg_break_seconds,
                            AVG(total_activities) as company_avg_activities
                         FROM (
                             SELECT
                                 user_id,
                                 AVG(work_seconds) as avg_work,
                                 AVG(break_seconds + lunch_seconds) as avg_break,
                                 COUNT(*) as total_activities
                             FROM work_sessions
                             WHERE 1=1 ${dateFilter}
                             GROUP BY user_id
                         )`,
                        [],
                        (err, row) => {
                            if (err) reject(err);
                            else resolve(row || {});
                        }
                    );
                });

                employeeData.comparisonData = {
                    employeeAvgWorkSeconds: stats.avg_work_seconds,
                    companyAvgWorkSeconds: globalAverages.company_avg_work_seconds || 0,
                    performanceVsAverage: globalAverages.company_avg_work_seconds > 0
                        ? ((stats.avg_work_seconds / globalAverages.company_avg_work_seconds - 1) * 100).toFixed(2)
                        : 0,
                    employeeAvgActivities: stats.total_days > 0 ? (counts.total_entries / stats.total_days).toFixed(2) : 0,
                    companyAvgActivities: globalAverages.company_avg_activities || 0,
                    activitiesVsAverage: globalAverages.company_avg_activities > 0
                        ? (((counts.total_entries / Math.max(stats.total_days, 1)) / globalAverages.company_avg_activities - 1) * 100).toFixed(2)
                        : 0
                };
            }

            console.log(`✅ Analyse terminée pour ${employee.first_name} ${employee.last_name}`);
            return employeeData;
        }));

        console.log('📦 Export complet généré avec succès');

        res.json({
            success: true,
            exportDate: new Date().toISOString(),
            filters: {
                employeeIds,
                startDate,
                endDate,
                includeActivities,
                includeBreakdown,
                includeDailyStats,
                includeProjectDetails,
                includeTaskDetails,
                includeHourlyBreakdown,
                includeProductivityMetrics,
                includeComparisonData
            },
            employeeCount: detailedData.length,
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
// FONCTION DE FORMATAGE GAMMA AMÉLIORÉE
// ============================================

function formatEmployeeDataForGamma(employee, stats, activities, detailedData = null) {
    const workHours = (stats.total_work_seconds / 3600).toFixed(1);
    const breakHours = (stats.total_break_seconds / 3600).toFixed(1);
    const lunchHours = (stats.total_lunch_seconds / 3600).toFixed(1);
    const totalHours = ((stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds) / 3600).toFixed(1);
    const avgDailyHours = stats.total_days > 0 ? (stats.total_work_seconds / 3600 / stats.total_days).toFixed(1) : 0;

    let text = `# Rapport d'Activité Professionnel Détaillé\n`;
    text += `## ${employee.first_name} ${employee.last_name}\n\n`;
    text += `**${employee.position || 'Poste non spécifié'}** | ${employee.email}\n\n`;

    text += `---\n\n`;

    // ========================================
    // RÉSUMÉ EXÉCUTIF
    // ========================================
    text += `# 📋 Résumé Exécutif\n\n`;
    
    const productivity = totalHours > 0 ? (stats.total_work_seconds / (stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds) * 100) : 0;
    
    text += `> **Période analysée** : ${stats.total_days || 0} jours de travail\n`;
    text += `> **Temps de travail total** : ${workHours}h sur ${totalHours}h\n`;
    text += `> **Taux de productivité** : ${productivity.toFixed(1)}%\n`;
    text += `> **Activités réalisées** : ${stats.total_projects + stats.total_tasks} (${stats.total_projects} projets, ${stats.total_tasks} tâches)\n\n`;

    if (productivity >= 75) {
        text += `✅ **Performance excellente** - L'employé maintient un excellent équilibre travail/pause avec un taux de productivité de ${productivity.toFixed(1)}%.\n\n`;
    } else if (productivity >= 65) {
        text += `✅ **Très bonne performance** - Bon équilibre avec ${productivity.toFixed(1)}% de temps productif.\n\n`;
    } else if (productivity >= 50) {
        text += `⚠️ **Performance correcte** - ${productivity.toFixed(1)}% de productivité, des améliorations sont possibles.\n\n`;
    } else {
        text += `❌ **Performance à améliorer** - Taux de ${productivity.toFixed(1)}% nécessitant une analyse approfondie.\n\n`;
    }

    text += `---\n\n`;

    // ========================================
    // MÉTRIQUES DE PRODUCTIVITÉ DÉTAILLÉES
    // ========================================
    if (detailedData && detailedData.productivityMetrics) {
        text += `# 📊 Métriques de Productivité\n\n`;
        
        const pm = detailedData.productivityMetrics;
        
        text += `## Indicateurs Clés de Performance\n\n`;
        text += `| Métrique | Valeur | Évaluation |\n`;
        text += `|----------|--------|------------|\n`;
        text += `| Taux de productivité | ${pm.productivityRate}% | ${pm.productivityRate >= 70 ? '🟢 Excellent' : pm.productivityRate >= 60 ? '🟡 Bon' : '🔴 À améliorer'} |\n`;
        text += `| Moyenne quotidienne | ${pm.avgDailyWorkHours}h/jour | ${pm.avgDailyWorkHours >= 7 ? '🟢 Solide' : pm.avgDailyWorkHours >= 6 ? '🟡 Correct' : '🔴 Faible'} |\n`;
        text += `| Score de régularité | ${(pm.consistencyScore * 100).toFixed(0)}% | ${pm.consistencyScore >= 0.7 ? '🟢 Très régulier' : pm.consistencyScore >= 0.5 ? '🟡 Variable' : '🔴 Irrégulier'} |\n`;
        text += `| Ratio travail/pauses | ${pm.workBreakRatio}:1 | ${pm.workBreakRatio >= 5 ? '🟢 Optimal' : pm.workBreakRatio >= 3 ? '🟡 Acceptable' : '🔴 Déséquilibré'} |\n`;
        text += `| Activités par jour | ${pm.avgActivitiesPerDay} | ${pm.avgActivitiesPerDay >= 5 ? '🟢 Très actif' : pm.avgActivitiesPerDay >= 3 ? '🟡 Actif' : '🔴 Peu actif'} |\n\n`;

        text += `### 💡 Insights\n\n`;
        
        if (pm.consistencyScore >= 0.7) {
            text += `* **Régularité exemplaire** : L'employé maintient un rythme de travail stable et prévisible, signe d'une bonne organisation.\n`;
        } else if (pm.consistencyScore < 0.5) {
            text += `* **Variabilité importante** : Les journées de travail varient considérablement, il peut être utile d'identifier les facteurs de ces variations.\n`;
        }

        if (pm.workBreakRatio >= 5) {
            text += `* **Équilibre travail/repos optimal** : Le ratio de ${pm.workBreakRatio}:1 indique une excellente gestion des pauses.\n`;
        } else if (pm.workBreakRatio < 3) {
            text += `* **Attention aux pauses** : Le ratio de ${pm.workBreakRatio}:1 suggère des pauses trop longues ou trop fréquentes par rapport au temps de travail.\n`;
        }

        if (pm.avgActivitiesPerDay >= 5) {
            text += `* **Polyvalence élevée** : Avec ${pm.avgActivitiesPerDay} activités par jour en moyenne, l'employé démontre une grande capacité à gérer plusieurs tâches.\n`;
        }

        text += `\n`;
    }

    text += `---\n\n`;

    // ========================================
    // ANALYSE HORAIRE
    // ========================================
    if (detailedData && detailedData.hourlyBreakdown) {
        text += `# ⏰ Analyse des Horaires de Travail\n\n`;
        
        const hb = detailedData.hourlyBreakdown;
        
        text += `## Plages Horaires\n\n`;
        
        if (hb.avgStartHour && hb.avgEndHour) {
            text += `* **Heure de début moyenne** : ${Math.floor(hb.avgStartHour)}h${((hb.avgStartHour % 1) * 60).toFixed(0).padStart(2, '0')}\n`;
            text += `* **Heure de fin moyenne** : ${Math.floor(hb.avgEndHour)}h${((hb.avgEndHour % 1) * 60).toFixed(0).padStart(2, '0')}\n`;
            text += `* **Début le plus tôt** : ${hb.earliestStart}h00\n`;
            text += `* **Fin la plus tardive** : ${hb.latestEnd}h00\n`;
            text += `* **Durée moyenne de session** : ${hb.avgSessionDuration}h\n\n`;

            text += `### 🔍 Profil Horaire\n\n`;
            
            if (hb.avgStartHour < 8.5) {
                text += `✅ **Lève-tôt** : L'employé commence généralement tôt (avant 8h30), démontrant discipline et proactivité.\n\n`;
            } else if (hb.avgStartHour > 9.5) {
                text += `⚠️ **Démarrage tardif** : Les journées commencent généralement après 9h30, vérifier si cela correspond aux attentes.\n\n`;
            } else {
                text += `✅ **Horaires standard** : Début de journée dans les plages horaires habituelles (8h30-9h30).\n\n`;
            }

            const workSpan = hb.avgEndHour - hb.avgStartHour;
            if (workSpan > 9) {
                text += `⚠️ **Journées longues** : Amplitude moyenne de ${workSpan.toFixed(1)}h, attention à la charge de travail et au risque d'épuisement.\n\n`;
            } else if (workSpan >= 7 && workSpan <= 9) {
                text += `✅ **Amplitude équilibrée** : Journées de ${workSpan.toFixed(1)}h en moyenne, dans les normes attendues.\n\n`;
            }
        } else {
            text += `*Données horaires insuffisantes pour une analyse détaillée.*\n\n`;
        }
    }

    text += `---\n\n`;

    // ========================================
    // RÉPARTITION DU TEMPS
    // ========================================
    text += `# 📈 Répartition Détaillée du Temps\n\n`;
    
    text += `## Vue d'Ensemble\n\n`;
    text += `| Catégorie | Temps Total | Pourcentage | Moyenne/Jour |\n`;
    text += `|-----------|-------------|-------------|---------------|\n`;

    const workPercent = totalHours > 0 ? ((stats.total_work_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;
    const breakPercent = totalHours > 0 ? ((stats.total_break_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;
    const lunchPercent = totalHours > 0 ? ((stats.total_lunch_seconds / 3600 / totalHours) * 100).toFixed(1) : 0;

    const avgWorkPerDay = stats.total_days > 0 ? (stats.total_work_seconds / 3600 / stats.total_days).toFixed(1) : 0;
    const avgBreakPerDay = stats.total_days > 0 ? (stats.total_break_seconds / 3600 / stats.total_days).toFixed(1) : 0;
    const avgLunchPerDay = stats.total_days > 0 ? (stats.total_lunch_seconds / 3600 / stats.total_days).toFixed(1) : 0;

    text += `| 💼 Temps de travail | ${workHours}h | ${workPercent}% | ${avgWorkPerDay}h |\n`;
    text += `| ☕ Pauses courtes | ${breakHours}h | ${breakPercent}% | ${avgBreakPerDay}h |\n`;
    text += `| 🍴 Pause déjeuner | ${lunchHours}h | ${lunchPercent}% | ${avgLunchPerDay}h |\n`;
    text += `| **TOTAL** | **${totalHours}h** | **100%** | **${(parseFloat(avgWorkPerDay) + parseFloat(avgBreakPerDay) + parseFloat(avgLunchPerDay)).toFixed(1)}h** |\n\n`;

    // ========================================
    // ANALYSE PAR JOUR DE LA SEMAINE
    // ========================================
    if (detailedData && detailedData.weekdayAnalysis && detailedData.weekdayAnalysis.length > 0) {
        text += `## Répartition par Jour de la Semaine\n\n`;
        
        text += `| Jour | Occurrences | Temps Moyen | Productivité |\n`;
        text += `|------|-------------|-------------|---------------|\n`;
        
        detailedData.weekdayAnalysis.forEach(day => {
            text += `| ${day.day_name} | ${day.day_count} | ${day.avg_work_hours}h | ${day.productivity_score}% |\n`;
        });
        text += `\n`;

        const sortedByProd = [...detailedData.weekdayAnalysis].sort((a, b) => b.productivity_score - a.productivity_score);
        if (sortedByProd.length > 0) {
            text += `### 💡 Observations\n\n`;
            text += `* **Jour le plus productif** : ${sortedByProd[0].day_name} (${sortedByProd[0].productivity_score}% de productivité)\n`;
            if (sortedByProd.length > 1) {
                text += `* **Jour le moins productif** : ${sortedByProd[sortedByProd.length - 1].day_name} (${sortedByProd[sortedByProd.length - 1].productivity_score}% de productivité)\n`;
            }
            text += `\n`;
        }
    }

    text += `---\n\n`;

    // ========================================
    // STATISTIQUES JOURNALIÈRES
    // ========================================
    if (detailedData && detailedData.dailyStats && detailedData.dailyStats.length > 0) {
        text += `# 📅 Évolution Journalière\n\n`;
        
        text += `## Détail des 10 Derniers Jours\n\n`;
        text += `| Date | Jour | Travail | Pauses | Déjeuner | Productivité |\n`;
        text += `|------|------|---------|--------|----------|---------------|\n`;

        detailedData.dailyStats.slice(0, 10).forEach(day => {
            text += `| ${new Date(day.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} | ${day.day_of_week} | ${day.work_hours}h | ${day.break_hours}h | ${day.lunch_hours}h | ${day.productivity_rate}% |\n`;
        });
        text += `\n`;

        const avgProd = detailedData.dailyStats.reduce((sum, d) => sum + parseFloat(d.productivity_rate || 0), 0) / detailedData.dailyStats.length;
        const maxProdDay = detailedData.dailyStats.reduce((max, d) => d.productivity_rate > max.productivity_rate ? d : max, detailedData.dailyStats[0]);
        const minProdDay = detailedData.dailyStats.reduce((min, d) => d.productivity_rate < min.productivity_rate ? d : min, detailedData.dailyStats[0]);

        text += `### 📊 Tendances\n\n`;
        text += `* **Productivité moyenne** : ${avgProd.toFixed(1)}%\n`;
        text += `* **Meilleure journée** : ${new Date(maxProdDay.date).toLocaleDateString('fr-FR')} (${maxProdDay.productivity_rate}%)\n`;
        text += `* **Journée la plus difficile** : ${new Date(minProdDay.date).toLocaleDateString('fr-FR')} (${minProdDay.productivity_rate}%)\n\n`;
    }

    text += `---\n\n`;

    // ========================================
    // ANALYSE DES ACTIVITÉS
    // ========================================
    text += `# 🎯 Analyse des Activités\n\n`;

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

        text += `## Vue d'Ensemble des Activités\n\n`;
        text += `* **Total d'activités distinctes** : ${sortedActivities.length}\n`;
        text += `* **Total de sessions** : ${activities.length}\n`;
        text += `* **Durée moyenne par session** : ${(activities.reduce((sum, a) => sum + a.duration_seconds, 0) / activities.length / 60).toFixed(0)} minutes\n\n`;

        text += `## Top 15 des Activités par Temps Consacré\n\n`;
        text += `| # | Activité | Type | Temps | Sessions | Moy/Session | % du Total |\n`;
        text += `|---|----------|------|-------|----------|-------------|------------|\n`;

        const totalActivityTime = sortedActivities.reduce((sum, a) => sum + a.totalSeconds, 0);

        sortedActivities.slice(0, 15).forEach((activity, index) => {
            const hours = (activity.totalSeconds / 3600).toFixed(1);
            const avgMinutes = Math.round(activity.totalSeconds / activity.occurrences / 60);
            const typeIcon = activity.type === 'project' ? '📁' : '✓';
            const typeLabel = activity.type === 'project' ? 'Projet' : 'Tâche';
            const percentOfTotal = ((activity.totalSeconds / totalActivityTime) * 100).toFixed(1);
            
            text += `| ${index + 1} | ${typeIcon} ${activity.name} | ${typeLabel} | ${hours}h | ${activity.occurrences} | ${avgMinutes}min | ${percentOfTotal}% |\n`;
        });
        text += `\n`;

        const top5Time = sortedActivities.slice(0, 5).reduce((sum, a) => sum + a.totalSeconds, 0);
        const concentrationRatio = (top5Time / totalActivityTime * 100).toFixed(1);
        
        text += `### 🎯 Concentration des Efforts\n\n`;
        text += `* Les **5 activités principales** représentent **${concentrationRatio}%** du temps total\n`;
        
        if (concentrationRatio >= 70) {
            text += `* ✅ **Focus élevé** : L'employé concentre son effort sur un nombre restreint d'activités prioritaires\n\n`;
        } else if (concentrationRatio >= 50) {
            text += `* ⚠️ **Focus modéré** : Le temps est réparti sur plusieurs activités, attention à la dispersion\n\n`;
        } else {
            text += `* ❌ **Dispersion importante** : Le temps est très fragmenté entre de nombreuses activités, risque de perte d'efficacité\n\n`;
        }

        // ========================================
        // DÉTAIL DES PROJETS
        // ========================================
        if (detailedData && detailedData.projectBreakdown && detailedData.projectBreakdown.length > 0) {
            text += `---\n\n`;
            text += `## 📁 Analyse Détaillée des Projets\n\n`;
            
            detailedData.projectBreakdown.forEach((project, idx) => {
                text += `### ${idx + 1}. ${project.name}\n\n`;
                
                if (project.client) text += `**Client** : ${project.client}\n\n`;
                if (project.description) text += `*${project.description}*\n\n`;
                
                text += `| Métrique | Valeur |\n`;
                text += `|----------|--------|\n`;
                text += `| ⏱️ Temps total | ${project.total_hours}h (${project.percentage_of_time}% du temps) |\n`;
                text += `| 📊 Nombre de sessions | ${project.session_count} |\n`;
                text += `| ⌀ Durée par session | ${project.avg_hours_per_session}h |\n`;
                text += `| 📅 Jours actifs | ${project.days_active} |\n`;
                text += `| 📅 Période | Du ${new Date(project.first_date).toLocaleDateString('fr-FR')} au ${new Date(project.last_date).toLocaleDateString('fr-FR')} |\n\n`;

                const investmentLevel = parseFloat(project.percentage_of_time);
                if (investmentLevel >= 20) {
                    text += `💡 **Projet majeur** : Forte concentration (${investmentLevel}% du temps total), investissement significatif sur ce projet.\n\n`;
                } else if (investmentLevel >= 10) {
                    text += `💡 **Projet important** : Investissement régulier (${investmentLevel}% du temps total).\n\n`;
                } else {
                    text += `💡 **Projet secondaire** : Investissement modéré (${investmentLevel}% du temps total).\n\n`;
                }
            });
        }

        // ========================================
        // DÉTAIL DES TÂCHES
        // ========================================
        if (detailedData && detailedData.taskBreakdown && detailedData.taskBreakdown.length > 0) {
            text += `---\n\n`;
            text += `## ✓ Analyse Détaillée des Tâches\n\n`;
            
            detailedData.taskBreakdown.slice(0, 10).forEach((task, idx) => {
                text += `### ${idx + 1}. ${task.name}\n\n`;
                
                if (task.description) text += `*${task.description}*\n\n`;
                
                text += `| Métrique | Valeur |\n`;
                text += `|----------|--------|\n`;
                text += `| ⏱️ Temps total | ${task.total_hours}h (${task.percentage_of_time}% du temps) |\n`;
                text += `| 📊 Nombre de sessions | ${task.session_count} |\n`;
                text += `| ⌀ Durée par session | ${task.avg_hours_per_session}h |\n`;
                text += `| 📅 Jours actifs | ${task.days_active} |\n`;
                text += `| 📅 Période | Du ${new Date(task.first_date).toLocaleDateString('fr-FR')} au ${new Date(task.last_date).toLocaleDateString('fr-FR')} |\n\n`;
            });
        }
    } else {
        text += `Aucune activité enregistrée sur la période analysée.\n\n`;
    }

    text += `---\n\n`;

    // ========================================
    // COMPARAISON AVEC L'ÉQUIPE
    // ========================================
    if (detailedData && detailedData.comparisonData) {
        text += `# 📊 Comparaison avec l'Équipe\n\n`;
        
        const cd = detailedData.comparisonData;
        
        text += `## Positionnement\n\n`;
        text += `| Métrique | Employé | Moyenne Entreprise | Écart |\n`;
        text += `|----------|---------|---------------------|-------|\n`;
        text += `| Temps de travail moyen | ${(cd.employeeAvgWorkSeconds / 3600).toFixed(1)}h | ${(cd.companyAvgWorkSeconds / 3600).toFixed(1)}h | ${cd.performanceVsAverage > 0 ? '+' : ''}${cd.performanceVsAverage}% |\n`;
        text += `| Activités par jour | ${cd.employeeAvgActivities} | ${cd.companyAvgActivities.toFixed(2)} | ${cd.activitiesVsAverage > 0 ? '+' : ''}${cd.activitiesVsAverage}% |\n\n`;

        text += `### 💡 Analyse\n\n`;
        
        if (parseFloat(cd.performanceVsAverage) > 10) {
            text += `* ✅ **Performance supérieure** : L'employé travaille ${cd.performanceVsAverage}% de plus que la moyenne de l'entreprise\n`;
        } else if (parseFloat(cd.performanceVsAverage) < -10) {
            text += `* ⚠️ **Performance inférieure** : L'employé travaille ${cd.performanceVsAverage}% de moins que la moyenne de l'entreprise\n`;
        } else {
            text += `* ✅ **Performance dans la norme** : L'employé se situe dans la moyenne de l'entreprise (${cd.performanceVsAverage}%)\n`;
        }

        if (parseFloat(cd.activitiesVsAverage) > 20) {
            text += `* ✅ **Très actif** : ${cd.activitiesVsAverage}% d'activités de plus que la moyenne, démontrant une grande polyvalence\n`;
        } else if (parseFloat(cd.activitiesVsAverage) < -20) {
            text += `* 💡 **Focus concentré** : ${cd.activitiesVsAverage}% d'activités de moins, l'employé se concentre sur moins de tâches\n`;
        }

        text += `\n`;
    }

    text += `---\n\n`;

    // ========================================
    // RECOMMANDATIONS STRATÉGIQUES
    // ========================================
    text += `# 💡 Recommandations Stratégiques\n\n`;

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

    // ========================================
    // CONCLUSION
    // ========================================
    text += `# 🎯 Conclusion\n\n`;
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

// ============================================
// ROUTES GAMMA API
// ============================================

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

            // Métriques de productivité
            const totalTime = stats.total_work_seconds + stats.total_break_seconds + stats.total_lunch_seconds;
            const productivityRate = totalTime > 0 
                ? (stats.total_work_seconds / totalTime * 100).toFixed(2) 
                : 0;

            detailedData.productivityMetrics = {
                productivityRate: parseFloat(productivityRate),
                avgDailyWorkHours: stats.total_days > 0 
                    ? (stats.total_work_seconds / 3600 / stats.total_days).toFixed(2) 
                    : 0,
                consistencyScore: 0.75, // Valeur par défaut
                workBreakRatio: (stats.total_break_seconds + stats.total_lunch_seconds) > 0
                    ? (stats.total_work_seconds / (stats.total_break_seconds + stats.total_lunch_seconds)).toFixed(2)
                    : 0,
                activeWorkDays: stats.total_days,
                totalActivities: activities.length,
                avgActivitiesPerDay: stats.total_days > 0
                    ? (activities.length / stats.total_days).toFixed(2)
                    : 0
            };

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
                        else {
                            const enriched = rows.map(proj => ({
                                ...proj,
                                total_hours: (proj.total_seconds / 3600).toFixed(2),
                                avg_hours_per_session: (proj.avg_session_duration / 3600).toFixed(2),
                                percentage_of_time: stats.total_work_seconds > 0
                                    ? ((proj.total_seconds / stats.total_work_seconds) * 100).toFixed(2)
                                    : 0,
                                days_active: proj.first_date && proj.last_date
                                    ? Math.ceil((new Date(proj.last_date) - new Date(proj.first_date)) / (1000 * 60 * 60 * 24)) + 1
                                    : 0
                            }));
                            resolve(enriched || []);
                        }
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
                        else {
                            const enriched = rows.map(task => ({
                                ...task,
                                total_hours: (task.total_seconds / 3600).toFixed(2),
                                avg_hours_per_session: (task.avg_session_duration / 3600).toFixed(2),
                                percentage_of_time: stats.total_work_seconds > 0
                                    ? ((task.total_seconds / stats.total_work_seconds) * 100).toFixed(2)
                                    : 0,
                                days_active: task.first_date && task.last_date
                                    ? Math.ceil((new Date(task.last_date) - new Date(task.first_date)) / (1000 * 60 * 60 * 24)) + 1
                                    : 0
                            }));
                            resolve(enriched || []);
                        }
                    }
                );
            });

            // Analyse par jour de la semaine
            detailedData.weekdayAnalysis = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT
                        CASE cast(strftime('%w', date) as integer)
                            WHEN 0 THEN 'Dimanche'
                            WHEN 1 THEN 'Lundi'
                            WHEN 2 THEN 'Mardi'
                            WHEN 3 THEN 'Mercredi'
                            WHEN 4 THEN 'Jeudi'
                            WHEN 5 THEN 'Vendredi'
                            WHEN 6 THEN 'Samedi'
                        END as day_name,
                        strftime('%w', date) as day_number,
                        COUNT(*) as day_count,
                        AVG(work_seconds) as avg_work_seconds,
                        AVG(break_seconds + lunch_seconds) as avg_break_seconds,
                        SUM(work_seconds) as total_work_seconds
                     FROM work_sessions
                     WHERE user_id = ? ${dateFilter}
                     GROUP BY strftime('%w', date)
                     ORDER BY day_number`,
                    [employeeId],
                    (err, rows) => {
                        if (err) reject(err);
                        else {
                            const enriched = rows.map(day => ({
                                ...day,
                                avg_work_hours: (day.avg_work_seconds / 3600).toFixed(2),
                                total_work_hours: (day.total_work_seconds / 3600).toFixed(2),
                                productivity_score: day.avg_work_seconds > 0 && day.avg_break_seconds > 0
                                    ? ((day.avg_work_seconds / (day.avg_work_seconds + day.avg_break_seconds)) * 100).toFixed(2)
                                    : 0
                            }));
                            resolve(enriched || []);
                        }
                    }
                );
            });

            // Analyse horaire
            const hourlyData = await new Promise((resolve, reject) => {
                db.all(
                    `SELECT
                        strftime('%H', start_time) as start_hour,
                        strftime('%H', end_time) as end_hour
                     FROM work_sessions
                     WHERE user_id = ? ${dateFilter}
                     AND start_time IS NOT NULL AND end_time IS NOT NULL`,
                    [employeeId],
                    (err, rows) => {
                        if (err) reject(err);
                        else resolve(rows || []);
                    }
                );
            });

            const startHours = hourlyData.map(d => parseInt(d.start_hour)).filter(h => !isNaN(h));
            const endHours = hourlyData.map(d => parseInt(d.end_hour)).filter(h => !isNaN(h));

            detailedData.hourlyBreakdown = {
                avgStartHour: startHours.length > 0 
                    ? (startHours.reduce((a, b) => a + b, 0) / startHours.length).toFixed(1)
                    : null,
                avgEndHour: endHours.length > 0
                    ? (endHours.reduce((a, b) => a + b, 0) / endHours.length).toFixed(1)
                    : null,
                earliestStart: startHours.length > 0 ? Math.min(...startHours) : null,
                latestEnd: endHours.length > 0 ? Math.max(...endHours) : null,
                avgSessionDuration: null
            };

            console.log('📊 Données détaillées récupérées');
        }

        const inputText = formatEmployeeDataForGamma(employee, stats, activities, detailedData);
        
        console.log('📝 Texte formaté - Longueur:', inputText.length, 'caractères');
        console.log('🔑 Clé API présente:', GAMMA_API_KEY ? 'OUI' : 'NON');
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
