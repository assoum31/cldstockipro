# StockiPro v1.2 — Étape 4 : /dashboard (Écart, Realtime, Excel)

## 1. Dépendance à installer

```bash
npm install xlsx
```

Utiliser la dernière version publiée sur le site officiel SheetJS
(`https://cdn.sheetjs.com/`) plutôt que la version npm historique
`xlsx@0.18.x`, qui contient des vulnérabilités connues (prototype
pollution / ReDoS) — voir le README SheetJS pour l'URL exacte du
tarball à installer (`npm install https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`).

## 2. Changement appliqué en base (déjà fait via MCP)

Vue `public.inventory_discrepancies` (`security_invoker = true`) :
calcule l'Écart par produit (ou par barcode si hors catalogue) pour
une session donnée, à partir de `inventory_logs`, `products` et
`inventory_session_snapshots`. Comme elle est `security_invoker`,
elle n'a aucun privilège propre — RLS des tables sous-jacentes
s'applique normalement, donc l'isolation tenant reste garantie par
les policies déjà en place, pas par la vue.

## 3. Fichiers livrés

```
app/dashboard/actions.ts   # sessions (create/lock/complete), écart, import/export
app/dashboard/page.tsx     # UI : sessions, table Écart realtime, boutons Excel
lib/excel.ts               # template, parsing import, export audit (SheetJS)
```

## 4. Flux couverts

- **Sessions** : création (une seule `active` à la fois, imposé en
  base), verrouillage (`lockSession` fige `system_quantity` de
  chaque produit dans `inventory_session_snapshots` via le client
  service_role, après vérification du rôle côté session), clôture.
- **Écart temps réel** : `page.tsx` s'abonne à `postgres_changes` sur
  `inventory_logs` et refait un `getDiscrepancies` à chaque
  INSERT/UPDATE/DELETE. RLS filtre déjà par tenant côté Realtime —
  aucun filtre client à ajouter.
- **Template Excel** : génère `Stocki_Inventory_Template.xlsx` avec
  les 7 en-têtes de la section C de la spec, entièrement côté
  navigateur (pas d'aller-retour serveur).
- **Import en masse** : lecture `.xlsx`/`.csv` avec `raw: false`
  (préserve les zéros de tête des codes-barres), upsert par lots de
  500 lignes via le client de **session** (pas l'admin client) pour
  que `products_tenant_isolation` (RLS) continue de vérifier
  `tenant_id` à chaque ligne.
- **Export audit** : récupère les logs de la session sélectionnée et
  génère un vrai `.xlsx` binaire côté navigateur — la remarque "UTF-8
  BOM" de la spec ne s'applique qu'à un export CSV, pas nécessaire ici.

## 5. Ce qui reste à faire manuellement

- Page dédiée de gestion des workers (`app/(admin)/workers/page.tsx`)
  utilisant `createWorker` de l'étape 2 — pas encore livrée.
- Bouton de déconnexion global + layout partagé admin/master.
- `/admin` (Master Admin global, section 3 de la spec) : gestion
  multi-tenant, analytics globales — hors périmètre des étapes 1 à 4.
- Pagination de la table Écart si le catalogue dépasse quelques
  milliers de lignes (actuellement tout est chargé d'un coup).
