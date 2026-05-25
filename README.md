# Login App — Next.js + Node.js + MySQL

A production-ready login page with role-based authentication.

---

## Tech Stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Frontend  | Next.js 14 (App Router) + Tailwind CSS |
| Backend   | Node.js + Express                 |
| Database  | MySQL                             |
| Auth      | JWT + bcryptjs                    |

---

## Project Structure

```
login-app/
├── frontend/          # Next.js app
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # redirects → /login
│   │   ├── login/
│   │   │   └── page.tsx      # ← Login UI
│   │   └── globals.css
│   ├── tailwind.config.ts
│   ├── next.config.js
│   ├── package.json
│   └── .env.local.example
│
└── backend/
    ├── server.js             # Express API
    ├── db.js                 # MySQL pool
    ├── schema.sql            # Table definition + seed guide
    ├── package.json
    └── .env.example
```

---

## Setup

### 1. MySQL Database

```sql
-- In MySQL client:
source backend/schema.sql
```

Then seed a user (generate hash first):

```bash
node -e "require('bcryptjs').hash('yourpassword', 10).then(console.log)"
```

```sql
INSERT INTO users (email, password, role, name)
VALUES ('alice@company.com', '<bcrypt_hash>', 'Admin', 'Alice Johnson');
```

---

### 2. Backend

```bash
cd backend
cp .env.example .env        # Fill in DB credentials + JWT_SECRET
npm install
npm run dev                 # Runs on http://localhost:4000
```

---

### 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local   # Set NEXT_PUBLIC_API_URL if needed
npm install
npm run dev                         # Runs on http://localhost:3000
```

---

## API Reference

| Method | Endpoint          | Body                          | Response              |
|--------|-------------------|-------------------------------|----------------------|
| POST   | /api/auth/login   | `{ email, password, role }`   | `{ token, user }`    |
| GET    | /api/auth/me      | Bearer token in header        | `{ user }`           |
| GET    | /api/health       | —                             | `{ status: "ok" }`   |

---

## Roles

`Team Member` · `Team Lead` · `Manager` · `Admin`

The login form validates that the selected role matches the role stored in the DB row — wrong role = rejected even with correct credentials.

---

## Security Notes

- Passwords are stored as **bcrypt hashes** — never plain text.
- JWT secret must be a long random string in production.
- Use HTTPS in production; never expose `.env` files.
- Consider adding rate-limiting (`express-rate-limit`) before deploying.
