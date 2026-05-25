import { describe, expect, it } from "vitest";
import { parseAuthProviders, validateAuthProviderEnv } from "../src/auth-providers";

describe("parseAuthProviders", () => {
  it("parses both providers", () => {
    expect(parseAuthProviders("google,pocketbase")).toEqual(["google", "pocketbase"]);
  });

  it("defaults to google", () => {
    expect(parseAuthProviders(undefined)).toEqual(["google"]);
  });

  it("rejects unsupported providers", () => {
    expect(() => parseAuthProviders("github")).toThrow("Unsupported auth provider");
  });
});

describe("validateAuthProviderEnv", () => {
  it("requires only google env for google-only deployments", () => {
    expect(() =>
      validateAuthProviderEnv(["google"], {
        GOOGLE_CLIENT_ID: "google-client-id",
        GOOGLE_CLIENT_SECRET: "google-client-secret",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("requires pocketbase env for pocketbase deployments", () => {
    expect(() =>
      validateAuthProviderEnv(["pocketbase"], {
        POCKETBASE_URL: "https://pb.example.com",
        POCKETBASE_AUTH_COLLECTION: "users",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("fails when enabled provider env is missing", () => {
    expect(() =>
      validateAuthProviderEnv(["pocketbase"], {} as NodeJS.ProcessEnv),
    ).toThrow("POCKETBASE_URL and POCKETBASE_AUTH_COLLECTION");
  });
});
