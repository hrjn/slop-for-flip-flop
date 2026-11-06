"""scores board

Revision ID: 59d7225b9aa8
Revises: 
Create Date: 2026-11-06 18:28:33.254984

"""
from collections.abc import Sequence

import sqlalchemy as sa
import sqlmodel.sql.sqltypes
from alembic import op


revision: str = '59d7225b9aa8'
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "scores",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sqlmodel.sql.sqltypes.AutoString(length=3), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("km", sa.Integer(), nullable=False),
        sa.Column("created_at", sqlmodel.sql.sqltypes.UTCDateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_scores_name"), "scores", ["name"], unique=False)
    op.create_index("ix_scores_score_desc", "scores", ["score"], unique=False, postgresql_using="btree")


def downgrade() -> None:
    op.drop_index("ix_scores_score_desc", table_name="scores", postgresql_using="btree")
    op.drop_index(op.f("ix_scores_name"), table_name="scores")
    op.drop_table("scores")
