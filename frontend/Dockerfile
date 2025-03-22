# Step 1: Use a Node.js image to build the app
FROM node:23

# Set working directory inside the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app’s source code
COPY . .

# Build the app
RUN npm run build

# Expose the port serve will use
EXPOSE 5001 

# Install serve globally to serve the build
RUN npm add -g serve

# Serve the built app
CMD ["serve", "-s", "dist", "-l", "5001"]
