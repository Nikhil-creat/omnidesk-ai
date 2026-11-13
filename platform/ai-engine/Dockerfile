FROM python:3.11-slim
RUN useradd -u 10001 app && pip install --no-cache-dir fastapi uvicorn pydantic
COPY main.py /app/main.py
USER app
WORKDIR /app
HEALTHCHECK CMD python -c "import urllib.request as u;u.urlopen('http://localhost:8000/health')"
CMD ["uvicorn","main:app","--host","0.0.0.0","--port","8000"]
