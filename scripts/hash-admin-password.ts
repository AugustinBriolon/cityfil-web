/**
 * Prints the ADMIN_PASSWORD_HASH value for a password read from stdin, so the password never
 * lands in shell history: `printf %s 'password' | pnpm admin:hash-password` or type it and press Ctrl-D.
 */
import { hashAdminPassword } from "../src/server/admin/admin-password";

async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const password = Buffer.concat(chunks)
    .toString("utf8")
    .replace(/\r?\n$/, "");
  if (password.length < 12) throw new Error("Admin password must be at least 12 characters.");
  process.stdout.write(`${await hashAdminPassword(password)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
