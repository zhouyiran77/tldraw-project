FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --registry https://registry.npmmirror.com

COPY . .

EXPOSE 5173

CMD ["npx", "vite", "--host", "0.0.0.0"]
