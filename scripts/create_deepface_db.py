"""Create deepface_user and the deepface database for local development."""

from __future__ import annotations

import getpass
import sys

import psycopg


def main() -> int:
    postgres_password = sys.argv[1] if len(sys.argv) > 1 else getpass.getpass(
        "Password for PostgreSQL user 'postgres': "
    )

    admin = psycopg.connect(
        host="localhost",
        port=5432,
        dbname="postgres",
        user="postgres",
        password=postgres_password,
        connect_timeout=5,
    )
    admin.autocommit = True
    cur = admin.cursor()

    cur.execute(
        """
        DO $$ BEGIN
            IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'deepface_user') THEN
                CREATE USER deepface_user WITH PASSWORD 'deepface_pass';
            ELSE
                ALTER USER deepface_user WITH PASSWORD 'deepface_pass';
            END IF;
        END $$;
        """
    )

    cur.execute("SELECT 1 FROM pg_database WHERE datname = 'deepface'")
    if cur.fetchone() is None:
        cur.execute("CREATE DATABASE deepface OWNER deepface_user")

    cur.execute("GRANT ALL PRIVILEGES ON DATABASE deepface TO deepface_user")
    admin.close()

    verify = psycopg.connect(
        host="localhost",
        port=5432,
        dbname="deepface",
        user="deepface_user",
        password="deepface_pass",
        connect_timeout=5,
    )
    verify.close()
    print("OK: postgresql://deepface_user:deepface_pass@localhost:5432/deepface")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except psycopg.OperationalError as exc:
        print(f"Setup failed: {exc}", file=sys.stderr)
        print(
            "Use the password you chose when installing PostgreSQL 18 yesterday.",
            file=sys.stderr,
        )
        raise SystemExit(1) from exc
