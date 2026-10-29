# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl python3 py3-pillow py3-reportlab chromium font-noto && npm install -g tsx
ENV NODE_ENV=development \
    PORT=4000 \
    STORAGE_ROOT=/app/storage
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node package.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node storage/templates ./storage/templates
COPY --chown=node:node templates ./templates
RUN mkdir -p storage/offer-letters storage/certificates storage/receipts storage/uploads && chown -R node:node storage
COPY --chown=node:node docker-entrypoint.sh ./
RUN sed -i 's/\r$//' ./docker-entrypoint.sh && chmod +x ./docker-entrypoint.sh
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/server.js"]
