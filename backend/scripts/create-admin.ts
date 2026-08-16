/**
 * Creates (or resets) a SUPER_ADMIN account directly in the database.
 *
 * The `POST /users` endpoint can't be used to make the *first* admin: it needs
 * a caller who already holds MANAGE_USERS, and it always generates a random
 * password and emails it. This script fills that gap — it is how a freshly
 * bootstrapped database gets its first human login.
 *
 * Two things are set up beyond the User row, both required for the account to
 * actually be an admin in the UI:
 *
 *  1. The `SUPER_ADMIN` role. `authenticate()` short-circuits on this role name
 *     and hands the request every permission, but the *frontend* reads the
 *     `permissions` array from the login response, which `getUserPermissions()`
 *     builds from RolePermission rows. So the role is also wired to every
 *     ACTIVE row in Permission — without that the API allows everything while
 *     the UI hides everything.
 *
 *  2. A UserProfile with `user_type = 'ADMIN'`.
 *
 * Re-runnable: if the email or username already exists, the password is reset
 * and the role/profile are repaired rather than erroring out.
 *
 * Usage:
 *   npx ts-node scripts/create-admin.ts --email=me@example.com --password='...'
 *   npx ts-node scripts/create-admin.ts --email=me@example.com --password='...' \
 *       --username=me --first=Jane --last=Doe
 *   npx ts-node scripts/create-admin.ts --email=... --password=... --db=nga_central_mis_test
 */
import dotenv from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

// src/db reads DB_NAME when it is imported, so a --db override has to land
// before that import below.
const dbOverride = arg("db");
if (dbOverride) process.env.DB_NAME = dbOverride;

import { db } from "../src/db";
import {
  User,
  UserProfile,
  UserRole,
  AuthCredential,
  Role,
  RolePermission,
  Permission,
} from "../src/db/schema";
import { eq, and, or, sql } from "drizzle-orm";

const SUPER_ADMIN = "SUPER_ADMIN";

/** The SUPER_ADMIN role id, created with every ACTIVE permission if absent. */
async function ensureSuperAdminRole(): Promise<number> {
  let role = await db
    .select({ role_id: Role.role_id, status: Role.status })
    .from(Role)
    .where(eq(Role.name, SUPER_ADMIN))
    .limit(1);

  const preexisting = role.length > 0;

  if (role.length === 0) {
    await db.insert(Role).values({
      name: SUPER_ADMIN,
      description: "Full system access",
      status: "ACTIVE",
    });
    role = await db
      .select({ role_id: Role.role_id, status: Role.status })
      .from(Role)
      .where(eq(Role.name, SUPER_ADMIN))
      .limit(1);
    console.log(`  · created role ${SUPER_ADMIN} (#${role[0].role_id})`);
  } else if (role[0].status !== "ACTIVE") {
    // A DISABLED role is skipped by getUserRoles(), so the account would look
    // like an admin in the tables and behave like a nobody at runtime.
    await db
      .update(Role)
      .set({ status: "ACTIVE" })
      .where(eq(Role.role_id, role[0].role_id));
    console.log(`  · re-enabled role ${SUPER_ADMIN}`);
  }

  const roleId = role[0].role_id;

  // An established database has a deliberately curated SUPER_ADMIN permission
  // set, and blanket-granting every row would hand the admin student-only
  // permissions (VIEW_STUDENT_CALENDAR, SUBMIT_MENTEE_CHECKIN, …) that change
  // what the UI renders. Only a role this script just created gets the full
  // sweep, which is what a freshly bootstrapped database needs.
  if (preexisting) {
    const [{ n }] = await db
      .select({ n: sql<number>`COUNT(*)` })
      .from(RolePermission)
      .where(eq(RolePermission.role_id, roleId));
    console.log(
      `  · role ${SUPER_ADMIN} (#${roleId}) already exists with ${n} permission(s) — left as is`,
    );
    return roleId;
  }

  const allPerms = await db
    .select({ perm_id: Permission.perm_id })
    .from(Permission)
    .where(eq(Permission.status, "ACTIVE"));
  const held = await db
    .select({ perm_id: RolePermission.perm_id })
    .from(RolePermission)
    .where(eq(RolePermission.role_id, roleId));
  const heldIds = new Set(held.map((p) => p.perm_id));
  const missing = allPerms.filter((p) => !heldIds.has(p.perm_id));

  if (missing.length > 0) {
    await db
      .insert(RolePermission)
      .values(missing.map((p) => ({ role_id: roleId, perm_id: p.perm_id })));
    console.log(
      `  · granted ${missing.length} permission(s) to ${SUPER_ADMIN} (${allPerms.length} total)`,
    );
  }

  return roleId;
}

async function main() {
  const email = arg("email");
  const password = arg("password");
  const explicitUsername = arg("username");
  const firstName = arg("first") || null;
  const lastName = arg("last") || null;

  if (!email) {
    console.error(
      "Usage: create-admin.ts --email=<email> [--password=<password>] " +
        "[--username=<name>] [--first=<first>] [--last=<last>] [--db=<database>]\n" +
        "Without --password an existing account keeps the password it has.",
    );
    process.exit(1);
  }

  // Only a fallback for accounts being created. An account that already exists
  // keeps the username it logs in with unless --username says otherwise.
  const newUsername =
    explicitUsername || email.split("@")[0].replace(/[^\w.@-]/g, "");

  console.log(`Database: ${process.env.DB_NAME}`);
  console.log(`Account : ${email}\n`);

  const roleId = await ensureSuperAdminRole();

  const existing = await db
    .select({ user_id: User.user_id, username: User.username, email: User.email })
    .from(User)
    .where(or(eq(User.email, email), eq(User.username, newUsername)))
    .limit(1);

  let userId: number;
  let created: boolean;
  let username: string;

  if (existing.length > 0) {
    userId = existing[0].user_id;
    created = false;
    username = explicitUsername || existing[0].username;
    await db
      .update(User)
      .set({ email, username, status: "ACTIVE" })
      .where(eq(User.user_id, userId));
    console.log(
      `  · user #${userId} already existed (username ${username}) — reusing it`,
    );
  } else {
    username = newUsername;
    await db.insert(User).values({ username, email, status: "ACTIVE" });
    const fresh = await db
      .select({ user_id: User.user_id })
      .from(User)
      .where(eq(User.email, email))
      .limit(1);
    userId = fresh[0].user_id;
    created = true;
    console.log(`  · created user #${userId}`);
  }

  const cred = await db
    .select({ auth_id: AuthCredential.auth_id })
    .from(AuthCredential)
    .where(eq(AuthCredential.user_id, userId))
    .limit(1);

  if (cred.length > 0 && !password) {
    console.log("  · credentials left untouched (no --password given)");
  } else if (!password) {
    console.error(
      `\nUser #${userId} has no credentials row, so --password is required to give it one.`,
    );
    process.exit(1);
  } else {
    // Cost 12 matches createUser() in userController, so hashes from either
    // path verify the same way.
    const passwordHash = await bcrypt.hash(password, await bcrypt.genSalt(12));

    if (cred.length > 0) {
      await db
        .update(AuthCredential)
        .set({
          password_hash: passwordHash,
          force_password_change: 0,
          failed_attempts: 0,
          locked_until: null,
        })
        .where(eq(AuthCredential.user_id, userId));
      console.log("  · password reset");
    } else {
      await db.insert(AuthCredential).values({
        user_id: userId,
        password_hash: passwordHash,
        // Deliberately 0: the operator chose this password, so there is nothing
        // to force a change away from (unlike the random one createUser mails).
        force_password_change: 0,
      });
      console.log("  · credentials created");
    }
  }

  const profile = await db
    .select({ profile_id: UserProfile.profile_id })
    .from(UserProfile)
    .where(eq(UserProfile.user_id, userId))
    .limit(1);

  if (profile.length > 0) {
    // An existing profile keeps its user_type. Flipping a working teacher to
    // ADMIN would drop them out of the TEACHER dashboard counts and the
    // user_type-filtered queries in academicController, and SUPER_ADMIN is
    // carried by the role, not by this column.
    console.log("  · existing profile left untouched");
  } else {
    await db.insert(UserProfile).values({
      user_id: userId,
      first_name: firstName,
      last_name: lastName,
      user_type: "ADMIN",
    });
    console.log("  · profile created (user_type ADMIN)");
  }

  const link = await db
    .select({ role_id: UserRole.role_id })
    .from(UserRole)
    .where(and(eq(UserRole.user_id, userId), eq(UserRole.role_id, roleId)))
    .limit(1);

  if (link.length === 0) {
    await db.insert(UserRole).values({ user_id: userId, role_id: roleId });
    console.log(`  · assigned ${SUPER_ADMIN}`);
  }

  console.log(
    `\n${created ? "Created" : "Updated"} SUPER_ADMIN #${userId}` +
      `\n  login: ${email}  (or username ${username})`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("create-admin failed:", err.message);
  process.exit(1);
});
