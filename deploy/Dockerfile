# -----------------------------------------------------------------------------
# Runtime image with Python, Chromium, and app.
#
# 注意：前端 console 已迁移到同层级仓库 AIWork-OS-frontend，
# 在镜像外预先构建（见 scripts/docker_build.sh），构建产物放在
# 后端仓库的 console-dist/ 目录，由本 Dockerfile 直接 COPY 进镜像。
# -----------------------------------------------------------------------------
FROM agentscope-registry.ap-southeast-1.cr.aliyuncs.com/agentscope/node:slim

# ENV variables
ENV NODE_ENV=production
ENV WORKSPACE_DIR=/app
ENV AIWORK_WORKING_DIR=/app/working
ENV AIWORK_SECRET_DIR=/app/working.secret
ENV AIWORK_BACKUP_DIR=/app/working.backups

# 时区设置
ENV TZ=Asia/Shanghai

# Channel filtering: use AIWORK_DISABLED_CHANNELS (exclusion, recommended)
# or AIWORK_ENABLED_CHANNELS (whitelist). Override at runtime with -e.
ARG AIWORK_DISABLED_CHANNELS="imessage"
ENV AIWORK_DISABLED_CHANNELS=${AIWORK_DISABLED_CHANNELS}
ARG AIWORK_ENABLED_CHANNELS=""
ENV AIWORK_ENABLED_CHANNELS=${AIWORK_ENABLED_CHANNELS}

ARG DEBIAN_FRONTEND=noninteractive

# 使用阿里云镜像源加速 apt-get（兼容 Debian 和 Ubuntu）
RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources && \
        sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list.d/ubuntu.sources ]; then \
        sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources && \
        sed -i 's|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list.d/ubuntu.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|archive.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list && \
        sed -i 's|security.ubuntu.com|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi

# 合并所有 apt 包安装到一次 apt-get update，减少网络请求和镜像层
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl  \
    tzdata \
    build-essential  \
    libssl-dev  \
    libffi-dev \
    libsqlite3-dev \
    zlib1g-dev \
    libbz2-dev \
    libreadline-dev \
    libncurses5-dev \
    liblzma-dev \
    git  \
    supervisor  \
    logrotate \
    vim  \
    gettext-base \
    xfce4 \
    xfce4-terminal \
    xvfb \
    dbus-x11 \
    fonts-wqy-zenhei \
    fonts-wqy-microhei \
    chromium \
    chromium-sandbox \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libglib2.0-0 \
    libdrm2 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    libu2f-udev \
  && rm -rf /var/lib/apt/lists/*

# 编译安装 Python 3.12.8（使用华为云镜像加速下载）
ARG PYTHON_VERSION=3.12.8
RUN curl -fsSL https://repo.huaweicloud.com/python/${PYTHON_VERSION}/Python-${PYTHON_VERSION}.tgz -o /tmp/python.tgz \
  && tar xzf /tmp/python.tgz -C /tmp \
  && cd /tmp/Python-${PYTHON_VERSION} \
  && ./configure --prefix=/usr/local --enable-shared --with-ensurepip=install LDFLAGS="-Wl,-rpath /usr/local/lib" \
  && make -j$(nproc) \
  && make altinstall \
  && cd / && rm -rf /tmp/python.tgz /tmp/Python-${PYTHON_VERSION} \
  && ln -sf /usr/local/bin/python3.12 /usr/local/bin/python3 \
  && ln -sf /usr/local/bin/pip3.12 /usr/local/bin/pip3 \
  && ldconfig


RUN sed -i 's/^CHROMIUM_FLAGS=""/CHROMIUM_FLAGS="--no-sandbox"/' /usr/bin/chromium

# Playwright: use system Chromium (already installed above).
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
# Avoid Playwright downloading its own browser when executable_path is used.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Indicate running in container (used e.g. for Chromium --no-sandbox).
ENV AIWORK_RUNNING_IN_CONTAINER=1

WORKDIR ${WORKSPACE_DIR}

RUN python3.12 -m venv venv
ENV PATH="/app/venv/bin:$PATH"

# Speed up Python package installation with uv.
COPY --from=agentscope-registry.ap-southeast-1.cr.aliyuncs.com/agentscope/uv:latest /uv /bin/uv
# 使用阿里云 PyPI 镜像加速 pip 安装
ENV UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/

# 先复制依赖声明文件，利用 Docker 缓存层（源码改动不会重新下载依赖）
# JWT 认证需要 PyJWT/redis/sqlalchemy/bcrypt（已内置为核心依赖）
# metrics : /metrics 端点依赖 prometheus-fastapi-instrumentator
COPY pyproject.toml setup.py ./
COPY src/aiwork/__version__.py ./src/aiwork/__version__.py
COPY src/aiwork/__init__.py ./src/aiwork/__init__.py
RUN uv pip install --no-cache-dir --only-binary :all: ".[metrics]" 2>/dev/null \
  || uv pip install --no-cache-dir ".[metrics]"

# 再复制完整源码和前端产物，执行最终安装
COPY src ./src
# Inject pre-built console dist (built outside the image by scripts/docker_build.sh).
COPY console-dist/ ./src/aiwork/console/
RUN uv pip install --no-cache-dir --no-deps . && rm -rf ./build


# AIWork app port (default 8088). Override at runtime with -e AIWORK_PORT=3000.
ENV AIWORK_PORT=8088

COPY deploy/config/supervisord.conf.template /etc/supervisor/conf.d/supervisord.conf.template
COPY deploy/config/aiwork.logrotate /etc/logrotate.d/aiwork
COPY --chmod=755 deploy/entrypoint.sh /entrypoint.sh

# 容器内日志目录（通过 docker-compose 挂载到宿主机 ./logs）
RUN mkdir -p /app/logs && chmod 0755 /app/logs
VOLUME ["/app/logs"]

EXPOSE 8088

CMD ["/entrypoint.sh"]
