import { generators, Issuer } from "openid-client";
import express from "express";
import { BadRequestError, UnauthorizedError } from "../errors";
import { isIdentityAllowed } from "../auth";
import { normalizeEmail } from "../email";
import { setSessionUser } from "../session";
import { upsertUserIdentity } from "../user-identities";
import { prisma } from "../db";
import { requireAuthProviderEnabled } from "../auth-providers";
import * as crypto from "crypto";

const API_HOSTNAME = process.env.API_HOSTNAME;
const APP_HOSTNAME = process.env.APP_HOSTNAME;
const REDIRECT_URI = `${API_HOSTNAME}/oidc/callback`;

const getGoogleOIDCClient = async () => {
  const googleIssuer = await Issuer.discover("https://accounts.google.com");
  return new googleIssuer.Client({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uris: [REDIRECT_URI],
    response_types: ["code"],
  });
};

export const Google = async (req: express.Request, res: express.Response) => {
  requireAuthProviderEnabled("google");
  const state = new URLSearchParams();
  state.set("csrf", generators.state());
  req.session!.csrf = state.get("csrf");
  req.session!.deviceId = req.body.deviceId;
  req.session!.returnTo = req.body.returnTo;

  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  req.session!.code_verifier = codeVerifier;

  const client = await getGoogleOIDCClient();
  const authorizationUrl = client.authorizationUrl({
    scope: "openid email profile",
    state: state.toString(),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return res.redirect(authorizationUrl);
};

export const Callback = async (req: express.Request, res: express.Response) => {
  requireAuthProviderEnabled("google");
  const client = await getGoogleOIDCClient();
  const params = client.callbackParams(req);
  if (!params) {
    throw new BadRequestError("Missing callback parameters", "missing_callback_params");
  }

  const sessionCsrf = req.session?.csrf;
  if (!sessionCsrf) {
    throw new BadRequestError("Missing CSRF in session", "missing_csrf");
  }

  const thisRequestCsrf = new URLSearchParams(params.state).get("csrf");
  if (thisRequestCsrf !== sessionCsrf) {
    throw new BadRequestError("Invalid CSRF", "invalid_csrf");
  }

  const deviceId = req.session?.deviceId as string | undefined;
  const returnTo = (req.session?.returnTo ?? `${APP_HOSTNAME}/devices`) as string;

  req.session!.csrf = null;
  req.session!.returnTo = null;
  req.session!.deviceId = null;

  const tokenSet = await client.callback(REDIRECT_URI, params, {
    state: req.query.state?.toString(),
    code_verifier: req.session?.code_verifier,
  });

  const userInfo = await client.userinfo(tokenSet);
  const tokenClaims = tokenSet.claims();
  if (!tokenClaims) throw new BadRequestError("Missing claims in token", "missing_claims");
  if (!tokenSet.id_token) throw new BadRequestError("Missing ID Token", "missing_id_token");
  if (!userInfo.email) throw new BadRequestError("Missing email claim in user info", "missing_email_claim");

  const normalizedEmail = normalizeEmail(userInfo.email);
  if (!isIdentityAllowed(normalizedEmail)) {
    req.session = null;
    throw new UnauthorizedError("Account is not in the allowlist", "account_not_allowed");
  }

  const { user } = await upsertUserIdentity({
    provider: "google",
    providerUserId: tokenClaims.sub,
    email: normalizedEmail,
    picture: userInfo.picture,
  });

  setSessionUser(req, {
    userId: user.id,
    provider: "google",
    providerUserId: tokenClaims.sub,
    email: normalizedEmail,
    picture: userInfo.picture,
    providerToken: tokenSet.id_token,
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
    url.searchParams.append("oidcGoogle", tokenSet.id_token.toString());
    url.searchParams.append("clientId", process.env.GOOGLE_CLIENT_ID!);
    return res.redirect(url.toString());
  }

  return res.redirect(returnTo);
};
