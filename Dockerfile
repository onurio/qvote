FROM denoland/deno:latest

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Tell Prisma to use OpenSSL 3.0
# ENV PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1
# ENV PRISMA_CLI_QUERY_ENGINE_TYPE=binary
# ENV PRISMA_CLIENT_ENGINE_TYPE=binary

# Cache the dependencies
COPY deno.json deno.lock ./
RUN deno cache main.ts

# Copy the rest of the application code
COPY . .

# Expose the port
EXPOSE 8080

# Run the application
CMD ["task", "start"]

