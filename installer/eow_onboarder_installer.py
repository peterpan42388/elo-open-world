#!/usr/bin/env python3
import base64
import hashlib
import json
import os
import platform
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import webbrowser
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, List, Optional

import requests
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QListWidget,
    QMessageBox,
    QProgressBar,
    QPushButton,
    QStackedWidget,
    QTextEdit,
    QToolButton,
    QVBoxLayout,
    QWidget,
)


MODEL_FALLBACK_CATALOG = {
    "contract": "elo-agent-onboarder.model-catalog.v1",
    "providers": [
        {
            "providerId": "openai",
            "displayName": "OpenAI",
            "website": "https://platform.openai.com",
            "models": [
                {"modelId": "gpt-4.1", "displayName": "GPT-4.1", "traits": ["coding", "reasoning", "tool-use"]},
                {"modelId": "gpt-4o", "displayName": "GPT-4o", "traits": ["multimodal", "realtime", "balanced"]},
                {"modelId": "gpt-4o-mini", "displayName": "GPT-4o mini", "traits": ["low-cost", "fast", "general"]},
            ],
        },
        {
            "providerId": "anthropic",
            "displayName": "Anthropic",
            "website": "https://console.anthropic.com",
            "models": [
                {
                    "modelId": "claude-3-7-sonnet-latest",
                    "displayName": "Claude 3.7 Sonnet",
                    "traits": ["long-context", "analysis", "writing"],
                },
                {
                    "modelId": "claude-3-5-haiku-latest",
                    "displayName": "Claude 3.5 Haiku",
                    "traits": ["fast", "cost-efficient", "assistant"],
                },
            ],
        },
        {
            "providerId": "google",
            "displayName": "Google",
            "website": "https://aistudio.google.com",
            "models": [
                {"modelId": "gemini-2.5-pro", "displayName": "Gemini 2.5 Pro", "traits": ["reasoning", "multimodal", "research"]},
                {"modelId": "gemini-2.5-flash", "displayName": "Gemini 2.5 Flash", "traits": ["speed", "low-latency", "assistant"]},
            ],
        },
        {
            "providerId": "deepseek",
            "displayName": "DeepSeek",
            "website": "https://platform.deepseek.com",
            "models": [
                {"modelId": "deepseek-chat", "displayName": "DeepSeek Chat", "traits": ["general", "low-cost", "chat"]},
                {"modelId": "deepseek-reasoner", "displayName": "DeepSeek Reasoner", "traits": ["reasoning", "math", "problem-solving"]},
            ],
        },
        {
            "providerId": "moonshot",
            "displayName": "Moonshot (Kimi)",
            "website": "https://platform.moonshot.cn",
            "models": [
                {"modelId": "moonshot-v1-8k", "displayName": "Moonshot v1 8k", "traits": ["chat", "general", "cost"]},
                {"modelId": "moonshot-v1-128k", "displayName": "Moonshot v1 128k", "traits": ["long-context", "research", "analysis"]},
            ],
        },
        {
            "providerId": "qwen",
            "displayName": "Qwen",
            "website": "https://dashscope.aliyun.com",
            "models": [
                {"modelId": "qwen-plus", "displayName": "Qwen Plus", "traits": ["multilingual", "balanced", "assistant"]},
                {"modelId": "qwen-max", "displayName": "Qwen Max", "traits": ["strong-reasoning", "coding", "complex"]},
            ],
        },
        {
            "providerId": "meta",
            "displayName": "Meta (Llama API Compatible)",
            "website": "https://www.llama.com",
            "models": [
                {"modelId": "llama-3.3-70b-instruct", "displayName": "Llama 3.3 70B Instruct", "traits": ["open-weights", "coding", "assistant"]}
            ],
        },
        {
            "providerId": "mistral",
            "displayName": "Mistral",
            "website": "https://console.mistral.ai",
            "models": [
                {"modelId": "mistral-large-latest", "displayName": "Mistral Large", "traits": ["reasoning", "enterprise", "analysis"]},
                {"modelId": "mistral-small-latest", "displayName": "Mistral Small", "traits": ["fast", "low-cost", "chat"]},
            ],
        },
        {
            "providerId": "xai",
            "displayName": "xAI",
            "website": "https://console.x.ai",
            "models": [
                {"modelId": "grok-3-mini", "displayName": "Grok 3 Mini", "traits": ["chat", "fast", "reasoning"]},
                {"modelId": "grok-3", "displayName": "Grok 3", "traits": ["deep-reasoning", "knowledge", "assistant"]},
            ],
        },
        {
            "providerId": "azure-openai",
            "displayName": "Azure OpenAI",
            "website": "https://portal.azure.com",
            "models": [
                {
                    "modelId": "gpt-4.1 (deployment)",
                    "displayName": "GPT-4.1 Deployment",
                    "traits": ["enterprise", "governance", "secure"],
                }
            ],
        },
        {
            "providerId": "openrouter",
            "displayName": "OpenRouter",
            "website": "https://openrouter.ai",
            "models": [
                {"modelId": "openrouter/auto", "displayName": "OpenRouter Auto", "traits": ["multi-provider", "fallback", "routing"]},
                {
                    "modelId": "anthropic/claude-3.7-sonnet",
                    "displayName": "Claude 3.7 via OpenRouter",
                    "traits": ["quality", "proxy", "flexibility"],
                },
            ],
        },
    ],
    "recommendations": [
        {
            "scene": "效率优先",
            "provider": "OpenAI",
            "modelId": "gpt-4o-mini",
            "reason": "响应快、成本低，适合日常自动化和持续运行。",
        },
        {
            "scene": "代码与工程",
            "provider": "Anthropic",
            "modelId": "claude-3-7-sonnet-latest",
            "reason": "长上下文与工程推理能力强，适合复杂项目执行。",
        },
        {
            "scene": "多模态任务",
            "provider": "Google",
            "modelId": "gemini-2.5-pro",
            "reason": "图文视频混合任务表现均衡。",
        },
        {
            "scene": "成本优先",
            "provider": "DeepSeek",
            "modelId": "deepseek-chat",
            "reason": "成本友好，适合大规模日常调用。",
        },
    ],
}

PACKAGE_SKILLS = {
    "starter-openclaw": [
        "OpenClaw 官方基础运行环境",
        "主流模型 API 配置引导",
        "基础健康检查与诊断工具",
    ],
    "work-openclaw": [
        "PPT 自动化技能",
        "Excel/表格处理技能",
        "文档写作与整理技能",
        "图片处理模型配置引导",
    ],
    "vision-openclaw": [
        "视频生成与剪辑工作流",
        "跨平台自动发布工作流",
        "视频模型 API 配置引导",
        "内容产线模板",
    ],
    "builder-openclaw": [
        "EOW 项目协议框架",
        "工程协作与交付流程模板",
        "任务检查点与回溯能力",
        "开发型 Agent 协作默认配置",
    ],
}

PROFILE_INSTALL_ROOT = {
    "macos-homebrew": "~/elo-open-world",
    "linux-systemd": "~/elo-open-world",
    "server-docker-compose": "/opt/elo-open-world",
}


@dataclass
class InstallerState:
    base_url: str = "https://world.metavie.co"
    human_id: str = ""
    oauth_client_id: str = "eow-installer-desktop"
    oauth_scope: str = "openid profile onboarder.install"
    oauth_redirect_uri: str = "http://127.0.0.1:53682/callback"
    oauth_access_token: str = ""
    oauth_refresh_token: str = ""
    oauth_authorize_state: str = ""
    oauth_code_verifier: str = ""
    oauth_auth_code: str = ""
    installer_auth_status: str = "pending"

    installer_session_id: str = ""
    package_id: str = "starter-openclaw"
    profile: str = "macos-homebrew"
    registration_mode: str = "register-to-eow"

    agent_name: str = ""
    agent_personality: str = ""

    model_provider: str = "OpenAI"
    model_name: str = ""
    model_api_key: str = ""
    model_base_url: str = ""

    chat_platform: str = "telegram"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    feishu_webhook_url: str = ""
    feishu_secret: str = ""
    discord_webhook_url: str = ""
    dingtalk_webhook_url: str = ""
    dingtalk_secret: str = ""

    purchase_id: str = ""
    checkout_session_id: str = ""
    entitlement_id: str = ""
    payment_status: str = "pending"

    install_log: str = ""
    execution_plan: Dict = field(default_factory=dict)
    install_success: bool = False


class EOWInstaller(QWidget):
    def __init__(self):
        super().__init__()
        self.state = InstallerState()

        self.loopback_server: Optional[HTTPServer] = None
        self.loopback_thread: Optional[threading.Thread] = None
        self.loopback_host = ""
        self.loopback_port = 0
        self.oauth_callback_path = "/callback"
        self.callback_events: List[Dict] = []
        self.callback_events_lock = threading.Lock()

        self.model_catalog = MODEL_FALLBACK_CATALOG
        self.model_catalog_loaded = False
        self.payment_poll_active = False

        self.setWindowTitle("ELO Agent Onboarder Installer")
        icon_path = self.asset_path("icon.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        self.resize(1120, 760)
        self.setMinimumSize(980, 680)
        self.apply_theme()

        self.stack = QStackedWidget()
        self.page_titles: List[str] = []
        self.pages: List[QWidget] = []
        self.current_index = 0

        self.step_label = QLabel()
        self.step_label.setObjectName("stepLabel")

        self.prev_button = QPushButton("Previous")
        self.next_button = QPushButton("Next")
        self.prev_button.clicked.connect(self.go_prev)
        self.next_button.clicked.connect(self.go_next)

        root = QVBoxLayout(self)
        root.setContentsMargins(18, 18, 18, 18)
        root.setSpacing(12)

        hero = self.build_hero_panel()
        root.addWidget(hero)
        root.addWidget(self.step_label)
        root.addWidget(self.stack, 1)

        actions = QHBoxLayout()
        actions.addWidget(self.prev_button)
        actions.addStretch(1)
        actions.addWidget(self.next_button)
        root.addLayout(actions)

        self.build_pages()

        self.auth_poll_timer = QTimer(self)
        self.auth_poll_timer.setInterval(1500)
        self.auth_poll_timer.timeout.connect(self.check_auth_status)

        self.payment_poll_timer = QTimer(self)
        self.payment_poll_timer.setInterval(2500)
        self.payment_poll_timer.timeout.connect(self.poll_payment_status)

        self.refresh_nav()

    def apply_theme(self):
        self.setStyleSheet(
            """
            QWidget {
                background: #0b1020;
                color: #e9eefc;
                font-size: 14px;
            }
            QFrame#heroPanel {
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 14px;
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 rgba(56, 23, 104, 0.95),
                    stop:1 rgba(22, 31, 59, 0.95));
                padding: 12px;
            }
            QLabel#heroTitle {
                font-size: 24px;
                font-weight: 700;
            }
            QLabel#heroSubtitle {
                color: #cfd8ff;
            }
            QLabel#stepLabel {
                border: 1px solid rgba(124, 93, 255, 0.55);
                border-radius: 10px;
                background: rgba(66, 43, 121, 0.52);
                padding: 8px 12px;
                font-weight: 600;
            }
            QGroupBox {
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 12px;
                margin-top: 12px;
                padding: 12px;
                background: rgba(14, 21, 41, 0.9);
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 6px;
                color: #c3d0ff;
                font-weight: 600;
            }
            QLineEdit, QTextEdit, QComboBox, QListWidget {
                border: 1px solid rgba(255, 255, 255, 0.16);
                border-radius: 8px;
                padding: 8px;
                background: rgba(8, 13, 26, 0.9);
                color: #e9eefc;
                selection-background-color: #7d4dff;
            }
            QTextEdit {
                min-height: 90px;
            }
            QPushButton {
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                padding: 9px 14px;
                background: rgba(114, 84, 255, 0.86);
                color: #ffffff;
                font-weight: 600;
            }
            QPushButton:hover {
                background: rgba(141, 109, 255, 0.92);
            }
            QPushButton:disabled {
                color: rgba(255, 255, 255, 0.4);
                background: rgba(91, 95, 112, 0.4);
                border-color: rgba(255, 255, 255, 0.1);
            }
            QProgressBar {
                border: 1px solid rgba(255, 255, 255, 0.18);
                border-radius: 8px;
                background: rgba(8, 13, 26, 0.9);
                text-align: center;
                color: #dce6ff;
                min-height: 22px;
            }
            QProgressBar::chunk {
                border-radius: 7px;
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #7d4dff,
                    stop:1 #ff5a6f);
            }
            """
        )

    def build_hero_panel(self):
        panel = QFrame()
        panel.setObjectName("heroPanel")
        layout = QHBoxLayout(panel)
        layout.setContentsMargins(12, 12, 12, 12)
        layout.setSpacing(14)

        icon_label = QLabel()
        icon_path = self.asset_path("icon.png")
        if os.path.exists(icon_path):
            icon_label.setPixmap(QIcon(icon_path).pixmap(56, 56))
        layout.addWidget(icon_label, 0, Qt.AlignTop)

        text_col = QVBoxLayout()
        title = QLabel("ELO Agent Onboarder")
        title.setObjectName("heroTitle")
        subtitle = QLabel("面向普通用户的一键引导安装器：登录、选套餐、配置模型、支付、安装、完成。")
        subtitle.setObjectName("heroSubtitle")
        subtitle.setWordWrap(True)
        text_col.addWidget(title)
        text_col.addWidget(subtitle)
        layout.addLayout(text_col, 1)
        return panel

    def build_pages(self):
        self.add_page("Login", self.build_login_page())
        self.add_page("Environment", self.build_env_page())
        self.add_page("Package", self.build_package_page())
        self.add_page("Agent", self.build_agent_page())
        self.add_page("Model", self.build_model_page())
        self.add_page("Chat Binding", self.build_chat_page())
        self.add_page("Skill Preview", self.build_skill_page())
        self.add_page("Payment", self.build_payment_page())
        self.add_page("Install", self.build_install_page())
        self.add_page("Complete", self.build_complete_page())

    def add_page(self, title: str, widget: QWidget):
        self.page_titles.append(title)
        self.pages.append(widget)
        self.stack.addWidget(widget)

    def refresh_nav(self):
        self.prev_button.setEnabled(self.current_index > 0)
        self.next_button.setText("Finish" if self.current_index == len(self.pages) - 1 else "Next")
        self.step_label.setText(f"Step {self.current_index + 1}/{len(self.pages)} · {self.page_titles[self.current_index]}")

    def go_prev(self):
        if self.current_index <= 0:
            return
        self.current_index -= 1
        self.stack.setCurrentIndex(self.current_index)
        self.refresh_nav()

    def go_next(self):
        if not self.validate_current_page():
            return
        if self.current_index >= len(self.pages) - 1:
            self.close()
            return
        self.current_index += 1
        self.stack.setCurrentIndex(self.current_index)
        self.refresh_nav()
        self.on_page_enter()

    def on_page_enter(self):
        title = self.page_titles[self.current_index]
        if title != "Login" and self.state.human_id:
            self.ensure_authenticated_session(silent=True)

        if title == "Environment":
            self.detect_environment()
        elif title == "Model":
            self.load_model_catalog()
        elif title == "Skill Preview":
            self.render_skill_preview()
        elif title == "Payment":
            self.render_payment_status("请完成支付后继续安装。")
            if self.state.payment_status != "paid":
                self.start_payment_poll()
        elif title == "Complete":
            self.render_complete_status()

    def validate_current_page(self) -> bool:
        title = self.page_titles[self.current_index]
        if title == "Login":
            self.state.base_url = self.base_url_input.text().strip().rstrip("/")
            if self.state.installer_auth_status != "authorized" or not self.state.human_id:
                self.error("请先完成 EOW 登录授权。")
                return False
            return self.start_installer_session()

        if title == "Agent":
            if not self.agent_name_input.text().strip():
                self.error("请填写 Agent 名称。")
                return False
            self.state.agent_name = self.agent_name_input.text().strip()
            self.state.agent_personality = self.agent_personality_input.toPlainText().strip()
            return self.update_installer_session()

        if title == "Model":
            self.state.model_provider = self.model_provider_combo.currentText().strip() or "OpenAI"
            selected_model = self.model_combo.currentData() or self.model_combo.currentText().strip()
            if self.custom_model_checkbox.isChecked() and self.custom_model_name_input.text().strip():
                selected_model = self.custom_model_name_input.text().strip()
            self.state.model_name = str(selected_model).strip()
            self.state.model_base_url = self.custom_model_base_url_input.text().strip()
            self.state.model_api_key = self.model_api_key_input.text().strip()
            if not self.state.model_name:
                self.error("请至少选择一个模型。")
                return False
            if not self.state.model_api_key:
                self.error("请填写模型 API Key。")
                return False
            return self.update_installer_session()

        if title == "Chat Binding":
            binding = self.collect_chat_binding()
            self.state.chat_platform = binding["platform"]
            self.state.telegram_bot_token = binding.get("telegramBotToken", "")
            self.state.telegram_chat_id = binding.get("telegramChatId", "")
            self.state.feishu_webhook_url = binding.get("feishuWebhookUrl", "")
            self.state.feishu_secret = binding.get("feishuSecret", "")
            self.state.discord_webhook_url = binding.get("discordWebhookUrl", "")
            self.state.dingtalk_webhook_url = binding.get("dingtalkWebhookUrl", "")
            self.state.dingtalk_secret = binding.get("dingtalkSecret", "")
            if self.state.chat_platform == "telegram" and not self.state.telegram_bot_token:
                self.error("Telegram 需要 Bot Token。")
                return False
            if self.state.chat_platform == "feishu" and not self.state.feishu_webhook_url:
                self.error("飞书需要 Webhook URL。")
                return False
            if self.state.chat_platform == "discord" and not self.state.discord_webhook_url:
                self.error("Discord 需要 Webhook URL。")
                return False
            if self.state.chat_platform == "dingtalk" and not self.state.dingtalk_webhook_url:
                self.error("钉钉需要 Webhook URL。")
                return False
            return self.update_installer_session()

        if title == "Payment":
            if self.state.payment_status != "paid":
                self.error("请先完成 Stripe 支付。")
                return False

        return True

    def ensure_authenticated_session(self, silent: bool = False) -> bool:
        if not self.state.oauth_access_token:
            if not silent:
                self.error("授权令牌不存在，请重新登录。")
            return False
        try:
            me = self.request("/api/auth/me", method="GET", payload=None, require_auth=True)
            human_id = me.get("human", {}).get("humanId", "")
            if human_id:
                self.state.human_id = human_id
                self.state.installer_auth_status = "authorized"
                return True
            raise RuntimeError("授权会话无效")
        except Exception as exc:
            if not silent:
                self.error(f"登录状态已失效，请重新登录。\n\n{exc}")
            self.state.installer_auth_status = "failed"
            self.render_auth_status("登录会话失效，请重新点击“登录到 EOW”。")
            self.stack.setCurrentIndex(0)
            self.current_index = 0
            self.refresh_nav()
            return False

    def request(
        self,
        path: str,
        method: str = "POST",
        payload: Optional[Dict] = None,
        require_auth: bool = True,
        content_type: str = "application/json",
        retry_on_auth_error: bool = True,
    ):
        if require_auth and not (self.state.human_id or self.state.oauth_access_token):
            raise RuntimeError("请先完成登录授权。")

        headers = {}
        if content_type:
            headers["Content-Type"] = content_type

        if self.state.oauth_access_token:
            headers["Authorization"] = f"Bearer {self.state.oauth_access_token}"
        elif self.state.human_id:
            headers["X-ELO-Session-Human-Id"] = self.state.human_id

        url = f"{self.state.base_url}{path}"
        kwargs = {"headers": headers, "timeout": 60}
        if method.upper() == "GET":
            kwargs["params"] = payload or {}
        elif content_type == "application/x-www-form-urlencoded":
            kwargs["data"] = payload or {}
        else:
            kwargs["json"] = payload or {}

        response = requests.request(method, url, **kwargs)

        if response.status_code >= 400:
            message = ""
            try:
                body = response.json()
                message = body.get("error_description") or body.get("error") or response.text
            except Exception:
                message = response.text
            lower_message = str(message).lower()

            if (
                retry_on_auth_error
                and require_auth
                and self.state.oauth_access_token
                and (
                    "access token expired" in lower_message
                    or "invalid access token" in lower_message
                    or "invalid_grant" in lower_message
                )
                and self.refresh_oauth_access_token()
            ):
                return self.request(
                    path,
                    method=method,
                    payload=payload,
                    require_auth=require_auth,
                    content_type=content_type,
                    retry_on_auth_error=False,
                )

            if "access token expired" in lower_message or "invalid access token" in lower_message:
                raise RuntimeError("token_expired: 登录令牌已过期，请重新登录。")
            if "permission" in lower_message or "scope" in lower_message:
                raise RuntimeError(f"permission_denied: {message}")
            raise RuntimeError(f"{response.status_code}: {message}")

        if "application/json" in response.headers.get("Content-Type", ""):
            return response.json()
        return response.content

    def refresh_oauth_access_token(self) -> bool:
        if not self.state.oauth_refresh_token:
            return False
        try:
            token = self.request(
                "/oauth/token",
                method="POST",
                payload={
                    "grant_type": "refresh_token",
                    "refresh_token": self.state.oauth_refresh_token,
                    "client_id": self.state.oauth_client_id,
                },
                require_auth=False,
                content_type="application/x-www-form-urlencoded",
                retry_on_auth_error=False,
            )
            self.state.oauth_access_token = token.get("access_token", "")
            self.state.oauth_refresh_token = token.get("refresh_token", self.state.oauth_refresh_token)
            return bool(self.state.oauth_access_token)
        except Exception:
            return False

    def pkce_challenge(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")

    def parse_loopback_redirect(self):
        parsed = urllib.parse.urlparse(self.oauth_redirect_input.text().strip() or self.state.oauth_redirect_uri)
        if parsed.scheme not in ("http", "https"):
            return None
        if not parsed.hostname or not parsed.port:
            return None
        return {
            "host": parsed.hostname,
            "port": parsed.port,
            "path": parsed.path or "/callback",
        }

    def ensure_loopback_server(self) -> bool:
        conf = self.parse_loopback_redirect()
        if not conf:
            self.render_auth_status("回调地址不合法，请在高级设置中确认 OAuth Redirect URI。")
            return False

        if self.loopback_server and conf["host"] == self.loopback_host and conf["port"] == self.loopback_port:
            self.oauth_callback_path = conf["path"]
            return True

        self.stop_loopback_server()

        installer = self
        callback_path = conf["path"]

        class CallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)
                query = urllib.parse.parse_qs(parsed_url.query)

                if parsed_url.path == callback_path:
                    event = {
                        "type": "oauth",
                        "code": query.get("code", [""])[0],
                        "state": query.get("state", [""])[0],
                        "error": query.get("error", [""])[0],
                    }
                    installer.push_callback_event(event)
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>EOW authorization received.</h3><p>You can return to the installer.</p></body></html>"
                    )
                    return

                if parsed_url.path == "/checkout-return":
                    event = {
                        "type": "payment-success",
                        "checkoutSessionId": query.get("checkoutSessionId", [""])[0],
                    }
                    installer.push_callback_event(event)
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>Payment received by installer.</h3><p>You can close this tab and return to the app.</p></body></html>"
                    )
                    return

                if parsed_url.path == "/checkout-cancel":
                    installer.push_callback_event({"type": "payment-cancel"})
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(
                        b"<html><body><h3>Payment cancelled.</h3><p>Return to installer to continue.</p></body></html>"
                    )
                    return

                self.send_response(404)
                self.end_headers()

            def log_message(self, format, *args):
                return

        try:
            server = HTTPServer((conf["host"], conf["port"]), CallbackHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            self.loopback_server = server
            self.loopback_thread = thread
            self.loopback_host = conf["host"]
            self.loopback_port = conf["port"]
            self.oauth_callback_path = conf["path"]
            return True
        except Exception as exc:
            self.render_auth_status(f"无法启动本地回调监听：{exc}")
            return False

    def stop_loopback_server(self):
        if self.loopback_server:
            try:
                self.loopback_server.shutdown()
                self.loopback_server.server_close()
            except Exception:
                pass
        self.loopback_server = None
        self.loopback_thread = None
        self.loopback_host = ""
        self.loopback_port = 0

    def push_callback_event(self, event: Dict):
        with self.callback_events_lock:
            self.callback_events.append(event)

    def pop_callback_events(self) -> List[Dict]:
        with self.callback_events_lock:
            events = list(self.callback_events)
            self.callback_events.clear()
            return events

    def start_auth_flow(self):
        self.start_oauth_flow()

    def start_oauth_flow(self):
        self.state.base_url = self.base_url_input.text().strip().rstrip("/")
        self.state.oauth_client_id = self.oauth_client_id_input.text().strip() or "eow-installer-desktop"
        self.state.oauth_scope = self.oauth_scope_input.text().strip() or "openid profile onboarder.install"
        self.state.oauth_redirect_uri = self.oauth_redirect_input.text().strip() or "http://127.0.0.1:53682/callback"

        if not self.ensure_loopback_server():
            return

        self.state.oauth_authorize_state = secrets.token_urlsafe(24)
        self.state.oauth_code_verifier = secrets.token_urlsafe(64)
        self.state.oauth_auth_code = ""
        self.state.oauth_access_token = ""
        self.state.oauth_refresh_token = ""
        self.state.human_id = ""
        self.state.installer_auth_status = "pending"

        try:
            authorize_path = (
                "/oauth/authorize?"
                f"response_type=code&client_id={urllib.parse.quote(self.state.oauth_client_id)}"
                f"&redirect_uri={urllib.parse.quote(self.state.oauth_redirect_uri, safe='')}"
                f"&scope={urllib.parse.quote(self.state.oauth_scope)}"
                f"&state={urllib.parse.quote(self.state.oauth_authorize_state)}"
                f"&code_challenge={urllib.parse.quote(self.pkce_challenge(self.state.oauth_code_verifier))}"
                f"&code_challenge_method=S256"
            )
            consent_url = f"{self.state.base_url}/oauth/consent?returnTo={urllib.parse.quote(authorize_path, safe='')}"
            webbrowser.open(consent_url)
            self.auth_poll_timer.start()
            self.render_auth_status("请在浏览器完成登录和授权，应用会自动继续。")
        except Exception as exc:
            self.render_auth_status(f"无法打开浏览器：{exc}")

    def check_auth_status(self):
        for event in self.pop_callback_events():
            if event.get("type") == "oauth":
                if event.get("error"):
                    self.state.installer_auth_status = "failed"
                    self.render_auth_status(f"授权失败：{event.get('error')}")
                    self.auth_poll_timer.stop()
                    return
                if event.get("state") != self.state.oauth_authorize_state:
                    self.state.installer_auth_status = "failed"
                    self.render_auth_status("授权状态校验失败，请重试登录。")
                    self.auth_poll_timer.stop()
                    return
                self.state.oauth_auth_code = event.get("code", "")

            if event.get("type") == "payment-success":
                self.state.checkout_session_id = event.get("checkoutSessionId", self.state.checkout_session_id)
                self.confirm_payment(checkout_session_id=self.state.checkout_session_id, silent=True)
            elif event.get("type") == "payment-cancel":
                self.render_payment_status("支付已取消，你可以重新发起支付。")

        if self.state.oauth_auth_code:
            try:
                if self.exchange_oauth_token():
                    self.auth_poll_timer.stop()
                    self.render_auth_status(f"已授权：{self.state.human_id}")
                    return
            except Exception as exc:
                self.auth_poll_timer.stop()
                self.state.installer_auth_status = "failed"
                self.render_auth_status(f"授权失败：{exc}")
                return

        if self.state.installer_auth_status != "authorized":
            self.render_auth_status("等待浏览器回调中...")

    def exchange_oauth_token(self):
        if not self.state.oauth_auth_code:
            return False
        token = self.request(
            "/oauth/token",
            method="POST",
            payload={
                "grant_type": "authorization_code",
                "code": self.state.oauth_auth_code,
                "redirect_uri": self.state.oauth_redirect_uri,
                "client_id": self.state.oauth_client_id,
                "code_verifier": self.state.oauth_code_verifier,
            },
            require_auth=False,
            content_type="application/x-www-form-urlencoded",
        )
        self.state.oauth_access_token = token.get("access_token", "")
        self.state.oauth_refresh_token = token.get("refresh_token", "")
        if not self.state.oauth_access_token:
            return False
        me = self.request("/api/auth/me", method="GET", payload=None, require_auth=True)
        self.state.human_id = me.get("human", {}).get("humanId", "")
        self.state.installer_auth_status = "authorized" if self.state.human_id else "pending"
        return bool(self.state.human_id)

    def render_auth_status(self, note: str = ""):
        lines = [
            f"登录状态：{self.state.installer_auth_status}",
            f"当前账号：{self.state.human_id or '-'}",
            f"授权令牌：{'已就绪' if self.state.oauth_access_token else '未就绪'}",
            f"提示：{note or '点击“登录到 EOW”，浏览器授权完成后会自动回到应用。'}",
        ]
        self.auth_status_box.setPlainText("\n".join(lines))

    def start_installer_session(self) -> bool:
        self.state.package_id = self.package_combo.currentData()
        self.state.profile = self.profile_combo.currentData()
        self.state.registration_mode = "register-to-eow" if self.registration_checkbox.isChecked() else "local-only"
        try:
            result = self.request(
                "/api/onboarder/installer/session/start",
                payload={
                    "packageId": self.state.package_id,
                    "profile": self.state.profile,
                    "registrationMode": self.state.registration_mode,
                    "workflowPreset": "",
                },
            )
            self.state.installer_session_id = result["installerSessionId"]
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def collect_chat_binding(self) -> Dict:
        platform_name = self.chat_platform_combo.currentText().strip().lower()
        return {
            "platform": platform_name,
            "telegramBotToken": self.telegram_bot_token_input.text().strip(),
            "telegramChatId": self.telegram_chat_id_input.text().strip(),
            "feishuWebhookUrl": self.feishu_webhook_input.text().strip(),
            "feishuSecret": self.feishu_secret_input.text().strip(),
            "discordWebhookUrl": self.discord_webhook_input.text().strip(),
            "dingtalkWebhookUrl": self.dingtalk_webhook_input.text().strip(),
            "dingtalkSecret": self.dingtalk_secret_input.text().strip(),
        }

    def update_installer_session(self) -> bool:
        try:
            self.request(
                "/api/onboarder/installer/session/update",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "agentName": self.state.agent_name,
                    "agentPersonality": self.state.agent_personality,
                    "modelProvider": self.state.model_provider,
                    "modelName": self.state.model_name,
                    "modelApiKey": self.state.model_api_key,
                    "chatBinding": self.collect_chat_binding(),
                },
            )
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def parse_checkout_callback_urls(self):
        conf = self.parse_loopback_redirect()
        if not conf:
            return "", ""
        callback_base = f"http://{conf['host']}:{conf['port']}"
        success = f"{callback_base}/checkout-return?installerSessionId={urllib.parse.quote(self.state.installer_session_id)}&checkoutSessionId={{CHECKOUT_SESSION_ID}}"
        cancel = f"{callback_base}/checkout-cancel?installerSessionId={urllib.parse.quote(self.state.installer_session_id)}"
        return success, cancel

    def create_checkout(self):
        if not self.state.installer_session_id:
            self.error("安装会话尚未初始化，请先完成前面步骤。")
            return
        if not self.ensure_authenticated_session(silent=False):
            return
        if not self.ensure_loopback_server():
            return
        try:
            success_url, cancel_url = self.parse_checkout_callback_urls()
            result = self.request(
                "/api/onboarder/installer/payment/checkout-session",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "successUrl": success_url,
                    "cancelUrl": cancel_url,
                },
            )
            self.state.purchase_id = result.get("purchaseId", "")
            self.state.checkout_session_id = result.get("checkoutSessionId", "")
            checkout_url = result.get("checkoutUrl", "")
            if checkout_url:
                webbrowser.open(checkout_url)
            self.render_payment_status("已打开 Stripe 支付页面，支付完成后应用会自动更新状态。")
            self.start_payment_poll()
        except Exception as exc:
            self.render_payment_status(f"创建支付失败：{exc}")

    def check_payment_status(self):
        if not self.state.installer_session_id:
            return
        try:
            result = self.request(
                "/api/onboarder/installer/payment/status",
                payload={"installerSessionId": self.state.installer_session_id},
            )
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.purchase_id = result.get("purchaseId", "")
            self.state.checkout_session_id = result.get("checkoutSessionId", self.state.checkout_session_id)
            self.state.entitlement_id = result.get("entitlementId", "")
            if self.state.payment_status == "paid":
                self.payment_poll_timer.stop()
                self.payment_poll_active = False
                self.render_payment_status("支付成功，已解锁安装。")
            else:
                self.render_payment_status("等待支付完成中...")
        except Exception as exc:
            self.render_payment_status(f"支付状态检测失败：{exc}")

    def confirm_payment(self, checkout_session_id: str = "", silent: bool = False):
        if not self.state.installer_session_id:
            return
        try:
            result = self.request(
                "/api/onboarder/installer/payment/confirm",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "checkoutSessionId": checkout_session_id or self.state.checkout_session_id,
                },
            )
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.entitlement_id = result.get("entitlementId", "")
            if self.state.payment_status == "paid":
                self.payment_poll_timer.stop()
                self.payment_poll_active = False
                self.render_payment_status("支付成功，已解锁安装。")
            elif not silent:
                self.render_payment_status("支付尚未完成，请稍后再试。")
        except Exception as exc:
            if not silent:
                self.render_payment_status(f"支付确认失败：{exc}")

    def start_payment_poll(self):
        if self.payment_poll_active:
            return
        self.payment_poll_active = True
        self.payment_poll_timer.start()

    def poll_payment_status(self):
        for event in self.pop_callback_events():
            if event.get("type") == "payment-success":
                self.state.checkout_session_id = event.get("checkoutSessionId", self.state.checkout_session_id)
                self.confirm_payment(checkout_session_id=self.state.checkout_session_id, silent=True)
            elif event.get("type") == "payment-cancel":
                self.render_payment_status("支付被取消，可重新发起支付。")
            elif event.get("type") == "oauth":
                # OAuth 事件留给 auth timer 处理
                self.push_callback_event(event)

        self.check_payment_status()

    def render_payment_status(self, note: str = ""):
        state_map = {
            "pending": "待支付",
            "paid": "已支付，可安装",
            "failed": "支付失败",
        }
        status_text = state_map.get(self.state.payment_status, self.state.payment_status)
        lines = [
            f"Installer Session: {self.state.installer_session_id or '-'}",
            f"Purchase: {self.state.purchase_id or '-'}",
            f"Payment Status: {status_text}",
            f"Entitlement: {self.state.entitlement_id or '-'}",
            f"说明: {note or ('支付后应用会自动检测并回到可安装状态。' if self.state.payment_status != 'paid' else '你可以点击 Next 进入安装步骤。')}",
        ]
        self.payment_status_label.setPlainText("\n".join(lines))

    def load_model_catalog(self):
        if self.model_catalog_loaded:
            return
        try:
            catalog = self.request("/api/onboarder/installer/models", method="GET", payload=None)
            providers = catalog.get("providers", [])
            if providers:
                self.model_catalog = catalog
        except Exception:
            self.model_catalog = MODEL_FALLBACK_CATALOG
        self.model_catalog_loaded = True
        self.populate_model_providers()

    def populate_model_providers(self):
        current = self.model_provider_combo.currentText().strip()
        self.model_provider_combo.blockSignals(True)
        self.model_provider_combo.clear()
        for provider in self.model_catalog.get("providers", []):
            self.model_provider_combo.addItem(provider.get("displayName", "Unknown"), provider)
        self.model_provider_combo.blockSignals(False)

        if current:
            idx = self.model_provider_combo.findText(current)
            if idx >= 0:
                self.model_provider_combo.setCurrentIndex(idx)
        if self.model_provider_combo.count() > 0:
            self.on_provider_changed(self.model_provider_combo.currentIndex())

        lines = []
        for rec in self.model_catalog.get("recommendations", []):
            lines.append(
                f"- {rec.get('scene', '')}: {rec.get('provider', '')} / {rec.get('modelId', '')}\n  {rec.get('reason', '')}"
            )
        self.recommendation_output.setPlainText("\n".join(lines) if lines else "暂未提供推荐。")

    def on_provider_changed(self, index: int):
        provider = self.model_provider_combo.itemData(index) or {}
        self.model_combo.blockSignals(True)
        self.model_combo.clear()
        for model in provider.get("models", []):
            self.model_combo.addItem(model.get("displayName", "Unknown"), model.get("modelId", ""))
        self.model_combo.blockSignals(False)
        if self.model_combo.count() > 0:
            self.model_combo.setCurrentIndex(0)
        self.update_model_description()

    def update_model_description(self):
        provider = self.model_provider_combo.currentData() or {}
        model_id = self.model_combo.currentData() or ""
        selected_model = None
        for m in provider.get("models", []):
            if m.get("modelId") == model_id:
                selected_model = m
                break

        provider_name = provider.get("displayName", "-")
        provider_site = provider.get("website", "")
        model_name = selected_model.get("displayName", "-") if selected_model else "-"
        model_traits = ", ".join(selected_model.get("traits", [])) if selected_model else "-"

        self.model_desc.setPlainText(
            "\n".join(
                [
                    f"厂牌: {provider_name}",
                    f"官网: {provider_site or '-'}",
                    f"模型: {model_name}",
                    f"特性: {model_traits}",
                    "\n提示：可先用推荐模型快速完成安装，后续再在 OpenClaw 内调整。",
                ]
            )
        )

    def open_model_site(self):
        provider = self.model_provider_combo.currentData() or {}
        url = provider.get("website", "")
        if url:
            webbrowser.open(url)

    def toggle_custom_model_fields(self):
        visible = self.custom_model_checkbox.isChecked()
        self.custom_model_wrap.setVisible(visible)

    def detect_environment(self):
        rows = [
            "请确认当前设备环境：",
            f"- 操作系统: {platform.platform()}",
            f"- Python 版本: {platform.python_version()}",
            f"- 当前目录: {os.getcwd()}",
            "- 网络连通: 将在安装时进一步检测",
        ]
        self.env_output.setPlainText("\n".join(rows))

    def on_chat_platform_changed(self):
        platform_name = self.chat_platform_combo.currentText().strip().lower()
        mapping = {
            "telegram": 0,
            "feishu": 1,
            "discord": 2,
            "dingtalk": 3,
        }
        self.chat_stack.setCurrentIndex(mapping.get(platform_name, 0))
        hints = {
            "telegram": "Telegram 需要 Bot Token，chat_id 可自动检测。",
            "feishu": "飞书建议使用机器人 Webhook（可选 Secret）。",
            "discord": "Discord 推荐使用 Webhook URL，配置成本最低。",
            "dingtalk": "钉钉机器人需要 Webhook URL，部分配置需要 Secret。",
        }
        self.chat_help_label.setText(hints.get(platform_name, "请选择聊天平台并填写配置。"))

    def auto_detect_telegram_chat_id(self):
        bot_token = self.telegram_bot_token_input.text().strip()
        if not bot_token:
            self.chat_validation_output.setPlainText("请先填写 Telegram Bot Token。")
            return
        try:
            response = requests.get(f"https://api.telegram.org/bot{bot_token}/getUpdates", timeout=15)
            payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
            if response.status_code >= 400 or payload.get("ok") is False:
                raise RuntimeError(payload.get("description") or f"HTTP {response.status_code}")
            result = payload.get("result", [])
            latest = None
            for item in reversed(result):
                msg = item.get("message") or item.get("channel_post") or {}
                chat = msg.get("chat") or {}
                if chat.get("id"):
                    latest = str(chat.get("id"))
                    break
            if not latest:
                self.chat_validation_output.setPlainText(
                    "未检测到 chat_id。请先在 Telegram 里给 Bot 发一条消息，然后再次点击自动检测。"
                )
                return
            self.telegram_chat_id_input.setText(latest)
            self.chat_validation_output.setPlainText(f"已自动检测 chat_id: {latest}")
        except Exception as exc:
            self.chat_validation_output.setPlainText(
                "自动检测失败。\n"
                "请确认 Bot Token 正确，并且你已给 Bot 发送过消息。\n"
                f"错误信息: {exc}"
            )

    def test_chat_binding(self):
        if not self.state.installer_session_id:
            self.chat_validation_output.setPlainText("请先完成登录和前置步骤，再进行聊天配置测试。")
            return
        binding = self.collect_chat_binding()
        try:
            result = self.request(
                "/api/onboarder/installer/chat/validate",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "chatBinding": binding,
                    "action": "validate",
                    "message": "ELO Agent Onboarder 测试消息：聊天绑定已生效。",
                },
            )
            self.chat_validation_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
            if result.get("resolvedChatId") and not self.telegram_chat_id_input.text().strip():
                self.telegram_chat_id_input.setText(str(result.get("resolvedChatId")))
        except Exception as exc:
            self.chat_validation_output.setPlainText(f"测试失败: {exc}")

    def stage_update(self, label: str, percent: int, detail: str = ""):
        self.install_status_label.setText(label)
        self.install_progress.setValue(percent)
        line = f"[{percent:>3}%] {label}"
        if detail:
            line = f"{line} - {detail}"
        self.install_stage_list.addItem(line)
        self.install_stage_list.scrollToBottom()
        QApplication.processEvents()

    def run_install(self):
        if self.state.payment_status != "paid":
            self.error("请先完成支付。")
            return
        self.install_start_button.setEnabled(False)
        self.prev_button.setEnabled(False)
        self.next_button.setEnabled(False)

        self.install_stage_list.clear()
        self.install_log_output.clear()
        self.state.install_success = False
        self.state.install_log = ""

        try:
            self.stage_update("环境检查", 8, "准备安装执行上下文")
            env_report = {
                "platform": platform.platform(),
                "python": platform.python_version(),
            }

            self.stage_update("获取安装计划", 22, "从 EOW 拉取安装计划")
            plan_payload = self.request(
                "/api/onboarder/installer/plan",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "worldUrl": self.state.base_url,
                },
            )
            self.state.execution_plan = plan_payload.get("plan", {})

            self.stage_update("下载执行脚本", 38, "准备一次性安装脚本")
            script_payload = self.request(
                "/api/onboarder/installer/script",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "worldUrl": self.state.base_url,
                },
            )
            script = script_payload.get("script", "")
            if not script:
                raise RuntimeError("服务器返回的安装脚本为空。")

            self.stage_update("安装 OpenClaw", 60, "执行安装脚本并生成配置")
            with tempfile.TemporaryDirectory(prefix="eow-installer-") as td:
                script_path = os.path.join(td, "install.sh")
                with open(script_path, "w", encoding="utf-8") as fp:
                    fp.write(script)
                os.chmod(script_path, 0o700)

                cmd = ["bash", script_path] if platform.system().lower().startswith("win") else [script_path]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
                self.state.install_log = f"exit={proc.returncode}\n\nSTDOUT:\n{proc.stdout}\n\nSTDERR:\n{proc.stderr}"
                self.install_log_output.setPlainText(self.state.install_log)
                if proc.returncode != 0:
                    raise RuntimeError("安装脚本执行失败，请查看日志。")

            self.stage_update("写入配置文件", 76, "openclaw.json 与 SOUL.md 已生成")

            self.stage_update("聊天通道通知", 90, "发送安装成功消息")
            binding = self.collect_chat_binding()
            try:
                self.request(
                    "/api/onboarder/installer/chat/validate",
                    payload={
                        "installerSessionId": self.state.installer_session_id,
                        "chatBinding": binding,
                        "action": "notify",
                        "message": f"OpenClaw 安装成功。Agent={self.state.agent_name}，Model={self.state.model_name}",
                    },
                )
            except Exception as notify_exc:
                self.install_stage_list.addItem(f"[warn] 聊天通知发送失败: {notify_exc}")

            self.request(
                "/api/onboarder/installer/complete",
                payload={
                    "installerSessionId": self.state.installer_session_id,
                    "installReport": {
                        "ok": True,
                        "platform": platform.platform(),
                        "env": env_report,
                    },
                },
            )

            self.state.install_success = True
            self.stage_update("安装完成", 100, "你可以进入最后一步并注册到 EOW")
            self.install_status_label.setText("安装成功！请点击 Next 进入完成页。")
        except Exception as exc:
            self.install_status_label.setText(f"安装失败：{exc}")
            self.install_stage_list.addItem(f"[error] {exc}")
        finally:
            self.install_start_button.setEnabled(True)
            self.prev_button.setEnabled(True)
            self.next_button.setEnabled(True)

    def open_install_folder(self):
        install_root = PROFILE_INSTALL_ROOT.get(self.state.profile, "~/elo-open-world")
        target = os.path.expanduser(install_root)
        try:
            if sys.platform.startswith("darwin"):
                subprocess.Popen(["open", target])
            elif sys.platform.startswith("win"):
                os.startfile(target)
            else:
                subprocess.Popen(["xdg-open", target])
        except Exception as exc:
            self.error(f"无法打开目录：{exc}")

    def register_to_world(self):
        try:
            result = self.request(
                "/api/onboarder/installer/register",
                payload={"installerSessionId": self.state.installer_session_id},
            )
            self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
        except Exception as exc:
            self.error(str(exc))

    def render_skill_preview(self):
        package = self.package_combo.currentData()
        skills = PACKAGE_SKILLS.get(package, [])
        text_lines = ["你即将安装以下能力包：", ""]
        text_lines.extend([f"- {item}" for item in skills])
        self.skill_output.setPlainText("\n".join(text_lines))

    def render_complete_status(self):
        summary = {
            "installerSessionId": self.state.installer_session_id,
            "humanId": self.state.human_id,
            "package": self.state.package_id,
            "paymentStatus": self.state.payment_status,
            "entitlementId": self.state.entitlement_id,
            "installSuccess": self.state.install_success,
            "profile": self.state.profile,
            "registrationMode": self.state.registration_mode,
        }
        headline = "安装成功，Agent 已准备就绪。" if self.state.install_success else "安装尚未完成，请返回安装步骤。"
        self.complete_headline.setText(headline)
        self.complete_status_output.setPlainText(json.dumps(summary, indent=2, ensure_ascii=False))

    def error(self, message: str):
        QMessageBox.critical(self, "Error", message)

    @staticmethod
    def asset_path(filename: str) -> str:
        if getattr(sys, "frozen", False):
            base = getattr(sys, "_MEIPASS", os.path.dirname(sys.executable))
        else:
            base = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(base, "assets", filename)

    def build_login_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        card = QGroupBox("登录授权")
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QLabel("请先登录 EOW，完成授权后安装器会自动进入下一步。"))

        actions = QHBoxLayout()
        login_btn = QPushButton("登录到 EOW")
        register_btn = QPushButton("去注册")
        check_btn = QPushButton("检查授权状态")
        login_btn.clicked.connect(self.start_auth_flow)
        register_btn.clicked.connect(lambda: webbrowser.open(f"{self.base_url_input.text().strip().rstrip('/')}/human-auth"))
        check_btn.clicked.connect(self.check_auth_status)
        actions.addWidget(login_btn)
        actions.addWidget(register_btn)
        actions.addWidget(check_btn)
        card_layout.addLayout(actions)

        self.auth_status_box = QTextEdit()
        self.auth_status_box.setReadOnly(True)
        self.auth_status_box.setMinimumHeight(120)
        card_layout.addWidget(self.auth_status_box)
        layout.addWidget(card)

        advanced_group = QGroupBox("高级设置（调试）")
        adv_layout = QFormLayout(advanced_group)
        self.base_url_input = QLineEdit(self.state.base_url)
        self.oauth_client_id_input = QLineEdit(self.state.oauth_client_id)
        self.oauth_scope_input = QLineEdit(self.state.oauth_scope)
        self.oauth_redirect_input = QLineEdit(self.state.oauth_redirect_uri)
        adv_layout.addRow("EOW Base URL", self.base_url_input)
        adv_layout.addRow("OAuth Client ID", self.oauth_client_id_input)
        adv_layout.addRow("OAuth Scope", self.oauth_scope_input)
        adv_layout.addRow("OAuth Redirect URI", self.oauth_redirect_input)

        self.advanced_toggle_btn = QToolButton()
        self.advanced_toggle_btn.setText("显示高级设置")
        self.advanced_toggle_btn.setCheckable(True)
        self.advanced_toggle_btn.toggled.connect(lambda checked: advanced_group.setVisible(checked))
        advanced_group.setVisible(False)
        layout.addWidget(self.advanced_toggle_btn)
        layout.addWidget(advanced_group)

        self.render_auth_status("点击“登录到 EOW”开始授权。")
        return page

    def build_env_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        card = QGroupBox("环境检测")
        card_layout = QVBoxLayout(card)
        card_layout.addWidget(QLabel("安装器会先检查当前设备环境，确保安装流程顺畅。"))
        detect_btn = QPushButton("重新检测环境")
        detect_btn.clicked.connect(self.detect_environment)
        self.env_output = QTextEdit()
        self.env_output.setReadOnly(True)
        card_layout.addWidget(detect_btn)
        card_layout.addWidget(self.env_output)
        layout.addWidget(card)
        return page

    def build_package_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox("选择套餐与安装环境")
        form = QFormLayout(form_box)
        self.package_combo = QComboBox()
        self.package_combo.addItem("Starter OpenClaw ($8)", "starter-openclaw")
        self.package_combo.addItem("Work OpenClaw ($16)", "work-openclaw")
        self.package_combo.addItem("Vision OpenClaw ($29)", "vision-openclaw")
        self.package_combo.addItem("Builder OpenClaw ($79)", "builder-openclaw")

        self.profile_combo = QComboBox()
        self.profile_combo.addItem("macOS Homebrew", "macos-homebrew")
        self.profile_combo.addItem("Linux systemd", "linux-systemd")
        self.profile_combo.addItem("Server Docker Compose", "server-docker-compose")

        self.registration_checkbox = QCheckBox("安装完成后自动注册到 EOW")
        self.registration_checkbox.setChecked(True)

        form.addRow("套餐", self.package_combo)
        form.addRow("环境", self.profile_combo)
        form.addRow("", self.registration_checkbox)
        layout.addWidget(form_box)
        return page

    def build_agent_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox("Agent 信息")
        form = QFormLayout(form_box)
        self.agent_name_input = QLineEdit()
        self.agent_personality_input = QTextEdit()
        self.agent_personality_input.setPlaceholderText("例如：耐心、执行力强、善于整理信息。安装时会写入 SOUL.md")

        form.addRow("Agent 名称", self.agent_name_input)
        form.addRow("Agent 性格", self.agent_personality_input)
        layout.addWidget(form_box)
        return page

    def build_model_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        form_box = QGroupBox("模型配置")
        form = QFormLayout(form_box)

        self.model_provider_combo = QComboBox()
        self.model_provider_combo.currentIndexChanged.connect(self.on_provider_changed)

        self.model_combo = QComboBox()
        self.model_combo.currentIndexChanged.connect(lambda _: self.update_model_description())

        self.model_api_key_input = QLineEdit()
        self.model_api_key_input.setEchoMode(QLineEdit.Password)

        form.addRow("厂牌", self.model_provider_combo)
        form.addRow("模型", self.model_combo)
        form.addRow("API Key", self.model_api_key_input)

        open_site_btn = QPushButton("打开厂牌官网")
        open_site_btn.clicked.connect(self.open_model_site)
        form.addRow("", open_site_btn)

        self.custom_model_checkbox = QCheckBox("使用自定义模型参数")
        self.custom_model_checkbox.toggled.connect(self.toggle_custom_model_fields)
        form.addRow("", self.custom_model_checkbox)

        self.custom_model_wrap = QWidget()
        custom_form = QFormLayout(self.custom_model_wrap)
        self.custom_model_name_input = QLineEdit()
        self.custom_model_base_url_input = QLineEdit()
        self.custom_model_base_url_input.setPlaceholderText("可选：兼容服务的 Base URL")
        custom_form.addRow("自定义模型 ID", self.custom_model_name_input)
        custom_form.addRow("自定义 Base URL", self.custom_model_base_url_input)
        self.custom_model_wrap.setVisible(False)
        form.addRow("", self.custom_model_wrap)

        layout.addWidget(form_box)

        self.model_desc = QTextEdit()
        self.model_desc.setReadOnly(True)
        layout.addWidget(self.model_desc)

        rec_box = QGroupBox("OpenClaw 推荐模型")
        rec_layout = QVBoxLayout(rec_box)
        self.recommendation_output = QTextEdit()
        self.recommendation_output.setReadOnly(True)
        rec_layout.addWidget(self.recommendation_output)
        layout.addWidget(rec_box)

        return page

    def build_chat_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        top_box = QGroupBox("聊天软件绑定")
        top_form = QFormLayout(top_box)
        self.chat_platform_combo = QComboBox()
        self.chat_platform_combo.addItems(["Telegram", "Feishu", "Discord", "DingTalk"])
        self.chat_platform_combo.currentTextChanged.connect(lambda _: self.on_chat_platform_changed())
        self.chat_help_label = QLabel("请选择聊天平台并填写配置。")
        self.chat_help_label.setWordWrap(True)
        top_form.addRow("平台", self.chat_platform_combo)
        top_form.addRow("提示", self.chat_help_label)

        layout.addWidget(top_box)

        self.chat_stack = QStackedWidget()

        telegram_widget = QWidget()
        telegram_form = QFormLayout(telegram_widget)
        self.telegram_bot_token_input = QLineEdit()
        self.telegram_chat_id_input = QLineEdit()
        self.telegram_detect_btn = QPushButton("自动检测 chat_id")
        self.telegram_detect_btn.clicked.connect(self.auto_detect_telegram_chat_id)
        telegram_form.addRow("Bot Token", self.telegram_bot_token_input)
        telegram_form.addRow("Chat ID", self.telegram_chat_id_input)
        telegram_form.addRow("", self.telegram_detect_btn)

        feishu_widget = QWidget()
        feishu_form = QFormLayout(feishu_widget)
        self.feishu_webhook_input = QLineEdit()
        self.feishu_secret_input = QLineEdit()
        self.feishu_secret_input.setEchoMode(QLineEdit.Password)
        feishu_form.addRow("Webhook URL", self.feishu_webhook_input)
        feishu_form.addRow("Secret (可选)", self.feishu_secret_input)

        discord_widget = QWidget()
        discord_form = QFormLayout(discord_widget)
        self.discord_webhook_input = QLineEdit()
        discord_form.addRow("Webhook URL", self.discord_webhook_input)

        dingtalk_widget = QWidget()
        dingtalk_form = QFormLayout(dingtalk_widget)
        self.dingtalk_webhook_input = QLineEdit()
        self.dingtalk_secret_input = QLineEdit()
        self.dingtalk_secret_input.setEchoMode(QLineEdit.Password)
        dingtalk_form.addRow("Webhook URL", self.dingtalk_webhook_input)
        dingtalk_form.addRow("Secret (可选)", self.dingtalk_secret_input)

        self.chat_stack.addWidget(telegram_widget)
        self.chat_stack.addWidget(feishu_widget)
        self.chat_stack.addWidget(discord_widget)
        self.chat_stack.addWidget(dingtalk_widget)
        layout.addWidget(self.chat_stack)

        test_btn = QPushButton("测试聊天配置")
        test_btn.clicked.connect(self.test_chat_binding)
        layout.addWidget(test_btn)

        self.chat_validation_output = QTextEdit()
        self.chat_validation_output.setReadOnly(True)
        layout.addWidget(self.chat_validation_output)

        self.on_chat_platform_changed()
        return page

    def build_skill_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("技能套餐预览")
        box_layout = QVBoxLayout(box)
        self.skill_output = QTextEdit()
        self.skill_output.setReadOnly(True)
        box_layout.addWidget(self.skill_output)
        layout.addWidget(box)
        return page

    def build_payment_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("Stripe 支付")
        box_layout = QVBoxLayout(box)

        self.payment_status_label = QTextEdit()
        self.payment_status_label.setReadOnly(True)
        self.payment_status_label.setMinimumHeight(140)

        btn_checkout = QPushButton("Open Stripe Checkout")
        btn_recheck = QPushButton("Check Payment Status")
        btn_confirm = QPushButton("Confirm Checkout")

        btn_checkout.clicked.connect(self.create_checkout)
        btn_recheck.clicked.connect(self.check_payment_status)
        btn_confirm.clicked.connect(lambda: self.confirm_payment())

        box_layout.addWidget(self.payment_status_label)
        box_layout.addWidget(btn_checkout)
        box_layout.addWidget(btn_recheck)
        box_layout.addWidget(btn_confirm)
        layout.addWidget(box)
        return page

    def build_install_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("安装执行")
        box_layout = QVBoxLayout(box)

        self.install_status_label = QLabel("准备安装。")
        self.install_progress = QProgressBar()
        self.install_progress.setRange(0, 100)
        self.install_progress.setValue(0)
        self.install_stage_list = QListWidget()

        self.install_start_button = QPushButton("开始安装")
        self.install_start_button.clicked.connect(self.run_install)

        self.install_log_output = QTextEdit()
        self.install_log_output.setReadOnly(True)

        box_layout.addWidget(self.install_status_label)
        box_layout.addWidget(self.install_progress)
        box_layout.addWidget(self.install_stage_list)
        box_layout.addWidget(self.install_start_button)
        box_layout.addWidget(self.install_log_output)
        layout.addWidget(box)

        return page

    def build_complete_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)

        box = QGroupBox("安装完成")
        box_layout = QVBoxLayout(box)

        self.complete_headline = QLabel("安装尚未完成")
        self.complete_status_output = QTextEdit()
        self.complete_status_output.setReadOnly(True)

        actions = QHBoxLayout()
        register_btn = QPushButton("Register to EOW")
        register_btn.clicked.connect(self.register_to_world)
        open_world_btn = QPushButton("Open EOW Settings")
        open_world_btn.clicked.connect(lambda: webbrowser.open(f"{self.state.base_url}/#settings"))
        open_folder_btn = QPushButton("打开安装目录")
        open_folder_btn.clicked.connect(self.open_install_folder)
        actions.addWidget(register_btn)
        actions.addWidget(open_world_btn)
        actions.addWidget(open_folder_btn)

        box_layout.addWidget(self.complete_headline)
        box_layout.addWidget(self.complete_status_output)
        box_layout.addLayout(actions)

        layout.addWidget(box)
        return page

    def closeEvent(self, event):
        try:
            self.auth_poll_timer.stop()
            self.payment_poll_timer.stop()
            self.stop_loopback_server()
        finally:
            super().closeEvent(event)


def main():
    app = QApplication([])
    app.setApplicationName("ELO Agent Onboarder Installer")
    window = EOWInstaller()
    window.show()
    app.exec()


if __name__ == "__main__":
    main()
