from fastapi import Response

from app.core.config import get_settings

JWT_COOKIE_NAME = "access_token"


def set_jwt_cookie(response: Response, token: str, max_age: int = 60 * 60 * 8) -> None:
    response.set_cookie(
        key=JWT_COOKIE_NAME,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=not get_settings().is_development,
        samesite="lax",
        path="/",
    )


def clear_jwt_cookie(response: Response) -> None:
    response.delete_cookie(key=JWT_COOKIE_NAME, path="/")
