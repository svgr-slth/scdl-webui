# scdl-web

Interface web pour synchroniser et gérer vos téléchargements SoundCloud. Un seul binaire pour installer, configurer et lancer l'application sur Linux, Windows ou macOS.

## Fonctionnalités

- **Gestion de sources** : playlists, artistes, likes, reposts
- **Synchronisation intelligente** : archive les tracks déjà téléchargés, détecte les nouveaux
- **Suivi en temps réel** : progression et logs via WebSocket
- **Multi-formats** : MP3, FLAC, Opus
- **Auto-start** : service systemd (Linux), Task Scheduler (Windows), launchd (macOS)
- **Domaine local** : accessible via `http://scdl.local`

---

## Installation

L'installeur télécharge et configure automatiquement Docker, build les images, configure le domaine local `scdl.local`, et démarre l'application.

### Linux

Téléchargez le binaire correspondant à votre architecture :

| Architecture | Fichier |
|---|---|
| x86_64 (Intel/AMD) | `scdl-web-linux-amd64` |
| ARM64 (Raspberry Pi, etc.) | `scdl-web-linux-arm64` |

```bash
# Rendre exécutable
chmod +x scdl-web-linux-amd64

# Installer (droits root requis pour Docker, /etc/hosts, systemd)
sudo ./scdl-web-linux-amd64 install
```

**Ce que fait l'installeur :**
1. Installe Docker Engine via le script officiel (`get.docker.com`) si absent
2. Ajoute l'utilisateur au groupe `docker`
3. Extrait les fichiers dans `/opt/scdl-web`
4. Build les images Docker
5. Ajoute `127.0.0.1 scdl.local` dans `/etc/hosts`
6. Crée et active un service systemd `scdl-web.service`
7. Démarre l'application
8. Installe la commande `scdl-web` dans `/usr/local/bin/`

**Chemins d'installation :**

```
/opt/scdl-web/                  # Fichiers de l'application
/opt/scdl-web/data/             # Données (base de données, musique, archives)
/opt/scdl-web/.env              # Configuration
/usr/local/bin/scdl-web         # Commande CLI
/etc/systemd/system/scdl-web.service
```

> **Note** : Si vous ne souhaitez pas utiliser `sudo`, l'installation en mode utilisateur est possible mais Docker doit déjà être installé et votre utilisateur doit être dans le groupe `docker`. Les fichiers seront installés dans `~/.local/share/scdl-web` et le binaire dans `~/.local/bin/`.

> **Note** : Après l'ajout au groupe `docker`, une déconnexion/reconnexion peut être nécessaire.

---

### Windows

**Prérequis** : Windows 10/11 avec WSL2 activé (requis par Docker Desktop).

1. Téléchargez `scdl-web-windows-amd64.exe`
2. Ouvrez un terminal **en tant qu'administrateur** (PowerShell ou cmd)
3. Exécutez :

```powershell
.\scdl-web-windows-amd64.exe install
```

**Ce que fait l'installeur :**
1. Installe Docker Desktop via `winget` si absent (un redémarrage peut être nécessaire)
2. Extrait les fichiers dans `%LOCALAPPDATA%\scdl-web`
3. Build les images Docker
4. Ajoute `127.0.0.1 scdl.local` dans `C:\Windows\System32\drivers\etc\hosts`
5. Crée une tâche planifiée pour le démarrage automatique
6. Démarre l'application

**Chemins d'installation :**

```
%LOCALAPPDATA%\scdl-web\            # Fichiers de l'application
%LOCALAPPDATA%\scdl-web\data\       # Données
%LOCALAPPDATA%\scdl-web\.env        # Configuration
```

> **Note** : Si `winget` n'est pas disponible, l'installeur vous guidera pour télécharger Docker Desktop manuellement. Après installation de Docker Desktop, relancez `scdl-web.exe install`.

> **Note** : Docker Desktop doit être configuré pour démarrer avec Windows (activé par défaut).

---

### macOS

Téléchargez le binaire correspondant à votre Mac :

| Processeur | Fichier |
|---|---|
| Apple Silicon (M1, M2, M3, M4) | `scdl-web-darwin-arm64` |
| Intel | `scdl-web-darwin-amd64` |

```bash
chmod +x scdl-web-darwin-arm64

# Installer (sudo requis pour /etc/hosts)
sudo ./scdl-web-darwin-arm64 install
```

**Ce que fait l'installeur :**
1. Installe Docker Desktop via Homebrew (`brew install --cask docker`) si absent
2. Extrait les fichiers dans `/opt/scdl-web`
3. Build les images Docker
4. Ajoute `127.0.0.1 scdl.local` dans `/etc/hosts`
5. Crée un service launchd pour le démarrage automatique
6. Démarre l'application
7. Installe la commande `scdl-web` dans `/usr/local/bin/`

> **Note** : Docker Desktop doit être lancé au moins une fois après installation pour terminer la configuration. L'installeur vous le signalera si nécessaire.

---

### Installation manuelle (Docker Compose)

Si vous préférez ne pas utiliser l'installeur, vous pouvez lancer le projet directement avec Docker Compose :

```bash
git clone <repo-url> scdl-web
cd scdl-web

# Créer le fichier de configuration
cp .env.example .env

# Créer les dossiers de données
mkdir -p data/db data/music data/archives

# Build et lancement
docker compose up -d

# Ajouter le domaine local (optionnel)
echo "127.0.0.1 scdl.local" | sudo tee -a /etc/hosts
```

L'application sera accessible sur `http://localhost` (ou `http://scdl.local` si vous avez configuré le hosts).

---

## Utilisation

Après installation, gérez l'application avec la commande `scdl-web` :

```bash
scdl-web start       # Démarrer l'application
scdl-web stop        # Arrêter l'application
scdl-web restart     # Redémarrer
scdl-web status      # Voir l'état des conteneurs et la santé de l'app
scdl-web logs        # Afficher les logs
scdl-web logs -f     # Suivre les logs en temps réel
scdl-web open        # Ouvrir l'interface web dans le navigateur
scdl-web uninstall   # Désinstaller (les données sont préservées)
```

---

## Configuration

Le fichier `.env` dans le répertoire d'installation contient la configuration :

```env
DATABASE_URL=sqlite+aiosqlite:////data/db/scdl-web.db
MUSIC_ROOT=/data/music
ARCHIVES_ROOT=/data/archives
```

Les réglages SoundCloud (token d'authentification, format audio par défaut) se configurent dans l'interface web via la page **Settings**.

---

## Architecture

```
Navigateur (http://scdl.local)
    |
    v
Nginx (frontend, port 80)
    |-- /           --> React SPA (fichiers statiques)
    |-- /api/*      --> Backend FastAPI (port 8000)
    |-- /ws/*       --> WebSocket (progression sync)

Backend FastAPI
    |-- SQLite          (base de données)
    |-- scdl            (téléchargement SoundCloud)
    |-- FFmpeg          (conversion audio)
    |-- /data/music     (fichiers téléchargés)
```

**Stack technique :**
- **Frontend** : React 18, TypeScript, Mantine UI, TanStack Query, Vite
- **Backend** : FastAPI, SQLAlchemy (async), Pydantic, scdl
- **Infrastructure** : Docker, Docker Compose, Nginx

---

## Développement

### Prérequis

- Go 1.21+ (pour compiler l'installeur)
- Docker et Docker Compose (pour lancer l'application)

### Build depuis les sources

```bash
# Build pour la plateforme courante
make build

# Build pour toutes les plateformes
make build-all

# Nettoyer
make clean
```

Les binaires sont générés dans `dist/` :

```
dist/
  scdl-web-linux-amd64
  scdl-web-linux-arm64
  scdl-web-windows-amd64.exe
  scdl-web-darwin-amd64
  scdl-web-darwin-arm64
```

---

## Désinstallation

```bash
scdl-web uninstall
```

La commande :
- Arrête les conteneurs Docker
- Supprime le service de démarrage automatique
- Retire `scdl.local` du fichier hosts
- Supprime les fichiers d'installation
- **Préserve vos données** (musique, base de données) dans un dossier de backup
