import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mysql from "mysql2";

dotenv.config();

const app = express();
app.use(cors({
  origin: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.options('*', cors({
  origin: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true,
}));
app.use(express.json());

// ─────────────────────────────────────────────
// DB CONNECTION
// ─────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

function query(sql, params) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// ─────────────────────────────────────────────
// AUTO-MIGRATION
// ─────────────────────────────────────────────
async function runMigrations() {
  try {
    const statusCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpis' AND COLUMN_NAME = 'status'`
    );
    if (statusCol.length === 0) {
      await query(`ALTER TABLE kpis ADD COLUMN status ENUM('pending','draft','finalized') NOT NULL DEFAULT 'pending'`);
    }

    const finalizedAtCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpis' AND COLUMN_NAME = 'finalized_at'`
    );
    if (finalizedAtCol.length === 0) {
      await query(`ALTER TABLE kpis ADD COLUMN finalized_at TIMESTAMP NULL DEFAULT NULL`);
    }

    const tlRemarksCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpis' AND COLUMN_NAME = 'tl_remarks'`
    );
    if (tlRemarksCol.length === 0) {
      await query(`ALTER TABLE kpis ADD COLUMN tl_remarks TEXT NULL DEFAULT NULL`);
    }

    await query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         INT          NOT NULL AUTO_INCREMENT,
        user_id    INT          NOT NULL,
        message    TEXT         NOT NULL,
        is_read    TINYINT(1)   NOT NULL DEFAULT 0,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS teams (
        id      INT          NOT NULL AUTO_INCREMENT,
        name    VARCHAR(255) NOT NULL,
        lead_id INT          NULL,
        PRIMARY KEY (id),
        FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Add status column to teams if missing
    const teamsStatusCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'teams' AND COLUMN_NAME = 'status'`
    );
    if (teamsStatusCol.length === 0) {
      await query(`ALTER TABLE teams ADD COLUMN status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'`);
    }

    const teamIdCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'team_id'`
    );
    if (teamIdCol.length === 0) {
      await query(`ALTER TABLE users ADD COLUMN team_id INT NULL`);
    }

    const stuckRows = await query(
      `SELECT COUNT(*) AS cnt FROM kpis WHERE final_score > 0 AND status = 'pending'`
    );
    if (stuckRows[0]?.cnt > 0) {
      await query(
        `UPDATE kpis
         SET status       = 'finalized',
             finalized_at = COALESCE(finalized_at, updated_at, NOW())
         WHERE final_score > 0 AND status = 'pending'`
      );
    }

    const generatedCols = await query(
      `SELECT COLUMN_NAME, EXTRA
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME   = 'kpis'
         AND COLUMN_NAME  IN ('lead_score','final_score')
         AND EXTRA LIKE '%GENERATED%'`
    );
    if (generatedCols.length > 0) {
      const names = generatedCols.map(r => r.COLUMN_NAME);
      if (names.includes('final_score')) {
        await query(`ALTER TABLE kpis MODIFY COLUMN final_score DECIMAL(5,2) NOT NULL DEFAULT 0`);
      }
      if (names.includes('lead_score')) {
        await query(`ALTER TABLE kpis MODIFY COLUMN lead_score DECIMAL(5,2) NOT NULL DEFAULT 0`);
      }
      await query(
        `UPDATE kpis
         SET lead_score  = communication + teamwork + discipline + initiative,
             final_score = auto_score + communication + teamwork + discipline + initiative`
      );
    }

    console.log('[migration] All migrations complete.');
  } catch (err) {
    console.error("[migration] Failed:", err.message);
  }
}
runMigrations();

// ─────────────────────────────────────────────
// MIDDLEWARE - JWT verification
// ─────────────────────────────────────────────
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Access denied. No token provided." });
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ message: "Invalid or expired token." });
  }
}

// ─────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", version: "v2-with-logging" });
});

app.get("/api/test-db", async (req, res) => {
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ message: "Pass ?userId=X" });
  try {
    const rows = await query("SELECT id, user_id, status, communication, teamwork, discipline, initiative, lead_score, final_score, finalized_at FROM kpis WHERE user_id = ?", [userId]);
    res.json({ rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  const sql = "SELECT * FROM users WHERE email = ?";
  pool.query(sql, [email], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(401).json({ message: "Invalid credentials" });
    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid credentials" });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  });
});

app.get("/api/auth/me", verifyToken, (req, res) => {
  const sql = "SELECT id, name, email, role, COALESCE(status,'Active') AS status FROM users WHERE id = ?";
  pool.query(sql, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(404).json({ message: "User not found" });
    res.json({ user: results[0] });
  });
});

// ─────────────────────────────────────────────
// TEAM – list members (Team Lead)
// ─────────────────────────────────────────────
app.get("/api/team/members", verifyToken, (req, res) => {
  if (req.user.role !== "Team Lead") {
    return res.status(403).json({ message: "Access denied. Team Lead only." });
  }
  const tlId = req.user.id;
  const sql = `
    SELECT u.id, u.name, u.email, u.role, u.team_id,
           k.auto_score   AS system_score,
           k.lead_score   AS tl_score,
           k.final_score,
           k.communication, k.teamwork, k.discipline, k.initiative,
           COALESCE(k.status, 'pending') AS kpi_status,
           4 AS total_criteria,
           (
             CASE WHEN COALESCE(k.communication,0) > 0 THEN 1 ELSE 0 END +
             CASE WHEN COALESCE(k.teamwork,0)      > 0 THEN 1 ELSE 0 END +
             CASE WHEN COALESCE(k.discipline,0)    > 0 THEN 1 ELSE 0 END +
             CASE WHEN COALESCE(k.initiative,0)    > 0 THEN 1 ELSE 0 END
           ) AS submitted_criteria
    FROM users u
    INNER JOIN teams t ON u.team_id = t.id
    LEFT  JOIN kpis  k ON k.user_id = u.id
    WHERE t.lead_id = ? AND u.role = 'Team Member'
  `;
  pool.query(sql, [tlId], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ members: results, periodId: 1 });
  });
});

// ─────────────────────────────────────────────
// TEAM – single member detail
// ─────────────────────────────────────────────
app.get("/api/team/:tlId/members/:empId", verifyToken, async (req, res) => {
  const { tlId, empId } = req.params;
  try {
    const members = await query(
      `SELECT u.* FROM users u
       INNER JOIN teams t ON u.team_id = t.id
       WHERE u.id = ? AND t.lead_id = ?`,
      [empId, tlId]
    );
    if (members.length === 0) return res.status(404).json({ message: "Member not found in your team." });
    const member = members[0];
    const kpiRows = await query("SELECT * FROM kpis WHERE user_id = ?", [empId]);
    const kpi = kpiRows[0] || null;
    const dynamicMetrics = await query('SELECT * FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC');
    const knownCols = ['communication', 'teamwork', 'discipline', 'initiative'];
    const criteria = dynamicMetrics.map((m) => {
      const colName = m.metric_name.toLowerCase().replace(/\s+/g, '_');
      const storedScore = kpi && knownCols.includes(colName) ? (kpi[colName] ?? null) : null;
      return {
        id: m.id,
        name: m.metric_name,
        max_score: m.max_score,
        weight_percent: Math.round(100 / dynamicMetrics.length),
        system_raw_score: null,
        system_normalized: 0,
        tl_raw_score: storedScore,
        tl_comments: null,
      };
    });
    const autoScore = parseFloat(kpi?.auto_score ?? 0);
    const finalKpi = kpi
      ? {
          status:       kpi.status ?? 'pending',
          tl_remarks:   kpi.tl_remarks ?? null,
          finalized_at: kpi.finalized_at,
          auto_score:   kpi.auto_score,
          final_score:  kpi.final_score,
        }
      : null;
    res.json({ member, criteria, finalKpi, autoScore });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// TEAM – update member
// ─────────────────────────────────────────────
app.put("/api/team/:tlId/members/:empId", verifyToken, async (req, res) => {
  const { tlId, empId } = req.params;
  const { name, email } = req.body;
  try {
    const members = await query(
      `SELECT u.id FROM users u
       INNER JOIN teams t ON u.team_id = t.id
       WHERE u.id = ? AND t.lead_id = ?`,
      [empId, tlId]
    );
    if (members.length === 0) return res.status(404).json({ message: "Member not found in your team." });
    await query("UPDATE users SET name = ?, email = ? WHERE id = ?", [name, email, empId]);
    res.json({ message: "Member updated successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// TEAM – submit TL evaluation
// ─────────────────────────────────────────────
app.post("/api/team/evaluation", verifyToken, async (req, res) => {
  if (req.user.role !== "Team Lead") return res.status(403).json({ message: "Access denied. Team Lead only." });
  const { employeeId, evaluations } = req.body;
  const colMap = { 1: "communication", 2: "teamwork", 3: "discipline", 4: "initiative" };
  try {
    // Always fetch the existing row so we can reuse the correct auto_score
    const existing = await query("SELECT id, auto_score FROM kpis WHERE user_id = ?", [employeeId]);
    console.log("[evaluation] existing rows:", existing.length);

    const updates = {};
    for (const ev of evaluations) {
      const col = colMap[ev.criteriaId];
      if (col) updates[col] = ev.score;
    }
    const comm = updates["communication"] ?? 0;
    const team = updates["teamwork"]      ?? 0;
    const disc = updates["discipline"]    ?? 0;
    const init = updates["initiative"]    ?? 0;
    const tlSum = comm + team + disc + init;
    console.log("[evaluation] scores: comm=", comm, "team=", team, "disc=", disc, "init=", init);

    if (existing.length === 0) {
      // No KPI row yet — insert with auto_score = 0 (will be set when system score is assigned)
      console.log("[evaluation] INSERTing new row (auto_score=0, no system score assigned yet)...");
      await query(
        `INSERT INTO kpis (user_id, auto_score, communication, teamwork, discipline, initiative, lead_score, final_score, status)
         VALUES (?, 0, ?, ?, ?, ?, ?, ?, 'draft')`,
        [employeeId, comm, team, disc, init, tlSum, tlSum]
      );
    } else {
      // Reuse the stored auto_score — never reset it to 0
      const autoScore = parseFloat(existing[0].auto_score ?? 0);
      const finalScore = autoScore + tlSum;
      console.log("[evaluation] UPDATing existing row. autoScore=", autoScore, "tlSum=", tlSum, "finalScore=", finalScore);
      const result = await query(
        `UPDATE kpis
         SET communication = ?, teamwork = ?, discipline = ?, initiative = ?,
             lead_score  = ?,
             final_score = ?,
             status = 'draft', updated_at = NOW()
         WHERE user_id = ?`,
        [comm, team, disc, init, tlSum, finalScore, employeeId]
      );
    }
    res.json({ message: "Evaluation saved as draft." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// TEAM – finalize KPI
// ─────────────────────────────────────────────
app.post("/api/team/finalize-kpi", verifyToken, async (req, res) => {
  if (req.user.role !== "Team Lead") return res.status(403).json({ message: "Access denied. Team Lead only." });
  const { employeeId, tlRemarks } = req.body;
  try {
    const rows = await query("SELECT id FROM kpis WHERE user_id = ?", [employeeId]);
    if (rows.length === 0) return res.status(400).json({ message: "No KPI found for this employee. Save scores first." });
    await query(
      `UPDATE kpis SET status = 'finalized', finalized_at = NOW(), updated_at = NOW(), tl_remarks = ? WHERE user_id = ?`,
      [tlRemarks ?? null, employeeId]
    );
    const updated = await query("SELECT status, lead_score, final_score FROM kpis WHERE user_id = ?", [employeeId]);
    res.json({
      message: "KPI finalized.",
      leadScore:  updated[0]?.lead_score  ?? 0,
      finalScore: updated[0]?.final_score ?? 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────
app.get("/api/notifications/:tlId", verifyToken, (req, res) => {
  pool.query(
    `SELECT *, (is_read = 0) AS unread FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
    [req.params.tlId],
    (err, results) => {
      if (err) return res.status(500).json({ message: err.message });
      res.json({ notifications: results, unreadCount: results.filter(n => !n.is_read).length });
    }
  );
});
app.patch("/api/notifications/:id/read", verifyToken, (req, res) => {
  pool.query("UPDATE notifications SET is_read = 1 WHERE id = ?", [req.params.id], err => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "Marked as read" });
  });
});
app.patch("/api/notifications/:tlId/read-all", verifyToken, (req, res) => {
  pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.params.tlId], err => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "All notifications marked as read" });
  });
});

// ─────────────────────────────────────────────
// KPI – Team Lead: view own KPI (evaluated by Manager)
// ─────────────────────────────────────────────
app.get("/api/team/my-kpi", verifyToken, async (req, res) => {
  if (req.user.role !== "Team Lead") return res.status(403).json({ message: "Team Lead only." });
  try {
    const rows = await query(
      "SELECT * FROM kpis WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [req.user.id]
    );
    if (!rows[0]) return res.json({ kpi: null });
    const k = rows[0];
    const dynamicMetrics = await query(
      "SELECT * FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC"
    );
    const knownCols = ["communication", "teamwork", "discipline", "initiative"];
    const metricBreakdown = dynamicMetrics.map((m) => {
      const col = m.metric_name.toLowerCase().replace(/\s+/g, "_");
      const score = knownCols.includes(col) ? (k[col] ?? 0) : 0;
      return { id: m.id, name: m.metric_name, score, max_score: m.max_score };
    });
    const manualScore = metricBreakdown.reduce((s, m) => s + m.score, 0);
    res.json({
      kpi: {
        autoScore:       k.auto_score  ?? 0,
        manualScore,
        finalScore:      k.final_score ?? 0,
        status:          k.status      ?? "pending",
        finalized_at:    k.finalized_at ?? null,
        metricBreakdown,
      },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// KPI (Team Member – view own KPI)
// ─────────────────────────────────────────────
app.get("/api/kpi", verifyToken, (req, res) => {
  pool.query("SELECT * FROM kpis WHERE user_id = ? ORDER BY id DESC LIMIT 1", [req.user.id], async (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results[0]) return res.json({ kpi: null });
    const row = results[0];
    let dynamicMetrics = [];
    try { dynamicMetrics = await query('SELECT * FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC'); } catch (_) {}
    const knownCols = ['communication', 'teamwork', 'discipline', 'initiative'];
    const leadMetricsArr = dynamicMetrics.map(m => {
      const col = m.metric_name.toLowerCase().replace(/\s+/g, '_');
      const val = knownCols.includes(col) ? (row[col] ?? 0) : 0;
      return { id: m.id, name: m.metric_name, score: val, max_score: m.max_score };
    });
    const leadScore = leadMetricsArr.reduce((s, m) => s + m.score, 0);
    res.json({
      kpi: {
        autoScore:   row.auto_score  ?? 0,
        leadScore,
        finalScore:  row.final_score ?? 0,
        leadMetrics: {
          communication: row.communication ?? 0,
          teamwork:      row.teamwork      ?? 0,
          discipline:    row.discipline    ?? 0,
          initiative:    row.initiative    ?? 0,
        },
        leadMetricsArr,
      },
    });
  });
});

// ─────────────────────────────────────────────
// MANAGER MIDDLEWARE
// ─────────────────────────────────────────────
async function requireManager(req, res, next) {
  try {
    const rows = await query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (rows.length === 0) return res.status(403).json({ message: 'User not found.' });
    if (rows[0].role !== 'Manager') return res.status(403).json({ message: 'Access denied. Manager only.' });
    req.user.role = rows[0].role;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Auth check failed: ' + err.message });
  }
}

// ─────────────────────────────────────────────
// MANAGER APIs
// ─────────────────────────────────────────────
app.get('/api/manager/stats', verifyToken, requireManager, async (req, res) => {
  try {
    const [[employees], [teamLeads], [teams], [avgRow], [pending]] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'Team Member'`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'Team Lead'`),
      query(`SELECT COUNT(*) AS cnt FROM teams`),
      query(`SELECT ROUND(AVG(final_score),1) AS avg_kpi FROM kpis WHERE final_score > 0`),
      query(`SELECT COUNT(*) AS cnt FROM users u LEFT JOIN kpis k ON k.user_id = u.id WHERE u.role='Team Member' AND (k.id IS NULL OR k.final_score = 0)`),
    ]);
    res.json({
      totalEmployees: employees.cnt ?? 0,
      totalTeamLeads: teamLeads.cnt ?? 0,
      totalTeams:     teams.cnt     ?? 0,
      avgKpi:         avgRow.avg_kpi ?? 0,
      pendingKpis:    pending.cnt   ?? 0,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/manager/analytics/monthly', verifyToken, requireManager, async (req, res) => {
  const { teamId } = req.query;
  try {
    let rows;
    if (!teamId || teamId === 'all') {
      rows = await query(`
        SELECT DATE_FORMAT(kmt.month, '%b %Y') AS month_label, DATE_FORMAT(kmt.month, '%Y-%m') AS month_key, ROUND(AVG(kmt.avg_score), 1) AS avg_score
        FROM kpi_monthly_trends kmt GROUP BY month_key, month_label ORDER BY month_key ASC LIMIT 12
      `);
    } else {
      rows = await query(`
        SELECT DATE_FORMAT(month, '%b %Y') AS month_label, DATE_FORMAT(month, '%Y-%m') AS month_key, ROUND(avg_score, 1) AS avg_score
        FROM kpi_monthly_trends WHERE team_id = ? ORDER BY month ASC LIMIT 12
      `, [teamId]);
    }
    res.json({ monthly: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/manager/analytics/teams', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT t.id AS team_id, t.name AS team_name, ROUND(AVG(k.final_score), 1) AS avg_score,
             COUNT(u.id) AS member_count, SUM(CASE WHEN k.final_score > 0 THEN 1 ELSE 0 END) AS finalized
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id AND u.role = 'Team Member'
      LEFT JOIN kpis  k ON k.user_id = u.id
      GROUP BY t.id, t.name ORDER BY avg_score DESC
    `);
    res.json({ teams: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/manager/employees', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.id, u.name, u.email, u.role, u.team_id, t.name AS team_name, tl.name AS team_lead_name,
             COALESCE(k.auto_score,0) AS auto_score, COALESCE(k.final_score,0) AS final_score,
             COALESCE(k.communication,0) AS communication, COALESCE(k.teamwork,0) AS teamwork,
             COALESCE(k.discipline,0) AS discipline, COALESCE(k.initiative,0) AS initiative,
             (COALESCE(k.communication,0)+COALESCE(k.teamwork,0)+COALESCE(k.discipline,0)+COALESCE(k.initiative,0)) AS lead_score,
             CASE WHEN k.id IS NULL THEN 'Pending' WHEN k.status='finalized' THEN 'Finalized' WHEN k.status='draft' THEN 'Draft' ELSE 'Pending' END AS kpi_status
      FROM users u
      LEFT JOIN teams t  ON t.id = u.team_id
      LEFT JOIN users tl ON tl.id = t.lead_id
      LEFT JOIN kpis  k  ON k.user_id = u.id
      WHERE u.role = 'Team Member' ORDER BY u.name ASC
    `);
    res.json({ employees: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/manager/teamleads', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.id, u.name, u.email, t.id AS team_id, t.name AS team_name, COUNT(m.id) AS member_count,
             COALESCE(k.auto_score,0) AS auto_score, COALESCE(k.final_score,0) AS final_score,
             COALESCE(k.communication,0) AS communication, COALESCE(k.teamwork,0) AS teamwork,
             COALESCE(k.discipline,0) AS discipline, COALESCE(k.initiative,0) AS initiative,
             (COALESCE(k.communication,0)+COALESCE(k.teamwork,0)+COALESCE(k.discipline,0)+COALESCE(k.initiative,0)) AS lead_score,
             CASE WHEN k.id IS NULL THEN 'Pending' WHEN k.status='finalized' THEN 'Finalized' WHEN k.status='draft' THEN 'Draft' ELSE 'Pending' END AS kpi_status
      FROM users u
      LEFT JOIN teams t  ON t.lead_id = u.id
      LEFT JOIN users m  ON m.team_id = t.id AND m.role = 'Team Member'
      LEFT JOIN kpis  k  ON k.user_id = u.id
      WHERE u.role = 'Team Lead'
      GROUP BY u.id, u.name, u.email, t.id, t.name, k.id, k.auto_score, k.final_score, k.communication, k.teamwork, k.discipline, k.initiative, k.status
      ORDER BY u.name ASC
    `);
    res.json({ teamLeads: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/manager/kpi/assign', verifyToken, requireManager, async (req, res) => {
  const { userId, autoScore, metricScores = [], saveDraft } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is required' });
  const auto = Number(autoScore ?? 0);

  // Fetch active metrics to map dynamic scores to legacy columns
  const activeMetrics = await query(
    'SELECT id, metric_name, max_score FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC'
  );
  const scoreMap = {};
  for (const ms of metricScores) scoreMap[ms.metricId] = Number(ms.score ?? 0);
  const totalManual = activeMetrics.reduce((sum, m) => sum + (scoreMap[m.id] ?? 0), 0);
  const lead = totalManual, final = Math.min(auto + lead, 100);

  // Map first 4 active metrics to legacy DB columns by position
  const legacyKeys = ['communication', 'teamwork', 'discipline', 'initiative'];
  const legacyVals = [0, 0, 0, 0];
  activeMetrics.slice(0, 4).forEach((m, i) => { legacyVals[i] = scoreMap[m.id] ?? 0; });
  const [comm, team, disc, init] = legacyVals;

  try {
    const existing = await query('SELECT id FROM kpis WHERE user_id = ?', [userId]);
    if (existing.length === 0) {
      saveDraft
        ? await query(`INSERT INTO kpis (user_id,auto_score,communication,teamwork,discipline,initiative,lead_score,final_score,status) VALUES (?,?,?,?,?,?,?,?,'draft')`, [userId,auto,comm,team,disc,init,lead,final])
        : await query(`INSERT INTO kpis (user_id,auto_score,communication,teamwork,discipline,initiative,lead_score,final_score,status,finalized_at) VALUES (?,?,?,?,?,?,?,?,'finalized',NOW())`, [userId,auto,comm,team,disc,init,lead,final]);
    } else {
      saveDraft
        ? await query(`UPDATE kpis SET auto_score=?,communication=?,teamwork=?,discipline=?,initiative=?,lead_score=?,final_score=?,status='draft',updated_at=NOW() WHERE user_id=?`, [auto,comm,team,disc,init,lead,final,userId])
        : await query(`UPDATE kpis SET auto_score=?,communication=?,teamwork=?,discipline=?,initiative=?,lead_score=?,final_score=?,status='finalized',finalized_at=NOW(),updated_at=NOW() WHERE user_id=?`, [auto,comm,team,disc,init,lead,final,userId]);
    }
    res.json({ message: saveDraft ? 'KPI saved as draft.' : 'KPI finalized.', finalScore: final });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/manager/teamlead/evaluate', verifyToken, requireManager, async (req, res) => {
  const { teamLeadId, metricScores = [], saveDraft } = req.body;
  if (!teamLeadId) return res.status(400).json({ message: 'teamLeadId is required' });

  // Fetch active metrics to map dynamic scores to legacy columns
  const activeMetrics = await query(
    'SELECT id, metric_name, max_score FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC'
  );
  const scoreMap = {};
  for (const ms of metricScores) scoreMap[ms.metricId] = Number(ms.score ?? 0);
  const totalManual = activeMetrics.reduce((sum, m) => sum + (scoreMap[m.id] ?? 0), 0);
  const lead = totalManual;

  // Map first 4 active metrics to legacy DB columns by position
  const legacyVals = [0, 0, 0, 0];
  activeMetrics.slice(0, 4).forEach((m, i) => { legacyVals[i] = scoreMap[m.id] ?? 0; });
  const [comm, team, disc, init] = legacyVals;

  try {
    const existing = await query('SELECT id, auto_score FROM kpis WHERE user_id=?', [teamLeadId]);
    const auto = Number(existing[0]?.auto_score ?? 0), final = Math.min(auto + lead, 100);
    if (existing.length === 0) {
      saveDraft
        ? await query(`INSERT INTO kpis (user_id,auto_score,communication,teamwork,discipline,initiative,lead_score,final_score,status) VALUES (?,0,?,?,?,?,?,?,'draft')`, [teamLeadId,comm,team,disc,init,lead,final])
        : await query(`INSERT INTO kpis (user_id,auto_score,communication,teamwork,discipline,initiative,lead_score,final_score,status,finalized_at) VALUES (?,0,?,?,?,?,?,?,'finalized',NOW())`, [teamLeadId,comm,team,disc,init,lead,final]);
    } else {
      saveDraft
        ? await query(`UPDATE kpis SET communication=?,teamwork=?,discipline=?,initiative=?,lead_score=?,final_score=?,status='draft',updated_at=NOW() WHERE user_id=?`, [comm,team,disc,init,lead,final,teamLeadId])
        : await query(`UPDATE kpis SET communication=?,teamwork=?,discipline=?,initiative=?,lead_score=?,final_score=?,status='finalized',finalized_at=NOW(),updated_at=NOW() WHERE user_id=?`, [comm,team,disc,init,lead,final,teamLeadId]);
    }
    res.json({ message: saveDraft ? 'Team Lead KPI saved as draft.' : 'Team Lead evaluated.', finalScore: final });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/manager/teams', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT t.id, t.name AS team_name, u.name AS lead_name, COUNT(m.id) AS member_count
      FROM teams t
      LEFT JOIN users u ON u.id = t.lead_id
      LEFT JOIN users m ON m.team_id = t.id AND m.role = 'Team Member'
      GROUP BY t.id, t.name, u.name ORDER BY t.name ASC
    `);
    res.json({ teams: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─────────────────────────────────────────────
// AI CHAT (Llama 3 via Groq)
// ─────────────────────────────────────────────
app.post("/api/chat", verifyToken, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ message: "message is required" });
  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey || groqApiKey === "your_groq_api_key_here") {
    return res.status(500).json({ message: "Groq API key not configured." });
  }
  let kpiContext = "No KPI data available for this user yet.";
  try {
    const kpiRows = await query("SELECT * FROM kpis WHERE user_id = ? ORDER BY id DESC LIMIT 1", [req.user.id]);
    if (kpiRows[0]) {
      const k = kpiRows[0];
      const leadScore = (k.communication??0)+(k.teamwork??0)+(k.discipline??0)+(k.initiative??0);
      kpiContext = `User KPI data:\n- Auto/System Score: ${k.auto_score??0}/80\n- Team Lead Score: ${leadScore}/20\n  - Communication: ${k.communication??0}/5\n  - Teamwork: ${k.teamwork??0}/5\n  - Discipline: ${k.discipline??0}/5\n  - Initiative: ${k.initiative??0}/5\n- Final KPI Score: ${k.final_score??0}/100`;
    }
  } catch (_) {}
  const systemPrompt = `You are a helpful KPI assistant for StackPulse. Be concise, supportive, and professional.\n\n${kpiContext}`;
  const groqMessages = [
    ...history.filter(m => m.role==="user"||m.role==="assistant").map(m => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];
  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqApiKey}` },
      body: JSON.stringify({ model: "llama-3.1-8b-instant", messages: [{ role: "system", content: systemPrompt }, ...groqMessages], max_tokens: 1024, temperature: 0.7 }),
    });
    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      return res.status(502).json({ message: "Groq API error: " + errBody });
    }
    const groqData = await groqRes.json();
    res.json({ reply: groqData.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response." });
  } catch (err) {
    res.status(500).json({ message: "Failed to reach Groq API: " + err.message });
  }
});

// ─────────────────────────────────────────────
// ADMIN – migrations
// ─────────────────────────────────────────────
async function runAdminMigrations() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS kpi_metrics (
        id          INT          NOT NULL AUTO_INCREMENT,
        metric_name VARCHAR(255) NOT NULL,
        max_score   INT          NOT NULL DEFAULT 5,
        is_active   TINYINT(1)   NOT NULL DEFAULT 1,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id)
      )
    `);
    const existing = await query('SELECT COUNT(*) AS cnt FROM kpi_metrics');
    if (existing[0].cnt === 0) {
      await query(`INSERT INTO kpi_metrics (metric_name, max_score) VALUES ('Communication',5),('Teamwork',5),('Discipline',5),('Initiative',5)`);
    }
    const statusCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='status'`
    );
    if (statusCol.length === 0) {
      await query(`ALTER TABLE users ADD COLUMN status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active'`);
    }
    console.log('[admin-migration] Phase 8 tables ready.');
  } catch (err) {
    console.error('[admin-migration] Failed:', err.message);
  }
}
runAdminMigrations();

// ─────────────────────────────────────────────
// ADMIN – middleware
// ─────────────────────────────────────────────
async function requireAdmin(req, res, next) {
  try {
    const rows = await query("SELECT role, COALESCE(status,'Active') AS status FROM users WHERE id = ?", [req.user.id]);
    if (rows.length === 0) return res.status(403).json({ message: 'User not found.' });
    if (rows[0].role.toLowerCase() !== 'admin') return res.status(403).json({ message: 'Access denied. Admin only.' });
    if (rows[0].status === 'Inactive') return res.status(403).json({ message: 'Account is inactive.' });
    req.user.role = rows[0].role;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Auth check failed: ' + err.message });
  }
}

// ══════════════════════════════════════════════
// ADMIN – KPI METRICS CRUD
// ══════════════════════════════════════════════
app.get('/api/admin/metrics', verifyToken, requireAdmin, async (req, res) => {
  try {
    res.json({ metrics: await query('SELECT * FROM kpi_metrics ORDER BY id ASC') });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Public (any auth'd user) – active metrics only
app.get('/api/metrics', verifyToken, async (req, res) => {
  try {
    res.json({ metrics: await query('SELECT * FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC') });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// Manager – active metrics for evaluation forms (same data, manager-scoped)
app.get('/api/manager/kpi-metrics', verifyToken, requireManager, async (req, res) => {
  try {
    const metrics = await query(
      'SELECT id, metric_name, max_score FROM kpi_metrics WHERE is_active = 1 ORDER BY id ASC'
    );
    res.json({ metrics });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/metrics', verifyToken, requireAdmin, async (req, res) => {
  const { metric_name, max_score } = req.body;
  if (!metric_name) return res.status(400).json({ message: 'metric_name is required' });
  try {
    const result = await query('INSERT INTO kpi_metrics (metric_name, max_score) VALUES (?, ?)', [metric_name.trim(), max_score ?? 5]);
    const row = await query('SELECT * FROM kpi_metrics WHERE id = ?', [result.insertId]);
    res.status(201).json({ metric: row[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/admin/metrics/:id', verifyToken, requireAdmin, async (req, res) => {
  const { metric_name, max_score, is_active } = req.body;
  try {
    await query('UPDATE kpi_metrics SET metric_name=?, max_score=?, is_active=? WHERE id=?', [metric_name, max_score, is_active ?? 1, req.params.id]);
    const row = await query('SELECT * FROM kpi_metrics WHERE id = ?', [req.params.id]);
    res.json({ metric: row[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/admin/metrics/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query('DELETE FROM kpi_metrics WHERE id = ?', [req.params.id]);
    res.json({ message: 'Metric deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════
// ADMIN – USER MANAGEMENT
// ══════════════════════════════════════════════

// FIX: SELECT now includes u.team_id so the frontend receives it correctly
app.get('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await query(`
      SELECT u.id, u.name, u.email, u.role,
             COALESCE(u.status, 'Active') AS status,
             u.team_id,
             u.created_at,
             t.name AS team_name
      FROM users u
      LEFT JOIN teams t ON t.id = u.team_id
      ORDER BY u.created_at DESC
    `);
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/users', verifyToken, requireAdmin, async (req, res) => {
  const { name, email, password, role, team_id } = req.body;
  if (!name || !email || !password || !role) return res.status(400).json({ message: 'name, email, password and role are required.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const result = await query('INSERT INTO users (name,email,password,role,team_id,status) VALUES (?,?,?,?,?,?)', [name,email,hash,role,team_id??null,'Active']);
    const row = await query('SELECT id,name,email,role,status,team_id,created_at FROM users WHERE id=?', [result.insertId]);
    res.status(201).json({ user: row[0] });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists.' });
    res.status(500).json({ message: err.message });
  }
});

// IMPORTANT: /status route MUST stay before /:id to avoid Express swallowing it
app.patch('/api/admin/users/:id/status', verifyToken, requireAdmin, async (req, res) => {
  const { status } = req.body;
  if (!['Active','Inactive'].includes(status)) return res.status(400).json({ message: "status must be 'Active' or 'Inactive'" });
  if (Number(req.params.id) === req.user.id && status === 'Inactive') return res.status(400).json({ message: 'You cannot deactivate your own account.' });
  try {
    await query('UPDATE users SET status=? WHERE id=?', [status, req.params.id]);
    res.json({ message: `User ${status === 'Active' ? 'activated' : 'deactivated'}.` });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.patch('/api/admin/users/:id', verifyToken, requireAdmin, async (req, res) => {
  const { name, email, role, team_id } = req.body;
  if (Number(req.params.id) === req.user.id && role && role.toLowerCase() !== 'admin') {
    return res.status(400).json({ message: 'You cannot change your own role.' });
  }
  try {
    await query('UPDATE users SET name=?, email=?, role=?, team_id=? WHERE id=?', [name, email, role, team_id ?? null, req.params.id]);
    res.json({ message: 'User updated.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'Email already exists.' });
    res.status(500).json({ message: err.message });
  }
});

app.delete('/api/admin/users/:id', verifyToken, requireAdmin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ message: 'You cannot delete your own account.' });
  try {
    await query('DELETE FROM users WHERE id=?', [req.params.id]);
    res.json({ message: 'User deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════
// ADMIN – TEAM MANAGEMENT
// ══════════════════════════════════════════════
app.get('/api/admin/teams', verifyToken, requireAdmin, async (req, res) => {
  try {
    const rows = await query(`
      SELECT t.id, t.name, COALESCE(t.status,'Active') AS status,
             u.id   AS lead_id,
             u.name AS lead_name,
             COUNT(m.id) AS member_count
      FROM teams t
      LEFT JOIN users u ON u.id = t.lead_id
      LEFT JOIN users m ON m.team_id = t.id
      GROUP BY t.id, t.name, t.status, u.id, u.name
      ORDER BY t.name ASC
    `);
    res.json({ teams: rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/admin/teams', verifyToken, requireAdmin, async (req, res) => {
  const { name, lead_id } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  try {
    const result = await query('INSERT INTO teams (name, lead_id) VALUES (?, ?)', [name.trim(), lead_id ?? null]);
    if (lead_id) await query('UPDATE users SET team_id=? WHERE id=?', [result.insertId, lead_id]);
    res.status(201).json({ message: 'Team created.', id: result.insertId });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put('/api/admin/teams/:id', verifyToken, requireAdmin, async (req, res) => {
  const { name, lead_id } = req.body;
  const teamId = req.params.id;
  try {
    await query('UPDATE teams SET name=?, lead_id=? WHERE id=?', [name, lead_id ?? null, teamId]);
    if (lead_id) await query('UPDATE users SET team_id=? WHERE id=?', [teamId, lead_id]);
    res.json({ message: 'Team updated.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.patch('/api/admin/teams/:id/status', verifyToken, requireAdmin, async (req, res) => {
  const { status } = req.body;
  const teamId = req.params.id;
  if (!['Active', 'Inactive'].includes(status))
    return res.status(400).json({ message: "status must be 'Active' or 'Inactive'" });
  try {
    // 1. Update team status
    await query('UPDATE teams SET status = ? WHERE id = ?', [status, teamId]);
    // 2. Cascade: set every user who belongs to this team to the same status
    await query('UPDATE users SET status = ? WHERE team_id = ?', [status, teamId]);
    const affected = await query('SELECT ROW_COUNT() AS cnt');
    res.json({
      message: `Team ${status === 'Active' ? 'activated' : 'deactivated'}. All team members updated.`,
      membersUpdated: affected[0]?.cnt ?? 0,
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete('/api/admin/teams/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    await query('UPDATE users SET team_id=NULL WHERE team_id=?', [req.params.id]);
    await query('DELETE FROM teams WHERE id=?', [req.params.id]);
    res.json({ message: 'Team deleted.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ══════════════════════════════════════════════
// ADMIN – STATS
// ══════════════════════════════════════════════
app.get('/api/admin/stats', verifyToken, requireAdmin, async (req, res) => {
  try {
    const [[members],[leads],[managers],[admins],[teams],[metrics]] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='Team Member'`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='Team Lead'`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='Manager'`),
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role='Admin'`),
      query(`SELECT COUNT(*) AS cnt FROM teams`),
      query(`SELECT COUNT(*) AS cnt FROM kpi_metrics WHERE is_active=1`),
    ]);
    res.json({ totalMembers:members.cnt, totalLeads:leads.cnt, totalManagers:managers.cnt, totalAdmins:admins.cnt, totalTeams:teams.cnt, activeMetrics:metrics.cnt });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
