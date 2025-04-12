FROM denoland/deno:latest

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Copy configuration files first
COPY deno.json deno.lock ./
COPY prisma/ ./prisma/

# Generate Prisma client with script permissions
RUN deno run --allow-all --allow-scripts=npm:@prisma/engines@6.4.1,npm:prisma@6.4.1,npm:@prisma/client@6.4.1 npm:prisma@latest generate

# Cache the dependencies
RUN deno cache --reload main.ts

# Copy the rest of the application code
COPY . .

# Expose the port (Cloud Run injects PORT env var that the container should listen on)
EXPOSE ${PORT:-8443}

# Set up environment variable for Deno to allow scripts
ENV DENO_ALLOW_SCRIPTS=npm:@prisma/engines,npm:prisma,npm:@prisma/client

# First run Prisma migration, then start the application
CMD ["sh", "-c", "deno task prisma:push && deno task start"]

