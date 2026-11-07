# StockiPro v1.2 — Étape 6 : pièces manquantes (UI)

Complète la liste "reste à faire" des README précédents. Aucun
changement base nécessaire pour cette étape.

## Fichiers livrés / modifiés

```
app/layout.tsx                      # nouveau — viewport lock, Cairo, RTL
app/globals.css                     # nouveau — Tailwind + overscroll/touch
components/logout-button.tsx        # nouveau — déconnexion réutilisable
app/(admin)/workers/actions.ts      # modifié — + listWorkers
app/(admin)/workers/page.tsx        # nouveau — créer/lister les workers
app/dashboard/page.tsx              # modifié — + LogoutButton dans le header
app/admin/page.tsx                  # modifié — + LogoutButton dans le header
app/scan/page.tsx                   # modifié — + LogoutButton dans le header
```

## Points d'attention

- **`app/layout.tsx` / `globals.css`** : si vous avez déjà ces
  fichiers dans le projet, fusionnez plutôt que d'écraser — ici,
  ils sont fournis complets car présumés absents (projet encore au
  stade des pages isolées des étapes précédentes).
- **Page workers** : le PIN n'est affiché qu'une fois, juste après
  `createWorker` — rechargez la page et il ne sera plus récupérable
  nulle part (normal, il n'est jamais stocké en clair). Si un admin
  perd le PIN avant de le transmettre, il faut une action "régénérer
  le PIN" — non livrée, mais triviale à ajouter sur le même modèle
  que `createWorker` (nouveau hash, nouvelle expiration, sans
  recréer le compte Auth).
- **`LogoutButton`** : ajouté dans les 3 pages (`/dashboard`,
  `/admin`, `/scan`) plutôt que dans un layout partagé, puisque ces
  3 routes n'ont pas de layout commun dans la structure actuelle
  (`/scan` est plein écran et volontairement sans chrome partagé
  avec le reste). Si vous ajoutez des layouts de groupe
  (`app/(admin)/layout.tsx`, etc.), le bouton peut y migrer une
  seule fois.

## Ce qui reste, en toute honnêteté

- Action "régénérer le PIN" (voir ci-dessus).
- Suppression/désactivation d'un worker (actuellement seulement
  création/liste).
- Tests end-to-end automatisés (Playwright) — le test d'isolation
  multi-tenant a été fait manuellement en SQL direct sur le projet,
  pas encore en test automatisé reproductible dans une CI.
