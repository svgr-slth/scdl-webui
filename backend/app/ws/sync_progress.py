from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[int, list[WebSocket]] = {}
        self._get_log_buffer = None

    def set_log_buffer_provider(self, provider):
        """Set a callable that returns the log buffer for a source_id."""
        self._get_log_buffer = provider

    async def connect(self, source_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.setdefault(source_id, []).append(websocket)

        # Replay existing log buffer for late joiners
        if self._get_log_buffer:
            buffer = self._get_log_buffer(source_id)
            if buffer:
                # Send status first
                await websocket.send_json({"type": "status", "status": "running"})
                # Replay all buffered lines
                for line in buffer:
                    await websocket.send_json({"type": "log", "line": line})

    def disconnect(self, source_id: int, websocket: WebSocket):
        conns = self.active_connections.get(source_id, [])
        if websocket in conns:
            conns.remove(websocket)

    async def broadcast(self, source_id: int, message: dict):
        for conn in self.active_connections.get(source_id, []):
            try:
                await conn.send_json(message)
            except Exception:
                pass


ws_manager = ConnectionManager()
