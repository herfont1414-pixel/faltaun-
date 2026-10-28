# MaderoSys para servidor propio (Linux). Se construye desde la raíz del proyecto:
#   docker compose -f deploy/docker-compose.yml build
# No incluye SQLite (better-sqlite3): el servidor siempre usa PostgreSQL.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=optional
COPY . .
# Versión que se ve abajo del menú del panel y dirección pública del menú (para los mensajes de WhatsApp).
ARG APP_VERSION=servidor
ARG NEXT_PUBLIC_MENU_URL=
ENV NEXT_PUBLIC_MENU_URL=$NEXT_PUBLIC_MENU_URL
RUN echo "$APP_VERSION" > .maderosys-version && npm run build && npm prune --omit=dev --omit=optional

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/data ./data
COPY --chown=node:node --from=build /app/db ./db
COPY --chown=node:node --from=build /app/next.config.mjs ./next.config.mjs
COPY --chown=node:node --from=build /app/.maderosys-version ./.maderosys-version
EXPOSE 3000
USER node
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
