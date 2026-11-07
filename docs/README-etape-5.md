# StockiPro v1.2 — Étape 5 : Master Admin (/admin) + mode hors-ligne

## 1. Aucune dépendance supplémentaire

IndexedDB est une API native du navigateur — pas de package à
installer pour la queue hors-ligne.

## 2. Aucun changement base nécessaire

La policy `tenants_master_all` (migration v1.2, étape 1) couvrait déjà
tout ce dont `/admin` a besoin : un master a un accès total à
`tenants`, et `products_tenant_isolation` / `sessions_tenant_isolation`
/ `logs_tenant_select` incluent déjà `private.is_master()`. Rien à
appliquer en base pour cette étape.

## 3. Fichiers livrés

```
app/admin/actions.ts        # listTenants, createTenant, setTenantActive, getTenantStats
app/admin/page.tsx          # UI Master Admin : liste, création, activation, stats
lib/offline-queue.ts        # queue IndexedDB (comptages en attente de réseau)
app/scan/page.tsx (modifié) # intégration de la queue dans handleSubmit
```

## 4. Master Admin (`/admin`)

- **Création de tenant** : génère un code court (6 caractères, sans
  I/O/0/1 pour éviter toute confusion à la lecture) — c'est ce code
  que les workers de ce magasin utiliseront sur `/login`.
- **Activation/désactivation** : bascule `tenants.is_active`. Un
  tenant désactivé ne peut plus se connecter (`lookupAccount` de
  l'étape 2 vérifie déjà `is_active`).
- **Statistiques par tenant** : nombre de produits, sessions actives,
  logs — chargées à la demande (pas automatiquement, pour éviter
  N+1 requêtes si beaucoup de tenants).
- Protégé par le middleware de l'étape 2 (`/admin/*` → role `master`
  uniquement) **et** par `requireMaster()` dans chaque action — double
  vérification volontaire (défense en profondeur).

## 5. Mode hors-ligne (`/scan`)

Le worker continue à scanner même sans réseau :

1. `submitCount` échoue avec une vraie erreur réseau (`TypeError`
   contenant "fetch"/"network", typique d'un `fetch` qui ne part
   jamais) → distingué d'une erreur métier (RLS, validation), qui
   elle ne doit PAS être mise en queue (sinon on boucle pour toujours
   sur un envoi qui échouera quoi qu'il arrive).
2. Le comptage est stocké dans IndexedDB (`enqueuePendingCount`),
   l'auditeur voit un badge "X بانتظار الإرسال" et peut enchaîner les
   scans sans attendre.
3. Au retour du réseau (événement `online`) ou après chaque envoi
   réussi, `syncPendingCounts` rejoue la queue dans l'ordre et
   supprime chaque entrée confirmée.

### Limite connue à garder en tête

La détection de doublon (`lookupBarcode`) interroge la base en
direct : **hors-ligne, elle ne peut pas savoir qu'un article a déjà
été scanné** (ni par ce worker avant la coupure, ni par un collègue).
Un même article scanné deux fois hors-ligne créera deux lignes
distinctes à la synchronisation — acceptable pour un MVP (l'admin les
verra toutes les deux dans le dashboard et pourra arbitrer), mais à
garder en tête si plusieurs auditeurs travaillent souvent sans réseau
dans le même entrepôt.

## 6. Ce qui reste — au-delà des 5 étapes

- Page de création de workers (étape 2, `createWorker` déjà prêt côté
  serveur, UI à faire) + bouton de déconnexion.
- `app/layout.tsx` : viewport lock + police Cairo + RTL (étape 3,
  non livré pour ne pas écraser votre fichier existant).
- Tests d'isolation multi-tenant de bout en bout (2 tenants, 2
  comptes, vérifier qu'aucun ne voit les données de l'autre — RLS a
  déjà 0 alerte sécurité côté advisor, mais un test applicatif reste
  la meilleure confirmation avant mise en prod).
