FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Create a volume for token storage
VOLUME /app/data

# Expose the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
