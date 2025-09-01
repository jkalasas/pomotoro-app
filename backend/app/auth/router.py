from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlmodel import select

from ..db import SessionDep
from ..users.models import User
from ..users.schemas import UserPublic
from .schemas import Token, UserRegister
from .deps import (
    ActiveUserDep,
    AccessFromRefreshDep,
    authenticate_user,
    create_access_token,
    create_refresh_token,
)

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
def refresh_token_endpoint(access_token: AccessFromRefreshDep):
    return access_token


@router.get("/me", response_model=UserPublic)
def read_current_user(current_user: ActiveUserDep):
    return current_user
