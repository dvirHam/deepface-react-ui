-- Run this in pgAdmin Query Tool while connected as the postgres superuser.
-- Do not run the psql-only version if you use pgAdmin.

DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'deepface_user') THEN
        CREATE USER deepface_user WITH PASSWORD 'deepface_pass';
    ELSE
        ALTER USER deepface_user WITH PASSWORD 'deepface_pass';
    END IF;
END $$;

CREATE DATABASE deepface OWNER deepface_user;

GRANT ALL PRIVILEGES ON DATABASE deepface TO deepface_user;
