const SUPPORTED_AUTH_PROVIDERS = ["google", "pocketbase"] as const;

export type AuthProvider = (typeof SUPPORTED_AUTH_PROVIDERS)[number];

const supportedProviders = new Set<AuthProvider>(SUPPORTED_AUTH_PROVIDERS);

export const parseAuthProviders = (rawProviders?: string) => {
  const providers = (rawProviders || "google")
    .split(",")
    .map(provider => provider.trim().toLowerCase())
    .filter(Boolean);

  if (providers.length === 0) {
    throw new Error("AUTH_PROVIDERS must enable at least one provider");
  }

  for (const provider of providers) {
    if (!supportedProviders.has(provider as AuthProvider)) {
      throw new Error(`Unsupported auth provider: ${provider}`);
    }
  }

  return [...new Set(providers as AuthProvider[])];
};

export const AUTH_PROVIDERS = parseAuthProviders(process.env.AUTH_PROVIDERS);

export const isAuthProviderEnabled = (provider: AuthProvider) => AUTH_PROVIDERS.includes(provider);

export const requireAuthProviderEnabled = (provider: AuthProvider) => {
  if (!isAuthProviderEnabled(provider)) {
    throw new Error(`${provider} auth provider is not enabled`);
  }
};

export const validateAuthProviderEnv = (
  providers = AUTH_PROVIDERS,
  env = process.env,
) => {
  if (providers.includes("google")) {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when google auth is enabled");
    }
  }

  if (providers.includes("pocketbase")) {
    if (!env.POCKETBASE_URL || !env.POCKETBASE_AUTH_COLLECTION) {
      throw new Error(
        "POCKETBASE_URL and POCKETBASE_AUTH_COLLECTION are required when pocketbase auth is enabled",
      );
    }
  }
};
