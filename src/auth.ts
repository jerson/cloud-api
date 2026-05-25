import { createHash, timingSafeEqual } from "crypto";
import { type NextFunction, type Request, type Response } from "express";
import { UnauthorizedError } from "./errors";
import { normalizeEmail } from "./email";
import { getSessionUser } from "./session";

const ALLOWED_IDENTITIES = process.env.ALLOWED_IDENTITIES?.split(",")
  .map(identity => identity.trim().toLowerCase())
  .filter(Boolean);

const getAllowedIdentities = () => {
  if (!ALLOWED_IDENTITIES) return null;
  return ALLOWED_IDENTITIES.length > 0 ? new Set(ALLOWED_IDENTITIES) : null;
};

export const isIdentityAllowed = (identity?: string | null) => {
  const allowedIdentities = getAllowedIdentities();
  const identityNormalized = identity ? normalizeEmail(identity) : undefined;
  if (!allowedIdentities) return true;
  if (!identityNormalized) return false;
  return allowedIdentities.has(identityNormalized);
};

export const authenticated = async (req: Request, res: Response, next: NextFunction) => {
  const sessionUser = getSessionUser(req);
  if (!isIdentityAllowed(sessionUser.email)) {
    throw new UnauthorizedError("Account is not in the allowlist", "account_not_allowed");
  }

  next();
};

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Guards a route with one static bearer token, compared in constant time. */
export const bearerToken = (expected: string) => {
  const expectedDigest = sha256(expected);
  return (req: Request, res: Response, next: NextFunction) => {
    // The scheme name is case-insensitive (RFC 9110); the token is not.
    const presented = req.headers.authorization?.match(/^Bearer +(.+)$/i)?.[1];
    if (!presented || !timingSafeEqual(sha256(presented), expectedDigest)) {
      throw new UnauthorizedError("Invalid bearer token");
    }
    next();
  };
};
