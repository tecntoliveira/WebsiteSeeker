FROM python:3.12-slim-bookworm

ARG INSTALL_OPENCODE=false

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/opt/agentic-os

WORKDIR /opt/agentic-os

RUN apt-get update \
  && apt-get install --no-install-recommends -y ca-certificates git \
  && if [ "$INSTALL_OPENCODE" = "true" ]; then \
       apt-get install --no-install-recommends -y nodejs npm \
       && npm install --global @opencode/cli; \
     fi \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir --upgrade pip \
  && python -m pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /opt/agentic-os/audit /opt/agentic-os/backups /opt/agentic-os/data /opt/agentic-os/brain /workspaces/tasks /workspaces/curb \
  && useradd --create-home --uid 10002 --shell /usr/sbin/nologin agentic \
  && chown -R agentic:agentic /opt/agentic-os /workspaces

USER agentic
EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=6 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/status', timeout=3)"

CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
