import { prisma } from "./db";
import { AuthProvider } from "./auth-providers";
import { normalizeEmail } from "./email";

interface UpsertIdentityInput {
  provider: AuthProvider;
  providerUserId: string;
  email: string;
  picture?: string | null;
}

export const upsertUserIdentity = async ({
  provider,
  providerUserId,
  email,
  picture,
}: UpsertIdentityInput) => {
  const normalizedEmail = normalizeEmail(email);

  return prisma.$transaction(async tx => {
    const existingIdentity = await tx.userIdentity.findUnique({
      where: { provider_providerUserId: { provider, providerUserId } },
      include: { user: true },
    });

    if (existingIdentity) {
      const user = await tx.user.update({
        where: { id: existingIdentity.userId },
        data: {
          email: normalizedEmail,
          picture: picture ?? existingIdentity.user.picture,
        },
      });

      return { user, providerIdentity: existingIdentity };
    }

    let user = await tx.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      user = await tx.user.create({
        data: {
          email: normalizedEmail,
          picture: picture ?? null,
        },
      });
    } else if (picture && user.picture !== picture) {
      user = await tx.user.update({
        where: { id: user.id },
        data: { picture },
      });
    }

    const providerIdentity = await tx.userIdentity.create({
      data: {
        provider,
        providerUserId,
        userId: user.id,
      },
    });

    return { user, providerIdentity };
  });
};
