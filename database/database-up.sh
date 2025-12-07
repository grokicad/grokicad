#!/bin/bash

set -e

COMPOSE_FILE="docker-compose.yml"
CONTAINER_NAME="database_db_1"  # Default name from docker-compose

if docker-compose -f $COMPOSE_FILE ps | grep -q "Up"; then
    echo "Database container is already running."
    read -p "Do you want to refresh (stop, remove volumes, and restart)? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Refreshing database..."
        docker-compose -f $COMPOSE_FILE down -v --remove-orphans
        docker-compose -f $COMPOSE_FILE up -d
        echo "Database refreshed and started."
    else
        echo "Keeping existing database running."
    fi
else
    echo "Starting database..."
    docker-compose -f $COMPOSE_FILE up -d
    echo "Database started. Waiting for it to be ready..."
    sleep 5
    # Optional: wait for postgres ready
    until docker-compose -f $COMPOSE_FILE exec db pg_isready ; do
      echo "Waiting for database..."
      sleep 2
    done
    echo "Database is up and running."
fi