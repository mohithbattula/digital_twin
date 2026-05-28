FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (curl is helpful for health checks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to utilize Docker layer caching
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir -r requirements.txt

# Copy all backend source code
COPY . .

# Create uploads directory
RUN mkdir -p uploads/task-docs

# Expose backend port
EXPOSE 8740

# Run FastAPI server with Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8740"]
