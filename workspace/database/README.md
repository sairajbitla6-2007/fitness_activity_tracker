# Local database setup

Create a local database and a dedicated development account. Run the following as a MySQL administrator, then put the matching local values in `workspace/.env`:

```sql
CREATE DATABASE fitness_tracker
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

CREATE USER 'fitness_app'@'127.0.0.1' IDENTIFIED BY 'replace-with-a-local-password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES
  ON fitness_tracker.* TO 'fitness_app'@'127.0.0.1';
```

The migration runner creates the `schema_migrations` table and applies SQL files in filename order. MySQL DDL can implicitly commit; each migration is therefore recorded only after all of its statements finish. If a migration fails partway through, inspect the local schema before retrying it.

Do not use these local credentials in a deployed environment. Production credentials belong in a secret manager and should have only the privileges needed by the deployed application and migration process.
