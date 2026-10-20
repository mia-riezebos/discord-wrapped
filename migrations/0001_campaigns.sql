-- One row per sponsored ad. Add rows from the Cloudflare dashboard (D1 → discord-wrapped → Console);
-- the site shows each campaign only between starts_at and ends_at, so nothing needs deploying.
CREATE TABLE campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sponsor TEXT NOT NULL,                          -- GitHub login of the sponsor
  tier TEXT NOT NULL CHECK (tier IN ('square', 'tower', 'twin')),
  placement TEXT NOT NULL DEFAULT 'right' CHECK (placement IN ('left', 'right')), -- ignored for 'twin', which uses both rails
  image_url TEXT NOT NULL CHECK (image_url LIKE 'https://%'),
  link_url TEXT NOT NULL CHECK (link_url LIKE 'https://%'),
  alt TEXT NOT NULL,                              -- describes the image for screen readers
  starts_at TEXT NOT NULL,                        -- UTC, e.g. 2026-11-01 00:00:00
  ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (datetime(starts_at) IS NOT NULL AND datetime(ends_at) > datetime(starts_at))
);
CREATE INDEX campaigns_window ON campaigns (starts_at, ends_at);
