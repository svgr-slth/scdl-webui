# scdl-web

Application desktop native pour synchroniser et gérer vos téléchargements SoundCloud. Un seul exécutable pour Linux, Windows et macOS — sans navigateur, sans Docker.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Installation](#installation) — [Linux](#linux) · [Windows](#windows) · [macOS](#macos)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Développement](#développement)
- [Désinstallation](#désinstallation)

---

## Fonctionnalités

- **Application native** : fenêtre desktop dédiée, pas besoin de navigateur
- **Gestion de sources** : playlists, artistes, likes, reposts
- **Synchronisation intelligente** : archive les tracks déjà téléchargés, détecte les nouveaux
- **Suivi en temps réel** : progression et logs via WebSocket
- **Multi-formats** : MP3, FLAC, Opus
- **Téléchargement flexible** : choisissez n'importe quel dossier de votre machine
- **Multi-OS** : Linux, Windows, macOS
- **Léger** : ~10 MB, utilise le webview système

---

## Installation

Téléchargez l'exécutable pour votre OS depuis la [page Releases](https://github.com/svgr-slth/scdl-webui/releases/latest) et lancez-le. Au premier démarrage, l'application configure automatiquement l'environnement Python et les dépendances.

**Prérequis** : Python 3.10+ et FFmpeg doivent être installés sur votre système.

### Linux

| Architecture | Fichier |
|---|---|
| x86_64 (Intel/AMD) | [`scdl-web-linux-amd64`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-linux-amd64) |

```bash
chmod +x scdl-web-linux-amd64
./scdl-web-linux-amd64
```

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

1. Téléchargez [`scdl-web-windows-amd64.exe`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-windows-amd64.exe)
2. Double-cliquez pour lancer

**Prérequis Windows :**
```powershell
winget install Python.Python.3.12
winget install Gyan.FFmpeg
```

**Données stockées dans :** `%LOCALAPPDATA%\scdl-web\`

---

### macOS

| Processeur | Fichier |
|---|---|
| Apple Silicon + Intel (universel) | [`scdl-web-darwin-universal`](https://github.com/svgr-slth/scdl-webui/releases/latest/download/scdl-web-darwin-universal) |

```bash
chmod +x scdl-web-darwin-universal
./scdl-web-darwin-universal
```

**Prérequis macOS :**
```bash
brew install python@3.12 ffmpeg
```

**Données stockées dans :** `~/Library/Application Support/scdl-web/`

---

## Configuration

Le fichier `.env` est créé automatiquement dans le dossier de données au premier lancement :

```env
DATABASE_URL=sqlite+aiosqlite:///<data-dir>/db/scdl-web.db
MUSIC_ROOT=<data-dir>/music
ARCHIVES_ROOT=<data-dir>/archives
```

**Changer le dossier de téléchargement** : modifiez `MUSIC_ROOT` pour pointer vers n'importe quel dossier :

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
- **Aucune dépendance lourde** : pas de Docker, pas de Chromium embarqué

---

## Développement

### Prérequis

- Go 1.23+
- Node.js 18+
- Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@latest`)
- Python 3.10+, FFmpeg
- Linux : `libgtk-3-dev`, `libwebkit2gtk-4.0-dev`

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

Les releases sont automatisées via GitHub Actions avec des builds matrix (un par OS) :

```bash
git tag v3.0.0
git push --tags
```

Le pipeline produit 3 binaires (Linux amd64, Windows amd64, macOS universel) sur la [page Releases](https://github.com/svgr-slth/scdl-webui/releases).

---

## Désinstallation

Supprimez simplement l'exécutable. Pour supprimer aussi les données :

| OS | Dossier de données |
|---|---|
| Linux | `~/.local/share/scdl-web/` |
| Windows | `%LOCALAPPDATA%\scdl-web\` |
| macOS | `~/Library/Application Support/scdl-web/` |
