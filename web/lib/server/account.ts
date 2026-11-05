import "server-only";
import { withTransaction } from "@/lib/server/db";

/**
 * Deletes a user and everything about them. Removing the auth_users row cascades to their sessions,
 * linked GitHub account and token, their users row, and through that their submissions and
 * progress (migrations 0001 and 0005). Their rate-limit counters go too. Returns whether there was
 * a user to delete.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query("delete from rate_limits where key like '%user:' || $1", [userId]);
    const result = await client.query("delete from auth_users where id = $1", [userId]);
    return (result.rowCount ?? 0) > 0;
  });
}
