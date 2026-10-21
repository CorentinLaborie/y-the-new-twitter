# Tests end-to-end sous Windows

Le script `scripts/run-e2e.ps1` lance les tests end-to-end de Y en deux etapes, sous Windows PowerShell 5.1.

- **Etape 1 : tests mockes.** Tous les `frontend/e2e/*.spec.ts` sauf `real-api.spec.ts`, sur les projets desktop, tablet et mobile, avec Google Chrome installe (aucun navigateur n'est telecharge).
- **Etape 2 : tests contre la vraie API.** `real-api.spec.ts` : le backend est compile, lance sur le port 8080 avec la base de test `y_e2e`, puis arrete.

## Lancer

```powershell
powershell -ExecutionPolicy Bypass -File scripts\run-e2e.ps1
```

Options :

- `-SkipRealApi` : lance l'etape 1 seulement.
- `-DryRun` : affiche les commandes sans les lancer et n'ecrit aucun fichier.

## Prerequis

- Google Chrome installe (chemins standards verifies).
- Docker Desktop lance, avec le service PostgreSQL du `docker-compose.yml` (port 5434) demarre.
- Node.js et npm dans le PATH, dependances installees dans `frontend/` et `backend/`.
- Fichier `backend/.env` present (copie de `.env.example` avec des valeurs locales).
- Base `y_e2e` preparee une seule fois (le script ne la cree pas et ne la seme pas) :

```powershell
docker compose exec postgres psql -U y -c "CREATE DATABASE y_e2e;"
# dans backend/, avec DATABASE_URL pointant sur y_e2e :
npx prisma migrate deploy
npm run build
node dist/database/seed.js
```

Le seed ecrit pour `demo_alice` le hash de test `seed-placeholder-not-a-password-hash`, qui ne correspond a aucun mot de passe. Si la base est absente, non migree ou non semee, le script s'arrete au debut avec ce rappel.

## Verrou et ports

- Un seul run a la fois. Le verrou est le fichier `%TEMP%\y-e2e.lock`, cree au debut et supprime a la fin (bloc `finally`).
- Si le verrou existe, le script refuse de demarrer. Si aucun run n'est actif (run interrompu brutalement), supprimez ce fichier.
- Le script refuse de demarrer si le port 8080 ou le port 3000 est deja ecoute, et indique le PID du processus qui l'occupe.
- Apres l'etape 2, le script verifie que les ports 8080 et 3000 sont libres.

## Journaux et resultat

Les journaux sont dans `%TEMP%` (`y-e2e-step1-*.log`, `y-e2e-step2-*.log`, `y-e2e-backend-*.log`). Le script affiche le resume (passes, echoues, ignores) de chaque etape et sort avec un code non nul si un test a echoue.
