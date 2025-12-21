# Use a slim Python image
FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffering logs
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONIOENCODING=UTF-8
ENV PIP_NO_CACHE_DIR=1
ENV APP_HOME=/app
ENV PORT=8000

# Create app directory
WORKDIR $APP_HOME

# Copy requirements first for caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the project
COPY . .

RUN mkdir -p /app/uploads \
    && chmod 755 /app/uploads


# Create non-root user
RUN useradd -m deployuser \
    && chown -R deployuser:deployuser $APP_HOME

USER deployuser

# Expose port (modify if you use something other than 5000)
EXPOSE $PORT

# Start your app (update the command if using FastAPI/Uvicorn)
CMD gunicorn -w 4 app:app -b 0.0.0.0:$PORT

