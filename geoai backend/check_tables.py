from app.db.session import engine
from sqlalchemy import text

rows = engine.connect().execute(
    text("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
).fetchall()

for r in rows:
    print(r[0])
