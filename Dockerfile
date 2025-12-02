FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build



# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
