import { timingSafeEqual } from "node:crypto";

// Admin-only routes require:  Authorization: Bearer <ADMIN_TOKEN>
export function isAuthorized(request: Request): boolean {
  const secret = process.env.ADMIN_TOKEN;
  if (!secret) return false;

  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}