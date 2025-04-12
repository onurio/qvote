FROM denoland/deno:latest

WORKDIR /app

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl

# Cache the dependencies
COPY deno.json deno.lock ./
RUN deno cache main.ts

# Copy the rest of the application code
COPY . .

# Expose the port
EXPOSE 8443

# Generate Prisma client and run the application
CMD ["sh", "-c", "deno task prisma:generate && deno run --allow-net --allow-env --allow-read --allow-run --allow-ffi --watch main.ts"]

