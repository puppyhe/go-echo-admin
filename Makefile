APP_NAME ?= echo-admin
GO ?= go
GOFLAGS ?=
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

.PHONY: help init dev test lint fmt build docker-up docker-down migrate upgrade-plan upgrade upgrade-status backup seed
help:
	@printf '%s\n' \
	  'make init        Generate a local .env with safe development defaults' \
	  'make dev         Start the API locally' \
	  'make test        Run Go tests' \
	  'make fmt         Format Go sources' \
	  'make build       Build the API binary' \
	  'make docker-up   Start MySQL and Redis' \
	  'make docker-down Stop local dependencies' \
	  'make migrate     Apply database migrations' \
	  'make upgrade-plan Show the pending production schema contract' \
	  'make upgrade     Apply the production schema contract' \
	  'make backup      Create a MySQL backup before upgrading' \
	  'make seed ADMIN_PASSWORD=...  Load development seed data'

init:
	$(GO) run ./cmd/echo-admin init

dev:
	$(GO) run ./cmd/server

test:
	$(GO) test ./...

lint:
	$(GO) vet ./...

fmt:
	$(GO) fmt ./...

build:
	CGO_ENABLED=0 $(GO) build -trimpath -ldflags "-X main.version=$(VERSION)" -o bin/$(APP_NAME) ./cmd/server

docker-up:
	docker compose up -d mysql redis

docker-down:
	docker compose down

migrate:
	$(GO) run ./cmd/echo-admin migrate

upgrade-plan:
	$(GO) run ./cmd/echo-admin upgrade plan

upgrade-status:
	$(GO) run ./cmd/echo-admin upgrade status

upgrade:
	$(GO) run ./cmd/echo-admin upgrade apply

backup:
	$(GO) run ./cmd/echo-admin backup $(if $(BACKUP_OUTPUT),--output "$(BACKUP_OUTPUT)")

seed:
	ECHO_ADMIN_ADMIN_PASSWORD="$(ADMIN_PASSWORD)" $(GO) run ./cmd/echo-admin seed
