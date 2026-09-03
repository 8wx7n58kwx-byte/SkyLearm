# Security remediation checklist

This branch documents the security fixes required before public deployment.

## Do before deployment

1. Remove `data.db` and `Sky Learn.zip` from Git and purge sensitive historical commits if the database contained real users.
2. Set `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` in the deployment environment; do not use demo credentials.
3. Set `ALLOWED_ORIGINS` to the exact HTTPS frontend origin; never use `*` for a production API with authenticated write endpoints.
4. Set a random `SECRET_KEY` in the deployment secret manager.
5. Restrict uploads to authorized roles and an allow-list of required MIME types; validate file signatures and stream uploads with a total-size limit.
6. Add login rate limiting and audit logging at the reverse proxy or application layer.
7. Use a persistent managed database for production instead of a repository-tracked SQLite file.

## Important limitation

This commit intentionally does not modify `api_server.py`. The backend is a large source file and safely changing authentication, CORS, seed behavior, and upload authorization requires a complete reviewed replacement. Do not treat this documentation-only commit as a completed security remediation.
