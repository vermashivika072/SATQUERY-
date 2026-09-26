import re
from pathlib import Path

from app.core.provenance import provenance


class LocalRagEngine:
    def __init__(self, upload_dir: Path):
        self.upload_dir = upload_dir
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    def ingest_document(self, file_path: str | Path, session_id: str) -> list[dict]:
        path = Path(file_path)
        text_content = path.read_text(encoding="utf-8", errors="ignore")
        return self._records(path.name, text_content, session_id)

    def query_context(self, user_prompt: str, session_id: str) -> list[dict]:
        if not session_id.strip():
            return []
        terms = set(re.findall(r"[a-z0-9]{3,}", user_prompt.lower()))
        matches: list[dict] = []
        for path in sorted(self.upload_dir.iterdir()):
            if not path.is_file() or path.suffix.lower() not in {".txt", ".md", ".csv"}:
                continue
            if not path.name.startswith(f"{session_id}_"):
                continue
            try:
                text_content = path.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue
            records = self._records(path.name, text_content, session_id)
            if not terms or any(t in r["snippet"].lower() for t in terms for r in records):
                matches.extend(records)
        return matches[:8]

    @staticmethod
    def _records(filename: str, text_content: str, session_id: str) -> list[dict]:
        chunks = [c.strip() for c in re.split(r"\n\s*\n", text_content) if c.strip()]
        return [
            {
                "filename": filename,
                "snippet": c[:800],
                "session_id": session_id,
                "provenance": provenance("DB", True, f"chunk from {filename}"),
            }
            for c in chunks
        ]


rag_engine = LocalRagEngine(Path("data/uploads"))