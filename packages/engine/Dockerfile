FROM rust:1.78-bookworm AS builder
WORKDIR /app
COPY Cargo.toml build.rs ./
COPY proto ./proto
COPY src ./src
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/blamr-engine /usr/local/bin/blamr-engine
EXPOSE 50051
CMD ["blamr-engine"]
