"""Load SatQuery scenes from a CSV into PostGIS.

CSV columns expected:
    id,sensor,acquired_at,cloud_cover,min_lon,min_lat,max_lon,max_lat,cog_url

Usage:
    python scripts/seed_satquery.py path/to/scenes.csv
"""
import csv
import sys
from shapely.geometry import Polygon
from sqlalchemy import text
from app.db.session import SessionLocal


def main(csv_path: str):
    db = SessionLocal()
    try:
        db.execute(text("CREATE SCHEMA IF NOT EXISTS satquery"))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS satquery.scenes (
                id UUID PRIMARY KEY,
                sensor TEXT NOT NULL,
                acquired_at TIMESTAMPTZ NOT NULL,
                cloud_cover FLOAT,
                footprint GEOMETRY(POLYGON, 4326),
                cog_url TEXT
            )
        """))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS scenes_footprint_idx "
            "ON satquery.scenes USING GIST (footprint)"
        ))
        db.execute(text(
            "CREATE INDEX IF NOT EXISTS scenes_time_idx "
            "ON satquery.scenes (acquired_at DESC)"
        ))
        db.commit()

        with open(csv_path, encoding="utf-8") as f:
            count = 0
            for row in csv.DictReader(f):
                wkt = Polygon([
                    (float(row["min_lon"]), float(row["min_lat"])),
                    (float(row["max_lon"]), float(row["min_lat"])),
                    (float(row["max_lon"]), float(row["max_lat"])),
                    (float(row["min_lon"]), float(row["max_lat"])),
                    (float(row["min_lon"]), float(row["min_lat"])),
                ]).wkt

                db.execute(text("""
                    INSERT INTO satquery.scenes
                        (id, sensor, acquired_at, cloud_cover, footprint, cog_url)
                    VALUES
                        (:id, :sensor, :acquired_at, :cloud,
                         ST_GeomFromText(:wkt, 4326), :cog)
                    ON CONFLICT (id) DO NOTHING
                """), {
                    "id": row["id"],
                    "sensor": row["sensor"],
                    "acquired_at": row["acquired_at"],
                    "cloud": row.get("cloud_cover"),
                    "wkt": wkt,
                    "cog": row.get("cog_url"),
                })
                count += 1
                if count % 1000 == 0:
                    db.commit()
                    print(f"Inserted {count} scenes")

        db.commit()
        print(f"Done. Inserted {count} scenes.")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python scripts/seed_satquery.py <csv_path>")
        sys.exit(1)
    main(sys.argv[1])