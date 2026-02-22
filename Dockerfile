# Stage 1: Build the application
FROM node:18-bookworm-slim AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

# Copy the rest of the application source code
COPY . .

# Build the Next.js application
RUN npm run build

# Stage 2: Create the production image with Python support
FROM node:18-bookworm-slim

# Install Python and system dependencies for ML libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    gcc \
    g++ \
    make \
    cmake \
    libffi-dev \
    libopenblas-dev \
    libjpeg62-turbo-dev \
    zlib1g-dev \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production --legacy-peer-deps

# Copy Python requirements and install Python dependencies
COPY requirements.txt ./
RUN pip3 install --no-cache-dir --upgrade pip && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy the built Next.js application
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# Copy Python detection scripts and model files
COPY threat_detector.py ./
COPY best.pt ./
COPY yolov8n.pt ./
COPY data.yaml ./

# Create temp directories for detection processing
RUN mkdir -p temp/input temp/output

# Expose the port the app runs on
EXPOSE 10000

# Start the application
CMD ["npm", "start"]
