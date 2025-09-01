from typing import Annotated

from fastapi import Depends, HTTPException, status

from ..db import SessionDep
from .models import User


def get_user_by_id(session: SessionDep, user_id: int):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    return user


UserGetByIdDep = Annotated[User, Depends(get_user_by_id)]
