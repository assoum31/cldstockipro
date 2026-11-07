# StockiPro v1.2 — Étape 3 : /scan (scanner + détection de doublon)

## 1. Dépendance à installer

```bash
npm install html5-qrcode
```

## 2. Changements appliqués directement en base (déjà faits via MCP)

- `inventory_sessions_one_active_per_tenant` : index unique garantissant
  une seule session `active` par tenant à la fois (sinon la détection
  de doublon et le snapshot d'écart deviennent ambigus).
- Policy `logs_owner_update` : un auditeur peut corriger **sa propre**
  ligne (`counted_by = auth.uid()`) — nécessaire pour le bouton
  "تعديل الكمية / الموقع" du warning card. Le DELETE reste réservé à
  admin/master (traçabilité d'audit).

## 3. Fichiers livrés

```
app/scan/actions.ts   # getActiveSession, lookupBarcode, submitCount
app/scan/page.tsx     # scanner caméra + warning card + formulaire
```

## 4. À ajouter dans `app/layout.tsx` (pas livré ici, pour ne pas
   écraser votre fichier existant)

```ts
import type { Viewport } from "next";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};
```

Et dans `globals.css`, pour empêcher le rebond de scroll pendant le
scan (en plus des classes `overscroll-none touch-none` déjà posées
sur `<main>` dans `app/scan/page.tsx`) :

```css
html, body {
  overscroll-behavior: none;
}
```

## 5. Comportement couvert

- Caméra limitée à un viewfinder 220×220 (`qrbox`), réticule vert
  pulsant superposé en CSS.
- Vibration 100ms au décodage (`navigator.vibrate`).
- Doublon détecté **scoped à la session active uniquement** (pas tout
  l'historique du produit) : deux inventaires différents sur le même
  article ne se mélangent pas.
- Warning card : quantité/emplacement/auditeur/heure précédents +
  choix explicite "تعديل" (mode update, réservé à sa propre ligne) ou
  "سطر جديد" (mode create, pour un lot physique séparé).
- `product_id` est résolu et transmis à chaque log (nécessaire pour le
  calcul de l'Écart par produit et pour le futur snapshot de session).
- `tenant_id` et le nom de l'auditeur sont dérivés côté serveur (JWT +
  table `app_users`), jamais envoyés par le client.

## 6. Ce qui reste à faire manuellement

- Appeler un verrouillage de session (`locked_at` + remplissage de
  `inventory_session_snapshots`) quand l'admin démarre officiellement
  l'inventaire — pas encore câblé, prévu pour l'étape 4 (dashboard).
- Gérer le cas "pas de caméra / permission refusée" avec un message
  plus actionnable (lien vers les réglages du navigateur).
- `html5-qrcode` n'est plus activement maintenu : ça fonctionne, mais
  à surveiller si vous migrez un jour vers `BarcodeDetector` natif.
