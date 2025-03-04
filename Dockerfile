FROM denoland/deno:latest

WORKDIR /app

# Cache the dependencies
COPY deno.json deno.lock ./
RUN deno cache main.ts

# Copy the rest of the application code
COPY . .

# Expose the port
EXPOSE 8080

# Run the application
CMD ["task", "start"]