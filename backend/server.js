import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import mysql from "mysql2";

dotenv.config();

const app = express();
app.use(cors());
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

// Promisified query helper
function query(sql, params) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, results) => {
      if (err) reject(err);
      else resolve(results);
    });
  });
}

// ─────────────────────────────────────────────
// AUTO-MIGRATION: add missing columns if needed
// ─────────────────────────────────────────────
async function runMigrations() {
  try {
    // ── Migration 1: add status column ──────────────────────────
    const statusCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpis' AND COLUMN_NAME = 'status'`
    );
    if (statusCol.length === 0) {
      console.log("[migration] Adding status column to kpis table...");
      await query(`ALTER TABLE kpis ADD COLUMN status ENUM('pending','draft','finalized') NOT NULL DEFAULT 'pending'`);
      console.log("[migration] status column added.");
    }

    // ── Migration 2: add finalized_at timestamp column ──────────
    const finalizedAtCol = await query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'kpis' AND COLUMN_NAME = 'finalized_at'`
    );
    if (finalizedAtCol.length === 0) {
      console.log("[migration] Adding finalized_at column to kpis table...");
      await query(`ALTER TABLE kpis ADD COLUMN finalized_at TIMESTAMP NULL DEFAULT NULL`);
      console.log("[migration] finalized_at column added.");
    }

    // NOTE: No automatic status backfill runs here.
    // Status is set explicitly by the application:
    //   'draft'     → when TL saves scores via POST /api/team/evaluation
    //   'finalized' → when TL clicks Finalize via POST /api/team/finalize-kpi
    //   'pending'   → default for new rows, or rows with no criteria entered

    // ── Migration 3 (removed) ──────────────────────────────────────
    // The old blanket reset that wiped status for rows with finalized_at IS NULL
    // was destructive: Manager-assigned KPIs never got finalized_at set, so they
    // were reset to 'pending' on every restart. Removed — status is now managed
    // explicitly by each write path and is never reset automatically.

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
  if (!authHeader) {
    return res.status(401).json({ message: "Access denied. No token provided." });
  }
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
  res.json({ status: "ok" });
});

// ─────────────────────────────────────────────
// AUTH
// ─────────────────────────────────────────────

// Login – no role in body; backend reads role from DB and returns it
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

// /me – returns full user from DB (used by auth guards on every dashboard)
app.get("/api/auth/me", verifyToken, (req, res) => {
  const sql = "SELECT id, name, email, role FROM users WHERE id = ?";
  pool.query(sql, [req.user.id], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (results.length === 0) return res.status(404).json({ message: "User not found" });
    res.json({ user: results[0] });
  });
});

// ─────────────────────────────────────────────
// TEAM – list
// ─────────────────────────────────────────────

// GET /api/team/members  – Team Lead: list all members in their team
app.get("/api/team/members", verifyToken, (req, res) => {
  if (req.user.role !== "Team Lead") {
    return res.status(403).json({ message: "Access denied. Team Lead only." });
  }

  const tlId = req.user.id;

  // Join users → teams on team_id, return members whose team is led by this TL
  const sql = `
    SELECT u.id, u.name, u.email, u.role, u.team_id,
           k.auto_score   AS system_score,
           k.final_score,
           k.communication, k.teamwork, k.discipline, k.initiative,
           (k.communication + k.teamwork + k.discipline + k.initiative) AS tl_score,
           COALESCE(k.status, 'pending') AS kpi_status
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
// TEAM – single member detail (for EvalModal)
// ─────────────────────────────────────────────

// GET /api/team/:tlId/members/:empId
app.get("/api/team/:tlId/members/:empId", verifyToken, async (req, res) => {
  const { tlId, empId } = req.params;

  try {
    // Verify member belongs to this TL's team
    const members = await query(
      `SELECT u.* FROM users u
       INNER JOIN teams t ON u.team_id = t.id
       WHERE u.id = ? AND t.lead_id = ?`,
      [empId, tlId]
    );
    if (members.length === 0) {
      return res.status(404).json({ message: "Member not found in your team." });
    }
    const member = members[0];

    // Get KPI row
    const kpiRows = await query("SELECT * FROM kpis WHERE user_id = ?", [empId]);
    const kpi = kpiRows[0] || null;

    // Build criteria array from the existing hardcoded columns
    // (Phase 4 will replace this with dynamic kpi_metrics table)
    const criteria = [
      { id: 1, name: "Communication", max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.communication ?? null, tl_comments: null },
      { id: 2, name: "Teamwork",       max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.teamwork      ?? null, tl_comments: null },
      { id: 3, name: "Discipline",     max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.discipline    ?? null, tl_comments: null },
      { id: 4, name: "Initiative",     max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.initiative    ?? null, tl_comments: null },
    ];

    // System score (auto_score) comes directly from the kpis row, out of 80
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
// TEAM – update member (inline edit)
// ─────────────────────────────────────────────

// PUT /api/team/:tlId/members/:empId
app.put("/api/team/:tlId/members/:empId", verifyToken, async (req, res) => {
  const { tlId, empId } = req.params;
  const { name, email } = req.body;

  try {
    // Verify ownership via team
    const members = await query(
      `SELECT u.id FROM users u
       INNER JOIN teams t ON u.team_id = t.id
       WHERE u.id = ? AND t.lead_id = ?`,
      [empId, tlId]
    );
    if (members.length === 0) {
      return res.status(404).json({ message: "Member not found in your team." });
    }

    await query("UPDATE users SET name = ?, email = ? WHERE id = ?", [name, email, empId]);
    res.json({ message: "Member updated successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// TEAM – submit TL evaluation (save draft)
// ─────────────────────────────────────────────

// POST /api/team/evaluation
app.post("/api/team/evaluation", verifyToken, async (req, res) => {
  if (req.user.role !== "Team Lead") {
    return res.status(403).json({ message: "Access denied. Team Lead only." });
  }

  const { employeeId, evaluations } = req.body;
  // evaluations: [{ criteriaId, score, comments }]
  // Map criteriaId → column name (matches existing kpis table)
  const colMap = { 1: "communication", 2: "teamwork", 3: "discipline", 4: "initiative" };

  try {
    // Check if KPI row exists
    const existing = await query("SELECT id FROM kpis WHERE user_id = ?", [employeeId]);

    const updates = {};
    for (const ev of evaluations) {
      const col = colMap[ev.criteriaId];
      if (col) updates[col] = ev.score;
    }

    if (existing.length === 0) {
      // Insert new KPI row with draft status
      await query(
        "INSERT INTO kpis (user_id, auto_score, communication, teamwork, discipline, initiative, status) VALUES (?, 0, ?, ?, ?, ?, 'draft')",
        [
          employeeId,
          updates["communication"] ?? 0,
          updates["teamwork"]      ?? 0,
          updates["discipline"]    ?? 0,
          updates["initiative"]    ?? 0,
        ]
      );
    } else {
      // Update existing — keep status as 'draft' unless already finalized
      const setClauses = Object.keys(updates).map((col) => `${col} = ?`).join(", ");
      const values = [...Object.values(updates), employeeId];
      await query(
        `UPDATE kpis SET ${setClauses}, status = CASE WHEN status = 'finalized' THEN 'finalized' ELSE 'draft' END WHERE user_id = ?`,
        values
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

// POST /api/team/finalize-kpi
app.post("/api/team/finalize-kpi", verifyToken, async (req, res) => {
  if (req.user.role !== "Team Lead") {
    return res.status(403).json({ message: "Access denied. Team Lead only." });
  }

  const { employeeId } = req.body;

  try {
    const rows = await query("SELECT id FROM kpis WHERE user_id = ?", [employeeId]);
    if (rows.length === 0) {
      return res.status(400).json({ message: "No KPI found for this employee." });
    }

    await query(
      "UPDATE kpis SET status = 'finalized', finalized_at = NOW(), updated_at = NOW() WHERE user_id = ?",
      [employeeId]
    );

    res.json({ message: "KPI finalized." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// NOTIFICATIONS
// ─────────────────────────────────────────────
app.get("/api/notifications/:tlId", verifyToken, (req, res) => {
  const sql = `
    SELECT *, 
           (is_read = 0) AS unread
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `;
  pool.query(sql, [req.params.tlId], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    const unreadCount = results.filter((n) => !n.is_read).length;
    res.json({ notifications: results, unreadCount });
  });
});

app.patch("/api/notifications/:id/read", verifyToken, (req, res) => {
  const sql = "UPDATE notifications SET is_read = 1 WHERE id = ?";
  pool.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "Marked as read" });
  });
});

app.patch("/api/notifications/:tlId/read-all", verifyToken, (req, res) => {
  const sql = "UPDATE notifications SET is_read = 1 WHERE user_id = ?";
  pool.query(sql, [req.params.tlId], (err) => {
    if (err) return res.status(500).json({ message: err.message });
    res.json({ message: "All notifications marked as read" });
  });
});

// ─────────────────────────────────────────────
// KPI  (Team Member – view own KPI)
// ─────────────────────────────────────────────
app.get("/api/kpi", verifyToken, (req, res) => {
  const userId = req.user.id;

  const sql = "SELECT * FROM kpis WHERE user_id = ? ORDER BY id DESC LIMIT 1";

  pool.query(sql, [userId], (err, results) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!results[0]) return res.json({ kpi: null });

    const row = results[0];
    const communication = row.communication ?? 0;
    const teamwork      = row.teamwork      ?? 0;
    const discipline    = row.discipline    ?? 0;
    const initiative    = row.initiative    ?? 0;
    const autoScore     = row.auto_score    ?? 0;
    const leadScore     = communication + teamwork + discipline + initiative;
    const finalScore    = row.final_score   ?? 0;

    res.json({
      kpi: {
        autoScore,
        leadScore,
        finalScore,
        leadMetrics: { communication, teamwork, discipline, initiative },
      },
    });
  });
});

// ─────────────────────────────────────────────
// MANAGER APIS
// ─────────────────────────────────────────────

// Middleware: Manager only
function requireManager(req, res, next) {
  if (req.user.role !== 'Manager') {
    return res.status(403).json({ message: 'Access denied. Manager only.' });
  }
  next();
}

// GET /api/manager/stats  – org-level summary cards
app.get('/api/manager/stats', verifyToken, requireManager, async (req, res) => {
  try {
    const [employees] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'Team Member'`),
    ]);
    const [teamLeads]  = await Promise.all([query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'Team Lead'`)]);
    const [teams]      = await Promise.all([query(`SELECT COUNT(*) AS cnt FROM teams`)]);
    const [avgRow]     = await Promise.all([query(`SELECT ROUND(AVG(final_score),1) AS avg_kpi FROM kpis WHERE final_score > 0`)]);
    const [pending]    = await Promise.all([query(`SELECT COUNT(*) AS cnt FROM users u LEFT JOIN kpis k ON k.user_id = u.id WHERE u.role='Team Member' AND (k.id IS NULL OR k.final_score = 0)`)]);

    res.json({
      totalEmployees : employees[0]?.cnt  ?? 0,
      totalTeamLeads : teamLeads[0]?.cnt  ?? 0,
      totalTeams     : teams[0]?.cnt      ?? 0,
      avgKpi         : avgRow[0]?.avg_kpi ?? 0,
      pendingKpis    : pending[0]?.cnt    ?? 0,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/manager/analytics/monthly
// ?teamId=all|1|2  →  org-wide avg OR single team from kpi_monthly_trends
app.get('/api/manager/analytics/monthly', verifyToken, requireManager, async (req, res) => {
  const { teamId } = req.query;

  try {
    let rows;

    if (!teamId || teamId === 'all') {
      // Org-wide: average both teams per month, fetch all 12 synthetic rows
      rows = await query(`
        SELECT
          DATE_FORMAT(kmt.month, '%b %Y')   AS month_label,
          DATE_FORMAT(kmt.month, '%Y-%m')   AS month_key,
          ROUND(AVG(kmt.avg_score), 1)      AS avg_score
        FROM kpi_monthly_trends kmt
        GROUP BY month_key, month_label
        ORDER BY month_key ASC
        LIMIT 12
      `);
    } else {
      // Single team — return its 12 rows ordered oldest → newest
      rows = await query(`
        SELECT
          DATE_FORMAT(month, '%b %Y')   AS month_label,
          DATE_FORMAT(month, '%Y-%m')   AS month_key,
          ROUND(avg_score, 1)           AS avg_score
        FROM kpi_monthly_trends
        WHERE team_id = ?
        ORDER BY month ASC
        LIMIT 12
      `, [teamId]);
    }

    res.json({ monthly: rows });
  } catch (err) {
    console.error('monthly trend error:', err);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/manager/analytics/teams  – per-team avg KPI
app.get('/api/manager/analytics/teams', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        t.id                         AS team_id,
        t.name                       AS team_name,
        ROUND(AVG(k.final_score), 1) AS avg_score,
        COUNT(u.id)                  AS member_count,
        SUM(CASE WHEN k.final_score > 0 THEN 1 ELSE 0 END) AS finalized
      FROM teams t
      LEFT JOIN users u ON u.team_id = t.id AND u.role = 'Team Member'
      LEFT JOIN kpis  k ON k.user_id = u.id
      GROUP BY t.id, t.name
      ORDER BY avg_score DESC
    `);
    res.json({ teams: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/manager/employees  – all team members with KPI
app.get('/api/manager/employees', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        u.id, u.name, u.email, u.role, u.team_id,
        t.name                       AS team_name,
        tl.name                      AS team_lead_name,
        COALESCE(k.auto_score, 0)    AS auto_score,
        COALESCE(k.final_score, 0)   AS final_score,
        COALESCE(k.communication, 0) AS communication,
        COALESCE(k.teamwork, 0)      AS teamwork,
        COALESCE(k.discipline, 0)    AS discipline,
        COALESCE(k.initiative, 0)    AS initiative,
        (COALESCE(k.communication,0) + COALESCE(k.teamwork,0)
          + COALESCE(k.discipline,0) + COALESCE(k.initiative,0)) AS lead_score,
        CASE
          WHEN k.id IS NULL THEN 'Pending'
          WHEN k.status = 'finalized' THEN 'Finalized'
          WHEN k.status = 'draft'     THEN 'Draft'
          ELSE 'Pending'
        END AS kpi_status
      FROM users u
      LEFT JOIN teams t   ON t.id = u.team_id
      LEFT JOIN users tl  ON tl.id = t.lead_id
      LEFT JOIN kpis  k   ON k.user_id = u.id
      WHERE u.role = 'Team Member'
      ORDER BY u.name ASC
    `);
    res.json({ employees: rows });
  } catch (err) {
    console.error('manager/employees error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// GET /api/manager/teamleads  – all team leads with their team info
app.get('/api/manager/teamleads', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT
        u.id, u.name, u.email,
        t.id                         AS team_id,
        t.name                       AS team_name,
        COUNT(m.id)                  AS member_count,
        COALESCE(k.auto_score, 0)    AS auto_score,
        COALESCE(k.final_score, 0)   AS final_score,
        COALESCE(k.communication, 0) AS communication,
        COALESCE(k.teamwork, 0)      AS teamwork,
        COALESCE(k.discipline, 0)    AS discipline,
        COALESCE(k.initiative, 0)    AS initiative,
        (COALESCE(k.communication,0) + COALESCE(k.teamwork,0)
          + COALESCE(k.discipline,0) + COALESCE(k.initiative,0)) AS lead_score,
        CASE
          WHEN k.id IS NULL THEN 'Pending'
          WHEN k.status = 'finalized' THEN 'Finalized'
          WHEN k.status = 'draft'     THEN 'Draft'
          ELSE 'Pending'
        END AS kpi_status
      FROM users u
      LEFT JOIN teams t   ON t.lead_id = u.id
      LEFT JOIN users m   ON m.team_id = t.id AND m.role = 'Team Member'
      LEFT JOIN kpis  k   ON k.user_id = u.id
      WHERE u.role = 'Team Lead'
      GROUP BY u.id, u.name, u.email, t.id, t.name,
               k.id, k.auto_score, k.final_score, k.communication,
               k.teamwork, k.discipline, k.initiative, k.status
      ORDER BY u.name ASC
    `);
    res.json({ teamLeads: rows });
  } catch (err) {
    console.error('manager/teamleads error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/manager/kpi/assign  – assign / draft / finalize KPI scores for any user
// saveDraft=true  → status = 'draft'
// saveDraft=false → status = 'finalized'
app.post('/api/manager/kpi/assign', verifyToken, requireManager, async (req, res) => {
  const { userId, autoScore, communication, teamwork, discipline, initiative, saveDraft } = req.body;
  if (!userId) return res.status(400).json({ message: 'userId is required' });

  const comm  = Number(communication ?? 0);
  const team  = Number(teamwork      ?? 0);
  const disc  = Number(discipline    ?? 0);
  const init  = Number(initiative    ?? 0);
  const auto  = Number(autoScore     ?? 0);
  const final = Math.min(auto + comm + team + disc + init, 100);

  // Determine status and whether to set finalized_at
  const newStatus    = saveDraft ? 'draft' : 'finalized';
  const finalizedAt  = saveDraft ? null : new Date();

  try {
    const existing = await query('SELECT id FROM kpis WHERE user_id = ?', [userId]);
    if (existing.length === 0) {
      // New KPI row — never include final_score in INSERT if it is a generated column.
      // We insert the component columns; MySQL computes final_score automatically.
      // If final_score is NOT generated in this DB, we also set it explicitly.
      if (saveDraft) {
        await query(
          `INSERT INTO kpis
             (user_id, auto_score, communication, teamwork, discipline, initiative, status)
           VALUES (?, ?, ?, ?, ?, ?, 'draft')`,
          [userId, auto, comm, team, disc, init]
        );
      } else {
        await query(
          `INSERT INTO kpis
             (user_id, auto_score, communication, teamwork, discipline, initiative, status, finalized_at)
           VALUES (?, ?, ?, ?, ?, ?, 'finalized', NOW())`,
          [userId, auto, comm, team, disc, init]
        );
      }
    } else {
      // Update existing row — do NOT include final_score in SET (it is generated)
      if (saveDraft) {
        await query(
          `UPDATE kpis
           SET auto_score=?, communication=?, teamwork=?, discipline=?, initiative=?,
               status='draft', updated_at=NOW()
           WHERE user_id=?`,
          [auto, comm, team, disc, init, userId]
        );
      } else {
        await query(
          `UPDATE kpis
           SET auto_score=?, communication=?, teamwork=?, discipline=?, initiative=?,
               status='finalized', finalized_at=NOW(), updated_at=NOW()
           WHERE user_id=?`,
          [auto, comm, team, disc, init, userId]
        );
      }
    }
    res.json({ message: saveDraft ? 'KPI saved as draft.' : 'KPI finalized.', finalScore: final });
  } catch (err) {
    console.error('manager/kpi/assign error:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// POST /api/manager/teamlead/evaluate  – evaluate a team lead (manual scores)
// saveDraft=true  → status = 'draft'
// saveDraft=false → status = 'finalized'
app.post('/api/manager/teamlead/evaluate', verifyToken, requireManager, async (req, res) => {
  const { teamLeadId, communication, teamwork, discipline, initiative, saveDraft } = req.body;
  if (!teamLeadId) return res.status(400).json({ message: 'teamLeadId is required' });

  const comm  = Number(communication ?? 0);
  const team  = Number(teamwork      ?? 0);
  const disc  = Number(discipline    ?? 0);
  const init  = Number(initiative    ?? 0);

  try {
    // Fetch existing auto_score (if any) to preserve it
    const existing = await query('SELECT id, auto_score FROM kpis WHERE user_id=?', [teamLeadId]);
    const auto  = Number(existing[0]?.auto_score ?? 0);
    const final = Math.min(auto + comm + team + disc + init, 100);

    if (existing.length === 0) {
      if (saveDraft) {
        await query(
          `INSERT INTO kpis
             (user_id, auto_score, communication, teamwork, discipline, initiative, status)
           VALUES (?, 0, ?, ?, ?, ?, 'draft')`,
          [teamLeadId, comm, team, disc, init]
        );
      } else {
        await query(
          `INSERT INTO kpis
             (user_id, auto_score, communication, teamwork, discipline, initiative, status, finalized_at)
           VALUES (?, 0, ?, ?, ?, ?, 'finalized', NOW())`,
          [teamLeadId, comm, team, disc, init]
        );
      }
    } else {
      if (saveDraft) {
        await query(
          `UPDATE kpis
           SET communication=?, teamwork=?, discipline=?, initiative=?,
               status='draft', updated_at=NOW()
           WHERE user_id=?`,
          [comm, team, disc, init, teamLeadId]
        );
      } else {
        await query(
          `UPDATE kpis
           SET communication=?, teamwork=?, discipline=?, initiative=?,
               status='finalized', finalized_at=NOW(), updated_at=NOW()
           WHERE user_id=?`,
          [comm, team, disc, init, teamLeadId]
        );
      }
    }
    res.json({ message: saveDraft ? 'Team Lead KPI saved as draft.' : 'Team Lead evaluated.', finalScore: final });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/manager/teams  – list all teams (for filter dropdowns)
app.get('/api/manager/teams', verifyToken, requireManager, async (req, res) => {
  try {
    const rows = await query(`
      SELECT t.id, t.name AS team_name, u.name AS lead_name, COUNT(m.id) AS member_count
      FROM teams t
      LEFT JOIN users u ON u.id = t.lead_id
      LEFT JOIN users m ON m.team_id = t.id AND m.role = 'Team Member'
      GROUP BY t.id, t.name, u.name
      ORDER BY t.name ASC
    `);
    res.json({ teams: rows });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ─────────────────────────────────────────────
// AI CHAT  (Llama 3 via Groq)
// ─────────────────────────────────────────────

// POST /api/chat
app.post("/api/chat", verifyToken, async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message) return res.status(400).json({ message: "message is required" });

  const groqApiKey = process.env.GROQ_API_KEY;
  if (!groqApiKey || groqApiKey === "your_groq_api_key_here") {
    return res.status(500).json({ message: "Groq API key not configured. Set GROQ_API_KEY in backend/.env" });
  }

  // Fetch the current user's KPI so the assistant has context
  let kpiContext = "No KPI data available for this user yet.";
  try {
    const kpiRows = await query(
      "SELECT * FROM kpis WHERE user_id = ? ORDER BY id DESC LIMIT 1",
      [req.user.id]
    );
    if (kpiRows[0]) {
      const k = kpiRows[0];
      const leadScore =
        (k.communication ?? 0) + (k.teamwork ?? 0) +
        (k.discipline   ?? 0) + (k.initiative ?? 0);
      kpiContext =
        `User KPI data:\n` +
        `- Auto/System Score: ${k.auto_score ?? 0}/80\n` +
        `- Team Lead Score: ${leadScore}/20\n` +
        `  - Communication: ${k.communication ?? 0}/5\n` +
        `  - Teamwork: ${k.teamwork ?? 0}/5\n` +
        `  - Discipline: ${k.discipline ?? 0}/5\n` +
        `  - Initiative: ${k.initiative ?? 0}/5\n` +
        `- Final KPI Score: ${k.final_score ?? 0}/100`;
    }
  } catch (_) { /* non-fatal – proceed without KPI context */ }

  // Build messages for Groq (OpenAI-compatible format)
  const systemPrompt =
    `You are a helpful KPI assistant for a team performance tracking system called StackPulse. ` +
    `You help team members understand their KPI scores, identify areas for improvement, and plan their work. ` +
    `Be concise, supportive, and professional.\n\n${kpiContext}`;

  // Convert frontend history to Groq message format (drop any leading assistant messages)
  const groqMessages = [
    ...history
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message },
  ];

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqApiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",   // free Llama 3 8B on Groq
        messages: [
          { role: "system", content: systemPrompt },
          ...groqMessages,
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!groqRes.ok) {
      const errBody = await groqRes.text();
      console.error("Groq error:", errBody);
      return res.status(502).json({ message: "Groq API error: " + errBody });
    }

    const groqData = await groqRes.json();
    const reply = groqData.choices?.[0]?.message?.content ?? "Sorry, I could not generate a response.";
    res.json({ reply });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ message: "Failed to reach Groq API: " + err.message });
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
















































