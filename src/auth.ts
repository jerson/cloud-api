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
