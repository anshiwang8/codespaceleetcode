import "server-only";
import { withTransaction } from "@/lib/server/db";

/**
 * Deletes a user and everything about them, in one transaction, so a failure leaves the account as
 * it was. Removing the auth_users row cascades to their sessions, linked GitHub account and token,
 * and their users row (0005); through users, to their submissions and progress (0001), profile
 * details, links, theme preference, picture, contact email and pending email links (0007), and
 * their hint reveals, points, challenge completions, achievements and leaderboard entry (0009).
 * Their rate-limit counters go too: every per-user key ends in `user:<id>`. Returns whether there
 * was a user to delete; running it again for the same id deletes nothing and returns false.
 */
export async function deleteAccount(userId: string): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query("delete from rate_limits where key like '%user:' || $1", [userId]);
    const result = await client.query("delete from auth_users where id = $1", [userId]);
    return (result.rowCount ?? 0) > 0;
  });
}
