FROM node:24-alpine

# Install OpenSSL, curl (for healthchecks), and other dependencies
RUN apk add --no-cache openssl openssl-dev curl

WORKDIR /app

# Copy dependency files first for better Docker layer caching
# This allows npm install to be cached if only source code changes
COPY package.json ./

# Copy Prisma schema before npm install so it's available during build
# Prisma generate runs as part of the build process
COPY prisma ./prisma

RUN npm install --no-audit --no-fund

# Copy source code after dependencies are installed
COPY . .

# Generate Prisma client before build (ensure it's available for TypeScript compilation)
RUN npm run prisma:generate

# Build the NestJS application
RUN npm run build

# Copy generated Prisma client to dist/generated so runtime imports resolve correctly
# The compiled code expects generated/prisma relative to dist/src/ directories
RUN mkdir -p dist/generated && cp -r generated/prisma dist/generated/
# # Build the NestJS application and verify output exists
# RUN rm -rf dist && \
#     npm run build && \
#     test -f dist/src/main.js || (echo "ERROR: dist/src/main.js not found after build!" && exit 1)

EXPOSE 3000

CMD ["npm", "run", "start:prod"]

