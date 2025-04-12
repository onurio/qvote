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

# Expose the port
EXPOSE 8443

# Set up environment variable for Deno to allow scripts
ENV DENO_ALLOW_SCRIPTS=npm:@prisma/engines,npm:prisma,npm:@prisma/client

# Run the application with Prisma scripts allowed
CMD ["sh", "-c", "deno run --allow-net --allow-env --allow-read --allow-run --allow-ffi --allow-scripts=npm:@prisma/engines@6.4.1,npm:prisma@6.4.1,npm:@prisma/client@6.4.1 main.ts"]

