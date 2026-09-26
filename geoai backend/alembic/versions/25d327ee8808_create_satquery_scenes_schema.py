"""create satquery scenes schema

Revision ID: 25d327ee8808
Revises: e7c95a1b2d40
Create Date: 2026-09-25 23:36:17.274721

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '25d327ee8808'
down_revision: Union[str, Sequence[str], None] = 'e7c95a1b2d40'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        """
        CREATE SCHEMA IF NOT EXISTS satquery;
        CREATE TABLE IF NOT EXISTS satquery.scenes (
            id UUID PRIMARY KEY,
            sensor TEXT NOT NULL,
            acquired_at TIMESTAMPTZ NOT NULL,
            cloud_cover FLOAT,
            footprint GEOMETRY(POLYGON, 4326),
            cog_url TEXT,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS scenes_footprint_gist
            ON satquery.scenes USING GIST (footprint);
        CREATE INDEX IF NOT EXISTS scenes_acquired_at_idx
            ON satquery.scenes (acquired_at DESC);
        """
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("DROP SCHEMA IF EXISTS satquery CASCADE;")
