#!/usr/bin/env bash
# 一键部署：把 local_console.py（静态前端 + /api/control/*）直接绑到本机指定端口。
#
# 本脚本不装、不依赖 Nginx；控制台进程自身直接监听对外端口。
# 适合「就在本机跑、浏览器直接打开 IP:端口」的场景。
#
# 默认行为：
#   - 监听 0.0.0.0:23324
#   - systemd 单元名 daily-arxiv-console，开机自启
#   - 用项目自带 .venv/bin/python（不依赖 uv 在 systemd 环境下可用）
#   - 部署前若端口被同名 http.server 或旧 systemd 单元占用，会停掉再启
#
# 环境变量可覆盖：
#   APP_DIR=/root_1/sxw/daily-arXiv-ai-enhanced
#   LISTEN_HOST=0.0.0.0
#   LISTEN_PORT=23324
#   SERVICE_NAME=daily-arxiv-console
#   RUN_USER=root
#   FRONTEND_PASSWORD=mega123456     # 设置前端登录密码（写入 js/auth-config.js 的 SHA-256）
#                                    # 留空则跳过密码改写
#
# 用法：
#   sudo bash scripts/deploy_local_console.sh
#   sudo LISTEN_PORT=23324 FRONTEND_PASSWORD='your-pass' bash scripts/deploy_local_console.sh

set -euo pipefail

log() { printf '\n[%s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "$(id -u)" -ne 0 ]]; then
  die "请用 root 或 sudo 执行：sudo bash $0"
fi

APP_DIR="${APP_DIR:-/root_1/sxw/daily-arXiv-ai-enhanced}"
LISTEN_HOST="${LISTEN_HOST:-0.0.0.0}"
LISTEN_PORT="${LISTEN_PORT:-23324}"
SERVICE_NAME="${SERVICE_NAME:-daily-arxiv-console}"
RUN_USER="${RUN_USER:-root}"
FRONTEND_PASSWORD="${FRONTEND_PASSWORD:-mega123456}"

[[ -d "$APP_DIR" ]] || die "项目目录不存在: $APP_DIR"
[[ -f "$APP_DIR/local_console.py" ]] || die "在 $APP_DIR 未找到 local_console.py"
id "$RUN_USER" &>/dev/null || die "用户不存在: $RUN_USER"

if ! [[ "$LISTEN_PORT" =~ ^[0-9]+$ ]] || (( LISTEN_PORT < 1 || LISTEN_PORT > 65535 )); then
  die "LISTEN_PORT 非法: $LISTEN_PORT"
fi

# 1) 解析 Python 解释器：优先用项目 .venv；否则用 uv sync 生成
VENV_PY="$APP_DIR/.venv/bin/python"
if [[ ! -x "$VENV_PY" ]]; then
  log "未发现 $VENV_PY，尝试用 uv 同步依赖…"
  UV_BIN="$(command -v uv || true)"
  [[ -z "$UV_BIN" && -x /usr/local/bin/uv ]] && UV_BIN=/usr/local/bin/uv
  [[ -z "$UV_BIN" && -x /root/miniconda3/bin/uv ]] && UV_BIN=/root/miniconda3/bin/uv
  [[ -n "$UV_BIN" ]] || die "未找到 uv，且 $VENV_PY 不存在；请先 'uv sync --locked' 或安装 uv。"
  sudo -u "$RUN_USER" bash -lc "cd '$APP_DIR' && '$UV_BIN' sync --locked"
fi
[[ -x "$VENV_PY" ]] || die "依赖同步后仍未找到 $VENV_PY"

log "校验 local_console 可导入…"
if ! sudo -u "$RUN_USER" "$VENV_PY" -c "import sys; sys.path.insert(0, '$APP_DIR'); import local_console"; then
  die "local_console 导入失败，检查依赖是否就绪。"
fi

# 2) 设置前端登录密码（写 SHA-256 到 js/auth-config.js）
if [[ -n "$FRONTEND_PASSWORD" ]]; then
  AUTH_CFG="$APP_DIR/js/auth-config.js"
  [[ -f "$AUTH_CFG" ]] || die "未找到 $AUTH_CFG"
  NEW_HASH="$(printf '%s' "$FRONTEND_PASSWORD" | sha256sum | awk '{print $1}')"
  log "写入前端登录密码哈希到 $AUTH_CFG（${#FRONTEND_PASSWORD} 字符密码）"
  python3 - "$AUTH_CFG" "$NEW_HASH" <<'PY'
import re, sys, pathlib
path = pathlib.Path(sys.argv[1]); new_hash = sys.argv[2]
text = path.read_text()
new_text, n = re.subn(
    r"passwordHash:\s*'[0-9a-fA-F]*'",
    f"passwordHash: '{new_hash}'",
    text,
    count=1,
)
if not n:
    sys.exit("auth-config.js 中未找到 passwordHash 字段，未修改。")
path.write_text(new_text)
PY
fi

# 3) 释放端口：杀死同目录下的旧 http.server / local_console 进程
log "检查端口 $LISTEN_PORT 占用情况…"
if ss -tlnp 2>/dev/null | grep -q "[:.]${LISTEN_PORT}\b"; then
  PIDS="$(ss -tlnp 2>/dev/null | awk -v p=":${LISTEN_PORT}" '
    $4 ~ p"$" {
      if (match($0, /pid=[0-9]+/)) {
        s = substr($0, RSTART+4, RLENGTH-4); print s
      }
    }' | sort -u)"
  for pid in $PIDS; do
    [[ -r "/proc/$pid/cmdline" ]] || continue
    CMD="$(tr '\0' ' ' < /proc/$pid/cmdline)"
    case "$CMD" in
      *local_console.py*|*"http.server"*"$LISTEN_PORT"*)
        log "停止占用进程 pid=$pid: $CMD"
        kill "$pid" 2>/dev/null || true
        ;;
      *)
        log "警告：端口 $LISTEN_PORT 被无关进程占用 pid=$pid ($CMD)，请人工确认。"
        ;;
    esac
  done
  sleep 1
fi

# 4) 写 systemd 单元
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
log "写入 systemd 单元: $SERVICE_FILE"
cat >"$SERVICE_FILE" <<EOF
[Unit]
Description=Daily arXiv AI local console (static + /api/control) on ${LISTEN_PORT}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${APP_DIR}
Environment=PATH=${APP_DIR}/.venv/bin:/usr/local/bin:/usr/bin:/bin
Environment=DAILY_ARXIV_CONSOLE_HOST=${LISTEN_HOST}
Environment=DAILY_ARXIV_CONSOLE_PORT=${LISTEN_PORT}
ExecStart=${VENV_PY} local_console.py
Restart=on-failure
RestartSec=5
TimeoutStopSec=300

[Install]
WantedBy=multi-user.target
EOF

log "停旧、重载、启动 ${SERVICE_NAME}…"
systemctl daemon-reload
systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
systemctl enable --now "${SERVICE_NAME}.service"

# 5) 验证
sleep 2
if ! systemctl is-active --quiet "${SERVICE_NAME}.service"; then
  log "服务未活跃，日志如下："
  journalctl -u "${SERVICE_NAME}.service" -n 50 --no-pager || true
  die "${SERVICE_NAME} 未能启动"
fi

CODE_INDEX="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${LISTEN_PORT}/" || echo 000)"
CODE_LOGIN="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${LISTEN_PORT}/login.html" || echo 000)"
CODE_API="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${LISTEN_PORT}/api/control/state" || echo 000)"

log "自检结果：/=$CODE_INDEX  /login.html=$CODE_LOGIN  /api/control/state=$CODE_API"
if ! [[ "$CODE_INDEX" == "200" && "$CODE_LOGIN" == "200" && "$CODE_API" == "200" ]]; then
  die "自检失败，请查看 journalctl -u ${SERVICE_NAME} -f"
fi

log "部署完成。"
log "  服务: systemctl status ${SERVICE_NAME}"
log "  日志: journalctl -u ${SERVICE_NAME} -f"
log "  访问: http://127.0.0.1:${LISTEN_PORT}/   或   http://<本机IP>:${LISTEN_PORT}/"
if [[ -n "$FRONTEND_PASSWORD" ]]; then
  log "  前端登录密码已设置（SHA-256 写入 js/auth-config.js）。"
fi
log "  注意: /api/control/* 没有服务端鉴权，仅前端拦截；公网暴露请加防火墙/VPN/反代鉴权。"
