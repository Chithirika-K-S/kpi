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
           CASE
             WHEN k.final_score IS NOT NULL AND k.final_score > 0 THEN 'finalized'
             WHEN k.communication IS NOT NULL                       THEN 'draft'
             ELSE 'pending'
           END AS kpi_status
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
      { id: 1, name: "Communication",     max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.communication ?? null, tl_comments: null },
      { id: 2, name: "Teamwork",          max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.teamwork      ?? null, tl_comments: null },
      { id: 3, name: "Discipline",        max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.discipline    ?? null, tl_comments: null },
      { id: 4, name: "Initiative",        max_score: 5, weight_percent: 25, system_raw_score: null, system_normalized: 0, tl_raw_score: kpi?.initiative    ?? null, tl_comments: null },
    ];

    const finalKpi = kpi
      ? {
          status:       kpi.final_score > 0 ? "finalized" : "draft",
          tl_remarks:   null,
          finalized_at: kpi.updated_at,
          auto_score:   kpi.auto_score,
          final_score:  kpi.final_score,
        }
      : null;

    res.json({ member, criteria, finalKpi });
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
      // Insert new KPI row
      await query(
        "INSERT INTO kpis (user_id, auto_score, communication, teamwork, discipline, initiative) VALUES (?, 0, ?, ?, ?, ?)",
        [
          employeeId,
          updates["communication"] ?? 0,
          updates["teamwork"]      ?? 0,
          updates["discipline"]    ?? 0,
          updates["initiative"]    ?? 0,
        ]
      );
    } else {
      // Update existing
      const setClauses = Object.keys(updates).map((col) => `${col} = ?`).join(", ");
      const values = [...Object.values(updates), employeeId];
      await query(`UPDATE kpis SET ${setClauses} WHERE user_id = ?`, values);
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
    const rows = await query("SELECT * FROM kpis WHERE user_id = ?", [employeeId]);
    if (rows.length === 0) {
      return res.status(400).json({ message: "No KPI found for this employee." });
    }

    const kpi = rows[0];
    const autoScore = kpi.auto_score ?? 0;
    const leadScore =
      (kpi.communication ?? 0) +
      (kpi.teamwork      ?? 0) +
      (kpi.discipline    ?? 0) +
      (kpi.initiative    ?? 0);
    const finalScore = autoScore + leadScore;

    await query(
      "UPDATE kpis SET final_score = ?, updated_at = NOW() WHERE user_id = ?",
      [finalScore, employeeId]
    );

    res.json({ message: "KPI finalized.", finalScore });
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
// START SERVER
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
