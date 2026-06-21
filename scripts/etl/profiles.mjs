// scripts/etl/profiles.mjs — keystone: auth users + profiles + username->UUID map.

/** Create auth users (no password) and overwrite trigger-provisioned profiles. */
export async function loadProfiles(client, dump) {
  const users = dump.singles['viettours/user_accounts']?.users ?? [];
  const map = new Map();
  for (const u of users) {
    const email = u.email || `${u.u}@viettours.com.vn`;
    const { data, error } = await client.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw new Error(`createUser ${email}: ${error.message}`);
    const id = data.user.id;
    // The on_auth_user_created trigger already inserted a profiles row (role Standard,
    // username/name = email prefix). Overwrite with the real values from the dump.
    const { error: upErr } = await client.from('profiles').update({
      username: u.u, email, role: u.role ?? 'Standard',
      name: u.name ?? u.u, color: u.color ?? '#888888', phone: u.phone ?? null,
    }).eq('id', id);
    if (upErr) throw new Error(`profile update ${u.u}: ${upErr.message}`);
    map.set(u.u, id);
  }
  return map;
}

/** Resolver: username -> UUID, null for falsy/unmapped (unmapped non-empty names recorded). */
export function makeResolver(usernameToId) {
  const unmapped = new Set();
  const resolve = (u) => {
    if (!u) return null;
    const id = usernameToId.get(u);
    if (id) return id;
    unmapped.add(u);
    return null;
  };
  const resolveMany = (us) => (us ?? []).map(resolve).filter(Boolean);
  return { resolve, resolveMany, unmapped };
}
