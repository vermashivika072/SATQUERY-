"""add token_version to users

Revision ID: e7c95a1b2d40
Revises: 9bff2b738ba0
Create Date: 2026-09-25 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "e7c95a1b2d40"
down_revision: Union[str, Sequence[str], None] = "9bff2b738ba0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add token_version for server-side logout-all revocation."""
    op.add_column(
        "users",
        sa.Column(
            "token_version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )


def downgrade() -> None:
    """Drop token_version."""
    op.drop_column("users", "token_version")