"""The shared high score board for the 75 km crossing."""

from typing import Annotated

from db.accessors.scores import BOARD_SIZE, record_score, top_scores
from db.models.scores import Score
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_validator

from api.database import SessionDep

#: Three arcade initials. The game's own entry screen offers A-Z, 0-9 and a space.
NAME_LENGTH = 3

#: The full crossing, Koh Samui to Koh Tao.
TOTAL_KM = 75

router = APIRouter(tags=["scores"])


class ScoreEntry(BaseModel):
    """One signed run: who, how far, how many points."""

    name: str
    score: int
    km: int


class ScoreSubmission(BaseModel):
    """A finished run, as the game reports it."""

    name: str = Field(min_length=1, max_length=NAME_LENGTH)
    score: int = Field(ge=0)
    km: int = Field(ge=0, le=TOTAL_KM)

    @field_validator("name")
    @classmethod
    def _initials(cls, value: str) -> str:
        """Uppercase initials, so the board reads as one arcade table whatever the player typed."""
        return value.strip().upper()


def _entry(row: Score) -> ScoreEntry:
    return ScoreEntry(name=row.name, score=row.score, km=row.km)


@router.get("", operation_id="scores_list")
async def list_scores(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=100)] = BOARD_SIZE,
) -> list[ScoreEntry]:
    """The high score board, best first: the top runs of the 75 km Koh Samui to Koh Tao crossing."""
    return [_entry(row) for row in await top_scores(session, limit=limit)]


@router.post("", operation_id="scores_submit", status_code=201)
async def submit_score(submission: ScoreSubmission, session: SessionDep) -> list[ScoreEntry]:
    """Sign the board with a finished run, and return the board as it now stands."""
    await record_score(
        session,
        name=submission.name,
        score=submission.score,
        km=submission.km,
    )
    return [_entry(row) for row in await top_scores(session)]
