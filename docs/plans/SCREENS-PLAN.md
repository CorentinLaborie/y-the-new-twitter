# Plan des écrans manquants de Y (brouillon, à valider)

Statut : **brouillon non validé**, aucun code écrit. Rédigé le 2026-10-22 à partir des décisions du propriétaire du même jour (écrans manquants en premier, plan avant code, Abonnements dans le périmètre, Explorer attend M4, boutons ronds gardés ronds).

## Existant (frontend)

- Accueil `(app)/home`, page question `(app)/questions/[id]`.
- Authentification : connexion, inscription, mot de passe oublié, bienvenue.
- Pages légales : confidentialité, conditions, cookies.
- Administration : `admin` (bureau séparé, sur son propre sous-domaine).

## Écrans à construire

Ordre suggéré, par parcours de l'application. Chaque lot est livré seul, avec ses tests, et validé avant commit.

| Lot | Contenu | Remarques |
| --- | --- | --- |
| L0 | Navigation de l'application (barre latérale, barre du bas sur mobile) et vérification des routes existantes | Fonctionnalités identiques sur bureau, tablette et mobile ; on replie dans des menus, on ne supprime rien |
| L1 | Profil (`/[handle]`) et édition du profil | Largeur minimale 325 px |
| L2 | Notifications (`/notifications`) | Compteur non lu dans la navigation |
| L3 | Abonnements : flux des comptes suivis, suivre et ne plus suivre | À vérifier dans le backend avant le plan détaillé |
| L4 | Messages et favoris (`/bookmarks`) | |
| L5 | Paramètres (`/settings`) : compte, confidentialité, mot de passe | |
| L6 | Signalement, blocage (boîtes de dialogue) | Textes à valider |
| L7 | Bandeau de suppression en attente, restauration d'un contenu retiré | Texte de la suspension déjà validé (DEC-230) |

Hors périmètre de ce plan : **Explorer** (attend le jalon M4, décision du 2026-10-22).

## Tests exigés

Chaque nouveau code a un test (règle du propriétaire) : unitaire pour la logique, end-to-end pour chaque écran, et contrôle de la mise en page à 325 px de large.

## Points à vérifier avant la validation

- Routes et points d'accès du backend pour le suivi, les notifications et les favoris (non vérifiés dans ce brouillon).
- Maquettes Claude Design : il faut vérifier quelles planches existent déjà pour chaque écran ; les manquantes sont faites avant le code du lot.
