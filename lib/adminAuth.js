/**
 * Admin auth — Phase 1 (read-only).
 *
 * Shared-secret model for the internal control room:
 *   ADMIN_PASSWORD env var → users send `Authorization: Bearer <password>`.
 *
 * Constant-time compare avoids timing leaks when the value is short. We do
 * not mint tokens because the surface area is tiny (1–2 operators) and we
 * want rotation to be a single env update with no DB migration.
 */

const crypto = require('crypto');

function getAdminSecret() {
  return (process.env.ADMIN_PASSWORD || '').trim();
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ab.length !== bb.length) return false;
  try {
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function readBearer(req) {
  const header = (req.headers && req.headers.authorization) || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/**
 * Throws a 401-shaped error when the request lacks a valid admin secret.
 * Returns true on success so callers can `if (!requireAdmin(req, res)) return;`.
 */
function requireAdmin(req, res) {
  const secret = getAdminSecret();
  if (!secret) {
    res.status(503).json({
      error: 'Admin disabled',
      code: 'ADMIN_NOT_CONFIGURED',
      hint: 'Set ADMIN_PASSWORD in environment to enable the admin console.',
    });
    return false;
  }
  const provided = readBearer(req);
  if (!provided || !safeEqual(provided, secret)) {
    res.status(401).json({ error: 'Unauthorized', code: 'ADMIN_UNAUTHORIZED' });
    return false;
  }
  return true;
}

function applyAdminCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

module.exports = {
  getAdminSecret,
  requireAdmin,
  readBearer,
  applyAdminCors,
};
