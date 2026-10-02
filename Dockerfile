# syntax=docker/dockerfile:1.7
FROM golang:1.25-alpine AS build
WORKDIR /src
RUN apk add --no-cache ca-certificates git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG VERSION=dev
ARG COMMIT=unknown
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
    -o /out/echo-admin ./cmd/server
RUN CGO_ENABLED=0 GOOS=linux go build \
    -trimpath \
    -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" \
    -o /out/echo-admin-cli ./cmd/echo-admin

FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata wget && addgroup -S app && adduser -S -G app app
WORKDIR /app
COPY --from=build /out/echo-admin /app/echo-admin
COPY --from=build /out/echo-admin-cli /app/echo-admin-cli
RUN mkdir -p /app/data/uploads && chown -R app:app /app
USER app
EXPOSE 8080
ENTRYPOINT ["/app/echo-admin"]
