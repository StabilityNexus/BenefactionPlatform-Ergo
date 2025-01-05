# Use the official Node.js image as the base image
FROM node:20

# Set the working directory
# WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the Svelte app
RUN npm run build

# Use a lightweight web server to serve the static files
FROM nginx:alpine

# Copy the built files from the previous stage
COPY --from=0 /app/build /usr/share/nginx/html

# Expose port 80
# EXPOSE 80

# Start the web server
# CMD ["nginx", "-g", "daemon off;"]