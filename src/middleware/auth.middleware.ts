// JWT verification middleware
import jwt from 'jsonwebtoken';

interface JWTPayload {
  userId: string;
  role:   string;
  email:  string;
}

export function verifyJWT(authHeader: string): JWTPayload | null {
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
  } catch {
    return null;
  }
}
