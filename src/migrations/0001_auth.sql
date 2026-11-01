CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free'
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expiresAt TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  ipAddress TEXT,
  userAgent TEXT,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  activeOrganizationId TEXT
);

CREATE INDEX IF NOT EXISTS session_userId ON session (userId);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  accountId TEXT NOT NULL,
  providerId TEXT NOT NULL,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  accessToken TEXT,
  refreshToken TEXT,
  idToken TEXT,
  accessTokenExpiresAt TEXT,
  refreshTokenExpiresAt TEXT,
  scope TEXT,
  password TEXT,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS account_userId ON account (userId);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS verification_identifier ON verification (identifier);

CREATE TABLE IF NOT EXISTS organization (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo TEXT,
  createdAt TEXT NOT NULL,
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS member (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  createdAt TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS member_organizationId ON member (organizationId);
CREATE INDEX IF NOT EXISTS member_userId ON member (userId);

CREATE TABLE IF NOT EXISTS invitation (
  id TEXT PRIMARY KEY,
  organizationId TEXT NOT NULL REFERENCES organization (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT,
  status TEXT NOT NULL,
  expiresAt TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  inviterId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS invitation_organizationId ON invitation (organizationId);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  title TEXT,
  mode TEXT NOT NULL,
  tier TEXT NOT NULL,
  closed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS plans_user ON plans (user_id);
