CREATE TABLE users (
  id CHAR(36) NOT NULL PRIMARY KEY,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(100) NULL,
  time_zone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  unit_preference ENUM('metric', 'imperial') NOT NULL DEFAULT 'metric',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE refresh_sessions (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_refresh_sessions_token_hash (token_hash),
  KEY idx_refresh_sessions_user_expiry (user_id, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE workouts (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  activity_type ENUM('walking', 'running', 'cycling', 'strength', 'yoga', 'other') NOT NULL,
  started_at_utc DATETIME NOT NULL,
  duration_seconds INT UNSIGNED NOT NULL,
  distance_meters INT UNSIGNED NULL,
  notes VARCHAR(1000) NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_workouts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_workouts_duration CHECK (duration_seconds > 0),
  KEY idx_workouts_user_started (user_id, started_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE step_entries (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  local_date DATE NOT NULL,
  time_zone VARCHAR(64) NOT NULL,
  source ENUM('manual', 'healthkit', 'health_connect') NOT NULL,
  steps INT UNSIGNED NOT NULL,
  external_id VARCHAR(191) NULL,
  idempotency_key VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_step_entries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_step_entries_steps CHECK (steps >= 0),
  UNIQUE KEY uq_step_entries_source_record (user_id, source, local_date, external_id),
  UNIQUE KEY uq_step_entries_idempotency (user_id, idempotency_key),
  KEY idx_step_entries_user_date (user_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE goals (
  id CHAR(36) NOT NULL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  goal_type ENUM('daily_steps', 'weekly_workouts', 'weekly_workout_minutes') NOT NULL,
  target_value INT UNSIGNED NOT NULL,
  period ENUM('day', 'week') NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_goals_target CHECK (target_value > 0),
  CONSTRAINT chk_goals_date_range CHECK (ends_on IS NULL OR ends_on >= starts_on),
  KEY idx_goals_user_active_type (user_id, is_active, goal_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
