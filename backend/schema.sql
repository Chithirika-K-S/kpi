-- ─────────────────────────────────────────────────────────────
--  Run this script once to set up your users table in MySQL
-- ─────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS your_database;
USE your_database;

CREATE TABLE IF NOT EXISTS users (
  id         INT          NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255) NOT NULL UNIQUE,
  
  password   VARCHAR(255) NOT NULL,   -- store bcrypt hashes, NOT plain text
  role       ENUM('Team Member', 'Team Lead', 'Manager', 'Admin') NOT NULL DEFAULT 'Team Member',
  name       VARCHAR(255),
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS kpis (
  id            INT NOT NULL AUTO_INCREMENT,
  user_id       INT NOT NULL,
  auto_score    DECIMAL(5,2) NOT NULL DEFAULT 0,   -- out of 80
  lead_score    DECIMAL(5,2) NOT NULL DEFAULT 0,   -- out of 20
  final_score   DECIMAL(5,2) NOT NULL DEFAULT 0,   -- out of 100
  communication TINYINT      NOT NULL DEFAULT 0,   -- out of 5
  teamwork      TINYINT      NOT NULL DEFAULT 0,   -- out of 5
  discipline    TINYINT      NOT NULL DEFAULT 0,   -- out of 5
  initiative    TINYINT      NOT NULL DEFAULT 0,   -- out of 5
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────────────────────────
--  Sample seed rows  (passwords are bcrypt of the shown string)
--  Generate your own: node -e "require('bcryptjs').hash('pass',10).then(console.log)"
-- ─────────────────────────────────────────────────────────────
-- INSERT INTO users (email, password, role, name) VALUES
--   ('alice@company.com', '<bcrypt_hash>', 'Admin',       'Alice Johnson'),
--   ('bob@company.com',   '<bcrypt_hash>', 'Manager',     'Bob Martinez'),
--   ('carol@company.com', '<bcrypt_hash>', 'Team Lead',   'Carol Lee'),
--   ('dave@company.com',  '<bcrypt_hash>', 'Team Member', 'Dave Kim');
