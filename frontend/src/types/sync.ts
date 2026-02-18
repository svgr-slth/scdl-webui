export interface SyncRun {
  id: number;
  source_id: number;
  source_name: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  tracks_added: number;
  tracks_removed: number;
  tracks_skipped: number;
  error_message: string | null;
}

export interface SyncRunDetail extends SyncRun {
  log_output: string | null;
}

export interface SyncStatus {
  is_syncing: boolean;
  active_source_id: number | null;
  active_source_name: string | null;
}

export interface WsMessage {
  type: "log" | "status" | "stats" | "progress";
  line?: string;
  status?: string;
  added?: number;
  removed?: number;
  skipped?: number;
  current?: number;
  total?: number;
}
