#!/bin/bash

set -e

echo "Creating new database (this will remove existing data)..."

docker-compose down -v --remove-orphans || true
docker-compose up -d
echo "Waiting for database to initialize..."
sleep 10
until docker-compose exec db pg_isready ; do
  echo "Waiting for database..."
  sleep 2
done
echo "New database created and tables initialized via init.sql."