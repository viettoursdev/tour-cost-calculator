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
    const { data: upData, error: upErr } = await client.from('profiles').update({
      username: u.u, email, role: u.role ?? 'Standard',
      name: u.name ?? u.u, color: u.color ?? '#888888', phone: u.phone ?? null,
    }).eq('id', id).select('id');
    if (upErr) throw new Error(`profile update ${u.u}: ${upErr.message}`);
    if (!upData || upData.length === 0) throw new Error(`profile update ${u.u}: no profiles row for ${id} (provisioning trigger did not fire)`);
    map.set(u.u, id);
    // Actor fields in prod store the display name (e.g. createdBy: 'Hoàng Anh Tuấn'),
    // not the username (u). Register the display name as an alias so attribution
    // resolves; makeResolver additionally normalizes case + trailing '(role)'.
    if (u.name) map.set(u.name, id);
  }
  return map;
}

/** Resolver: username/display-name -> UUID, null for falsy/unmapped (unmapped non-empty names recorded). */
export function makeResolver(usernameToId) {
  const unmapped = new Set();
  // Normalize for tolerant matching: NFC, trim, lowercase, strip a trailing
  // " (Role)" suffix (e.g. 'Hoàng Anh Tuấn (CEO)' -> 'hoàng anh tuấn').
  const norm = (s) => s.normalize('NFC').trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, '');
  const normIndex = new Map();
  for (const [key, id] of usernameToId) {
    if (key) normIndex.set(norm(key), id);
  }
  const resolve = (u) => {
    if (!u) return null;
    const direct = usernameToId.get(u);
    if (direct !== undefined) return direct;
    const id = normIndex.get(norm(u));
    if (id !== undefined) return id;
    unmapped.add(u);
    return null;
  };
  const resolveMany = (us) => (us ?? []).map(resolve).filter(Boolean);
  return { resolve, resolveMany, unmapped };
}
