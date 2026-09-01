DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'deepface_user') THEN
        CREATE USER deepface_user WITH PASSWORD 'deepface_pass';
    ELSE
        ALTER USER deepface_user WITH PASSWORD 'deepface_pass';
    END IF;
END $$;

SELECT 'CREATE DATABASE deepface OWNER deepface_user'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'deepface')\gexec

GRANT ALL PRIVILEGES ON DATABASE deepface TO deepface_user;
