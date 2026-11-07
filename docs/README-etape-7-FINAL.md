# StockiPro v1.2 — Étape 7 (finale) : PIN, désactivation, tests, lancement

## 1. Dépendances à installer (test)

```bash
npm install -D vitest
```

## 2. Changement base (déjà fait via MCP)

```sql
alter table public.app_users
  add column if not exists is_active boolean not null default true;
```

## 3. Fichiers livrés / modifiés

```
app/(admin)/workers/actions.ts   # modifié — + regeneratePin, setWorkerActive
app/(admin)/workers/page.tsx     # modifié — boutons régénérer/désactiver
app/login/actions.ts             # modifié — lookupAccount refuse un compte is_active=false
vitest.config.ts                 # nouveau
tests/auth-helpers.test.ts       # nouveau
tests/offline-queue.test.ts      # nouveau
```

Lancer les tests : `npx vitest run`

## 4. Désactivation d'un worker — double verrou

- `is_active = false` en base → `lookupAccount` refuse dès l'étape 1 du login.
- Ban Supabase Auth (`ban_duration: "876000h"`) → même si quelqu'un
  contournait `lookupAccount`, `signInWithPassword` échoue quand même.
- Réactiver repasse les deux à l'état normal (`ban_duration: "none"`).

## 5. Checklist complète pour lancer l'app — dans l'ordre

```bash
# 1. Créer le projet Next.js si ce n'est pas déjà fait
npx create-next-app@latest stockipro --typescript --tailwind --app

# 2. Copier tous les fichiers livrés (étapes 1 à 7) aux mêmes chemins
#    relatifs dans le projet (middleware.ts à la racine, le reste
#    sous app/ et lib/ et components/ et tests/).

# 3. Installer les dépendances
npm install @supabase/ssr @supabase/supabase-js bcryptjs html5-qrcode
npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz
npm install -D @types/bcryptjs vitest

# 4. Variables d'environnement — .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://akovwpscqsxeouoxmqwu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<copier depuis Supabase → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<idem, clé service_role — jamais NEXT_PUBLIC_>
```

```bash
# 5. Vérifier que tout compile
npm run build

# 6. Lancer les tests unitaires
npx vitest run

# 7. Démarrer
npm run dev
```

### Premier scénario à tester manuellement (dans l'ordre)

1. Ouvrir `/admin` avec un compte `master` (à créer manuellement une
   fois via Supabase Dashboard → Authentication → Add user, avec
   `app_metadata: {"role": "master"}`, + une ligne `app_users`
   correspondante avec `role = 'master'`).
2. Créer un tenant (code généré automatiquement).
3. Créer un compte `admin` pour ce tenant de la même façon que le
   master (manuellement, une seule fois — il n'y a pas encore d'UI
   pour créer un admin, seulement des workers).
4. Se connecter en admin sur `/login` avec le code du tenant.
5. Dans `/(admin)/workers`, créer un worker → noter le PIN affiché.
6. Se déconnecter, se reconnecter sur `/login` avec le username du
   worker → écran "Première Connexion" → saisir le PIN + nouveau mot
   de passe → redirection automatique vers `/scan`.
7. Dans `/dashboard` (compte admin), créer une session, scanner
   quelque chose depuis `/scan`, vérifier que l'Écart apparaît en
   temps réel.

## 6. Ce qui manque encore pour une UI 100% complète (pas bloquant)

- Pas d'UI pour créer un compte `admin` depuis l'app elle-même (seul
  un `master` ou un accès direct à Supabase peut le faire aujourd'hui).
  Si besoin rapidement : dupliquer `createWorker`, changer
  `role: "auditor"` en `role: "admin"`, et restreindre l'appelant à
  `role === "master"`.
- Tests E2E navigateur (Playwright) avec vraie caméra non livrés —
  trop lents à fiabiliser pour une mise en route rapide ; les tests
  unitaires (étape 7) couvrent la logique pure (PIN, email
  synthétique, détection réseau), et l'isolation RLS a déjà été
  vérifiée directement en SQL (voir conversation précédente).

## 7. État de sécurité au 2026-11-06

`get_advisors` (security) sur le projet Supabase StockiPro : **0
alerte**. Isolation multi-tenant testée et confirmée en SQL direct
(lecture, écriture, usurpation d'identité — toutes bloquées comme
attendu).
