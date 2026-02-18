# scdl-web

Interface web pour synchroniser et gérer vos téléchargements SoundCloud. Un seul binaire pour installer, configurer et lancer l'application sur Linux, Windows ou macOS — sans Docker.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation) — [Linux](#linux) · [Windows](#windows) · [macOS](#macos) · [Manuelle](#installation-manuelle)
- [Utilisation](#utilisation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Développement](#développement)
- [Désinstallation](#désinstallation)

---

## Fonctionnalités

- **Gestion de sources** : playlists, artistes, likes, reposts
- **Synchronisation intelligente** : archive les tracks déjà téléchargés, détecte les nouveaux
- **Suivi en temps réel** : progression et logs via WebSocket
- **Multi-formats** : MP3, FLAC, Opus
- **Téléchargement flexible** : choisissez n'importe quel dossier de votre machine comme destination
- **Auto-start** : service systemd (Linux), Task Scheduler (Windows), launchd (macOS)
- **Domaine local** : accessible via `http://scdl.local`
- **Zéro Docker** : fonctionne nativement avec Python et FFmpeg

---

## Installation

Téléchargez l'exécutable pour votre OS depuis la [page Releases](https://github.com/svgr-slth/scdl-webui/releases/latest), puis lancez-le. L'installeur configure automatiquement Python, FFmpeg, les dépendances, le domaine local `scdl.local`, et démarre l'application.

### Linux

| Architecture | Fichier |
|---|---|
| x86_64 (Intel/AMD) | [`scdl-web-linux-amd64`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-linux-amd64) |
| ARM64 (Raspberry Pi, etc.) | [`scdl-web-linux-arm64`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-linux-arm64) |

```bash
# Rendre exécutable
chmod +x scdl-web-linux-amd64

# Installer (droits root recommandés pour apt, /etc/hosts, systemd)
sudo ./scdl-web-linux-amd64 install
```

**Ce que fait l'installeur :**
1. Installe Python 3.10+ et FFmpeg via le gestionnaire de paquets (apt, dnf ou pacman)
2. Extrait les fichiers backend dans `/opt/scdl-web`
3. Crée un environnement virtuel Python et installe les dépendances
4. Crée le fichier `.env` avec les chemins configurables
5. Ajoute `127.0.0.1 scdl.local` dans `/etc/hosts`
6. Crée et active un service systemd `scdl-web.service`
7. Installe la commande `scdl-web` dans `/usr/local/bin/`

**Chemins d'installation :**

```
/opt/scdl-web/                  # Fichiers de l'application
/opt/scdl-web/backend/          # Code backend Python
/opt/scdl-web/venv/             # Environnement virtuel Python
/opt/scdl-web/data/             # Données (base de données, musique, archives)
/opt/scdl-web/.env              # Configuration
/usr/local/bin/scdl-web         # Commande CLI
/etc/systemd/system/scdl-web.service
```

> **Note** : Si vous ne souhaitez pas utiliser `sudo`, l'installation en mode utilisateur est possible mais Python 3.10+ et FFmpeg doivent déjà être installés. Les fichiers seront installés dans `~/.local/share/scdl-web` et le binaire dans `~/.local/bin/`.

---

### Windows

1. Téléchargez [`scdl-web-windows-amd64.exe`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-windows-amd64.exe)
2. Ouvrez un terminal **en tant qu'administrateur** (PowerShell ou cmd)
3. Exécutez :

```powershell
.\scdl-web-windows-amd64.exe install
```

**Ce que fait l'installeur :**
1. Installe Python 3.12 via `winget` si absent
2. Installe FFmpeg via `winget` si absent
3. Extrait les fichiers dans `%LOCALAPPDATA%\scdl-web`
4. Crée un environnement virtuel Python et installe les dépendances
5. Ajoute `127.0.0.1 scdl.local` dans `C:\Windows\System32\drivers\etc\hosts`
6. Crée une tâche planifiée pour le démarrage automatique
7. Installe la commande `scdl-web` dans le PATH

**Chemins d'installation :**

```
%LOCALAPPDATA%\scdl-web\            # Fichiers de l'application
%LOCALAPPDATA%\scdl-web\backend\    # Code backend Python
%LOCALAPPDATA%\scdl-web\venv\       # Environnement virtuel Python
%LOCALAPPDATA%\scdl-web\data\       # Données
%LOCALAPPDATA%\scdl-web\.env        # Configuration
```

> **Note** : Si `winget` n'est pas disponible, l'installeur vous guidera pour installer Python et FFmpeg manuellement.

---

### macOS

| Processeur | Fichier |
|---|---|
| Apple Silicon (M1, M2, M3, M4) | [`scdl-web-darwin-arm64`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-darwin-arm64) |
| Intel | [`scdl-web-darwin-amd64`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-darwin-amd64) |

```bash
chmod +x scdl-web-darwin-arm64

# Installer (sudo requis pour /etc/hosts)
sudo ./scdl-web-darwin-arm64 install
```

**Ce que fait l'installeur :**
1. Installe Python 3.12 et FFmpeg via Homebrew si absents
2. Extrait les fichiers dans `/opt/scdl-web`
3. Crée un environnement virtuel Python et installe les dépendances
4. Ajoute `127.0.0.1 scdl.local` dans `/etc/hosts`
5. Crée un service launchd pour le démarrage automatique
6. Installe la commande `scdl-web` dans `/usr/local/bin/`

> **Note** : Homebrew est requis pour installer automatiquement les dépendances. Si Homebrew n'est pas installé, l'installeur vous indiquera comment procéder.

---

### Installation manuelle

Si vous préférez ne pas utiliser l'installeur :

```bash
git clone https://github.com/svgr-slth/scdl-webui.git scdl-web
cd scdl-web

# Prérequis
# Python 3.10+, FFmpeg, Node.js 18+

# Créer le fichier de configuration
cp .env.example .env
# Éditer .env pour configurer les chemins (MUSIC_ROOT, etc.)

# Backend
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# Frontend
cd frontend && npm install && npm run build && cd ..

# Créer les dossiers de données
mkdir -p data/db data/music data/archives

# Lancer le backend
cd backend && uvicorn app.main:app --host 127.0.0.1 --port 8000

# Ajouter le domaine local (optionnel)
echo "127.0.0.1 scdl.local" | sudo tee -a /etc/hosts
```

---

## Utilisation

Après installation, gérez l'application avec la commande `scdl-web` :

```bash
scdl-web start       # Démarrer l'application
scdl-web stop        # Arrêter l'application
scdl-web restart     # Redémarrer
scdl-web status      # Voir l'état de l'application et la santé
scdl-web logs        # Afficher les logs
scdl-web open        # Ouvrir l'interface web dans le navigateur
scdl-web uninstall   # Désinstaller (les données sont préservées)
```

---

## Configuration

Le fichier `.env` dans le répertoire d'installation contient la configuration :

```env
DATABASE_URL=sqlite+aiosqlite:////<data-dir>/db/scdl-web.db
MUSIC_ROOT=/<data-dir>/music
ARCHIVES_ROOT=/<data-dir>/archives
```

**Changer le dossier de téléchargement** : modifiez `MUSIC_ROOT` pour pointer vers n'importe quel dossier de votre machine, par exemple :

```env
MUSIC_ROOT=/home/user/Musique/SoundCloud
```

Les réglages SoundCloud (token d'authentification, format audio par défaut) se configurent dans l'interface web via la page **Settings**.

---

## Architecture

```
Navigateur (http://scdl.local)
    |
    v
Binaire Go scdl-web (port 80)
    |-- /           --> Frontend React (fichiers statiques embarqués)
    |-- /api/*      --> Reverse proxy → Backend Python (port 8000)
    |-- /ws/*       --> Proxy WebSocket → Backend Python
    |
    └── gère → subprocess Python uvicorn (127.0.0.1:8000)

Backend FastAPI (uvicorn)
    |-- SQLite          (base de données)
    |-- scdl            (téléchargement SoundCloud)
    |-- FFmpeg          (conversion audio)
    |-- ~/Musique/...   (fichiers téléchargés, chemin configurable)
```

**Stack technique :**
- **Frontend** : React 18, TypeScript, Mantine UI, TanStack Query, Vite
- **Backend** : FastAPI, SQLAlchemy (async), Pydantic, scdl
- **Serveur** : binaire Go (HTTP server + reverse proxy + WebSocket proxy)
- **Aucune dépendance lourde** : pas de Docker, pas de Nginx

---

## Développement

### Prérequis

- Go 1.23+ (pour compiler le binaire)
- Node.js 18+ (pour builder le frontend)
- Python 3.10+, FFmpeg (pour le runtime)

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

### Créer une release

Les releases sont automatisées via GitHub Actions. Pour publier une nouvelle version :

```bash
git tag v1.0.0
git push --tags
```

Le pipeline build le frontend, compile les 5 binaires et les publie sur la [page Releases](https://github.com/svgr-slth/scdl-webui/releases).

---

## Désinstallation

```bash
scdl-web uninstall
```

La commande :
- Arrête le serveur et le backend Python
- Supprime le service de démarrage automatique
- Retire `scdl.local` du fichier hosts
- Supprime les fichiers d'installation (backend, venv)
- **Préserve vos données** (musique, base de données) dans un dossier de backup
