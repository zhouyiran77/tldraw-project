FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --registry https://registry.npmmirror.com

COPY . .

EXPOSE 3003

CMD ["npx", "vite", "--host", "0.0.0.0", "--port", "3003"]
