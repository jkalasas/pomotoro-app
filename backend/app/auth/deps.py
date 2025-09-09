from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jwt.exceptions import InvalidTokenError
from sqlmodel import Session, select

from ..config import settings
from ..db import SessionDep
from ..users.models import User
from .schemas import TokenData
from .utils import verify_password

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token")


def get_user(session: Session, user_id: int):
    return session.get(User, user_id)


def authenticate_user(session: Session, email: str, password: str) -> Optional[User]:
    user = session.exec(select(User).where(User.email == email)).first()

    if user is None or not verify_password(password, user.password):
        return None
    return user


def create_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    # Only set exp if an expiration is provided; otherwise, token will not expire.
    if expires_delta is not None:
        expire = datetime.now(timezone.utc) + expires_delta
        to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_access_token(data: dict, expires_delta: timedelta | None = None):
    # If no-expiration flag is set and no explicit delta is provided, omit exp.
    if expires_delta is None and settings.access_token_no_expiration:
        return create_token(data, None)
    return create_token(
        data, expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )


def create_refresh_token(data: dict, expires_delta: timedelta | None = None):
    return create_token(
        data, expires_delta or timedelta(minutes=settings.refresh_token_expire_minutes)
    )


async def access_token_from_refresh_token(
    session: SessionDep, refresh_token: Annotated[str, Depends(oauth2_scheme)]
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            refresh_token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=int(user_id))
    except InvalidTokenError:
        raise credentials_exception

    user = get_user(session, token_data.user_id)
    if user is None:
        raise credentials_exception

    return create_access_token(data={"user_id": str(user.id)})


async def get_current_user(
    session: SessionDep, token: Annotated[str, Depends(oauth2_scheme)]
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        user_id = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=int(user_id))
    except InvalidTokenError:
        raise credentials_exception

    user = get_user(session, token_data.user_id)
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: Annotated[User, Depends(get_current_user)],
):
    return current_user


AccessFromRefreshDep = Annotated[str, Depends(access_token_from_refresh_token)]
ActiveUserDep = Annotated[User, Depends(get_current_active_user)]
