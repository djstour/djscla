/**
 * POST /api/admin/login — verifies an admin password without minting any
 * token. The client stores the password in localStorage (and sessionStorage)
 * and sends it back on every request as `Authorization: Bearer <password>`.
 * localStorage is shared across tabs so translation preview links work. This lets us
 * rotate access by changing one env var with zero DB writes.
 */

const { getAdminSecret, applyAdminCors } = require('../../lib/adminAuth');
const crypto = require('crypto');

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

module.exports = async function handler(req, res) {
  applyAdminCors(res);

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = getAdminSecret();
  if (!secret) {
    return res.status(503).json({
      error: 'Admin disabled',
      code: 'ADMIN_NOT_CONFIGURED',
      hint: 'Set ADMIN_PASSWORD in environment to enable the admin console.',
    });
  }

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {
    body = {};
  }

  const provided = String(body.password || '').trim();
  if (!provided) {
    return res.status(400).json({ error: 'Missing password', code: 'PASSWORD_REQUIRED' });
  }

  if (!safeEqual(provided, secret)) {
    return res.status(401).json({ error: 'Invalid password', code: 'ADMIN_UNAUTHORIZED' });
  }

  return res.status(200).json({ ok: true });
};
