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
from http.server import BaseHTTPRequestHandler, HTTPServer
from dataclasses import dataclass, field
from typing import Dict, Optional

import requests
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QIcon
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QComboBox,
    QFrame,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPushButton,
    QStackedWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


MODEL_DOCS = {
    "OpenAI": ("https://platform.openai.com", "General-purpose reasoning, coding, and multimodal workflows."),
    "Anthropic": ("https://console.anthropic.com", "Strong long-context analysis and writing quality."),
    "Google": ("https://aistudio.google.com", "Gemini ecosystem for multimodal generation."),
    "DeepSeek": ("https://platform.deepseek.com", "Cost-effective coding and reasoning model options."),
}


PACKAGE_SKILLS = {
    "starter-openclaw": [
        "OpenClaw runtime baseline",
        "Model provider setup guidance",
    ],
    "work-openclaw": [
        "PPT authoring skills",
        "Excel/data analysis skills",
        "Document generation skills",
        "Image processing model setup",
    ],
    "vision-openclaw": [
        "Video creation workflow",
        "Cross-platform publishing workflow",
        "Video model API setup guidance",
    ],
    "builder-openclaw": [
        "EOW project protocol framework",
        "Delivery/checkpoint workflow baseline",
        "Collaboration-oriented coding setup",
    ],
}


@dataclass
class InstallerState:
    base_url: str = "https://world.metavie.co"
    human_id: str = ""
    installer_auth_session_id: str = ""
    installer_auth_status: str = "pending"
    installer_auth_url: str = ""
    installer_auth_expires_at: int = 0
    oauth_client_id: str = "eow-installer-desktop"
    oauth_scope: str = "openid profile onboarder.install"
    oauth_redirect_uri: str = "http://127.0.0.1:53682/callback"
    oauth_access_token: str = ""
    oauth_refresh_token: str = ""
    oauth_authorize_state: str = ""
    oauth_code_verifier: str = ""
    oauth_auth_code: str = ""
    installer_session_id: str = ""
    package_id: str = "starter-openclaw"
    profile: str = "macos-homebrew"
    registration_mode: str = "register-to-eow"
    workflow_preset: str = ""
    agent_name: str = ""
    agent_personality: str = ""
    model_provider: str = "OpenAI"
    model_name: str = ""
    model_api_key: str = ""
    chat_platform: str = "telegram"
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    lark_app_id: str = ""
    lark_app_secret: str = ""
    lark_tenant_key: str = ""
    purchase_id: str = ""
    checkout_session_id: str = ""
    entitlement_id: str = ""
    payment_status: str = "pending"
    install_log: str = ""
    execution_plan: Dict = field(default_factory=dict)


class EOWInstaller(QWidget):
    def __init__(self):
        super().__init__()
        self.state = InstallerState()
        self.setWindowTitle("ELO Agent Onboarder Installer")
        icon_path = self.asset_path("icon.png")
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        self.resize(980, 680)
        self.stack = QStackedWidget()
        self.page_titles = []
        self.pages = []
        self.current_index = 0

        self.prev_button = QPushButton("Previous")
        self.next_button = QPushButton("Next")
        self.prev_button.clicked.connect(self.go_prev)
        self.next_button.clicked.connect(self.go_next)

        root = QVBoxLayout(self)
        root.addWidget(self.stack)

        actions = QHBoxLayout()
        actions.addWidget(self.prev_button)
        actions.addStretch(1)
        actions.addWidget(self.next_button)
        root.addLayout(actions)

        self.build_pages()
        self.auth_poll_timer = QTimer(self)
        self.auth_poll_timer.setInterval(2500)
        self.auth_poll_timer.timeout.connect(self.check_auth_status)
        self.oauth_callback_server = None
        self.oauth_callback_thread = None
        self.oauth_callback_error = ""
        self.oauth_callback_received_at = 0.0
        self.refresh_nav()

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
        if title == "Skill Preview":
            self.render_skill_preview()
        if title == "Payment":
            self.render_payment_status()
        if title == "Complete":
            self.render_complete_status()

    def validate_current_page(self) -> bool:
        title = self.page_titles[self.current_index]
        if title == "Login":
            self.state.base_url = self.base_url_input.text().strip().rstrip("/")
            if self.state.installer_auth_status != "authorized" or not self.state.human_id:
                self.error("Please complete EOW authorization first.")
                return False
            return self.start_installer_session()
        if title == "Agent":
            if not self.agent_name_input.text().strip():
                self.error("Please input Agent Name.")
                return False
            self.state.agent_name = self.agent_name_input.text().strip()
            self.state.agent_personality = self.agent_personality_input.toPlainText().strip()
            return self.update_installer_session()
        if title == "Model":
            self.state.model_provider = self.model_provider_combo.currentText()
            self.state.model_name = self.model_name_input.text().strip()
            self.state.model_api_key = self.model_api_key_input.text().strip()
            if not self.state.model_name or not self.state.model_api_key:
                self.error("Please input model name and API key.")
                return False
            return self.update_installer_session()
        if title == "Chat Binding":
            self.state.chat_platform = self.chat_platform_combo.currentText().lower()
            self.state.telegram_bot_token = self.telegram_bot_token_input.text().strip()
            self.state.telegram_chat_id = self.telegram_chat_id_input.text().strip()
            self.state.lark_app_id = self.lark_app_id_input.text().strip()
            self.state.lark_app_secret = self.lark_app_secret_input.text().strip()
            self.state.lark_tenant_key = self.lark_tenant_key_input.text().strip()
            return self.update_installer_session()
        if title == "Payment":
            if self.state.payment_status != "paid":
                self.error("Payment is required before installation.")
                return False
        return True

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
                    "client_id": self.state.oauth_client_id
                },
                require_auth=False,
                content_type="application/x-www-form-urlencoded",
                retry_on_auth_error=False
            )
            self.state.oauth_access_token = token.get("access_token", "")
            self.state.oauth_refresh_token = token.get("refresh_token", self.state.oauth_refresh_token)
            return bool(self.state.oauth_access_token)
        except Exception:
            return False

    def request(
        self,
        path: str,
        method: str = "POST",
        payload: Optional[Dict] = None,
        require_auth: bool = True,
        content_type: str = "application/json",
        retry_on_auth_error: bool = True
    ):
        if require_auth and not (self.state.human_id or self.state.oauth_access_token):
            raise RuntimeError("human identity is not authorized")
        headers = {}
        if content_type:
            headers["Content-Type"] = content_type
        if self.state.oauth_access_token:
            headers["Authorization"] = f"Bearer {self.state.oauth_access_token}"
        elif self.state.human_id:
            headers["X-ELO-Session-Human-Id"] = self.state.human_id
        url = f"{self.state.base_url}{path}"
        request_kwargs = {"headers": headers, "timeout": 60}
        if content_type == "application/x-www-form-urlencoded":
            request_kwargs["data"] = payload or {}
        else:
            request_kwargs["json"] = payload or {}
        response = requests.request(method, url, **request_kwargs)
        if response.status_code >= 400:
            try:
                message = response.json().get("error", response.text)
            except Exception:
                message = response.text
            auth_error = str(message or "").lower()
            if (
                retry_on_auth_error
                and require_auth
                and self.state.oauth_access_token
                and ("access token expired" in auth_error or "invalid access token" in auth_error)
                and self.refresh_oauth_access_token()
            ):
                return self.request(
                    path,
                    method=method,
                    payload=payload,
                    require_auth=require_auth,
                    content_type=content_type,
                    retry_on_auth_error=False
                )
            raise RuntimeError(f"{response.status_code}: {message}")
        if "application/json" in response.headers.get("Content-Type", ""):
            return response.json()
        return response.content

    def pkce_challenge(self, verifier: str) -> str:
        digest = hashlib.sha256(verifier.encode("utf-8")).digest()
        return base64.urlsafe_b64encode(digest).decode("utf-8").rstrip("=")

    def start_oauth_flow(self):
        self.state.base_url = self.base_url_input.text().strip().rstrip("/")
        self.state.oauth_client_id = self.oauth_client_id_input.text().strip() or "eow-installer-desktop"
        self.state.oauth_scope = self.oauth_scope_input.text().strip() or "openid profile onboarder.install"
        self.state.oauth_redirect_uri = self.oauth_redirect_input.text().strip() or "http://127.0.0.1:53682/callback"
        self.state.oauth_authorize_state = secrets.token_urlsafe(24)
        self.state.oauth_code_verifier = secrets.token_urlsafe(64)
        self.state.oauth_auth_code = ""
        self.oauth_callback_error = ""
        self.oauth_callback_received_at = 0.0
        self.state.oauth_access_token = ""
        self.state.oauth_refresh_token = ""
        self.state.human_id = ""
        self.state.installer_auth_status = "pending"

        parsed = urllib.parse.urlparse(self.state.oauth_redirect_uri)
        if parsed.scheme in ("http", "https"):
            if not parsed.hostname or not parsed.port:
                self.render_auth_status("OAuth start failed: loopback redirect_uri must include host and port.")
                return
            self.start_loopback_callback_server(parsed.hostname, parsed.port, parsed.path or "/callback")

        try:
            authorize_url = (
                f"{self.state.base_url}/oauth/authorize?"
                f"response_type=code&client_id={urllib.parse.quote(self.state.oauth_client_id)}"
                f"&redirect_uri={urllib.parse.quote(self.state.oauth_redirect_uri, safe='')}"
                f"&scope={urllib.parse.quote(self.state.oauth_scope)}"
                f"&state={urllib.parse.quote(self.state.oauth_authorize_state)}"
                f"&code_challenge={urllib.parse.quote(self.pkce_challenge(self.state.oauth_code_verifier))}"
                f"&code_challenge_method=S256"
            )
            webbrowser.open(authorize_url)
            self.auth_poll_timer.start()
            self.render_auth_status("OAuth browser flow started. Complete login and authorization in browser.")
        except Exception as exc:
            self.render_auth_status(f"OAuth start failed: {exc}")

    def start_loopback_callback_server(self, host: str, port: int, callback_path: str):
        installer = self

        class OAuthCallbackHandler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed_url = urllib.parse.urlparse(self.path)
                if parsed_url.path != callback_path:
                    self.send_response(404)
                    self.end_headers()
                    return
                params = urllib.parse.parse_qs(parsed_url.query)
                installer.state.oauth_auth_code = params.get("code", [""])[0]
                returned_state = params.get("state", [""])[0]
                if returned_state != installer.state.oauth_authorize_state:
                    installer.oauth_callback_error = "OAuth state mismatch. Retry login."
                installer.oauth_callback_received_at = time.time()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(
                    b"<html><body><h3>EOW authorization received.</h3>"
                    b"<p>You can return to the installer.</p></body></html>"
                )

            def log_message(self, format, *args):
                return

        try:
            self.oauth_callback_server = HTTPServer((host, port), OAuthCallbackHandler)
            self.oauth_callback_thread = threading.Thread(target=self.oauth_callback_server.handle_request, daemon=True)
            self.oauth_callback_thread.start()
        except Exception as exc:
            self.oauth_callback_server = None
            self.oauth_callback_thread = None
            self.oauth_callback_error = f"Loopback callback listener failed: {exc}"

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
                "code_verifier": self.state.oauth_code_verifier
            },
            require_auth=False,
            content_type="application/x-www-form-urlencoded"
        )
        self.state.oauth_access_token = token.get("access_token", "")
        self.state.oauth_refresh_token = token.get("refresh_token", "")
        if not self.state.oauth_access_token:
            return False
        me = self.request("/api/auth/me", method="GET", require_auth=True)
        self.state.human_id = me.get("human", {}).get("humanId", "")
        self.state.installer_auth_status = "authorized" if self.state.human_id else "pending"
        return bool(self.state.human_id)

    def start_auth_flow(self):
        self.start_oauth_flow()

    def check_auth_status(self):
        if self.oauth_callback_error:
            self.auth_poll_timer.stop()
            self.state.installer_auth_status = "failed"
            self.render_auth_status(self.oauth_callback_error)
            return
        if self.state.oauth_auth_code:
            try:
                if self.exchange_oauth_token():
                    self.auth_poll_timer.stop()
                    self.render_auth_status(f"OAuth authorized as {self.state.human_id}")
                    return
            except Exception as exc:
                self.auth_poll_timer.stop()
                self.state.installer_auth_status = "failed"
                self.render_auth_status(f"OAuth token exchange failed: {exc}")
                return
        self.render_auth_status("Waiting for OAuth browser callback...")

    def render_auth_status(self, note: str = ""):
        status_line = f"Status: {self.state.installer_auth_status}"
        human_line = f"Authorized Human: {self.state.human_id or '-'}"
        token_line = f"Access Token: {'ready' if self.state.oauth_access_token else '-'}"
        session_line = f"Auth Session: {self.state.installer_auth_session_id or '-'}"
        note_line = f"Note: {note or 'Use OAuth login in browser, then return here.'}"
        self.auth_status_box.setPlainText("\n".join([status_line, human_line, token_line, session_line, note_line]))

    def start_installer_session(self) -> bool:
        self.state.package_id = self.package_combo.currentData()
        self.state.profile = self.profile_combo.currentData()
        self.state.registration_mode = "register-to-eow" if self.registration_checkbox.isChecked() else "local-only"
        try:
            result = self.request("/api/onboarder/installer/session/start", payload={
                "packageId": self.state.package_id,
                "profile": self.state.profile,
                "registrationMode": self.state.registration_mode,
                "workflowPreset": "",
            })
            self.state.installer_session_id = result["installerSessionId"]
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def update_installer_session(self) -> bool:
        try:
            self.request("/api/onboarder/installer/session/update", payload={
                "installerSessionId": self.state.installer_session_id,
                "agentName": self.state.agent_name,
                "agentPersonality": self.state.agent_personality,
                "modelProvider": self.state.model_provider,
                "modelName": self.state.model_name,
                "modelApiKey": self.state.model_api_key,
                "chatBinding": {
                    "platform": self.state.chat_platform,
                    "telegramBotToken": self.state.telegram_bot_token,
                    "telegramChatId": self.state.telegram_chat_id,
                    "larkAppId": self.state.lark_app_id,
                    "larkAppSecret": self.state.lark_app_secret,
                    "larkTenantKey": self.state.lark_tenant_key,
                },
            })
            return True
        except Exception as exc:
            self.error(str(exc))
            return False

    def check_payment_status(self):
        result = self.request("/api/onboarder/installer/payment/status", payload={
            "installerSessionId": self.state.installer_session_id
        })
        self.state.payment_status = result.get("paymentStatus", "pending")
        self.state.purchase_id = result.get("purchaseId", "")
        self.state.checkout_session_id = result.get("checkoutSessionId", "")
        self.state.entitlement_id = result.get("entitlementId", "")
        self.render_payment_status()

    def create_checkout(self):
        result = self.request("/api/onboarder/installer/payment/checkout-session", payload={
            "installerSessionId": self.state.installer_session_id
        })
        self.state.purchase_id = result.get("purchaseId", "")
        self.state.checkout_session_id = result.get("checkoutSessionId", "")
        checkout_url = result.get("checkoutUrl", "")
        if checkout_url:
            webbrowser.open(checkout_url)
        self.payment_status_label.setText("Payment opened in browser. Complete payment and click 'I Paid, Recheck'.")

    def confirm_payment(self):
        try:
            result = self.request("/api/onboarder/installer/payment/confirm", payload={
                "installerSessionId": self.state.installer_session_id,
                "checkoutSessionId": self.state.checkout_session_id,
            })
            self.state.payment_status = result.get("paymentStatus", "pending")
            self.state.entitlement_id = result.get("entitlementId", "")
            self.render_payment_status()
        except Exception as exc:
            self.payment_status_label.setText(str(exc))

    def render_payment_status(self):
        lines = [
            f"Installer Session: {self.state.installer_session_id or '-'}",
            f"Purchase: {self.state.purchase_id or '-'}",
            f"Payment Status: {self.state.payment_status}",
            f"Entitlement: {self.state.entitlement_id or '-'}",
        ]
        self.payment_status_label.setText("\n".join(lines))

    def run_install(self):
        try:
            plan_payload = self.request("/api/onboarder/installer/plan", payload={
                "installerSessionId": self.state.installer_session_id,
                "worldUrl": self.state.base_url,
            })
            self.state.execution_plan = plan_payload.get("plan", {})
            script_payload = self.request("/api/onboarder/installer/script", payload={
                "installerSessionId": self.state.installer_session_id,
                "worldUrl": self.state.base_url,
            })
            script = script_payload.get("script", "")
            if not script:
                raise RuntimeError("installer script is empty")

            with tempfile.TemporaryDirectory(prefix="eow-installer-") as td:
                script_path = os.path.join(td, "install.sh")
                with open(script_path, "w", encoding="utf-8") as fp:
                    fp.write(script)
                os.chmod(script_path, 0o700)

                if platform.system().lower().startswith("win"):
                    cmd = ["bash", script_path]
                else:
                    cmd = [script_path]
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
                self.state.install_log = f"exit={proc.returncode}\n\nSTDOUT:\n{proc.stdout}\n\nSTDERR:\n{proc.stderr}"
                self.install_log_output.setPlainText(self.state.install_log)
                if proc.returncode != 0:
                    raise RuntimeError("install script failed, see logs")

            self.request("/api/onboarder/installer/complete", payload={
                "installerSessionId": self.state.installer_session_id,
                "installReport": {
                    "ok": True,
                    "platform": platform.platform(),
                },
            })
            self.install_status_label.setText("Installation completed successfully.")
        except Exception as exc:
            self.install_status_label.setText(f"Install failed: {exc}")

    def register_to_world(self):
        try:
            result = self.request("/api/onboarder/installer/register", payload={
                "installerSessionId": self.state.installer_session_id
            })
            self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))
        except Exception as exc:
            self.error(str(exc))

    def render_skill_preview(self):
        package = self.package_combo.currentData()
        skill_lines = PACKAGE_SKILLS.get(package, [])
        self.skill_output.setPlainText("\n".join(f"- {line}" for line in skill_lines))

    def render_complete_status(self):
        result = {
            "installerSessionId": self.state.installer_session_id,
            "paymentStatus": self.state.payment_status,
            "entitlementId": self.state.entitlement_id,
            "installPlanReady": bool(self.state.execution_plan),
        }
        self.complete_status_output.setPlainText(json.dumps(result, indent=2, ensure_ascii=False))

    def error(self, message: str):
        QMessageBox.critical(self, "Error", message)

    def info(self, message: str):
        QMessageBox.information(self, "Info", message)

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
        hero = QFrame()
        hero.setFrameShape(QFrame.StyledPanel)
        hero_layout = QVBoxLayout(hero)
        hero_layout.addWidget(QLabel("ELO Agent Onboarder"))
        hero_layout.addWidget(QLabel("Authorize with EOW OAuth2 PKCE to continue. No manual Session ID is required."))
        layout.addWidget(hero)
        form = QFormLayout()
        self.base_url_input = QLineEdit(self.state.base_url)
        self.oauth_client_id_input = QLineEdit(self.state.oauth_client_id)
        self.oauth_scope_input = QLineEdit(self.state.oauth_scope)
        self.oauth_redirect_input = QLineEdit(self.state.oauth_redirect_uri)
        form.addRow("EOW Base URL", self.base_url_input)
        form.addRow("OAuth Client ID", self.oauth_client_id_input)
        form.addRow("OAuth Scope", self.oauth_scope_input)
        form.addRow("OAuth Redirect URI", self.oauth_redirect_input)
        layout.addLayout(form)
        btns = QHBoxLayout()
        login_btn = QPushButton("Login to EOW")
        reg_btn = QPushButton("Go to Register")
        check_btn = QPushButton("Check Authorization")
        login_btn.clicked.connect(self.start_auth_flow)
        reg_btn.clicked.connect(lambda: webbrowser.open(f"{self.base_url_input.text().strip().rstrip('/')}/human-auth"))
        check_btn.clicked.connect(self.check_auth_status)
        btns.addWidget(login_btn)
        btns.addWidget(reg_btn)
        btns.addWidget(check_btn)
        layout.addLayout(btns)
        self.auth_status_box = QTextEdit()
        self.auth_status_box.setReadOnly(True)
        self.auth_status_box.setMinimumHeight(120)
        layout.addWidget(self.auth_status_box)
        self.render_auth_status("Click 'Login to EOW (OAuth)' to start authorization.")
        return page

    def build_env_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("Environment detection"))
        self.env_output = QTextEdit()
        self.env_output.setReadOnly(True)
        detect_btn = QPushButton("Detect Environment")
        detect_btn.clicked.connect(self.detect_environment)
        layout.addWidget(detect_btn)
        layout.addWidget(self.env_output)
        return page

    def detect_environment(self):
        checks = {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "cwd": os.getcwd(),
            "network": "ok",
        }
        self.env_output.setPlainText(json.dumps(checks, indent=2, ensure_ascii=False))

    def build_package_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.package_combo = QComboBox()
        self.package_combo.addItem("Starter OpenClaw ($8)", "starter-openclaw")
        self.package_combo.addItem("Work OpenClaw ($16)", "work-openclaw")
        self.package_combo.addItem("Vision OpenClaw ($29)", "vision-openclaw")
        self.package_combo.addItem("Builder OpenClaw ($79)", "builder-openclaw")
        self.profile_combo = QComboBox()
        self.profile_combo.addItem("macOS Homebrew", "macos-homebrew")
        self.profile_combo.addItem("Linux systemd", "linux-systemd")
        self.profile_combo.addItem("Server Docker Compose", "server-docker-compose")
        self.registration_checkbox = QCheckBox("Register to EOW after install")
        self.registration_checkbox.setChecked(True)
        layout.addRow("Package", self.package_combo)
        layout.addRow("Environment", self.profile_combo)
        layout.addRow("", self.registration_checkbox)
        return page

    def build_agent_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.agent_name_input = QLineEdit()
        self.agent_personality_input = QTextEdit()
        self.agent_personality_input.setPlaceholderText("Describe your agent personality. This will be written to SOUL.md")
        layout.addRow("Agent Name", self.agent_name_input)
        layout.addRow("Agent Personality", self.agent_personality_input)
        return page

    def build_model_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        form = QFormLayout()
        self.model_provider_combo = QComboBox()
        self.model_provider_combo.addItems(list(MODEL_DOCS.keys()))
        self.model_name_input = QLineEdit()
        self.model_api_key_input = QLineEdit()
        self.model_api_key_input.setEchoMode(QLineEdit.Password)
        form.addRow("Model Provider", self.model_provider_combo)
        form.addRow("Model Name", self.model_name_input)
        form.addRow("API Key", self.model_api_key_input)
        layout.addLayout(form)
        self.model_desc = QTextEdit()
        self.model_desc.setReadOnly(True)
        layout.addWidget(self.model_desc)
        model_btn = QPushButton("Open Provider Website")
        model_btn.clicked.connect(self.open_model_site)
        layout.addWidget(model_btn)
        self.model_provider_combo.currentTextChanged.connect(self.update_model_desc)
        self.update_model_desc(self.model_provider_combo.currentText())
        return page

    def update_model_desc(self, provider: str):
        url, desc = MODEL_DOCS.get(provider, ("", ""))
        self.model_desc.setPlainText(f"Provider: {provider}\nWebsite: {url}\n\n{desc}")

    def open_model_site(self):
        provider = self.model_provider_combo.currentText()
        url = MODEL_DOCS.get(provider, ("", ""))[0]
        if url:
            webbrowser.open(url)

    def build_chat_page(self):
        page = QWidget()
        layout = QFormLayout(page)
        self.chat_platform_combo = QComboBox()
        self.chat_platform_combo.addItems(["Telegram", "Feishu"])
        self.telegram_bot_token_input = QLineEdit()
        self.telegram_chat_id_input = QLineEdit()
        self.lark_app_id_input = QLineEdit()
        self.lark_app_secret_input = QLineEdit()
        self.lark_tenant_key_input = QLineEdit()
        self.lark_app_secret_input.setEchoMode(QLineEdit.Password)
        layout.addRow("Platform", self.chat_platform_combo)
        layout.addRow("Telegram Bot Token", self.telegram_bot_token_input)
        layout.addRow("Telegram Chat ID", self.telegram_chat_id_input)
        layout.addRow("Feishu App ID", self.lark_app_id_input)
        layout.addRow("Feishu App Secret", self.lark_app_secret_input)
        layout.addRow("Feishu Tenant Key", self.lark_tenant_key_input)
        return page

    def build_skill_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.addWidget(QLabel("Skill package preview"))
        self.skill_output = QTextEdit()
        self.skill_output.setReadOnly(True)
        layout.addWidget(self.skill_output)
        return page

    def build_payment_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.payment_status_label = QTextEdit()
        self.payment_status_label.setReadOnly(True)
        self.payment_status_label.setMinimumHeight(140)
        btn_checkout = QPushButton("Open Stripe Checkout")
        btn_recheck = QPushButton("I Paid, Recheck")
        btn_confirm = QPushButton("Confirm Checkout")
        btn_checkout.clicked.connect(self.create_checkout)
        btn_recheck.clicked.connect(self.check_payment_status)
        btn_confirm.clicked.connect(self.confirm_payment)
        layout.addWidget(self.payment_status_label)
        layout.addWidget(btn_checkout)
        layout.addWidget(btn_recheck)
        layout.addWidget(btn_confirm)
        return page

    def build_install_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.install_status_label = QLabel("Ready to install.")
        self.install_log_output = QTextEdit()
        self.install_log_output.setReadOnly(True)
        install_btn = QPushButton("Start Installation")
        install_btn.clicked.connect(self.run_install)
        layout.addWidget(self.install_status_label)
        layout.addWidget(install_btn)
        layout.addWidget(self.install_log_output)
        return page

    def build_complete_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        self.complete_status_output = QTextEdit()
        self.complete_status_output.setReadOnly(True)
        register_btn = QPushButton("Register to EOW")
        register_btn.clicked.connect(self.register_to_world)
        open_world_btn = QPushButton("Open EOW Settings")
        open_world_btn.clicked.connect(lambda: webbrowser.open(f"{self.state.base_url}/#settings"))
        layout.addWidget(self.complete_status_output)
        layout.addWidget(register_btn)
        layout.addWidget(open_world_btn)
        return page


def main():
    app = QApplication([])
    app.setApplicationName("ELO Agent Onboarder Installer")
    window = EOWInstaller()
    window.show()
    app.exec()


if __name__ == "__main__":
    main()
