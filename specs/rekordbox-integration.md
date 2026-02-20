# Spec : Intégration "Exporter vers Rekordbox" dans scdl-web

## Contexte projet

scdl-web est une app desktop Wails (Go wrapper + Python FastAPI backend + React/Mantine frontend) qui gère le téléchargement de sources SoundCloud. L'app stocke des **sources** (playlists, likes, artistes...) et leurs **tracks** sur disque, avec un filemap JSON pour le suivi.

### Stack existante
- **Go** : Wails v2.11.0, gorilla/websocket, systray
- **Python** : FastAPI, SQLAlchemy async + aiosqlite, Pydantic, scdl
- **Frontend** : React 18, Mantine 7.14, Tabler Icons, TanStack Query 5, Vite 6
- **Build** : `make bundle` + `wails build`, CI via GitHub Actions (AppImage Linux x2, NSIS Windows)
- **Dépendances Python** : `backend/requirements.txt` (pip install dans un venv créé au premier lancement)

### Architecture clé
- Go démarre un backend Python (uvicorn sur `127.0.0.1:8000`), proxy les requêtes `/api/*`
- Le frontend communique via fetch HTTP + WebSocket (relayé par Go via Wails Events)
- Les pistes audio sont stockées dans `{music_root}/{source.local_folder}/`
- Le filemap (`source-{id}-filemap.json` dans `{archives_root}/`) mappe `soundcloud {track_id}` → chemin absolu
- L'endpoint `GET /api/sources/{id}/tracks` retourne la liste `TrackFile[]` avec `name`, `relative_path`, `size`, `status`, `track_id`

---

## Fonctionnalité à implémenter

Ajouter deux actions Rekordbox sur chaque source :

1. **"Add to Rekordbox"** : Ajoute toutes les pistes synced de la source à la collection Rekordbox (sans créer de playlist)
2. **"Add as Playlist"** : Ajoute les pistes synced ET crée une playlist nommée comme la source

### Emplacements UI
- Sur chaque **SourceCard** du Dashboard (`frontend/src/components/SourceCard.tsx`) : deux ActionIcon dans le groupe de boutons existant
- Sur la page **SourceDetail** (`frontend/src/pages/SourceDetail.tsx`) : deux boutons dans une section dédiée ou dans le header

---

## Approche technique : XML Rekordbox via pyrekordbox

### Pourquoi XML et pas accès direct à master.db
- L'accès direct à `master.db` nécessite **SQLCipher** (dépendance native C), ce qui complexifie les builds cross-platform
- L'approche XML ne nécessite **aucune dépendance native** : `pyrekordbox.rbxml.RekordboxXml` est du pur Python
- Rekordbox supporte nativement l'import XML via sa fonctionnalité **Bridge** (Préférences > Avancé > rekordbox xml)
- Le fichier XML est cumulatif : on ajoute/met à jour des pistes et playlists à chaque opération

### Principe de fonctionnement
1. L'app maintient un fichier XML Rekordbox unique : `{data_dir}/rekordbox-export.xml`
2. Chaque action "Add to Rekordbox" ou "Add as Playlist" **met à jour** ce fichier XML
3. L'utilisateur configure Rekordbox **une seule fois** pour pointer le Bridge vers ce fichier
4. Les pistes et playlists apparaissent automatiquement dans la section "rekordbox xml" de Rekordbox

### Format XML Rekordbox (référence)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="rekordbox" Version="6.0.0" Company="AlphaTheta" />
  <COLLECTION Entries="2">
    <TRACK TrackID="1" Name="Track Name" Artist="Artist"
           Location="file://localhost/absolute/path/to/file.mp3"
           TotalTime="300" />
    <TRACK TrackID="2" ... />
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="My Playlist" Type="1" KeyType="0" Entries="2">
        <TRACK Key="1" />
        <TRACK Key="2" />
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
```

---

## Implémentation détaillée

### 1. Dépendance Python

**Fichier** : `backend/requirements.txt`

Ajouter :
```
pyrekordbox>=0.4.0
```

> `pyrekordbox` pour l'utilisation du module `rbxml` uniquement (pur Python, pas de SQLCipher requis). Le module `RekordboxXml` gère la lecture/écriture du format XML Rekordbox.

**Vérification** : `pip install pyrekordbox` ne doit installer que des dépendances pure Python (pas de compilation C). Vérifier que `from pyrekordbox.rbxml import RekordboxXml` fonctionne sans SQLCipher installé.

### 2. Service Python : `backend/app/services/rekordbox_exporter.py`

Créer un nouveau service qui gère l'export XML Rekordbox.

```python
# Responsabilités :
# - Charger/créer le fichier XML Rekordbox partagé
# - Ajouter des pistes à la collection XML (dédupliquées par chemin absolu)
# - Créer/mettre à jour des playlists dans le XML
# - Extraire les métadonnées audio basiques (nom, artiste si disponible) depuis le nom de fichier
```

**Logique métier :**

#### `export_to_collection(source_id: int) -> RekordboxExportResult`
1. Charger la source depuis la DB
2. Récupérer le `music_root` depuis les settings
3. Scanner les fichiers audio dans `{music_root}/{source.local_folder}/` (même logique que `list_tracks` dans `routers/sources.py`)
4. Charger le XML existant (`{data_dir}/rekordbox-export.xml`) ou en créer un nouveau
5. Pour chaque fichier audio existant (status=synced) :
   - Vérifier si déjà dans la collection XML (par `Location` = `file://localhost/{absolute_path}`)
   - Si absent, l'ajouter via `xml.add_track(path)` avec `Name` = stem du fichier
6. Sauvegarder le XML
7. Retourner `{ tracks_added: int, tracks_skipped: int, xml_path: str }`

#### `export_as_playlist(source_id: int) -> RekordboxExportResult`
1. Exécuter la même logique que `export_to_collection` pour ajouter les pistes
2. En plus : créer (ou mettre à jour) une playlist nommée `source.name` dans le XML
   - Si une playlist du même nom existe déjà, la supprimer et la recréer (pour refléter l'état actuel)
   - Ajouter toutes les pistes de cette source à la playlist
3. Sauvegarder le XML
4. Retourner `{ tracks_added: int, tracks_skipped: int, playlist_name: str, playlist_tracks: int, xml_path: str }`

#### `get_status() -> RekordboxStatus`
- Retourner `{ xml_exists: bool, xml_path: str, total_tracks: int, total_playlists: int }`
- Utile pour afficher l'état dans les Settings

**Gestion du chemin XML :**
- Par défaut : `{data_dir}/rekordbox-export.xml` (même `data_dir` que la DB SQLite)
- Le chemin est résolu via `config.py` (variable d'environnement `REKORDBOX_XML_PATH` optionnelle, sinon défaut)

**Gestion de la déduplication :**
- Utiliser le chemin absolu du fichier comme clé unique (via l'attribut `Location` du XML)
- Avant d'ajouter une piste, parcourir les tracks existantes du XML et comparer les `Location`
- Le `TrackID` dans le XML est un entier auto-incrémenté (géré par pyrekordbox)

**Gestion d'erreur :**
- Si pyrekordbox n'est pas installé (import error), retourner une erreur HTTP 501 avec message explicite
- Si le dossier source n'existe pas ou est vide, retourner 404
- Si le XML est corrompu, le recréer from scratch (avec log warning)

### 3. Schémas Pydantic : `backend/app/schemas/rekordbox.py`

```python
from pydantic import BaseModel

class RekordboxExportResult(BaseModel):
    tracks_added: int
    tracks_skipped: int
    xml_path: str
    playlist_name: str | None = None
    playlist_tracks: int | None = None

class RekordboxStatus(BaseModel):
    available: bool          # True si pyrekordbox est importable
    xml_exists: bool
    xml_path: str
    total_tracks: int
    total_playlists: int
```

### 4. Router Python : `backend/app/routers/rekordbox.py`

Créer un nouveau router avec le préfixe `/api/rekordbox`.

```
POST /api/rekordbox/{source_id}/collection    → export_to_collection(source_id)
POST /api/rekordbox/{source_id}/playlist      → export_as_playlist(source_id)
GET  /api/rekordbox/status                    → get_status()
```

**Enregistrer le router** dans `backend/app/main.py` (même pattern que les autres routers existants).

**Pattern à suivre** : voir `backend/app/routers/sources.py` pour le style (dépendance DB via `Depends(get_db)`, HTTPException pour les erreurs, etc.)

### 5. API Frontend : `frontend/src/api/rekordbox.ts`

Créer le module API côté frontend :

```typescript
import { api } from "./client";

export interface RekordboxExportResult {
  tracks_added: number;
  tracks_skipped: number;
  xml_path: string;
  playlist_name?: string;
  playlist_tracks?: number;
}

export interface RekordboxStatus {
  available: boolean;
  xml_exists: boolean;
  xml_path: string;
  total_tracks: number;
  total_playlists: number;
}

export const rekordboxApi = {
  exportToCollection: (sourceId: number) =>
    api.post<RekordboxExportResult>(`/rekordbox/${sourceId}/collection`),
  exportAsPlaylist: (sourceId: number) =>
    api.post<RekordboxExportResult>(`/rekordbox/${sourceId}/playlist`),
  status: () => api.get<RekordboxStatus>("/rekordbox/status"),
};
```

### 6. Hook React : `frontend/src/hooks/useRekordbox.ts`

Créer un hook suivant le pattern existant (voir `frontend/src/hooks/useSources.ts`) :

```typescript
import { useMutation, useQuery } from "@tanstack/react-query";
import { rekordboxApi } from "../api/rekordbox";

export function useRekordboxStatus() {
  return useQuery({
    queryKey: ["rekordbox", "status"],
    queryFn: rekordboxApi.status,
  });
}

export function useExportToCollection() {
  return useMutation({
    mutationFn: (sourceId: number) => rekordboxApi.exportToCollection(sourceId),
  });
}

export function useExportAsPlaylist() {
  return useMutation({
    mutationFn: (sourceId: number) => rekordboxApi.exportAsPlaylist(sourceId),
  });
}
```

### 7. Composant UI : `frontend/src/components/RekordboxActions.tsx`

Créer un composant réutilisable qui encapsule les deux boutons Rekordbox. Ce composant sera utilisé dans SourceCard ET dans SourceDetail.

**Variante compacte** (pour SourceCard) : deux `ActionIcon` avec `Tooltip`
**Variante étendue** (pour SourceDetail) : deux `Button` avec labels texte

**Icône** : Utiliser `IconVinyl` de `@tabler/icons-react` (déjà dans les dépendances). Alternatives acceptables : `IconDisc`, `IconMusic`.

**Comportement des boutons :**
- État `loading` pendant la requête (via `mutation.isPending`)
- Notification de succès via `Alert` temporaire ou `notifications` Mantine (si déjà utilisé — sinon, un simple state + Alert)
- Afficher le résultat : "X tracks added, Y skipped"
- Afficher un message d'erreur si l'API retourne une erreur (pyrekordbox non disponible, dossier vide, etc.)
- Désactiver les boutons si un sync est en cours sur cette source

**Pattern UI à respecter** (copier le style existant) :
```tsx
// ActionIcon pattern (SourceCard) - comme le bouton Open Folder existant
<Tooltip label="Add to Rekordbox">
  <ActionIcon variant="subtle" onClick={...} loading={...}>
    <IconVinyl size={16} />
  </ActionIcon>
</Tooltip>

// Button pattern (SourceDetail) - comme les boutons Sync/Reset existants
<Button
  variant="light"
  leftSection={<IconVinyl size={16} />}
  onClick={...}
  loading={...}
>
  Add to Rekordbox
</Button>
```

**Feedback utilisateur après export réussi :**
- Utiliser un state local pour afficher une Alert verte temporaire (3 secondes) sous les boutons
- Le message doit indiquer le nombre de tracks ajoutées et le nom de la playlist (si applicable)
- Si c'est le premier export, inclure un message d'aide : "Configure Rekordbox Bridge to point to: {xml_path}"

### 8. Modification de SourceCard (`frontend/src/components/SourceCard.tsx`)

**Ajouter dans le groupe de boutons** (ligne ~85, dans `<Group gap="xs">`, entre le bouton "Open Folder" et "Delete") :

- Un `ActionIcon` "Add to Rekordbox" (icône `IconVinyl`)
- Un `ActionIcon` "Add as Playlist" (icône `IconPlaylist` ou `IconVinyl` avec variante de couleur)

**Nouvelles props** : Aucune — le composant `RekordboxActions` gère tout en interne via les hooks.

**Attention** : La SourceCard ne doit pas grossir excessivement. Les deux boutons doivent être compacts (ActionIcon, pas Button). Utiliser un `Menu` dropdown si l'espace est trop contraint, avec les deux options dedans.

> **Alternative recommandée si trop de boutons** : Regrouper les deux actions Rekordbox dans un `Menu` déclenché par un seul `ActionIcon` avec icône `IconVinyl`. Le menu affiche deux items : "Add to Collection" et "Add as Playlist".

### 9. Modification de SourceDetail (`frontend/src/pages/SourceDetail.tsx`)

**Ajouter une section Rekordbox** dans la page détail. Deux options de placement :

**Option A (recommandée)** : Dans le header, à côté du bouton "Open Folder" existant (ligne ~86-92) :
```tsx
<Group>
  <Button variant="subtle" leftSection={<IconArrowLeft />} onClick={...}>Back</Button>
  <Title order={2}>{source.name}</Title>
  <Button variant="light" leftSection={<IconFolder />} onClick={...}>Open Folder</Button>
  {/* Nouveaux boutons Rekordbox ici */}
  <RekordboxActions sourceId={sourceId} variant="buttons" />
</Group>
```

**Option B** : Une Card dédiée entre la Card "Tracks" et la Card "Settings" :
```tsx
<Card withBorder p="lg">
  <Group justify="space-between" mb="md">
    <Title order={4}>Rekordbox</Title>
    <RekordboxActions sourceId={sourceId} variant="buttons" />
  </Group>
  {/* Feedback/status area */}
</Card>
```

### 10. Section Rekordbox dans Settings (`frontend/src/pages/SettingsPage.tsx`)

Ajouter une Card informative dans la page Settings, **après la Card Auto Sync** :

- Afficher le statut Rekordbox (via `GET /api/rekordbox/status`) :
  - Disponibilité de pyrekordbox (badge vert/rouge)
  - Chemin du fichier XML (copiable)
  - Nombre total de pistes et playlists dans le XML
- Un texte d'aide expliquant comment configurer le Bridge Rekordbox :
  - "In Rekordbox, go to Preferences > Advanced > Browse, and select the XML file above"
- Optionnel : un bouton "Reset XML" pour repartir d'un fichier vierge

---

## Gestion des dépendances et builds

### Impact sur `requirements.txt`
- Ajouter uniquement `pyrekordbox>=0.4.0`
- **Ne PAS ajouter** `sqlcipher3` ou `sqlcipher3-wheels` (on n'utilise que le module XML, pas le module DB)
- Vérifier que pyrekordbox en mode XML-only n'a pas de dépendances problématiques pour le build

### Impact sur le build (`Makefile`, `release.yml`)
- **Aucun changement** nécessaire dans le Makefile ni dans le CI/CD
- pyrekordbox est installé via `pip install -r requirements.txt` lors du premier lancement (fonction `pipInstall()` dans `python.go`)
- Pas de dépendance native supplémentaire à installer dans le workflow GitHub Actions
- Le `make bundle` copie `backend/` (incluant le requirements.txt mis à jour) dans `bundle/`

### Vérification build cross-platform
- **Linux AppImage** : pyrekordbox est dans le venv Python, pas dans le binaire Go. Aucun impact.
- **Windows NSIS** : Idem, pyrekordbox sera installé au premier lancement via pip. Aucune dépendance native.
- **Note importante** : Rekordbox ne tourne pas nativement sous Linux. La fonctionnalité sera disponible dans l'UI mais il faut gérer gracieusement le cas où l'utilisateur n'a pas Rekordbox (le XML est généré quand même, il peut être utilisé sur une autre machine).

### Vérification que pyrekordbox fonctionne sans SQLCipher
Après implémentation, exécuter ce test dans le venv :
```python
# Ce test DOIT passer sans sqlcipher3 installé
from pyrekordbox.rbxml import RekordboxXml
xml = RekordboxXml()
track = xml.add_track("/tmp/test.mp3")
track["Name"] = "Test"
xml.save("/tmp/test-rekordbox.xml")
print("OK: XML export works without SQLCipher")
```

---

## Instructions de vérification de cohérence

Après implémentation, vérifier systématiquement chaque point :

### Cohérence Backend
- [ ] Le nouveau router `rekordbox.py` est enregistré dans `backend/app/main.py` (pattern : `app.include_router(rekordbox.router)`)
- [ ] Le service `rekordbox_exporter.py` utilise la même logique de résolution `music_root` que `sync_manager` (via `get_current_music_root()` ou settings DB)
- [ ] Le service utilise les mêmes constantes `AUDIO_EXTENSIONS` que `routers/sources.py` (ou importe depuis un module partagé)
- [ ] Les chemins de fichiers dans le XML utilisent le format `file://localhost/` suivi du chemin absolu (format URI Rekordbox)
- [ ] Sur Windows, les chemins dans le XML utilisent des `/` et le préfixe `file://localhost/C:/...`
- [ ] Le schéma Pydantic `RekordboxExportResult` est cohérent entre `schemas/rekordbox.py` et le type TypeScript dans `api/rekordbox.ts`
- [ ] Les endpoints suivent la convention de nommage existante (`/api/rekordbox/...`)
- [ ] Le service gère le cas où `pyrekordbox` n'est pas installable (try/except ImportError au niveau du module)

### Cohérence Frontend
- [ ] Les types TypeScript dans `api/rekordbox.ts` correspondent exactement aux schémas Pydantic
- [ ] Le hook `useRekordbox.ts` suit le pattern exact de `useSources.ts` (useQuery/useMutation, queryKey naming)
- [ ] Les composants utilisent exclusivement des composants Mantine (pas de HTML natif pour les boutons/badges/alerts)
- [ ] Les icônes viennent de `@tabler/icons-react` (pas d'autre lib d'icônes)
- [ ] Les ActionIcon dans SourceCard ont des `Tooltip` (comme les boutons existants Open Folder et Delete)
- [ ] Les boutons ont un état `loading` pendant la mutation (pattern : `loading={mutation.isPending}`)
- [ ] Le feedback de succès utilise une `Alert` Mantine (pas de `window.alert`)
- [ ] Les couleurs et variants sont cohérentes avec l'existant (variant="light", variant="subtle" pour les ActionIcon)

### Cohérence Architecture
- [ ] Pas de nouvelle dépendance native (C/C++) introduite
- [ ] Le fichier `bundle/backend/requirements.txt` est synchronisé avec `backend/requirements.txt` après `make bundle`
- [ ] Le fichier XML est stocké dans `data_dir` (même répertoire que la base SQLite), pas dans un chemin arbitraire
- [ ] Les imports dans le backend suivent le pattern relatif existant (`from app.services.xxx import xxx`)
- [ ] Le service ne dépend pas de l'état de Rekordbox (pas besoin que Rekordbox soit installé ni lancé)

### Tests manuels à effectuer
1. `make bundle && wails build -clean` : le build doit passer sans erreur
2. Au premier lancement, `pip install` doit installer pyrekordbox sans erreur
3. Cliquer "Add to Rekordbox" sur une source synced → le fichier XML est créé/mis à jour
4. Cliquer "Add as Playlist" → le XML contient la playlist avec les bonnes pistes
5. Cliquer deux fois le même bouton → pas de doublons dans le XML
6. Ouvrir le XML dans Rekordbox via Bridge → les pistes et playlists sont visibles
7. Cliquer sur une source sans pistes → message d'erreur clair
8. Vérifier que les boutons sont disabled pendant un sync en cours

---

## Résumé des fichiers à créer/modifier

### Fichiers à CRÉER
| Fichier | Description |
|---------|-------------|
| `backend/app/services/rekordbox_exporter.py` | Service d'export XML Rekordbox |
| `backend/app/schemas/rekordbox.py` | Schémas Pydantic pour les réponses |
| `backend/app/routers/rekordbox.py` | Endpoints API REST |
| `frontend/src/api/rekordbox.ts` | Client API frontend |
| `frontend/src/hooks/useRekordbox.ts` | Hooks React Query |
| `frontend/src/components/RekordboxActions.tsx` | Composant boutons Rekordbox réutilisable |

### Fichiers à MODIFIER
| Fichier | Modification |
|---------|-------------|
| `backend/requirements.txt` | Ajouter `pyrekordbox>=0.4.0` |
| `backend/app/main.py` | Enregistrer le nouveau router |
| `frontend/src/components/SourceCard.tsx` | Intégrer RekordboxActions (variante compact/menu) |
| `frontend/src/pages/SourceDetail.tsx` | Intégrer RekordboxActions (variante boutons) |
| `frontend/src/pages/SettingsPage.tsx` | Ajouter la Card statut Rekordbox |

### Fichiers à NE PAS MODIFIER
- `Makefile` — aucun changement nécessaire
- `.github/workflows/release.yml` — aucune dépendance native ajoutée
- `go.mod` / `go.sum` — aucun changement Go
- `python.go` / `setup.go` — le mécanisme existant `pip install -r requirements.txt` suffit
- `wails.json` — aucun changement
