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

# Build the NestJS application
RUN npm run build
# # Build the NestJS application and verify output exists
# RUN rm -rf dist && \
#     npm run build && \
#     test -f dist/main.js || (echo "ERROR: dist/main.js not found after build!" && exit 1)

EXPOSE 3001

CMD ["npm", "run", "start:prod"]

