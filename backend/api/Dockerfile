FROM node:22-slim

WORKDIR /app

# Copy package manifests for workspace installation
COPY package.json package-lock.json* ./
COPY backend/shared/package.json ./backend/shared/
COPY backend/api/package.json ./backend/api/
COPY backend/worker/package.json ./backend/worker/
COPY frontend/package.json ./frontend/

# Install dependencies
RUN npm install

# Copy source files
COPY backend/shared ./backend/shared
COPY backend/api ./backend/api

USER node

EXPOSE 4000

CMD ["npm", "run", "start", "-w", "@supportflow/api"]
