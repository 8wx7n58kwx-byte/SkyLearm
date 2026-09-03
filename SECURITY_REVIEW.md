# Security Review Results — edtech-prototype

Reviewed project: `/home/user/workspace/edtech-prototype`
Context: RBAC prototype for an education platform (Admin/Instructor/Student), FastAPI + SQLite backend, stdlib-only PBKDF2 password hashing and custom HMAC-signed session tokens (no JWT library), vanilla JS/HTML/CSS frontend, no LLM API calls, no external connectors, Python-only. Intended as an internal demo/prototype to be published to a permanent `pplx.app` URL for stakeholder testing.

## Security Review Results

### BLOCK (must fix before publishing)

- **Hardcoded fallback HMAC signing secret (`"dev-only-secret-change-me"`) for session tokens** — `api_server.py:25` (original code). The publish pipeline for this Python-only project has no mechanism to inject a custom `SECRET_KEY` env var (the `.env`-injection mechanism referenced in the publishing guide is Supabase-specific and does not apply here), so the app would have run in production signing every session token with this well-known, publicly-visible string. Anyone could compute `hmac.new(b"dev-only-secret-change-me", body, sha256)` and forge a valid session token for **any user ID and any role, including admin** — a full authentication/authorization bypass on a publicly reachable RBAC demo.
  **Fixed**: replaced the hardcoded fallback with `_load_or_create_secret_key()`, which uses `SECRET_KEY` from the environment if set, otherwise generates a random 32-byte key with `secrets.token_bytes(32)` on first run and persists it to a local `.session_secret` file (added to `.gitignore`) so tokens stay valid across restarts of the same deployment, while every fresh deploy gets an unguessable key. Verified the app still starts, issues tokens, and validates them correctly after the fix.

### WARN (inform user, let them decide)

- **Open CORS (`allow_origins=["*"]`) on an API with mutation endpoints** — `api_server.py:52` (`app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])`). The API exposes POST/PATCH/DELETE endpoints (create/delete users, whitelist/revoke course enrollments) with no origin restriction. Exploitability is reduced because auth is via a `Bearer` header token kept only in JS memory (not a cookie), so classic cross-site CSRF via an auto-sent cookie doesn't apply — a third-party site cannot silently ride an authenticated session. However, wildcard CORS still means any origin's script can read API responses if it independently obtains a token, and provides no defense-in-depth if a token is ever leaked (e.g. via XSS elsewhere or a browser extension). **Suggested fix (optional, not required for a stakeholder-demo prototype)**: restrict `allow_origins` to the specific `pplx.app` origin the frontend is served from once that URL is known, instead of `*`.

- **Weak, publicly-visible seed/demo credentials** — `api_server.py` seed data (`admin@edtech.local` / `admin123`, `instructor@edtech.local` / `instructor123`, `student@edtech.local` / `student123`). These are intentional demo accounts (per the provided context, this is a stakeholder-testing prototype), and passwords are correctly stored as salted PBKDF2 hashes in `data.db`, not in plaintext. Since the URL will be a permanent, publicly reachable `pplx.app` link, anyone who finds it can log in as admin with these well-known credentials and modify all user/course/enrollment data. **Suggested fix**: rotate these to non-guessable passwords before/at publish time, or accept the risk explicitly since this is a non-production internal demo with no real user data.

### PASS

- **Dependency audit** — `pip-audit` against `requirements.txt` (fastapi 0.141.1, uvicorn 0.52.4, pydantic 2.13.5, and their transitive dependencies) found no known vulnerabilities.
- **Hardcoded secrets/credentials grep** — No API keys, cloud credentials, private keys, or generic hardcoded password-literal patterns found in source files. No `.env` files present in the project.
- **`data.db` handling** — Correctly excluded via `.gitignore`; not tracked in git; passwords stored as salted PBKDF2-SHA256 hashes (200,000 iterations) rather than plaintext.
- **SQL injection** — All database queries use parameterized `?` placeholders for user-supplied values; the one f-string used in a query (`UPDATE users SET {...} WHERE id=?`) only interpolates a fixed, code-controlled list of column names, never user input.
- **XSS / dangerous JS sinks** — `app.js` uses `innerHTML` in three places, but all interpolated user/API-sourced values (`full_name`, `email`, `student_id`, course `title`/`description`/`course_url`) are passed through a proper HTML-entity-escaping helper (`esc()`) before insertion. No `eval`, `new Function`, or `document.write` usage found.
- **Python dangerous sinks** — No `exec(`, `eval(`, `os.system(`, or `subprocess(..., shell=True)` usage found in `api_server.py`.
- **Auth enforcement on sensitive routes** — Every admin/instructor/student data endpoint is gated behind `Depends(require_role(...))`, which in turn depends on a valid, non-expired, HMAC-verified bearer token (`hmac.compare_digest`-based comparison, resistant to timing attacks) tied to an active user account. Instructors are further scoped to only their own courses (`_owned_course` ownership check).

## Fixes Applied

1. `api_server.py` — replaced hardcoded fallback session-signing secret with a securely generated, persisted-per-deployment random key (see BLOCK finding above).
2. `.gitignore` — added `.session_secret` so the generated key file is never committed.

## Remaining User Decisions

- Whether to tighten CORS to the specific published origin (optional for this internal-demo context).
- Whether to rotate the three seeded demo account passwords before sharing the public URL with stakeholders.
