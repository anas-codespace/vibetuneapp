import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Structured logger that captures Supabase session/token presence whenever a
 * server function call fails with an "Unauthorized" error. Runs on both client
 * (where we can inspect the browser session) and server (where we can inspect
 * the Authorization header that actually reached the middleware).
 */
export const unauthorizedLogger = createMiddleware({ type: "function" })
  .client(async ({ next, functionId }) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("unauthorized")) {
        let sessionPresent = false;
        let tokenPresent = false;
        let userId: string | null = null;
        let expiresAt: number | null = null;
        let expiresInSec: number | null = null;
        try {
          const { data } = await supabase.auth.getSession();
          sessionPresent = !!data.session;
          tokenPresent = !!data.session?.access_token;
          userId = data.session?.user?.id ?? null;
          expiresAt = data.session?.expires_at ?? null;
          if (expiresAt) {
            expiresInSec = expiresAt - Math.floor(Date.now() / 1000);
          }
        } catch (sessionErr) {
          console.warn("[unauthorized-logger] getSession failed", sessionErr);
        }
        console.error("[unauthorized][client]", {
          scope: "client",
          functionId,
          message,
          sessionPresent,
          tokenPresent,
          userId,
          expiresAt,
          expiresInSec,
          tokenExpired: expiresInSec !== null ? expiresInSec <= 0 : null,
          url: typeof window !== "undefined" ? window.location.href : null,
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }
  })
  .server(async ({ next, functionId }) => {
    try {
      return await next();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes("unauthorized")) {
        let hasAuthHeader = false;
        let authScheme: string | null = null;
        let tokenLength = 0;
        let tokenParts = 0;
        try {
          const { getRequest } = await import("@tanstack/react-start/server");
          const req = getRequest();
          const header = req?.headers?.get("authorization");
          if (header) {
            hasAuthHeader = true;
            const [scheme, token] = header.split(" ");
            authScheme = scheme ?? null;
            if (token) {
              tokenLength = token.length;
              tokenParts = token.split(".").length;
            }
          }
        } catch (reqErr) {
          console.warn("[unauthorized-logger] getRequest failed", reqErr);
        }
        console.error("[unauthorized][server]", {
          scope: "server",
          functionId,
          message,
          hasAuthHeader,
          authScheme,
          tokenLength,
          tokenParts,
          looksLikeJwt: tokenParts === 3,
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }
  });
