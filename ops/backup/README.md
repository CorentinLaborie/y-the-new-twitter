# Sauvegardes de la base Y

Deux scripts, à lancer sur le serveur (Linux, `bash`, `openssl`, `pg_dump` et `pg_restore` installés). Ils suivent les étapes 11 et 12 du plan M0.

## Sauvegarder : `backup.sh`

Chaque nuit, un dump PostgreSQL (format custom), chiffré avec AES-256, est écrit dans `BACKUP_DIR`. Les dumps de plus de 14 jours sont supprimés.

Variables à définir :

- `DATABASE_URL` : la base à sauvegarder (compte de lecture suffisant).
- `BACKUP_DIR` : le dossier des dumps chiffrés, sur le serveur, en France.
- `BACKUP_KEY_FILE` : le fichier qui contient la phrase de passe de chiffrement. Il reste sur le serveur, jamais dans Git. Le créer une seule fois, avec des droits de lecture pour le seul utilisateur qui lance la sauvegarde :

  ```bash
  openssl rand -hex 32 > /etc/y/backup.key
  chmod 600 /etc/y/backup.key
  ```

- `RETENTION_DAYS` (optionnel, 14 par défaut).

Planification (cron de l'utilisateur de sauvegarde, tous les jours à 3 h) :

```bash
0 3 * * * DATABASE_URL=... BACKUP_DIR=/var/backups/y BACKUP_KEY_FILE=/etc/y/backup.key /chemin/vers/ops/backup/backup.sh >> /var/log/y-backup.log 2>&1
```

Sans la clé, un dump chiffré ne peut pas être lu. Il faut donc conserver une copie de la clé en lieu sûr, hors du serveur.

## Vérifier une sauvegarde : `restore.sh`

Le script déchiffre un dump dans une base de test, puis compare le nombre de lignes des tables `users`, `questions` et `replies` avec la base source.

```bash
BACKUP_FILE=/var/backups/y/y-<date>.dump.enc \
BACKUP_KEY_FILE=/etc/y/backup.key \
RESTORE_DATABASE_URL=postgresql://.../y_restore_test \
SOURCE_DATABASE_URL=postgresql://.../y \
bash ops/backup/restore.sh
```

`RESTORE_DATABASE_URL` ne doit jamais être la base de production ni la base de développement : le script efface le schéma de la cible avant la restauration.

Le résultat est attendu ainsi : une ligne `OK` par table, et un code de sortie `0`. Le résultat du test sur staging est écrit dans `docs/operations.md` (étape 12.2).
