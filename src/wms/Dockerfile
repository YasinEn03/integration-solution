FROM node:20-alpine
WORKDIR /app
COPY . .

RUN npm run build
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
CMD ["node", "dist/main.js"]
