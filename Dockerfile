FROM docker.io/node:20-slim

WORKDIR /app

LABEL maintainer="Oculair Media"
LABEL description="Letta OpenCode Plugin - MCP server for task delegation to OpenCode"
LABEL version="0.1.0"

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

RUN npm prune --production

RUN groupadd -r letta && useradd -r -g letta letta
RUN chown -R letta:letta /app
USER letta

EXPOSE 3500

ARG MCP_PORT=3500
ARG NODE_ENV=production
ENV MCP_PORT=${MCP_PORT}
ENV NODE_ENV=${NODE_ENV}
ENV MCP_HOST=0.0.0.0

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${MCP_PORT}/health || exit 1

CMD ["node", "dist/server.js"]
