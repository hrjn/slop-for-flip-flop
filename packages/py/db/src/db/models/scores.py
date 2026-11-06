"""The high score board: one row per run that was signed on the board.

Rows are append-only. The board shown to players is the top N by score, computed on read, so a
score is never deleted to make room for a better one -- the history of every crossing stays.
"""

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import Index
from sqlmodel import Field, SQLModel


class Score(SQLModel, table=True):
    __tablename__ = "scores"
    # The board reads `ORDER BY score DESC` and nothing else, so one covering index serves it.
    __table_args__ = (Index("ix_scores_score_desc", "score", postgresql_using="btree"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    # Three arcade initials, uppercased by the API before it gets here.
    name: str = Field(max_length=3, index=True)
    score: int = Field(ge=0)
    # Kilometres drifted, 0..75; the crossing is 75 km.
    km: int = Field(ge=0, le=75)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
