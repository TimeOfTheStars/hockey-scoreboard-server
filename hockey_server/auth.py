import jwt
from fastapi import HTTPException, Request, status

AUTH_COOKIE = "hockey_auth"


def encode_jwt(user_id: int, secret: str, exp_unix: int) -> str:
    return jwt.encode(
        {"sub": str(user_id), "exp": exp_unix},
        secret,
        algorithm="HS256",
    )


def decode_jwt(token: str, secret: str) -> int:
    try:
        data = jwt.decode(token, secret, algorithms=["HS256"])
        return int(data["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="login required",
        )


def require_user_id(request: Request) -> int:
    secret: str = request.app.state.jwt_secret
    token = request.cookies.get(AUTH_COOKIE)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="login required",
        )
    return decode_jwt(token, secret)


ROLE_ADMIN = "admin"
ROLE_OPERATOR = "operator"


def require_admin_role(role: str) -> None:
    if role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin only",
        )
