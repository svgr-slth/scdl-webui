# scdl-web

Application desktop native pour synchroniser et gérer vos téléchargements SoundCloud.
Un seul installeur pour Linux, Windows et macOS — sans navigateur, sans Docker.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation) — [Linux](#linux) · [Windows](#windows) · [macOS](#macos)
- [Utilisation](#utilisation)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Développement](#développement)
- [Désinstallation](#désinstallation)

---

## Fonctionnalités

- **Application native** : fenêtre desktop dédiée, pas besoin de navigateur
- **System tray** : l'app continue de tourner en arrière-plan ; rouvrez-la depuis la barre des tâches
- **Gestion de sources** : playlists, artistes, likes, reposts
- **Synchronisation intelligente** : archive les tracks déjà téléchargés, détecte les nouveaux
- **Suivi en temps réel** : progression et logs via WebSocket
- **Multi-formats** : MP3, FLAC, Opus
- **Téléchargement flexible** : choisissez n'importe quel dossier de votre machine
- **Multi-OS** : Linux, Windows, macOS
- **Léger** : ~10 MB, utilise le webview système

---

## Installation

Téléchargez l'installeur pour votre OS depuis la [page Releases](https://github.com/svgr-slth/scdl-webui/releases/latest).

**Prérequis** : Python 3.10+ et FFmpeg doivent être installés sur votre système.

### Linux

Téléchargez [`scdl-web-linux-amd64.AppImage`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-linux-amd64.AppImage), rendez-le exécutable et lancez-le :

```bash
chmod +x scdl-web-linux-amd64.AppImage
./scdl-web-linux-amd64.AppImage
```

Ou configurez votre gestionnaire de fichiers pour l'ouvrir en double-cliquant.

**Prérequis Linux :**
```bash
# Debian/Ubuntu
sudo apt install python3 python3-venv ffmpeg

# Fedora
sudo dnf install python3 ffmpeg

# Arch
sudo pacman -S python ffmpeg
```

**Données stockées dans :** `~/.local/share/scdl-web/`

---

### Windows

1. Téléchargez [`scdl-web-windows-amd64-installer.exe`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-windows-amd64-installer.exe)
2. Lancez l'installeur et suivez les étapes
3. L'application apparaît dans le menu Démarrer

**Prérequis Windows :**
```powershell
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

**Données stockées dans :** `%LOCALAPPDATA%\scdl-web\`

---

### macOS

1. Téléchargez [`scdl-web-darwin-amd64.dmg`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-darwin-amd64.dmg)
2. Ouvrez le fichier `.dmg` et glissez `scdl-web` dans votre dossier Applications
3. Lancez depuis le Launchpad ou le Finder

**Prérequis macOS :**
```bash
brew install python@3.12 ffmpeg
```

**Données stockées dans :** `~/Library/Application Support/scdl-web/`

---

## Utilisation

Au premier démarrage, l'application configure automatiquement l'environnement Python et installe les dépendances (opération unique, ~1 minute).

### System tray

scdl-web s'exécute en arrière-plan une fois lancé :

- **Fermer la fenêtre** (×) → l'app continue de tourner, une icône reste dans la barre des tâches
- **Clic sur l'icône tray → Ouvrir** → rouvre la fenêtre
- **Clic sur l'icône tray → Quitter** → arrête proprement le backend et quitte

---

## Configuration

Le fichier `.env` est créé automatiquement dans le dossier de données au premier lancement :

```env
DATABASE_URL=sqlite+aiosqlite:///<data-dir>/db/scdl-web.db
MUSIC_ROOT=<data-dir>/music
ARCHIVES_ROOT=<data-dir>/archives
```

**Changer le dossier de téléchargement** : modifiez `MUSIC_ROOT` dans les Settings de l'application ou directement dans le `.env` :

```env
MUSIC_ROOT=/home/user/Musique/SoundCloud
```

Les réglages SoundCloud (token, format audio) se configurent dans l'application via **Settings**.

---

## Architecture

```
┌──────────────────────────────────┐
│   Fenêtre native (Wails v2)      │
│   ┌────────────────────────────┐ │
│   │ Frontend React (webview)   │ │
│   │  /api/* → proxy Go         │ │
│   │  /ws/*  → direct backend   │ │
│   └────────────────────────────┘ │
│   System Tray (getlantern/systray)│
└──────────────┬───────────────────┘
               │ HTTP proxy
┌──────────────v───────────────────┐
│ Python uvicorn (127.0.0.1:8000)  │
│   FastAPI + scdl + FFmpeg        │
│   SQLite + WebSocket             │
└──────────────────────────────────┘
```

**Stack technique :**
- **Frontend** : React 18, TypeScript, Mantine UI, TanStack Query, Vite
- **Backend** : FastAPI, SQLAlchemy (async), Pydantic, scdl
- **Desktop** : Wails v2 (Go + webview système)
- **Tray** : getlantern/systray
- **Aucune dépendance lourde** : pas de Docker, pas de Chromium embarqué

---

## Développement

### Prérequis

- Go 1.23+
- Node.js 18+
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- Python 3.10+, FFmpeg
- Linux : `libgtk-3-dev`, `libwebkit2gtk-4.0-dev`, `libappindicator3-dev`

### Commandes

```bash
# Mode développement (hot reload)
make dev

# Build pour la plateforme courante
make build

# Build production (optimisé)
make build-production

# Nettoyer
make clean
```

Le binaire est généré dans `build/bin/`.

### Créer une release

Les releases sont automatisées via GitHub Actions. Chaque OS génère son installeur natif :

| OS | Artifact |
|---|---|
| Windows | `scdl-web-windows-amd64-installer.exe` (NSIS) |
| macOS | `scdl-web-darwin-amd64.dmg` (Intel + Rosetta 2) |
| Linux | `scdl-web-linux-amd64.AppImage` |

```bash
git tag v1.0.0
git push --tags
```

---

## Désinstallation

### Linux
Supprimez simplement le fichier `.AppImage`. Pour supprimer les données :
```bash
rm -rf ~/.local/share/scdl-web/
```

### Windows
Utilisez **Ajouter ou supprimer des programmes** dans les paramètres Windows, ou relancez l'installeur. Pour supprimer les données :
```powershell
Remove-Item -Recurse "$env:LOCALAPPDATA\scdl-web"
```

### macOS
Déplacez `scdl-web.app` vers la Corbeille. Pour supprimer les données :
```bash
rm -rf ~/Library/Application\ Support/scdl-web/
```
