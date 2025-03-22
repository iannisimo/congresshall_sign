# Use the official Node.js image as a base
FROM node:23

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Build the typescript project
RUN npm run build

# Expose the port the app runs on
EXPOSE 5000 

# Command to run the application
CMD ["node", "dist/index.js"]

