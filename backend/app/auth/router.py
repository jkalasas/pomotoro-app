from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from ..db import SessionDep
from ..users.models import User
from ..users.schemas import UserPublic
from .schemas import Token, UserRegister
from .deps import (
    ActiveUserDep,
    authenticate_user,
    create_access_token,
    create_refresh_token,
    oauth2_scheme,
)
from .deps import get_user  # type: ignore
from .deps import settings, jwt, InvalidTokenError  # type: ignore

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post(
    "/register", response_model=UserPublic, status_code=status.HTTP_201_CREATED
)
def register(user: UserRegister, session: SessionDep):
    # check existing
    existing = session.exec(select(User).where(User.email == user.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    db_user = User(**user.model_dump())
    session.add(db_user)
    session.commit()
    session.refresh(db_user)

    return db_user


@router.post("/token", response_model=Token)
def login_for_access_token(
    session: SessionDep,
    form_data: OAuth2PasswordRequestForm = Depends(),
):
    user = authenticate_user(session, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(data={"user_id": str(user.id)})
    refresh_token = create_refresh_token(data={"user_id": str(user.id)})

    return Token(
        access_token=access_token, refresh_token=refresh_token, token_type="bearer"
    )


@router.post("/token/refresh", response_model=Token)
def refresh_token_endpoint(
    session: SessionDep,
    refresh_token: str = Depends(oauth2_scheme),
):
    """Exchange a valid refresh token for a new access & refresh token.

    The provided bearer token MUST be a refresh token. We decode it, ensure the
    user still exists, then rotate both tokens (best practice) returning a full
    Token payload expected by the frontend.
    """
    from .schemas import Token as TokenSchema

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
    except InvalidTokenError:
        raise credentials_exception

    user = get_user(session, int(user_id))
    if user is None:
        raise credentials_exception

    new_access = create_access_token(data={"user_id": str(user.id)})
    new_refresh = create_refresh_token(data={"user_id": str(user.id)})

    return TokenSchema(
        access_token=new_access, refresh_token=new_refresh, token_type="bearer"
    )


@router.get("/me", response_model=UserPublic)
def read_current_user(current_user: ActiveUserDep):
    return current_user
