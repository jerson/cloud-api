FROM node:22.23.4-bookworm-slim
LABEL org.opencontainers.image.source="https://github.com/jetkvm/cloud-api"
WORKDIR /usr/src/app

# Prisma needs OpenSSL at runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
# ts-node type-checks at startup, so the @types/* devDependencies are needed at runtime
RUN npm ci

COPY . .
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
