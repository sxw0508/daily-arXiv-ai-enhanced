#!/usr/bin/env bash
# 一键部署：Ubuntu / Debian（amd64/arm64），需 root 或 sudo。
#
# 用法示例：
#   export DEPLOY_DOMAIN=paper.example.com
#   export DEPLOY_REPO_URL=https://github.com/you/daily-arXiv-ai-enhanced.git
#   curl -fsSL https://raw.githubusercontent.com/you/daily-arXiv-ai-enhanced/main/scripts/deploy_one_click.sh | sudo -E bash
#
# 或在本仓库内：
#   sudo DEPLOY_DOMAIN=... DEPLOY_REPO_URL=... bash scripts/deploy_one_click.sh
#
# 若代码已在服务器（例如已 git clone），可省略 DEPLOY_REPO_URL，并设：
#   export DEPLOY_SOURCE_DIR=/path/to/daily-arXiv-ai-enhanced
#
# 可选：
#   DEPLOY_DIR=/opt/daily-arxiv-ai          安装根目录（默认）
#   DEPLOY_USER=ubuntu                      运行服务的系统用户（默认 sudo 调用者）
#   DEPLOY_GIT_BRANCH=main                  克隆分支
#   DEPLOY_CERTBOT=1                        安装并申请 Let's Encrypt（需 DEPLOY_LETSENCRYPT_EMAIL）
#   DEPLOY_LETSENCRYPT_EMAIL=you@mail.com
#   DEPLOY_BASIC_AUTH_USER=admin            Nginx 基本认证用户名（与下面密码同时设置才启用）
#   DEPLOY_BASIC_AUTH_PASSWORD=secret

set -euo pipefail

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

if [[ "$(id -u)" -ne 0 ]]; then
  die "请使用 root 或 sudo 执行，例如: sudo -E bash $0"
fi

if [[ -f /etc/os-release ]]; then
  # shellcheck source=/dev/null
  source /etc/os-release
  case "${ID:-}" in
    ubuntu | debian) ;;
    *) die "当前脚本仅针对 Debian/Ubuntu 测试，检测到 ID=${ID:-unknown}，请自行改脚本或手工部署。" ;;
  esac
else
  die "未找到 /etc/os-release，中止。"
fi

: "${DEPLOY_DOMAIN:?请设置 DEPLOY_DOMAIN（域名或公网 IP，用于 Nginx server_name）}"

DEPLOY_DIR="${DEPLOY_DIR:-/opt/daily-arxiv-ai}"
APP_DIR="${DEPLOY_DIR}/app"
DEPLOY_USER="${DEPLOY_USER:-${SUDO_USER:-}}"
[[ -n "$DEPLOY_USER" ]] || die "无法确定运行用户，请设置 DEPLOY_USER=某个系统用户"
id "$DEPLOY_USER" &>/dev/null || die "用户不存在: $DEPLOY_USER"

DEPLOY_GIT_BRANCH="${DEPLOY_GIT_BRANCH:-main}"
DEPLOY_SOURCE_DIR="${DEPLOY_SOURCE_DIR:-}"
DEPLOY_REPO_URL="${DEPLOY_REPO_URL:-}"
DEPLOY_CERTBOT="${DEPLOY_CERTBOT:-0}"
DEPLOY_LETSENCRYPT_EMAIL="${DEPLOY_LETSENCRYPT_EMAIL:-}"

mkdir -p "$DEPLOY_DIR"
chown "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_DIR"

log "安装系统包（nginx、git、curl、openssl）…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git curl openssl

if [[ -n "${DEPLOY_BASIC_AUTH_USER:-}" && -n "${DEPLOY_BASIC_AUTH_PASSWORD:-}" ]]; then
  apt-get install -y apache2-utils
fi
if [[ -n "$DEPLOY_SOURCE_DIR" ]]; then
  apt-get install -y rsync
fi

UV_BIN="/usr/local/bin/uv"
if [[ ! -x "$UV_BIN" ]]; then
  log "安装 uv 到 /usr/local/bin …"
  curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh
fi
[[ -x "$UV_BIN" ]] || die "uv 未正确安装到 $UV_BIN"

deploy_code() {
  if [[ -n "$DEPLOY_SOURCE_DIR" ]]; then
    [[ -d "$DEPLOY_SOURCE_DIR" ]] || die "DEPLOY_SOURCE_DIR 不是目录: $DEPLOY_SOURCE_DIR"
    [[ -f "$DEPLOY_SOURCE_DIR/local_console.py" ]] || die "在 $DEPLOY_SOURCE_DIR 未找到 local_console.py"
    log "从本地目录同步代码: $DEPLOY_SOURCE_DIR -> $APP_DIR"
    rsync -a --delete \
      --exclude '.git' \
      --exclude '__pycache__' \
      --exclude '.venv' \
      "$DEPLOY_SOURCE_DIR/" "$APP_DIR/"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
    return
  fi

  if [[ -d "$APP_DIR/.git" ]] || [[ -f "$APP_DIR/local_console.py" ]]; then
    log "已存在 $APP_DIR ，跳过克隆（如需重新克隆请先删除该目录）。"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
    return
  fi

  [[ -n "$DEPLOY_REPO_URL" ]] || die "请设置 DEPLOY_REPO_URL 克隆仓库，或设置 DEPLOY_SOURCE_DIR 指向已有代码目录"
  log "克隆仓库: $DEPLOY_REPO_URL (分支: $DEPLOY_GIT_BRANCH)"
  sudo -u "$DEPLOY_USER" git clone --depth 1 -b "$DEPLOY_GIT_BRANCH" "$DEPLOY_REPO_URL" "$APP_DIR" \
    || sudo -u "$DEPLOY_USER" git clone --depth 1 "$DEPLOY_REPO_URL" "$APP_DIR"
}

deploy_code

log "uv sync（Python 依赖）…"
sudo -u "$DEPLOY_USER" bash -lc "cd '$APP_DIR' && '$UV_BIN' sync --locked"

log "校验 local_console …"
sudo -u "$DEPLOY_USER" bash -lc "cd '$APP_DIR' && '$UV_BIN' run python -c 'import local_console'"

HTPASSWD_FILE="/etc/nginx/daily-arxiv-console.htpasswd"
AUTH_BLOCK=""
if [[ -n "${DEPLOY_BASIC_AUTH_USER:-}" && -n "${DEPLOY_BASIC_AUTH_PASSWORD:-}" ]]; then
  log "写入 Nginx 基本认证: $HTPASSWD_FILE"
  htpasswd -nbBC 10 "$DEPLOY_BASIC_AUTH_USER" "$DEPLOY_BASIC_AUTH_PASSWORD" >"$HTPASSWD_FILE"
  chmod 640 "$HTPASSWD_FILE"
  chown root:www-data "$HTPASSWD_FILE"
  AUTH_BLOCK=$'    auth_basic "Daily arXiv console";\n    auth_basic_user_file '"$HTPASSWD_FILE"';'
fi

NGINX_SITE="/etc/nginx/sites-available/daily-arxiv-console"
log "写入 Nginx 配置: $NGINX_SITE"
cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DEPLOY_DOMAIN};

${AUTH_BLOCK}

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        client_max_body_size 50m;
    }
}
EOF

ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/daily-arxiv-console
if [[ -f /etc/nginx/sites-enabled/default ]]; then
  rm -f /etc/nginx/sites-enabled/default
fi

nginx -t

SERVICE_FILE="/etc/systemd/system/daily-arxiv-console.service"
log "写入 systemd 单元: $SERVICE_FILE"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Daily arXiv AI local console (static + /api/control)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${DEPLOY_USER}
Group=${DEPLOY_USER}
WorkingDirectory=${APP_DIR}
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=${UV_BIN} run python local_console.py
Restart=on-failure
RestartSec=5
# 爬取/AI 可能较久，避免过早被 systemd 杀掉（按需调大）
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable daily-arxiv-console.service
systemctl restart daily-arxiv-console.service
systemctl reload nginx

if [[ "$DEPLOY_CERTBOT" == "1" ]]; then
  [[ "$DEPLOY_DOMAIN" =~ ^[0-9.]+$ ]] && die "Let's Encrypt 需要域名，当前 DEPLOY_DOMAIN 看起来像 IP"
  [[ -n "$DEPLOY_LETSENCRYPT_EMAIL" ]] || die "启用 DEPLOY_CERTBOT=1 时请设置 DEPLOY_LETSENCRYPT_EMAIL"
  log "安装 certbot 并申请证书…"
  apt-get install -y certbot python3-certbot-nginx
  certbot --nginx -d "$DEPLOY_DOMAIN" --non-interactive --agree-tos -m "$DEPLOY_LETSENCRYPT_EMAIL" --redirect
fi

log "部署完成。"
log "  应用目录: $APP_DIR"
log "  服务状态: systemctl status daily-arxiv-console"
log "  日志: journalctl -u daily-arxiv-console -f"
log "  浏览器: http://${DEPLOY_DOMAIN}/"
log "请在服务器创建 daily_arxiv/config.local.yaml 写入 API 密钥等敏感项（勿提交 Git）。"
if [[ -z "${DEPLOY_BASIC_AUTH_USER:-}" ]]; then
  log "提示: 未启用 Nginx 基本认证。公网强烈建议设置 DEPLOY_BASIC_AUTH_USER / DEPLOY_BASIC_AUTH_PASSWORD 或 VPN/IP 白名单。"
fi
