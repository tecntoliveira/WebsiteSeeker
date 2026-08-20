FROM node:20-bookworm-slim AS build

WORKDIR /opt/curb/app

RUN apt-get update \
  && apt-get install --no-install-recommends -y python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY curb/package.json ./package.json
RUN npm install

COPY curb/ ./
RUN npm run build
RUN npx playwright install --with-deps chromium

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /opt/curb/app

COPY --from=build /opt/curb/app/package.json ./package.json
COPY --from=build /opt/curb/app/node_modules ./node_modules
COPY --from=build /opt/curb/app/.next ./.next
COPY --from=build /opt/curb/app/public ./public
COPY --from=build /opt/curb/app/next.config.ts ./next.config.ts
COPY --from=build /opt/curb/app/tsconfig.json ./tsconfig.json
COPY --from=build /opt/curb/app/src ./src
COPY prompts/ ../prompts/

RUN npx playwright install --with-deps chromium \
  && mkdir -p /var/lib/curb /opt/curb/sites /opt/curb/site-backups /opt/curb/.curb-runtime \
  && useradd --create-home --uid 10001 --shell /usr/sbin/nologin curb \
  && chown -R curb:curb /var/lib/curb /opt/curb/sites /opt/curb/site-backups /opt/curb/.curb-runtime /opt/curb/app /opt/curb/prompts

USER curb
EXPOSE 3000

CMD ["npm", "run", "start"]
