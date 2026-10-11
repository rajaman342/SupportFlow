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

# Copy frontend source files
COPY frontend ./frontend

WORKDIR /app/frontend

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
