FROM node:22-alpine AS builder

WORKDIR /app

# Puppeteer's bundled Chrome is glibc-only and cannot run on Alpine; the
# runtime stage installs the distro chromium instead.
ENV PUPPETEER_SKIP_DOWNLOAD=true

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

# ALPINE_MIRROR lets slow regions point at a closer package mirror (see .env.example).
ARG ALPINE_MIRROR=https://dl-cdn.alpinelinux.org/alpine
RUN sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories \
 && apk add --no-cache chromium nss freetype harfbuzz ca-certificates ttf-freefont

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

COPY package*.json ./

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 5001

CMD ["node", "dist/index.js"]
