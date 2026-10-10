FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS builder
COPY . .
ARG NATIVE_APP_SCHEME=com.soylai.forms
ENV NEXT_PUBLIC_NATIVE_APP_SCHEME=$NATIVE_APP_SCHEME
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nextjs && useradd --system --uid 1001 --gid nextjs nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/azure/migrations ./azure/migrations
COPY --from=builder --chown=nextjs:nextjs /app/scripts/azure/migrate.mjs /app/scripts/azure/bootstrap-database.mjs ./scripts/azure/
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
