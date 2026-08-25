import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, type: 'access' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export function signRefreshToken(user, jti) {
  return jwt.sign({ sub: user.id, jti, type: 'refresh' }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret);
}

/** Convert '30d' / '12h' style strings into milliseconds. */
export function durationToMs(d) {
  const m = /^(\d+)\s*([smhd])$/i.exec(String(d).trim());
  if (!m) return 30 * 24 * 3600 * 1000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mult = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return n * mult;
}
