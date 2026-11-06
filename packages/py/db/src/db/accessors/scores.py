"""Reads and writes of the ``scores`` table. The only place the board is queried."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from db.models.scores import Score

#: How many rows the board shows. The table keeps every run; this only bounds the read.
BOARD_SIZE = 8


async def top_scores(session: AsyncSession, *, limit: int = BOARD_SIZE) -> list[Score]:
    """The board, best first. Ties break on the older run, so a new score never displaces an equal one."""
    statement = (
        select(Score).order_by(col(Score.score).desc(), col(Score.created_at).asc()).limit(limit)
    )
    result = await session.execute(statement)
    return list(result.scalars().all())


async def record_score(session: AsyncSession, *, name: str, score: int, km: int) -> Score:
    """Append a run to the board and return the stored row."""
    row = Score(name=name, score=score, km=km)
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row
