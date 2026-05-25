import express from "express";
import { UnauthorizedError } from "./errors";
import { AuthProvider } from "./auth-providers";
import { normalizeEmail } from "./email";

export interface SessionUser {
  userId: bigint;
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  picture?: string | null;
  providerToken?: string;
}

export const setSessionUser = (
  req: express.Request,
  sessionUser: Omit<SessionUser, "email"> & { email: string },
) => {
  req.session!.userId = sessionUser.userId.toString();
  req.session!.provider = sessionUser.provider;
  req.session!.providerUserId = sessionUser.providerUserId;
  req.session!.email = normalizeEmail(sessionUser.email);
  req.session!.picture = sessionUser.picture ?? null;
  req.session!.providerToken = sessionUser.providerToken ?? null;
};

export const clearSessionUser = (req: express.Request) => {
  req.session = null;
};

export const getSessionUser = (req: express.Request): SessionUser => {
  const userIdRaw = req.session?.userId;
  const provider = req.session?.provider as AuthProvider | undefined;
  const providerUserId = req.session?.providerUserId as string | undefined;
  const email = req.session?.email as string | undefined;

  if (!userIdRaw || !provider || !providerUserId || !email) {
    throw new UnauthorizedError();
  }

  return {
    userId: BigInt(userIdRaw),
    provider,
    providerUserId,
    email: normalizeEmail(email),
    picture: (req.session?.picture as string | null | undefined) ?? null,
    providerToken: (req.session?.providerToken as string | undefined) ?? undefined,
  };
};

export const getCloudIdentity = (req: express.Request) => getSessionUser(req).email;
