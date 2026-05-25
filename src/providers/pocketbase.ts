import express from "express";
import { UnauthorizedError, BadRequestError } from "../errors";
import { isIdentityAllowed } from "../auth";
import { normalizeEmail } from "../email";
import { setSessionUser } from "../session";
import { upsertUserIdentity } from "../user-identities";
import { prisma } from "../db";
import { requireAuthProviderEnabled } from "../auth-providers";
import * as crypto from "crypto";

const APP_HOSTNAME = process.env.APP_HOSTNAME;

interface PocketBaseAuthResponse {
  token: string;
  record: {
    id: string;
    email?: string;
    verified?: boolean;
    avatar?: string;
  };
}

const authenticateWithPocketBase = async (email: string, password: string) => {
  const response = await fetch(
    `${process.env.POCKETBASE_URL}/api/collections/${process.env.POCKETBASE_AUTH_COLLECTION}/auth-with-password`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity: email, password }),
    },
  );

  if (!response.ok) {
    throw new UnauthorizedError("Invalid PocketBase credentials", "invalid_credentials");
  }

  return (await response.json()) as PocketBaseAuthResponse;
};

export const PocketBaseLogin = async (req: express.Request, res: express.Response) => {
  requireAuthProviderEnabled("pocketbase");
  const email = req.body.email?.toString();
  const password = req.body.password?.toString();
  const deviceId = req.body.deviceId?.toString();
  const returnTo = (req.body.returnTo?.toString() || `${APP_HOSTNAME}/devices`) as string;

  if (!email || !password) {
    throw new BadRequestError("Missing email or password", "missing_credentials");
  }

  const authResponse = await authenticateWithPocketBase(email, password);
  const userEmail = authResponse.record.email;
  if (!userEmail) {
    throw new BadRequestError("Missing email claim in PocketBase record", "missing_email_claim");
  }
  if (!authResponse.record.verified) {
    throw new UnauthorizedError("PocketBase email must be verified", "email_not_verified");
  }

  const normalizedEmail = normalizeEmail(userEmail);
  if (!isIdentityAllowed(normalizedEmail)) {
    throw new UnauthorizedError("Account is not in the allowlist", "account_not_allowed");
  }

  const { user } = await upsertUserIdentity({
    provider: "pocketbase",
    providerUserId: authResponse.record.id,
    email: normalizedEmail,
    picture: authResponse.record.avatar ?? null,
  });

  setSessionUser(req, {
    userId: user.id,
    provider: "pocketbase",
    providerUserId: authResponse.record.id,
    email: normalizedEmail,
    picture: authResponse.record.avatar ?? null,
    providerToken: authResponse.token,
  });

  if (deviceId) {
    const deviceAdopted = await prisma.device.findUnique({
      where: { id: deviceId },
      select: { userId: true },
    });

    const isAdoptedByCurrentUser = deviceAdopted?.userId === user.id;
    const isAdoptedByOther = deviceAdopted && !isAdoptedByCurrentUser;
    if (isAdoptedByOther) {
      return res.redirect(`${APP_HOSTNAME}/already-adopted`);
    }

    const tempToken = crypto.randomBytes(20).toString("hex");
    const tempTokenExpiresAt = new Date(new Date().getTime() + 5 * 60000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        device: {
          upsert: {
            create: { id: deviceId, tempToken, tempTokenExpiresAt },
            where: { id: deviceId },
            update: { tempToken, tempTokenExpiresAt },
          },
        },
      },
    });

    const url = new URL(returnTo);
    url.searchParams.append("tempToken", tempToken);
    url.searchParams.append("deviceId", deviceId);
    url.searchParams.append("cloudIdentity", normalizedEmail);
    return res.redirect(url.toString());
  }

  return res.redirect(returnTo);
};
