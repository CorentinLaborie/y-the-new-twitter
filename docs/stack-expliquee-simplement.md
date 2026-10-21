# Les outils de Y, expliqués simplement

Imagine que Y est un **grand restaurant**. Les gens peuvent poser des questions, répondre, et s'envoyer des messages. Pour que tout fonctionne, il faut plusieurs personnes qui travaillent ensemble. Chaque outil de ce document correspond à une de ces personnes.

---

## 1. La salle de restaurant : le frontend

Le **frontend**, c'est tout ce que tu vois sur l'écran : les boutons, les questions, les photos de profil, le menu à gauche.

C'est la **salle du restaurant**. Elle doit être belle et facile à utiliser, sur un ordinateur, une tablette ou un téléphone.

- **Next.js** est le plan de la salle. Il aide à préparer les pages avant qu'elles arrivent chez toi, pour qu'elles s'affichent vite.
- **TypeScript** est une façon d'écrire le JavaScript en étant très clair sur ce qu'on attend. C'est comme une étiquette qui dit : « ici, il ne doit y avoir que des nombres ». Ça évite beaucoup d'erreurs.

Tu connais déjà ces outils, donc cette partie ne va pas te surprendre.

---

## 2. La cuisine : le backend

Le **backend**, c'est ce qui se passe **derrière** l'écran. Quand tu cliques sur « Poster », la cuisine reçoit la commande, vérifie qu'elle est correcte, puis la range.

C'est la **cuisine**. Personne ne la voit, mais sans elle, rien n'est servi.

La cuisine parle **TypeScript**, la même langue que la salle. Elle tourne grâce à **Node.js**, le moteur qui fait fonctionner le JavaScript en dehors du navigateur.

- **NestJS** est l'organisation de la cuisine. Chaque poste (connexion, questions, messages, notifications) a son chef, ses règles et son matériel, et tout est rangé de la même façon. Les nouveaux cuisiniers s'y retrouvent vite.
- **express-session** est le videur à l'entrée. Il donne un bracelet (le cookie) à chaque personne connectée, vérifie le bracelet à chaque visite et tient la liste des personnes entrées (les sessions).

---

## 3. Le cahier de recettes : la base de données

La **base de données** garde tout ce qui doit être **retenu** : les comptes, les questions, les réponses, les abonnements, les messages.

C'est le **grand cahier** du restaurant, ou plutôt une armoire remplie de fiches bien rangées. Chaque information a sa place.

- **PostgreSQL** est l'armoire elle-même. C'est une armoire solide, très utilisée, qui sait ranger les dates, les identifiants et les listes sans se tromper.
- **Prisma** est le classeur intelligent qui fait le lien entre la cuisine et l'armoire. Il connaît la forme de chaque fiche, si bien que la cuisine ne peut pas ranger une date là où il faut un nombre.
- **Prisma Migrate** est le **journal des modifications** du cahier. Chaque fois qu'on ajoute une nouvelle case (par exemple une colonne « date de naissance »), on écrit une petite note numérotée par date. Ainsi, tout le monde a exactement le même cahier, sur son ordinateur comme sur le serveur.

---

## 4. Le plan de la cuisine : npm

Dans la cuisine, il y a une liste de tout le matériel à acheter et à installer. **npm** fait exactement ça : il note quelles bibliothèques utiliser, avec le numéro de version de chacune, et il les télécharge automatiquement.

C'est comme la liste de courses du restaurant, avec la version exacte de chaque ingrédient. La même liste est utilisée sur tous les ordinateurs, pour que la cuisine soit identique partout.

---

## 5. Le contrôle qualité : les tests

Avant de servir un plat, le chef le goûte. Les **tests** font la même chose avec le code.

- **Jest** est le goûteur officiel : il vérifie que chaque petite partie du code fait ce qu'elle doit faire.
- **Supertest** joue le client : il passe des commandes au guichet (l'API) et vérifie les réponses, comme le ferait un vrai utilisateur.
- **Testcontainers** installe une vraie base de données le temps du test, puis la supprime. C'est comme cuisiner dans une petite cuisine de test, séparée de la vraie.

---

## 6. Le bon de commande : les appels entre le frontend et le backend

Quand tu cliques sur un bouton, la salle envoie un **bon de commande** à la cuisine. Ce bon est écrit dans un format commun appelé **JSON**, que tout le monde comprend, et la salle comme la cuisine parlent TypeScript.

Ces bons passent par une **API** : c'est le guichet entre la salle et la cuisine. Le guichet est décrit dans un document unique, généré automatiquement à partir du code. La salle peut ainsi savoir exactement quelles commandes elle peut passer.

---

## 7. Le facteur : l'envoi d'e-mails

Quand tu t'inscris, Y t'envoie un **code à 6 chiffres** par e-mail. C'est un facteur qui livre le message.

Le projet utilise **Brevo**, un service d'envoi d'e-mails, avec son outil officiel pour le programmer. Pendant les tests, un faux facteur note les lettres sans jamais les envoyer, pour que personne ne reçoive de vrais messages par erreur.

---

## 8. La vérification de l'âge

Y est réservé aux adultes. À l'inscription, la personne indique sa date de naissance. Y refuse l'inscription si elle n'a pas 18 ans. Y ne demande aucune pièce d'identité.

---

## 9. La boîte de transport : Docker

Le projet est rangé dans une **boîte** appelée **Docker** (un conteneur). Dans cette boîte, il y a tout ce qu'il faut pour que le restaurant marche : la cuisine, la salle et l'armoire.

L'avantage : le restaurant fonctionne de la même façon sur ton ordinateur et sur le serveur. Plus de « chez moi ça marche, mais chez toi non ».

---

## 10. Le petit bonus : les messages en direct

Plus tard, quand une réponse arrive ou qu'un message est envoyé, le serveur peut **crier** la nouvelle à la salle, sans attendre qu'on lui demande. Ça s'appelle **Server-Sent Events**. Pour commencer, on peut simplement demander toutes les quelques secondes : « Il y a quelque chose de nouveau ? ».

---

## En résumé

| Outil | Métaphore du restaurant | Rôle dans Y |
|---|---|---|
| Next.js + TypeScript | La salle | Ce que l'utilisateur voit |
| Node.js + NestJS (TypeScript) | La cuisine | La logique de l'application |
| express-session | Le videur | Connexion et sessions |
| PostgreSQL | L'armoire à fiches | Stocke toutes les données |
| Prisma | Le classeur qui connaît chaque fiche | Lit et écrit dans l'armoire, avec des types vérifiés |
| Prisma Migrate | Le journal des modifications | Fait évoluer la base proprement |
| npm | La liste de courses | Installe les bibliothèques |
| Jest, Supertest, Testcontainers | Le contrôle qualité | Vérifie que le code marche |
| Brevo | Le facteur | Envoie les e-mails (codes, alertes) |
| Date de naissance | La vérification de l'âge | Confirme que l'utilisateur a 18 ans ou plus |
| Docker | La boîte de transport | Fait fonctionner partout la même chose |

**Le plus important à retenir :** la salle (frontend) et la cuisine (backend) se parlent par des bons de commande (l'API). La cuisine range tout dans l'armoire (la base de données). Chaque outil a un seul travail, et c'est ce qui rend l'ensemble facile à faire grandir.
