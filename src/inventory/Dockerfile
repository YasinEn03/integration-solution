FROM node:20-alpine
WORKDIR /srv
COPY package*.json ./
RUN npm ci
COPY . .
CMD ["node", "server.js"]
