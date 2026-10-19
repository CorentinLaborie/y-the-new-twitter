# Rapport d'audit — Projet Y

| | |
|---|---|
| **Date** | 2026-10-16 |
| **Périmètre** | Documentation du dépôt : `docs/` (documentation produit et web, schéma de base de données, index) et `design/` (notes de design et `next-steps.md`) |
| **Hors périmètre** | Notion (ignoré, comme demandé). Aucun code : le dépôt ne contient que de la documentation. |
| **Méthode** | Six relectures indépendantes, une par domaine. Chaque constat cite un fichier et une section. |
| **Nature** | Revue de conception. Les points juridiques sont des pistes à faire valider par un juriste, pas des avis. |

> **Snapshot of 2026-10-16, made before the decisions.** Where the decision journal (`docs/decisions/journal-decisions.md`) says otherwise, the journal wins. For example: account deletion is a 90-day window (DEC-024, not immediate anonymisation), and VerifAge is the chosen provider (DEC-019).
>
> **Stack change, same day:** the backend is now NestJS and the database is PostgreSQL (DEC-069, DEC-070). Findings below that name Spring Boot, Java, Flyway, MySQL, Bucket4j, JUnit, MockMvc or GreenMail describe the earlier stack. The journal entries DEC-069 to DEC-074 replace them.

---

## 1. Synthèse

### 1.1 Ce qui est solide

- **Principes techniques bien posés :** mots de passe et codes hachés, codes avec expiration et compteur d'essais, cookie de session `HttpOnly` / `Secure` / `SameSite`, CSRF, CORS restreint, erreurs au format RFC 9457.
- **Règles produit appliquées partout :** 280 caractères, seuil de 50 Y en configuration, hashtags seuls pour regrouper les questions (pas de catégories), suppression logique, compteurs mis à jour dans la même transaction.
- **Schéma complet :** les 20 tables annoncées sont dans `docs/database/y-database.dbml` (412 lignes), et les énumérations correspondent.
- **Idempotence des réactions** (PUT / DELETE) et pagination par curseur sur la plupart des listes.
- **Parité des écrans** prévue sur les trois tailles (Desktop, Tablet, Mobile), avec des tokens de couleur communs entre la documentation et les maquettes.

### 1.2 Les points bloquants avant de coder

Ces constats touchent le schéma, le parcours d'inscription ou le périmètre. Les corriger après le démarrage coûte cher.

| # | Constat | Domaine | Pourquoi c'est bloquant |
|---|---|---|---|
| B1 | **Vérification d'âge (18+) absente du parcours d'inscription.** R7 l'exige, mais `POST /age-verification` est « TO DESIGN » et la décision n'a pas d'autorité claire. | Produit, API, Sécurité | Obligation légale, et le parcours d'inscription doit en tenir compte dès M1. |
| B2 | **Aucun rôle modérateur** : ni dans `users`, ni dans `reports`. La fonction « signalements visibles aux modérateurs » (M7) ne peut pas être construite. | BDD, Sécurité | Changement de schéma à faire dans V1. |
| B3 | **Sessions absentes du schéma.** Spring Session JDBC est prévu, mais aucune table n'est dans V1 : la connexion échouerait sur une base neuve. | BDD | Bloque le premier test de connexion. |
| B4 | **Aucune règle pour une question qui n'atteint jamais 50 Y** : durée de vie, visibilité, tendances. | Produit | Définit le cycle de vie de la donnée et l'index. |
| B5 | **Aucune règle anti-abus sur les Y.** 50 Y ouvrent une conversation, donc des comptes factices peuvent la forcer. Pas de limite d'inscription, ni de condition d'ancienneté. | Produit, Sécurité | Touche la règle centrale du produit. |
| B6 | **Périmètre contradictoire :** `docs/y-product-and-web-documentation.md` (§1.4, §3.1) liste des fonctions que `next-steps.md` ne retient pas (suggestions de recherche, carte « question partagée », demandes de message, état « Abonné »). R5 interdit d'en abandonner. | Produit, Frontend | Il faut une seule source du périmètre v1. |
| B7 | **Onglet « Abonnements » en M2**, alors que les abonnements (`follows`) arrivent en M4. | Roadmap | Dépendance non respectée dans l'ordre des jalons. |
| B8 | **Sujets légaux absents :** mentions légales, conditions d'utilisation, politique de confidentialité, consentement aux cookies, droit d'accès et d'effacement, export des données. Suppression de compte non tranchée (D11). | Sécurité | Obligations RGPD et LCEN, à vérifier par un juriste avant toute donnée réelle. |

---

## 2. Constats par domaine

Les niveaux de sévérité sont : **Critique** (bloque la conception ou la conformité), **Important** (à traiter avant le jalon concerné), **Mineur** (qualité ou cohérence).

### 2.1 Produit et règles métier

**Critique**
- **Périmètre v1 contradictoire** entre la documentation (§1.4, §3.1) et `next-steps.md` (l. 17-20). Reco : réintégrer les éléments, ou les déclarer hors v1 dans §1.4 et amender R5.
- **Devenir d'une question sous 50 Y non défini** (R3, §3.2). Reco : définir un statut « en attente » et son cycle de vie.
- **Règles de réaction incomplètes :** retrait d'un Y après ouverture (l'endpoint DELETE existe), auto-Y, comptes multiples, débit. `next-steps.md` (l. 37) cite une règle « une question par jour » qui n'existe nulle part dans la doc. Reco : écrire les règles, et trancher la limite de posts ou retirer la carte.
- **VerifAge :** R7 demande une étape d'âge, §3.2 n'en a aucune. §13 fait de VerifAge la source de la décision, alors que la date de naissance est saisie à l'inscription (§3.1). Le sort d'un compte refusé n'est pas défini. Reco : ajouter l'étape à §3.2 et trancher l'autorité de la décision avant M1.

**Important**
- **« Pour vous » n'est défini nulle part** (§3.1, §9.2). R4 (« triées par hashtags uniquement ») contredit le tri de « Questions populaires » et de « Pour vous ». Reco : définir le tri de chaque liste.
- **Absence de page détail justifiée par R6**, alors que R6 invite à imiter X, qui a une page de publication. « Copier le lien » est approuvé en ★ alors que §3.1 et D4 le marquent TO CONFIRM. Reco : reformuler R6 et clore D4 avant de construire le partage.
- **Options de conversation et réglages de notifications approuvés en ★** (`next-steps.md` l. 19-20), alors que D5 et D7 sont ouverts et que §9.2 définit déjà ces endpoints. Reco : clore D5 et D7 dans §19.
- **Landing : « mêmes états que le feed »** (§11.1, `next-steps.md` l. 31) n'a pas de sens pour un visiteur, qui ne peut ni suivre ni réagir. Reco : définir l'état visiteur.
- **Blocage et sourdine :** « hors v1 » en §1.4, mais D12 reste ouvert, et les maquettes proposent « Bloquer », « Sourdine », « Masquer » (`review-results.md`). Reco : trancher D12 et documenter la mitigation.
- **Modération réduite à un signalement :** pas de rôle modérateur, pas d'action, pas de recours, motifs TO CONFIRM. Reco : définir un modérateur minimal et les actions v1.
- **Suppression de sa propre question ou réponse** existe dans l'API mais n'est dans aucune fonctionnalité de §3.1 ni dans le menu « ⋯ ». Reco : l'ajouter.
- **Hashtag non défini** (longueur, casse, question sans hashtag). Mentions : qui est mentionnable ? Reco : définir ces règles dans §2.

**Mineur**
- R10 : « récent » sans seuil.
- R8 interdit les statistiques inventées, mais les maquettes en contiennent (`next-steps.md` l. 37). Distinguer données de démonstration et copie produit.
- R9 : préciser si `prefers-color-scheme` est ignoré.
- §3.1 : « Phone optional » présuppose la réponse à D2.
- §3.1 : « Effacer tous » (Signets) sans confirmation, contrairement à la déconnexion.
- §3.2 : le compte `pending_verification` n'a pas d'expiration.
- `next-steps.md` l. 16 : « Modifier e-mail » sur l'écran de code, absent de §3.2.

### 2.2 Base de données

Le fichier `docs/database/y-database.dbml` existe et correspond à la documentation (20 tables, énumérations identiques).

**Critique**
- **Sessions absentes** de V1 (voir B3). Reco : ajouter les tables Spring Session JDBC dans V1, et les documenter. Noms par défaut à vérifier selon la version utilisée.

**Important**
- **Rôle modérateur absent** (voir B2). Reco : `users.role` (user, moderator, admin), `reports.reviewed_by_id` vers `users`, index `(status, created_at)` pour la file de modération.
- **Limite des échecs de connexion non modélisée.** Seul `attempts` existe, et il porte sur les codes. Reco : décider entre un rate limiter en mémoire et `users.failed_login_count` avec `locked_until`. Un limiteur en mémoire perd son état au redémarrage.
- **Contraintes décrites mais absentes du DBML.** `follower_id <> followee_id` et « exactement un de question_id ou reply_id » ne sont pas dans le fichier, qui ne contient aucun `CHECK`. La doc dit « not both », ce qui n'est pas la même règle. Reco : écrire les CHECK dans V1 et aligner la doc.
- **Un seul type de réaction par utilisateur et question non garanti.** La clé `(user_id, question_id, kind)` permet like, dislike et y à la fois. Dépend de D1. Reco : si exclusif, clé `(user_id, question_id)`, et un PUT qui change de type met à jour les deux compteurs dans la même transaction.
- **Index du fil de notifications inadapté :** `(recipient_id, read_at, created_at)` empêche le tri par `created_at` avec curseur. Reco : `(recipient_id, created_at, id)`, et garder `(recipient_id, read_at)` pour le badge.
- **Index de la messagerie insuffisants** pour le tri par `last_message_at` et le filtre sur `request_status` et `archived_at`. Reco : index sur `conversation_participants (user_id, request_status, archived_at)` et sur `conversations (last_message_at)`.
- **Tendances sans index temporel global** : `(hashtag_id, created_at)` ne sert pas à un filtre global sur `created_at`. Reco : index `question_hashtags (created_at, hashtag_id)`, et filtrer les questions supprimées.
- **Recherche non indexée** : FULLTEXT repoussé « add later », aucun index sur `users.display_name`. Reco : décider maintenant, pour V1.
- **Demande de message sans initiateur :** `request_status` vaut `accepted` sur les deux lignes, donc accepter ou refuser ne peut pas savoir quelle ligne est en attente. Reco : colonne `initiated_by_id`, ou statut `pending` sur la seule ligne du destinataire.
- **Suppression de compte non tranchée** (D11) : aucun `ON DELETE` dans le DBML, alors que questions, réponses et abonnements référencent `users`.

**Mineur**
- Conversation 1-à-1 : aucune unicité sur la paire de participants (doublons possibles).
- Unicité du `handle` : collation non déclarée, et la règle « lowercase » n'est pas imposée. Reco : déclarer `utf8mb4` et la collation, et garder un seul mécanisme d'unicité.
- Convention contredite : « limits are enforced by the database », alors que `messages.body` n'a pas de limite.
- R3 (réponses après 50 Y) et R7 (âge) ne sont appliquées que par l'application. À documenter, ou à garder par une contrainte explicite.
- Compteurs : pas de `CHECK (x >= 0)`. `reply_count` doit baisser au soft delete. Les questions supprimées restent comptées dans les tendances.
- « Historique » cité en doc (l. 254) sans table correspondante.

### 2.3 Architecture, API et backend

**Critique**
- **Vérification d'âge** : voir B1. `POST /age-verification` est « TO DESIGN », et aucun statut de compte ne bloque publication ou réponse. Reco : un statut d'âge, un endpoint de statut ou un callback signé, et un 403 pour les comptes non vérifiés.
- **Aucune limite de débit sur les endpoints sensibles** : login, `signup/verify`, `password-reset/confirm`, `email-change/confirm`. §13 ne donne aucun seuil ni en-tête `Retry-After`. Reco : tableau des seuils par endpoint dans §9.2.

**Important**
- **Pagination incomplète :** pas de curseur sur `GET /conversations`, `GET /search`, `GET /questions/popular`, `GET /hashtags/trending`, `GET /users/suggestions`. `limit` n'a ni défaut ni maximum. Reco : `cursor` et `limit` (maximum 50), et enveloppe de page définie dans §9.1.
- **Documentation de l'API incomplète :** une seule réponse exemple, pas de schéma de réponse, pas de codes 201 ou 204. §11.2 et §14 supposent un OpenAPI versionné, mais §7 le traite comme optionnel. Reco : committer un `openapi.yaml` généré.
- **Édition du profil incluant l'e-mail** (§3.1) alors que `PATCH /users/me` ne le prend pas (§3.2 passe par `email-change`). Reco : écrire cette exception dans §9.2.
- **Fonctions sans endpoint :** « Effacer tous » (Signets), liste des demandes de message, accusé « Vu » pour l'expéditeur, suppression de compte, endpoint modérateur, liste des questions d'un profil.
- **Seuil de 50 Y absent des réponses JSON.** Le front risque de coder 50 en dur. Reco : ajouter `yThreshold` et `conversationOpen` aux payloads de question et de réaction.
- **Idempotence des créations :** pas d'en-tête `Idempotency-Key` sur les POST de création, alors que §9.1 justifie l'idempotence par le double-clic. `POST /conversations/{id}/read` devrait être un PUT.
- **Sécurité des identifiants :** un mauvais mot de passe renvoie 401 (« non connecté »). Un e-mail déjà pris renvoie 409 et révèle l'existence d'un compte. `PUT /users/me/password` n'exige pas le mot de passe actuel.
- **Cookie de session côté rendu serveur :** méthode non définie. Reco : rewrite Next.js vers `/api/v1` (même origine).
- **Actuator et Swagger** : aucune règle d'exposition en production. Reco : en prod, seul `/actuator/health`, et Swagger désactivé.
- **`GET /questions/{id}` présenté comme lien partagé** alors que D4 est ouvert. `viewerReactions` (tableau) suppose des réactions indépendantes alors que D1 est ouvert.

**Mineur**
- Collisions de chemins : `/users/me` et `/users/suggestions` avec `/users/{handle}` ; handles réservés à prévoir.
- Casse incohérente : JSON en camelCase, mais `last_message_at` en snake_case.
- `/feed`, `/search`, `/age-verification` et `/auth/*` dérogent à la règle des noms pluriels, sans liste d'exceptions.
- jOOQ (M4) n'a pas de place définie, alors que §8.2 dit que les repositories sont le seul endroit des requêtes.
- Pas de politique de versionnage au-delà de `/api/v1`. Reco : un changement cassant crée une v2, avec `Deprecation` et `Sunset`.

### 2.4 Frontend, design et accessibilité

**Critique**
- **Éléments de la barre latérale Desktop absents sur Tablet, Mobile et Explore** : Suggestions, et l'explication des 50 Y. §3.1 les place dans Explore, et R5 interdit de les perdre. Le fichier `review-views-brief.md` dit « absente par design », ce qui contredit §11.3. Reco : table barre latérale → emplacement sur Tablet et Mobile.
- **Routes et écrans manquants** dans §11.1 : `/settings/email`, followers et following, `/forgot-password`, `/hashtags/[name]`, `/messages/new`, `/settings/password`, réglages de notifications (l'engrenage existe, sa destination non), suppression de compte. Reco : les ajouter, ou les marquer hors v1.

**Important**
- **Éléments de §3.1 absents des maquettes :** « 49/50 » n'apparaît sur aucun écran ; le compteur de 280 caractères de la composer est absent. Reco : définir ces composants dans §12.2.
- **Couleurs hors tokens :** `#e2e8f0` (très utilisé), `#f3f4f6`, `#4338ca`, `#4f46e5`, `#dc2626`, `#374151`, `#c7d2fe` ne sont pas dans §12.1. Seule `#d1d5db` est documentée pour les bordures.
- **Contrastes sous WCAG AA** (calculés par la relecture, à vérifier) :
  - blanc sur `#6366f1` : 4,47:1 (texte de 14 px, seuil 4,5:1) ;
  - `#6366f1` sur `#f8fafc` : 4,27:1 (hashtags) ;
  - `#ef4444` sur blanc : 3,76:1 (erreurs, couleur imposée par §12.1) ;
  - bordure de champ `#d1d5db` : 1,47:1 (critère 1.4.11, seuil 3:1).
  - Reco : texte et boutons en `#4f46e5` (environ 6,3:1), erreurs en `#dc2626` (environ 4,8:1), bordures de champ d'au moins 3:1.
- **Accessibilité incomplète (§11.4) :** la réaction active ne change que le fond, sans forme ni libellé. Manquent : retour du focus à la fermeture des modales et du menu mobile, touche Échap, cible minimale (`.y-follow` fait 22 px, WCAG 2.5.8), reflow à 320 px, réduction des animations.
- **Pas de seuils de breakpoints** (§11.3). La mise en page à 3 colonnes (275 + 600 + 350 px, plus marges) ne tient pas entre 768 et 1439 px, par exemple en tablette paysage à 1024 px. Reco : trois seuils chiffrés et le comportement entre 1024 et 1279 px.
- **États manquants (§12) :** aucun chargement (pas de skeleton), aucune erreur réseau, 404 ou session expirée, aucun écran vide (Signets, Abonnements, recherche sans résultat). L'état « 0 réponse » n'est pas défini.
- **Bibliothèque de composants incomplète** (`next-steps.md`, étape 5) : pas de section Landing ni Auth, TextField et Checkbox jamais validés. Button n'a pas de prop `href`, d'où un risque de liens-boutons (§11.4).

**Mineur**
- `tokens.json` contient des valeurs sombres, alors que R9 impose le thème clair.
- Tailles en 10 px (`.y-follow`, tags), alors que `fix-brief.md` fixe 11 px. Espacements hors échelle (20, 14, 10, 6 px).
- Le design system est en classes `y-*` avec variables CSS, mais les maquettes utilisent du hexadécimal littéral. Voir D10.

### 2.5 Sécurité, confidentialité et conformité

Les points juridiques sont des pistes à faire vérifier par un juriste. Ils ne constituent pas un avis juridique.

**Critique**
- **Vérification d'âge** : voir B1. À vérifier par un juriste : exigences de vérification d'âge pour ce service.
- **Aucune procédure pour les droits des personnes :** pas d'export de données, suppression de compte « TO CONFIRM ». À vérifier par un juriste : accès, effacement, portabilité et délais (RGPD art. 12, 15, 17, 20).
- **Textes légaux absents :** aucune route pour mentions légales, CGU ou politique de confidentialité. Seule l'acceptation des « conditions » est stockée, sans version. À vérifier par un juriste : mentions légales (LCEN), information à la collecte (RGPD art. 13).

**Important**
- **Modération sans traçabilité** : pas d'auteur ni de décision dans `reports`, pas de rôle. À vérifier par un juriste : obligations du règlement DSA (motivation des décisions, réclamations).
- **Signalements incomplets et abusables :** seuls questions et réponses sont signalables, pas les messages, profils ni mentions. Pas de contrainte d'unicité ni de plafond. Reco : étendre les cibles, ajouter « contenu illicite » à la liste fixe (D6), contrainte unique par auteur et cible.
- **Codes contournables par renvoi :** chaque renvoi crée une ligne, et les anciens codes restent valides avec leur compteur. Reco : maximum d'essais (par exemple 5), invalidation des codes précédents à chaque renvoi, plafond par compte et par IP.
- **Énumération de comptes** : messages d'erreur à l'inscription et à la réinitialisation qui révèlent l'existence d'un compte. Reco : réponses génériques, limitation par IP.
- **Changements sensibles sans ré-authentification :** ni mot de passe actuel, ni avis à l'ancienne adresse, ni invalidation des sessions. Une session volée suffit à changer l'e-mail puis le mot de passe. À aligner sur les recommandations de la CNIL (longueur minimale), à vérifier.
- **Comptes non confirmés sans durée de vie :** un tiers peut réserver e-mail, identifiant ou téléphone d'autrui. Le téléphone non vérifié peut servir à se connecter (§3.1). Reco : purge après délai fixé, vérification du téléphone s'il sert à la connexion.
- **Vérification d'âge ambiguë :** rien ne dit si un compte `pending` peut publier, réagir ou écrire. Reco : règle de blocage par statut, vérification de la signature du retour, stockage du seul résultat.
- **Aucune durée de conservation** : codes (dont `new_email` en clair), vérifications d'âge, notifications, signalements, contenus supprimés, comptes non confirmés, logs avec adresses IP, sauvegardes (« au moins 14 jours », sans maximum). Reco : tableau de rétention par donnée. À vérifier par un juriste : limitation de conservation (RGPD art. 5).
- **Staging et données réelles :** la restauration mensuelle se fait « sur staging », alors que §15.1 réserve staging à une copie anonymisée. La procédure d'anonymisation n'existe pas.
- **Sous-traitants non nommés :** fournisseur d'e-mail, hébergeur (D13), base managée et supervision. À vérifier par un juriste : contrats et transferts hors UE, registre, éventuelle analyse d'impact.
- **Procédure d'incident absente.** À vérifier par un juriste : notification à la CNIL sous 72 heures (RGPD art. 33).
- **Abus de masse :** pas d'anti-bot à l'inscription, aucune limite sur `/auth/signup`, `/resend` ou `password-reset/request`. Le seuil de 50 Y s'atteint avec des comptes factices. Reco : limites par IP et par compte, réactions réservées aux comptes `active`, quotas.

**Mineur**
- Swagger et `/actuator` à protéger en production. Ni CSP ni HSTS.
- `avatar_url` alors que les images sont hors v1 : une URL externe expose l'adresse IP.
- Cookies : seuls `SESSION` et `XSRF-TOKEN` sont décrits. À vérifier par un juriste : exemption des cookies strictement nécessaires.
- Aucun test de sécurité prévu (§14). Reco : les intégrer dans la définition de « terminé ».

### 2.6 Roadmap, tests et décisions

**Critique**
- **Onglet « Abonnements » en M2** (voir B7). Reco : avancer `follows` en M2, ou déplacer l'onglet en M4.
- **Vérification d'âge** (voir B1). Reco : ajouter l'étape à §3.2 et trancher le mode (redirection ou callback) avant M1.

**Important**
- **Ordre des jalons :** M3 émet « conversation ouverte » et les mentions, alors que les notifications sont en M5. « Signaler » (menu « ⋯ », M2) dépend de M7. Signets et hashtags (M4) sont utilisés dès M2. Reco : tableau de dépendances par jalon.
- **Définition de « terminé » (§14) non reprise dans les critères de sortie** : accessibilité, OpenAPI et trois tailles n'apparaissent dans aucun jalon sauf M4. Reco : ajouter la définition à chaque jalon.
- **Stratégie de tests incomplète :** pas de capture des e-mails en test, pas de test de sécurité (SAST, DAST), « Load test » en M8 sans cible chiffrée. Le test visuel et l'OpenAPI diff n'ont pas d'outil nommé. Reco : nommer les outils et les seuils (par exemple p95 chiffré).
- **Staging, sauvegardes, alertes et test de restauration** n'ont aucun jalon avant M8. Le rollback par image précédente ignore que Flyway est sans retour arrière (§10), et D9 est ouvert. Reco : jalon dédié et plan de rollback de la base.
- **Fonctions sans endpoint ni route :** suppression de compte (M7, D11), « Effacer tous », Aide et À propos. Le regroupement des notifications n'est pas défini.
- **Décisions déjà approuvées en ★ mais ouvertes dans §19** : D5 et D7 (voir section 2.1).
- **Versions à épingler et sourcer avant M0 :** Java 25 (« mises à jour gratuites jusqu'à septembre 2028 » non sourcé), Spring Boot 4.1.x, Next.js 16, MySQL 8.4 (marqués « à vérifier »), Vitest et Playwright (« Current », donc non épinglés). Version de Node absente de §7.

**Mineur**
- Le mot « conversation » désigne à la fois le fil de réponses (§20) et la messagerie (`/conversations`). Reco : renommer le premier « fil de réponses ».
- `design/` est prévu en §6, alors que le dépôt contient `designs/`. `docs/README.md` n'indexe pas `design/`.
- Critères de §18 non mesurables (« rate limiting active », « compteurs corrects », « findings closed » sans sévérité).

---

## 3. Décisions à prendre

Le document n'a pas de dates calendaires : les dates limites sont donc relatives aux jalons.

| Décision | Sujet | Jalon bloqué | Date limite recommandée |
|---|---|---|---|
| **D1** | Like et dislike sur la même question : exclusifs ou indépendants ? | M0 (schéma), M2 | Avant le gel de V1 (début de M0) |
| **D2** | Téléphone obligatoire à l'inscription ? | M0 (`users.phone`), M1 | Avant M0 |
| **D3** | Longueurs maximales : bio, réponses, messages | M0, M3, M4, M6 | Avant M0 |
| **D4** | Lien partagé d'une question, sans page détail | M2 (menu « ⋯ », `GET /questions/{id}`) | Avant M2 |
| **D5** | Sourdine et archivage de conversation : v1 ou plus tard | M0 (`conversation_participants`), M6 | Avant M0 |
| **D6** | Motifs de signalement : liste fixe ou texte libre | M0 (`reports.reason`), M7 | Avant M0, sinon V2 |
| **D7** | Préférences de notification : par type ou par canal | M0, M5 | Avant M0 |
| **D8** | Durée de vie des codes | M1 | Avant M1 |
| **D9** | Migrations au démarrage ou en étape séparée | M0 (Docker), staging | Avant M0 |
| **D10** | Style : CSS Modules ou Tailwind CSS | M0 (frontend) | Avant M0 |
| **D11** | Suppression de compte : anonymisation ou effacement | M0 (schéma), M7 | Avant M0 |
| **D12** | Blocage et sourdine : v1 ou non | M0 (schéma), M7 | Avant M0 |
| **D13** | Hébergeur | M1 (cookie, CORS, e-mail), staging | Avant M1 |

### Nouvelles questions (hors §19)

1. **VerifAge :** parcours, placement dans l'inscription, et sort d'un compte refusé (avant M1).
2. **Fournisseur d'e-mail** (`SPRING_MAIL_*`) : aucun choix documenté (avant M1).
3. **Connexion par téléphone** sans canal SMS défini (avant M1).
4. **Algorithme de « Pour vous »** et tri des « meilleures réponses » (avant M2).
5. **Temps réel** pour les badges, les notifications et « Vu » : polling ou push (avant M5).
6. **Rôle et back-office modérateur** (avant M7).
7. **Cibles de charge et de sécurité**, et outils de test (avant M0).
8. **Une conversation reste-t-elle ouverte si les Y retombent sous 50 ?**
9. **Ancienneté requise** pour compter dans les 50 Y ; réaction à ses propres questions.
10. **Fenêtre temporelle** de `/hashtags/trending`.

---

## 4. Plan d'action recommandé

L'ordre suit les dépendances : d'abord ce qui conditionne le schéma et le périmètre, puis le reste.

**Étape 1 : trancher le périmètre et les règles centrales**
- Source unique du périmètre v1 (B6).
- Cycle de vie d'une question sous 50 Y (B4).
- Règles de réaction et anti-abus (B5).
- Décisions D1, D4, D5, D7, D11, D12.

**Étape 2 : corriger le schéma et les parcours avant M0**
- Sessions, rôle modérateur, contraintes `CHECK`, index de notifications, messagerie et tendances (B2, B3).
- Initiateur d'une demande de message, et clés de réaction.
- Recherche : FULLTEXT ou restriction, à décider avant V1.

**Étape 3 : cadrer la conformité avant toute donnée réelle**
- Faire valider les points juridiques signalés par un juriste (B8, section 2.5).
- Tableau de durées de conservation, registre des sous-traitants, procédure d'incident.
- Choix de l'hébergeur (D13) et du fournisseur d'e-mail.

**Étape 4 : compléter les parcours et les écrans**
- Étape de vérification d'âge dans §3.2 et statut de compte (B1).
- Routes et écrans manquants (section 2.4), états vides et d'erreur, seuils de breakpoints.
- Contrastes des couleurs et tokens unifiés (section 2.4).

**Étape 5 : compléter le contrat d'API et la roadmap**
- Pagination, seuils de débit par endpoint, `openapi.yaml`, seuil de 50 Y dans les payloads.
- Jalons : dépendances, définition de « terminé » dans chaque jalon, outils de test nommés.
- Jalon dédié aux staging, sauvegardes et rollback de base.
- Épingler les versions de la stack avant M0.

---

## 5. Limites de cet audit

- **Revue de documentation uniquement.** Le dépôt ne contient pas de code. Les constats portent sur la conception, pas sur l'implémentation.
- **Valeurs calculées par les relecteurs.** Les contrastes et les versions de logiciels sont à vérifier avec un outil dédié et sur les sources officielles.
- **Pas d'avis juridique.** Les points marqués « à vérifier par un juriste » doivent être validés par un professionnel avant mise en production.
- **Les maquettes n'ont pas été revues visuellement.** Les constats frontend viennent des notes, des briefs et des fichiers de tokens du dépôt.
- **Notion n'a pas été utilisé**, comme demandé.
