import "server-only";
import bcrypt from "bcryptjs";

// Supabase Auth exige un email. Le username n'est unique QUE par
// tenant (migration v1.2) : on intègre le code du tenant pour que
// l'email reste globalement unique dans auth.users.
export function buildSyntheticEmail(tenantCode: string, username: string) {
  const safeTenant = tenantCode.trim().toLowerCase();
  const safeUser = username.trim().toLowerCase();
  return `${safeUser}@${safeTenant}.stockipro.internal`;
}

// PIN à 6 chiffres : facile à transmettre oralement ou sur papier.
export function generatePin(): string {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// Mot de passe temporaire généré côté serveur, requis pour créer le
// compte Supabase Auth avant que le worker ait choisi le sien. Il est
// écrasé dès l'activation (échange du PIN) ; personne ne s'en sert.
export function generateServerSidePlaceholderPassword(): string {
  return crypto.randomUUID() + crypto.randomUUID();
}
