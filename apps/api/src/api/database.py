"""The request-scoped database session, as a FastAPI dependency.

Lives outside ``api.routers`` on purpose: that tree is the URL tree, and this serves no URL. A
route takes :data:`SessionDep` and gets a session that is closed once the response is sent,
whichever way the handler returned.
"""

from collections.abc import AsyncGenerator
from typing import Annotated

from db import get_session_maker
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession


async def get_session() -> AsyncGenerator[AsyncSession]:
    async with get_session_maker()() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]
