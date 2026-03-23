import crypto from "node:crypto";
import { now, text, token, uid } from "../lib/validation.js";

function base64Url(buffer) {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function normalizeScopes(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((item) => token("scope", String(item), 64));
  return String(raw).split(/\s+/).map((item) => item.trim()).filter(Boolean).map((item) => token("scope", item, 64));
}

function parseBearer(req) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  if (typeof header !== "string") return "";
  const matched = header.match(/^Bearer\s+(.+)$/i);
  return matched ? matched[1].trim() : "";
}

export class OAuthService {
  constructor({ identityRegistry, oauth = {}, onChange = async () => {} } = {}) {
    this.identityRegistry = identityRegistry;
    this.clients = new Map((oauth.clients || []).map((client) => [client.clientId, { ...client }]));
    this.authorizationCodes = new Map((oauth.authorizationCodes || []).map((record) => [record.code, { ...record }]));
    this.accessTokens = new Map((oauth.accessTokens || []).map((record) => [record.accessToken, { ...record }]));
    this.refreshTokens = new Map((oauth.refreshTokens || []).map((record) => [record.refreshToken, { ...record }]));
    this.onChange = onChange;
    this.#ensureDefaultNativeClient();
  }

  snapshot() {
    return {
      oauth: {
        clients: [...this.clients.values()].map((record) => ({ ...record })),
        authorizationCodes: [...this.authorizationCodes.values()].map((record) => ({ ...record })),
        accessTokens: [...this.accessTokens.values()].map((record) => ({ ...record })),
        refreshTokens: [...this.refreshTokens.values()].map((record) => ({ ...record }))
      }
    };
  }

  parseBearerTokenFromRequest(req) {
    return parseBearer(req);
  }

  authorize({ humanId, query }) {
    const responseType = text("response_type", query.response_type, 32);
    if (responseType !== "code") throw this.oauthError("unsupported_response_type", "response_type must be code");
    const clientId = token("client_id", query.client_id, 128);
    const redirectUri = text("redirect_uri", query.redirect_uri, 512);
    const state = text("state", query.state, 256);
    const requestedScopes = normalizeScopes(query.scope);
    const codeChallenge = token("code_challenge", query.code_challenge, 256);
    const codeChallengeMethod = text("code_challenge_method", query.code_challenge_method || "S256", 32);
    if (codeChallengeMethod !== "S256") throw this.oauthError("invalid_request", "code_challenge_method must be S256");

    const client = this.#assertClient(clientId, redirectUri);
    const allowedScopeSet = new Set(client.scopes || []);
    for (const scope of requestedScopes) {
      if (!allowedScopeSet.has(scope)) throw this.oauthError("invalid_scope", `scope not allowed: ${scope}`);
    }
    const safeHumanId = token("humanId", humanId, 128);
    this.identityRegistry.getHuman(safeHumanId);

    const code = uid("oauth_code");
    const expiresAt = now() + 1000 * 60 * 5;
    this.authorizationCodes.set(code, {
      code,
      clientId: client.clientId,
      humanId: safeHumanId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope: requestedScopes.join(" "),
      createdAt: now(),
      expiresAt,
      consumedAt: 0
    });
    Promise.resolve(this.onChange()).catch(() => {});
    return { code, state };
  }

  async token({ grantType, code, redirectUri, clientId, codeVerifier, refreshToken }) {
    const grant = text("grant_type", grantType, 64);
    if (grant === "authorization_code") {
      return this.#exchangeAuthorizationCode({ code, redirectUri, clientId, codeVerifier });
    }
    if (grant === "refresh_token") {
      return this.#exchangeRefreshToken({ refreshToken, clientId });
    }
    throw this.oauthError("unsupported_grant_type", "grant_type is not supported");
  }

  async revoke({ token: rawToken, clientId }) {
    const value = text("token", rawToken, 512);
    const safeClientId = token("client_id", clientId, 128);
    let revoked = false;
    const accessRecord = this.accessTokens.get(value);
    if (accessRecord && accessRecord.clientId === safeClientId && !accessRecord.revokedAt) {
      accessRecord.revokedAt = now();
      revoked = true;
    }
    const refreshRecord = this.refreshTokens.get(value);
    if (refreshRecord && refreshRecord.clientId === safeClientId && !refreshRecord.revokedAt) {
      refreshRecord.revokedAt = now();
      revoked = true;
      const linkedAccess = this.accessTokens.get(refreshRecord.accessToken);
      if (linkedAccess && !linkedAccess.revokedAt) linkedAccess.revokedAt = now();
    }
    if (revoked) await this.onChange();
    return { ok: true };
  }

  verifyAccessToken({ accessToken, requiredScopes = [] }) {
    const tokenValue = text("access_token", accessToken, 1024);
    const record = this.accessTokens.get(tokenValue);
    if (!record || record.revokedAt) throw new Error("invalid access token");
    if (record.expiresAt <= now()) throw new Error("access token expired");
    const granted = new Set(normalizeScopes(record.scope));
    for (const scope of normalizeScopes(requiredScopes)) {
      if (!granted.has(scope)) throw new Error(`missing scope: ${scope}`);
    }
    return {
      humanId: record.humanId,
      clientId: record.clientId,
      scope: record.scope
    };
  }

  oauthError(code, description) {
    const error = new Error(description || code);
    error.oauth = {
      error: code,
      error_description: description || code
    };
    return error;
  }

  #exchangeAuthorizationCode({ code, redirectUri, clientId, codeVerifier }) {
    const safeCode = token("code", code, 256);
    const safeClientId = token("client_id", clientId, 128);
    const safeRedirectUri = text("redirect_uri", redirectUri, 512);
    const verifier = token("code_verifier", codeVerifier, 512);

    const record = this.authorizationCodes.get(safeCode);
    if (!record || record.consumedAt) throw this.oauthError("invalid_grant", "authorization code is invalid");
    if (record.clientId !== safeClientId) throw this.oauthError("invalid_grant", "authorization code client mismatch");
    if (record.redirectUri !== safeRedirectUri) throw this.oauthError("invalid_grant", "redirect_uri mismatch");
    if (record.expiresAt <= now()) throw this.oauthError("invalid_grant", "authorization code expired");

    const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
    if (challenge !== record.codeChallenge) throw this.oauthError("invalid_grant", "code_verifier mismatch");

    record.consumedAt = now();
    const accessToken = `eow_at_${base64Url(crypto.randomBytes(32))}`;
    const refreshToken = `eow_rt_${base64Url(crypto.randomBytes(32))}`;
    const issuedAt = now();
    const accessExpiresAt = issuedAt + 1000 * 60 * 15;
    const refreshExpiresAt = issuedAt + 1000 * 60 * 60 * 24 * 30;
    this.accessTokens.set(accessToken, {
      contract: "oauthAccessToken",
      accessToken,
      refreshToken,
      clientId: record.clientId,
      humanId: record.humanId,
      scope: record.scope,
      issuedAt,
      expiresAt: accessExpiresAt,
      revokedAt: 0
    });
    this.refreshTokens.set(refreshToken, {
      contract: "oauthRefreshToken",
      refreshToken,
      accessToken,
      clientId: record.clientId,
      humanId: record.humanId,
      scope: record.scope,
      issuedAt,
      expiresAt: refreshExpiresAt,
      revokedAt: 0
    });
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      token_type: "Bearer",
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 60 * 15,
      scope: record.scope
    };
  }

  #exchangeRefreshToken({ refreshToken, clientId }) {
    const safeRefreshToken = token("refresh_token", refreshToken, 1024);
    const safeClientId = token("client_id", clientId, 128);
    const record = this.refreshTokens.get(safeRefreshToken);
    if (!record || record.revokedAt) throw this.oauthError("invalid_grant", "refresh token is invalid");
    if (record.expiresAt <= now()) throw this.oauthError("invalid_grant", "refresh token expired");
    if (record.clientId !== safeClientId) throw this.oauthError("invalid_grant", "refresh token client mismatch");

    const oldAccess = this.accessTokens.get(record.accessToken);
    if (oldAccess && !oldAccess.revokedAt) oldAccess.revokedAt = now();

    const accessToken = `eow_at_${base64Url(crypto.randomBytes(32))}`;
    const issuedAt = now();
    const accessExpiresAt = issuedAt + 1000 * 60 * 15;
    this.accessTokens.set(accessToken, {
      contract: "oauthAccessToken",
      accessToken,
      refreshToken: record.refreshToken,
      clientId: record.clientId,
      humanId: record.humanId,
      scope: record.scope,
      issuedAt,
      expiresAt: accessExpiresAt,
      revokedAt: 0
    });
    record.accessToken = accessToken;
    Promise.resolve(this.onChange()).catch(() => {});
    return {
      token_type: "Bearer",
      access_token: accessToken,
      refresh_token: record.refreshToken,
      expires_in: 60 * 15,
      scope: record.scope
    };
  }

  #assertClient(clientId, redirectUri) {
    const client = this.clients.get(clientId);
    if (!client || client.status !== "active") throw this.oauthError("invalid_client", "oauth client is invalid");
    if (client.clientType !== "public_native") throw this.oauthError("unauthorized_client", "client type is not supported");
    if (!client.redirectUriAllowlist?.includes(redirectUri)) {
      throw this.oauthError("redirect_uri_mismatch", "redirect_uri is not allowlisted");
    }
    return client;
  }

  #ensureDefaultNativeClient() {
    const envClientId = text("EOW_OAUTH_CLIENT_ID", process.env.EOW_OAUTH_CLIENT_ID || "eow-installer-desktop", 128) || "eow-installer-desktop";
    const redirectRaw = text(
      "EOW_OAUTH_REDIRECT_URI",
      process.env.EOW_OAUTH_REDIRECT_URI || "eow://auth/callback,http://127.0.0.1:53682/callback",
      1024
    ) || "eow://auth/callback,http://127.0.0.1:53682/callback";
    const redirectUriAllowlist = String(redirectRaw)
      .split(",")
      .map((item) => text("redirect_uri", item.trim(), 512))
      .filter(Boolean);
    const scope = text("EOW_OAUTH_SCOPES", process.env.EOW_OAUTH_SCOPES || "openid profile onboarder.install", 256) || "openid profile onboarder.install";
    const existing = this.clients.get(envClientId);
    if (existing) {
      const mergedAllowlist = new Set([...(existing.redirectUriAllowlist || []), ...redirectUriAllowlist]);
      const mergedScopes = new Set([...(existing.scopes || []), ...normalizeScopes(scope)]);
      existing.clientType = existing.clientType || "public_native";
      existing.redirectUriAllowlist = [...mergedAllowlist];
      existing.scopes = [...mergedScopes];
      existing.status = existing.status || "active";
      existing.updatedAt = now();
      return;
    }
    this.clients.set(envClientId, {
      contract: "oauthClient",
      clientId: envClientId,
      clientType: "public_native",
      redirectUriAllowlist: redirectUriAllowlist.length ? redirectUriAllowlist : ["eow://auth/callback"],
      scopes: normalizeScopes(scope),
      status: "active",
      createdAt: now(),
      updatedAt: now()
    });
  }
}
