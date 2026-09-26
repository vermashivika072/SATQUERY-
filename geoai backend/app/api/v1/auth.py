from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.rate_limit import check_login_rate_limit
from app.core.security import (
    decode_token, hash_password, verify_password, create_access_token,
    create_refresh_token,
)
from app.db.session import get_db
from app.db.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_cookies(response: Response, access: str, refresh: str) -> None:
    response.set_cookie(
        "access_token", access, httponly=True, secure=settings.cookie_secure,
        samesite=settings.cookie_samesite, max_age=settings.access_token_expire_minutes * 60,
        domain=settings.cookie_domain,
    )
    response.set_cookie(
        "refresh_token", refresh, httponly=True, secure=settings.cookie_secure,
        samesite=settings.cookie_samesite, max_age=settings.refresh_token_expire_days * 86400,
        domain=settings.cookie_domain,
    )


def _clear_cookies(response: Response) -> None:
    response.delete_cookie("access_token", domain=settings.cookie_domain)
    response.delete_cookie("refresh_token", domain=settings.cookie_domain)


@router.post("/register", response_model=UserOut, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(400, "Username already taken")
    user = User(
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login")
def login(
    payload: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    _rate_limited: None = Depends(check_login_rate_limit),
):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    access = create_access_token(
        str(user.id), user.role, token_version=user.token_version
    )
    refresh = create_refresh_token(str(user.id), token_version=user.token_version)
    _set_cookies(response, access, refresh)
    return {
        "authenticated": True,
        "user": UserOut.model_validate(user).model_dump(mode="json"),
    }


@router.post("/refresh")
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
):
    if not refresh_token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = decode_token(refresh_token)
    except ValueError:
        raise HTTPException(401, "Invalid token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Wrong token type")
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(401, "User not found")
    if int(payload.get("tv", 1)) != user.token_version:
        raise HTTPException(401, "Token revoked")
    access = create_access_token(
        str(user.id), user.role, token_version=user.token_version
    )
    refresh = create_refresh_token(str(user.id), token_version=user.token_version)
    _set_cookies(response, access, refresh)
    return {"refreshed": True}


@router.post("/logout", status_code=204)
def logout(response: Response):
    _clear_cookies(response)


@router.post("/logout-all", status_code=204)
def logout_all(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user.token_version = (user.token_version or 0) + 1
    db.commit()
    _clear_cookies(response)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user