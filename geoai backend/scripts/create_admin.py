"""Create an admin user from the command line.

Usage:
    python scripts/create_admin.py you@example.com yourname yourpassword
"""
import sys
from app.db.session import SessionLocal
from app.db.models.user import User
from app.core.security import hash_password


def main():
    if len(sys.argv) != 4:
        print("Usage: python scripts/create_admin.py <email> <username> <password>")
        sys.exit(1)

    email, username, password = sys.argv[1], sys.argv[2], sys.argv[3]

    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == email).first():
            print(f"User {email} already exists.")
            return

        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            role="admin",
        )
        db.add(user)
        db.commit()
        print(f"Created admin user {email}")
    finally:
        db.close()


if __name__ == "__main__":
    main()