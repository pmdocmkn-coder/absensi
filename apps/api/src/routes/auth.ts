import { Elysia, t } from "elysia";
import { clearSessionCookie, createSessionCookie, login, logout, requireAuth } from "../auth";

export const authRoutes = new Elysia({ prefix: "/api/auth" })
  .post("/login", async ({ body, request, set }) => {
    const result = await login({
      identifier: body.identifier,
      password: body.password,
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent")
    });
    set.headers["set-cookie"] = createSessionCookie(result.token);
    return { expiresAt: result.expiresAt, user: result.user };
  }, {
    body: t.Object({
      identifier: t.String({ minLength: 1, maxLength: 160 }),
      password: t.String({ minLength: 8, maxLength: 128 })
    })
  })
  .get("/me", ({ request }) => ({ user: requireAuth(request) }))
  .post("/logout", ({ request, set }) => {
    logout(request);
    set.headers["set-cookie"] = clearSessionCookie();
    return { success: true };
  });
