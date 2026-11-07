# StockiPro v1.2 — Étape 2 : Auth, activation PIN, middleware

Ces fichiers s'insèrent dans l'arborescence Next.js existante (App
Router). Copier chaque fichier au même chemin relatif dans le projet.

## 1. Dépendances à installer

```bash
npm install @supabase/ssr @supabase/supabase-js bcryptjs
npm install -D @types/bcryptjs
```

## 2. Variables d'environnement

`.env.local` (ne jamais commiter) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://tctifgkzfpdpjdghoojy.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx        # clé anon/publishable
SUPABASE_SERVICE_ROLE_KEY=xxx            # clé service_role — SERVEUR UNIQUEMENT
```

`SUPABASE_SERVICE_ROLE_KEY` ne doit **jamais** avoir le préfixe
`NEXT_PUBLIC_` : ce préfixe embarque la variable dans le bundle
envoyé au navigateur. Cette clé contourne RLS — elle ne doit vivre
que dans `lib/supabase/admin.ts`, jamais dans un fichier `"use client"`.

## 3. Fichiers livrés

```
middleware.ts                       # garde session + rôle (racine du projet)
lib/supabase/client.ts              # client navigateur
lib/supabase/server.ts              # client serveur (Server Components/Actions)
lib/supabase/admin.ts               # client service_role (bypass RLS)
lib/supabase/middleware.ts          # helper de rafraîchissement de session
lib/auth-helpers.ts                 # email synthétique + PIN (génération/hash)
app/login/page.tsx                  # UI login + Première Connexion (RTL)
app/login/actions.ts                # lookupAccount, activateAccount
app/(admin)/workers/actions.ts      # createWorker (admin/master uniquement)
```

## 4. Flux couverts

**Création d'un worker** (depuis une page admin à construire, qui
appelle `createWorker` de `app/(admin)/workers/actions.ts`) :
admin/master connecté → le serveur crée le compte Supabase Auth +
la ligne `app_users` avec un PIN à 6 chiffres hashé → le PIN est
retourné **une seule fois** à l'écran, à transmettre au worker
(oralement, SMS, papier).

**Première connexion du worker** (`/login`) :
1. Le worker saisit le code du magasin + son username.
2. `lookupAccount` indique s'il doit activer son compte (PIN) ou
   saisir directement son mot de passe.
3. Si activation : il saisit le PIN + un nouveau mot de passe →
   `activateAccount` vérifie le PIN, fixe le mot de passe dans
   Supabase Auth, marque le compte activé → le client appelle
   ensuite `signInWithPassword` pour ouvrir la session.
4. Si déjà activé : saisie directe du mot de passe →
   `signInWithPassword`.

**Middleware** : relit la session à chaque requête, redirige vers
`/login` si non connecté, confine le rôle `auditor` à `/scan`, et
réserve `/admin/*` au rôle `master`. C'est une défense en profondeur
en plus de RLS (section 5 de la migration v1.2) — RLS reste la seule
barrière qui compte vraiment côté données.

## 5. Ce qui reste à construire manuellement

- Une page admin (`app/(admin)/workers/page.tsx`) avec un formulaire
  qui appelle `createWorker` et affiche le PIN retourné une seule
  fois (avec un avertissement "notez-le, il ne sera plus affiché").
- Un bouton/route de déconnexion (`supabase.auth.signOut()`).
- La page `/scan` et `/dashboard` elles-mêmes (étapes 3 et 4).

## 6. Points de sécurité à ne pas casser en modifiant ce code

- Ne jamais appeler `createAdminClient()` depuis un fichier
  `"use client"` ou depuis une route exposée sans vérifier d'abord
  le rôle via le client de **session** (voir `createWorker` : le
  rôle est vérifié avec `createClient()`, pas avec l'admin client).
- `lookupAccount` renvoie toujours le même message d'erreur
  générique, que le tenant, le username ou le mot de passe soient
  invalides — ne pas différencier ces cas dans l'UI (évite
  l'énumération de comptes/tenants).
- Le PIN n'est jamais stocké en clair ni journalisé ; seul son hash
  bcrypt est en base, et il expire après 24h
  (`activation_expires_at`).
