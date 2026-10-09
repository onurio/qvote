FROM denoland/deno:2.2.3

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Copy configuration files first
COPY deno.json deno.lock ./
COPY prisma/ ./prisma/

# Generate Prisma client with script permissions
RUN deno run --allow-all --allow-scripts=npm:@prisma/engines@6.4.1,npm:prisma@6.4.1,npm:@prisma/client@6.4.1 npm:prisma@6.4.1 generate

# Copy the rest of the application code
COPY . .

# Cache the dependencies
RUN deno cache --reload main.ts

# Expose the port (Cloud Run injects PORT env var that the container should listen on)
EXPOSE ${PORT:-8443}

# Set up environment variable for Deno to allow scripts
ENV DENO_ALLOW_SCRIPTS=npm:@prisma/engines,npm:prisma,npm:@prisma/client

# Schema changes are applied out of band (deno task prisma:push), not on every cold start
CMD ["deno", "task", "start"]

