FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --no-audit --no-fund

# Copy source
COPY . .

# Build TypeScript
RUN npm run build

# Run as non-root user
USER node

# Start server
CMD ["npm", "start"]

# Expose port
EXPOSE 8080
